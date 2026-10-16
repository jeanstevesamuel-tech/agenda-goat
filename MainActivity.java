package com.agendaetoile.app;

import android.Manifest;
import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ContentResolver;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.media.AudioAttributes;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.provider.Settings;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.InputStream;
import java.io.OutputStream;
import java.security.MessageDigest;

public class MainActivity extends android.app.Activity {
    private static final int PICK_SOUND = 4201;
    private static final int REQUEST_NOTIFICATIONS = 4202;
    private static final String PREFS = "agenda_native";
    private static final String SOUND_URI = "sound_uri";
    private static final String SOUND_NAME = "sound_name";
    private static final String NOTIF_REQUESTED = "notification_requested";
    private WebView webView;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        webView = new WebView(this);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setAllowFileAccess(true);
        ws.setAllowContentAccess(true);
        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.addJavascriptInterface(new NativeBridge(this), "AndroidAgenda");
        setContentView(webView);
        loadFromIntent(getIntent());
        createDefaultChannel();
    }

    private void loadFromIntent(Intent intent) {
        String task = intent == null ? null : intent.getStringExtra("task");
        if (task != null && !task.isEmpty()) webView.loadUrl("file:///android_asset/www/index.html?task=" + Uri.encode(task));
        else webView.loadUrl("file:///android_asset/www/index.html");
    }

    @Override protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        loadFromIntent(intent);
    }

    private void createDefaultChannel() {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (nm.getNotificationChannel("agenda_default") == null) {
            NotificationChannel ch = new NotificationChannel("agenda_default", "Rappels Agenda Étoile", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Rappels des devoirs et leçons");
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }
    }

    private String notificationPermissionState() {
        if (Build.VERSION.SDK_INT < 33) return "granted";
        NotificationManager nm = getSystemService(NotificationManager.class);
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED && (nm == null || nm.areNotificationsEnabled())) return "granted";
        boolean requested = getSharedPreferences(PREFS, MODE_PRIVATE).getBoolean(NOTIF_REQUESTED, false);
        return requested ? "denied" : "default";
    }

    private void requestNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) { callJs("window.__agendaNativePermissionChanged && window.__agendaNativePermissionChanged('granted')"); return; }
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) { callJs("window.__agendaNativePermissionChanged && window.__agendaNativePermissionChanged('granted')"); return; }
        getSharedPreferences(PREFS, MODE_PRIVATE).edit().putBoolean(NOTIF_REQUESTED, true).apply();
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQUEST_NOTIFICATIONS);
    }

    private void openNotificationSettings() {
        Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, getPackageName());
        try { startActivity(i); } catch (Exception ignored) { }
    }

    private void openExactAlarmSettings() {
        if (Build.VERSION.SDK_INT < 31) return;
        Intent i = new Intent(Settings.ACTION_REQUEST_SCHEDULE_EXACT_ALARM).setData(Uri.parse("package:" + getPackageName()));
        try { startActivity(i); } catch (Exception ignored) { }
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == REQUEST_NOTIFICATIONS) {
            String p = notificationPermissionState();
            callJs("window.__agendaNativePermissionChanged && window.__agendaNativePermissionChanged(" + JSONObject.quote(p) + ")");
        }
    }

    private void pickSound() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        i.addCategory(Intent.CATEGORY_OPENABLE);
        i.setType("audio/*");
        startActivityForResult(i, PICK_SOUND);
    }

    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != PICK_SOUND) return;
        if (resultCode != RESULT_OK || data == null || data.getData() == null) {
            callJs("window.__agendaNativeSoundSelected && window.__agendaNativeSoundSelected(null)");
            return;
        }
        try {
            Uri source = data.getData();
            int flags = data.getFlags() & (Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_WRITE_URI_PERMISSION);
            try { getContentResolver().takePersistableUriPermission(source, flags & Intent.FLAG_GRANT_READ_URI_PERMISSION); } catch (Exception ignored) {}
            String name = "Son personnalisé";
            android.database.Cursor c = getContentResolver().query(source, new String[]{MediaStore.MediaColumns.DISPLAY_NAME}, null, null, null);
            if (c != null) { try { if (c.moveToFirst()) name = c.getString(0); } finally { c.close(); } }
            Uri stored = copyToMediaStore(source, name);
            if (stored == null) throw new IllegalStateException("copy-failed");
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            String old = p.getString(SOUND_URI, null);
            p.edit().putString(SOUND_URI, stored.toString()).putString(SOUND_NAME, name).apply();
            if (old != null) { try { getContentResolver().delete(Uri.parse(old), null, null); } catch (Exception ignored) {} }
            rebuildSoundChannel(stored);
            callJs("window.__agendaNativeSoundSelected && window.__agendaNativeSoundSelected(" + JSONObject.quote(name) + ")");
        } catch (Exception e) {
            callJs("window.__agendaNativeSoundSelected && window.__agendaNativeSoundSelected(null)");
        }
    }

    private Uri copyToMediaStore(Uri source, String name) throws Exception {
        ContentResolver cr = getContentResolver();
        ContentValues v = new ContentValues();
        v.put(MediaStore.Audio.Media.DISPLAY_NAME, "AgendaEtoile_" + System.currentTimeMillis() + "_" + name.replaceAll("[^A-Za-z0-9._-]", "_") );
        v.put(MediaStore.Audio.Media.MIME_TYPE, cr.getType(source) != null ? cr.getType(source) : "audio/mpeg");
        if (Build.VERSION.SDK_INT >= 29) {
            v.put(MediaStore.Audio.Media.RELATIVE_PATH, "Music/Agenda Étoile");
            v.put(MediaStore.Audio.Media.IS_PENDING, 1);
        }
        Uri out = cr.insert(MediaStore.Audio.Media.EXTERNAL_CONTENT_URI, v);
        if (out == null) return null;
        try (InputStream in = cr.openInputStream(source); OutputStream os = cr.openOutputStream(out)) {
            if (in == null || os == null) throw new IllegalStateException("stream-failed");
            byte[] buf = new byte[32768]; int n;
            while ((n = in.read(buf)) != -1) os.write(buf, 0, n);
        } catch (Exception e) { try { cr.delete(out, null, null); } catch (Exception ignored) {} throw e; }
        if (Build.VERSION.SDK_INT >= 29) { ContentValues done = new ContentValues(); done.put(MediaStore.Audio.Media.IS_PENDING, 0); cr.update(out, done, null, null); }
        return out;
    }

    private String channelFor(Uri sound) {
        try { MessageDigest md = MessageDigest.getInstance("SHA-256"); byte[] b = md.digest(sound.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8)); StringBuilder s = new StringBuilder(); for (int i=0;i<6;i++) s.append(String.format("%02x", b[i])); return "agenda_sound_" + s; }
        catch (Exception e) { return "agenda_sound_custom"; }
    }

    private void rebuildSoundChannel(Uri sound) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager nm = getSystemService(NotificationManager.class);
        String id = channelFor(sound);
        for (NotificationChannel c : nm.getNotificationChannels()) if (c.getId().startsWith("agenda_sound_") && !c.getId().equals(id)) nm.deleteNotificationChannel(c.getId());
        if (nm.getNotificationChannel(id) == null) {
            NotificationChannel ch = new NotificationChannel(id, "Rappels avec son personnalisé", NotificationManager.IMPORTANCE_HIGH);
            ch.setDescription("Son choisi dans Agenda Étoile");
            ch.setSound(sound, new AudioAttributes.Builder().setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            ch.enableVibration(true);
            nm.createNotificationChannel(ch);
        }
    }

    private String currentChannel() {
        String u = getSharedPreferences(PREFS, MODE_PRIVATE).getString(SOUND_URI, null);
        if (u == null) return "agenda_default";
        Uri uri = Uri.parse(u);
        rebuildSoundChannel(uri);
        return channelFor(uri);
    }

    private void callJs(String js) { runOnUiThread(() -> { if (webView != null) webView.evaluateJavascript(js, null); }); }

    public class NativeBridge {
        private final Context ctx;
        NativeBridge(Context c) { ctx = c; }

        @JavascriptInterface public String notificationPermissionState() { return notificationPermissionState(); }
        @JavascriptInterface public void requestNotifications() { runOnUiThread(() -> requestNotificationPermission()); }
        @JavascriptInterface public void pickNotificationSound() { runOnUiThread(() -> pickSound()); }
        @JavascriptInterface public String getNotificationSoundName() { return getSharedPreferences(PREFS, MODE_PRIVATE).getString(SOUND_NAME, ""); }
        @JavascriptInterface public void removeNotificationSound() {
            SharedPreferences p = getSharedPreferences(PREFS, MODE_PRIVATE);
            String old = p.getString(SOUND_URI, null);
            p.edit().remove(SOUND_URI).remove(SOUND_NAME).apply();
            if (old != null) try { getContentResolver().delete(Uri.parse(old), null, null); } catch (Exception ignored) {}
        }
        @JavascriptInterface public void previewNotificationSound() {
            final String u = getSharedPreferences(PREFS, MODE_PRIVATE).getString(SOUND_URI, null);
            if (u == null) { callJs("window.__agendaNativePreviewDone && window.__agendaNativePreviewDone(false)"); return; }
            runOnUiThread(() -> {
                try {
                    android.media.MediaPlayer mp = android.media.MediaPlayer.create(MainActivity.this, Uri.parse(u));
                    if (mp == null) throw new IllegalStateException("preview-failed");
                    mp.setOnCompletionListener(android.media.MediaPlayer::release);
                    mp.start();
                    callJs("window.__agendaNativePreviewDone && window.__agendaNativePreviewDone(true)");
                } catch (Exception e) { callJs("window.__agendaNativePreviewDone && window.__agendaNativePreviewDone(false)"); }
            });
        }
        @JavascriptInterface public boolean showNotification(String title, String body, String taskId, String tag) {
            if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return false;
            ReminderReceiver.postNow(ctx, title, body, taskId, tag, currentChannel());
            return true;
        }
        @JavascriptInterface public void scheduleReminder(String id, long at, String title, String body, String taskId, String tag) {
            ReminderReceiver.schedule(ctx, id, at, title, body, taskId, tag, currentChannel());
        }
        @JavascriptInterface public void cancelReminder(String id) { ReminderReceiver.cancel(ctx, id); }
        @JavascriptInterface public void openNotificationSettings() { runOnUiThread(() -> openNotificationSettings()); }
        @JavascriptInterface public void openExactAlarmSettings() { runOnUiThread(() -> openExactAlarmSettings()); }
        @JavascriptInterface public boolean exactAlarmAllowed() { return Build.VERSION.SDK_INT < 31 || ((AlarmManager)getSystemService(ALARM_SERVICE)) != null && ((AlarmManager)getSystemService(ALARM_SERVICE)).canScheduleExactAlarms(); }
    }
}

package com.agendaetoile.app;

import android.app.AlarmManager;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

public class ReminderReceiver extends BroadcastReceiver {
    static final String ACTION = "com.agendaetoile.app.REMINDER";
    static final String P_ID="id", P_AT="at", P_TITLE="title", P_BODY="body", P_TASK="task", P_TAG="tag", P_CHANNEL="channel";
    private static final String PREFS = "agenda_native";
    private static final String ALARMS = "scheduled_reminders";

    static synchronized void schedule(Context c, String id, long at, String title, String body, String taskId, String tag, String channel) {
        cancelAlarmOnly(c, id);
        if (at <= System.currentTimeMillis()) { removeStored(c, id); return; }
        Intent i = new Intent(c, ReminderReceiver.class).setAction(ACTION)
                .putExtra(P_ID,id).putExtra(P_AT,at).putExtra(P_TITLE,title).putExtra(P_BODY,body)
                .putExtra(P_TASK,taskId).putExtra(P_TAG,tag).putExtra(P_CHANNEL,channel);
        PendingIntent pi = PendingIntent.getBroadcast(c, requestCode(id), i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        AlarmManager am = (AlarmManager)c.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        try {
            if (Build.VERSION.SDK_INT >= 31 && am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi);
            else am.set(AlarmManager.RTC_WAKEUP, at, pi);
            store(c, id, at, title, body, taskId, tag, channel);
        } catch (SecurityException e) {
            try {
                if (Build.VERSION.SDK_INT >= 23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at, pi); else am.set(AlarmManager.RTC_WAKEUP, at, pi);
                store(c, id, at, title, body, taskId, tag, channel);
            } catch (Exception ignored) { removeStored(c, id); }
        }
    }

    static synchronized void cancel(Context c, String id) {
        cancelAlarmOnly(c, id);
        removeStored(c, id);
    }

    private static void cancelAlarmOnly(Context c, String id) {
        AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE); if(am==null)return;
        Intent i=new Intent(c,ReminderReceiver.class).setAction(ACTION);
        PendingIntent pi=PendingIntent.getBroadcast(c,requestCode(id),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        pi.cancel();
    }

    static int requestCode(String s) {
        if (s == null) return 1;
        return (s.hashCode() & 0x7fffffff) == 0 ? 1 : (s.hashCode() & 0x7fffffff);
    }

    private static SharedPreferences prefs(Context c) { return c.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private static synchronized void store(Context c, String id, long at, String title, String body, String taskId, String tag, String channel) {
        JSONArray a = read(c);
        JSONArray out = new JSONArray();
        try {
            for (int n=0;n<a.length();n++) { JSONObject o=a.optJSONObject(n); if (o != null && !id.equals(o.optString(P_ID))) out.put(o); }
            JSONObject o=new JSONObject(); o.put(P_ID,id); o.put(P_AT,at); o.put(P_TITLE,title); o.put(P_BODY,body); o.put(P_TASK,taskId); o.put(P_TAG,tag); o.put(P_CHANNEL,channel); out.put(o);
        } catch (Exception ignored) { return; }
        prefs(c).edit().putString(ALARMS,out.toString()).apply();
    }

    private static synchronized void removeStored(Context c, String id) {
        JSONArray a=read(c), out=new JSONArray();
        for(int n=0;n<a.length();n++){ JSONObject o=a.optJSONObject(n); if(o!=null && !id.equals(o.optString(P_ID))) out.put(o); }
        prefs(c).edit().putString(ALARMS,out.toString()).apply();
    }

    private static JSONArray read(Context c) {
        try { return new JSONArray(prefs(c).getString(ALARMS,"[]")); } catch(Exception e) { return new JSONArray(); }
    }

    static synchronized void restoreAll(Context c) {
        JSONArray a=read(c), keep=new JSONArray();
        for(int n=0;n<a.length();n++) {
            JSONObject o=a.optJSONObject(n); if(o==null) continue;
            long at=o.optLong(P_AT,0);
            if(at<=System.currentTimeMillis()) continue;
            String id=o.optString(P_ID,""), title=o.optString(P_TITLE,"Rappel"), body=o.optString(P_BODY,"Rappel de tâche"), task=o.optString(P_TASK,""), tag=o.optString(P_TAG,""), channel=o.optString(P_CHANNEL,"agenda_default");
            scheduleAlarmOnly(c,id,at,title,body,task,tag,channel);
            keep.put(o);
        }
        prefs(c).edit().putString(ALARMS,keep.toString()).apply();
    }

    private static void scheduleAlarmOnly(Context c, String id, long at, String title, String body, String taskId, String tag, String channel) {
        AlarmManager am=(AlarmManager)c.getSystemService(Context.ALARM_SERVICE); if(am==null)return;
        Intent i=new Intent(c,ReminderReceiver.class).setAction(ACTION).putExtra(P_ID,id).putExtra(P_AT,at).putExtra(P_TITLE,title).putExtra(P_BODY,body).putExtra(P_TASK,taskId).putExtra(P_TAG,tag).putExtra(P_CHANNEL,channel);
        PendingIntent pi=PendingIntent.getBroadcast(c,requestCode(id),i,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        try { if(Build.VERSION.SDK_INT>=31 && am.canScheduleExactAlarms()) am.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi); else if(Build.VERSION.SDK_INT>=23) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi); else am.set(AlarmManager.RTC_WAKEUP,at,pi); } catch(SecurityException ignored) { if(Build.VERSION.SDK_INT>=23) try{am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,at,pi);}catch(Exception ignored2){} }
    }

    @Override public void onReceive(Context c, Intent i) {
        if (!ACTION.equals(i.getAction())) return;
        String id=i.getStringExtra(P_ID); if(id!=null) removeStored(c,id);
        postNow(c, i.getStringExtra(P_TITLE), i.getStringExtra(P_BODY), i.getStringExtra(P_TASK), i.getStringExtra(P_TAG), i.getStringExtra(P_CHANNEL));
    }

    static void postNow(Context c, String title, String body, String taskId, String tag, String channel) {
        NotificationManager nm=(NotificationManager)c.getSystemService(Context.NOTIFICATION_SERVICE); if(nm==null)return;
        if(Build.VERSION.SDK_INT>=33 && c.checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)return;
        if(Build.VERSION.SDK_INT>=26 && (channel==null || nm.getNotificationChannel(channel)==null)){
            String id=channel==null?"agenda_default":channel;
            NotificationChannel ch=new NotificationChannel(id,"Rappels Agenda Étoile",NotificationManager.IMPORTANCE_HIGH); nm.createNotificationChannel(ch);
            channel=id;
        }
        Intent open=new Intent(c,MainActivity.class).putExtra("task",taskId).addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP|Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi=PendingIntent.getActivity(c,requestCode("open_"+taskId),open,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        android.app.Notification.Builder b;
        if (Build.VERSION.SDK_INT >= 26) b = new android.app.Notification.Builder(c, channel); else b = new android.app.Notification.Builder(c).setPriority(android.app.Notification.PRIORITY_HIGH);
        b.setSmallIcon(com.agendaetoile.app.R.drawable.icon).setContentTitle(title==null?"Rappel":title).setContentText(body==null?"Rappel de tâche":body).setStyle(new android.app.Notification.BigTextStyle().bigText(body==null?"Rappel de tâche":body)).setAutoCancel(true).setContentIntent(pi).setCategory(android.app.Notification.CATEGORY_REMINDER);
        nm.notify(tag == null ? requestCode(taskId) : requestCode(tag), b.build());
    }
}

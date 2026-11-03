// Notifications : permission et affichage. Deux canaux seulement, tous deux fiables :
//  1. notification système, via le service worker (ou Notification en repli) ;
//  2. message dans l'appli (géré par l'interface quand elle est visible).
// Aucune promesse de notification quand l'appli est fermée : un rappel manqué est signalé à l'ouverture.
import { S } from './strings.fr.js';
import { state } from './state.js';
import * as Native from './native.js';

function notificationApiAvailable() {
  return typeof Notification !== 'undefined' && typeof Notification.requestPermission === 'function';
}

export function permissionState() {
  if (Native.isNative()) return Native.permissionState();
  if (!notificationApiAvailable()) return 'unsupported';
  return Notification.permission; // granted | default | denied
}

export async function requestPermission() {
  if (Native.isNative()) { Native.requestNotifications(); return permissionState(); }
  if (!notificationApiAvailable()) return 'unsupported';
  try { return await Notification.requestPermission(); } catch { return permissionState(); }
}

async function getReg() {
  try { return ('serviceWorker' in navigator) ? await navigator.serviceWorker.getRegistration() : null; } catch { return null; }
}

export function messageFor(task) {
  const when = task.reminder.mode === 'same7' ? S.notify.today : task.reminder.mode === 'hour1' ? S.notify.soon : S.notify.tomorrow;
  return {
    title: `${S.types[task.type]} ${when} : ${task.title}`,
    body: `${S.subjectEmoji[task.subject]} ${S.subjects[task.subject]}${task.note ? ' · ' + task.note : ''}\n${S.notify.body}`
  };
}

function options(task) {
  return {
    body: messageFor(task).body,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: task.reminder.notificationId || `n_${task.id}`, // 1 rappel = 1 notification
    data: { taskId: task.id },
    silent: !state.db.settings.sound && !Native.isNative(),
    vibrate: state.db.settings.sound ? [120, 60, 120] : undefined
  };
}

// Affiche une notification système. Retourne true seulement si le navigateur l'a acceptée.
export async function show(task) {
  if (permissionState() !== 'granted' || !state.db.settings.notifications) return false;
  const m = messageFor(task);
  if (Native.isNative()) return Native.showNotification(m.title, m.body, task.id, task.reminder.notificationId || `n_${task.id}`);
  const opts = options(task);
  const reg = await getReg();
  try { if (reg) { await reg.showNotification(m.title, opts); return true; } } catch { /* repli ci-dessous */ }
  try { new Notification(m.title, opts); return true; } catch { return false; }
}

// Ferme les notifications déjà affichées pour cette tâche (terminée, supprimée…).
export async function closeShown(task) {
  try {
    const reg = await getReg(); if (!reg) return;
    (await reg.getNotifications()).filter(n => n.data && n.data.taskId === task.id).forEach(n => n.close());
  } catch { /* ignore */ }
}

export function registerServiceWorker(onUpdateReady) {
  if (Native.isNative()) return; // APK : fichiers locaux, un service worker servirait d'anciennes copies après une mise à jour
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;
  navigator.serviceWorker.register('sw.js').then(reg => {
    const watch = w => w && w.addEventListener('statechange', () => {
      if (w.state === 'installed' && navigator.serviceWorker.controller) onUpdateReady(w);
    });
    if (reg.waiting && navigator.serviceWorker.controller) onUpdateReady(reg.waiting);
    reg.addEventListener('updatefound', () => watch(reg.installing));
  }).catch(() => { /* hors-ligne indisponible, l'appli reste utilisable */ });
}

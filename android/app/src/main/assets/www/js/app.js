// Point d'entrée : démarre l'état, l'interface, les rappels et le service worker.
import { state, init, syncFromStorage, syncNativeReminders } from './state.js';
import { KEY } from './storage.js';
import { initUI, render, toast, openTaskById, openNewTask, externalChange, setUpdateWaiting, renderCrash } from './ui.js';
import { planAll, armTimer, runReminders, armMidnight, setHooks } from './reminders.js';
import { registerServiceWorker, messageFor } from './notifications.js';

function showFatal(text) {
  const root = document.querySelector('#view');
  if (root && !root.childElementCount) {
    const p = document.createElement('p');
    p.textContent = text;
    const b = document.createElement('button');
    b.className = 'btn btn-primary'; b.type = 'button'; b.textContent = 'Réessayer';
    b.addEventListener('click', () => location.reload());
    root.append(p, b);
  }
}

function start() {
  init();
  planAll();
  // Reconstitue les alarmes Android à chaque démarrage depuis les rappels persistés.
  syncNativeReminders();
  state.online = navigator.onLine;
  setHooks({
    onDelivered: (t, res) => { if (res.inApp) toast('🔔 ' + messageFor(t).title, { ms: 5000 }); },
    onChange: render
  });
  initUI();
  runReminders();
  armMidnight();

  let reloading = false;
  // Première installation : le service worker « prend la main » sans qu'il s'agisse d'une mise à jour : pas de rechargement.
  const hadController = 'serviceWorker' in navigator && !!navigator.serviceWorker.controller;
  registerServiceWorker(w => setUpdateWaiting(w));
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController && !reloading) { reloading = true; location.reload(); } });
    navigator.serviceWorker.addEventListener('message', e => { if (e.data && e.data.type === 'open-task') openTaskById(e.data.taskId); });
  }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') runReminders(); });
  window.addEventListener('storage', e => {
    if (e.key !== null && e.key !== KEY) return;
    if (syncFromStorage()) { planAll(); armTimer(); externalChange(); }
  });
  window.addEventListener('online', () => { state.online = true; render(); });
  window.addEventListener('offline', () => { state.online = false; render(); });

  const p = new URLSearchParams(location.search);
  if (p.get('task')) openTaskById(p.get('task'));
  else if (p.has('new')) openNewTask();
  if (p.has('task') || p.has('new')) history.replaceState(null, '', location.pathname);
}

try { start(); } catch (e) { try { renderCrash(); } catch { showFatal('Un problème est survenu au démarrage.'); } }
window.addEventListener('error', () => showFatal('Un problème est survenu.'));
window.addEventListener('unhandledrejection', () => showFatal('Un problème est survenu.'));

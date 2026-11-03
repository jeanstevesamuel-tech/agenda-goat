// État unique de l'appli + index par date (Map<date, tâches>).
import { load, save } from './storage.js';
import { compareTasks } from './tasks.js';
import { getToday } from './utils.js';
import * as Native from './native.js';

const now = new Date();
export const state = {
  db: null,
  byDate: new Map(),
  status: 'ok',
  saveOk: true,
  online: true,
  ui: { view: 'today', calYear: now.getFullYear(), calMonth: now.getMonth(), calSel: 0, filter: 'all', query: '', limit: 60, lastSubject: 'algebre' }
};

export function init() {
  const r = load();
  state.db = r.db;
  state.status = r.status;
  reindex();
  return r;
}

export function reindex() {
  const m = new Map();
  for (const t of state.db.tasks) { const a = m.get(t.date); if (a) a.push(t); else m.set(t.date, [t]); }
  for (const a of m.values()) a.sort(compareTasks);
  state.byDate = m;
}

export function tasksOn(key) { return state.byDate.get(key) || []; }
export function findTask(id) { return state.db.tasks.find(t => t.id === id) || null; }
export function today() { return getToday(); }

// Enregistre et réindexe. Retourne true si l'écriture a réussi.
export function syncNativeReminders() {
  if (!Native.isNative() || !state.db) return false;
  const now = Date.now();
  for (const t of state.db.tasks) {
    const r = t.reminder;
    if (r?.enabled && r.status === 'scheduled' && Number.isFinite(r.scheduledAt) && r.scheduledAt > now && !t.done && state.db.settings.notifications) {
      Native.scheduleReminder(t.id, r.scheduledAt, t.title, t.note || 'Rappel de tâche', t.id, r.notificationId || `n_${t.id}`);
    } else Native.cancelReminder(t.id);
  }
  return true;
}

export function commit() {
  reindex();
  state.saveOk = state.status === 'unavailable' ? false : save(state.db);
  if (state.saveOk) syncNativeReminders();
  return state.saveOk;
}
// Remplace toute la base seulement si l'écriture réussit ; sinon les données actuelles sont conservées.
export function tryReplaceDB(db) {
  const prev = state.db;
  state.db = db; reindex();
  if (state.status === 'unavailable') { state.saveOk = false; return { ok: true, persisted: false }; }
  if (!save(db)) { state.db = prev; reindex(); return { ok: false, persisted: false }; }
  state.saveOk = true; state.status = 'ok';
  return { ok: true, persisted: true };
}
// Un autre onglet (ou la version installée) a écrit dans le stockage : on recharge au lieu d'écraser son travail.
export function syncFromStorage() {
  if (state.status === 'unavailable') return false;
  const r = load();
  if (r.status !== 'ok') return false;
  state.db = r.db; state.saveOk = true; reindex();
  return true;
}
export function replaceDB(db) { state.db = db; state.status = state.status === 'unavailable' ? 'unavailable' : 'ok'; return commit(); }

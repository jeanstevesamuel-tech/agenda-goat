// Orchestration des rappels : un seul minuteur (pas de polling), armé sur la prochaine échéance.
// Le moteur décide « dû ou non » sans dépendre d'aucune API expérimentale ; l'affichage est une tentative dont on enregistre le résultat.
import { state, commit } from './state.js';
import { processDueReminders, settleDelivery, nextDueAt, planReminder } from './tasks.js';
import { show } from './notifications.js';
import { getToday } from './utils.js';

let timer = null, midnightTimer = null, running = false, again = false;
let hooks = { onDelivered() {}, onChange() {} };
// Une erreur d'interface ne doit jamais empêcher les rappels suivants ni le réarmement du minuteur.
function safely(fn) { try { fn(); } catch { /* ignoré */ } }
export function setHooks(h) { hooks = { ...hooks, ...h }; }

// Recalcule l'état de tous les rappels (après migration, import, changement de jour).
export function planAll() {
  let changed = false;
  for (const t of state.db.tasks) {
    const before = JSON.stringify(t.reminder);
    planReminder(t);
    if (JSON.stringify(t.reminder) !== before) changed = true;
  }
  if (changed) commit();
  return changed;
}

export function armTimer() {
  clearTimeout(timer);
  timer = null;
  const at = nextDueAt(state.db.tasks);
  if (at == null) return;
  timer = setTimeout(runReminders, Math.max(1000, Math.min(at - Date.now(), 2147000000)));
}

// Quand l'appli reste ouverte à minuit, « aujourd'hui » change : on redessine et on refait le point des rappels.
export function armMidnight() {
  clearTimeout(midnightTimer);
  const n = new Date();
  const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 1);
  midnightTimer = setTimeout(() => { runReminders(); armMidnight(); }, Math.max(1000, next.getTime() - n.getTime()));
}

export async function runReminders() {
  if (running) { again = true; return; }
  running = true;
  try {
    do {
      again = false;
      const now = Date.now();
      const { due, missed, changed } = processDueReminders(state.db.tasks, now, getToday(now));
      const visible = typeof document !== 'undefined' && document.visibilityState === 'visible';
      for (const t of due) {
        let system = false;
        try { system = await show(t); } catch { system = false; }
        if (settleDelivery(t, { system, visible }) === 'delivered') safely(() => hooks.onDelivered(t, { system, inApp: visible }));
      }
      if (due.length || changed) commit(); // aussi pour les « deferred » : la tentative est enregistrée
    } while (again);
  } finally { running = false; armTimer(); }
  safely(() => hooks.onChange());
}

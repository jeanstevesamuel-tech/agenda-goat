// Moteur de tâches et de rappels (fonctions pures : aucune dépendance au DOM).
import { uid, calculateReminder } from './utils.js';
import { GRACE_MS } from './constants.js';

const PRI = { urgent: 0, important: 1, normal: 2 };
const emptyDelivery = () => ({ attempted: false, delivered: false, failed: false });

export function compareTasks(a, b) {
  if (a.done !== b.done) return a.done ? 1 : -1;
  if (a.time !== b.time) { if (!a.time) return 1; if (!b.time) return -1; return a.time < b.time ? -1 : 1; }
  if (PRI[a.priority] !== PRI[b.priority]) return PRI[a.priority] - PRI[b.priority];
  return a.createdAt - b.createdAt;
}

export function createTask(v, now = Date.now()) {
  const t = {
    id: uid(), title: v.title, subject: v.subject, type: v.type, date: v.date, time: v.time || '', note: v.note || '',
    done: false, priority: v.priority, completionRewarded: false, completedAt: null,
    reminder: { enabled: v.reminderEnabled, mode: v.reminderMode || 'eve0', customMinutesBefore: v.customMinutesBefore ?? null, scheduledAt: null, status: 'pending', notificationId: null, delivery: emptyDelivery() },
    createdAt: now, updatedAt: now
  };
  return planReminder(t, now);
}

export function applyEdit(task, v, now = Date.now()) {
  Object.assign(task, { title: v.title, subject: v.subject, type: v.type, date: v.date, time: v.time || '', note: v.note || '', priority: v.priority, updatedAt: now });
  task.reminder.enabled = v.reminderEnabled;
  task.reminder.mode = v.reminderMode || 'eve0';
  task.reminder.customMinutesBefore = v.customMinutesBefore ?? null;
  return planReminder(task, now);
}

/* Machine d'état d'un rappel :
   pending -> scheduled -> delivered | missed | cancelled
   Un rappel n'est jamais programmé dans le passé (il devient « cancelled »). */
export function planReminder(task, now = Date.now()) {
  const r = task.reminder;
  if (!r.enabled) { r.status = 'cancelled'; r.scheduledAt = null; r.notificationId = null; return task; }
  if (task.done) { if (r.status === 'scheduled' || r.status === 'pending' || r.status === 'missed') r.status = 'cancelled'; return task; }
  const at = calculateReminder(task.date, task.time, r.mode, r.customMinutesBefore);
  if (at == null) { r.status = 'cancelled'; r.scheduledAt = null; r.notificationId = null; return task; }
  if (r.scheduledAt !== at || r.status === 'pending' || r.status === 'cancelled') {
    r.scheduledAt = at;
    r.notificationId = `n_${task.id}_${at}`;
    r.status = at > now ? 'scheduled' : 'cancelled';
    r.delivery = emptyDelivery();
  }
  return task;
}

// Terminer / rouvrir. Une même tâche ne rapporte jamais plus d'une étoile.
export function toggleDone(task, stats, now = Date.now()) {
  task.done = !task.done;
  task.updatedAt = now;
  let rewarded = false;
  if (task.done) {
    task.completedAt = now;
    if (!task.completionRewarded) { task.completionRewarded = true; stats.totalCompleted += 1; rewarded = true; }
  } else {
    task.completedAt = null;
  }
  planReminder(task, now);
  return { rewarded };
}

/* « Dû » et « livré » sont deux choses différentes :
   - processDueReminders() décide quels rappels sont dus (aucune API du navigateur n'est utilisée) ;
   - l'appelant tente ensuite l'affichage, puis markDelivery() enregistre le résultat réel.
   Les rappels échus depuis plus que la tolérance sont « missed » ; les tâches déjà passées sont annulées sans bruit. */
export function processDueReminders(tasks, now = Date.now(), today = '', grace = GRACE_MS) {
  const due = [], missed = [];
  let changed = false; // vrai si un état a changé (même sans rappel dû) : l'appelant doit alors enregistrer
  for (const t of tasks) {
    const r = t.reminder;
    // Un rappel manqué pour une tâche terminée ou dont le jour est passé n'intéresse plus personne : on le range.
    if (r.status === 'missed' && (t.done || (today && t.date < today))) { r.status = 'cancelled'; continue; }
    if (r.status !== 'scheduled') continue;
    if (t.done || !r.enabled || (today && t.date < today)) { r.status = 'cancelled'; changed = true; continue; }
    if (r.scheduledAt <= now) {
      if (now - r.scheduledAt <= grace) due.push(t);
      else { r.status = 'missed'; r.delivery = { attempted: false, delivered: false, failed: true }; missed.push(t); changed = true; }
    }
  }
  return { due, missed, changed };
}

// system : une notification système a été émise ; inApp : l'appli était visible et a affiché son message.
export function markDelivery(task, { system = false, inApp = false } = {}) {
  const delivered = Boolean(system || inApp);
  task.reminder.delivery = { attempted: true, delivered, failed: !delivered };
  task.reminder.status = delivered ? 'delivered' : 'missed';
  return task;
}

// Décide du sort d'un rappel dû : livré si un canal a fonctionné ; sinon il reste « scheduled »
// (nouvelle tentative au retour de l'appli) tant que la tolérance n'est pas écoulée.
export function settleDelivery(task, { system = false, visible = false } = {}) {
  if (system || visible) { markDelivery(task, { system, inApp: visible }); return 'delivered'; }
  task.reminder.delivery = { attempted: true, delivered: false, failed: false };
  return 'deferred';
}

// Prochain instant utile : l'échéance d'un rappel futur, ou la fin de tolérance d'un rappel dû en attente.
export function nextDueAt(tasks, now = Date.now(), grace = GRACE_MS) {
  let n = Infinity;
  for (const t of tasks) {
    if (t.reminder.status !== 'scheduled') continue;
    const at = t.reminder.scheduledAt;
    const c = at > now ? at : at + grace + 1;
    if (c < n) n = c;
  }
  return n === Infinity ? null : n;
}

export function reminderText(t) {
  if (t.reminder.mode === 'custom') {
    const n = Number(t.reminder.customMinutesBefore);
    if (Number.isInteger(n) && n > 0) {
      if (n % 1440 === 0) return `${n / 1440} jour${n / 1440 > 1 ? 's' : ''} avant`;
      if (n % 60 === 0) return `${n / 60} heure${n / 60 > 1 ? 's' : ''} avant`;
      return `${n} minute${n > 1 ? 's' : ''} avant`;
    }
  }
  return { eve0: 'la veille à minuit', eve18: 'la veille à 18h', same7: 'le jour même à 7h', hour1: '1 heure avant' }[t.reminder.mode] || '';
}

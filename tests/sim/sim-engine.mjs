// Simulation longue durée du moteur (tâches, étoiles, rappels, stockage) avec horloge truquée.
// Vérifie des invariants après CHAQUE action, sur des centaines de parcours aléatoires reproductibles.
import { makeStub } from '../stub.mjs';

globalThis.localStorage = makeStub();
const BASE = new Date(2026, 8, 19, 12, 0).getTime();
let NOW = BASE;
Date.now = () => NOW;
let lastDelay = null;
globalThis.setTimeout = (fn, ms) => { lastDelay = ms; return 1; };
globalThis.clearTimeout = () => {};
const notes = [];
globalThis.Notification = function (title, opts) { notes.push({ title, tag: opts.tag }); };
globalThis.Notification.permission = 'granted';
globalThis.Notification.requestPermission = async () => globalThis.Notification.permission;
globalThis.document = { visibilityState: 'visible' };

const U = await import('../../js/utils.js');
const { state, reindex, commit } = await import('../../js/state.js');
const { defaultDB, validateTask, validateDatabase } = await import('../../js/validation.js');
const T = await import('../../js/tasks.js');
const { runReminders, armTimer, planAll, setHooks } = await import('../../js/reminders.js');
const { SUBJECTS, TYPES, PRIORITIES, GRACE_MS } = await import('../../js/constants.js');

const findings = new Map();
const flag = (type, msg, ctx) => { const f = findings.get(type) || { n: 0, first: null }; f.n++; if (!f.first) f.first = `${msg} [${ctx}]`; findings.set(type, f); };
const mulberry32 = a => () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const pad = n => String(n).padStart(2, '0');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function runSeed(seed, steps) {
  const rnd = mulberry32(seed);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const ri = (a, b) => a + Math.floor(rnd() * (b - a + 1));
  NOW = BASE; notes.length = 0; localStorage.clear();
  state.db = defaultDB(); state.status = 'ok'; state.saveOk = true; reindex();
  const deliveredCount = new Map(), everDone = new Set(), trash = [];
  let n = 0, ctx = '', justRan = false;
  setHooks({
    onChange() {},
    onDelivered(t, res) {
      const r = t.reminder, tk = U.getToday(NOW);
      deliveredCount.set(r.notificationId, (deliveredCount.get(r.notificationId) || 0) + 1);
      if (deliveredCount.get(r.notificationId) > 1) flag('double-livraison', `rappel ${r.notificationId} livré plusieurs fois`, ctx);
      if (t.done) flag('livré-tâche-terminée', t.title, ctx);
      if (!r.enabled) flag('livré-rappel-désactivé', t.title, ctx);
      if (t.date < tk) flag('livré-tâche-passée', t.title, ctx);
      if (NOW < r.scheduledAt) flag('livré-trop-tôt', t.title, ctx);
      if (NOW - r.scheduledAt > GRACE_MS) flag('livré-hors-tolérance', `${NOW - r.scheduledAt} ms`, ctx);
    }
  });

  const check = () => {
    const tk = U.getToday(NOW), seen = new Set();
    for (const t of state.db.tasks) {
      const r = t.reminder;
      if (seen.has(t.id)) flag('id-dupliqué', t.id, ctx); seen.add(t.id);
      if (!r.enabled && r.status !== 'cancelled') flag('désactivé-mais-pas-annulé', `${r.status}`, ctx);
      if (r.status === 'scheduled') {
        if (t.done) flag('scheduled-sur-tâche-terminée', t.title, ctx);
        if (!r.enabled || !Number.isFinite(r.scheduledAt) || !String(r.notificationId).startsWith('n_')) flag('scheduled-incohérent', JSON.stringify(r), ctx);
      }
      if (r.status === 'delivered' && !r.delivery.delivered) flag('delivered-sans-livraison', JSON.stringify(r.delivery), ctx);
      if (r.status === 'missed' && !r.delivery.failed) flag('missed-sans-échec', JSON.stringify(r.delivery), ctx);
      if (r.status === 'missed' && t.done) flag('rappel-manqué-sur-tâche-TERMINÉE', t.title, ctx);
      if (justRan && r.status === 'missed' && t.date < tk) flag('rappel-manqué-périmé-jamais-nettoyé', `${t.date} < ${tk}`, ctx);
      if (t.done && !t.completedAt && t.completionRewarded) { /* base migrée : toléré */ }
    }
    const idx = new Map(); for (const t of state.db.tasks) idx.set(t.date, (idx.get(t.date) || 0) + 1);
    for (const [d, list] of state.byDate) if ((idx.get(d) || 0) !== list.length) flag('index-incohérent', d, ctx);
    if (state.byDate.size !== idx.size) flag('index-incohérent', 'taille', ctx);
    if (state.db.stats.totalCompleted !== everDone.size) flag('étoiles-incohérentes', `${state.db.stats.totalCompleted} ≠ ${everDone.size}`, ctx);
    if (justRan) { const nd = T.nextDueAt(state.db.tasks, NOW); if (nd !== null && nd <= NOW) flag('minuteur-en-boucle', `nextDueAt ${nd - NOW} ms`, ctx); }
  };

  const randomInput = () => {
    const modes = ['eve0', 'eve18', 'same7', 'hour1', 'none'], mode = pick(modes);
    const time = rnd() < .45 ? `${pad(ri(0, 23))}:${pad(ri(0, 59))}` : '';
    return { title: 'T' + (++n), note: '', subject: pick(SUBJECTS), type: pick(TYPES), date: U.addDays(U.getToday(NOW), ri(-20, 60)), time, priority: pick(PRIORITIES), reminderEnabled: mode !== 'none', reminderMode: mode === 'none' ? 'eve0' : mode };
  };

  for (let step = 0; step < steps; step++) {
    const a = rnd(), tasks = state.db.tasks; justRan = false;
    if (a < .22) {
      ctx = `seed ${seed} étape ${step} créer`; const inp = randomInput(), v = validateTask(inp);
      if (inp.reminderMode === 'hour1' && inp.reminderEnabled && !inp.time) { if (v.ok) flag('validation-hour1-sans-heure', 'accepté', ctx); }
      else if (!v.ok) flag('validation-refuse-entrée-valide', JSON.stringify(v.errors), ctx);
      else { state.db.tasks.push(T.createTask(v.value, NOW)); commit(); armTimer(); }
    } else if (a < .36 && tasks.length) {
      const t = pick(tasks); ctx = `seed ${seed} étape ${step} cocher ${t.id}`;
      const wasEver = everDone.has(t.id), { rewarded } = T.toggleDone(t, state.db.stats, NOW);
      if (t.done) { if (rewarded === wasEver) flag('récompense-incohérente', `rewarded=${rewarded} déjà=${wasEver}`, ctx); everDone.add(t.id); }
      else if (rewarded) flag('récompense-en-rouvrant', t.title, ctx);
      commit(); armTimer();
    } else if (a < .44 && tasks.length) {
      const t = pick(tasks); ctx = `seed ${seed} étape ${step} modifier`; const inp = randomInput(); inp.title = t.title;
      const v = validateTask(inp); if (v.ok) { T.applyEdit(t, v.value, NOW); commit(); armTimer(); }
    } else if (a < .50 && tasks.length) {
      ctx = `seed ${seed} étape ${step} supprimer`; const t = pick(tasks); state.db.tasks.splice(state.db.tasks.indexOf(t), 1); trash.push(t); commit(); armTimer();
    } else if (a < .53 && trash.length) {
      ctx = `seed ${seed} étape ${step} annuler suppression`; const t = trash.pop(); state.db.tasks.push(t); T.planReminder(t, NOW); commit(); armTimer();
    } else if (a < .70) {
      ctx = `seed ${seed} étape ${step} avancer`; NOW = Math.round(NOW + pick([30e3, 60e3, 5 * 60e3, 20 * 60e3, 3600e3, 6 * 3600e3, 86400e3, 3 * 86400e3, 40 * 86400e3]) * (0.5 + rnd()));
      if (rnd() < .8) { await runReminders(); justRan = true; }
    } else if (a < .78) {
      ctx = `seed ${seed} étape ${step} minuteur pile à l'échéance`; const nd = T.nextDueAt(state.db.tasks, NOW);
      if (nd) { NOW = Math.max(NOW, nd); { await runReminders(); justRan = true; } }
    } else if (a < .84) {
      document.visibilityState = document.visibilityState === 'visible' ? 'hidden' : 'visible';
      ctx = `seed ${seed} étape ${step} visibilité ${document.visibilityState}`; if (document.visibilityState === 'visible') { await runReminders(); justRan = true; }
    } else if (a < .88) {
      Notification.permission = pick(['granted', 'denied', 'default']); ctx = `seed ${seed} permission ${Notification.permission}`;
    } else if (a < .90) {
      state.db.settings.notifications = !state.db.settings.notifications; ctx = `seed ${seed} notifications ${state.db.settings.notifications}`;
    } else if (a < .95) {
      ctx = `seed ${seed} étape ${step} redémarrage`;
      const before = JSON.parse(JSON.stringify(state.db.tasks));
      const v = validateDatabase(JSON.parse(JSON.stringify(state.db)), NOW);
      if (!same(v.db.tasks, before)) {
        let d = '?';
        outer: for (let i = 0; i < before.length; i++) for (const k of Object.keys(before[i])) {
          if (!same(before[i][k], v.db.tasks[i]?.[k])) { d = `tâche ${i} champ ${k} : ${JSON.stringify(before[i][k])} → ${JSON.stringify(v.db.tasks[i]?.[k])}`; break outer; }
        }
        flag('normalisation-non-idempotente', d, ctx);
      }
      if (v.dropped) flag('tâche-perdue-au-redémarrage', `${v.dropped}`, ctx);
      state.db = v.db; reindex(); planAll(); armTimer(); { await runReminders(); justRan = true; }
    } else {
      ctx = `seed ${seed} étape ${step} exécuter les rappels`; { await runReminders(); justRan = true; }
    }
    check();
  }
}

// Scénario : un hook d'interface qui plante ne doit ni bloquer les autres rappels ni empêcher de réarmer le minuteur.
async function hookThrows() {
  NOW = BASE; localStorage.clear(); state.db = defaultDB(); state.status = 'ok'; reindex(); document.visibilityState = 'visible';
  const mk = date => T.createTask(validateTask({ title: 'H' + date, note: '', subject: 'algebre', type: 'homework', date, time: '', priority: 'normal', reminderEnabled: true, reminderMode: 'eve0' }).value, NOW);
  const due = [mk(U.addDays(U.getToday(NOW), 3)), mk(U.addDays(U.getToday(NOW), 3)), mk(U.addDays(U.getToday(NOW), 3))], later = mk(U.addDays(U.getToday(NOW), 30));
  state.db.tasks.push(...due, later); commit();
  NOW = due[0].reminder.scheduledAt + 60000; lastDelay = null; let calls = 0;
  setHooks({ onDelivered() { calls++; throw new Error('bug d\'interface'); }, onChange() { throw new Error('bug d\'interface'); } });
  let threw = false; try { await runReminders(); } catch { threw = true; }
  if (threw) flag('hook-qui-plante-fait-échouer-le-moteur', 'runReminders a rejeté', 'scénario hook');
  if (due.some(t => t.reminder.status !== 'delivered')) flag('hook-qui-plante-bloque-les-rappels-suivants', due.map(t => t.reminder.status).join(','), 'scénario hook');
  if (lastDelay === null) flag('hook-qui-plante-empêche-de-réarmer-le-minuteur', 'armTimer non appelé', 'scénario hook');
  await runReminders(); if (calls !== 3) flag('hook-qui-plante-double-livraison', `${calls} appels`, 'scénario hook');
}
await hookThrows();

const SEEDS = Number(process.env.SEEDS || 400), STEPS = Number(process.env.STEPS || 300);
const t0 = process.hrtime.bigint();
for (let s = 1; s <= SEEDS; s++) await runSeed(s, STEPS);
const ms = Number(process.hrtime.bigint() - t0) / 1e6;
console.log(`Moteur : ${SEEDS} parcours × ${STEPS} actions = ${SEEDS * STEPS} actions simulées (${Math.round(ms)} ms), ${notes.length} notifications émises sur le dernier parcours`);
if (!findings.size) console.log('  aucun invariant violé');
for (const [k, f] of findings) console.log(`  ✗ ${k} : ${f.n} occurrence(s). Exemple : ${f.first}`);
process.exit(findings.size ? 1 : 0);

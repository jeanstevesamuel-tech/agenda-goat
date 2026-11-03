// Simulation aléatoire (reproductible) du moteur complet : tâches, rappels, minuteurs, redémarrages, veille, permissions.
// Après CHAQUE opération, on vérifie des invariants. Une seule violation = échec, avec la graine pour rejouer.
import { makeStub } from '../stub.mjs';
import { installClock, RealDateClass } from './clock.mjs';
import { installDom } from './domshim.mjs';
import { GRACE_MS } from '../../js/constants.js';

const { state, init, commit, tasksOn } = await import('../../js/state.js');
const { createTask, applyEdit, toggleDone, planReminder, nextDueAt } = await import('../../js/tasks.js');
const { validateTask, normalizeTask, validateDatabase } = await import('../../js/validation.js');
const { planAll, armTimer, armMidnight, runReminders, setHooks } = await import('../../js/reminders.js');
const { exportData, parseImport } = await import('../../js/storage.js');
const { tryReplaceDB } = await import('../../js/state.js');
const { addDays, getToday, isValidDate } = await import('../../js/utils.js');

const SEEDS = Number(process.env.SEEDS || 40), STEPS = Number(process.env.STEPS || 1500);
const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
let totalChecks = 0, totalOps = 0, deliveredTotal = 0, missedTotal = 0, eventsTotal = 0, notifsTotal = 0;
const failures = [];

async function runSeed(seed) {
  const R = rng(seed), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)];
  const start = new RealDateClass(2026, ri(0, 11), ri(1, 28), ri(0, 23), ri(0, 59)).getTime();
  globalThis.localStorage = makeStub();
  let C = installClock(start), D = installDom();
  D.setPermission(pick(['granted', 'granted', 'default', 'denied']));
  const events = [], tags = new Set(); let rewards = 0, log = [];
  const fail = m => { failures.push(`graine ${seed} : ${m}\n     dernières opérations : ${log.slice(-6).join(' > ')}`); throw new Error('stop'); };
  const wire = () => {
    setHooks({ onDelivered: (t, res) => { events.push({ id: t.id, at: t.reminder.scheduledAt, now: C.now(), res }); }, onChange() {} });
  };
  const boot = async () => { init(); planAll(); wire(); armTimer(); armMidnight(); await runReminders(); await C.flush(); };
  await boot();
  let trash = [], notifSeen = 0;

  const randDate = () => addDays(getToday(C.now()), ri(-3, 40));
  const newInput = () => {
    const mode = pick(['eve0', 'eve18', 'same7', 'hour1', 'hour1']); const enabled = R() < 0.85;
    return { title: pick(['Maths', 'Français', 'Exercices', 'Leçon', 'Dictée', 'É' + 'x'.repeat(ri(0, 85))]), note: R() < .3 ? 'note' : '', subject: pick(['algebre', 'geometrie', 'analyse_lineaire', 'analyse_combinatoire', 'trigonometrie', 'statistiques', 'francais', 'anglais', 'autre']), type: pick(['homework', 'lesson', 'exam', 'project']), date: randDate(), time: R() < .6 ? `${String(ri(0, 23)).padStart(2, '0')}:${pick(['00', '15', '30', '45'])}` : '', priority: pick(['normal', 'important', 'urgent']), reminderEnabled: enabled, reminderMode: mode };
  };
  const ops = {
    async create() { const v = validateTask(newInput()); if (!v.ok) return; const t = createTask(v.value); state.db.tasks.push(t); commit(); armTimer(); },
    async edit() { if (!state.db.tasks.length) return; const t = pick(state.db.tasks); const inp = { ...newInput(), title: t.title, subject: t.subject, type: t.type, priority: t.priority };
      if (R() < .5) inp.date = t.date; if (R() < .5) inp.time = t.time; if (R() < .5) { inp.reminderEnabled = t.reminder.enabled; inp.reminderMode = t.reminder.mode; }
      const v = validateTask(inp); if (!v.ok) return; applyEdit(t, v.value); commit(); armTimer(); },
    async toggle() { if (!state.db.tasks.length) return; const t = pick(state.db.tasks); if (toggleDone(t, state.db.stats).rewarded) rewards++; commit(); armTimer(); },
    async remove() { if (!state.db.tasks.length) return; const t = pick(state.db.tasks); state.db.tasks.splice(state.db.tasks.indexOf(t), 1); trash.push(t); commit(); armTimer(); },
    async undo() { if (!trash.length) return; const t = trash.pop(); state.db.tasks.push(t); planReminder(t); commit(); await runReminders(); },
    async advance() { await C.advance(pick([60e3, 5 * 60e3, 30 * 60e3, 3600e3, 6 * 3600e3, 24 * 3600e3, 3 * 24 * 3600e3])); },
    async tick() { await C.advance(ri(1, 90) * 1000); },
    async sleep() { C.jumpTo(C.now() + pick([3600e3, 8 * 3600e3, 3 * 24 * 3600e3])); D.dispatch(D.root, 'visibilitychange'); await runReminders(); await C.advance(0); },
    async clockBack() { C.jumpTo(C.now() - pick([60e3, 3600e3, 24 * 3600e3])); await runReminders(); },
    async visibility() { D.visibilityState = D.visibilityState === 'visible' ? 'hidden' : 'visible'; if (D.visibilityState === 'visible') await runReminders(); },
    async permission() { D.setPermission(pick(['granted', 'denied', 'default'])); },
    async settings() { state.db.settings.notifications = R() < .7; state.db.settings.sound = R() < .5; commit(); },
    async restart() { C.clearAll(); if (R() < .5) D.visibilityState = 'visible'; await boot(); },
    async roundtrip() { const p = parseImport(exportData(state.db)); if (!p.ok) fail('export puis import refusé'); if (JSON.stringify(p.db.tasks.map(t => t.id)) !== JSON.stringify(state.db.tasks.map(t => t.id))) fail('export/import a changé les identifiants'); const r = tryReplaceDB(p.db); if (!r.ok) fail('import de sa propre sauvegarde refusé'); planAll(); await runReminders(); },
    async runNow() { await runReminders(); }
  };
  const weights = [['create', 14], ['edit', 8], ['toggle', 8], ['remove', 4], ['undo', 2], ['advance', 10], ['tick', 14], ['sleep', 2], ['clockBack', 1], ['visibility', 6], ['permission', 3], ['settings', 2], ['restart', 3], ['roundtrip', 1], ['runNow', 2]];
  const total = weights.reduce((n, [, w]) => n + w, 0);
  const choose = () => { let x = R() * total; for (const [k, w] of weights) { if ((x -= w) < 0) return k; } return 'tick'; };

  function invariants(op) {
    const now = C.now(), today = getToday(now), tasks = state.db.tasks; const c = (cond, m) => { totalChecks++; if (!cond) fail(`${m} (après ${op})`); };
    c(new Set(tasks.map(t => t.id)).size === tasks.length, 'identifiants dupliqués');
    let indexed = 0; for (const [k, list] of state.byDate) { indexed += list.length; for (const t of list) c(t.date === k, 'index par date incohérent'); } c(indexed === tasks.length, `index (${indexed}) ≠ tâches (${tasks.length})`);
    for (const t of tasks) {
      const r = t.reminder;
      c(isValidDate(t.date) && t.title.length >= 1 && t.title.length <= 80, 'tâche invalide en mémoire');
      c((t.done && t.completedAt != null) || (!t.done && t.completedAt == null), 'completedAt incohérent avec done');
      c(JSON.stringify(normalizeTask(JSON.parse(JSON.stringify(t)))) === JSON.stringify(normalizeTask(t)), `normalisation non idempotente pour ${t.id}`);
      if (r.status === 'scheduled') {
        c(r.enabled && !t.done && r.scheduledAt != null && !!r.notificationId, `« scheduled » incohérent (enabled=${r.enabled} done=${t.done})`);
        c(t.date >= today || r.scheduledAt + GRACE_MS + 1 > now, `rappel oublié : tâche du ${t.date}, échéance ${new Date(r.scheduledAt).toISOString()}, maintenant ${new Date(now).toISOString()}`);
        c(r.scheduledAt + GRACE_MS >= now - 1000, `rappel dû depuis plus que la tolérance mais toujours « scheduled » (${(now - r.scheduledAt) / 60000} min)`);
      }
      if (r.status === 'delivered') c(r.delivery.delivered === true && r.delivery.attempted === true, 'delivered sans delivery.delivered');
      if (r.status === 'missed') c(r.delivery.failed === true && r.delivery.delivered === false, 'missed sans delivery.failed');
      if (t.done) c(r.status !== 'scheduled', 'tâche terminée avec rappel programmé');
      if (!r.enabled) c(r.status === 'cancelled' && r.scheduledAt === null, 'rappel désactivé mais pas annulé');
    }
    const nd = nextDueAt(tasks, now); c(nd === null || nd > now, 'nextDueAt ≤ maintenant : le minuteur tournerait en boucle');
    const armed = C.nextTimerAt(); if (nd !== null) c(armed !== null && armed <= nd + 1000, 'aucun minuteur armé pour la prochaine échéance');
    const stored = globalThis.localStorage.getItem('agenda-etoile-v2'); if (state.saveOk && stored !== null) c(stored === JSON.stringify(state.db), 'stockage ≠ mémoire');
    for (const e of events) { c(e.now - e.at <= GRACE_MS, `livré trop tard (${(e.now - e.at) / 60000} min)`); }
    const nts = D.notifications; for (let i = notifSeen; i < nts.length; i++) { const tag = nts[i].opts.tag; c(!tags.has(tag), `notification en double pour ${tag}`); tags.add(tag); } notifSeen = nts.length;
    const ids = events.map(e => `${e.id}@${e.at}`); c(new Set(ids).size === ids.length, 'un même rappel livré deux fois');
    c(state.db.stats.totalCompleted >= rewards, 'étoiles inférieures aux récompenses');
  }

  try {
    for (let i = 0; i < STEPS; i++) {
      const op = choose(); log.push(op); totalOps++;
      await ops[op](); await C.flush(); invariants(op);
    }
    // fin de partie : tout laisser s'écouler, plus aucun rappel « en attente » ne doit subsister
    D.visibilityState = 'visible'; await C.advance(30 * 24 * 3600e3); await C.flush(); invariants('fin');
    for (const t of state.db.tasks) if (t.reminder.status === 'scheduled' && t.reminder.scheduledAt <= C.now()) fail(`rappel échu mais encore programmé : ${t.date}`);
    for (const t of state.db.tasks) { if (t.reminder.status === 'delivered') deliveredTotal++; if (t.reminder.status === 'missed') missedTotal++; }
    eventsTotal += events.length; notifsTotal += D.notifications.length;
    if (C.pending() > 10) fail(`trop de minuteurs en attente à la fin : ${C.pending()}`);
  } catch (e) { if (e.message !== 'stop') failures.push(`graine ${seed} : EXCEPTION ${e.stack}`); }
  C.restore();
}

for (let s = 1; s <= SEEDS; s++) await runSeed(s);
console.log(`Moteur : ${SEEDS} parties × ${STEPS} opérations = ${totalOps} opérations, ${totalChecks} vérifications, ${eventsTotal} livraisons (dont ${notifsTotal} notifications système), ${deliveredTotal} rappels « delivered » et ${missedTotal} « missed » en fin de partie`);
if (failures.length) { console.log(`${failures.length} ÉCHEC(S) :`); failures.slice(0, 15).forEach(f => console.log(' - ' + f)); process.exit(1); }
console.log('Aucun échec.');

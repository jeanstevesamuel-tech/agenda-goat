// Suite de tests sans dépendance. Fonctionne sous Node (tests/run.mjs) et dans le navigateur (tests/index.html).
import * as U from '../js/utils.js';
import { validateTask, normalizeTask, validateDatabase, defaultDB } from '../js/validation.js';
import { createTask, applyEdit, planReminder, toggleDone, processDueReminders, markDelivery, settleDelivery, nextDueAt, compareTasks } from '../js/tasks.js';
import { getLevel, getLevelProgress, getNextLevel, weekStats, computeStreak, getRewards } from '../js/statistics.js';
import { migrateDatabase, parseImport, exportData, load, CORRUPT_KEY, KEY } from '../js/storage.js';
import { GRACE_MS } from '../js/constants.js';
import { state, reindex, tasksOn, tryReplaceDB, syncFromStorage } from '../js/state.js';
import { S } from '../js/strings.fr.js';

const tests = [];
export const test = (name, fn) => tests.push({ name, fn });
const eq = (a, b, m = '') => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${m} attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`); };
const ok = (c, m = 'condition fausse') => { if (!c) throw new Error(m); };

const valid = (o = {}) => ({ title: 'Exercices', note: '', subject: 'algebre', type: 'homework', date: '2026-11-15', time: '', priority: 'normal', reminderEnabled: true, reminderMode: 'eve0', ...o });
const at = (y, m, d, h = 0, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();

/* ---------- Dates et heures ---------- */
test('dates : valides et invalides', () => {
  ok(U.isValidDate('2026-09-19')); ok(U.isValidDate('2028-02-29'));
  ok(!U.isValidDate('2026-02-30')); ok(!U.isValidDate('2026-99-99')); ok(!U.isValidDate('2026-2-3')); ok(!U.isValidDate(null)); ok(!U.isValidDate('2026-13-01'));
});
test('dates : addDays, passage de mois et d\'année', () => {
  eq(U.addDays('2026-11-30', 1), '2026-12-01'); eq(U.addDays('2026-01-01', -1), '2025-12-31'); eq(U.addDays('2028-02-28', 1), '2028-02-29');
});
test('dates : differenceInDays', () => { eq(U.differenceInDays('2026-11-14', '2026-11-15'), 1); eq(U.differenceInDays('2026-11-15', '2026-11-14'), -1); eq(U.differenceInDays('2026-03-01', '2026-04-01'), 31); });
test('dates : startOfWeek (lundi / dimanche)', () => { eq(U.startOfWeek('2026-09-19', 1), '2026-09-14'); eq(U.startOfWeek('2026-09-19', 0), '2026-09-13'); eq(U.startOfWeek('2026-09-14', 1), '2026-09-14'); });
test('dates : formatDate et relativeDay', () => {
  eq(U.formatDate('2026-09-19', { weekday: true }), 'Samedi 19 septembre');
  eq(U.relativeDay('2026-09-20', '2026-09-19'), 'Demain'); eq(U.relativeDay('2026-09-19', '2026-09-19'), 'Aujourd’hui');
});
test('heures : validation et formats', () => {
  ok(U.isValidTime('00:00')); ok(U.isValidTime('23:59')); ok(!U.isValidTime('24:00')); ok(!U.isValidTime('7:5')); eq(U.parseTime('18:30'), 1110); eq(U.formatTime('18:00'), '18h00');
});
test('rappels : calculateReminder pour chaque mode', () => {
  eq(U.calculateReminder('2026-11-15', '', 'eve0'), at(2026, 11, 14, 0, 0));
  eq(U.calculateReminder('2026-11-15', '', 'eve18'), at(2026, 11, 14, 18, 0));
  eq(U.calculateReminder('2026-11-15', '', 'same7'), at(2026, 11, 15, 7, 0));
  eq(U.calculateReminder('2026-11-15', '18:00', 'hour1'), at(2026, 11, 15, 17, 0));
  eq(U.calculateReminder('2026-11-15', '00:30', 'hour1'), at(2026, 11, 14, 23, 30));
  eq(U.calculateReminder('2026-11-15', '', 'hour1'), null);
  eq(U.calculateReminder('2026-12-01', '', 'eve0'), at(2026, 11, 30, 0, 0));
  eq(U.calculateReminder('2026-02-30', '', 'eve0'), null);
});
test('rappels : « 1 heure avant » = 60 minutes réelles, même autour du changement d\'heure (toute l\'année, tous fuseaux)', () => {
  let d = '2026-01-01';
  for (let i = 0; i < 730; i++, d = U.addDays(d, 1)) {
    const [y, m, dd] = d.split('-').map(Number);
    for (const time of ['00:00', '00:30', '01:00', '01:30', '02:00', '02:30', '03:00', '03:30', '04:00', '12:00', '23:30']) {
      const [h, mi] = time.split(':').map(Number);
      const want = new Date(y, m - 1, dd, h, mi).getTime() - 3600000;
      if (U.calculateReminder(d, time, 'hour1') !== want) throw new Error(`${d} ${time} : écart réel ${(new Date(y, m - 1, dd, h, mi).getTime() - U.calculateReminder(d, time, 'hour1')) / 60000} min au lieu de 60`);
    }
  }
});
test('utils : normalizeText retire les accents', () => eq(U.normalizeText('Éléphant Été'), 'elephant ete'));

/* ---------- Matières / compatibilité ---------- */
test('matières : les six branches mathématiques sont disponibles', async () => {
  const { SUBJECTS } = await import('../js/constants.js');
  for (const k of ['algebre','geometrie','analyse_lineaire','analyse_combinatoire','trigonometrie','statistiques']) ok(SUBJECTS.includes(k), `matière absente : ${k}`);
  ok(!SUBJECTS.includes('maths'), 'ancienne matière générale retirée des choix');
});
test('matières : les anciennes tâches Mathématiques restent classées en Algèbre', () => {
  eq(normalizeTask({ title: 'Ancienne tâche', date: '2026-11-15', subject: 'maths' }).subject, 'algebre');
  eq(normalizeTask({ title: 'Matière corrompue', date: '2026-11-15', subject: 'constructor' }).subject, 'autre');
});

/* ---------- Validation ---------- */
test('validation : titre 0, 1, 80 et 81 caractères', () => {
  ok(!validateTask(valid({ title: '' })).ok); ok(!validateTask(valid({ title: '   ' })).ok);
  ok(validateTask(valid({ title: 'a' })).ok); ok(validateTask(valid({ title: 'a'.repeat(80) })).ok); ok(!validateTask(valid({ title: 'a'.repeat(81) })).ok);
});
test('validation : note 400 et 401 caractères', () => { ok(validateTask(valid({ note: 'n'.repeat(400) })).ok); ok(!validateTask(valid({ note: 'n'.repeat(401) })).ok); });
test('validation : date réelle, matière, type, priorité, heure', () => {
  ok(!validateTask(valid({ date: '2026-02-30' })).ok); ok(!validateTask(valid({ date: '2026-99-99' })).ok);
  ok(!validateTask(valid({ subject: 'pirate' })).ok); ok(!validateTask(valid({ type: 'x' })).ok); ok(!validateTask(valid({ priority: 'x' })).ok);
  ok(!validateTask(valid({ time: '25:00' })).ok); ok(validateTask(valid({ time: '18:00' })).ok);
});
test('validation : rappel personnalisé exige heure et délai valide', () => {
  ok(!validateTask(valid({ reminderMode: 'custom', time: '', customMinutesBefore: 30 })).ok);
  ok(!validateTask(valid({ reminderMode: 'custom', time: '18:00', customMinutesBefore: 0 })).ok);
  ok(!validateTask(valid({ reminderMode: 'custom', time: '18:00', customMinutesBefore: 43201 })).ok);
  ok(validateTask(valid({ reminderMode: 'custom', time: '18:00', customMinutesBefore: 90 })).ok);
});
test('validation : rappel 1 h avant exige une heure', () => {
  ok(!validateTask(valid({ reminderMode: 'hour1', time: '' })).ok); ok(validateTask(valid({ reminderMode: 'hour1', time: '18:00' })).ok);
  ok(validateTask(valid({ reminderEnabled: false, reminderMode: 'zzz' })).ok);
});
test('validation : normalizeTask répare ou rejette', () => {
  eq(normalizeTask({ title: '', date: '2026-01-01' }), null); eq(normalizeTask({ title: 'x', date: '2026-02-30' }), null); eq(normalizeTask(null), null);
  const t = normalizeTask({ title: 'x', date: '2026-01-01' });
  ok(t.id.length > 0, 'id généré'); eq(t.subject, 'autre'); eq(t.reminder.status, 'pending'); eq(t.done, false);
});
test('validation : base — étoiles négatives, énormes, doublons, tâches invalides', () => {
  eq(validateDatabase({ tasks: [], stats: { totalCompleted: -5 } }).db.stats.totalCompleted, 0);
  eq(validateDatabase({ tasks: [], stats: { totalCompleted: 1e12 } }).db.stats.totalCompleted, 100000);
  eq(validateDatabase({ tasks: [], stats: { totalCompleted: 'abc' } }).db.stats.totalCompleted, 0);
  const r = validateDatabase({ tasks: [{ id: 'a', title: 'x', date: '2026-01-01' }, { id: 'a', title: 'y', date: '2026-01-02' }, { title: '', date: '2026-01-01' }, 5] });
  eq(r.db.tasks.length, 2); eq(r.dropped, 2); ok(r.db.tasks[0].id !== r.db.tasks[1].id, 'ids uniques');
  ok(!validateDatabase({}).ok); ok(!validateDatabase(null).ok); ok(!validateDatabase({ tasks: 'x' }).ok); ok(!validateDatabase([]).ok);
});
test('validation : delivery normalisé sur une vieille tâche', () => {
  const t = normalizeTask({ title: 'x', date: '2026-01-01', reminder: { enabled: true, delivery: { attempted: 'oui' } } });
  eq(t.reminder.delivery, { attempted: false, delivered: false, failed: false });
});
test('calendrier : marqueurs test/examen/évaluation persistés et dates invalides rejetées', () => {
  const v = validateDatabase({ version: 2, tasks: [], calendarEvents: [
    { date: '2026-11-15', type: 'test' }, { date: '2026-11-16', type: 'exam', subject: 'algebre', note: 'chapitre 3' },
    { date: '2026-02-30', type: 'evaluation' }, { date: '2026-11-17', type: 'inconnu' }
  ] });
  ok(v.ok); eq(v.db.calendarEvents.length, 2); eq(v.db.calendarEvents[1].subject, 'algebre'); eq(v.db.calendarEvents[1].note, 'chapitre 3'); eq(v.dropped, 2);
});
test('calendrier : anciennes bases sans marqueurs restent compatibles', () => {
  const v = validateDatabase({ version: 2, tasks: [] }); ok(v.ok); eq(v.db.calendarEvents, []);
});
test('validation : réglages invalides ramenés aux défauts', () => {
  const s = validateDatabase({ tasks: [], settings: { theme: 'neon', firstDayOfWeek: 9, notifications: 'x' } }).db.settings;
  eq(s.theme, 'system'); eq(s.firstDayOfWeek, 1); eq(s.notifications, true);
});

/* ---------- Tâches, étoiles, niveaux ---------- */
test('étoiles : pas de gain répété en cliquant plusieurs fois', () => {
  const stats = { totalCompleted: 0 }; const t = createTask(valid());
  eq(toggleDone(t, stats).rewarded, true); toggleDone(t, stats); eq(toggleDone(t, stats).rewarded, false); toggleDone(t, stats); toggleDone(t, stats);
  eq(stats.totalCompleted, 1);
});
test('niveaux : seuils et progression', () => {
  eq(getLevel(0), 1); eq(getLevel(4), 1); eq(getLevel(5), 2); eq(getLevel(24), 5); eq(getLevel(25), 6); eq(getLevel(9999), 6); eq(getLevel(-3), 1);
  eq(getNextLevel(0), 2); eq(getNextLevel(25), null);
  eq(getLevelProgress(7), { level: 2, into: 2, need: 3, pct: 40, max: false }); eq(getLevelProgress(30).max, true);
});
test('tri : non terminées d\'abord, puis heure, puis priorité', () => {
  const a = createTask(valid({ title: 'a', time: '18:00' })), b = createTask(valid({ title: 'b', time: '08:00' })), c = createTask(valid({ title: 'c', priority: 'urgent' }));
  eq([a, b, c].sort(compareTasks).map(t => t.title), ['b', 'a', 'c']);
});

/* ---------- Machine d'état des rappels ---------- */
const now0 = at(2026, 9, 19, 12, 0);
test('rappel personnalisé : 90 minutes avant -> scheduled', () => {
  const t = createTask(valid({ date: '2026-09-25', time: '18:00', reminderMode: 'custom', customMinutesBefore: 90 }), now0);
  eq(t.reminder.scheduledAt, at(2026, 9, 25, 16, 30)); eq(t.reminder.status, 'scheduled');
});
test('rappel : futur -> scheduled', () => { const t = createTask(valid({ date: '2026-09-25' }), now0); eq(t.reminder.status, 'scheduled'); eq(t.reminder.scheduledAt, at(2026, 9, 24, 0, 0)); ok(t.reminder.notificationId.includes(t.id)); });
test('rappel : passé -> cancelled (jamais programmé dans le passé)', () => eq(createTask(valid({ date: '2026-09-19' }), now0).reminder.status, 'cancelled'));
test('rappel : désactivé -> cancelled', () => eq(createTask(valid({ date: '2026-09-25', reminderEnabled: false }), now0).reminder.status, 'cancelled'));
test('rappel : terminer annule, rouvrir reprogramme', () => {
  const stats = { totalCompleted: 0 }; const t = createTask(valid({ date: '2026-09-25' }), now0);
  toggleDone(t, stats, now0); eq(t.reminder.status, 'cancelled');
  toggleDone(t, stats, now0); eq(t.reminder.status, 'scheduled');
});
test('rappel : modifier la date reprogramme', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0); const old = t.reminder.notificationId;
  applyEdit(t, valid({ date: '2026-10-05' }), now0);
  eq(t.reminder.status, 'scheduled'); eq(t.reminder.scheduledAt, at(2026, 10, 4, 0, 0)); ok(t.reminder.notificationId !== old);
});
test('rappel : échéance dans la tolérance -> due, puis delivered seulement après affichage réussi', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0); const due = t.reminder.scheduledAt;
  const r1 = processDueReminders([t], due + 60000, '2026-09-24');
  eq(r1.due.length, 1); eq(t.reminder.status, 'scheduled', 'dû n\'est pas livré');
  markDelivery(t, { system: true, inApp: false });
  eq(t.reminder.status, 'delivered'); eq(t.reminder.delivery, { attempted: true, delivered: true, failed: false });
  eq(processDueReminders([t], due + 120000, '2026-09-24').due.length, 0, 'une seule livraison');
});
test('livraison : appli visible sans permission -> le message dans l\'appli compte', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0);
  markDelivery(t, { system: false, inApp: true }); eq(t.reminder.status, 'delivered');
});
test('livraison : aucun canal disponible -> non livré (missed, failed)', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0);
  markDelivery(t, { system: false, inApp: false });
  eq(t.reminder.status, 'missed'); eq(t.reminder.delivery, { attempted: true, delivered: false, failed: true });
});
test('livraison : reprogrammer remet le suivi de livraison à zéro', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0); markDelivery(t, { system: true });
  applyEdit(t, valid({ date: '2026-10-05' }), now0);
  eq(t.reminder.status, 'scheduled'); eq(t.reminder.delivery, { attempted: false, delivered: false, failed: false });
});
test('P2 : dû, appli cachée et aucun canal -> reste scheduled (différé), livré au retour dans la tolérance', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0); const due = t.reminder.scheduledAt;
  eq(processDueReminders([t], due + 30000, '2026-09-24').due.length, 1);
  eq(settleDelivery(t, { system: false, visible: false }), 'deferred'); eq(t.reminder.status, 'scheduled');
  eq(t.reminder.delivery, { attempted: true, delivered: false, failed: false });
  const again = processDueReminders([t], due + 60000, '2026-09-24'); eq(again.due.length, 1, 'toujours dû');
  eq(settleDelivery(t, { system: false, visible: true }), 'delivered'); eq(t.reminder.status, 'delivered');
});
test('P2 : notification système réussie même appli cachée -> livré', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0);
  eq(settleDelivery(t, { system: true, visible: false }), 'delivered'); eq(t.reminder.delivery.delivered, true);
});
test('tolérance : règle identique partout (limite incluse, au-delà manqué)', () => {
  const mk = () => createTask(valid({ date: '2026-09-25' }), now0);
  const t0 = mk(), due = t0.reminder.scheduledAt;
  eq(processDueReminders([t0], due, '').due.length, 1, 'à l\'heure');
  eq(processDueReminders([mk()], due + 60000, '').due.length, 1, '+1 min');
  eq(processDueReminders([mk()], due + 9 * 60000, '').due.length, 1, '+9 min');
  eq(processDueReminders([mk()], due + GRACE_MS, '').due.length, 1, 'limite exacte');
  const late = mk(); const r = processDueReminders([late], due + GRACE_MS + 1, ''); eq(r.due.length, 0); eq(r.missed.length, 1); eq(late.reminder.status, 'missed');
});
test('rappel : appli ouverte trop tard -> missed (jamais tenté)', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0); const due = t.reminder.scheduledAt;
  const r = processDueReminders([t], due + 3 * 3600000, '2026-09-24');
  eq(r.missed.length, 1); eq(t.reminder.status, 'missed'); eq(r.due.length, 0); eq(t.reminder.delivery.attempted, false); eq(t.reminder.delivery.failed, true);
});
test('rappel : tâche déjà passée -> annulée sans bruit', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0);
  const r = processDueReminders([t], at(2026, 10, 30), '2026-10-30'); eq(r.missed.length + r.due.length, 0); eq(t.reminder.status, 'cancelled');
});
test('rappel : tâche terminée entre-temps -> aucune notification', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0); t.done = true;
  eq(processDueReminders([t], t.reminder.scheduledAt + 1000, '2026-09-24').due.length, 0); eq(t.reminder.status, 'cancelled');
});
test('rappel : nextDueAt = la prochaine échéance (futur) ou la fin de tolérance (dû en attente)', () => {
  const a = createTask(valid({ date: '2026-09-25' }), now0), b = createTask(valid({ date: '2026-09-22' }), now0);
  eq(nextDueAt([a, b], now0), b.reminder.scheduledAt); eq(nextDueAt([], now0), null);
  eq(nextDueAt([b], b.reminder.scheduledAt + 60000), b.reminder.scheduledAt + GRACE_MS + 1, 'dû en attente : pas de boucle de minuteur');
  markDelivery(b, { system: true }); eq(nextDueAt([b], now0), null);
});
test('rappel : planReminder conserve missed tant que rien ne change', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0); t.reminder.status = 'missed'; planReminder(t, now0 + 999999999); eq(t.reminder.status, 'missed');
});

/* ---------- Statistiques ---------- */
test('semaine : total, terminées, pourcentage, matière la plus active', () => {
  const list = [createTask(valid({ date: '2026-09-15', subject: 'algebre' })), createTask(valid({ date: '2026-09-16', subject: 'algebre' })), createTask(valid({ date: '2026-09-17', subject: 'anglais' })), createTask(valid({ date: '2026-09-30' }))];
  list[0].done = true; list[1].done = true; list[2].done = true;
  state.db = { ...defaultDB(), tasks: list }; reindex();
  const w = weekStats(tasksOn, '2026-09-19', 1);
  eq(w.total, 3); eq(w.done, 3); eq(w.pct, 100); eq(w.top, 'algebre');
});
test('série : jours consécutifs', () => {
  const mk = day => { const t = createTask(valid()); t.done = true; t.completedAt = new Date(`${day}T10:00:00`).getTime(); return t; };
  eq(computeStreak([mk('2026-09-19'), mk('2026-09-18'), mk('2026-09-17')], '2026-09-19'), 3);
  eq(computeStreak([mk('2026-09-18'), mk('2026-09-17')], '2026-09-19'), 2);
  eq(computeStreak([mk('2026-09-15')], '2026-09-19'), 0); eq(computeStreak([], '2026-09-19'), 0);
});
test('récompenses : seuils', () => {
  eq(getRewards({ totalCompleted: 10 }, 3).map(r => r.unlocked), [true, true, true, false]);
  eq(getRewards({ totalCompleted: 0 }, 0).map(r => r.unlocked), [false, false, false, false]);
});

/* ---------- Migration, import, export ---------- */
test('migration : v1 -> v2 (étoiles, matières, types, rappels)', () => {
  const old = { stars: 12, tasks: [
    { id: 'x1', date: '2026-11-15', type: 'lecon', subject: 'fr', title: 'Poème', note: 'n', remind: 'eve18', done: true, notified: true },
    { id: 'x2', date: '2026-11-16', type: 'controle', subject: 'sci', title: 'Contrôle', remind: 'none', done: false },
    { date: '2026-11-17', title: '' }] };
  const db = migrateDatabase(old);
  eq(db.version, 2); eq(db.stats.totalCompleted, 12); eq(db.tasks.length, 2);
  eq([db.tasks[0].subject, db.tasks[0].type, db.tasks[0].reminder.mode, db.tasks[0].reminder.enabled, db.tasks[0].completionRewarded], ['francais', 'lesson', 'eve18', true, true]);
  eq(db.tasks[1].reminder.enabled, false);
});
test('import : JSON vide, invalide, incomplet, sans tâche valide', () => {
  eq(parseImport('').ok, false); eq(parseImport('{pas du json').ok, false); eq(parseImport('{}').ok, false); eq(parseImport('[]').ok, false);
  eq(parseImport('{"app":"Autre app","tasks":[]}').ok, false);
  eq(parseImport(JSON.stringify({ version: 2, tasks: [{ title: '', date: 'x' }] })).error, 'empty');
});
test('import : fichier exporté puis réimporté à l\'identique', () => {
  const db = defaultDB(); db.tasks = [createTask(valid({ title: 'A' }), now0), createTask(valid({ title: 'B', date: '2026-10-01' }), now0)]; db.stats.totalCompleted = 4; db.calendarEvents = [{ date: '2026-10-01', type: 'exam', subject: 'algebre', note: 'chapitre 4' }];
  const r = parseImport(exportData(db));
  ok(r.ok); eq(r.db.tasks.map(t => t.title), ['A', 'B']); eq(r.db.stats.totalCompleted, 4); eq(r.db.calendarEvents, db.calendarEvents); eq(r.dropped, 0);
});
test('import : ancien fichier v1 accepté', () => {
  const r = parseImport(JSON.stringify({ stars: 3, tasks: [{ id: 'a', date: '2026-11-15', type: 'devoir', subject: 'algebre', title: 'T', remind: 'eve0', done: false }] }));
  ok(r.ok); eq(r.db.stats.totalCompleted, 3); eq(r.db.tasks[0].type, 'homework');
});
test('import : tâches invalides ignorées mais comptées', () => {
  const r = parseImport(JSON.stringify({ version: 2, tasks: [{ title: 'ok', date: '2026-01-01' }, { title: '', date: '2026-01-01' }] }));
  ok(r.ok); eq(r.db.tasks.length, 1); eq(r.dropped, 1);
});

/* ---------- Non-régression : défauts trouvés par les simulations ---------- */
test('CRLF : une note de 400 caractères avec retours à la ligne reste acceptée, sans \\r', () => {
  const note = 'a\nb\n'.repeat(100), r = validateTask(valid({ note: note.replace(/\n/g, '\r\n') }));
  ok(r.ok, 'refusée'); ok(!r.value.note.includes('\r')); eq(r.value.note.length, 399, 'espace final rogné');
});
test('rappel manqué : terminer la tâche l\'annule', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0); t.reminder.status = 'missed';
  toggleDone(t, { totalCompleted: 0 }, now0); eq(t.reminder.status, 'cancelled');
});
test('rappel manqué : périmé quand le jour de la tâche est passé (rangé au prochain passage)', () => {
  const t = createTask(valid({ date: '2026-09-25' }), now0); t.reminder.status = 'missed';
  processDueReminders([t], at(2026, 9, 25, 12), '2026-09-25'); eq(t.reminder.status, 'missed', 'le jour même : toujours utile');
  processDueReminders([t], at(2026, 9, 26, 12), '2026-09-26'); eq(t.reminder.status, 'cancelled');
});
test('import : un fichier sans champ version garde matières et types v2', () => {
  const db = defaultDB(); db.tasks = [normalizeTask({ title: 'A', date: '2026-11-15', subject: 'francais', type: 'exam' })];
  const f = JSON.parse(exportData(db)); delete f.version; const r = parseImport(JSON.stringify(f));
  ok(r.ok); eq([r.db.tasks[0].subject, r.db.tasks[0].type], ['francais', 'exam']);
});
test('import : un fichier d\'une version plus récente est refusé', () => {
  const f = JSON.parse(exportData(defaultDB())); f.version = 3; eq(parseImport(JSON.stringify(f)), { ok: false, error: 'future' });
});
test('import : les tâches au-delà de la limite sont comptées comme ignorées', () => {
  const r = validateDatabase({ tasks: Array.from({ length: 50005 }, (_, i) => ({ id: 'x' + i, title: 't', date: '2026-01-01' })) });
  eq(r.db.tasks.length, 50000); eq(r.dropped, 5);
});

/* ---------- Stockage (Node : localStorage factice) ---------- */
const stub = () => (globalThis.localStorage && globalThis.localStorage.__stub ? globalThis.localStorage : null);
test('P1 : base corrompue chargée 3 fois -> une seule copie de récupération (Node)', () => {
  const ls = stub(); if (!ls) return; ls.clear();
  ls.setItem(KEY, '{corrompu');
  for (let i = 0; i < 3; i++) eq(load().status, 'corrupt');
  eq(ls.keys().filter(k => k.includes('corrupt')), [CORRUPT_KEY]); eq(ls.getItem(CORRUPT_KEY), '{corrompu');
});
test('P1 : anciennes copies horodatées nettoyées, la plus récente conservée (Node)', () => {
  const ls = stub(); if (!ls) return; ls.clear();
  ls.setItem('agenda-etoile-v2-corrupt-1000', 'vieux'); ls.setItem('agenda-etoile-v2-corrupt-2000', 'recent'); ls.setItem('agenda-etoile-v2-corrupt-3', 'tresvieux');
  ls.setItem(KEY, JSON.stringify(defaultDB()));
  eq(load().status, 'ok');
  eq(ls.keys().filter(k => k.includes('corrupt')), [CORRUPT_KEY]); eq(ls.getItem(CORRUPT_KEY), 'recent');
});
test('P3 : stockage plein -> tryReplaceDB refuse et conserve les données actuelles (Node)', () => {
  const ls = stub(); if (!ls) return; ls.clear();
  const cur = defaultDB(); cur.tasks = [createTask(valid({ title: 'garde-moi' }), now0)]; state.db = cur; state.status = 'ok'; state.saveOk = true;
  const big = defaultDB(); big.tasks = Array.from({ length: 200 }, (_, i) => createTask(valid({ title: 'Tâche ' + i }), now0));
  ls.maxChars = 500;
  const r = tryReplaceDB(big);
  eq(r.ok, false); ok(state.db === cur, 'base en mémoire inchangée'); eq(state.saveOk, true, 'pas de faux bandeau : le stockage reste cohérent');
  ls.maxChars = Infinity;
  const r2 = tryReplaceDB(big); eq(r2.ok, true); eq(r2.persisted, true); eq(state.db.tasks.length, 200);
});

test('onglets multiples : un autre onglet écrit -> on recharge ses données (Node)', () => {
  const ls = stub(); if (!ls) return; ls.clear();
  const mine = defaultDB(); mine.tasks = [createTask(valid({ title: 'À moi' }), now0)]; state.db = mine; state.status = 'ok'; reindex();
  const other = defaultDB(); other.tasks = [createTask(valid({ title: 'À moi' }), now0), createTask(valid({ title: 'Ajoutée ailleurs' }), now0)];
  ls.setItem(KEY, JSON.stringify(other));
  ok(syncFromStorage()); eq(state.db.tasks.length, 2); eq(tasksOn('2026-11-15').length, 2, 'index à jour');
  ls.setItem(KEY, '{corrompu'); eq(syncFromStorage(), false, 'écriture corrompue ailleurs : on garde nos données'); eq(state.db.tasks.length, 2);
});

/* ---------- Cas extrêmes et performance ---------- */
for (const n of [0, 1, 100, 1000, 10000]) {
  test(`volume : ${n} tâche(s) — validation, index, semaine`, () => {
    const t0 = Date.now(); const raw = [];
    for (let i = 0; i < n; i++) raw.push({ id: 't' + i, title: 'Tâche ' + i, date: U.addDays('2026-01-01', i % 365), subject: 'algebre' });
    const r = validateDatabase({ tasks: raw }); eq(r.db.tasks.length, n);
    state.db = r.db; reindex(); weekStats(tasksOn, '2026-06-10', 1);
    ok(Date.now() - t0 < 3000, `trop lent : ${Date.now() - t0} ms`);
  });
}
test('textes : les fonctions de S répondent au singulier et au pluriel', () => {
  ok(S.today.summary(1, 0, 1).includes('1 tâche ')); ok(S.today.summary(3, 1, 2).includes('3 tâches')); eq(S.day.count(0), 'Aucune tâche');
});

export async function runAll(report) {
  let pass = 0, fail = 0;
  for (const t of tests) {
    try { await t.fn(); pass++; report(true, t.name); } catch (e) { fail++; report(false, t.name, e.message); }
  }
  return { pass, fail, total: tests.length };
}

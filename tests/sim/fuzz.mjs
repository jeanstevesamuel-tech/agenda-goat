// Données hostiles : tout ce qui peut entrer (stockage corrompu, import, formulaire) ne doit jamais faire planter ni produire d'état invalide.
import { makeStub } from '../stub.mjs';
const { validateTask, normalizeTask, validateDatabase, defaultDB } = await import('../../js/validation.js');
const { load, parseImport, migrateDatabase, exportData, KEY } = await import('../../js/storage.js');
const { createTask } = await import('../../js/tasks.js');
const { isValidDate, isValidTime } = await import('../../js/utils.js');
const { SUBJECTS, TYPES, PRIORITIES, MODES, RSTATUS, LIMITS } = await import('../../js/constants.js');

const rng = seed => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const R = rng(20260920), ri = (a, b) => a + Math.floor(R() * (b - a + 1)), pick = a => a[Math.floor(R() * a.length)];
let checks = 0; const failures = [];
const check = (c, m) => { checks++; if (!c) { failures.push(m); if (failures.length > 20) throw new Error('trop d\'échecs'); } };

const junkValues = () => [undefined, null, true, false, 0, -1, 1e308, -0, NaN, Infinity, -Infinity, '', ' ', 'x', 'é'.repeat(500), '\u0000', '\ud800', '<script>', '__proto__', 'constructor', [], [1, 2], {}, { a: 1 }, () => 1, Symbol('s'), 10n ** 20n, new Date(0), /re/, '2026-02-30', '2026-13-01', '9999-01-01', '0000-00-00', '2026-1-1', ' 2026-01-01', '2026-01-01T00:00:00Z', '25:61', '-1:00'];
const junk = () => pick(junkValues());
function validTaskShape(t, where) {
  check(typeof t.id === 'string' && t.id.length > 0 && t.id.length <= 64, `${where}: id invalide`);
  check(typeof t.title === 'string' && t.title.length >= 1 && t.title.length <= LIMITS.title && t.title === t.title.trim(), `${where}: titre invalide`);
  check(typeof t.note === 'string' && t.note.length <= LIMITS.note, `${where}: note invalide`);
  check(SUBJECTS.includes(t.subject) && TYPES.includes(t.type) && PRIORITIES.includes(t.priority), `${where}: énumération invalide`);
  check(isValidDate(t.date), `${where}: date invalide ${t.date}`); check(t.time === '' || isValidTime(t.time), `${where}: heure invalide`);
  check(typeof t.done === 'boolean' && typeof t.completionRewarded === 'boolean', `${where}: booléens invalides`);
  check(t.completedAt === null || (Number.isInteger(t.completedAt) && t.completedAt > 0), `${where}: completedAt invalide`);
  check(!t.done || true, ''); check(t.done || t.completedAt === null, `${where}: completedAt sur tâche non terminée`);
  const r = t.reminder; check(r && typeof r.enabled === 'boolean' && MODES.includes(r.mode) && RSTATUS.includes(r.status), `${where}: rappel invalide`);
  check(r.scheduledAt === null || Number.isFinite(r.scheduledAt), `${where}: scheduledAt invalide`); check(r.notificationId === null || typeof r.notificationId === 'string', `${where}: notificationId invalide`);
  check(['attempted', 'delivered', 'failed'].every(k => typeof r.delivery[k] === 'boolean'), `${where}: delivery invalide`);
  check(Number.isInteger(t.createdAt) && t.createdAt > 0 && Number.isInteger(t.updatedAt) && t.updatedAt > 0, `${where}: horodatages invalides`);
}
const validDBShape = (db, where) => {
  check(db.version === 2 && Array.isArray(db.tasks), `${where}: structure`);
  check(Number.isInteger(db.stats.totalCompleted) && db.stats.totalCompleted >= 0 && db.stats.totalCompleted <= LIMITS.maxStars, `${where}: étoiles`);
  check(['system', 'light', 'dark'].includes(db.settings.theme) && [0, 1].includes(db.settings.firstDayOfWeek), `${where}: réglages`);
  check(new Set(db.tasks.map(t => t.id)).size === db.tasks.length, `${where}: ids dupliqués`); db.tasks.forEach((t, i) => validTaskShape(t, `${where}#${i}`));
};

// 1) normalizeTask / validateTask avec des valeurs absurdes sur chaque champ
for (let i = 0; i < 20000; i++) {
  const o = {}; for (const k of ['id', 'title', 'note', 'subject', 'type', 'date', 'time', 'done', 'priority', 'completionRewarded', 'completedAt', 'createdAt', 'updatedAt']) if (R() < .8) o[k] = R() < .4 ? junk() : pick({ id: ['a', 't1'], title: ['Titre', 'x'.repeat(200)], note: ['n', 'y'.repeat(900)], subject: SUBJECTS, type: TYPES, date: ['2026-09-19', '2028-02-29'], time: ['', '18:00'], done: [true, false], priority: PRIORITIES, completionRewarded: [true, false], completedAt: [1, 1e12], createdAt: [1e12], updatedAt: [1e12] }[k]);
  if (R() < .7) o.reminder = R() < .3 ? junk() : { enabled: junk(), mode: pick([...MODES, junk()]), scheduledAt: junk(), status: pick([...RSTATUS, junk()]), notificationId: junk(), delivery: R() < .5 ? junk() : { attempted: junk(), delivered: junk(), failed: junk() } };
  let n; try { n = normalizeTask(o); } catch (e) { check(false, `normalizeTask a levé ${e.message} pour ${JSON.stringify(o)?.slice(0, 120)}`); continue; }
  if (n) { validTaskShape(n, 'normalizeTask'); try { check(JSON.stringify(normalizeTask(JSON.parse(JSON.stringify(n)))) === JSON.stringify(normalizeTask(n)), 'normalisation non idempotente'); } catch (e) { check(false, e.message); } }
  try { const v = validateTask({ title: junk(), note: junk(), subject: junk(), type: junk(), date: junk(), time: junk(), priority: junk(), reminderEnabled: junk(), reminderMode: junk() }); check(typeof v.ok === 'boolean', 'validateTask sans booléen'); } catch (e) { check(false, `validateTask a levé : ${e.message}`); }
}
// 2) bases entières
for (let i = 0; i < 3000; i++) {
  const raw = R() < .3 ? junk() : { version: junk(), tasks: R() < .8 ? Array.from({ length: ri(0, 6) }, () => (R() < .5 ? junk() : { id: pick(['a', 'a', 'b', junk()]), title: pick(['x', junk()]), date: pick(['2026-01-01', junk()]) })) : junk(), settings: R() < .5 ? junk() : { theme: junk(), notifications: junk(), sound: junk(), firstDayOfWeek: junk(), onboarded: junk() }, stats: R() < .5 ? junk() : { totalCompleted: junk() } };
  try { const v = validateDatabase(raw); if (v.ok) validDBShape(v.db, 'validateDatabase'); } catch (e) { check(false, `validateDatabase a levé : ${e.message}`); }
  try { const m = migrateDatabase(raw); if (m) validDBShape(m, 'migrateDatabase'); } catch (e) { check(false, `migrateDatabase a levé : ${e.message}`); }
}
// 3) texte JSON mutilé : parseImport et load ne lèvent jamais
const goodDb = defaultDB(); goodDb.tasks = Array.from({ length: 8 }, (_, i) => createTask({ title: 'Tâche ' + i, note: 'n', subject: 'algebre', type: 'homework', date: '2026-10-0' + (1 + i), time: i % 2 ? '18:00' : '', priority: 'normal', reminderEnabled: true, reminderMode: i % 2 ? 'hour1' : 'eve0' }, 1.7e12)); goodDb.stats.totalCompleted = 5;
const goodJson = exportData(goodDb);
const mutate = s => { const a = s.split(''); const kind = ri(0, 5); const p = ri(0, a.length - 1);
  if (kind === 0) a.splice(p, ri(1, 40)); else if (kind === 1) a[p] = pick(['{', '}', '[', ']', '"', ',', ':', '\\', '\u0000', 'é', '💥']); else if (kind === 2) a.splice(p, 0, ...pick(['null', '[]', '{}', '"x"', '1e999', '-0', 'NaN', 'true']).split('')); else if (kind === 3) return a.slice(0, p).join(''); else if (kind === 4) { const q = ri(0, a.length - 1); [a[p], a[q]] = [a[q], a[p]]; } else return s.replace(/"(title|date|id|tasks|version)"/, '"$1x"'); return a.join(''); };
for (let i = 0; i < 6000; i++) {
  let s = goodJson; for (let k = ri(1, 4); k > 0; k--) s = mutate(s);
  try { const r = parseImport(s); check(r.ok === true || r.ok === false, 'parseImport sans verdict'); if (r.ok) validDBShape(r.db, 'parseImport'); } catch (e) { check(false, `parseImport a levé : ${e.message}`); }
  globalThis.localStorage = makeStub(); globalThis.localStorage.setItem(KEY, s);
  try { const r = load(); check(['ok', 'corrupt', 'fresh', 'migrated'].includes(r.status), `load : statut ${r.status}`); validDBShape(r.db, 'load'); } catch (e) { check(false, `load a levé : ${e.message}`); }
}
for (const s of ['', ' ', 'null', 'true', '0', '[]', '{}', '"x"', '{"tasks":null}', '{"tasks":{}}', '{"version":2}', '{"version":2,"tasks":[]}', '[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[[', '{"a":'.repeat(3000)]) {
  try { const r = parseImport(s); check(r.ok === false || (r.ok && validDBShape(r.db, 'parseImport(cas limite)') === undefined), `« ${s.slice(0, 20)} » mal géré`); } catch (e) { check(false, `parseImport(${s.slice(0, 20)}) a levé : ${e.message}`); }
}
// 4) pollution de prototype
for (const s of ['{"__proto__":{"polluted":1},"tasks":[]}', '{"version":2,"tasks":[{"__proto__":{"polluted":2},"title":"x","date":"2026-01-01"}],"settings":{"__proto__":{"polluted":3}},"stats":{"__proto__":{"polluted":4}}}', '{"tasks":[{"constructor":{"prototype":{"polluted":5}},"title":"x","date":"2026-01-01"}]}']) { parseImport(s); check(({}).polluted === undefined && Object.prototype.polluted === undefined, 'pollution de prototype'); }
// 5) volume
const many = { version: 2, tasks: Array.from({ length: 60000 }, (_, i) => ({ id: 'v' + i, title: 't' + i, date: '2026-01-01' })) }; const big = validateDatabase(many); check(big.db.tasks.length === LIMITS.maxTasks, 'plafond de 50000 tâches non appliqué');

console.log(`Données hostiles : ${checks} vérifications`);
if (failures.length) { console.log(`${failures.length} ÉCHEC(S) :`); [...new Set(failures)].slice(0, 15).forEach(f => console.log(' - ' + f)); process.exit(1); }
console.log('Aucun échec.');

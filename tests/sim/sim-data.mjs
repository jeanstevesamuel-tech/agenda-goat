// Fuzz des données : formulaires, base, import, migration, restauration de sauvegarde. Rien ne doit jamais lever d'exception,
// et tout ce qui sort doit être valide et stable (idempotent).
import { makeStub } from '../stub.mjs';
globalThis.localStorage = makeStub();
const V = await import('../../js/validation.js');
const S = await import('../../js/storage.js');
const U = await import('../../js/utils.js');
const C = await import('../../js/constants.js');

const findings = new Map();
const flag = (t, m) => { const f = findings.get(t) || { n: 0, first: m }; f.n++; findings.set(t, f); };
let seed = 7; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const long = n => 'é'.repeat(n);
const junk = () => pick([null, undefined, NaN, Infinity, -Infinity, -1, 0, 1, 1e308, -1e308, 2 ** 53, '', ' ', '   ', 'x', long(1000), long(80), long(81), '\u0000', '\u202e', '\ud83d', '😀'.repeat(50),
  [], {}, [1, 2], { a: 1 }, true, false, '__proto__', 'constructor', '2026-02-30', '2026-99-99', '0000-00-00', '9999-12-31', '2026-1-1', '<script>alert(1)</script>', '../../etc', 'NaN', '18:00', '25:99', () => 1, Symbol('x')]);
const good = { title: 'Exercices', note: 'ok', subject: 'algebre', type: 'homework', date: '2026-11-15', time: '18:00', priority: 'normal', reminderEnabled: true, reminderMode: 'eve0' };

// 1) validateTask : jamais d'exception ; si ok, les contraintes tiennent
for (let i = 0; i < 20000; i++) {
  const inp = { ...good };
  for (const k of Object.keys(inp)) if (rnd() < .3) inp[k] = junk();
  let r; try { r = V.validateTask(rnd() < .02 ? junk() : inp); } catch (e) { flag('validateTask-exception', String(e)); continue; }
  if (r.ok) {
    const v = r.value;
    if (!(v.title.length >= 1 && v.title.length <= C.LIMITS.title)) flag('validateTask-titre-hors-limites', v.title.length);
    if (v.note.length > C.LIMITS.note) flag('validateTask-note-hors-limites', v.note.length);
    if (!U.isValidDate(v.date)) flag('validateTask-date-invalide-acceptée', v.date);
    if (v.time !== '' && !U.isValidTime(v.time)) flag('validateTask-heure-invalide-acceptée', v.time);
    if (v.reminderEnabled && v.reminderMode === 'hour1' && !v.time) flag('validateTask-hour1-sans-heure', '');
    if (v.title !== v.title.trim()) flag('validateTask-titre-non-rogné', JSON.stringify(v.title));
  }
}
// 1b) fins de ligne : un navigateur peut renvoyer les retours à la ligne d'un textarea en CRLF
{
  const note = 'a\nb\n'.repeat(100);                 // 400 caractères avec des \n (autorisé par maxlength)
  const asCRLF = note.replace(/\n/g, '\r\n');        // vu par validateTask : 600 caractères
  if (!V.validateTask({ ...good, note }).ok) flag('note-400-avec-\\n-refusée', 'LF');
  if (!V.validateTask({ ...good, note: asCRLF }).ok) flag('note-400-refusée-quand-le-navigateur-renvoie-CRLF', 'une note de 400 caractères avec retours à la ligne est refusée : « trop longue » alors que le champ l\'acceptait');
  const r = V.validateTask({ ...good, note: asCRLF });
  if (r.ok && r.value.note.includes('\r')) flag('note-contient-CR', 'les \\r sont conservés dans les données');
}

// 2) normalizeTask / validateDatabase : structures aléatoires
const junkTask = () => { const t = { id: pick([`t${Math.floor(rnd() * 5)}`, junk()]), title: junk(), date: pick(['2026-11-15', junk()]), subject: junk(), type: junk(), time: junk(), note: junk(), done: junk(), priority: junk(), completionRewarded: junk(), completedAt: junk(), createdAt: junk(), updatedAt: junk(), reminder: pick([junk(), { enabled: junk(), mode: junk(), scheduledAt: junk(), status: junk(), notificationId: junk(), delivery: junk() }]) }; for (const k of Object.keys(t)) if (rnd() < .15) delete t[k]; return t; };
const validTask = t => t.title.length >= 1 && t.title.length <= 80 && U.isValidDate(t.date) && C.SUBJECTS.includes(t.subject) && C.TYPES.includes(t.type) && C.PRIORITIES.includes(t.priority)
  && (t.time === '' || U.isValidTime(t.time)) && t.note.length <= 400 && typeof t.done === 'boolean' && C.RSTATUS.includes(t.reminder.status) && C.MODES.includes(t.reminder.mode)
  && typeof t.reminder.enabled === 'boolean' && (t.reminder.scheduledAt === null || Number.isFinite(t.reminder.scheduledAt)) && typeof t.id === 'string' && t.id.length > 0 && Number.isFinite(t.createdAt);
for (let i = 0; i < 4000; i++) {
  const raw = rnd() < .05 ? junk() : { version: pick([2, 1, 3, junk()]), tasks: rnd() < .05 ? junk() : Array.from({ length: Math.floor(rnd() * 8) }, () => (rnd() < .1 ? junk() : junkTask())), settings: pick([junk(), { theme: junk(), notifications: junk(), sound: junk(), firstDayOfWeek: junk(), onboarded: junk() }]), stats: pick([junk(), { totalCompleted: junk() }]) };
  let r; try { r = V.validateDatabase(raw); } catch (e) { flag('validateDatabase-exception', String(e).slice(0, 120)); continue; }
  if (!r.ok) continue;
  const db = r.db, ids = new Set();
  for (const t of db.tasks) {
    if (!validTask(t)) flag('tâche-normalisée-invalide', JSON.stringify(t).slice(0, 200));
    if (ids.has(t.id)) flag('ids-dupliqués', t.id); ids.add(t.id);
    if (t.done && t.completedAt !== null && !Number.isFinite(t.completedAt)) flag('completedAt-invalide', String(t.completedAt));
    if (!t.done && t.completedAt !== null) flag('completedAt-sur-tâche-non-terminée', '');
    if (t.reminder.status === 'scheduled' && (t.reminder.scheduledAt === null || !t.reminder.enabled)) flag('base-importée-scheduled-incohérent', JSON.stringify(t.reminder));
  }
  if (!(db.stats.totalCompleted >= 0 && db.stats.totalCompleted <= C.LIMITS.maxStars && Number.isInteger(db.stats.totalCompleted))) flag('étoiles-hors-limites', String(db.stats.totalCompleted));
  const again = V.validateDatabase(JSON.parse(JSON.stringify(db)));
  if (JSON.stringify(again.db) !== JSON.stringify(db)) flag('validateDatabase-non-idempotent', '');
}

// 3) parseImport : chaînes aléatoires, JSON tronqué, fichiers d'une autre version
const goodExport = S.exportData({ ...V.defaultDB(), tasks: [V.normalizeTask({ title: 'A', date: '2026-11-15', subject: 'francais', type: 'exam', reminder: { enabled: true, mode: 'eve18' } })] });
const mutate = s => { const i = Math.floor(rnd() * s.length); return pick([s.slice(0, i), s.slice(i), s.slice(0, i) + String(junk()) + s.slice(i + 1), s.replace(/"/g, "'"), s.replace('"tasks"', '"task"')]); };
for (let i = 0; i < 6000; i++) {
  const txt = rnd() < .3 ? String(junk()) : mutate(goodExport);
  try { const r = S.parseImport(txt); if (r.ok && !r.db.tasks.every(validTask)) flag('import-accepte-des-tâches-invalides', txt.slice(0, 80)); } catch (e) { flag('parseImport-exception', String(e).slice(0, 120)); }
}
// 3b) un export v2 doit se réimporter à l'identique ; un fichier d'une version future ne doit pas être lu comme une v1
{
  const r = S.parseImport(goodExport);
  if (!r.ok || r.db.tasks[0].subject !== 'francais' || r.db.tasks[0].type !== 'exam') flag('export-v2-réimporté-altéré', JSON.stringify(r.db?.tasks?.[0]));
  const noVersion = JSON.parse(goodExport); delete noVersion.version;
  const r2 = S.parseImport(JSON.stringify(noVersion));
  if (r2.ok && (r2.db.tasks[0].subject !== 'francais' || r2.db.tasks[0].type !== 'exam')) flag('import-sans-version-écrase-matière-et-type', `matière ${r2.db.tasks[0].subject}, type ${r2.db.tasks[0].type} au lieu de francais/exam`);
  const future = JSON.parse(goodExport); future.version = 3; future.tasks[0].newField = 'x';
  const r3 = S.parseImport(JSON.stringify(future));
  if (r3.ok) flag('fichier-version-future-accepté-sans-avertissement', `matière ${r3.db.tasks[0].subject}`);
  const many = JSON.parse(goodExport); many.tasks = Array.from({ length: C.LIMITS.maxTasks + 5 }, (_, i) => ({ id: 'x' + i, title: 't', date: '2026-01-01' }));
  const r4 = S.parseImport(JSON.stringify(many));
  if (r4.ok && r4.dropped === 0) flag('import-tronqué-sans-le-dire', `${r4.db.tasks.length} tâches gardées sur ${many.tasks.length}, ignorées : ${r4.dropped}`);
}

// 4) load() : contenus de stockage aberrants, jamais d'exception ni d'écran blanc
for (let i = 0; i < 1500; i++) {
  localStorage.clear();
  const v = pick([goodExport, mutate(goodExport), String(junk()), '', 'null', '[]', '{}', '{"tasks":{}}', '{"version":2,"tasks":[null,1,"x"]}']);
  localStorage.setItem(S.KEY, v);
  if (rnd() < .3) localStorage.setItem(S.OLD_KEY, mutate('{"stars":3,"tasks":[{"id":"a","date":"2026-01-01","title":"t","subject":"fr","type":"devoir"}]}'));
  try { const r = S.load(); if (!r.db || !Array.isArray(r.db.tasks)) flag('load-sans-base', ''); else if (!r.db.tasks.every(validTask)) flag('load-tâche-invalide', v.slice(0, 60)); } catch (e) { flag('load-exception', String(e).slice(0, 120)); }
}
// 4b) migration v1 : 10 000 tâches d'un ancien fichier, matières et types tous convertis
{
  const old = { stars: 9, tasks: Array.from({ length: 10000 }, (_, i) => ({ id: 'v' + i, date: U.addDays('2026-01-01', i % 300), type: ['devoir', 'lecon', 'controle', 'projet'][i % 4], subject: ['maths', 'fr', 'sci', 'hist', 'ang', 'autre'][i % 6], title: 'Titre ' + i, remind: ['eve0', 'eve18', 'same7', 'none'][i % 4], done: i % 7 === 0 })) };
  const db = S.migrateDatabase(old);
  if (db.tasks.length !== 10000) flag('migration-perd-des-tâches', String(db.tasks.length));
  if (db.tasks.some((t, i) => t.subject !== ['algebre', 'francais', 'chimie', 'histoire_art', 'anglais', 'autre'][i % 6])) flag('migration-matière-fausse', '');
  if (db.stats.totalCompleted !== 9) flag('migration-étoiles', String(db.stats.totalCompleted));
  if (db.tasks.filter(t => t.done).some(t => !t.completionRewarded)) flag('migration-récompense', '');
}

console.log(`Données : 20 000 formulaires, 4 000 bases, 6 000 imports, 1 500 stockages aberrants${findings.size ? '' : ' : aucun problème'}`);
for (const [k, f] of findings) console.log(`  ✗ ${k} : ${f.n} occurrence(s). Exemple : ${f.first}`);
process.exit(findings.size ? 1 : 0);

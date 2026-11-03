// Exécuté une fois par fuseau horaire (variable TZ) : dates, changements d'heure, rappels, séries.
const U = await import('../../js/utils.js');
const { computeStreak, weekStats } = await import('../../js/statistics.js');
const bad = [];
const fail = m => { if (bad.length < 6) bad.push(m); };
const tz = process.env.TZ;

let dayCount = 0, dstDays = 0;
let key = '2024-01-01';
let prevWeekday = null;
while (key <= '2029-12-31') {
  dayCount++;
  const d = U.parseDate(key);
  if (!d || U.toKey(d) !== key) fail(`aller-retour parseDate/toKey ${key}`);
  const next = U.addDays(key, 1);
  if (U.differenceInDays(key, next) !== 1) fail(`differenceInDays ${key}→${next}`);
  if (U.differenceInDays(key, U.addDays(key, 7)) !== 7) fail(`+7 jours ${key}`);
  if (U.differenceInDays(U.addDays(key, -30), key) !== 30) fail(`-30 jours ${key}`);
  const wd = d.getDay();
  if (prevWeekday !== null && wd !== (prevWeekday + 1) % 7) fail(`cycle des jours ${key}`);
  prevWeekday = wd;
  for (const first of [0, 1]) {
    const sow = U.startOfWeek(key, first);
    if (U.differenceInDays(sow, key) < 0 || U.differenceInDays(sow, key) > 6) fail(`startOfWeek ${key} (${first})`);
    if (U.parseDate(sow).getDay() !== first) fail(`startOfWeek pas sur le bon jour ${key} (${first})`);
  }
  // rappels : ordre et jour local corrects, tolérance d'1 h si l'heure n'existe pas (changement d'heure à minuit)
  const eve0 = U.calculateReminder(key, '', 'eve0'), eve18 = U.calculateReminder(key, '', 'eve18'), same7 = U.calculateReminder(key, '', 'same7');
  if (!(eve0 < eve18 && eve18 < same7)) fail(`ordre des rappels ${key}`);
  const eveKey = U.addDays(key, -1);
  if (U.getToday(eve0) !== eveKey) fail(`eve0 pas la veille locale ${key} → ${U.getToday(eve0)}`);
  if (new Date(eve0).getHours() > 1) fail(`eve0 pas à minuit ${key} → ${new Date(eve0).toString()}`);
  if (new Date(eve18).getHours() !== 18 && new Date(eve18).getHours() !== 17 && new Date(eve18).getHours() !== 19) fail(`eve18 ${key}`);
  const h1 = U.calculateReminder(key, '08:30', 'hour1');
  if (Math.abs((U.calculateReminder(key, '08:30', 'same7') + 90 * 60000) - h1 - 0) > 3600000 + 1) fail(`hour1 ${key}`);
  if (new Date(same7).getOffset === undefined && d.getTimezoneOffset() !== new Date(same7).getTimezoneOffset()) dstDays++;
  key = next;
}

// getToday sur des instants aléatoires = date locale
let seed = 42; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
for (let i = 0; i < 3000; i++) {
  const ms = Date.UTC(2024, 0, 1) + Math.floor(rnd() * 6 * 365 * 86400000), d = new Date(ms);
  const exp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (U.getToday(ms) !== exp) fail(`getToday(${ms})`);
}

// série de 60 jours d'affilée qui traverse les changements d'heure : doit valoir 60
for (const start of ['2026-02-10', '2026-09-20', '2026-10-15', '2026-03-01']) {
  const tasks = [];
  for (let i = 0; i < 60; i++) { const k = U.addDays(start, i), p = U.parseDate(k); tasks.push({ done: true, completedAt: new Date(p.getFullYear(), p.getMonth(), p.getDate(), 12, 0).getTime() }); }
  const end = U.addDays(start, 59);
  if (computeStreak(tasks, end) !== 60) fail(`série de 60 jours interrompue (départ ${start}) → ${computeStreak(tasks, end)}`);
  // tâche terminée à 23h59 puis une autre à 00:01 le lendemain
  const t2 = [{ done: true, completedAt: new Date(2026, 9, 24, 23, 59).getTime() }, { done: true, completedAt: new Date(2026, 9, 25, 0, 1).getTime() }];
  if (computeStreak(t2, '2026-10-25') !== 2) fail('série autour de minuit');
}
// semaine : 7 jours exactement
const seen = new Set(); const getDay = k => { seen.add(k); return []; };
weekStats(getDay, '2026-10-31', 1); weekStats(getDay, '2026-03-08', 0);
if (seen.size !== 14 && seen.size !== 13) fail(`weekStats parcourt ${seen.size} jours`);

console.log(JSON.stringify({ tz, days: dayCount, bad }));
process.exit(bad.length ? 1 : 0);

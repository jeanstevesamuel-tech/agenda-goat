// Simule le démarrage complet de l'appli (app.js) : premier lancement, mise à jour, raccourci, notification, autre onglet.
import { spawnSync } from 'node:child_process';
if (!process.env.SCENARIO) {
  let failed = 0;
  for (const sc of ['premiere-installation', 'mise-a-jour']) {
    const r = spawnSync(process.execPath, [new URL(import.meta.url).pathname], { env: { ...process.env, SCENARIO: sc }, encoding: 'utf8' });
    process.stdout.write(r.stdout); if (r.status !== 0) { failed++; process.stderr.write(r.stderr.slice(0, 600)); }
  }
  process.exit(failed ? 1 : 0);
}
const SC = process.env.SCENARIO, FIRST = SC === 'premiere-installation';
const { makeStub } = await import('../stub.mjs');
globalThis.localStorage = makeStub();
const { installShim } = await import('../shim.mjs');
const sh = installShim(); const { registry, doc, tick } = sh;
const problems = []; let checks = 0;
const expect = (c, m) => { checks++; if (!c) problems.push(m); };

const wh = {}, swh = {}; let reloads = 0, replaced = null, waitingMsg = null;
globalThis.window = { scrollTo() {}, addEventListener: (t, f) => { (wh[t] ||= []).push(f); } };
globalThis.location = { protocol: 'https:', search: '', pathname: '/agenda/', reload() { reloads++; } };
globalThis.history = { replaceState(_a, _b, u) { replaced = u; } };
const reg = { addEventListener() {}, waiting: FIRST ? null : { postMessage: m => { waitingMsg = m; } } };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { onLine: true, serviceWorker: { controller: FIRST ? null : {}, register: () => Promise.resolve(reg), getRegistration: async () => null, addEventListener: (t, f) => { swh[t] = f; } } } });

// Données existantes pour la 2e séance (une tâche à ouvrir depuis une notification)
const V = await import('../../js/validation.js'), TK = await import('../../js/tasks.js'), U = await import('../../js/utils.js');
const ST = await import('../../js/storage.js');
if (!FIRST) {
  const db = V.defaultDB(); db.settings.onboarded = true;
  const t = TK.createTask({ title: 'Ouverte par notification', note: '', subject: 'algebre', type: 'homework', date: U.addDays(U.getToday(), 2), time: '', priority: 'normal', reminderEnabled: false, reminderMode: 'eve0' }); t.id = 'task_notif';
  db.tasks.push(t); localStorage.setItem(ST.KEY, JSON.stringify(db));
  globalThis.location.search = '?task=task_notif';
} else globalThis.location.search = '?new=1';

await import('../../js/app.js'); await tick(30);
const { state } = await import('../../js/state.js');
const fire = (h, t, e = {}) => (h[t] || []).forEach(f => f({ ...e }));

// Raccourci / notification à l'ouverture
if (FIRST) { expect(registry.sheet.open && registry.sheetBody.querySelector('#taskForm'), 'raccourci « Nouvelle tâche » (?new=1) : le formulaire ne s\'ouvre pas'); }
else { expect(registry.sheet.open && registry.sheetBody.textContent.includes('Ouverte par notification'), 'ouverture par notification (?task=…) : la fiche ne s\'ouvre pas'); }
expect(replaced === '/agenda/', `l'adresse n'est pas nettoyée (${replaced})`);

// Service worker : rechargement seulement lors d'une VRAIE mise à jour
if (swh.controllerchange) { swh.controllerchange(); swh.controllerchange(); }
expect(FIRST ? reloads === 0 : reloads === 1, FIRST ? `première installation : la page se recharge (${reloads}) alors qu'il ne s'agit pas d'une mise à jour` : `mise à jour : ${reloads} rechargement(s) au lieu d'un seul`);
if (!FIRST) { expect(registry.view.textContent.includes('nouvelle version'), 'mise à jour disponible : bandeau absent'); await sh.dispatch('update', {}); expect(waitingMsg && waitingMsg.type === 'SKIP_WAITING', 'bouton Mettre à jour : SKIP_WAITING non envoyé'); }

// Notification cliquée pendant que l'appli est ouverte
registry.sheet.close();
swh.message && swh.message({ data: { type: 'open-task', taskId: 'inexistante' } }); expect(!registry.sheet.open, 'notification d\'une tâche supprimée : une fiche s\'est ouverte');
if (!FIRST) { swh.message({ data: { type: 'open-task', taskId: 'task_notif' } }); expect(registry.sheet.open, 'notification cliquée : fiche non ouverte'); registry.sheet.close(); }

// Autre onglet
const cur = JSON.parse(localStorage.getItem(ST.KEY) || 'null') || V.defaultDB();
const extra = TK.createTask({ title: 'Ajoutée dans un autre onglet', note: '', subject: 'sciences', type: 'lesson', date: U.getToday(), time: '', priority: 'normal', reminderEnabled: false, reminderMode: 'eve0' });
cur.tasks.push(extra); localStorage.setItem(ST.KEY, JSON.stringify(cur));
fire(wh, 'storage', { key: 'autre-cle' }); expect(!state.db.tasks.some(t => t.id === extra.id), 'événement storage d\'une autre clé : données rechargées à tort');
fire(wh, 'storage', { key: ST.KEY }); await tick();
expect(state.db.tasks.some(t => t.id === extra.id), 'autre onglet : ses données ne sont pas rechargées (elles seraient écrasées à la prochaine action)');
expect(registry.view.textContent.includes('Ajoutée dans un autre onglet'), 'autre onglet : l\'écran n\'est pas mis à jour');
localStorage.setItem(ST.KEY, '{corrompu'); fire(wh, 'storage', { key: ST.KEY }); expect(state.db.tasks.some(t => t.id === extra.id), 'autre onglet : une écriture corrompue a effacé nos données');

// En ligne / hors ligne, retour au premier plan
fire(wh, 'offline'); expect(state.online === false && registry.view.textContent.includes('Hors connexion'), 'hors connexion : bandeau absent');
fire(wh, 'online'); expect(state.online === true && !registry.view.textContent.includes('Hors connexion'), 'retour en ligne : bandeau toujours là');
doc.visibilityState = 'visible'; doc.fire('visibilitychange'); await tick(); expect(registry.view.childElementCount > 0, 'retour au premier plan : écran vide');

// Erreurs globales : jamais d'écran blanc
registry.view.textContent = ''; fire(wh, 'error'); expect(registry.view.textContent.includes('Un problème est survenu') && registry.view.all().some(e => e.tagName === 'BUTTON'), 'erreur globale : pas de message avec bouton « Réessayer » quand l\'écran est vide');
fire(wh, 'unhandledrejection'); expect(registry.view.childElementCount > 0, 'promesse rejetée : écran vide');
console.log(`Démarrage (${SC}) : ${checks} vérifications, ${problems.length} problème(s)`);
for (const p of problems) console.log('  ✗ ' + p);
process.exit(problems.length ? 1 : 0);

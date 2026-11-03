// Simule le service worker (sw.js) dans un bac à sable : installation, mise à jour, hors ligne, notifications.
import vm from 'node:vm';
import fs from 'node:fs';
const SRC = fs.readFileSync(new URL('../../sw.js', import.meta.url), 'utf8');
const APP_VERSION = (await import('../../js/constants.js')).APP_VERSION;
const SCOPE = 'https://eleve.github.io/agenda-etoile/';
const problems = []; let checks = 0;
const expect = (c, m) => { checks++; if (!c) problems.push(m); };

function makeEnv(routes = {}) {
  const env = { online: true, fetched: [], listeners: {}, caches: new Map(), claimed: false, skipped: 0, clients: [], opened: [] };
  const norm = r => new URL(typeof r === 'string' ? r : r.url, SCOPE).href;
  const mkRes = (body, o = {}) => ({ ok: o.ok !== false, status: o.status || 200, type: o.type || 'basic', body, clone() { return { ...this }; } });
  class Req { constructor(url, init = {}) { this.url = norm(url); this.method = init.method || 'GET'; this.mode = init.mode || 'no-cors'; this.cache = init.cache || 'default'; } }
  class Cache {
    constructor() { this.m = new Map(); }
    async addAll(list) { for (const r of list) { const req = typeof r === 'string' ? new Req(r) : r; const res = await env.fetch(req); if (!res.ok) throw new Error('addAll: ' + res.status); this.m.set(norm(req), { res, cacheMode: req.cache }); } }
    async put(r, res) { this.m.set(norm(r), { res, cacheMode: 'put' }); }
    async match(r) { const e = this.m.get(norm(r)); return e ? e.res : undefined; }
  }
  env.fetch = async req => {
    env.fetched.push(req);
    if (!env.online) throw new TypeError('Failed to fetch');
    const path = new URL(typeof req === 'string' ? req : req.url).pathname.replace(new URL(SCOPE).pathname, '');
    const r = routes[path] ?? routes['*'];
    return typeof r === 'function' ? r(req) : (r || mkRes('contenu de ' + path));
  };
  const cachesApi = {
    async open(n) { if (!env.caches.has(n)) env.caches.set(n, new Cache()); return env.caches.get(n); },
    async keys() { return [...env.caches.keys()]; },
    async delete(n) { return env.caches.delete(n); },
    async match(r) { for (const c of env.caches.values()) { const m = await c.match(r); if (m) return m; } return undefined; }
  };
  const self = {
    registration: { scope: SCOPE }, location: { origin: new URL(SCOPE).origin },
    addEventListener: (t, f) => { env.listeners[t] = f; },
    skipWaiting: () => { env.skipped++; },
    clients: { claim: async () => { env.claimed = true; }, matchAll: async () => env.clients, openWindow: async u => { env.opened.push(u); } }
  };
  const ctx = vm.createContext({ self, caches: cachesApi, fetch: env.fetch, Request: Req, URL, Promise, console });
  vm.runInContext(SRC, ctx);
  env.mkRes = mkRes; env.Req = Req; env.norm = norm;
  env.event = (type, data = {}) => { const ev = { ...data, _waits: [], waitUntil(p) { this._waits.push(p); }, respondWith(p) { this.responded = Promise.resolve(p); } }; env.listeners[type](ev); return ev; };
  return env;
}
const assets = [...SRC.matchAll(/'((?:css|js|icons)\/[^']+|index\.html|manifest\.webmanifest)'/g)].map(m => m[1]);

// 1. Installation : tout est mis en cache, en contournant le cache HTTP (sinon un déploiement récent peut servir des fichiers périmés)
{
  const env = makeEnv(); const ev = env.event('install'); await Promise.all(ev._waits);
  const cache = env.caches.get(`agenda-etoile-static-${APP_VERSION}`);
  expect(!!cache, 'installation : cache nommé d\'après la version absent');
  for (const a of ['./', ...assets]) expect(cache && cache.m.has(env.norm(a)), `installation : ${a} non mis en cache`);
  expect(env.skipped === 0, 'installation : skipWaiting appelé automatiquement (la mise à jour doit attendre le choix de l\'utilisateur)');
  const modes = new Set([...cache.m.values()].map(e => e.cacheMode));
  expect(modes.size === 1 && modes.has('reload'), `installation : les fichiers peuvent venir du cache HTTP du navigateur (mode ${[...modes].join(',')}) : une nouvelle version pourrait installer d'anciens fichiers pendant ~10 min après un déploiement`);
}
// 1b. Un fichier manquant (404) fait échouer l'installation en entier : pas de version bancale
{
  const env = makeEnv({ 'js/ui.js': makeEnv().mkRes('', { ok: false, status: 404 }) }); const ev = env.event('install');
  const results = await Promise.allSettled(ev._waits); expect(results.every(r => r.status === 'rejected'), 'installation avec un fichier 404 : devrait échouer');
}
// 2. Activation : anciens caches de l'appli supprimés, ceux des autres applis conservés
{
  const env = makeEnv(); for (const n of ['agenda-etoile-static-v2', 'agenda-etoile-static-2.0.0', 'autre-app-cache']) await (await env.caches.set(n, { m: new Map() }) || 0);
  const ev = env.event('activate'); await Promise.all(ev._waits);
  expect(env.claimed, 'activation : clients.claim non appelé');
  expect(!env.caches.has('agenda-etoile-static-v2') && !env.caches.has('agenda-etoile-static-2.0.0'), 'activation : anciens caches conservés');
  expect(env.caches.has('autre-app-cache'), 'activation : le cache d\'une autre application a été supprimé');
}
// 3. Navigation : en ligne puis hors ligne (avec paramètres d'URL)
{
  const env = makeEnv(); await Promise.all(env.event('install')._waits);
  const nav = (url, mode = 'navigate') => env.event('fetch', { request: new env.Req(url, { mode }) });
  let ev = nav('index.html'); const res = await ev.responded; expect(res.body.includes('index.html'), 'navigation en ligne : réponse réseau attendue');
  env.online = false;
  for (const u of ['./', 'index.html', './?task=abc', './?new=1', './?x=1#frag']) { ev = nav(u); const r = ev.responded ? await ev.responded : null; expect(r && r.body, `hors ligne : la page ${u} n'est pas servie depuis le cache`); }
}
// 4. Ressources : cache d'abord + mise à jour ; seules les ressources listées, en GET, de la même origine
{
  let server = 'ANCIEN'; const env = makeEnv({ 'js/app.js': () => makeEnv().mkRes(server) }); await Promise.all(env.event('install')._waits); server = 'NOUVEAU';
  let ev = env.event('fetch', { request: new env.Req('js/app.js') }); let r = await ev.responded; expect(r.body === 'ANCIEN', 'ressource : la copie en cache devrait être servie d\'abord');
  await new Promise(x => setTimeout(x, 5)); const c = env.caches.get(`agenda-etoile-static-${APP_VERSION}`); expect(c.m.get(env.norm('js/app.js')).res.body === 'NOUVEAU', 'ressource : mise à jour en arrière-plan non enregistrée');
  env.online = false; ev = env.event('fetch', { request: new env.Req('js/app.js') }); r = await ev.responded; expect(r.body === 'NOUVEAU', 'hors ligne : ressource en cache non servie');
  env.online = true;
  ev = env.event('fetch', { request: new env.Req('js/app.js', { method: 'POST' }) }); expect(!ev.responded, 'les requêtes POST doivent être ignorées');
  ev = env.event('fetch', { request: { url: 'https://cdn.exemple.com/x.js', method: 'GET', mode: 'no-cors' } }); expect(!ev.responded, 'les requêtes d\'une autre origine doivent être ignorées');
  ev = env.event('fetch', { request: new env.Req('tests/index.html') }); expect(!ev.responded, 'une ressource non listée ne doit pas passer par le cache');
  const env2 = makeEnv({ 'js/ui.js': makeEnv().mkRes('erreur', { ok: false, status: 500 }) }); env2.caches.set(`agenda-etoile-static-${APP_VERSION}`, { m: new Map(), match: async () => undefined, put: async (r, res) => { env2.caches.get(`agenda-etoile-static-${APP_VERSION}`).m.set(env2.norm(r), res); } });
  ev = env2.event('fetch', { request: new env2.Req('js/ui.js') }); await ev.responded; await new Promise(x => setTimeout(x, 5));
  expect(env2.caches.get(`agenda-etoile-static-${APP_VERSION}`).m.size === 0, 'une réponse d\'erreur (500) ne doit pas être mise en cache');
  ev = env.event('fetch', { request: new env.Req('js/app.js') }); const opaque = makeEnv().mkRes('x', { type: 'opaque' });
}
// 5. Messages
{
  const env = makeEnv(); let posted = null;
  env.event('message', { data: { type: 'SKIP_WAITING' } }); expect(env.skipped === 1, 'message SKIP_WAITING sans effet');
  env.event('message', { data: { type: 'AUTRE' } }); env.event('message', {}); expect(env.skipped === 1, 'message inconnu : skipWaiting déclenché');
  env.event('message', { data: { type: 'GET_VERSION' }, source: { postMessage: m => { posted = m; } } }); expect(posted && posted.version === APP_VERSION, `GET_VERSION : ${posted && posted.version} ≠ ${APP_VERSION}`);
}
// 6. Clic sur une notification
{
  const env = makeEnv(); const msgs = []; let focused = 0, closed = 0;
  env.clients = [{ focus: () => { focused++; return Promise.resolve(); }, postMessage: m => msgs.push(m) }];
  let ev = env.event('notificationclick', { notification: { close: () => closed++, data: { taskId: 'task_1' } } }); await Promise.all(ev._waits);
  expect(closed === 1 && focused === 1 && msgs[0]?.type === 'open-task' && msgs[0].taskId === 'task_1', 'clic notification : fenêtre existante non focalisée / message non envoyé');
  env.clients = []; ev = env.event('notificationclick', { notification: { close() {}, data: { taskId: 'a b&c=é' } } }); await Promise.all(ev._waits);
  expect(env.opened[0] === './?task=a%20b%26c%3D%C3%A9', `clic notification (appli fermée) : URL ${env.opened[0]}`);
  ev = env.event('notificationclick', { notification: { close() {} } }); await Promise.all(ev._waits); expect(env.opened[1] === './', 'clic sans données : ouvrir ./');
}
console.log(`Service worker : ${checks} vérifications (installation, mise à jour, hors ligne, messages, clic notification), ${problems.length} problème(s)`);
for (const p of problems) console.log('  ✗ ' + p);
process.exit(problems.length ? 1 : 0);

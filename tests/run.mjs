import fs from 'node:fs';
import { makeStub } from './stub.mjs';

globalThis.localStorage = makeStub(); // avant l'import de la suite
const { runAll } = await import('./suite.js');
const { APP_VERSION } = await import('../js/constants.js');

const r = await runAll((ok, name, msg) => console.log(`${ok ? '  ok ' : 'ÉCHEC'} ${name}${ok ? '' : '\n        ' + msg}`));

// Contrôles de cohérence du projet (Node uniquement)
let extra = 0; const fail = m => { extra++; console.log('ÉCHEC cohérence : ' + m); };
const read = f => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const pkg = JSON.parse(read('package.json')).version;
const swV = (read('sw.js').match(/const VERSION = '([^']+)'/) || [])[1];
const swCache = /const CACHE = `agenda-etoile-static-\$\{VERSION\}`/.test(read('sw.js'));
if (pkg !== APP_VERSION) fail(`package.json ${pkg} ≠ APP_VERSION ${APP_VERSION}`);
if (swV !== APP_VERSION) fail(`sw.js ${swV} ≠ APP_VERSION ${APP_VERSION}`);
if (!swCache) fail('le nom du cache du service worker doit dépendre de VERSION');
for (const f of fs.readdirSync(new URL('../js/', import.meta.url))) {
  if (/TimestampTrigger|showTrigger/.test(read('js/' + f))) fail(`${f} utilise Notification Triggers (abandonné par Chrome)`);
}
const assets = [...read('sw.js').matchAll(/'((?:css|js|icons)\/[^']+|index\.html|manifest\.webmanifest)'/g)].map(m => m[1]);
for (const a of assets) if (!fs.existsSync(new URL('../' + a, import.meta.url))) fail(`le service worker liste un fichier absent : ${a}`);
console.log(extra ? '' : `  ok  cohérence : versions synchronisées (${APP_VERSION}), aucun Notification Triggers, ${assets.length} fichiers du cache présents`);

console.log(`\n${r.pass}/${r.total} tests réussis`);
process.exit(r.fail || extra ? 1 : 0);

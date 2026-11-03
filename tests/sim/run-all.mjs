// Lance toutes les simulations et tests d'affilée. Code de sortie 0 seulement si tout passe.
import { spawnSync } from 'node:child_process';
const root = new URL('../', import.meta.url).pathname;
const steps = [
  ['Tests unitaires + cohérence', 'run.mjs'], ['Fumée de l\'interface', 'smoke.mjs'],
  ['Moteur (longue durée)', 'sim/sim-engine.mjs'], ['Fuseaux horaires', 'sim/sim-tz.mjs'], ['Données (fuzz)', 'sim/sim-data.mjs'],
  ['Interface (parcours)', 'sim/sim-ui.mjs'], ['Service worker', 'sim/sim-sw.mjs'], ['Démarrage de l\'appli', 'sim/sim-app.mjs'], ['Pont Android', 'sim/sim-native.mjs'], ['Audit statique', 'sim/static-audit.mjs']
];
let bad = 0;
for (const [name, file] of steps) {
  const r = spawnSync(process.execPath, [root + file], { encoding: 'utf8' });
  const out = (r.stdout || '').trim().split('\n').filter(l => !/^  ok /.test(l)).join('\n');
  console.log(`${r.status === 0 ? '✔' : '✘'} ${name}\n${out.split('\n').map(l => '   ' + l).join('\n')}`);
  if (r.status !== 0) { bad++; if (r.stderr) console.log(r.stderr.slice(0, 400)); }
}
console.log(bad ? `\n${bad} étape(s) en échec` : '\nToutes les simulations passent.');
process.exit(bad ? 1 : 0);

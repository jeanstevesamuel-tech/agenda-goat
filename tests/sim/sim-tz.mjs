// Lance tz-worker.mjs dans 16 fuseaux horaires (dont Haïti, avec changement d'heure).
import { spawnSync } from 'node:child_process';
const zones = ['America/Port-au-Prince', 'America/Havana', 'America/New_York', 'America/Sao_Paulo', 'Europe/Paris', 'Europe/Dublin', 'Africa/Casablanca',
  'Asia/Kolkata', 'Asia/Tehran', 'Australia/Lord_Howe', 'Pacific/Auckland', 'Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Pacific/Apia', 'UTC', 'America/St_Johns'];
let failed = 0, days = 0;
for (const tz of zones) {
  const r = spawnSync(process.execPath, [new URL('./tz-worker.mjs', import.meta.url).pathname], { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  const line = (r.stdout || '').trim().split('\n').pop();
  let res; try { res = JSON.parse(line); } catch { res = { tz, bad: ['sortie illisible : ' + (r.stderr || r.stdout).slice(0, 300)] }; }
  days = res.days || days;
  if (r.status !== 0 || res.bad.length) { failed++; console.log(`  ✗ ${tz} : ${res.bad.join(' | ')}`); }
}
console.log(`Fuseaux horaires : ${zones.length} zones × ${days} jours (2024-2029) : ${failed ? failed + ' zone(s) en échec' : 'aucun problème'}`);
process.exit(failed ? 1 : 0);

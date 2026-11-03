// Audit statique : cohérence CSS/JS/HTML/manifeste (classes non stylées, variables CSS, ids, icônes, raccourcis).
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
const root = new URL('../../', import.meta.url).pathname;
const read = f => fs.readFileSync(root + f, 'utf8');
const problems = [];
const files = d => fs.readdirSync(root + d).map(f => d + '/' + f);
const css = files('css').map(read).join('\n'), js = files('js').map(read).join('\n'), html = read('index.html');

// 1. variables CSS utilisées mais jamais définies
const defined = new Set([...css.matchAll(/(--[\w-]+)\s*:/g)].map(m => m[1]));
const setByJs = new Set(['--dx', '--dy']); // posées dynamiquement par le JS (confettis)
for (const m of css.matchAll(/var\((--[\w-]+)/g)) if (!defined.has(m[1]) && !setByJs.has(m[1])) problems.push(`variable CSS non définie : ${m[1]}`);
// 2. classes posées par le JS/HTML mais sans aucune règle CSS
const cssClasses = new Set([...css.matchAll(/\.([a-zA-Z][\w-]*)/g)].map(m => m[1]));
const used = new Set();
for (const m of js.matchAll(/class:\s*'([^']*)'/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => used.add(c));
for (const m of js.matchAll(/class:\s*'([^']*)'\s*\+\s*\(([^)]*)\)/g)) [...m[2].matchAll(/'\s*([\w -]+)'/g)].forEach(x => x[1].split(/\s+/).filter(Boolean).forEach(c => used.add(c)));
for (const m of html.matchAll(/class="([^"]*)"/g)) m[1].split(/\s+/).filter(Boolean).forEach(c => used.add(c));
const dynamic = new Set(['pri-', 'banner-', 'perm-']);
const noStyleNeeded = new Set(['sr-only']); 
for (const c of used) if (!cssClasses.has(c) && !dynamic.has(c) && !c.endsWith('-') && !noStyleNeeded.has(c)) problems.push(`classe « ${c} » utilisée mais sans règle CSS (élément non stylé)`);
for (const c of ['pri-important', 'pri-urgent', 'banner-alert', 'banner-error', 'perm-granted', 'perm-denied', 'perm-default', 'perm-unsupported']) if (!cssClasses.has(c)) problems.push(`classe dynamique « ${c} » sans règle CSS`);
// 3. HTML : ids uniques, cibles utilisées par le JS présentes
const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
if (new Set(ids).size !== ids.length) problems.push('ids dupliqués dans index.html');
for (const m of js.matchAll(/\$\('#([\w-]+)'\)/g)) if (!ids.includes(m[1]) && !js.includes(`id: '${m[1]}'`) && !js.includes(`id="${m[1]}"`)) problems.push(`le JS cherche #${m[1]} qui n'existe nulle part`);
if (!/<html lang="fr"/.test(html)) problems.push('index.html : lang="fr" absent');
if (!/name="viewport"/.test(html)) problems.push('index.html : viewport absent');
// 4. Manifeste : icônes présentes et de la bonne taille, raccourci géré par le code
const man = JSON.parse(read('manifest.webmanifest'));
for (const ic of man.icons) {
  if (!fs.existsSync(root + ic.src)) { problems.push(`manifeste : icône absente ${ic.src}`); continue; }
  if (ic.src.endsWith('.png')) {
    const size = execFileSync('python3', ['-c', `from PIL import Image;im=Image.open("${root + ic.src}");print(f"{im.size[0]}x{im.size[1]}")`]).toString().trim();
    if (size !== ic.sizes) problems.push(`manifeste : ${ic.src} déclarée ${ic.sizes}, réelle ${size}`);
  }
}
for (const s of man.shortcuts || []) {
  const q = (s.url.match(/\?(\w+)/) || [])[1];
  if (q && !new RegExp(`has\\('${q}'\\)[^;]*\\)\\s*\\{?[^}]*open|openNewTask|get\\('${q}'\\)`).test(read('js/app.js')) || (q === 'new' && !/openNewTask\(\)/.test(read('js/app.js')))) problems.push(`manifeste : le raccourci « ${s.name} » (${s.url}) n'est pas géré par app.js (il n'ouvre rien)`);
}
if (man.start_url !== './' || man.scope !== './') problems.push('manifeste : start_url/scope inattendus');
// 5. Accessibilité statique de la coquille
for (const b of html.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)) { const open = b[0].match(/<button[^>]*>/)[0]; const text = b[1].replace(/<[^>]+>/g, '').trim(); if (!text && !/aria-label=/.test(open)) problems.push('index.html : bouton sans nom accessible'); }
if (!/<main[^>]*id="view"/.test(html)) problems.push('index.html : <main id="view"> absent');
if (/<main[^>]*aria-live/.test(html)) problems.push('index.html : aria-live sur <main> (relit tout l\'écran à chaque affichage)');
// 6. Sécurité : aucun HTML injecté, aucune évaluation dynamique
for (const [pat, why] of [[/innerHTML|outerHTML|insertAdjacentHTML|document\.write/, 'injection HTML'], [/\beval\(|new Function\(/, 'évaluation dynamique'], [/setAttribute\(\s*['"]style['"]/, 'style en ligne (bloqué par la CSP)'], [/(?:^|[\s<])on(?:click|load|error)\s*=/, 'gestionnaire en ligne (bloqué par la CSP)']]) if (pat.test(js + html)) problems.push(`sécurité : ${why} détecté`);
// 7. Toutes les polices/tailles du design system : tailles de police hors échelle
const scale = new Set(['12px', '14px', '16px', '18px', '22px', '28px', '32px', '48px', '64px', '20px']);
for (const m of css.matchAll(/font-size:\s*(\d+px)/g)) if (!scale.has(m[1])) problems.push(`taille de police hors échelle : ${m[1]}`);
console.log(`Audit statique : ${problems.length ? problems.length + ' problème(s)' : 'cohérence CSS / JS / HTML / manifeste OK'}`);
for (const p of problems) console.log('  ✗ ' + p);
process.exit(problems.length ? 1 : 0);

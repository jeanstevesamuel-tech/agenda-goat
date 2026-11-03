// Simulation de parcours complets : vraie appli (app.js), faux DOM, horloge virtuelle, stockage factice.
import fs from 'node:fs';
import { makeStub } from '../stub.mjs';
import { installClock, RealDateClass } from './clock.mjs';
import { installDom } from './domshim.mjs';

const failures = []; let checks = 0, scenario = '';
const check = (c, msg) => { checks++; if (!c) failures.push(`[${scenario}] ${msg}`); };
const eq = (a, b, msg) => check(JSON.stringify(a) === JSON.stringify(b), `${msg} — attendu ${JSON.stringify(b)}, reçu ${JSON.stringify(a)}`);
const has = (text, sub, msg) => check(String(text).includes(sub), `${msg} — « ${sub} » absent de « ${String(text).slice(0, 160)} »`);
const hasNot = (text, sub, msg) => check(!String(text).includes(sub), `${msg} — « ${sub} » présent dans « ${String(text).slice(0, 160)} »`);

const uiSrc = fs.readFileSync(new URL('../../js/ui.js', import.meta.url), 'utf8');
const HANDLED = new Set([...uiSrc.matchAll(/case '([a-z-]+)':/g)].map(m => m[1]));
const { state } = await import('../../js/state.js');
const ui = await import('../../js/ui.js');

let C, D, boots = 0;
const $ = s => D.querySelector(s), $$ = s => D.querySelectorAll(s);
const T = (y, m, d, h = 0, mi = 0) => new RealDateClass(y, m - 1, d, h, mi).getTime();

function audit() {
  const all = D.root.all();
  const ids = all.map(e => e.attrs.id).filter(Boolean);
  const dup = ids.filter((x, i) => ids.indexOf(x) !== i);
  check(!dup.length, `ids dupliqués : ${dup}`);
  for (const e of all) {
    if (e.tagName === 'BUTTON') check((e.attrs['aria-label'] || e.textContent || '').trim(), `bouton sans nom accessible : ${e.className} ${JSON.stringify(e.attrs)}`);
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) && !('hidden' in e.attrs)) check(e.attrs['aria-label'] || e.closest('label'), `champ sans étiquette : ${e.attrs.name || e.id}`);
    if (['SCRIPT', 'IFRAME', 'STYLE', 'IMG', 'OBJECT', 'EMBED'].includes(e.tagName)) check(false, `balise interdite ${e.tagName}`);
    for (const a in e.attrs) if (/^on/i.test(a) || a === 'style') check(false, `attribut interdit « ${a} » (CSP)`);
    if (e.attrs['data-action']) check(HANDLED.has(e.attrs['data-action']), `action non gérée : ${e.attrs['data-action']}`);
    for (const a of ['aria-checked', 'aria-selected']) if (a in e.attrs) check(['true', 'false'].includes(e.attrs[a]), `${a} invalide : ${e.attrs[a]}`);
    if (e.attrs.role === 'checkbox' || e.attrs.role === 'switch') check('aria-checked' in e.attrs, 'role sans aria-checked');
  }
  for (const z of [D.view, D.sheetBody, D.modalBody, D.toasts, D.celebrate]) check(!/\bundefined\b|\bNaN\b|\[object |\bnull\b/.test(z.textContent), `texte suspect : ${z.textContent.slice(0, 140)}`);
  check(D.body.classList.contains('no-scroll') === D.sheet.open, `no-scroll (${D.body.classList.contains('no-scroll')}) incohérent avec sheet.open (${D.sheet.open})`);
  check(!D.view.textContent.includes('Un problème est survenu'), 'écran de secours affiché (crash de rendu)');
}
const settle = async () => { await C.flush(); audit(); };
const tap = async el => { check(!!el, 'élément à toucher introuvable'); if (!el) return; D.click(el); await settle(); };
const byAction = (name, attrs = {}, root = D.root) => root.all().find(e => e.attrs['data-action'] === name && Object.entries(attrs).every(([k, v]) => e.attrs['data-' + k] === String(v)));
const nav = v => tap(byAction('nav', { view: v }));
const form = () => $('#taskForm');
const fill = (f, v) => {
  for (const k of ['title', 'note', 'date', 'time']) if (v[k] !== undefined) f.querySelector(`[name=${k}]`).value = v[k];
  for (const k of ['subject', 'type', 'priority']) if (v[k] !== undefined) D.chooseRadio(f, k, v[k]);
  if (v.reminder !== undefined) D.setSelect(f, 'reminder', v.reminder);
};
const submit = async (f = form()) => { D.submit(f); await settle(); };
const errText = (f, k) => (f.querySelector(`[data-err="${k}"]`) || { textContent: '' }).textContent;
const cards = () => $$('.task');
const tasksNow = () => state.db.tasks;
const seed = (tasks, settings = {}, stats = 0) => JSON.stringify({ version: 2, tasks, settings: { onboarded: true, ...settings }, stats: { totalCompleted: stats } });
const raw = (id, title, date, extra = {}) => ({ id, title, date, subject: 'algebre', type: 'homework', ...extra });

async function boot({ storage = {}, dark = false, perm = 'default', online = true, start = T(2026, 9, 19, 12, 0), search = '', quota } = {}) {
  if (C) C.restore();
  globalThis.localStorage = makeStub();
  for (const k in storage) globalThis.localStorage.setItem(k, storage[k]);
  if (quota !== undefined) globalThis.localStorage.maxChars = quota;
  C = installClock(start); D = installDom({ dark, online, search }); D.setPermission(perm);
  const n = new RealDateClass(start);
  state.ui = { view: 'today', calYear: n.getFullYear(), calMonth: n.getMonth(), calSel: 0, filter: 'all', query: '', limit: 60, lastSubject: 'algebre' };
  await import('../../js/app.js?boot=' + (++boots));
  await settle();
}
async function endScenario() { while (D.modalStack.length) D.modalStack[D.modalStack.length - 1].close(); await C.flush(); }
async function scenarioRun(name, fn) {
  scenario = name;
  try { await fn(); await endScenario(); } catch (e) { failures.push(`[${name}] EXCEPTION : ${e && e.stack || e}`); try { await endScenario(); } catch { /* ignore */ } }
}

/* ============ S1 : premier lancement ============ */
await scenarioRun('S1 premier lancement', async () => {
  await boot();
  check(D.modal.open, 'onboarding non affiché'); has(D.modalBody.textContent, 'Bienvenue dans Agenda Étoile', 'titre onboarding');
  eq(state.db.settings.onboarded, false, 'onboarded avant validation');
  await tap(byAction('onboard-start', {}, D.modalBody));
  check(!D.modal.open, 'onboarding non fermé'); eq(state.db.settings.onboarded, true, 'onboarded après validation');
  eq(JSON.parse(globalThis.localStorage.getItem('agenda-etoile-v2')).settings.onboarded, true, 'onboarded persisté');
  has(D.view.textContent, 'Samedi 19 septembre', 'date du jour'); has(D.view.textContent, 'Bon après-midi', 'salutation'); has(D.view.textContent, 'Aucune tâche aujourd’hui.', 'état vide'); has(D.view.textContent, 'Profite du calme.', 'état vide (sous-titre)');
  has(D.view.textContent, '★ 0 · Niveau 1', 'étoiles initiales'); has(D.view.textContent, 'Rien de prévu dans les 7 prochains jours', 'à venir vide');
  check(!D.fab.hidden, 'FAB visible sur Aujourd\'hui');
  await nav('calendar'); has(D.view.textContent, 'Septembre 2026', 'titre du mois'); has(D.view.textContent, 'Rien de noté ce mois-ci', 'calendrier vide');
  eq($$('.day').length, 30, 'jours de septembre'); eq($$('.is-today').length, 1, 'un seul aujourd\'hui'); has($('.is-today').attrs['aria-label'], '19 septembre', 'label du jour courant'); eq($('.is-today').attrs['aria-current'], 'date', 'aria-current');
  await nav('tasks'); has(D.view.textContent, 'Ta liste est vide', 'liste vide');
  await nav('progress'); has(D.view.textContent, '★ 0', 'progression'); has(D.view.textContent, 'À débloquer', 'récompenses verrouillées'); has(D.view.textContent, '0 jour', 'série à 0');
  await nav('settings'); check(D.fab.hidden, 'FAB masqué dans Réglages'); has(D.view.textContent, 'Non autorisées', 'permission par défaut'); has(D.view.textContent, 'Appli fermée, rien n’est garanti', 'texte honnête sur les rappels');
  eq(byAction('nav', { view: 'settings' }).attrs['aria-current'], 'page', 'aria-current sur la navigation');
  eq(D.nav.all().filter(b => 'aria-current' in b.attrs).length, 1, 'un seul onglet actif');
});

/* ============ S2 : formulaire, validation, doublons ============ */
await scenarioRun('S2 formulaire', async () => {
  await boot({ storage: { 'agenda-etoile-v2': seed([]) } });
  await tap(D.fab);
  check(D.sheet.open, 'formulaire non ouvert'); check(form(), 'formulaire absent');
  check(D.activeElement === form().querySelector('[name=title]'), 'focus attendu sur le titre');
  eq(form().querySelector('[name=date]').value, '2026-09-19', 'date par défaut = aujourd\'hui');
  await submit(); has(errText(form(), 'title'), '80 caractères', 'titre vide refusé'); eq(tasksNow().length, 0, 'aucune tâche créée');
  fill(form(), { title: 'a'.repeat(81) }); await submit(); has(errText(form(), 'title'), '80 caractères', 'titre trop long refusé');
  fill(form(), { title: 'ok', note: 'n'.repeat(401) }); await submit(); has(errText(form(), 'note'), '400', 'note trop longue refusée');
  fill(form(), { note: '', date: '' }); await submit(); has(errText(form(), 'date'), 'date valide', 'date vide refusée');
  fill(form(), { date: '2026-02-30' }); await submit(); has(errText(form(), 'date'), 'date valide', '30 février refusé');
  fill(form(), { date: '2026-09-20', reminder: 'hour1', time: '' }); await submit(); has(errText(form(), 'reminder'), 'choisis une heure', 'hour1 sans heure refusé');
  fill(form(), { time: '25:00' }); await submit(); has(errText(form(), 'time'), 'pas valide', 'heure invalide refusée');
  eq(tasksNow().length, 0, 'toujours zéro tâche après tous les refus');
  fill(form(), { title: 'Exercices 4 et 5', subject: 'algebre', date: '2026-09-20', time: '', reminder: 'eve18', priority: 'normal' });
  const f1 = form(); await submit(f1);
  eq(tasksNow().length, 1, 'une tâche créée'); has(D.toasts.textContent, 'Rappel prévu la veille à 18h', 'toast de rappel');
  has(D.sheetBody.textContent, 'Dimanche 20 septembre', 'la fiche montre le jour de la tâche'); has(D.sheetBody.textContent, 'Exercices 4 et 5', 'la fiche montre la nouvelle tâche');
  eq(tasksNow()[0].reminder.status, 'scheduled', 'rappel programmé'); eq(tasksNow()[0].reminder.scheduledAt, T(2026, 9, 19, 18, 0), 'échéance = veille 18h');
  D.submit(f1); D.submit(f1); await settle();
  eq(tasksNow().length, 1, 'double appui sur Enregistrer ne crée pas de doublon');
  // ajout depuis la fiche d'un jour, avec changement de date
  await tap(byAction('sheet-close', {}, D.sheetBody)); check(!D.sheet.open, 'fiche fermée');
  await nav('calendar'); await tap($$('.day').find(d => d.attrs['data-key'] === '2026-09-25'));
  has(D.sheetBody.textContent, 'Vendredi 25 septembre', 'fiche du jour'); has(D.sheetBody.textContent, 'Rien de noté pour ce jour', 'jour vide');
  await tap(byAction('add', { key: '2026-09-25' }, D.sheetBody));
  eq(form().querySelector('[name=date]').value, '2026-09-25', 'date préremplie depuis le jour touché');
  fill(form(), { title: 'Leçon anglais', date: '2026-09-28', subject: 'anglais', type: 'lesson' }); await submit();
  has(D.sheetBody.textContent, 'Lundi 28 septembre', 'après enregistrement on voit le jour choisi, pas l\'ancien'); has(D.sheetBody.textContent, 'Leçon anglais', 'la nouvelle tâche est visible');
  eq(tasksNow().length, 2, 'deux tâches');
  // sans rappel
  await tap(byAction('sheet-close', {}, D.sheetBody)); await tap(D.fab); fill(form(), { title: 'Sans rappel', reminder: 'none' }); await submit();
  eq(tasksNow().find(t => t.title === 'Sans rappel').reminder.status, 'cancelled', 'rappel désactivé -> cancelled'); has(D.toasts.textContent, 'Tâche enregistrée.', 'toast simple');
  // tâche pour aujourd'hui avec rappel déjà passé
  await tap(byAction('sheet-close', {}, D.sheetBody)); await tap(D.fab); fill(form(), { title: 'Pour aujourd\'hui', date: '2026-09-19', reminder: 'eve0' }); await submit();
  has(D.toasts.textContent, 'déjà passé', 'avertissement de rappel passé');
});

/* ============ S3 : modifier, terminer, niveaux, supprimer, annuler ============ */
await scenarioRun('S3 cycle de vie d\'une tâche', async () => {
  const ts = Array.from({ length: 7 }, (_, i) => raw('t' + i, 'Tâche ' + i, '2026-09-19', { reminder: { enabled: false } }));
  await boot({ storage: { 'agenda-etoile-v2': seed(ts, {}, 3) } });
  has(D.view.textContent, '7 tâches · 0 terminée · 7 restantes', 'résumé du jour'); has(D.view.textContent, '★ 3 · Niveau 1', 'étoiles de départ');
  const btn = id => byAction('toggle', { id }, D.view);
  await tap(btn('t0')); eq(state.db.stats.totalCompleted, 4, '+1 étoile'); has(D.view.textContent, '★ 4 · Niveau 1', 'bandeau mis à jour'); has(D.view.textContent, '1 terminée', 'compteur mis à jour');
  eq($$('.task').filter(c => c.attrs['data-id'] === 't0')[0].classList.contains('is-done'), true, 'carte marquée terminée sans re-rendu complet');
  await tap(btn('t0')); await tap(btn('t0')); await tap(btn('t0')); eq(state.db.stats.totalCompleted, 4, 'cliquer plusieurs fois ne rapporte pas d\'étoile en plus');
  check(state.db.tasks.find(t => t.id === 't0').done === false, 't0 rouverte après 4 clics');
  await tap(btn('t0')); eq(state.db.stats.totalCompleted, 4, 'réouvrir puis terminer ne rapporte rien');
  await tap(btn('t1')); has(D.celebrate.textContent, 'Niveau supérieur ! Niveau 2', 'passage au niveau 2 à 5 étoiles'); has(D.view.textContent, 'Niveau 2', 'niveau affiché');
  for (const id of ['t2', 't3', 't4', 't5']) await tap(btn(id));
  eq(state.db.stats.totalCompleted, 9, '9 étoiles'); await tap(btn('t6')); eq(state.db.stats.totalCompleted, 10, '10 étoiles'); has(D.celebrate.textContent, 'Niveau 3', 'niveau 3 à 10');
  await nav('progress'); has(D.view.textContent, 'Débloquée', 'récompense débloquée'); has(D.view.textContent, 'Explorateur', 'nom du niveau 3');
  check(/100 %/.test(D.view.textContent), 'semaine à 100 % quand tout est terminé');
  // modification
  await nav('today'); await tap($$('.task-body').find(b => b.attrs['data-id'] === 't3'));
  has(D.sheetBody.textContent, 'Tâche 3', 'détail'); has(D.sheetBody.textContent, 'Pas de rappel', 'rappel désactivé affiché'); has(D.sheetBody.textContent, 'Rouvrir', 'bouton rouvrir');
  await tap(byAction('edit', { id: 't3' }, D.sheetBody)); eq(form().querySelector('[name=title]').value, 'Tâche 3', 'formulaire prérempli');
  fill(form(), { title: 'Tâche 3 modifiée', date: '2026-09-22', priority: 'urgent', reminder: 'same7' }); await submit();
  has(D.sheetBody.textContent, 'Tâche 3 modifiée', 'retour au détail modifié'); has(D.sheetBody.textContent, 'Mardi 22 septembre 2026', 'date modifiée'); has(D.sheetBody.textContent, 'Urgent', 'priorité');
  // rouvrir une tâche terminée reprogramme le rappel
  const t3 = state.db.tasks.find(t => t.id === 't3'); eq(t3.done, true, 't3 terminée'); eq(t3.reminder.status, 'cancelled', 'terminée -> rappel annulé');
  await tap(byAction('toggle', { id: 't3' }, D.sheetBody)); eq(t3.done, false, 'rouverte'); eq(t3.reminder.status, 'scheduled', 'rouverte -> rappel reprogrammé');
  // suppression + annulation
  const before = tasksNow().length;
  await tap(byAction('delete', { id: 't3' }, D.sheetBody)); eq(tasksNow().length, before - 1, 'supprimée'); check(!D.sheet.open, 'fiche fermée après suppression'); has(D.toasts.textContent, 'Tâche supprimée.', 'toast de suppression');
  await tap(D.toasts.querySelector('.toast-btn')); eq(tasksNow().length, before, 'annulation de la suppression'); has(D.toasts.textContent, 'Tâche rétablie', 'toast de rétablissement');
  eq(state.db.tasks.find(t => t.id === 't3').reminder.status, 'scheduled', 'rappel recalculé après annulation');
});

/* ============ S4 : recherche, filtres, pagination ============ */
await scenarioRun('S4 recherche et volume', async () => {
  const ts = Array.from({ length: 250 }, (_, i) => raw('p' + i, `Exercice ${i}`, `2026-10-${String(1 + (i % 28)).padStart(2, '0')}`, { note: i % 10 === 0 ? 'Éléphant' : '', priority: i % 7 === 0 ? 'urgent' : 'normal', subject: i % 2 ? 'sciences' : 'maths', reminder: { enabled: false }, done: i % 5 === 0, completedAt: i % 5 === 0 ? T(2026, 9, 1) : null }));
  await boot({ storage: { 'agenda-etoile-v2': seed(ts) } });
  await nav('tasks'); has(D.view.textContent, '250 résultats', 'total'); eq(cards().length, 60, 'première page = 60 cartes'); await tap(byAction('more')); eq(cards().length, 120, 'page 2');
  await tap(byAction('more')); await tap(byAction('more')); await tap(byAction('more')); eq(cards().length, 250, 'tout affiché'); check(!byAction('more'), 'bouton « Afficher plus » disparu');
  await tap(byAction('filter', { f: 'todo' })); has(D.view.textContent, '200 résultats', 'à faire'); await tap(byAction('filter', { f: 'done' })); has(D.view.textContent, '50 résultats', 'terminées');
  await tap(byAction('filter', { f: 'urgent' })); has(D.view.textContent, '28 résultats', 'urgentes non terminées (36 urgentes dont 8 terminées)');
  await tap(byAction('filter', { f: 'all' }));
  D.typeInto($('#q'), 'ELEPHANT'); await C.advance(200); await settle(); has(D.view.textContent, '25 résultats', 'recherche insensible aux accents et à la casse');
  D.typeInto($('#q'), 'sciences'); await C.advance(200); await settle(); has(D.view.textContent, '125 résultats', 'recherche par matière');
  D.typeInto($('#q'), 'zzz'); await C.advance(200); await settle(); has(D.view.textContent, 'Aucune tâche ne correspond', 'aucun résultat');
  D.typeInto($('#q'), ''); await C.advance(200); await settle(); has(D.view.textContent, '250 résultats', 'retour à tout');
  await nav('today'); await nav('tasks'); eq($('#q').value, '', 'champ de recherche cohérent après changement de vue');
  D.typeInto($('#q'), 'Exercice 24'); await C.advance(200); await settle(); check(cards().length >= 1, 'recherche partielle'); await nav('today'); await nav('tasks'); eq($('#q').value, 'Exercice 24', 'la recherche est conservée');
});

/* ============ S5 : calendrier ============ */
await scenarioRun('S5 calendrier', async () => {
  await boot({ start: T(2026, 12, 20, 9, 0), storage: { 'agenda-etoile-v2': seed([raw('c1', 'Noël', '2026-12-25'), raw('c2', 'Jour de l\'an', '2027-01-01', { priority: 'urgent' }), raw('c3', 'Trois', '2026-12-28'), raw('c4', 'Trois b', '2026-12-28'), raw('c5', 'Trois c', '2026-12-28')]) } });
  await nav('calendar');
  eq($$('.tab').map(t => t.textContent), ['Déc.', 'Janv.', 'Févr.', 'Mars'], 'quatre mois à cheval sur deux années');
  const day = k => $$('.day').find(d => d.attrs['data-key'] === k);
  check(day('2026-12-25').classList.contains('has-open'), 'Noël marqué'); check(day('2026-12-28').classList.contains('is-busy'), '3 devoirs -> jour chargé'); eq(day('2026-12-25').classList.contains('is-busy'), false, '1 devoir -> pas chargé');
  has(day('2026-12-25').attrs['aria-label'], '1 à faire', 'label accessible');
  await tap(byAction('calmonth', { i: 1 })); has(D.view.textContent, 'Janvier 2027', 'onglet janvier'); check(day('2027-01-01').classList.contains('has-open'), 'jour de l\'an marqué'); check(day('2027-01-01').querySelector('.bang'), 'urgent marqué'); eq(byAction('calmonth', { i: 1 }).attrs['aria-selected'], 'true', 'onglet sélectionné');
  eq(D.view.querySelectorAll('.blank').length, 4, 'janvier 2027 commence un vendredi : 4 cases vides avec lundi en premier');
  await tap(byAction('calshift', { d: 1 })); eq($$('.tab').map(t => t.textContent), ['Janv.', 'Févr.', 'Mars', 'Avr.'], 'fenêtre glissée'); await tap(byAction('calnow')); eq($$('.tab')[0].textContent, 'Déc.', 'retour à aujourd\'hui');
  await nav('settings'); await tap(byAction('firstday', { v: '0' })); await nav('calendar'); eq($('.weekdays').all()[0].textContent, 'dim', 'dimanche en premier');
  await tap(byAction('calmonth', { i: 1 })); eq(D.view.querySelectorAll('.blank').length, 5, 'janvier 2027 avec dimanche en premier : 5 cases vides');
  // février bissextile
  await boot({ start: T(2028, 2, 10, 9, 0), storage: { 'agenda-etoile-v2': seed([]) } }); await nav('calendar'); eq($$('.day').length, 29, '29 jours en février 2028'); await boot({ start: T(2027, 2, 10, 9, 0), storage: { 'agenda-etoile-v2': seed([]) } }); await nav('calendar'); eq($$('.day').length, 28, '28 jours en février 2027');
});

/* ============ S6 : rappels dans le temps ============ */
await scenarioRun('S6a rappel appli visible', async () => {
  await boot({ perm: 'granted', storage: { 'agenda-etoile-v2': seed([raw('r1', 'Maths ce soir', '2026-09-19', { time: '18:00', reminder: { enabled: true, mode: 'hour1' } })]) } });
  eq(state.db.tasks[0].reminder.status, 'scheduled', 'programmé au démarrage'); eq(state.db.tasks[0].reminder.scheduledAt, T(2026, 9, 19, 17, 0), '1 h avant 18:00');
  await C.advanceTo(T(2026, 9, 19, 16, 59)); eq(D.notifications.length, 0, 'rien avant l\'heure');
  await C.advanceTo(T(2026, 9, 19, 17, 0) + 2000); await settle();
  eq(D.notifications.length, 1, 'une notification système'); has(D.notifications[0].title, 'Devoir bientôt : Maths ce soir', 'titre de la notification'); has(D.toasts.textContent, 'Maths ce soir', 'message dans l\'appli');
  eq(state.db.tasks[0].reminder.status, 'delivered', 'livré'); eq(state.db.tasks[0].reminder.delivery, { attempted: true, delivered: true, failed: false }, 'suivi de livraison');
  await C.advance(3 * 3600000); D.doc; eq(D.notifications.length, 1, 'jamais deux fois');
  D.dispatch(D.root, 'visibilitychange'); await settle(); eq(D.notifications.length, 1, 'retour au premier plan : pas de doublon');
});
await scenarioRun('S6b appli cachée sans permission puis retour', async () => {
  await boot({ perm: 'denied', storage: { 'agenda-etoile-v2': seed([raw('r2', 'Anglais', '2026-09-19', { time: '20:00', reminder: { enabled: true, mode: 'hour1' } })]) } });
  D.visibilityState = 'hidden'; await C.advanceTo(T(2026, 9, 19, 19, 0) + 1000); await settle();
  eq(state.db.tasks[0].reminder.status, 'scheduled', 'différé : reste programmé'); eq(D.notifications.length, 0, 'aucune notification possible');
  check(C.nextTimerAt() !== null && C.nextTimerAt() > C.now(), 'un minuteur futur est armé (pas de boucle)');
  await C.advanceTo(T(2026, 9, 19, 19, 6)); D.visibilityState = 'visible'; D.dispatch(D.root, 'visibilitychange'); await settle();
  eq(state.db.tasks[0].reminder.status, 'delivered', 'retour dans la tolérance : livré dans l\'appli'); has(D.toasts.textContent, 'Anglais', 'message dans l\'appli');
});
await scenarioRun('S6c rappel manqué', async () => {
  await boot({ perm: 'denied', storage: { 'agenda-etoile-v2': seed([raw('m1', 'Sciences', '2026-09-19', { time: '20:00', reminder: { enabled: true, mode: 'hour1' } }), raw('m2', 'Histoire', '2026-09-19', { time: '20:00', reminder: { enabled: true, mode: 'hour1' } })]) } });
  D.visibilityState = 'hidden'; await C.advanceTo(T(2026, 9, 19, 19, 25)); D.visibilityState = 'visible'; D.dispatch(D.root, 'visibilitychange'); await settle();
  eq(state.db.tasks.map(t => t.reminder.status), ['missed', 'missed'], 'les deux sont manqués'); has(D.view.textContent, 'Rappel manqué : Sciences', 'bandeau manqué');
  await tap(byAction('missed-show', { id: 'm1' })); check(D.sheet.open, 'détail ouvert'); eq(state.db.tasks[0].reminder.status, 'delivered', 'afficher = pris en compte');
  await tap(byAction('sheet-close', {}, D.sheetBody)); await tap(byAction('missed-ignore', { id: 'm2' })); eq(state.db.tasks[1].reminder.status, 'cancelled', 'ignorer = annulé'); hasNot(D.view.textContent, 'Rappel manqué', 'plus de bandeau');
  // persistance et redémarrage
  const saved = globalThis.localStorage.getItem('agenda-etoile-v2'); await boot({ storage: { 'agenda-etoile-v2': saved }, start: T(2026, 9, 19, 19, 30) }); hasNot(D.view.textContent, 'Rappel manqué', 'après redémarrage, toujours pas de bandeau');
});
await scenarioRun('S6d minuit pendant que l\'appli est ouverte', async () => {
  await boot({ start: T(2026, 9, 19, 23, 58), storage: { 'agenda-etoile-v2': seed([raw('n1', 'Demain', '2026-09-20', { reminder: { enabled: false } })]) } });
  has(D.view.textContent, 'Samedi 19 septembre', 'avant minuit'); has(D.view.textContent, 'Demain', 'la tâche est dans À venir');
  await C.advance(4 * 60000); await settle();
  has(D.view.textContent, 'Dimanche 20 septembre', 'après minuit le bandeau change de jour sans intervention'); has(D.view.textContent, '1 tâche · 0 terminée · 1 restante', 'la tâche est maintenant celle du jour');
});
await scenarioRun('S6e terminer, supprimer, reporter avant l\'échéance', async () => {
  const mk = (id, extra = {}) => raw(id, 'T' + id, '2026-09-20', { time: '10:00', reminder: { enabled: true, mode: 'hour1' }, ...extra });
  await boot({ perm: 'granted', storage: { 'agenda-etoile-v2': seed([mk('a'), mk('b'), mk('c'), mk('d')]) } });
  await tap(byAction('toggle', { id: 'a' }, D.view)); // terminée
  await tap($$('.task-body').find(b => b.attrs['data-id'] === 'b')); await tap(byAction('delete', { id: 'b' }, D.sheetBody)); // supprimée
  await tap($$('.task-body').find(b => b.attrs['data-id'] === 'c')); await tap(byAction('edit', { id: 'c' }, D.sheetBody)); fill(form(), { date: '2026-09-22' }); await submit(); // reportée de 2 jours
  await C.advanceTo(T(2026, 9, 20, 9, 0) + 60000); await settle();
  eq(D.notifications.map(n => n.title.includes('Td')), [true], 'seule la tâche d est notifiée à 9 h');
  await C.advanceTo(T(2026, 9, 22, 9, 0) + 60000); await settle();
  eq(D.notifications.length, 2, 'la tâche c est notifiée à son nouveau jour'); has(D.notifications[1].title, 'Tc', 'c à la nouvelle date');
});
await scenarioRun('S6f demande de permission', async () => {
  await boot({ perm: 'default', storage: { 'agenda-etoile-v2': seed([]) } }); D.requestPermissionResult = 'granted';
  await tap(D.fab); fill(form(), { title: 'Avec rappel', date: '2026-09-25', reminder: 'eve0' }); await submit();
  eq(D.permissionAsked, 1, 'permission demandée une fois'); eq(globalThis.Notification.permission, 'granted', 'permission accordée');
  await tap(byAction('sheet-close', {}, D.sheetBody)); await tap(D.fab); fill(form(), { title: 'Sans', date: '2026-09-26', reminder: 'none' }); await submit(); eq(D.permissionAsked, 1, 'pas de nouvelle demande sans rappel');
  // refus : l'appli continue de fonctionner
  await boot({ perm: 'default', storage: { 'agenda-etoile-v2': seed([]) } }); D.requestPermissionResult = 'denied'; await tap(D.fab); fill(form(), { title: 'Refus', date: '2026-09-25', reminder: 'eve0' }); await submit(); eq(tasksNow().length, 1, 'tâche créée malgré le refus');
  await nav('settings'); has(D.view.textContent, 'Bloquées', 'état bloqué affiché'); has(D.view.textContent, 'autorise-les pour ce site', 'explication du blocage'); check(!byAction('notif-enable'), 'pas de bouton d\'activation quand bloqué');
});

/* ============ S7 : réglages, export, import, réinitialisation ============ */
await scenarioRun('S7 réglages et données', async () => {
  await boot({ storage: { 'agenda-etoile-v2': seed([raw('e1', 'À exporter', '2026-10-01'), raw('e2', 'Aussi', '2026-10-02', { done: true, completedAt: T(2026, 9, 18) })], {}, 5) } });
  await nav('settings');
  await tap(byAction('theme', { v: 'dark' })); eq(D.documentElement.attrs['data-theme'], 'dark', 'thème sombre'); eq(D.querySelector('meta[name=theme-color]').attrs.content, '#13102A', 'couleur de la barre');
  await tap(byAction('theme', { v: 'system' })); eq(D.documentElement.attrs['data-theme'], 'light', 'système clair'); D.setSystemDark(true); eq(D.documentElement.attrs['data-theme'], 'dark', 'suit le téléphone en direct'); D.setSystemDark(false); eq(D.documentElement.attrs['data-theme'], 'light', 'et redevient clair');
  await tap(byAction('theme', { v: 'light' })); D.setSystemDark(true); eq(D.documentElement.attrs['data-theme'], 'light', 'thème clair forcé ignore le système'); D.setSystemDark(false);
  const sw = byAction('notif-toggle'); eq(sw.attrs['aria-checked'], 'true', 'rappels activés'); await tap(sw); eq(byAction('notif-toggle').attrs['aria-checked'], 'false', 'rappels désactivés'); eq(state.db.settings.notifications, false, 'réglage enregistré');
  await tap(byAction('sound-toggle')); eq(state.db.settings.sound, false, 'son désactivé');
  await tap(byAction('export')); const blob = D.last.blob; check(!!blob, 'fichier exporté'); const exported = JSON.parse(await blob.text());
  eq(exported.app, 'Agenda Étoile', 'nom dans l\'export'); eq(exported.tasks.length, 2, 'tâches exportées'); eq(exported.stats.totalCompleted, 5, 'étoiles exportées'); eq(exported.settings.theme, 'light', 'réglages exportés');
  const fileInput = () => $('#importFile'); const pick = async (text, size) => { fileInput().files = [{ size: size ?? text.length, text: async () => text }]; D.dispatch(fileInput(), 'change'); await settle(); };
  await pick('{pas du json'); has(D.toasts.textContent, 'Importation impossible', 'JSON invalide refusé'); check(!D.modal.open, 'pas de confirmation pour un fichier invalide');
  await pick('x', 6e6); has(D.toasts.textContent, 'Importation impossible', 'fichier trop gros refusé');
  await pick(JSON.stringify({ version: 2, tasks: [{ title: '', date: 'x' }] })); has(D.toasts.textContent, 'aucune tâche valide', 'fichier sans tâche valide');
  await pick(JSON.stringify({ version: 2, tasks: [{ id: 'z1', title: 'Importée', date: '2026-11-11' }, { title: '', date: 'x' }], stats: { totalCompleted: 2 } }));
  check(D.modal.open, 'confirmation demandée'); has(D.modalBody.textContent, 'Tes 2 tâches actuelles seront remplacées par 1 tâche', 'texte de confirmation'); eq(tasksNow().length, 2, 'rien remplacé avant confirmation');
  await tap(byAction('modal-close', {}, D.modalBody)); eq(tasksNow().length, 2, 'annuler garde tout'); check(!D.modal.open, 'modale fermée');
  await pick(JSON.stringify({ version: 2, tasks: [{ id: 'z1', title: 'Importée', date: '2026-11-11' }, { title: '', date: 'x' }], stats: { totalCompleted: 2 } })); await tap(byAction('modal-ok', {}, D.modalBody));
  eq(tasksNow().map(t => t.title), ['Importée'], 'import appliqué'); eq(state.db.stats.totalCompleted, 2, 'étoiles importées'); has(D.toasts.textContent, '1 tâche importée, 1 ignorée', 'toast avec ignorées'); check(globalThis.localStorage.getItem('agenda-etoile-v2-backup'), 'copie de sécurité avant import');
  await pick(JSON.stringify({ stars: 4, tasks: [{ id: 'o1', date: '2026-11-11', type: 'lecon', subject: 'fr', title: 'Ancienne v1', remind: 'eve0', done: false }] })); await tap(byAction('modal-ok', {}, D.modalBody)); eq(state.db.tasks[0].type, 'lesson', 'import d\'un fichier v1'); eq(state.db.stats.totalCompleted, 4, 'étoiles v1');
  await tap(byAction('reset')); check(D.modal.open, 'confirmation de réinitialisation'); await tap(byAction('modal-close', {}, D.modalBody)); eq(tasksNow().length, 1, 'annuler la réinitialisation');
  await tap(byAction('reset')); await tap(byAction('modal-ok', {}, D.modalBody)); eq(tasksNow().length, 0, 'réinitialisé'); eq(state.db.stats.totalCompleted, 0, 'étoiles remises à zéro'); has(D.toasts.textContent, 'réinitialisées', 'toast'); check(globalThis.localStorage.getItem('agenda-etoile-v2-backup'), 'copie de sécurité avant réinitialisation');
  eq(state.db.settings.theme, 'system', 'réglages par défaut après reset');
});

/* ============ S8 : stockage plein ============ */
await scenarioRun('S8 stockage plein', async () => {
  const ts = Array.from({ length: 5 }, (_, i) => raw('s' + i, 'Tâche ' + i, '2026-09-19', { reminder: { enabled: false } }));
  await boot({ storage: { 'agenda-etoile-v2': seed(ts) } });
  const used = globalThis.localStorage.getItem('agenda-etoile-v2').length + 'agenda-etoile-v2'.length;
  globalThis.localStorage.maxChars = used + 5; // plus de place
  await tap(byAction('toggle', { id: 's0' }, D.view));
  eq(state.saveOk, false, 'échec d\'écriture détecté'); has(D.toasts.textContent, 'espace insuffisant', 'toast d\'alerte'); check(D.toasts.querySelector('.toast-btn'), 'bouton Exporter proposé');
  await nav('today'); has(D.view.textContent, 'Impossible d’enregistrer cette modification', 'bandeau persistant'); check(byAction('export', {}, D.view), 'export proposé dans le bandeau');
  await tap(byAction('export', {}, D.view)); check(!!D.last.blob, 'export possible malgré le stockage plein'); const exp = JSON.parse(await D.last.blob.text()); eq(exp.tasks.find(t => t.id === 's0').done, true, 'l\'export contient la modification non enregistrée');
  // import trop gros : refusé, données conservées
  await nav('settings'); const big = JSON.stringify({ version: 2, tasks: Array.from({ length: 300 }, (_, i) => ({ id: 'b' + i, title: 'Grosse tâche ' + i, date: '2026-10-01' })) });
  $('#importFile').files = [{ size: big.length, text: async () => big }]; D.dispatch($('#importFile'), 'change'); await settle(); await tap(byAction('modal-ok', {}, D.modalBody));
  has(D.toasts.textContent, 'pas assez d’espace', 'import refusé faute de place'); eq(tasksNow().length, 5, 'données actuelles conservées');
  // retour à la normale
  globalThis.localStorage.maxChars = Infinity; await nav('today'); await tap(byAction('toggle', { id: 's1' }, D.view)); eq(state.saveOk, true, 'écriture rétablie'); hasNot(D.view.textContent, 'Impossible d’enregistrer', 'bandeau disparu'); eq(JSON.parse(globalThis.localStorage.getItem('agenda-etoile-v2')).tasks.filter(t => t.done).length, 2, 'tout est enfin enregistré (s0 et s1)');
});

/* ============ S9 : démarrages difficiles ============ */
await scenarioRun('S9a base corrompue', async () => {
  await boot({ storage: { 'agenda-etoile-v2': '{"version":2,"tasks":[{"title":' } });
  has(D.view.textContent, 'Impossible de charger les données', 'bandeau d\'erreur'); check(byAction('reload'), 'bouton Réessayer'); eq(globalThis.localStorage.getItem('agenda-etoile-v2-corrupt-backup'), '{"version":2,"tasks":[{"title":', 'copie de récupération');
  await tap(D.fab); fill(form(), { title: 'Je continue', date: '2026-09-25', reminder: 'none' }); await submit(); eq(tasksNow().length, 1, 'l\'appli reste utilisable');
  await tap(byAction('reload')); check(D.reloaded, 'recharger la page');
  await boot({ storage: { 'agenda-etoile-v2': globalThis.localStorage.getItem('agenda-etoile-v2') } }); hasNot(D.view.textContent, 'Impossible de charger', 'après une sauvegarde valide, plus d\'erreur');
});
await scenarioRun('S9b migration v1', async () => {
  const v1 = { stars: 6, tasks: [{ id: 'a1', date: '2026-09-19', type: 'devoir', subject: 'algebre', title: 'Exercices 4 et 5', note: 'page 62', remind: 'eve0', done: false }, { id: 'a2', date: '2026-09-25', type: 'lecon', subject: 'fr', title: 'Poème', remind: 'eve18', done: false }, { id: 'a4', date: '2026-09-19', type: 'projet', subject: 'hist', title: 'Exposé', remind: 'none', done: true }] };
  await boot({ storage: { 'agenda-etoile-v1': JSON.stringify(v1) } });
  has(D.view.textContent, '★ 6 · Niveau 2', 'étoiles migrées'); has(D.view.textContent, 'Exercices 4 et 5', 'tâche migrée'); check(globalThis.localStorage.getItem('agenda-etoile-v1'), 'ancienne base conservée'); check(globalThis.localStorage.getItem('agenda-etoile-v2'), 'nouvelle base écrite');
  eq(state.db.tasks.find(t => t.id === 'a1').reminder.status, 'cancelled', 'rappel déjà passé -> annulé, pas de fausse alerte'); eq(state.db.tasks.find(t => t.id === 'a2').reminder.status, 'scheduled', 'rappel futur conservé'); hasNot(D.view.textContent, 'Rappel manqué', 'pas de manqué après migration');
  check(D.modal.open, 'onboarding affiché pour un premier lancement v2');
});
await scenarioRun('S9c stockage indisponible', async () => {
  await boot({}); const ls = globalThis.localStorage; ls.setItem = () => { throw new Error('SecurityError'); };
  await boot({}); // relance avec un stockage qui refuse tout
  const broken = makeStub(); broken.setItem = () => { throw new Error('SecurityError'); }; globalThis.localStorage = broken; state.status = 'ok';
  const { init } = await import('../../js/state.js'); init(); ui.render(); await settle();
  eq(state.status, 'unavailable', 'stockage indisponible détecté'); has(D.view.textContent, 'bloque l’enregistrement', 'bandeau'); check(byAction('export', {}, D.view), 'export proposé');
});
await scenarioRun('S9d ouverture par notification', async () => {
  await boot({ search: '?task=k1', storage: { 'agenda-etoile-v2': seed([raw('k1', 'Depuis la notification', '2026-10-05')]) } });
  check(D.sheet.open, 'détail ouvert'); has(D.sheetBody.textContent, 'Depuis la notification', 'bonne tâche');
  await boot({ search: '?task=inconnu', storage: { 'agenda-etoile-v2': seed([]) } }); check(!D.sheet.open, 'id inconnu : aucune fenêtre, aucune erreur');
});

/* ============ S10 : textes hostiles et limites ============ */
await scenarioRun('S10 injections et Unicode', async () => {
  await boot({ storage: { 'agenda-etoile-v2': seed([]) } });
  const titles = ['<script>alert(1)</script>', '<img src=x onerror=alert(1)>', '"><b>gras</b>', '\' OR 1=1 --', 'مرحبا بالعالم 👩‍🏫 é', 'é'.repeat(40) + 'e\u0301'.repeat(20), '{{7*7}} ${7*7} %s', '   espaces autour   '];
  for (const t of titles) { await tap(D.fab); fill(form(), { title: t, note: '<b>note</b>' + 'x'.repeat(50), date: '2026-09-25', reminder: 'none' }); await submit(); await tap(byAction('sheet-close', {}, D.sheetBody)); }
  eq(tasksNow().length, titles.length, 'tout est créé'); eq(tasksNow()[7].title, 'espaces autour', 'espaces rognés');
  await nav('tasks'); const shown = cards().map(c => c.textContent);
  for (const t of titles.slice(0, 5)) check(shown.some(s => s.includes(t)), `le titre est affiché tel quel : ${t.slice(0, 30)}`);
  check(!D.root.all().some(e => ['SCRIPT', 'IMG', 'B'].includes(e.tagName)), 'aucune balise injectée');
  eq(tasksNow().length, new Set(tasksNow().map(t => t.id)).size, 'identifiants uniques');
  await tap(D.fab); fill(form(), { title: 'Limite', note: 'n'.repeat(400), date: '2026-09-25', reminder: 'none' }); await submit(); eq(tasksNow().length, titles.length + 1, 'note de 400 caractères acceptée');
});

/* ============ S11 : clavier, focus, hors ligne, mise à jour ============ */
await scenarioRun('S11 focus et messages système', async () => {
  await boot({ storage: { 'agenda-etoile-v2': seed([raw('f1', 'Focus', '2026-09-19')]) } });
  D.fab.focus(); await tap(D.fab); check(D.sheet.open, 'ouverte'); D.pressEscape(); await C.advance(5); check(!D.sheet.open, 'Échap ferme la fiche'); check(D.activeElement === D.fab, 'le focus revient au bouton qui a ouvert la fiche');
  await nav('calendar'); const d19 = $$('.day').find(d => d.attrs['data-key'] === '2026-09-19'); d19.focus(); await tap(d19); D.pressEscape(); await C.advance(5); check(D.activeElement && D.activeElement.isConnected, 'focus jamais perdu dans le vide');
  await tap(byAction('nav', { view: 'today' })); const tb = $$('.task-body')[0]; tb.focus(); await tap(tb); check(D.sheet.open, 'détail'); await tap(byAction('toggle', { id: 'f1' }, D.sheetBody)); check(D.sheet.open, 'la fiche reste ouverte après avoir terminé'); has(D.sheetBody.textContent, 'Rouvrir', 'bouton mis à jour dans la fiche');
  D.pressEscape(); await C.flush();
  D.winFire('offline'); await settle(); has(D.view.textContent, 'Hors connexion', 'bandeau hors connexion'); D.winFire('online'); await settle(); hasNot(D.view.textContent, 'Hors connexion', 'bandeau retiré');
  const msgs = []; ui.setUpdateWaiting({ postMessage: m => msgs.push(m) }); await settle(); has(D.view.textContent, 'nouvelle version', 'bandeau de mise à jour'); await tap(byAction('update')); eq(msgs, [{ type: 'SKIP_WAITING' }], 'demande d\'activation envoyée');
  ui.setUpdateWaiting(null); await settle();
  // onboarding fermé par Échap : ne réapparaît pas
  await boot({}); check(D.modal.open, 'onboarding'); D.pressEscape(); await C.flush(); eq(state.db.settings.onboarded, true, 'Échap sur l\'onboarding est mémorisé');
});

/* ============ S12 : rafales d'interactions ============ */
await scenarioRun('S12 rafales', async () => {
  await boot({ storage: { 'agenda-etoile-v2': seed(Array.from({ length: 20 }, (_, i) => raw('x' + i, 'Rafale ' + i, '2026-09-19', { reminder: { enabled: false } }))) } });
  for (let i = 0; i < 40; i++) { D.click(byAction('toggle', { id: 'x' + (i % 20) }, D.view) || D.fab); }
  await settle(); eq(state.db.stats.totalCompleted, 20, 'chaque tâche rapporte exactement une étoile malgré la rafale');
  for (let r = 0; r < 3; r++) for (const v of ['calendar', 'tasks', 'progress', 'settings', 'today']) D.click(byAction('nav', { view: v }));
  await settle(); eq(state.ui.view, 'today', 'navigation rapide cohérente');
  D.click(D.fab); D.click(D.fab); await settle(); eq($$('#taskForm').length, 1, 'deux ouvertures rapides = un seul formulaire');
  D.pressEscape(); await C.flush();
  await C.advance(3000); const st0 = C.fires(); await C.advance(30 * 24 * 3600000); check(C.fires() - st0 <= 32, `pas d'activité de minuteur excessive en 30 jours (${C.fires() - st0}, attendu ≈ 1 par minuit)`);
});

console.log(`\nJournées simulées : ${checks} vérifications`);
if (failures.length) { console.log(`${failures.length} ÉCHEC(S) :`); failures.forEach(f => console.log(' - ' + f)); process.exit(1); }
console.log('Aucun échec.');

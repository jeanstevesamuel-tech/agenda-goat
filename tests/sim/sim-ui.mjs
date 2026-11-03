// Parcours utilisateur complets dans l'interface réelle (mini-DOM) : du premier lancement à la réinitialisation.
import { makeStub } from '../stub.mjs';
globalThis.localStorage = makeStub();
const { installShim, audit } = await import('../shim.mjs');
const sh = installShim();
const { registry, doc, dispatch, tick, type, check, field, submit } = sh;
const U = await import('../../js/utils.js');
const { S } = await import('../../js/strings.fr.js');
const { state, init } = await import('../../js/state.js');
const ui = await import('../../js/ui.js');
const { planAll } = await import('../../js/reminders.js');
const ST = await import('../../js/storage.js');
const { createTask } = await import('../../js/tasks.js');

const problems = []; let checks = 0;
const expect = (cond, msg) => { checks++; if (!cond) problems.push(msg); };
const TODAY = U.getToday();
const form = () => registry.sheetBody.querySelector('#taskForm');
const err = k => (form()?.querySelector(`[data-err="${k}"]`)?.textContent || '');
const mk = (o = {}) => ({ title: 'Tâche', note: '', subject: 'algebre', type: 'homework', date: TODAY, time: '', priority: 'normal', reminderEnabled: false, reminderMode: 'eve0', ...o });
const addRaw = o => { const t = createTask(mk(o)); state.db.tasks.push(t); return t; };
const reindexAll = async () => { const { commit } = await import('../../js/state.js'); commit(); ui.render(); };
async function fill(f) {
  const fm = form();
  if (f.title !== undefined) type(field(fm, 'title'), f.title);
  if (f.date !== undefined) type(field(fm, 'date'), f.date);
  if (f.time !== undefined) type(field(fm, 'time'), f.time);
  if (f.note !== undefined) type(field(fm, 'note'), f.note);
  if (f.reminder !== undefined) type(field(fm, 'reminder'), f.reminder);
  for (const k of ['subject', 'type', 'priority']) if (f[k] !== undefined) check(fm, k, f[k]);
  await submit(fm);
}
const audits = [];
const auditView = where => audits.push(...audit(registry.view, where));

/* ===== 0. Premier lancement ===== */
const r0 = init(); planAll();
expect(r0.status === 'fresh', `premier lancement : statut ${r0.status}`);
ui.initUI();
expect(registry.modal.open, 'onboarding non affiché au premier lancement');
expect(registry.modalBody.textContent.includes(S.onboarding.title), 'texte d\'onboarding absent');
registry.modal.close(); // fermeture par Échap
expect(state.db.settings.onboarded, 'onboarding fermé par Échap : non mémorisé (il reviendrait à chaque lancement)');
expect(registry.view.textContent.includes(S.today.noTask), 'écran Aujourd\'hui vide : message d\'état vide absent');
expect(registry.view.textContent.includes(S.today.calm), 'écran Aujourd\'hui vide : « Profite du calme » absent');
auditView('Aujourd\'hui (vide)');
expect(registry.view.querySelectorAll('.hero-date').length === 1, 'titre de page : un seul h1 attendu (Aujourd\'hui)');

/* ===== 1. Ajouter une tâche (bouton +) ===== */
await dispatch('add', {});
expect(registry.sheet.open, 'formulaire non ouvert');
expect(form(), 'formulaire absent');
expect(field(form(), 'date').value === TODAY, 'date par défaut ≠ aujourd\'hui');
auditView('formulaire'); audits.push(...audit(registry.sheetBody, 'formulaire'));
await fill({ title: '   ' });
expect(err('title').length > 0, 'titre vide accepté sans message');
expect(state.db.tasks.length === 0, 'tâche créée avec un titre vide');
await fill({ title: 'x'.repeat(81) });
expect(err('title').length > 0 && state.db.tasks.length === 0, 'titre de 81 caractères accepté');
await fill({ title: 'Exercices 4 et 5', date: '' });
expect(err('date').length > 0 && state.db.tasks.length === 0, 'date vide acceptée');
await fill({ date: '2026-02-30' });
expect(err('date').length > 0 && state.db.tasks.length === 0, 'date inexistante (30 février) acceptée');
await fill({ date: TODAY, time: '25:00' });
expect(err('time').length > 0 && state.db.tasks.length === 0, 'heure 25:00 acceptée');
await fill({ time: '', reminder: 'hour1' });
expect(err('reminder').length > 0 && state.db.tasks.length === 0, 'rappel « 1 heure avant » sans heure accepté');
await fill({ reminder: 'none', note: 'n'.repeat(401) });
expect(err('note').length > 0 && state.db.tasks.length === 0, 'note de 401 caractères acceptée');
// note de 400 caractères avec retours à la ligne (le navigateur peut renvoyer des CRLF)
await fill({ note: 'a\nb\n'.repeat(100) });
expect(state.db.tasks.length === 1, 'une note de 400 caractères avec retours à la ligne est refusée (CRLF compté double) : ' + err('note'));
if (state.db.tasks.length === 0) { await fill({ note: 'ok' }); }
const t1 = state.db.tasks[0];
expect(t1 && t1.title === 'Exercices 4 et 5', 'titre enregistré incorrect');
expect(t1 && !t1.note.includes('\r'), 'la note contient des \\r');
expect(registry.sheetBody.textContent.includes(U.formatDate(TODAY, { weekday: true })), 'après enregistrement : la fiche du jour n\'est pas affichée');
expect(ST.load && JSON.parse(localStorage.getItem(ST.KEY)).tasks.length === 1, 'tâche non écrite dans le stockage');
await dispatch('sheet-close');
expect(!doc.body.className.includes('no-scroll'), 'le défilement reste bloqué après fermeture de la fiche');
expect(registry.view.textContent.includes('Exercices 4 et 5'), 'la tâche n\'apparaît pas sur l\'écran Aujourd\'hui');

/* ===== 2. Détail, modification, suppression, annulation ===== */
await dispatch('open', { id: t1.id });
expect(registry.sheetBody.textContent.includes('Exercices 4 et 5'), 'détail sans le titre');
audits.push(...audit(registry.sheetBody, 'détail'));
await dispatch('edit', { id: t1.id });
expect(field(form(), 'title').value === 'Exercices 4 et 5', 'formulaire de modification pré-rempli faux');
await fill({ title: 'Exercices 4, 5 et 6', priority: 'urgent', time: '18:30', reminder: 'hour1' });
expect(state.db.tasks[0].title === 'Exercices 4, 5 et 6' && state.db.tasks[0].priority === 'urgent', 'modification non enregistrée');
expect(state.db.tasks[0].reminder.mode === 'hour1' && state.db.tasks[0].time === '18:30', 'rappel non mis à jour à la modification');
expect(registry.sheetBody.textContent.includes('Exercices 4, 5 et 6'), 'après modification, retour au détail attendu');
await dispatch('delete', { id: t1.id });
expect(state.db.tasks.length === 0, 'suppression sans effet');
const undoBtn = registry.toasts.querySelector('.toast-btn');
expect(undoBtn, 'pas de bouton Annuler après suppression');
if (undoBtn) { undoBtn.fire('click'); await tick(); }
expect(state.db.tasks.length === 1 && state.byDate.get(TODAY)?.length === 1, 'annulation de suppression : tâche/index non rétablis');

/* ===== 3. Terminer, étoiles, niveaux, double-clic ===== */
state.db.tasks.length = 0; state.db.stats.totalCompleted = 0; await reindexAll();
const ts = Array.from({ length: 6 }, (_, i) => addRaw({ title: 'Devoir ' + i })); await reindexAll();
await dispatch('nav', { view: 'today' });
await dispatch('toggle', { id: ts[0].id }); await dispatch('toggle', { id: ts[0].id }); await dispatch('toggle', { id: ts[0].id });
expect(state.db.stats.totalCompleted === 1, `3 clics sur la même tâche : ${state.db.stats.totalCompleted} étoile(s) au lieu de 1`);
await dispatch('toggle', { id: ts[0].id }); // rouverte
for (let i = 1; i <= 4; i++) await dispatch('toggle', { id: ts[i].id });
expect(state.db.stats.totalCompleted === 5, `5 tâches terminées : ${state.db.stats.totalCompleted} étoiles`);
expect(registry.celebrate.textContent.includes(S.toast.levelUp(2)), 'pas d\'animation de niveau supérieur au 5e étoile');
expect(registry.view.querySelector('.hero-star')?.textContent.includes('Niveau 2'), 'bandeau : niveau 2 non affiché');
registry.celebrate.textContent = '';
await dispatch('toggle', { id: ts[5].id }); await dispatch('toggle', { id: ts[0].id });
expect(!registry.celebrate.textContent.includes('Niveau'), 'animation de niveau répétée sans changement de niveau');
// Terminer la dernière tâche du jour : le message « tout est terminé » doit apparaître
const left = state.db.tasks.filter(t => !t.done);
for (const t of left) await dispatch('toggle', { id: t.id });
expect(state.db.tasks.every(t => t.done) && registry.view.textContent.includes(S.today.allDone), 'dernière tâche du jour terminée : message « Tout est terminé aujourd\'hui » absent (écran non mis à jour)');
auditView('Aujourd\'hui (tout terminé)');

/* ===== 4. Calendrier ===== */
await dispatch('nav', { view: 'calendar' });
auditView('Calendrier');
expect(registry.view.querySelectorAll('.page-title').length === 1, 'calendrier : un seul h1 attendu');
const dim = (y, m) => new Date(y, m + 1, 0).getDate();
let calChecks = 0;
for (const first of [1, 0]) {
  state.db.settings.firstDayOfWeek = first;
  for (let y = 2026; y <= 2028; y++) for (let m = 0; m < 12; m++) {
    state.ui.calYear = y; state.ui.calMonth = m; state.ui.calSel = 0; ui.render();
    const grid = registry.view.querySelector('.grid'), cells = grid.children;
    const blanks = cells.filter(c => c.className === 'blank').length, days = cells.filter(c => c.className.split(' ').includes('day')).length;
    const lead = (new Date(y, m, 1).getDay() - first + 7) % 7;
    if (blanks !== lead || days !== dim(y, m)) problems.push(`grille ${y}-${m + 1} (1er jour=${first}) : ${blanks} vides/${days} jours, attendu ${lead}/${dim(y, m)}`);
    const wd = registry.view.querySelector('.weekdays').children.map(c => c.textContent);
    if (wd[0] !== S.daysShort[first]) problems.push(`en-tête des jours (1er jour=${first}) : commence par ${wd[0]}`);
    const tabs = registry.view.querySelector('.tabs').children.map(c => c.attrs['aria-label']);
    for (let i = 0; i < 4; i++) { const d = new Date(y, m + i, 1); if (tabs[i] !== `${S.months[d.getMonth()]} ${d.getFullYear()}`) problems.push(`onglet ${i} de ${y}-${m + 1} : ${tabs[i]}`); }
    // chaque jour : le nom du jour dans l'étiquette d'accessibilité correspond au vrai jour de la semaine
    for (let d = 1; d <= dim(y, m); d += 9) { const label = cells.filter(c => c.className.split(' ').includes('day'))[d - 1].attrs['aria-label'].toLowerCase(); if (!label.startsWith(S.days[new Date(y, m, d).getDay()])) problems.push(`étiquette du ${d}/${m + 1}/${y} : ${label}`); }
    calChecks++;
  }
}
state.db.settings.firstDayOfWeek = 1;
checks += calChecks;
// jour d'aujourd'hui, jours chargés
state.ui.calYear = new Date().getFullYear(); state.ui.calMonth = new Date().getMonth(); state.ui.calSel = 0;
state.db.tasks.length = 0; for (let i = 0; i < 3; i++) addRaw({ title: 'Cal ' + i }); await reindexAll();
const todayCells = registry.view.querySelectorAll('.is-today');
expect(todayCells.length === 1, `${todayCells.length} case(s) « aujourd'hui »`);
expect(todayCells[0]?.className.includes('is-busy') && todayCells[0]?.className.includes('has-open'), 'jour avec 3 tâches non marqué chargé');
expect(todayCells[0]?.attrs['aria-current'] === 'date', 'aria-current absent sur aujourd\'hui');
await dispatch('day', { key: TODAY });
expect(registry.sheetBody.textContent.includes('3 tâches'), 'fiche du jour : « 3 tâches » absent');
audits.push(...audit(registry.sheetBody, 'fiche du jour')); await dispatch('sheet-close');
// navigation de mois
const before = state.ui.calMonth; await dispatch('calshift', { d: 1 }); await dispatch('calshift', { d: -1 });
expect(state.ui.calMonth === before, 'navigation de mois : aller-retour incohérent');
state.ui.calMonth = 11; state.ui.calYear = 2026; await dispatch('calshift', { d: 1 });
expect(state.ui.calMonth === 0 && state.ui.calYear === 2027, `décembre → janvier : ${state.ui.calMonth}/${state.ui.calYear}`);
await dispatch('calnow', {}); expect(state.ui.calMonth === new Date().getMonth() && state.ui.calSel === 0, 'bouton Aujourd\'hui du calendrier');

/* ===== 5. Tâches : recherche, filtres, pagination ===== */
state.db.tasks.length = 0;
for (let i = 0; i < 150; i++) addRaw({ title: (i % 10 === 0 ? 'Éléphant ' : 'Exercice ') + i, date: U.addDays(TODAY, i % 30 - 10), subject: i % 2 ? 'algebre' : 'francais', priority: i % 25 === 0 ? 'urgent' : 'normal' });
state.db.tasks[3].done = true; state.db.tasks[7].done = true; await reindexAll();
await dispatch('nav', { view: 'tasks' }); await tick(10);
auditView('Tâches');
const listText = () => registry.view.querySelector('#taskList')?.textContent || '';
expect(/150 résultats/.test(listText()), 'liste complète : « 150 résultats » absent : ' + listText().slice(0, 60));
expect(registry.view.querySelectorAll('.task').length === 60, `pagination : ${registry.view.querySelectorAll('.task').length} cartes au lieu de 60`);
await dispatch('more', {}); expect(registry.view.querySelectorAll('.task').length === 120, 'pagination : « Afficher plus » ne charge pas 60 de plus');
const q = registry.view.querySelector('#q');
for (const [query, n] of [['elephant', 15], ['ÉLÉPHANT', 15], ['  elephant  ', 15], ['algebre', 75], ['zzzz', 0]]) {
  q.value = query; doc.fire('input', { target: q }); await tick(200);
  const m = listText().match(/(\d+) résultat/); const got = m ? Number(m[1]) : (listText().includes(S.tasks.none) ? 0 : -1);
  expect(got === n, `recherche « ${query} » : ${got} résultat(s) au lieu de ${n}`);
}
q.value = ''; doc.fire('input', { target: q }); await tick(200);
for (const [f, n] of [['todo', 148], ['done', 2], ['urgent', 6], ['all', 150]]) { await dispatch('filter', { f }); const m = listText().match(/(\d+) résultat/); expect((m ? Number(m[1]) : 0) === n, `filtre ${f} : ${m ? m[1] : 0} au lieu de ${n}`); }
await dispatch('filter', { f: 'all' });

/* ===== 6. Progression ===== */
await dispatch('nav', { view: 'progress' }); auditView('Progression');
expect(registry.view.textContent.includes(S.progress.week), 'progression : bloc « Cette semaine » absent');
expect(registry.view.querySelectorAll('.page-title').length === 1, 'progression : un seul h1 attendu');

/* ===== 7. Réglages, thème, export, import, réinitialisation ===== */
await dispatch('nav', { view: 'settings' }); auditView('Réglages');
await dispatch('theme', { v: 'dark' }); expect(doc.documentElement.attrs['data-theme'] === 'dark', 'thème sombre non appliqué');
await dispatch('theme', { v: 'system' }); expect(doc.documentElement.attrs['data-theme'] === 'light', 'thème système (clair) non appliqué');
let blobs = 0; URL.createObjectURL = () => { blobs++; return 'blob:x'; };
await dispatch('export', {}); expect(blobs === 1, 'export : aucun fichier créé');
const goodFile = JSON.parse(ST.exportData(state.db));
async function importText(text) {
  const input = registry.view.querySelector('#importFile'); input.files = [new Blob([text], { type: 'application/json' })];
  doc.fire('change', { target: input }); await tick(40);
}
await importText('{pas du json'); expect(!registry.modal.open && registry.toasts.textContent.includes(S.errors.importFail), 'import JSON invalide : pas de message clair');
await importText(JSON.stringify({ tasks: 'x' })); expect(!registry.modal.open && registry.toasts.textContent.includes(S.errors.importFail), 'import structure invalide : pas de message');
await importText(JSON.stringify({ ...goodFile, tasks: [{ title: '', date: 'x' }] })); expect(!registry.modal.open && registry.toasts.textContent.includes(S.errors.importEmpty), 'import sans tâche valide : message attendu');
const big = new Blob(['x'.repeat(5000001)]); { const input = registry.view.querySelector('#importFile'); input.files = [big]; doc.fire('change', { target: input }); await tick(40); }
expect(!registry.modal.open && registry.toasts.textContent.includes(S.errors.importFail), 'import > 5 Mo : refus attendu');
const nBefore = state.db.tasks.length;
await importText(JSON.stringify({ ...goodFile, tasks: goodFile.tasks.slice(0, 10), stats: { totalCompleted: 3 } }));
expect(registry.modal.open, 'import valide : confirmation absente');
audits.push(...audit(registry.modalBody, 'confirmation d\'import'));
registry.modal.close(); await tick();
expect(state.db.tasks.length === nBefore, 'annuler la confirmation d\'import a modifié les données');
await importText(JSON.stringify({ ...goodFile, tasks: goodFile.tasks.slice(0, 10), stats: { totalCompleted: 3 } })); await dispatch('modal-ok');
expect(state.db.tasks.length === 10 && state.db.stats.totalCompleted === 3, `import confirmé : ${state.db.tasks.length} tâches, ${state.db.stats.totalCompleted} étoiles`);
expect(!!localStorage.getItem(ST.BACKUP_KEY), 'import : pas de copie de sécurité avant remplacement');
// import quand le stockage est plein
const cur = state.db.tasks.length; localStorage.maxChars = JSON.stringify(state.db).length + 200;
await importText(JSON.stringify({ ...goodFile })); await dispatch('modal-ok');
expect(state.db.tasks.length === cur, 'import refusé par le stockage : les données actuelles ont été remplacées quand même'); expect(registry.toasts.textContent.includes(S.toast.importNoSpace), 'import trop gros : message attendu');
// stockage plein en ajoutant/cochant
const t = state.db.tasks[0]; localStorage.maxChars = 10;
await dispatch('nav', { view: 'today' }); await dispatch('toggle', { id: t.id });
expect(!state.saveOk, 'stockage plein : saveOk devrait être faux'); expect(registry.toasts.textContent.includes('espace'), 'stockage plein : message d\'alerte absent');
expect(registry.view.textContent.includes(S.actions.exportShort), 'stockage plein : bandeau avec bouton Exporter absent');
localStorage.maxChars = Infinity; await dispatch('toggle', { id: t.id }); expect(state.saveOk, 'saveOk ne revient pas à vrai après une écriture réussie');
// réinitialisation
await dispatch('nav', { view: 'settings' }); await dispatch('reset', {});
expect(registry.modal.open, 'réinitialisation : confirmation absente'); await dispatch('modal-close', {}); expect(state.db.tasks.length > 0, 'annuler la réinitialisation a supprimé les données');
await dispatch('reset', {}); await dispatch('modal-ok', {});
expect(state.db.tasks.length === 0 && state.db.stats.totalCompleted === 0, 'réinitialisation sans effet'); expect(!!localStorage.getItem(ST.BACKUP_KEY), 'réinitialisation : pas de copie de sécurité');

/* ===== 8. Rappels manqués (bandeau) ===== */
await dispatch('nav', { view: 'today' });
const a = addRaw({ title: 'Manqué normal', reminderEnabled: true, date: U.addDays(TODAY, 1) }); a.reminder.status = 'missed'; a.reminder.delivery = { attempted: false, delivered: false, failed: true };
const b = addRaw({ title: 'Manqué puis terminé', reminderEnabled: true, date: U.addDays(TODAY, 1) }); b.reminder.status = 'missed'; b.reminder.delivery = { attempted: false, delivered: false, failed: true };
await reindexAll();
expect(registry.view.textContent.includes('Manqué normal'), 'bandeau de rappel manqué absent');
await dispatch('toggle', { id: b.id }); ui.render();
expect(!registry.view.querySelectorAll('.banner-alert').some(x => x.textContent.includes('Manqué puis terminé')), 'une tâche TERMINÉE reste affichée comme « rappel manqué »');
expect(b.reminder.status !== 'missed', `tâche terminée : rappel toujours « ${b.reminder.status} »`);
await dispatch('missed-show', { id: a.id }); expect(a.reminder.status === 'delivered' && registry.sheet.open, 'Afficher : rappel non marqué vu / détail non ouvert');
await dispatch('sheet-close');

/* ===== 9. Bandeaux d'état ===== */
state.online = false; ui.render(); expect(registry.view.textContent.includes('Hors connexion'), 'bandeau hors connexion absent'); state.online = true;
let posted = null; ui.setUpdateWaiting({ postMessage: m => { posted = m; } });
expect(registry.view.textContent.includes(S.banner.update), 'bandeau de mise à jour absent'); await dispatch('update', {}); expect(posted && posted.type === 'SKIP_WAITING', 'bouton Mettre à jour : message SKIP_WAITING non envoyé');
state.status = 'corrupt'; ui.render(); expect(registry.view.textContent.includes(S.banner.corrupt), 'bandeau base corrompue absent'); state.status = 'ok';

/* ===== 10. Résistance : donnée invalide, jamais d'écran blanc ===== */
const broken = { id: 'zz', title: 'Cassée', date: TODAY, subject: 'zzz', type: 'zzz', done: false, priority: 'normal' }; // pas de reminder
state.db.tasks.push(broken); state.byDate = new Map([[TODAY, [broken]]]); ui.render();
expect(registry.view.childElementCount > 0, 'donnée invalide : écran blanc');
expect(registry.view.textContent.includes(S.banner.crash) && registry.view.querySelectorAll('[data-action="reload"]').length === 1, 'donnée invalide : panneau d\'erreur avec « Réessayer » attendu');
state.db.tasks.pop();

/* ===== 11. Raccourci PWA « Nouvelle tâche » et ouverture par notification ===== */
expect(typeof ui.openNewTask === 'function', 'le raccourci du manifeste (?new=1) n\'ouvre rien : aucune fonction openNewTask');
if (typeof ui.openTaskById === 'function') { ui.openTaskById('inexistant'); expect(true, ''); }

console.log(`Interface : ${checks} vérifications sur des parcours complets (${calChecks} mois × 2 réglages de semaine), ${audits.length} défaut(s) d'accessibilité, ${problems.length} problème(s)`);
for (const p of [...new Set(audits)]) console.log('  ♿ ' + p);
for (const p of problems) console.log('  ✗ ' + p);
process.exit(problems.length || audits.length ? 1 : 0);

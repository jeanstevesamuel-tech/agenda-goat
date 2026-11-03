// Fumée : mini-DOM factice pour exécuter réellement les vues et les actions de l'interface.
// Ne remplace pas un test dans un vrai navigateur.
const errors = [];
process.on('unhandledRejection', e => errors.push('rejet: ' + (e && e.stack || e)));
class Txt { constructor(t) { this._t = String(t); this.isText = true; } get textContent() { return this._t; } }
class El {
  constructor(tag) { this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.className = ''; this.listeners = {}; this.parent = null; this.open = false; this.hidden = false; this.value = ''; this.checked = false; this.style = { setProperty() {} }; this.classList = { add() {}, remove() {}, toggle: (c, on) => { const set = new Set(this.className.split(' ').filter(Boolean)); (on ? set.add(c) : set.delete(c)); this.className = [...set].join(' '); } }; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } removeAttribute(k) { delete this.attrs[k]; }
  get dataset() { const d = {}; for (const k in this.attrs) if (k.startsWith('data-')) d[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this.attrs[k]; return d; }
  append(...k) { for (const n of k) { const c = typeof n === 'string' ? new Txt(n) : n; c.parent = this; this.children.push(c); } }
  set textContent(v) { this.children = []; if (v !== '') this.children.push(new Txt(v)); }
  get textContent() { return this.children.map(c => c.textContent).join(' '); }
  get childElementCount() { return this.children.filter(c => !c.isText).length; }
  replaceWith(n) { const i = this.parent.children.indexOf(this); n.parent = this.parent; this.parent.children[i] = n; }
  matches(sel) {
    let m;
    if ((m = sel.match(/^\.([\w-]+)(?:\[([\w-]+)="([^"]+)"\])?$/))) return this.className.split(' ').includes(m[1]) && (!m[2] || this.attrs[m[2]] === m[3]);
    if ((m = sel.match(/^#([\w-]+)$/))) return this.attrs.id === m[1];
    if ((m = sel.match(/^\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/))) return m[1] in this.attrs && (m[2] === undefined || this.attrs[m[1]] === m[2]);
    return false;
  }
  all() { const out = []; const walk = n => { for (const c of n.children) { if (!c.isText) { out.push(c); walk(c); } } }; walk(this); return out; }
  querySelector(sel) { return this.all().find(e => e.matches(sel)) || null; }
  querySelectorAll(sel) { return this.all().filter(e => e.matches(sel)); }
  closest(sel) { let n = this; while (n && !n.isText) { if (n.matches && n.matches(sel)) return n; n = n.parent; } return null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  fire(t, e = {}) { (this.listeners[t] || []).forEach(f => f({ target: this, ...e })); }
  focus() {} click() {} remove() {} showModal() { this.open = true; } close() { if (this.open) { this.open = false; this.fire('close'); } }
  getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }
}
const registry = {};
const doc = new El('#doc'); doc.body = new El('body'); doc.documentElement = new El('html');
doc.createElement = t => new El(t);
doc.querySelector = sel => { const m = sel.match(/^#([\w-]+)$/); if (m) return registry[m[1]] || null; if (sel === 'meta[name=theme-color]') return new El('meta'); return null; };
doc.querySelectorAll = sel => (sel.startsWith('.') ? registry.view.querySelectorAll(sel) : []);
doc.contains = () => true; doc.activeElement = null;
for (const id of ['view', 'fab', 'nav', 'sheet', 'sheetBody', 'modal', 'modalBody', 'celebrate', 'toasts', 'splash']) { const e = new El(id === 'nav' ? 'nav' : 'div'); e.attrs.id = id; registry[id] = e; }
registry.sheet.tagName = 'DIALOG'; registry.modal.tagName = 'DIALOG';
// La vue « Tâches » cherche #taskList dans l'arbre : on l'expose via querySelector
const realQS = doc.querySelector;
doc.querySelector = sel => { const r = realQS(sel); if (r) return r; if (sel === '#view .hero') return registry.view.querySelector('.hero'); const m = sel.match(/^#([\w-]+)$/); return m ? registry.view.querySelector(sel) || registry.sheetBody.querySelector(sel) || registry.modalBody.querySelector(sel) : null; };
globalThis.document = doc;
globalThis.window = { scrollTo() {}, addEventListener() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {} });
const store = {}; globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
globalThis.URL.createObjectURL = () => 'blob:x'; globalThis.URL.revokeObjectURL = () => {};
Object.defineProperty(globalThis, 'navigator', { value: { onLine: true }, configurable: true });
const clicked = (name, attrs = {}) => { const b = new El('button'); b.attrs['data-action'] = name; for (const k in attrs) b.attrs['data-' + k] = attrs[k]; b.parent = doc; return b; };

// Données v1 à migrer
store['agenda-etoile-v1'] = JSON.stringify({ stars: 6, tasks: [
  { id: 'a1', date: '2026-09-19', type: 'devoir', subject: 'algebre', title: 'Exercices 4 et 5', note: 'page 62', remind: 'eve0', done: false },
  { id: 'a2', date: '2026-09-20', type: 'lecon', subject: 'fr', title: 'Poème à réciter', remind: 'eve18', done: false },
  { id: 'a3', date: '2026-09-10', type: 'controle', subject: 'sci', title: 'Ancien contrôle', remind: 'none', done: false },
  { id: 'a4', date: '2026-09-19', type: 'projet', subject: 'hist', title: 'Exposé', remind: 'none', done: true }] });

const { state, init } = await import(new URL('../js/state.js', import.meta.url));
const ui = await import(new URL('../js/ui.js', import.meta.url));
const { planAll } = await import(new URL('../js/reminders.js', import.meta.url));
const r = init(); planAll();
if (r.status !== 'migrated') errors.push('migration non déclenchée: ' + r.status);
ui.initUI();
const view = registry.view;
const crashed = () => view.textContent.includes('Un problème est survenu');
const dispatch = async (name, attrs) => { const b = clicked(name, attrs); doc.fire('click', { target: b }); await new Promise(r => setTimeout(r, 5)); if (crashed()) errors.push('crash après action ' + name); };

// Onboarding affiché puis validé
if (!registry.modal.open) errors.push('onboarding non affiché');
await dispatch('onboard-start');
if (!state.db.settings.onboarded) errors.push('onboarding non enregistré');

for (const v of ['today', 'calendar', 'tasks', 'review', 'progress', 'settings', 'today']) {
  await dispatch('nav', { view: v });
  if (!view.childElementCount) errors.push('vue vide: ' + v);
}
await dispatch('nav', { view: 'review' });
await dispatch('review-subject', { subject: 'algebre' });
if (!view.textContent.includes('Algèbre') || !view.textContent.includes('Exercices 4 et 5') || !view.textContent.includes('page 62')) errors.push('programme de révision ne regroupe pas les éléments et ressources de la matière');
await dispatch('review-back');
await dispatch('nav', { view: 'calendar' });
for (const a of [['calmonth', { i: 2 }], ['calshift', { d: 1 }], ['calshift', { d: -2 }], ['calnow', {}]]) await dispatch(...a);
await dispatch('day', { key: '2026-09-19' });
if (!registry.sheet.open) errors.push('fiche du jour non ouverte');
await dispatch('calendar-mark', { key: '2026-09-19', type: 'exam' });
if (!(state.db.calendarEvents || []).some(e => e.date === '2026-09-19' && e.type === 'exam')) errors.push('marquage examen non enregistré');
await dispatch('open', { id: 'a1' });
await dispatch('edit', { id: 'a1' });
await dispatch('sheet-back');
await dispatch('toggle', { id: 'a1' });
if (!state.db.tasks.find(t => t.id === 'a1').done) errors.push('toggle sans effet');
if (state.db.stats.totalCompleted !== 7) errors.push('étoiles attendues 7, reçu ' + state.db.stats.totalCompleted);
await dispatch('toggle', { id: 'a1' }); await dispatch('toggle', { id: 'a1' });
if (state.db.stats.totalCompleted !== 7) errors.push('étoile gagnée deux fois');
await dispatch('add', { key: '2026-10-01' });
await dispatch('sheet-close');
await dispatch('nav', { view: 'today' });
await dispatch('toggle', { id: 'a2' });
if (!view.querySelector('.hero').textContent.includes('★ 8')) errors.push('bandeau non mis à jour après avoir terminé une tâche: ' + view.querySelector('.hero').textContent);
await dispatch('toggle', { id: 'a2' });
await dispatch('day', { key: '2026-09-20' });
await dispatch('open', { id: 'a2' });
await dispatch('delete', { id: 'a2' });
if (state.db.tasks.some(t => t.id === 'a2')) errors.push('suppression sans effet');
await dispatch('sheet-close');
await dispatch('nav', { view: 'tasks' });
for (const f of ['todo', 'done', 'urgent', 'all']) await dispatch('filter', { f });
await dispatch('more');
await dispatch('nav', { view: 'settings' });
for (const a of [['theme', { v: 'dark' }], ['theme', { v: 'system' }], ['firstday', { v: '0' }], ['firstday', { v: '1' }], ['notif-toggle', {}], ['sound-toggle', {}], ['export', {}], ['reset', {}]]) await dispatch(...a);
if (!registry.modal.open) errors.push('confirmation de réinitialisation absente');
await dispatch('modal-ok');
if (state.db.tasks.length !== 0) errors.push('réinitialisation sans effet');
await dispatch('nav', { view: 'today' });
console.log(errors.length ? 'ÉCHECS:\n' + errors.join('\n') : 'Fumée UI : OK (vues, fiches, actions, migration, réinitialisation)');
process.exit(errors.length ? 1 : 0);

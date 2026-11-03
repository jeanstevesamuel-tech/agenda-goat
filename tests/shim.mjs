// Mini-DOM factice pour exécuter réellement l'interface sous Node (aucun navigateur requis).
// Il imite ce dont l'appli a besoin, y compris FormData (avec les fins de ligne CRLF des textarea).
export class Txt { constructor(t) { this._t = String(t); this.isText = true; } get textContent() { return this._t; } }

export class El {
  constructor(tag) {
    this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.className = ''; this.listeners = {}; this.parent = null;
    this.open = false; this.hidden = false; this.value = ''; this.checked = false; this._typed = false; this.files = [];
    this.style = { setProperty() {} };
    this.classList = { add: c => this._cls(c, true), remove: c => this._cls(c, false), toggle: (c, on) => this._cls(c, on) };
  }
  _cls(c, on) { const s = new Set(this.className.split(' ').filter(Boolean)); on ? s.add(c) : s.delete(c); this.className = [...s].join(' '); }
  get id() { return this.attrs.id; }
  setAttribute(k, v) { this.attrs[k] = String(v); } getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } removeAttribute(k) { delete this.attrs[k]; }
  get dataset() { const d = {}; for (const k in this.attrs) if (k.startsWith('data-')) d[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this.attrs[k]; return d; }
  append(...k) { for (const n of k) { const c = typeof n === 'string' ? new Txt(n) : n; c.parent = this; this.children.push(c); } }
  set textContent(v) { this.children = []; if (v !== '') this.children.push(new Txt(v)); }
  get textContent() { return this.children.map(c => c.textContent).join(' '); }
  get childElementCount() { return this.children.filter(c => !c.isText).length; }
  replaceWith(n) { const i = this.parent.children.indexOf(this); n.parent = this.parent; this.parent.children[i] = n; }
  matches(sel) {
    let m;
    if ((m = sel.match(/^#([\w-]+)$/))) return this.attrs.id === m[1];
    if ((m = sel.match(/^\.([\w-]+)(?:\[([\w-]+)="([^"]+)"\])?$/))) return this.className.split(' ').includes(m[1]) && (!m[2] || this.attrs[m[2]] === m[3]);
    if ((m = sel.match(/^\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\]$/))) return m[1] in this.attrs && (m[2] === undefined || this.attrs[m[1]] === m[2]);
    return false;
  }
  all() { const out = []; const walk = n => { for (const c of n.children) if (!c.isText) { out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.all().find(e => e.matches(sel)) || null; }
  querySelectorAll(sel) { return this.all().filter(e => e.matches(sel)); }
  closest(sel) { let n = this; while (n && !n.isText) { if (n.matches && n.matches(sel)) return n; n = n.parent; } return null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  fire(t, e = {}) { (this.listeners[t] || []).forEach(f => f({ target: this, preventDefault() {}, ...e })); }
  focus() { this.constructor.focused = this; } click() { this.fire('click'); } remove() {}
  showModal() { this.open = true; } close() { if (this.open) { this.open = false; this.fire('close'); } }
  getBoundingClientRect() { return { left: 0, top: 0, width: 10, height: 10 }; }
}

class FD {
  constructor(form) {
    this.m = new Map();
    for (const e of form.all()) {
      const n = e.attrs.name; if (!n) continue;
      if (e.tagName === 'INPUT') { if (e.attrs.type === 'radio') { if (e.checked) this.m.set(n, e.value); } else this.m.set(n, e.value); }
      else if (e.tagName === 'TEXTAREA') this.m.set(n, (e._typed ? e.value : e.textContent).replace(/\r?\n/g, '\r\n'));
      else if (e.tagName === 'SELECT') {
        if (e._typed) this.m.set(n, e.value);
        else { const opts = e.all().filter(o => o.tagName === 'OPTION'); const o = opts.find(x => 'selected' in x.attrs) || opts[0]; this.m.set(n, o ? o.value : ''); }
      }
    }
  }
  get(n) { return this.m.has(n) ? this.m.get(n) : null; }
}

export function installShim({ store = {} } = {}) {
  const registry = {};
  const doc = new El('#doc');
  doc.body = new El('body'); doc.documentElement = new El('html'); doc.visibilityState = 'visible'; doc.activeElement = null;
  doc.createElement = t => new El(t);
  for (const id of ['view', 'fab', 'nav', 'sheet', 'sheetBody', 'modal', 'modalBody', 'celebrate', 'toasts', 'splash']) {
    const e = new El(id === 'sheet' || id === 'modal' ? 'dialog' : id === 'nav' ? 'nav' : 'div'); e.attrs.id = id; registry[id] = e;
  }
  for (const v of ['today', 'calendar', 'tasks', 'progress', 'settings']) { const b = new El('button'); b.attrs['data-view'] = v; registry.nav.append(b); }
  const roots = () => [registry.view, registry.sheetBody, registry.modalBody, registry.toasts, registry.celebrate];
  const themeMeta = new El('meta');
  doc.querySelector = sel => {
    if (sel === 'meta[name=theme-color]') return themeMeta;
    const parts = sel.split(' ');
    if (parts.length === 2 && parts[0].startsWith('#')) { const r = registry[parts[0].slice(1)]; return r ? r.querySelector(parts[1]) : null; }
    const m = sel.match(/^#([\w-]+)$/);
    if (m) return registry[m[1]] || roots().map(r => r.querySelector(sel)).find(Boolean) || null;
    return null;
  };
  doc.querySelectorAll = sel => {
    if (sel === '#nav [data-view]') return registry.nav.all();
    if (sel.startsWith('.')) return [registry.view, registry.sheetBody].flatMap(r => r.querySelectorAll(sel));
    return [];
  };
  doc.contains = () => true;

  const g = globalThis;
  g.document = doc; g.FormData = FD;
  g.window = { scrollTo() {}, addEventListener() {} };
  g.matchMedia = () => ({ matches: false, addEventListener() {} });
  g.localStorage = g.localStorage && g.localStorage.__stub ? g.localStorage : null;
  g.URL.createObjectURL = () => 'blob:x'; g.URL.revokeObjectURL = () => {};
  Object.defineProperty(g, 'navigator', { value: { onLine: true }, configurable: true });

  const tick = (ms = 5) => new Promise(r => setTimeout(r, ms));
  const btn = (action, attrs = {}) => { const b = new El('button'); b.attrs['data-action'] = action; for (const k in attrs) b.attrs['data-' + k] = attrs[k]; b.parent = doc; return b; };
  const api = {
    registry, doc, El, tick, btn,
    async dispatch(action, attrs) { doc.fire('click', { target: btn(action, attrs) }); await tick(); },
    async clickEl(el) { doc.fire('click', { target: el }); await tick(); },
    type(el, v) { el.value = v; el._typed = true; },
    check(form, name, v) { for (const e of form.all()) if (e.tagName === 'INPUT' && e.attrs.name === name) e.checked = e.value === v; },
    field: (form, name) => form.querySelector(`[name="${name}"]`),
    async submit(form) { doc.fire('submit', { target: form }); await tick(15); },
    text: () => registry.view.textContent,
    toasts: () => registry.toasts.textContent,
    sheetText: () => registry.sheetBody.textContent
  };
  return api;
}

// Contrôle d'accessibilité statique sur un sous-arbre : retourne la liste des problèmes.
export function audit(root, where = '') {
  const issues = [], ids = new Map();
  const nameOf = e => (e.attrs['aria-label'] || e.textContent.trim() || e.attrs.title || '').trim();
  const labelAncestor = e => { let n = e.parent; while (n && !n.isText) { if (n.tagName === 'LABEL') return n; n = n.parent; } return null; };
  for (const e of root.all()) {
    if (e.attrs.id) ids.set(e.attrs.id, (ids.get(e.attrs.id) || 0) + 1);
    if (e.tagName === 'BUTTON' && !nameOf(e)) issues.push(`${where}: bouton sans nom (${e.className || e.attrs['data-action']})`);
    if (e.tagName === 'BUTTON' && !e.attrs.type) issues.push(`${where}: bouton sans type (${e.className})`);
    if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName) && e.attrs.type !== 'file') {
      const lab = labelAncestor(e);
      if (!e.attrs['aria-label'] && !lab && !(e.attrs.type === 'radio')) issues.push(`${where}: champ sans étiquette (${e.tagName} ${e.attrs.name || e.attrs.id})`);
      if (e.attrs.type === 'radio' && !lab) issues.push(`${where}: radio sans étiquette`);
    }
    if (['radio', 'checkbox', 'switch'].includes(e.attrs.role) && !('aria-checked' in e.attrs)) issues.push(`${where}: role=${e.attrs.role} sans aria-checked`);
    if (e.attrs.role === 'progressbar' && !('aria-valuenow' in e.attrs)) issues.push(`${where}: progressbar sans valeur`);
  }
  for (const [id, n] of ids) if (n > 1) issues.push(`${where}: id dupliqué ${id}`);
  return issues;
}

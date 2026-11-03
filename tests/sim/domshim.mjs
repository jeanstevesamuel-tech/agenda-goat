// Mini-DOM factice, assez fidèle pour exécuter réellement l'interface (sélecteurs, événements qui remontent, FormData, <dialog>, focus).
class Txt { constructor(t) { this._t = String(t); this.isText = true; this.parent = null; } get textContent() { return this._t; } }

function parseSimple(s) {
  const out = { tag: null, id: null, classes: [], attrs: [] };
  const re = /(#[\w-]+|\.[\w-]+|\[[^\]]+\]|^[a-zA-Z][\w-]*)/g; let m;
  while ((m = re.exec(s))) {
    const t = m[1];
    if (t[0] === '#') out.id = t.slice(1);
    else if (t[0] === '.') out.classes.push(t.slice(1));
    else if (t[0] === '[') { const mm = t.slice(1, -1).match(/^([\w-]+)(?:=["']?(.*?)["']?)?$/); out.attrs.push([mm[1], mm[2]]); }
    else out.tag = t.toUpperCase();
  }
  return out;
}

export class El {
  constructor(tag, doc) {
    this.tagName = tag.toUpperCase(); this.attrs = {}; this.children = []; this.parent = null; this.listeners = {};
    this.value = ''; this.checked = false; this.open = false; this.hidden = false; this.doc = doc;
    this._cls = new Set(); this.style = { setProperty() {} };
    const self = this;
    this.classList = {
      add: (...c) => c.forEach(x => self._cls.add(x)), remove: (...c) => c.forEach(x => self._cls.delete(x)),
      toggle: (c, on) => { const want = on === undefined ? !self._cls.has(c) : !!on; want ? self._cls.add(c) : self._cls.delete(c); return want; },
      contains: c => self._cls.has(c)
    };
  }
  get className() { return [...this._cls].join(' '); }
  set className(v) { this._cls = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'class') this.className = v; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; }
  hasAttribute(k) { return k in this.attrs; }
  get id() { return this.attrs.id || ''; }
  get dataset() { const d = {}; for (const k in this.attrs) if (k.startsWith('data-')) d[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = this.attrs[k]; return d; }
  append(...k) { for (const n of k) { const c = typeof n === 'string' ? new Txt(n) : n; if (c.parent) c.parent.children = c.parent.children.filter(x => x !== c); c.parent = this; this.children.push(c); } }
  set textContent(v) { this.children.forEach(c => { c.parent = null; }); this.children = []; if (v !== '' && v != null) { const t = new Txt(v); t.parent = this; this.children.push(t); } }
  get textContent() { return this.children.map(c => c.textContent).join(' ').replace(/\s+/g, ' ').trim(); }
  get childElementCount() { return this.children.filter(c => !c.isText).length; }
  get isConnected() { let n = this; while (n) { if (n === this.doc.root) return true; n = n.parent; } return false; }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(x => x !== this); this.parent = null; } }
  replaceWith(n) { const i = this.parent.children.indexOf(this); n.parent = this.parent; this.parent.children[i] = n; this.parent = null; }
  all() { const out = []; const walk = n => { for (const c of n.children) if (!c.isText) { out.push(c); walk(c); } }; walk(this); return out; }
  _matchSimple(sp) {
    if (sp.tag && this.tagName !== sp.tag) return false;
    if (sp.id && this.attrs.id !== sp.id) return false;
    for (const c of sp.classes) if (!this._cls.has(c)) return false;
    for (const [k, v] of sp.attrs) { if (!(k in this.attrs)) return false; if (v !== undefined && this.attrs[k] !== v) return false; }
    return true;
  }
  matches(sel) {
    const parts = sel.trim().split(/\s+/).map(parseSimple);
    if (!this._matchSimple(parts[parts.length - 1])) return false;
    let n = this.parent, i = parts.length - 2;
    while (i >= 0 && n) { if (n._matchSimple && n._matchSimple(parts[i])) i--; n = n.parent; }
    return i < 0;
  }
  querySelector(sel) { return this.all().find(e => e.matches(sel)) || null; }
  querySelectorAll(sel) { return this.all().filter(e => e.matches(sel)); }
  closest(sel) { let n = this; while (n && !n.isText) { if (n.matches && n.matches(sel)) return n; n = n.parent; } return null; }
  addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }
  focus() { this.doc.activeElement = this; }
  click() {}
  getBoundingClientRect() { return { left: 10, top: 10, width: 44, height: 44 }; }
  showModal() { if (this.open) return; this.open = true; this.doc.modalStack.push(this); }
  close() { if (!this.open) return; this.open = false; this.doc.modalStack = this.doc.modalStack.filter(x => x !== this); this.doc.dispatch(this, 'close'); }
}

export function installDom({ dark = false, online = true, search = '' } = {}) {
  const doc = { modalStack: [], activeElement: null, listeners: {}, visibilityState: 'visible', last: {} };
  const mk = (tag) => new El(tag, doc);
  doc.root = mk('#document'); doc.root.doc = doc;
  const html = mk('html'), head = mk('head'), body = mk('body');
  doc.root.append(html); html.append(head, body);
  doc.documentElement = html; doc.body = body; doc.head = head;
  const meta = mk('meta'); meta.setAttribute('name', 'theme-color'); meta.setAttribute('content', '#D42D78'); head.append(meta);
  const withId = (tag, id, cls) => { const e = mk(tag); e.setAttribute('id', id); if (cls) e.className = cls; return e; };
  const splash = withId('div', 'splash', 'splash');
  const view = withId('main', 'view'); view.setAttribute('tabindex', '-1');
  const app = mk('div'); app.className = 'app'; app.append(view);
  const fab = withId('button', 'fab', 'fab'); fab.setAttribute('data-action', 'add'); fab.setAttribute('aria-label', 'Ajouter une tâche'); fab.textContent = '+';
  const nav = withId('nav', 'nav', 'nav'); nav.setAttribute('aria-label', 'Navigation principale');
  for (const [v, t] of [['today', 'Aujourd’hui'], ['calendar', 'Calendrier'], ['tasks', 'Tâches'], ['progress', 'Progrès'], ['settings', 'Réglages']]) {
    const b = mk('button'); b.setAttribute('data-action', 'nav'); b.setAttribute('data-view', v); b.textContent = t; nav.append(b);
  }
  const sheet = withId('dialog', 'sheet', 'sheet'); const sheetBody = withId('div', 'sheetBody'); sheetBody.setAttribute('tabindex', '-1'); sheet.append(sheetBody);
  const modal = withId('dialog', 'modal', 'modal'); const modalBody = withId('div', 'modalBody', 'modal-inner'); modal.append(modalBody);
  const celebrate = withId('div', 'celebrate'), toasts = withId('div', 'toasts');
  body.append(splash, app, fab, nav, sheet, modal, celebrate, toasts);
  Object.assign(doc, { view, sheet, sheetBody, modal, modalBody, celebrate, toasts, fab, nav, splash });

  doc.createElement = t => mk(t);
  doc.querySelector = s => doc.root.querySelector(s);
  doc.querySelectorAll = s => doc.root.querySelectorAll(s);
  doc.contains = n => !!n && n.isConnected;
  doc.addEventListener = (t, f) => { (doc.listeners[t] ||= []).push(f); };
  doc.dispatch = (target, type, extra = {}) => {
    const evt = { type, target, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; }, ...extra };
    let n = target;
    while (n) { (n.listeners && n.listeners[type] || []).forEach(f => f(evt)); n = n.parent; }
    (doc.listeners[type] || []).forEach(f => f(evt));
    return evt;
  };
  doc.click = el => doc.dispatch(el, 'click');
  doc.submit = form => doc.dispatch(form, 'submit');
  doc.typeInto = (el, value) => { el.value = value; return doc.dispatch(el, 'input'); };
  doc.pressEscape = () => { const top = doc.modalStack[doc.modalStack.length - 1]; if (top) { const e = doc.dispatch(top, 'cancel'); if (!e.defaultPrevented) top.close(); } };

  class FormDataShim {
    constructor(form) {
      this.m = new Map();
      for (const e of form.all()) {
        const n = e.attrs.name; if (!n) continue;
        if (e.tagName === 'INPUT') { if (e.attrs.type === 'radio') { if (e.checked) this.m.set(n, e.value); } else this.m.set(n, e.value); }
        else if (e.tagName === 'SELECT') {
          const opts = e.all().filter(o => o.tagName === 'OPTION');
          const sel = e.value !== '' ? e.value : (opts.find(o => 'selected' in o.attrs) || opts[0]).value;
          this.m.set(n, sel);
        } else if (e.tagName === 'TEXTAREA') this.m.set(n, e.value !== '' ? e.value : e.textContent);
      }
    }
    get(n) { return this.m.has(n) ? this.m.get(n) : null; }
  }
  doc.chooseRadio = (form, name, value) => { form.all().filter(e => e.tagName === 'INPUT' && e.attrs.name === name).forEach(e => { e.checked = e.value === value; }); };
  doc.setSelect = (form, name, value) => { form.querySelector(`[name=${name}]`).value = value; };

  // matchMedia contrôlable
  const mqHandlers = [];
  doc.mq = { dark };
  globalThis.matchMedia = q => ({ get matches() { return /dark/.test(q) ? doc.mq.dark : /reduce/.test(q) ? !!doc.mq.reduce : false; }, addEventListener: (_, f) => mqHandlers.push(f) });
  doc.setSystemDark = v => { doc.mq.dark = v; mqHandlers.forEach(f => f({ matches: v })); };

  const winHandlers = {};
  globalThis.document = doc;
  globalThis.window = { scrollTo() {}, addEventListener: (t, f) => { (winHandlers[t] ||= []).push(f); } };
  doc.winFire = (t, e = {}) => (winHandlers[t] || []).forEach(f => f(e));
  globalThis.FormData = FormDataShim;
  globalThis.location = { search, pathname: '/', protocol: 'https:', reload() { doc.reloaded = true; } };
  globalThis.history = { replaceState() {} };
  Object.defineProperty(globalThis, 'navigator', { value: { onLine: online }, configurable: true, writable: true });
  globalThis.URL.createObjectURL = blob => { doc.last.blob = blob; return 'blob:sim'; };
  globalThis.URL.revokeObjectURL = () => {};
  doc.notifications = [];
  globalThis.Notification = class { static permission = 'default'; static async requestPermission() { const r = doc.requestPermissionResult || globalThis.Notification.permission; globalThis.Notification.permission = r; doc.permissionAsked = (doc.permissionAsked || 0) + 1; return r; } constructor(title, opts) { doc.notifications.push({ title, opts }); } };
  doc.setPermission = p => { globalThis.Notification.permission = p; };
  doc.requestPermissionResult = null;
  return doc;
}

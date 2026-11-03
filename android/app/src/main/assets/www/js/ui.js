// Interface : vues, fenêtres, événements (délégation : quelques écouteurs seulement).
import { S } from './strings.fr.js';
import { state, commit, tasksOn, findTask, tryReplaceDB } from './state.js';
import { el, getToday, formatDate, relativeDay, formatTime, addDays, normalizeText } from './utils.js';
import { SUBJECTS, TYPES, PRIORITIES, MODES, PAGE_SIZE, APP_VERSION } from './constants.js';
import { validateTask, defaultDB } from './validation.js';
import { createTask, applyEdit, toggleDone, compareTasks, reminderText, planReminder } from './tasks.js';
import { getLevel, getLevelProgress, weekStats, computeStreak, getRewards } from './statistics.js';
import { buildCalendar } from './calendar.js';
import * as N from './notifications.js';
import * as ST from './storage.js';
import * as AU from './audio.js';
import * as Native from './native.js';
import { armTimer, planAll, runReminders } from './reminders.js';

const $ = s => document.querySelector(s);
const pick = a => a[Math.floor(Math.random() * a.length)];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= Petits composants ================= */
let toastTimer;
export function toast(msg, { label, onAction, ms = 3500 } = {}) {
  const box = $('#toasts'); box.textContent = '';
  const t = el('div', { class: 'toast' }, el('span', { text: msg }));
  if (label) {
    const b = el('button', { class: 'toast-btn', type: 'button', text: label });
    b.addEventListener('click', () => { box.textContent = ''; if (onAction) onAction(); });
    t.append(b);
  }
  box.append(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { box.textContent = ''; }, ms);
}

// Après une écriture qui échoue : dire la vérité et proposer l'export.
function warnIfUnsaved() {
  if (!state.saveOk) toast(S.toast.saveFailed, { label: S.actions.exportShort, onAction: exportDownload, ms: 9000 });
}

function celebrate(text) {
  const box = $('#celebrate'); box.textContent = '';
  box.append(el('div', { class: 'levelup' }, el('span', { class: 'levelup-star', 'aria-hidden': 'true', text: '★' }), el('strong', { text: text })));
  setTimeout(() => { box.textContent = ''; }, reduced() ? 2500 : 2000);
}

function burst(x, y) {
  if (reduced()) return;
  ['★', '♥', '✦', '★', '♥', '✦', '★', '♥'].forEach((c, i) => {
    const s = el('span', { class: 'conf', 'aria-hidden': 'true', text: c });
    s.style.left = x + 'px'; s.style.top = y + 'px';
    s.style.setProperty('--dx', (Math.random() * 150 - 75) + 'px');
    s.style.setProperty('--dy', (-50 - Math.random() * 80) + 'px');
    s.style.color = i % 3 === 0 ? 'var(--star)' : i % 3 === 1 ? 'var(--primary)' : 'var(--secondary)';
    document.body.append(s);
    setTimeout(() => s.remove(), 900);
  });
}

function meter(pct, label) {
  const fill = el('i', { class: 'meter-fill' });
  fill.style.width = pct + '%';
  return el('div', { class: 'meter', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': pct, 'aria-label': label }, fill);
}
const block = (title, ...kids) => el('section', { class: 'block' }, el('h2', { class: 'block-title', text: title }), ...kids);
const empty = (title, sub, withBtn) => el('div', { class: 'empty' },
  el('p', { class: 'empty-title', text: title }), sub ? el('p', { class: 'muted', text: sub }) : null,
  withBtn ? el('button', { class: 'btn btn-primary', type: 'button', 'data-action': 'add', text: '+ ' + S.actions.add }) : null);

function taskCard(t, o = {}) {
  const meta = [];
  if (o.showDate) meta.push(relativeDay(t.date));
  if (t.time) meta.push(formatTime(t.time));
  if (!o.showDate || !t.time) meta.push(S.types[t.type]);
  return el('article', { class: 'task' + (t.done ? ' is-done' : ''), 'data-subject': t.subject, 'data-id': t.id },
    el('button', { class: 'check', type: 'button', role: 'checkbox', 'aria-checked': String(t.done), 'data-action': 'toggle', 'data-id': t.id, 'aria-label': S.a11y.markDone(t.title), text: t.done ? '✓' : '' }),
    el('button', { class: 'task-body', type: 'button', 'data-action': 'open', 'data-id': t.id },
      el('span', { class: 'task-title', text: t.title }),
      el('span', { class: 'task-meta', text: `${S.subjectEmoji[t.subject]} ${S.subjects[t.subject]} · ${meta.join(' · ')}` })),
    t.priority !== 'normal' && !t.done ? el('span', { class: 'pri pri-' + t.priority, text: S.priorities[t.priority] }) : null);
}
const cards = (arr, o) => el('div', { class: 'list' }, arr.map(t => taskCard(t, o)));

function banner(kind, text, btn) {
  return el('div', { class: 'banner banner-' + kind, role: kind === 'error' ? 'alert' : 'status' },
    el('p', { text }), btn ? el('button', { class: 'btn btn-quiet btn-sm', type: 'button', 'data-action': btn.action, text: btn.label }) : null);
}
let updateWaiting = null;
export function setUpdateWaiting(w) { updateWaiting = w; render(); }
function banners() {
  const out = [];
  if (state.status === 'corrupt') out.push(banner('error', S.banner.corrupt, { label: S.actions.retry, action: 'reload' }));
  const exp = { label: S.actions.exportShort, action: 'export' };
  if (state.status === 'unavailable') out.push(banner('alert', S.banner.unavailable, exp));
  else if (!state.saveOk) out.push(banner('alert', S.banner.saveFailed, exp));
  if (!state.online) out.push(banner('info', S.banner.offline));
  if (updateWaiting) out.push(banner('info', S.banner.update, { label: S.actions.update, action: 'update' }));
  return out;
}
let lastBannerSig = '';
const bannerSig = () => banners().map(b => b.textContent).join('|');
const pageHead = title => el('header', { class: 'page-head' }, el('h1', { class: 'page-title', text: title }));

/* ================= Vues ================= */
function greeting() {
  const h = new Date().getHours();
  return h < 12 ? S.greeting.morning : h < 18 ? S.greeting.afternoon : S.greeting.evening;
}

// Bandeau du jour. Reconstruit seul (sans redessiner l'écran) quand on termine une tâche.
function heroNode(tk, list) {
  const done = list.filter(t => t.done).length, left = list.length - done;
  const stars = state.db.stats.totalCompleted, lp = getLevelProgress(stars);
  const pct = list.length ? Math.round(done / list.length * 100) : 0;
  return el('section', { class: 'hero' },
    el('div', { class: 'hero-top' },
      el('p', { class: 'hero-hello', text: greeting() }),
      el('p', { class: 'hero-star', text: `★ ${stars} · ${S.progress.level(lp.level)}` })),
    el('h1', { class: 'hero-date', text: formatDate(tk, { weekday: true }) }),
    el('p', { class: 'hero-count', text: list.length ? S.today.summary(list.length, done, left) : S.today.noTask }),
    list.length ? meter(pct, S.today.sectionToday) : null);
}

function viewToday() {
  const tk = getToday(), list = tasksOn(tk);
  const left = list.filter(t => !t.done).length;

  const hero = heroNode(tk, list);

  const missed = state.db.tasks.filter(t => t.reminder.status === 'missed' && !t.done).slice(0, 3).map(t =>
    el('div', { class: 'banner banner-alert', role: 'status' },
      el('p', {}, el('strong', { text: S.missed.title + ' : ' }), t.title, el('span', { class: 'muted block-sub', text: S.missed.body })),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-quiet btn-sm', type: 'button', 'data-action': 'missed-show', 'data-id': t.id, text: S.actions.show }),
        el('button', { class: 'btn btn-quiet btn-sm', type: 'button', 'data-action': 'missed-ignore', 'data-id': t.id, text: S.actions.ignore }))));

  const late = state.db.tasks.filter(t => !t.done && t.date < tk).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5);
  const up = [];
  for (let i = 1; i <= 7; i++) for (const t of tasksOn(addDays(tk, i))) if (!t.done) up.push(t);

  return el('div', { class: 'stack' },
    banners(), hero, missed,
    block(S.today.sectionToday,
      list.length ? cards(list) : empty(S.today.noTask, S.today.calm, true),
      list.length && !left ? el('p', { class: 'muted center', text: S.today.allDone }) : null),
    late.length ? block(S.today.late, cards(late, { showDate: true })) : null,
    block(S.today.upcoming, up.length ? cards(up, { showDate: true }) : el('p', { class: 'muted', text: S.today.nothingUpcoming })));
}

function viewCalendar() {
  return el('div', { class: 'stack' }, banners(), pageHead(S.nav.calendar), buildCalendar());
}

function filteredTasks() {
  const q = normalizeText(state.ui.query.trim()), f = state.ui.filter, out = [];
  for (const t of state.db.tasks) {
    if (f === 'todo' && t.done) continue;
    if (f === 'done' && !t.done) continue;
    if (f === 'urgent' && (t.priority !== 'urgent' || t.done)) continue;
    if (q && !normalizeText(`${t.title} ${S.subjects[t.subject]} ${t.subject} ${t.note}`).includes(q)) continue; // « maths » doit trouver Mathématiques
    out.push(t);
  }
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : compareTasks(a, b)));
  if (f === 'done') out.reverse();
  return out;
}
function fillTaskList() {
  const box = $('#taskList'); if (!box) return;
  box.textContent = '';
  const all = filteredTasks();
  if (!all.length) { box.append(state.db.tasks.length ? empty(S.tasks.none) : empty(S.tasks.emptyAll, '', true)); return; }
  const shown = all.slice(0, state.ui.limit);
  box.append(el('p', { class: 'muted count', 'aria-live': 'polite', text: S.tasks.count(all.length) }), cards(shown, { showDate: true }));
  if (all.length > shown.length) box.append(el('button', { class: 'btn btn-quiet btn-block', type: 'button', 'data-action': 'more', text: S.actions.showMore }));
}
function viewTasks() {
  const filters = ['all', 'todo', 'done', 'urgent'];
  const wrap = el('div', { class: 'stack' }, banners(), pageHead(S.nav.tasks),
    el('input', { id: 'q', class: 'input', type: 'search', placeholder: S.tasks.searchPh, 'aria-label': S.tasks.searchLabel, value: state.ui.query, autocomplete: 'off' }),
    el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': S.a11y.filters },
      filters.map(f => el('button', { class: 'seg', type: 'button', role: 'radio', 'aria-checked': String(state.ui.filter === f), 'data-action': 'filter', 'data-f': f, text: S.tasks.filters[f] }))),
    el('div', { id: 'taskList' }));
  queueMicrotask(fillTaskList);
  return wrap;
}

function viewReview() {
  const selected = state.ui.reviewSubject || '';
  const subjectTasks = state.db.tasks.filter(t => t.subject === selected).slice().sort((a,b) => a.date.localeCompare(b.date) || compareTasks(a,b));
  const events = (state.db.calendarEvents || []).filter(e => e.subject === selected);
  if (selected) {
    const items = subjectTasks.length ? el('div', { class: 'list' }, subjectTasks.map(t => { const card = taskCard(t, { showDate: true }); card.append(el('p', { class: 'review-note' + (t.note ? '' : ' muted'), text: t.note ? `${S.review.resources} : ${t.note}` : S.review.noNote })); return card; })) : empty(S.review.noItems, S.review.empty);
    const eventNotes = events.length ? el('section', { class: 'card stack-s' }, el('h2', { class: 'block-title', text: 'Dates importantes' }), events.map(e => el('div', { class: `review-event review-event-${e.type}` }, el('strong', { text: ({test_eval:'Test d’évaluation',test:'Test d’évaluation',evaluation:'Test d’évaluation',exam:'Examen'})[e.type] }), el('span', { text: ` · ${formatDate(e.date, { weekday: true, year: true })}` }), e.note ? el('p', { text: e.note }) : null))) : null;
    return el('div', { class: 'stack' }, banners(), pageHead(S.review.title),
      el('button', { class: 'btn btn-quiet', type: 'button', 'data-action': 'review-back', text: '‹ ' + S.review.back }),
      el('section', { class: 'card stack-s' }, el('h2', { class: 'block-title', text: `${S.subjectEmoji[selected] || '📘'} ${S.subjects[selected] || selected}` }), el('p', { class: 'muted', text: S.review.items(subjectTasks.length) }),
        el('p', { class: 'muted', text: S.review.resources }), items), eventNotes);
  }
  const subjects = SUBJECTS.filter(k => k !== 'autre' || state.db.tasks.some(t => t.subject === 'autre'));
  return el('div', { class: 'stack' }, banners(), pageHead(S.review.title),
    el('section', { class: 'card stack-s' }, el('p', { class: 'muted', text: S.review.intro }),
      el('h2', { class: 'block-title', text: S.review.choose }),
      el('div', { class: 'review-subjects' }, subjects.map(subject => {
        const count = state.db.tasks.filter(t => t.subject === subject).length;
        const dateCount = (state.db.calendarEvents || []).filter(e => e.subject === subject).length;
        return el('button', { class: 'review-subject', type: 'button', 'data-action': 'review-subject', 'data-subject': subject },
          el('span', { class: 'review-subject-icon', text: S.subjectEmoji[subject] || '📘' }),
          el('span', { class: 'review-subject-name', text: S.subjects[subject] || subject }),
          el('span', { class: 'review-subject-count', text: `${count} élément${count !== 1 ? 's' : ''}${dateCount ? ` · ${dateCount} date${dateCount !== 1 ? 's' : ''}` : ''}` }));
      }))));
}

function viewProgress() {
  const tk = getToday(), stars = state.db.stats.totalCompleted, lp = getLevelProgress(stars);
  const w = weekStats(tasksOn, tk, state.db.settings.firstDayOfWeek);
  const streak = computeStreak(state.db.tasks, tk);
  const rewards = getRewards(state.db.stats, streak);
  return el('div', { class: 'stack' }, banners(), pageHead(S.nav.progress),
    el('section', { class: 'card level-card' },
      el('p', { class: 'muted', text: S.progress.stars }),
      el('p', { class: 'big', text: `★ ${stars}` }),
      el('p', { class: 'level-name', text: `${S.progress.level(lp.level)} · ${S.progress.levelNames[lp.level - 1]}` }),
      meter(lp.pct, S.progress.level(lp.level)),
      el('p', { class: 'muted', text: lp.max ? S.progress.maxLevel : S.progress.toNext(lp.need) })),
    el('section', { class: 'card' },
      el('h2', { class: 'block-title', text: S.progress.week }),
      el('p', { class: 'big-sm', text: `${w.pct} %` }),
      meter(w.pct, S.progress.week),
      el('p', { class: 'muted', text: S.progress.weekLine(w.total, w.done) })),
    el('div', { class: 'stat-grid' },
      el('section', { class: 'card stat' }, el('p', { class: 'muted', text: S.progress.streak }), el('p', { class: 'big-sm', text: S.progress.streakUnit(streak) })),
      el('section', { class: 'card stat' }, el('p', { class: 'muted', text: S.progress.top }),
        el('p', { class: 'big-sm', text: w.top ? `${S.subjectEmoji[w.top]} ${S.subjects[w.top]}` : S.progress.topNone }))),
    el('section', { class: 'card' },
      el('h2', { class: 'block-title', text: S.progress.rewards }),
      el('ul', { class: 'rewards' }, rewards.map(r => el('li', { class: 'reward' + (r.unlocked ? ' is-on' : '') },
        el('span', { class: 'reward-mark', 'aria-hidden': 'true', text: r.unlocked ? '★' : '☆' }),
        el('span', { text: S.progress.reward[r.id] }),
        el('span', { class: 'muted reward-state', text: r.unlocked ? S.progress.unlocked : S.progress.locked }))))));
}

function BuildExactAlarmHint() {
  try { return !Native.exactAlarmAllowed(); } catch { return false; }
}

function viewSettings() {
  const s = state.db.settings, perm = N.permissionState();
  const seg = (items, cur, action, label) => el('div', { class: 'segmented', role: 'radiogroup', 'aria-label': label },
    items.map(([v, l]) => el('button', { class: 'seg', type: 'button', role: 'radio', 'aria-checked': String(cur === v), 'data-action': action, 'data-v': v, text: l })));
  const sw = (label, on, action) => el('div', { class: 'switch-row' }, el('span', { text: label }),
    el('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(on), 'aria-label': label, 'data-action': action }, el('i')));
  return el('div', { class: 'stack' }, banners(), pageHead(S.nav.settings),
    el('section', { class: 'card' }, el('h2', { class: 'block-title', text: S.settings.appearance }),
      seg(['system', 'light', 'dark'].map(v => [v, S.settings.themes[v]]), s.theme, 'theme', S.a11y.theme)),
    el('section', { class: 'card stack-s' }, el('h2', { class: 'block-title', text: S.settings.notifications }),
      el('p', {}, el('strong', { text: S.settings.permission + ' : ' }), el('span', { class: 'perm perm-' + perm, text: S.settings.permStates[perm] })),
      el('p', { class: 'muted', text: S.settings.permWhy }),
      perm === 'default' ? el('button', { class: 'btn btn-primary', type: 'button', 'data-action': 'notif-enable', text: S.settings.enable }) : null,
      perm === 'denied' ? el('p', { class: 'muted', text: S.settings.permDenied }) : null,
      perm === 'denied' && Native.isNative() ? el('button', { class: 'btn btn-quiet', type: 'button', 'data-action': 'notif-settings', text: S.settings.openSettings }) : null,
      perm === 'unsupported' ? el('p', { class: 'muted', text: S.settings.permUnsupported }) : null,
      perm !== 'unsupported' ? el('p', { class: 'muted', text: S.settings.capOpen }) : null,
      Native.isNative() && BuildExactAlarmHint() ? el('div', { class: 'stack-s' }, el('p', { class: 'muted', text: S.settings.exactAlarmHelp }), el('button', { class: 'btn btn-quiet', type: 'button', 'data-action': 'exact-alarm-settings', text: S.settings.exactAlarm })) : null,
      perm !== 'unsupported' ? sw(S.settings.remindersOn, s.notifications, 'notif-toggle') : null,
      perm !== 'unsupported' ? sw(S.settings.soundOn, s.sound, 'sound-toggle') : null,
      el('div', { class: 'sound-picker stack-s' },
        el('strong', { text: S.settings.notificationSound }),
        el('p', { class: 'muted', text: s.notificationSoundName ? s.notificationSoundName : S.settings.notificationSoundNone }),
        el('p', { class: 'muted', text: S.settings.notificationSoundHelp }),
        el('input', { id: 'notificationSoundFile', type: 'file', accept: 'audio/*', hidden: true }),
        el('button', { class: 'btn btn-quiet', type: 'button', 'data-action': 'sound-choose', text: s.notificationSoundName ? S.settings.notificationSoundChange : S.settings.notificationSoundChoose }),
        s.notificationSoundName ? el('div', { class: 'row-actions' },
          el('button', { class: 'btn btn-quiet', type: 'button', 'data-action': 'sound-preview', text: S.settings.notificationSoundPreview }),
          el('button', { class: 'btn btn-danger', type: 'button', 'data-action': 'sound-remove', text: S.settings.notificationSoundRemove })) : null),
      perm === 'granted' ? el('button', { class: 'btn btn-quiet', type: 'button', 'data-action': 'notif-test', text: S.settings.test }) : null),
    el('section', { class: 'card stack-s' }, el('h2', { class: 'block-title', text: S.settings.calendar }),
      el('p', { class: 'muted', text: S.settings.firstDay }),
      seg([['1', S.settings.firstDays[1]], ['0', S.settings.firstDays[0]]], String(s.firstDayOfWeek), 'firstday', S.a11y.firstDay)),
    el('section', { class: 'card stack-s' }, el('h2', { class: 'block-title', text: S.settings.data }),
      el('button', { class: 'btn btn-quiet', type: 'button', 'data-action': 'export', text: S.settings.export }),
      el('button', { class: 'btn btn-quiet', type: 'button', 'data-action': 'import', text: S.settings.import }),
      el('input', { id: 'importFile', type: 'file', accept: 'application/json,.json', hidden: true }),
      el('button', { class: 'btn btn-danger', type: 'button', 'data-action': 'reset', text: S.settings.reset })),
    el('section', { class: 'card' }, el('h2', { class: 'block-title', text: S.settings.about }),
      el('p', { text: S.settings.version(APP_VERSION) }), el('p', { class: 'muted', text: S.settings.aboutText })));
}

const VIEWS = { today: viewToday, calendar: viewCalendar, tasks: viewTasks, review: viewReview, progress: viewProgress, settings: viewSettings };

export function render() {
  const root = $('#view'); if (!root) return;
  root.textContent = '';
  try { root.append((VIEWS[state.ui.view] || viewToday)()); }
  catch (e) { renderCrash(); }
  document.querySelectorAll('#nav [data-view]').forEach(b => {
    if (b.dataset.view === state.ui.view) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
  });
  $('#fab').hidden = state.ui.view === 'settings' || state.ui.view === 'review';
  lastBannerSig = bannerSig();
}
export function renderCrash() {
  const root = $('#view'); root.textContent = '';
  root.append(el('section', { class: 'card stack-s' }, el('p', { text: S.banner.crash }), el('p', { class: 'muted', text: S.errors.fatal }),
    el('button', { class: 'btn btn-primary', type: 'button', 'data-action': 'reload', text: S.actions.retry })));
}

/* ================= Fenêtre du bas (jour / détail / formulaire) ================= */
let sheetCtx = null, lastFocus = null;
const sheetEl = () => $('#sheet');

function sheetHead(title, sub) {
  return el('header', { class: 'sheet-head' },
    el('div', {}, el('h2', { class: 'sheet-title', tabindex: '-1', 'data-focus': '', text: title }), sub ? el('p', { class: 'muted', text: sub }) : null),
    el('button', { class: 'icon-btn', type: 'button', 'data-action': 'sheet-close', 'aria-label': S.a11y.closeSheet, text: '✕' }));
}
function drawDay(c) {
  const list = tasksOn(c.key);
  const marker = (state.db.calendarEvents || []).find(event => event.date === c.key);
  const eventControls = el('section', { class: 'day-event-controls stack-s' },
    el('h3', { class: 'block-title', text: 'Marquer cette journée' }),
    el('p', { class: 'muted', text: marker ? `Marquage actuel : ${{test:'Test',exam:'Examen',evaluation:'Évaluation'}[marker.type]}` : 'Choisis un type pour colorer cette date dans le calendrier.' }),
    el('div', { class: 'event-actions' },
      [['test_eval','Test d’évaluation'],['exam','Examen']].map(([type,label]) => el('button', { class: `btn btn-sm event-button event-button-${type}`, type: 'button', 'data-action': 'calendar-mark', 'data-key': c.key, 'data-type': type, 'aria-pressed': String(marker?.type === type), text: label }))),
    marker ? el('button', { class: 'btn btn-quiet btn-sm', type: 'button', 'data-action': 'calendar-unmark', 'data-key': c.key, text: S.calendarEvents.remove }) : null);
  return [sheetHead(formatDate(c.key, { weekday: true }), S.day.count(list.length)), eventControls,
    list.length ? cards(list) : empty(S.day.empty),
    el('div', { class: 'sheet-foot' }, el('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-action': 'add', 'data-key': c.key, text: '+ ' + S.actions.add }))];
}
function drawDetail(c) {
  const t = findTask(c.id);
  if (!t) return [sheetHead(S.errors.fatal), empty(S.errors.fatal)];
  const r = t.reminder;
  const remText = !r.enabled ? S.reminderNone : `${S.reminderStatus[r.status]} · ${reminderText(t)}`;
  const row = (k, v) => el('div', { class: 'kv' }, el('dt', { text: k }), el('dd', { text: v }));
  return [
    c.back ? el('button', { class: 'btn btn-quiet btn-sm', type: 'button', 'data-action': 'sheet-back', text: '‹ ' + S.actions.back }) : null,
    el('div', { class: 'detail', 'data-subject': t.subject },
      sheetHead(t.title, `${S.subjectEmoji[t.subject]} ${S.subjects[t.subject]} · ${S.types[t.type]}${t.done ? ' · ✓' : ''}`),
      el('dl', { class: 'kvs' },
        row(S.detail.date, formatDate(t.date, { weekday: true, year: true })),
        row(S.detail.time, t.time ? formatTime(t.time) : S.detail.noTime),
        row(S.detail.priority, S.priorities[t.priority]),
        row(S.detail.reminder, remText),
        row(S.detail.note, t.note || S.detail.noNote))),
    el('div', { class: 'sheet-foot stack-s' },
      el('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-action': 'toggle', 'data-id': t.id, text: t.done ? S.actions.reopen : S.actions.done }),
      el('div', { class: 'row' },
        el('button', { class: 'btn btn-quiet grow', type: 'button', 'data-action': 'edit', 'data-id': t.id, text: S.actions.edit }),
        el('button', { class: 'btn btn-danger-quiet grow', type: 'button', 'data-action': 'delete', 'data-id': t.id, text: S.actions.delete })))];
}
function chipGroup(name, legend, items, current) {
  return el('fieldset', { class: 'field' }, el('legend', { text: legend }),
    el('div', { class: 'chips' }, items.map(([v, label]) => el('label', { class: 'chip', 'data-subject': name === 'subject' ? v : null },
      el('input', { class: 'sr-only', type: 'radio', name, value: v, checked: current === v }), el('span', { text: label })))));
}
const err = k => el('p', { class: 'err', 'data-err': k, role: 'alert' });
function drawForm(c) {
  const t = c.id ? findTask(c.id) : null;
  const v = t ? { subject: t.subject, type: t.type, title: t.title, date: t.date, time: t.time, priority: t.priority, note: t.note, rem: t.reminder.enabled ? t.reminder.mode : 'none', customMinutesBefore: t.reminder.customMinutesBefore ?? '' }
    : { subject: state.ui.lastSubject, type: 'homework', title: '', date: c.key || getToday(), time: '', priority: 'normal', note: '', rem: 'eve0', customMinutesBefore: '' };
  return [sheetHead(t ? S.form.editTitle : S.form.newTitle),
    el('form', { id: 'taskForm', novalidate: true, 'data-id': t ? t.id : '' },
      chipGroup('subject', S.form.subject, SUBJECTS.map(k => [k, `${S.subjectEmoji[k]} ${S.subjects[k]}`]), v.subject), err('subject'),
      chipGroup('type', S.form.type, TYPES.map(k => [k, S.types[k]]), v.type), err('type'),
      el('label', { class: 'field' }, el('span', { class: 'label', text: S.form.title }),
        el('input', { class: 'input', name: 'title', type: 'text', maxlength: 80, value: v.title, placeholder: S.form.titlePh, autocomplete: 'off', enterkeyhint: 'done' })), err('title'),
      el('div', { class: 'two' },
        el('label', { class: 'field' }, el('span', { class: 'label', text: S.form.date }), el('input', { class: 'input', name: 'date', type: 'date', value: v.date })),
        el('label', { class: 'field' }, el('span', { class: 'label', text: S.form.time }), el('input', { class: 'input', name: 'time', type: 'time', value: v.time }))),
      err('date'), err('time'),
      chipGroup('priority', S.form.priority, PRIORITIES.map(k => [k, S.priorities[k]]), v.priority), err('priority'),
      el('label', { class: 'field' }, el('span', { class: 'label', text: S.form.reminder }),
        el('select', { class: 'input', name: 'reminder' },
          [['none', S.reminderNone], ...MODES.map(m => [m, S.reminderModes[m]])].map(([val, label]) => el('option', { value: val, selected: v.rem === val ? true : null, text: label })))),
      el('label', { class: 'field', 'data-custom-reminder': '', hidden: v.rem !== 'custom' },
        el('span', { class: 'label', text: S.form.reminderCustomMinutes }),
        el('input', { class: 'input', name: 'customMinutesBefore', type: 'number', min: 1, max: 43200, step: 1, value: v.customMinutesBefore, placeholder: 'Ex. 90' })),
      err('reminder'),
      el('label', { class: 'field' }, el('span', { class: 'label', text: S.form.note }),
        el('textarea', { class: 'input', name: 'note', rows: 3, maxlength: 400, placeholder: S.form.notePh, text: v.note })), err('note'),
      el('div', { class: 'sheet-foot row' },
        el('button', { class: 'btn btn-primary grow', type: 'submit', text: S.actions.save }),
        el('button', { class: 'btn btn-quiet', type: 'button', 'data-action': 'sheet-back', text: S.actions.cancel })))];
}
function drawSheet() {
  const body = $('#sheetBody'); body.textContent = '';
  if (!sheetCtx) return;
  const parts = sheetCtx.mode === 'day' ? drawDay(sheetCtx) : sheetCtx.mode === 'detail' ? drawDetail(sheetCtx) : drawForm(sheetCtx);
  body.append(...parts.filter(Boolean));
}
function focusSheet() {
  const b = $('#sheetBody');
  const target = sheetCtx && sheetCtx.mode === 'form' && !sheetCtx.id ? b.querySelector('[name=title]') : b.querySelector('[data-focus]');
  (target || b).focus();
}
function openSheet(ctx) {
  sheetCtx = ctx; drawSheet();
  const d = sheetEl();
  if (!d.open) { lastFocus = document.activeElement; document.body.classList.add('no-scroll'); showDialog(d); }
  focusSheet();
}
// Navigateurs sans <dialog> modal : on l'ouvre quand même (sans le fond bloquant) plutôt que de ne rien afficher.
function showDialog(d) { if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', ''); }
function closeSheet() { const d = sheetEl(); if (d.open) d.close(); }
function sheetBack() {
  if (sheetCtx && sheetCtx.back) { sheetCtx = sheetCtx.back; drawSheet(); focusSheet(); } else closeSheet();
}
export function openNewTask() {
  state.ui.view = 'today'; render();
  openSheet({ mode: 'form', key: getToday(), back: null });
}
// Un autre onglet a modifié les données : on redessine sans perdre un formulaire en cours de saisie.
export function externalChange() {
  render();
  if (sheetEl().open && sheetCtx && sheetCtx.mode !== 'form') {
    if (sheetCtx.mode === 'detail' && !findTask(sheetCtx.id)) closeSheet(); else drawSheet();
  }
}
export function openTaskById(id) {
  if (findTask(id)) { state.ui.view = 'today'; render(); openSheet({ mode: 'detail', id, back: null }); }
}

/* ================= Actions ================= */
// Retour immédiat : on met à jour la carte et le bandeau sans reconstruire l'écran.
function patchToggle(t) {
  document.querySelectorAll(`.task[data-id="${t.id}"]`).forEach(card => {
    card.classList.toggle('is-done', t.done);
    const c = card.querySelector('.check');
    if (c) { c.setAttribute('aria-checked', String(t.done)); c.textContent = t.done ? '✓' : ''; }
  });
  const old = document.querySelector('#view .hero');
  if (old) { const tk = getToday(); old.replaceWith(heroNode(tk, tasksOn(tk))); }
}

function doToggle(id, btn) {
  const t = findTask(id); if (!t) return;
  const before = getLevel(state.db.stats.totalCompleted);
  const leftBefore = tasksOn(getToday()).filter(x => !x.done).length;
  const { rewarded } = toggleDone(t, state.db.stats);
  commit();
  if (t.done) {
    N.closeShown(t);
    const r = btn.getBoundingClientRect();
    burst(r.left + r.width / 2, r.top + r.height / 2);
    toast(rewarded ? pick(S.toast.praise) : S.toast.doneNoStar);
    const after = getLevel(state.db.stats.totalCompleted);
    if (after > before) celebrate(S.toast.levelUp(after));
  }
  armTimer();
  const leftAfter = tasksOn(getToday()).filter(x => !x.done).length;
  // Mise à jour ciblée, sauf si les bandeaux changent ou si la liste du jour passe de « il reste des tâches » à « tout est terminé » (ou l'inverse).
  if (state.ui.view === 'today' && bannerSig() === lastBannerSig && (leftBefore === 0) === (leftAfter === 0)) patchToggle(t); else render();
  warnIfUnsaved();
  if (sheetEl().open && sheetCtx && sheetCtx.mode !== 'form') drawSheet();
}

async function submitForm(form) {
  if (form.getAttribute('data-busy') === '1') return; // double appui / Entrée + clic
  form.setAttribute('data-busy', '1');
  const fd = new FormData(form), rem = fd.get('reminder');
  const res = validateTask({
    title: fd.get('title'), note: fd.get('note'), customMinutesBefore: fd.get('customMinutesBefore'), subject: fd.get('subject'), type: fd.get('type'), date: fd.get('date'),
    time: fd.get('time'), priority: fd.get('priority'), reminderEnabled: rem !== 'none', reminderMode: rem
  });
  form.querySelectorAll('[data-err]').forEach(p => { p.textContent = ''; });
  if (!res.ok) {
    for (const k in res.errors) { const p = form.querySelector(`[data-err="${k}"]`); if (p) p.textContent = res.errors[k]; }
    const first = Object.keys(res.errors)[0];
    const f = form.querySelector(`[name="${first}"]`); if (f) f.focus();
    form.removeAttribute('data-busy');
    return;
  }
  const id = form.dataset.id;
  let task;
  if (id) { task = findTask(id); applyEdit(task, res.value); }
  else { task = createTask(res.value); state.db.tasks.push(task); }
  state.ui.lastSubject = task.subject;
  commit();
  // La demande d'autorisation doit partir pendant le geste de l'utilisateur.
  const asking = task.reminder.enabled && state.db.settings.notifications && N.permissionState() === 'default' ? N.requestPermission() : null;
  toast(!task.reminder.enabled ? S.toast.saved : task.reminder.status === 'scheduled' ? S.toast.savedReminder(reminderText(task)) : S.toast.reminderPassed);
  const back = sheetCtx.back; // on revient d'où on vient, sauf si la tâche a changé de jour : on montre alors son jour
  sheetCtx = back && !(back.mode === 'day' && back.key !== task.date) ? back : { mode: 'day', key: task.date, back: null };
  drawSheet(); focusSheet(); render();
  warnIfUnsaved();
  if (asking) await asking;
  armTimer();
  if (asking) render();
}

function deleteTask(id) {
  const t = findTask(id); if (!t) return;
  state.db.tasks.splice(state.db.tasks.indexOf(t), 1);
  commit(); N.closeShown(t); armTimer();
  const back = sheetCtx && sheetCtx.back;
  if (back) { sheetCtx = back; drawSheet(); focusSheet(); } else closeSheet();
  render();
  toast(S.toast.deleted, {
    label: S.actions.undo, ms: 6000,
    onAction: () => { state.db.tasks.push(t); planReminder(t); commit(); runReminders(); render(); toast(S.toast.restored); warnIfUnsaved(); }
  });
  warnIfUnsaved();
}

let pendingOk = null, modalKind = '';
function openModal(kind, nodes, onOk) {
  modalKind = kind; pendingOk = onOk || null;
  const box = $('#modalBody'); box.textContent = ''; box.append(...nodes);
  const m = $('#modal'); showDialog(m);
  const f = box.querySelector('[data-focus]'); if (f) f.focus();
}
function confirmDialog({ title, body, ok, onOk }) {
  openModal('confirm', [
    el('h2', { class: 'modal-title', text: title }), el('p', { text: body }),
    el('div', { class: 'row end' },
      el('button', { class: 'btn btn-quiet', type: 'button', 'data-action': 'modal-close', 'data-focus': '', text: S.actions.cancel }),
      el('button', { class: 'btn btn-danger', type: 'button', 'data-action': 'modal-ok', text: ok }))], onOk);
}
function showOnboarding() {
  openModal('onboarding', [
    el('p', { class: 'onb-star', 'aria-hidden': 'true', text: '★' }),
    el('h2', { class: 'modal-title', text: S.onboarding.title }),
    el('ul', { class: 'onb-list' }, S.onboarding.lines.map(l => el('li', { text: l }))),
    el('button', { class: 'btn btn-primary btn-block', type: 'button', 'data-action': 'onboard-start', 'data-focus': '', text: S.actions.start })]);
}
function finishOnboarding() { state.db.settings.onboarded = true; commit(); }

async function handleImport(file) {
  if (!file) return;
  if (file.size > 5e6) { toast(S.errors.importFail, { ms: 5000 }); return; }
  let text = '';
  try { text = await file.text(); } catch { toast(S.errors.importFail, { ms: 5000 }); return; }
  const res = ST.parseImport(text);
  if (!res.ok) { toast(res.error === 'empty' ? S.errors.importEmpty : res.error === 'future' ? S.errors.importFuture : S.errors.importFail, { ms: 6000 }); return; }
  confirmDialog({
    title: S.confirm.importTitle, body: S.confirm.importBody(state.db.tasks.length, res.db.tasks.length), ok: S.confirm.importOk,
    onOk: () => {
      ST.backupCurrent();
      const r = tryReplaceDB(res.db);
      if (!r.ok) { toast(S.toast.importNoSpace, { ms: 7000 }); return; }
      planAll(); runReminders(); applyTheme(); render();
      if (!r.persisted) { toast(S.toast.importedNotSaved, { label: S.actions.exportShort, onAction: exportDownload, ms: 9000 }); return; }
      toast(res.dropped ? S.toast.importedDropped(res.db.tasks.length, res.dropped) : S.toast.imported(res.db.tasks.length), { ms: 5000 });
    }
  });
}
function exportDownload() {
  const json = ST.exportData(state.db);
  // APK Android : une WebView ne télécharge pas les liens blob:, la sauvegarde passe par le sélecteur de fichiers Android.
  if (Native.isNative() && Native.saveFile(`agenda-etoile-${getToday()}.json`, 'application/json', json)) return;
  const blob = new Blob([json], { type: 'application/json' });
  const a = el('a', { href: URL.createObjectURL(blob), download: `agenda-etoile-${getToday()}.json` });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(S.toast.exported);
}

export function applyTheme() {
  const pref = state.db.settings.theme;
  const dark = pref === 'dark' || (pref === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
  const m = document.querySelector('meta[name=theme-color]'); if (m) m.setAttribute('content', dark ? '#13102A' : '#D42D78');
}

async function act(a, b) {
  const d = b.dataset, s = state.db.settings;
  switch (a) {
    case 'nav': state.ui.view = d.view; render(); window.scrollTo(0, 0); $('#view').focus({ preventScroll: true }); break;
    case 'add': openSheet({ mode: 'form', key: d.key || getToday(), back: sheetCtx && sheetCtx.mode === 'day' ? sheetCtx : null }); break;
    case 'day': openSheet({ mode: 'day', key: d.key, back: null }); break;
    case 'calendar-mark': { const events = state.db.calendarEvents || (state.db.calendarEvents = []); const existing = events.findIndex(e => e.date === d.key); const event = { date: d.key, type: d.type, subject: '', note: '' }; if (existing >= 0) events[existing] = event; else events.push(event); commit(); render(); drawSheet(); toast(S.calendarEvents.marked(d.type)); break; }
    case 'calendar-unmark': { state.db.calendarEvents = (state.db.calendarEvents || []).filter(e => e.date !== d.key); commit(); render(); drawSheet(); break; }
    case 'review-subject': state.ui.reviewSubject = d.subject; render(); window.scrollTo(0,0); break;
    case 'review-back': state.ui.reviewSubject = ''; render(); break;
    case 'open': openSheet({ mode: 'detail', id: d.id, back: sheetCtx && sheetCtx.mode === 'day' ? sheetCtx : null }); break;
    case 'edit': openSheet({ mode: 'form', id: d.id, back: sheetCtx }); break;
    case 'toggle': doToggle(d.id, b); break;
    case 'delete': deleteTask(d.id); break;
    case 'sheet-close': closeSheet(); break;
    case 'sheet-back': sheetBack(); break;
    case 'calmonth': state.ui.calSel = Number(d.i); render(); break;
    case 'calshift': { const x = new Date(state.ui.calYear, state.ui.calMonth + Number(d.d), 1); state.ui.calYear = x.getFullYear(); state.ui.calMonth = x.getMonth(); render(); break; }
    case 'calnow': { const x = new Date(); state.ui.calYear = x.getFullYear(); state.ui.calMonth = x.getMonth(); state.ui.calSel = 0; render(); break; }
    case 'filter': state.ui.filter = d.f; state.ui.limit = PAGE_SIZE; render(); break;
    case 'more': state.ui.limit += PAGE_SIZE; fillTaskList(); break;
    case 'theme': s.theme = d.v; commit(); applyTheme(); render(); break;
    case 'firstday': s.firstDayOfWeek = Number(d.v); commit(); render(); break;
    case 'notif-enable': { const p = await N.requestPermission(); toast(Native.isNative() ? 'Demande d’autorisation envoyée.' : (p === 'granted' ? S.toast.notifOn : S.toast.notifDenied)); render(); break; }
    case 'notif-settings': { Native.openNotificationSettings(); break; }
    case 'exact-alarm-settings': { Native.openExactAlarmSettings(); break; }
    case 'notif-toggle': s.notifications = !s.notifications; commit(); render(); break;
    case 'sound-toggle': s.sound = !s.sound; commit(); render(); break;
    case 'sound-choose': { if (Native.isNative()) { const name = await AU.chooseNotificationSound(); if (name) { s.notificationSoundName = name; commit(); render(); toast(S.toast.soundSaved); } } else $('#notificationSoundFile').click(); break; }
    case 'sound-preview': { const ok = await AU.previewNotificationSound(); if (!ok) toast(S.settings.notificationSoundUnavailable); break; }
    case 'sound-remove': { AU.stopPreview(); await AU.deleteNotificationSound(); s.notificationSoundName = ''; commit(); render(); toast(S.toast.soundRemoved); break; }
    case 'notif-test': {
      const fake = { id: 'test', title: 'Ceci est un rappel test', subject: 'algebre', type: 'homework', note: '', reminder: { mode: 'eve0', notificationId: 'n_test' } };
      const ok = await N.show(fake); toast(ok ? S.toast.testSent : S.toast.testNeedsPermission); break;
    }
    case 'export': exportDownload(); break;
    case 'import': $('#importFile').click(); break;
    case 'reset': confirmDialog({
      title: S.confirm.resetTitle, body: S.confirm.resetBody, ok: S.confirm.resetOk,
      onOk: () => { state.db.tasks.forEach(t => N.closeShown(t)); ST.reset(); state.db = defaultDB(); commit(); armTimer(); applyTheme(); render(); toast(S.toast.resetDone); }
    }); break;
    case 'missed-show': { const t = findTask(d.id); if (t) { t.reminder.status = 'delivered'; commit(); render(); openSheet({ mode: 'detail', id: t.id, back: null }); } break; }
    case 'missed-ignore': { const t = findTask(d.id); if (t) { t.reminder.status = 'cancelled'; commit(); render(); } break; }
    case 'modal-close': $('#modal').close(); break;
    case 'modal-ok': { const f = pendingOk; pendingOk = null; $('#modal').close(); if (f) f(); break; }
    case 'onboard-start': finishOnboarding(); $('#modal').close(); break;
    case 'reload': location.reload(); break;
    case 'update': if (updateWaiting) updateWaiting.postMessage({ type: 'SKIP_WAITING' }); break;
    default: break;
  }
}

/* ================= Démarrage ================= */
export function initUI() {
  applyTheme();
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onScheme = () => { if (state.db.settings.theme === 'system') applyTheme(); };
  if (mq.addEventListener) mq.addEventListener('change', onScheme); else if (mq.addListener) mq.addListener(onScheme);

  document.addEventListener('click', e => {
    const b = e.target.closest('[data-action]');
    if (b) act(b.dataset.action, b);
  });
  document.addEventListener('submit', e => {
    if (e.target.id === 'taskForm') { e.preventDefault(); submitForm(e.target); }
  });
  let qTimer;
  document.addEventListener('input', e => {
    if (e.target.id !== 'q') return;
    clearTimeout(qTimer);
    qTimer = setTimeout(() => { state.ui.query = e.target.value; state.ui.limit = PAGE_SIZE; fillTaskList(); }, 150);
  });
  document.addEventListener('change', async e => {
    if (e.target.id === 'importFile') { handleImport(e.target.files[0]); e.target.value = ''; return; }
    if (e.target.id === 'notificationSoundFile') {
      const file = e.target.files[0]; e.target.value = '';
      if (!file) return;
      try {
        const saved = await AU.saveNotificationSound(file);
        state.db.settings.notificationSoundName = saved.name;
        commit(); render(); toast(S.toast.soundSaved);
      } catch (err) {
        const key = err?.message;
        toast(key === 'audio-too-large' ? S.toast.soundTooLarge : key === 'audio-required' ? S.toast.soundInvalid : S.toast.soundUnavailable);
      }
      return;
    }
    if (e.target.matches('#taskForm [name=reminder]')) {
      const custom = e.target.form?.querySelector('[data-custom-reminder]');
      if (custom) { custom.hidden = e.target.value !== 'custom'; if (e.target.value === 'custom') custom.querySelector('input')?.focus(); }
    }
  });

  const sheet = sheetEl();
  sheet.addEventListener('click', e => { if (e.target === sheet) closeSheet(); });
  sheet.addEventListener('close', () => {
    document.body.classList.remove('no-scroll'); sheetCtx = null;
    const f = lastFocus; lastFocus = null;
    setTimeout(() => { (f && document.contains(f) ? f : $('#view')).focus({ preventScroll: true }); }, 0);
  });
  const modal = $('#modal');
  modal.addEventListener('close', () => { if (modalKind === 'onboarding' && !state.db.settings.onboarded) finishOnboarding(); pendingOk = null; });

  if (typeof window !== 'undefined') {
    window.__agendaNativeFileSaved = ok => { if (ok) toast(S.toast.exported); };
    window.__agendaNativePermissionChanged = p => { toast(p === 'granted' ? S.toast.notifOn : S.toast.notifDenied); render(); };
  }
  render();
  if (!state.db.settings.onboarded) showOnboarding();
  const sp = $('#splash');
  if (sp) setTimeout(() => sp.remove(), reduced() ? 0 : 1400);
}

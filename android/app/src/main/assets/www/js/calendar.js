// Calendrier : 4 mois visibles, grille du mois choisi.
import { S } from './strings.fr.js';
import { state, tasksOn } from './state.js';
import { el, cap, formatDate, getToday, toKey } from './utils.js';

export function monthAt(i) {
  const d = new Date(state.ui.calYear, state.ui.calMonth + i, 1);
  return { y: d.getFullYear(), m: d.getMonth() };
}

export function buildCalendar() {
  const ui = state.ui, first = state.db.settings.firstDayOfWeek, tk = getToday();
  const eventByDate = new Map((state.db.calendarEvents || []).map(event => [event.date, event]));
  const { y, m } = monthAt(ui.calSel);

  const tabs = el('div', { class: 'tabs', role: 'tablist', 'aria-label': S.a11y.monthTabs },
    [0, 1, 2, 3].map(i => {
      const mm = monthAt(i);
      return el('button', {
        class: 'tab', type: 'button', role: 'tab', 'aria-selected': String(i === ui.calSel),
        'aria-label': `${S.months[mm.m]} ${mm.y}`, 'data-action': 'calmonth', 'data-i': i, text: cap(S.monthsShort[mm.m])
      });
    }));

  const head = el('div', { class: 'cal-head' },
    el('h2', { class: 'cal-title', text: `${cap(S.months[m])} ${y}` }),
    el('div', { class: 'cal-nav' },
      el('button', { class: 'icon-btn', type: 'button', 'data-action': 'calshift', 'data-d': -1, 'aria-label': S.calendar.prev, text: '‹' }),
      el('button', { class: 'btn btn-quiet btn-sm', type: 'button', 'data-action': 'calnow', text: S.calendar.today }),
      el('button', { class: 'icon-btn', type: 'button', 'data-action': 'calshift', 'data-d': 1, 'aria-label': S.calendar.next, text: '›' })));

  const wd = el('div', { class: 'weekdays', 'aria-hidden': 'true' },
    Array.from({ length: 7 }, (_, i) => el('span', { text: S.daysShort[(first + i) % 7] })));

  const grid = el('div', { class: 'grid' });
  const lead = (new Date(y, m, 1).getDay() - first + 7) % 7;
  const n = new Date(y, m + 1, 0).getDate();
  for (let i = 0; i < lead; i++) grid.append(el('span', { class: 'blank', 'aria-hidden': 'true' }));
  let total = 0, done = 0;
  for (let d = 1; d <= n; d++) {
    const key = toKey(new Date(y, m, d));
    const ts = tasksOn(key);
    const open = ts.filter(t => !t.done);
    total += ts.length; done += ts.length - open.length;
    const dow = new Date(y, m, d).getDay();
    const cls = ['day'];
    if (dow === 0 || dow === 6) cls.push('is-weekend');
    if (key < tk) cls.push('is-past');
    if (key === tk) cls.push('is-today');
    if (open.length) cls.push('has-open');
    if (open.length >= 3) cls.push('is-busy');
    const event = eventByDate.get(key);
    if (event) cls.push(`event-${event.type}`);
    const subjects = [...new Set(open.map(t => t.subject))].slice(0, 3);
    const urgent = open.some(t => t.priority === 'urgent');
    grid.append(el('button', {
      class: cls.join(' '), type: 'button', 'data-action': 'day', 'data-key': key,
      'aria-label': S.calendar.cell(formatDate(key, { weekday: true }), open.length, ts.length - open.length),
      'aria-current': key === tk ? 'date' : null
    },
      el('span', { class: 'day-num', text: String(d) }),
      event ? el('span', { class: 'event-mark', 'aria-hidden': 'true', text: ({ test_eval: 'TE', test: 'TE', evaluation: 'TE', exam: 'E' })[event.type] }) : null,
      el('span', { class: 'marks', 'aria-hidden': 'true' },
        subjects.map(s => el('i', { class: 'dot', 'data-subject': s })),
        ts.length && !open.length ? el('b', { class: 'tick', text: '✓' }) : null,
        urgent ? el('b', { class: 'bang', text: '!' }) : null)));
  }

  const prog = el('p', { class: 'muted cal-prog', text: total ? S.calendar.monthProgress(done, total) : S.calendar.monthEmpty });
  const legend = el('div', { class: 'calendar-legend', 'aria-label': 'Légende des évaluations' },
    [['test_eval','Test d’évaluation'],['exam','Examen']].map(([type,label]) => el('span', { class: `legend-item legend-${type}` }, el('i'), el('span', { text: label }))));
  return el('section', { class: 'card calendar', 'aria-label': 'Calendrier' }, tabs, head, wd, grid, legend, prog);
}

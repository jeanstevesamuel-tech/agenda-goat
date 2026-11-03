// Dates, heures et petits outils. Aucun calcul de date ailleurs dans le projet.
import { S } from './strings.fr.js';
import { REMINDER_MINUTES_MIN, REMINDER_MINUTES_MAX } from './constants.js';

export const MS_DAY = 86400000;
export const pad = n => String(n).padStart(2, '0');

/* ---------- Dates (clé "AAAA-MM-JJ") ---------- */
export function toKey(d) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }

export function isValidDate(key) {
  if (typeof key !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const [y, m, d] = key.split('-').map(Number);
  if (y < 1970 || y > 2200) return false;
  const dt = new Date(y, m - 1, d);
  return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
}
export function parseDate(key) {
  if (!isValidDate(key)) return null;
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function addDays(key, n) { const d = parseDate(key); d.setDate(d.getDate() + n); return toKey(d); }
export function differenceInDays(a, b) { // b - a
  const A = parseDate(a), B = parseDate(b);
  return Math.round((Date.UTC(B.getFullYear(), B.getMonth(), B.getDate()) - Date.UTC(A.getFullYear(), A.getMonth(), A.getDate())) / MS_DAY);
}
export function getToday(now = Date.now()) { return toKey(new Date(now)); }
export function startOfWeek(key, first = 1) { const d = parseDate(key); return addDays(key, -((d.getDay() - first + 7) % 7)); }
export const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

export function formatDate(key, { weekday = false, year = false } = {}) {
  const d = parseDate(key); if (!d) return '';
  const base = `${d.getDate()} ${S.months[d.getMonth()]}${year ? ' ' + d.getFullYear() : ''}`;
  return weekday ? cap(`${S.days[d.getDay()]} ${base}`) : base;
}
export function relativeDay(key, today = getToday()) {
  const n = differenceInDays(today, key);
  if (n === 0) return 'Aujourd’hui';
  if (n === 1) return 'Demain';
  if (n === -1) return 'Hier';
  const d = parseDate(key);
  return `${S.daysShort[d.getDay()]}. ${d.getDate()} ${S.monthsShort[d.getMonth()]}`;
}

/* ---------- Heures ("HH:MM") ---------- */
export function isValidTime(t) { return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }
export function parseTime(t) { if (!isValidTime(t)) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; }
export function formatTime(t) { return isValidTime(t) ? t.replace(':', 'h') : ''; }

// Instant (ms) où le rappel doit se déclencher, ou null.
export function calculateReminder(date, time, mode, customMinutesBefore = null) {
  const d = parseDate(date); if (!d) return null;
  const y = d.getFullYear(), m = d.getMonth(), j = d.getDate();
  switch (mode) {
    case 'eve0': return new Date(y, m, j - 1, 0, 0).getTime();
    case 'eve18': return new Date(y, m, j - 1, 18, 0).getTime();
    case 'same7': return new Date(y, m, j, 7, 0).getTime();
    // 60 minutes réelles avant l'événement (et non 60 minutes d'horloge murale, faussées par le changement d'heure)
    case 'hour1': { const mins = parseTime(time); return mins == null ? null : new Date(y, m, j, Math.floor(mins / 60), mins % 60).getTime() - 3600000; }
    case 'custom': {
      const eventMins = parseTime(time);
      const before = Number(customMinutesBefore);
      if (eventMins == null || !Number.isFinite(before) || before < REMINDER_MINUTES_MIN || before > REMINDER_MINUTES_MAX) return null;
      return new Date(y, m, j, Math.floor(eventMins / 60), eventMins % 60).getTime() - Math.floor(before) * 60000;
    }
    default: return null;
  }
}

/* ---------- Divers ---------- */
export function uid() { return `task_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`; }
export function normalizeText(s) { return String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase(); }

// Petit constructeur DOM sûr : le texte passe toujours par textContent.
export function el(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'value') e.value = v;
    else if (k === 'checked') e.checked = !!v;
    else e.setAttribute(k, v === true ? '' : String(v));
  }
  const add = k => { if (k == null || k === false) return; if (Array.isArray(k)) k.forEach(add); else e.append(k); };
  kids.forEach(add);
  return e;
}

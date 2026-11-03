// Toute donnée (formulaire, stockage, import, ancienne version) passe par ici :
// validate() -> normalize() -> save()
import { SUBJECTS, TYPES, PRIORITIES, MODES, THEMES, RSTATUS, LIMITS, DB_VERSION, REMINDER_MINUTES_MIN, REMINDER_MINUTES_MAX } from './constants.js';
import { isValidDate, isValidTime, uid } from './utils.js';
import { S } from './strings.fr.js';

export function defaultSettings() {
  return { theme: 'system', notifications: true, sound: true, notificationSoundName: '', firstDayOfWeek: 1, onboarded: false };
}
export function defaultDB() {
  return { version: DB_VERSION, tasks: [], calendarEvents: [], settings: defaultSettings(), stats: { totalCompleted: 0 } };
}

export function normalizeSettings(s) {
  const d = defaultSettings();
  if (!s || typeof s !== 'object') return d;
  return {
    theme: THEMES.includes(s.theme) ? s.theme : d.theme,
    notifications: s.notifications !== false,
    sound: s.sound !== false,
    notificationSoundName: typeof s.notificationSoundName === 'string' ? s.notificationSoundName.slice(0, 120) : '',
    firstDayOfWeek: s.firstDayOfWeek === 0 ? 0 : 1,
    onboarded: s.onboarded === true
  };
}

// Validation stricte d'un formulaire. Retourne { ok, errors, value }.
export function validateTask(input) {
  const errors = {};
  const title = String(input?.title ?? '').replace(/\r\n?/g, '\n').trim();
  if (title.length < 1 || title.length > LIMITS.title) errors.title = S.errors.title;
  const note = String(input?.note ?? '').replace(/\r\n?/g, '\n').trim(); // un navigateur peut renvoyer les retours à la ligne en CRLF
  if (note.length > LIMITS.note) errors.note = S.errors.note;
  if (!SUBJECTS.includes(input?.subject)) errors.subject = S.errors.subject;
  if (!TYPES.includes(input?.type)) errors.type = S.errors.type;
  if (!isValidDate(input?.date)) errors.date = S.errors.date;
  const time = String(input?.time ?? '');
  if (time !== '' && !isValidTime(time)) errors.time = S.errors.time;
  if (!PRIORITIES.includes(input?.priority)) errors.priority = S.errors.priority;
  const enabled = input?.reminderEnabled === true;
  const mode = enabled ? input?.reminderMode : 'eve0';
  if (enabled && !MODES.includes(mode)) errors.reminder = S.errors.reminder;
  else if (enabled && ['hour1', 'custom'].includes(mode) && time === '') errors.reminder = S.errors.reminderNeedsTime;
  const customMinutesBefore = Number(input?.customMinutesBefore);
  if (enabled && mode === 'custom' && (!Number.isInteger(customMinutesBefore) || customMinutesBefore < REMINDER_MINUTES_MIN || customMinutesBefore > REMINDER_MINUTES_MAX)) errors.reminder = S.errors.reminderCustom;

  return {
    ok: Object.keys(errors).length === 0,
    errors,
    value: { title, note, subject: input?.subject, type: input?.type, date: input?.date, time, priority: input?.priority, reminderEnabled: enabled, reminderMode: mode, customMinutesBefore: mode === 'custom' ? customMinutesBefore : null }
  };
}

// Tolérant : répare ce qui peut l'être, renvoie null si la tâche est inutilisable.
const SUBJECT_ALIASES = { maths: 'algebre', math: 'algebre', sciences: 'chimie', histoire: 'histoire_art', fr: 'francais', sci: 'chimie', hist: 'histoire_art', ang: 'anglais' };
function normalizeSubject(value) {
  if (SUBJECTS.includes(value)) return value;
  if (typeof value === 'string' && Object.hasOwn(SUBJECT_ALIASES, value)) return SUBJECT_ALIASES[value];
  return 'autre';
}

export function normalizeTask(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title ?? '').trim().slice(0, LIMITS.title);
  if (!title || !isValidDate(raw.date)) return null;
  const r = raw.reminder && typeof raw.reminder === 'object' ? raw.reminder : {};
  const done = raw.done === true;
  const num = (v, d) => (Number.isFinite(v) && v > 0 ? Math.floor(v) : d);
  return {
    id: typeof raw.id === 'string' && raw.id.length > 0 && raw.id.length <= 64 ? raw.id : uid(),
    title,
    subject: normalizeSubject(raw.subject),
    type: TYPES.includes(raw.type) ? raw.type : 'homework',
    date: raw.date,
    time: isValidTime(raw.time) ? raw.time : '',
    note: String(raw.note ?? '').replace(/\r\n?/g, '\n').trim().slice(0, LIMITS.note),
    done,
    priority: PRIORITIES.includes(raw.priority) ? raw.priority : 'normal',
    completionRewarded: typeof raw.completionRewarded === 'boolean' ? raw.completionRewarded : done,
    completedAt: done ? num(raw.completedAt, null) : null,
    reminder: {
      enabled: r.enabled === true,
      mode: MODES.includes(r.mode) ? r.mode : 'eve0',
      customMinutesBefore: Number.isInteger(r.customMinutesBefore) && r.customMinutesBefore >= REMINDER_MINUTES_MIN && r.customMinutesBefore <= REMINDER_MINUTES_MAX ? r.customMinutesBefore : null,
      scheduledAt: Number.isFinite(r.scheduledAt) ? r.scheduledAt : null,
      status: RSTATUS.includes(r.status) ? r.status : 'pending',
      notificationId: typeof r.notificationId === 'string' ? r.notificationId : null,
      delivery: {
        attempted: r.delivery?.attempted === true,
        delivered: r.delivery?.delivered === true,
        failed: r.delivery?.failed === true
      }
    },
    createdAt: num(raw.createdAt, now),
    updatedAt: num(raw.updatedAt, now)
  };
}

// Valide toute une base. { ok:false } si le format global est inutilisable.
export function validateDatabase(raw, now = Date.now()) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !Array.isArray(raw.tasks)) {
    return { ok: false, error: 'format', db: null, dropped: 0 };
  }
  const seen = new Set();
  const tasks = [];
  let dropped = 0;
  dropped += Math.max(0, raw.tasks.length - LIMITS.maxTasks); // au-delà de la limite : ignorées, mais on le dit
  for (const t of raw.tasks.slice(0, LIMITS.maxTasks)) {
    const n = normalizeTask(t, now);
    if (!n) { dropped++; continue; }
    if (seen.has(n.id)) n.id = uid();
    seen.add(n.id);
    tasks.push(n);
  }
  const st = raw.stats && typeof raw.stats === 'object' ? raw.stats : {};
  const total = Number.isFinite(st.totalCompleted) ? Math.min(LIMITS.maxStars, Math.max(0, Math.floor(st.totalCompleted))) : 0;
  const eventTypes = ['test_eval', 'test', 'evaluation', 'exam'];
  const eventDates = new Set();
  const calendarEvents = [];
  const rawEvents = Array.isArray(raw.calendarEvents) ? raw.calendarEvents.slice(0, 5000) : [];
  for (const event of rawEvents) {
    if (!event || typeof event !== 'object' || !isValidDate(event.date) || !eventTypes.includes(event.type) || eventDates.has(event.date)) { dropped++; continue; }
    eventDates.add(event.date);
    calendarEvents.push({ date: event.date, type: (event.type === 'test' || event.type === 'evaluation') ? 'test_eval' : event.type, subject: SUBJECTS.includes(event.subject) ? event.subject : '', note: String(event.note ?? '').trim().slice(0, 200) });
  }
  return { ok: true, dropped, db: { version: DB_VERSION, tasks, calendarEvents, settings: normalizeSettings(raw.settings), stats: { totalCompleted: total } } };
}

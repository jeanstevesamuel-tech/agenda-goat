// Stockage local : load / save / reset / export / import / migrate / validate.
// Aucune référence à localStorage au chargement du module (testable sous Node).
import { validateDatabase, defaultDB } from './validation.js';
import { DB_VERSION, APP_VERSION, SUBJECTS, TYPES } from './constants.js';

export const KEY = 'agenda-etoile-v2';
export const OLD_KEY = 'agenda-etoile-v1';
export const BACKUP_KEY = 'agenda-etoile-v2-backup';
export const CORRUPT_KEY = 'agenda-etoile-v2-corrupt-backup'; // une seule copie, écrasée à chaque détection

export function storageAvailable() {
  try { const k = '__ae_test'; localStorage.setItem(k, '1'); localStorage.removeItem(k); return true; } catch { return false; }
}

const SUBJECT_V1 = { maths: 'algebre', math: 'algebre', fr: 'francais', sci: 'chimie', sciences: 'chimie', hist: 'histoire_art', histoire: 'histoire_art', ang: 'anglais', autre: 'autre' };
const TYPE_V1 = { devoir: 'homework', lecon: 'lesson', controle: 'exam', projet: 'project' };

// version 1 -> version 2. Ne supprime jamais l'ancienne donnée.
export function migrateDatabase(old) {
  if (!old || typeof old !== 'object') return null;
  if (old.version === DB_VERSION) return validateDatabase(old).db;
  const tasks = (Array.isArray(old.tasks) ? old.tasks : []).map(t => {
    if (!t || typeof t !== 'object') return null;
    const mode = ['eve0', 'eve18', 'same7'].includes(t.remind) ? t.remind : null;
    return {
      id: t.id, title: t.title, subject: SUBJECT_V1[t.subject] || (SUBJECTS.includes(t.subject) ? t.subject : 'autre'), type: TYPE_V1[t.type] || (TYPES.includes(t.type) ? t.type : 'homework'),
      date: t.date, time: '', note: t.note, done: t.done === true, priority: 'normal',
      completionRewarded: t.done === true,
      reminder: { enabled: !!mode, mode: mode || 'eve0', scheduledAt: null, status: 'pending', notificationId: null }
    };
  });
  const v = validateDatabase({ version: DB_VERSION, tasks, calendarEvents: Array.isArray(old.calendarEvents) ? old.calendarEvents : [], settings: {}, stats: { totalCompleted: Number(old.stars) || 0 } });
  return v.ok ? v.db : null;
}

// Les versions 2.0/2.1 créaient une copie horodatée à chaque chargement d'une base corrompue.
// On garde la plus récente comme copie unique, on supprime les autres.
export function pruneLegacyCorruptBackups() {
  try {
    const legacy = [];
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      const m = k && k.match(/^agenda-etoile-v2-corrupt-(\d+)$/);
      if (m) legacy.push({ k, t: Number(m[1]) });
    }
    if (!legacy.length) return 0;
    legacy.sort((a, b) => b.t - a.t);
    if (localStorage.getItem(CORRUPT_KEY) == null) {
      try { localStorage.setItem(CORRUPT_KEY, localStorage.getItem(legacy[0].k)); } catch { return 0; }
    }
    legacy.forEach(x => localStorage.removeItem(x.k));
    return legacy.length;
  } catch { return 0; }
}

export function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); return true; } catch { return false; }
}

// { db, status: 'ok' | 'fresh' | 'migrated' | 'corrupt' | 'unavailable' }
export function load() {
  if (!storageAvailable()) return { db: defaultDB(), status: 'unavailable' };
  pruneLegacyCorruptBackups();
  const raw = localStorage.getItem(KEY);
  if (raw) {
    try {
      const v = validateDatabase(JSON.parse(raw));
      if (!v.ok) throw new Error('format');
      return { db: v.db, status: 'ok', dropped: v.dropped };
    } catch {
      try { localStorage.setItem(CORRUPT_KEY, raw); } catch { /* espace plein */ }
      return { db: defaultDB(), status: 'corrupt' };
    }
  }
  const old = localStorage.getItem(OLD_KEY);
  if (old) {
    try { const db = migrateDatabase(JSON.parse(old)); if (db) { save(db); return { db, status: 'migrated' }; } } catch { /* ignore */ }
  }
  return { db: defaultDB(), status: 'fresh' };
}

export function backupCurrent() {
  try { const cur = localStorage.getItem(KEY); if (cur) localStorage.setItem(BACKUP_KEY, cur); return true; } catch { return false; }
}
export function reset() {
  backupCurrent();
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  return defaultDB();
}

export function exportData(db) {
  return JSON.stringify({ app: 'Agenda Étoile', version: DB_VERSION, appVersion: APP_VERSION, exportedAt: new Date().toISOString(), tasks: db.tasks, calendarEvents: db.calendarEvents || [], settings: db.settings, stats: db.stats }, null, 2);
}

// Validation stricte d'un fichier avant remplacement. N'écrit rien.
export function parseImport(text) {
  let data;
  try { data = JSON.parse(text); } catch { return { ok: false, error: 'json' }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'format' };
  if (data.app && data.app !== 'Agenda Étoile') return { ok: false, error: 'format' };
  if (typeof data.version === 'number' && data.version > DB_VERSION) return { ok: false, error: 'future' };
  let db;
  let dropped = 0;
  if (data.version === DB_VERSION) {
    const v = validateDatabase(data);
    if (!v.ok) return { ok: false, error: 'format' };
    db = v.db; dropped = v.dropped;
  } else if (Array.isArray(data.tasks)) {
    db = migrateDatabase(data);
    if (!db) return { ok: false, error: 'format' };
    dropped = Math.max(0, data.tasks.length - db.tasks.length);
  } else return { ok: false, error: 'format' };
  if (db.tasks.length === 0 && dropped > 0) return { ok: false, error: 'empty' };
  return { ok: true, db, dropped };
}

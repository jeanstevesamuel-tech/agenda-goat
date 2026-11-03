// Valeurs autorisées et limites : une seule source de vérité.
export const APP_VERSION = '2.1.9';
export const DB_VERSION = 2;

export const SUBJECTS = ['anglais', 'chimie', 'algebre', 'geometrie', 'analyse_lineaire', 'analyse_combinatoire', 'trigonometrie', 'statistiques', 'ec', 'informatique', 'physique', 'philosophie', 'espagnol', 'sport', 'bio_geo', 'francais', 'sciences_sociales', 'creole', 'tp', 'histoire_art', 'echec', 'autre'];
export const TYPES = ['homework', 'lesson', 'exam', 'project'];
export const PRIORITIES = ['normal', 'important', 'urgent'];
export const MODES = ['eve0', 'eve18', 'same7', 'hour1', 'custom'];
export const REMINDER_MINUTES_MIN = 1;
export const REMINDER_MINUTES_MAX = 43200; // 30 jours
export const THEMES = ['system', 'light', 'dark'];
export const RSTATUS = ['pending', 'scheduled', 'delivered', 'missed', 'cancelled'];

export const LIMITS = { title: 80, note: 400, maxStars: 100000, maxTasks: 50000 };

export const STAR_STEP = 5;   // 5 étoiles = 1 niveau
export const MAX_LEVEL = 6;
export const GRACE_MS = 10 * 60 * 1000; // au-delà, un rappel est « manqué »
export const PAGE_SIZE = 60;

// Niveaux, statistiques et récompenses (fonctions pures).
import { STAR_STEP, MAX_LEVEL } from './constants.js';
import { addDays, startOfWeek } from './utils.js';

export function getLevel(stars) { return Math.min(MAX_LEVEL, Math.floor(Math.max(0, stars) / STAR_STEP) + 1); }
export function getNextLevel(stars) { const l = getLevel(stars); return l >= MAX_LEVEL ? null : l + 1; }
export function getLevelProgress(stars) {
  const s = Math.max(0, stars), level = getLevel(s);
  if (level >= MAX_LEVEL) return { level, into: STAR_STEP, need: 0, pct: 100, max: true };
  const into = s % STAR_STEP;
  return { level, into, need: STAR_STEP - into, pct: Math.round(into / STAR_STEP * 100), max: false };
}

// getDay(key) -> tâches de ce jour (l'index par date évite de parcourir toute la liste)
export function weekStats(getDay, today, firstDay = 1) {
  const start = startOfWeek(today, firstDay);
  let total = 0, done = 0;
  const bySubject = {};
  for (let i = 0; i < 7; i++) {
    for (const t of getDay(addDays(start, i)) || []) {
      total++;
      if (t.done) { done++; bySubject[t.subject] = (bySubject[t.subject] || 0) + 1; }
    }
  }
  let top = null, best = 0;
  for (const k in bySubject) if (bySubject[k] > best) { best = bySubject[k]; top = k; }
  return { total, done, pct: total ? Math.round(done / total * 100) : 0, top };
}

// Jours consécutifs avec au moins une tâche terminée (aujourd'hui ou hier compte comme départ).
export function computeStreak(tasks, today) {
  const days = new Set();
  for (const t of tasks) if (t.done && t.completedAt) days.add(localKey(t.completedAt));
  let cursor = days.has(today) ? today : addDays(today, -1);
  let n = 0;
  while (days.has(cursor)) { n++; cursor = addDays(cursor, -1); }
  return n;
}
function localKey(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getRewards(stats, streak) {
  const s = stats.totalCompleted;
  return [
    { id: 'streak3', unlocked: streak >= 3 },
    { id: 'done7', unlocked: s >= 7 },
    { id: 'stars10', unlocked: s >= 10 },
    { id: 'stars25', unlocked: s >= 25 }
  ];
}

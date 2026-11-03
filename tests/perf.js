// Mesures de performance (ms). Lance-les sur TON téléphone via /tests/perf.html : les chiffres de Node ne sont pas ceux d'un Tecno.
import { validateDatabase } from '../js/validation.js';
import { state, reindex, tasksOn } from '../js/state.js';
import { weekStats } from '../js/statistics.js';
import { normalizeText, addDays, el } from '../js/utils.js';
import { S } from '../js/strings.fr.js';

const time = (label, fn, out) => { const t = performance.now(); const r = fn(); out.push({ label, ms: Math.round((performance.now() - t) * 10) / 10 }); return r; };

export function measure(n = 10000) {
  const out = [], subjects = ['maths', 'francais', 'sciences', 'histoire', 'anglais', 'autre'];
  const raw = Array.from({ length: n }, (_, i) => ({ id: 't' + i, title: 'Exercices numéro ' + i, note: 'Éléphant page ' + (i % 90), date: addDays('2026-01-01', i % 365), subject: subjects[i % 6] }));
  const v = time(`validation de ${n} tâches`, () => validateDatabase({ tasks: raw }), out);
  state.db = v.db;
  time('index par date', () => reindex(), out);
  time('statistiques de la semaine', () => weekStats(tasksOn, '2026-06-10', 1), out);
  const hits = time('recherche « elephant » (accents ignorés)', () => state.db.tasks.filter(t => normalizeText(`${t.title} ${S.subjects[t.subject]} ${t.note}`).includes('elephant')), out);
  if (typeof document !== 'undefined') {
    time('construction de 60 cartes (une page)', () => hits.slice(0, 60).map(t => el('article', { class: 'task' }, el('button', { text: t.title }), el('span', { text: S.subjects[t.subject] }))), out);
  }
  time('sérialisation JSON (sauvegarde)', () => JSON.stringify(state.db).length, out);
  out.push({ label: 'taille de la sauvegarde (Ko)', ms: Math.round(JSON.stringify(state.db).length / 1024) });
  return out;
}

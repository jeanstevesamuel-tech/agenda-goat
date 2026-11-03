// Horloge virtuelle : Date et minuteurs contrôlés, pour simuler des jours entiers en quelques millisecondes.
import { setImmediate as realImmediate } from 'node:timers';

let globalSeq = 0; // les identifiants de minuteur ne se repètent jamais d'une horloge à l'autre
const RealDate = Date, realSetTimeout = globalThis.setTimeout, realClearTimeout = globalThis.clearTimeout;

export function installClock(startMs) {
  let now = startMs, fires = 0;
  const timers = new Map();
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(now); else super(...a); }
    static now() { return now; }
  }
  globalThis.Date = FakeDate;
  globalThis.setTimeout = (fn, ms = 0) => { const id = ++globalSeq; timers.set(id, { at: now + Math.max(0, Number(ms) || 0), fn }); return id; };
  globalThis.clearTimeout = id => { timers.delete(id); };
  const flush = async () => { for (let i = 0; i < 6; i++) await new Promise(r => realImmediate(r)); };

  async function advanceTo(target) {
    let guard = 0;
    for (;;) {
      let next = null;
      for (const [id, t] of timers) if (t.at <= target && (!next || t.at < next.t.at || (t.at === next.t.at && id < next.id))) next = { id, t };
      if (!next) break;
      if (++guard > 20000) throw new Error('Boucle de minuteurs suspecte (plus de 20000 déclenchements dans une avance)');
      timers.delete(next.id); now = Math.max(now, next.t.at); fires++;
      next.t.fn(); await flush();
    }
    now = Math.max(now, target);
  }
  return {
    advance: ms => advanceTo(now + ms), advanceTo, flush,
    // Simule une veille du téléphone : l'heure saute, les minuteurs en retard partiront au réveil.
    jumpTo: t => { now = t; },
    // Simule la mort du processus (appli tuée) : plus aucun minuteur.
    clearAll: () => timers.clear(),
    now: () => now, pending: () => timers.size, fires: () => fires,
    nextTimerAt: () => { let m = Infinity; for (const t of timers.values()) m = Math.min(m, t.at); return m === Infinity ? null : m; },
    restore() { globalThis.Date = RealDate; globalThis.setTimeout = realSetTimeout; globalThis.clearTimeout = realClearTimeout; }
  };
}
export const RealDateClass = RealDate;

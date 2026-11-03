// localStorage factice pour Node, avec quota optionnel (pour simuler un stockage plein).
export function makeStub() {
  const data = new Map();
  const stub = {
    __stub: true, maxChars: Infinity,
    get length() { return data.size; },
    key: i => [...data.keys()][i] ?? null,
    getItem: k => (data.has(k) ? data.get(k) : null),
    setItem(k, v) {
      const used = [...data].reduce((n, [kk, vv]) => (kk === k ? n : n + kk.length + vv.length), 0);
      if (used + k.length + String(v).length > stub.maxChars) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
      data.set(k, String(v));
    },
    removeItem: k => { data.delete(k); },
    clear() { data.clear(); stub.maxChars = Infinity; },
    keys: () => [...data.keys()]
  };
  return stub;
}

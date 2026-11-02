// One request at a time for the same thing: callers that ask while it's on its way, or within
// `ms` after, share the answer — each gets its own copy, so one screen changing it can't affect
// another. It holds what the server sent (still sealed in an encrypted family), in memory only:
// nothing here is written to the phone's storage, and it's gone when the app closes.
// ⚡ Older than `ms` but within `keep` (30 minutes): the last answer comes back at once and a fresh
// one is asked for behind it; when that differs, onFresh(path) is told, so the screen showing it can
// redraw. A screen you go back to is there straight away, and offline it still shows what it had.
// clear() forgets everything (a change you make: no stale answers after it); drop(test) forgets
// the paths it matches; seed(path, value) keeps an answer you already know (your own data, just
// saved). A failed request is never kept (the last good answer stays).
export function makeShared(get, { ms = 20000, keep = 30 * 60000, now = () => Date.now(), onFresh = null } = {}) {
  const recent = new Map();
  const same = (a, b) => { try { return JSON.stringify(a) === JSON.stringify(b); } catch { return false; } };
  const copy = (v) => structuredClone(v);
  function load(path, e) {
    e.pending = true;
    e.p = get(path).then((v) => {
      const changed = e.has && !same(e.value, v);
      Object.assign(e, { pending: false, at: now(), value: v, has: true });
      if (changed && onFresh && recent.get(path) === e) onFresh(path);
      return v;
    }, (err) => {
      e.pending = false;
      if (!e.has && recent.get(path) === e) recent.delete(path);
      throw err;
    });
    return e.p;
  }
  function shared(path, maxAge = ms) {
    let e = recent.get(path);
    if (!e) { e = { at: 0, has: false }; recent.set(path, e); return load(path, e).then(copy); }
    if (!e.has) return e.p.then(copy); // the first answer is still on its way
    if (now() - e.at > maxAge) {
      if (now() - e.at > keep) { if (!e.pending) load(path, e); return e.p.then(copy); }
      if (!e.pending) load(path, e).catch(() => {});
    }
    return Promise.resolve(copy(e.value));
  }
  shared.clear = () => recent.clear();
  shared.drop = (test) => { for (const k of [...recent.keys()]) if (test(k)) recent.delete(k); };
  shared.seed = (path, value) => recent.set(path, { at: now(), has: true, pending: false, value: copy(value), p: Promise.resolve(value) });
  shared.size = () => recent.size;
  return shared;
}

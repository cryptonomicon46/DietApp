// One request at a time for the same thing: callers that ask while it's on its way, or within
// `ms` after, share the answer — each gets its own copy, so one screen changing it can't affect
// another. It holds what the server sent (still sealed in an encrypted family), in memory only.
// clear() forgets everything (any change you make); a failed request is never kept.
export function makeShared(get, { ms = 20000, now = () => Date.now() } = {}) {
  const recent = new Map();
  function shared(path, maxAge = ms) {
    const hit = recent.get(path);
    if (!hit || (!hit.pending && now() - hit.at > maxAge)) {
      const e = { at: now(), pending: true };
      e.p = get(path).then((v) => { e.pending = false; e.at = now(); return v; }, (err) => { if (recent.get(path) === e) recent.delete(path); throw err; });
      recent.set(path, e);
    }
    return recent.get(path).p.then((v) => structuredClone(v));
  }
  shared.clear = () => recent.clear();
  shared.size = () => recent.size;
  return shared;
}

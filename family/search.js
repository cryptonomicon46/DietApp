// 🔎 Thread search, on the phone: titles, write-ups, replies, screenshot captions and PDF names.
// The threads are unlocked in memory only while you search — never stored and never sent anywhere,
// and there's no search index on the server. Loaded only when you start searching.

const norm = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');

// Every word of the query must appear somewhere in the thread. Best first: title matches, then
// write-up, then replies; newer first within each.
export function searchThreads(query, threads) {
  const words = norm(query).split(/\s+/).filter((w) => w.length > 1 || /\d/.test(w));
  if (!words.length) return [];
  const out = [];
  for (const t of threads) {
    const parts = [
      ['title', t.title],
      ['body', t.body],
      ...(t.replies || []).map((r) => ['reply', r.text, r.name]),
      ...(t.shots || []).map((x) => ['caption', x.cap]),
      ...(t.docs || []).map((x) => ['pdf', x.name]),
    ].filter(([, text]) => text && text !== '🔒');
    const all = norm(parts.map(([, text]) => text).join('\n'));
    if (!words.every((w) => all.includes(w))) continue;
    const hit = parts.find(([, text]) => words.some((w) => norm(text).includes(w)));
    const rank = { title: 0, body: 1, caption: 2, pdf: 2, reply: 3 }[hit[0]];
    out.push({ thread: t, where: hit[0], by: hit[2] || '', snippet: snippet(hit[1], words), rank });
  }
  return out.sort((a, b) => a.rank - b.rank || (b.thread.lastAt || 0) - (a.thread.lastAt || 0));
}

// A short piece of text around the first matching word.
export function snippet(text, words, len = 120) {
  const flat = String(text || '').replace(/\s+/g, ' ').trim();
  const low = norm(flat);
  const at = Math.min(...words.map((w) => low.indexOf(w)).filter((i) => i >= 0));
  if (!Number.isFinite(at)) return flat.slice(0, len);
  const start = Math.max(0, at - 40);
  return `${start ? '…' : ''}${flat.slice(start, start + len)}${start + len < flat.length ? '…' : ''}`;
}

// 🔊 The cloud Pawmily Voice provider (Phase 1: ElevenLabs on the connector). Loaded only by the voice
// router, only when the family's cloud voice is on. It speaks only what the connector signed: a
// { text, ticket } for an answer, or a { phrase } it chooses itself — never arbitrary text.
// speak() resolves true when the cloud voice played, false otherwise (the router then uses the phone).
// iOS plays an audio element only after a tap started it: family/app.js primeAudioNow() starts the
// one shared player (window.__pawPlayer) silently inside the tap.
const playerOf = () => (typeof window !== 'undefined' && (window.__pawPlayer ||= new Audio())) || null;
export function cloudVoiceOutput({ base, token, fid, onFallback = () => {} }) {
  // The last clip is kept (in memory, for this page only) so 🔊 can replay it: a ticket is one-time.
  let last = null, seq = 0;
  const keyOf = (item) => item.phrase ? `p:${item.phrase}` : `t:${item.ticket}`;
  const stop = () => { seq++; try { playerOf()?.pause(); } catch { /* not playing */ } };
  const play = async (url) => { const player = playerOf(); player.src = url; await player.play(); return true; };
  return {
    id: 'cloud',
    available: () => typeof Audio !== 'undefined',
    stop,
    async speak(item) {
      if (!item || (!item.phrase && !(item.text && item.ticket))) return false;
      stop();
      const mine = seq, key = keyOf(item);
      try {
        if (last?.key === key) return await play(last.url);
        const r = await fetch(`${base()}/v2/voice/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) },
          body: JSON.stringify(item.phrase ? { fid: fid(), phrase: item.phrase } : { fid: fid(), text: item.text, ticket: item.ticket }) });
        if (!r.ok) { const j = await r.json().catch(() => ({})); if (j.fallback) onFallback(j.error || 'Using device voice for now.'); return false; }
        const blob = await r.blob();
        if (last) URL.revokeObjectURL(last.url);
        last = { key, url: URL.createObjectURL(blob) };
        if (mine !== seq) return true; // stopped (or a newer answer) meanwhile — nothing to fall back to
        return await play(last.url);
      } catch { return false; }
    },
  };
}

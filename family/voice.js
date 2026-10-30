// 🎙️ Talk's voice boundary. Voice is only a way in and out — it never decides anything: whatever
// is heard becomes plain text for Talk (family/talk.js), which reads it on the phone or asks Claude
// through the gateway, shows typed cards, and saves only through each domain's own code after you
// tap. A different provider (for example a streaming speech service, after its own review) would
// replace one of these objects, not Talk.
//
//   VoiceInputProvider   audio → transcript. start() must run inside the tap (browsers require it),
//                        so the browser one lives in family/app.js (voiceInput) and hands Talk a
//                        session: { text, ended, error, listener, stop(), abort() }.
//   VoiceOutputProvider  response text → audio: { id, available(), speak(text), stop() }.
//
// Today both are the phone's own: speech recognition (on an iPhone Apple's speech service, as
// with dictation) and speech synthesis (Apple's on-device voices). Pawmily only ever handles text.

// Text that reads well aloud: no emoji, arrows or link chevrons.
export const spokenText = (text) => String(text || '').replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}›→]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 900);

export const browserVoiceOutput = {
  id: 'browser-speech',
  available: () => typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
  stop() { try { if (this.available()) speechSynthesis.cancel(); } catch { /* nothing playing */ } },
  speak(text) {
    const words = spokenText(text);
    if (!words || !this.available()) return;
    try {
      this.stop();
      const u = new SpeechSynthesisUtterance(words), lang = navigator.language || 'en-US';
      const voices = speechSynthesis.getVoices().filter((v) => v.lang?.toLowerCase().startsWith(lang.slice(0, 2).toLowerCase()));
      const v = voices.find((x) => /premium|enhanced|siri/i.test(x.name)) || voices.find((x) => x.default) || voices[0];
      if (v) u.voice = v;
      u.lang = v?.lang || lang; u.rate = 1.02;
      speechSynthesis.speak(u);
    } catch { /* the phone can't speak just now */ }
  },
};

// 🔊 The Pawmily voice (ElevenLabs pilot): the same text, spoken in the household's chosen voice by
// the connector (/voice/tts — it holds the key; the phone sends only the words being read aloud).
// Any failure (not set up, offline, the day's limit) falls back to the phone's own voice.
// iOS plays audio only after a tap has started it: family/app.js primeAudioNow() does that in the tap.
// The one shared player: app.js starts it silently inside the tap (window.__pawPlayer) so iOS lets it
// play the answer once it arrives.
const playerOf = () => (typeof window !== 'undefined' && (window.__pawPlayer ||= new Audio())) || null;
export function pawmilyVoiceOutput({ base, token, fallback = browserVoiceOutput }) {
  let url = null, seq = 0;
  const stop = () => { seq++; try { playerOf()?.pause(); } catch { /* not playing */ } if (url) { URL.revokeObjectURL(url); url = null; } fallback.stop(); };
  return {
    id: 'pawmily',
    available: () => typeof Audio !== 'undefined',
    stop,
    async speak(text) {
      const words = spokenText(text);
      if (!words) return;
      stop();
      const mine = seq;
      try {
        const r = await fetch(`${base()}/v2/voice/tts`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}) }, body: JSON.stringify({ text: words }) });
        if (!r.ok) throw new Error(`voice ${r.status}`);
        const blob = await r.blob();
        if (mine !== seq) return; // stopped (or a newer answer) while it was coming
        url = URL.createObjectURL(blob);
        const player = playerOf();
        player.src = url;
        await player.play();
      } catch { if (mine === seq) fallback.speak(words); }
    },
  };
}

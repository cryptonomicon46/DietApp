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

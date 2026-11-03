// 🎤 Patient listening for Talk (Release 1, part D). One listening session over the phone's own
// speech recognition (continuous, with interim words), kept going through normal pauses:
//   about 2 s of silence → "Still listening…"; 3.5 s → finish (tunable); no words at all for 9 s →
//   "I didn't hear anything"; 90 s in all → finish. Done finishes at once and keeps the words still
//   being heard. When the phone ends recognition on its own, it's restarted and nothing heard is
//   lost; if the phone refuses the restart (iPhone may want a tap), it holds: the words stay on
//   screen with "Tap to keep talking" (which adds to them) and Done. Never a restart loop.
//   A microphone that never starts (iPhone sometimes leaves recognition dead — after the app was
//   in the background, or speech played in the same tap): no "audio started" within 3 s → one fresh
//   recogniser is tried (create({ fresh: true })); if that is silent too, it ends with 'no-start'
//   (Talk says tap 🎤 again) — never a wait that needs the app closed.
// Pure: the recogniser, the clock and the timers are passed in (tests use fakes; app.js passes
// the browser's SpeechRecognition). Only words ever reach it — never audio.
export const LISTEN = { hintMs: 2000, finishMs: 3500, noWordsMs: 9000, maxMs: 90000, restartMs: 250, bootMs: 3000 };
// Errors that mean "this phone won't listen" (not "nobody spoke").
const REFUSED = new Set(['not-allowed', 'service-not-allowed', 'audio-capture', 'network']);
const norm = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const tidy = (t) => String(t || '').replace(/\s+/g, ' ').trim();

// A finish time you set on your phone, kept between 1.5 and 6 s.
export const finishMsOf = (v) => { const n = +v; return Number.isFinite(n) && n >= 1500 && n <= 6000 ? n : LISTEN.finishMs; };

/**
 * @param create  ({ again, fresh }) => recogniser ({ start, stop, abort, onresult, onerror, onend,
 *                and on a real one onstart / onaudiostart }), already set up (lang, continuous,
 *                interimResults). Called for the first start and every restart; `fresh` asks for a
 *                new one (the last one never started its microphone).
 * @returns the session: { state: 'listening'|'pausing'|'held'|'done', text, ended, reason, error,
 *          listener, stop() (Done), abort() (Cancel / Type instead: keeps nothing), resume() (Tap to
 *          keep talking — call it inside the tap) }
 */
export function makeListener({ create, timers = globalThis, now = () => Date.now(), finishMs = LISTEN.finishMs } = {}) {
  const T = { ...LISTEN, finishMs: finishMsOf(finishMs) };
  const segs = []; // one array of final pieces per recognition session (restarts add one)
  const seen = new Set(); // `${session}:${resultIndex}` already kept
  let interim = '', rec = null, sess = -1, frozen = null, restarts = [], lastErr = '', retried = false, heardAudio = false;
  const t = {};
  const s = {
    state: 'listening', ended: false, reason: '', error: '', listener: null, hintMs: T.hintMs, finishMs: T.finishMs,
    get text() { return frozen ?? tidy([...segs.flat(), interim].join(' ')); },
    stop: () => { if (s.ended) return; finish('done'); },
    abort: () => { if (s.ended) return; frozen = ''; finish('cancel'); },
    resume: () => {
      if (s.state !== 'held') return;
      s.state = 'listening';
      // Some time to start talking again; once words come, the usual pauses apply.
      arm('finish', T.noWordsMs, () => finish('pause'));
      start();
      emit();
    },
  };
  const emit = () => { try { s.listener?.(); } catch { /* the screen's problem, not the session's */ } };
  const arm = (k, ms, fn) => { timers.clearTimeout(t[k]); t[k] = timers.setTimeout(fn, ms); };
  const clear = (...ks) => { for (const k of ks) { timers.clearTimeout(t[k]); t[k] = null; } };
  const has = () => segs.some((x) => x.length) || !!interim;

  function keep(i, text) {
    heardAudio = true; clear('boot');
    const key = `${sess}:${i}`, piece = tidy(text);
    if (seen.has(key) || !piece) return;
    seen.add(key);
    const mine = segs[sess], so = norm(mine.join(' ')), n = norm(piece);
    // Engines that resend everything heard so far as one "final": keep only the newest whole.
    if (so && (n === so || n.startsWith(`${so} `))) { mine.length = 0; mine.push(piece); return; }
    if (so && so.endsWith(n)) return; // the same words again
    mine.push(piece);
  }
  function onresult(e) {
    if (s.ended || this !== rec) return;
    const res = e.results || [];
    let live = '';
    for (let i = e.resultIndex || 0; i < res.length; i++) {
      const r = res[i], words = r?.[0]?.transcript || '';
      if (r?.isFinal) keep(i, words); else live += ` ${words}`;
    }
    interim = tidy(live);
    if (!has()) return emit();
    // Words: back to listening, and the pause clock starts again.
    s.state = 'listening';
    clear('nowords');
    arm('hint', T.hintMs, () => { if (!s.ended && s.state === 'listening') { s.state = 'pausing'; emit(); } });
    arm('finish', T.finishMs, () => finish('pause'));
    emit();
  }
  function onerror(e) {
    if (s.ended || this !== rec) return;
    lastErr = e?.error || 'error';
    // Refused on the very first start, before any words: the phone won't listen here.
    if (REFUSED.has(lastErr) && sess === 0 && !has()) finish('error', lastErr);
  }
  function onend() {
    if (s.ended || this !== rec || s.state === 'held') return;
    // The phone ended recognition on its own: start again (keeping every word), unless that keeps
    // failing — then hold, never loop.
    const at = now();
    restarts = restarts.filter((x) => at - x < 5000);
    if (REFUSED.has(lastErr) || restarts.length >= 3) return hold();
    restarts.push(at);
    arm('restart', T.restartMs, () => { if (!s.ended && s.state !== 'held') start(true); });
  }
  function start(again = false, fresh = false) {
    lastErr = '';
    let r;
    try { r = create({ again, fresh }); } catch { return again ? hold() : finish('error', 'error'); }
    rec = r; sess += 1; segs[sess] = [];
    interim && segs[sess - 1]?.push(interim); // words heard but not yet final when it stopped stay
    interim = '';
    r.onresult = onresult; r.onerror = onerror; r.onend = onend;
    // The microphone really started (a real recogniser says so); words count too.
    const live = function () { if (this === rec) { heardAudio = true; clear('boot'); } };
    const watch = !heardAudio && ('onaudiostart' in r || 'onstart' in r);
    if (watch) { r.onaudiostart = live; r.onstart = live; }
    try { r.start(); } catch { return again ? hold() : finish('error', 'error'); }
    if (watch) arm('boot', T.bootMs, () => { if (!s.ended && rec === r && !heardAudio && !has()) noStart(r); });
    return null;
  }
  // Started, but its microphone never did: once with a fresh recogniser, then say so.
  function noStart(r) {
    try { r.onend = null; r.abort(); } catch { /* already stopped */ }
    if (!retried) { retried = true; return start(true, true); }
    return finish('error', 'no-start');
  }
  function hold() {
    if (s.ended) return;
    clear('hint', 'finish', 'restart', 'nowords', 'boot');
    if (!has()) return finish('nowords', lastErr && REFUSED.has(lastErr) ? lastErr : 'no-speech');
    s.state = 'held';
    emit();
  }
  function finish(reason, error = '') {
    if (s.ended) return;
    if (frozen == null) frozen = s.text;
    if (reason === 'nowords' && !frozen) error ||= 'no-speech';
    Object.assign(s, { ended: true, state: 'done', reason, error });
    clear('hint', 'finish', 'restart', 'nowords', 'max', 'boot');
    const r = rec; rec = null;
    try { r?.abort(); } catch { /* already stopped */ }
    emit();
  }

  arm('nowords', T.noWordsMs, () => { if (!has()) finish('nowords', 'no-speech'); });
  arm('max', T.maxMs, () => finish('max'));
  start();
  return s;
}

// 🗣️ Talk button styles — mockups only. A prominent button that's fun to press, floating just above
// the bottom bar on every tab (thumb reach). Green, a golden buzzer, and a red show-style buzzer —
// the look of a game-show buzzer, no show's name or logo. `float` is added to the running app's page.

const MIC = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/></svg>';
const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.8l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 16.8l-5.4 2.9 1-6.1L3.2 9.3l6.1-.9z"/></svg>';
const PAW = '<svg viewBox="0 0 24 24" aria-hidden="true"><ellipse cx="7" cy="9" rx="2" ry="2.6"/><ellipse cx="11" cy="6.2" rx="2" ry="2.6"/><ellipse cx="15.4" cy="6.6" rx="2" ry="2.6"/><ellipse cx="18.4" cy="10.4" rx="1.9" ry="2.4"/><path d="M12.6 11.4c2.6 0 5.2 3.4 5.2 5.6 0 1.8-1.4 2.6-3 2.4-1-.1-1.4-.6-2.2-.6s-1.3.5-2.3.6c-1.6.2-3-.6-3-2.4 0-2.2 2.6-5.6 5.3-5.6z"/></svg>';

export const CSS = `
.tb { position: fixed; z-index: 40; border: 0; cursor: pointer; display: grid; place-items: center; padding: 0; }
.tb svg { width: 30px; height: 30px; fill: none; stroke: #fff; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
.tb-cap { position: fixed; z-index: 40; font: 800 11px/1 system-ui, sans-serif; letter-spacing: .08em; text-transform: uppercase; text-align: center; pointer-events: none; }
/* 1 · Green, round, glowing */
.tb-green { right: 18px; bottom: calc(var(--nav-h, 64px) + 22px); width: 68px; height: 68px; border-radius: 50%;
  background: radial-gradient(circle at 34% 28%, #7cf0b0 0%, #2fb46d 42%, #17824a 78%, #0f5f36 100%);
  box-shadow: 0 0 0 6px rgba(47,180,109,.18), 0 0 0 13px rgba(47,180,109,.08), 0 10px 22px rgba(15,95,54,.45), inset 0 -5px 9px rgba(0,0,0,.25), inset 0 3px 6px rgba(255,255,255,.45); }
.tb-green-cap { right: 18px; width: 68px; bottom: calc(var(--nav-h, 64px) + 4px); color: #17824a; }
/* 1b · Green pill with words */
.tb-pill { left: 50%; transform: translateX(-50%); bottom: calc(var(--nav-h, 64px) + 16px); height: 58px; padding: 0 22px 0 14px; border-radius: 999px; display: flex; gap: 10px; align-items: center;
  background: linear-gradient(180deg, #45d18a, #1f9d5b 60%, #167a46); color: #fff; font: 800 1.05rem/1 system-ui, sans-serif; white-space: nowrap;
  box-shadow: 0 0 0 5px rgba(47,180,109,.16), 0 10px 22px rgba(15,95,54,.4), inset 0 2px 4px rgba(255,255,255,.4), inset 0 -3px 6px rgba(0,0,0,.2); }
.tb-pill .ic { width: 38px; height: 38px; border-radius: 50%; background: rgba(255,255,255,.2); display: grid; place-items: center; }
.tb-pill svg { width: 22px; height: 22px; }
/* 2 · Golden buzzer: a domed gold button in a brushed ring, a star on top */
.tb-gold { left: 50%; transform: translateX(-50%); bottom: calc(var(--nav-h, 64px) + 14px); width: 86px; height: 86px; border-radius: 50%;
  background: conic-gradient(from 210deg, #f6e7b0, #b98a1e, #fff3c4, #8a6410, #f3d77a, #b98a1e, #f6e7b0);
  box-shadow: 0 12px 26px rgba(120,80,0,.45), 0 0 0 4px rgba(255,214,90,.25), 0 0 28px 6px rgba(255,200,40,.35); }
.tb-gold .dome { width: 70px; height: 70px; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 36% 28%, #fffbe2 0%, #ffe680 16%, #ffc928 44%, #e09b00 72%, #9b6400 100%);
  box-shadow: inset 0 -7px 12px rgba(120,70,0,.45), inset 0 5px 8px rgba(255,255,255,.7), 0 2px 3px rgba(0,0,0,.25); }
.tb-gold svg { width: 30px; height: 30px; fill: #fff6cc; stroke: #a86d00; stroke-width: 1.2; filter: drop-shadow(0 1px 1px rgba(120,70,0,.5)); }
.tb-gold.paw svg { width: 32px; height: 32px; fill: #8a5a00; stroke: none; filter: drop-shadow(0 1px 0 rgba(255,250,220,.8)); }
.tb-gold-cap { left: 0; right: 0; bottom: calc(var(--nav-h, 64px) + 1px); color: #a8740a; }
.tb-gold.pressed { box-shadow: 0 4px 10px rgba(120,80,0,.4), 0 0 0 6px rgba(255,214,90,.35), 0 0 60px 22px rgba(255,200,40,.55); }
.tb-gold.pressed .dome { transform: scale(.94); background: radial-gradient(circle at 40% 34%, #fffbe2 0%, #ffe680 20%, #ffc928 50%, #d08e00 80%, #8f5c00 100%); }
.confetti { position: fixed; inset: 0; pointer-events: none; z-index: 30; overflow: hidden; }
.confetti i { position: absolute; width: 9px; height: 15px; border-radius: 2px; opacity: .95; }
/* 3 · Red show-style buzzer: a red dome on a dark metal base */
.tb-red { left: 50%; transform: translateX(-50%); bottom: calc(var(--nav-h, 64px) + 14px); width: 88px; height: 88px; border-radius: 50%;
  background: radial-gradient(circle at 50% 40%, #5b6168 0%, #2a2e33 55%, #121416 100%); box-shadow: 0 12px 24px rgba(0,0,0,.45), inset 0 2px 3px rgba(255,255,255,.25), inset 0 -3px 6px rgba(0,0,0,.6); }
.tb-red .dome { width: 68px; height: 68px; border-radius: 50%; display: grid; place-items: center;
  background: radial-gradient(circle at 36% 28%, #ffd0cc 0%, #ff6a60 14%, #e3141f 46%, #a10812 76%, #5e0309 100%);
  box-shadow: inset 0 -7px 12px rgba(80,0,0,.5), inset 0 5px 8px rgba(255,255,255,.55), 0 0 0 3px #1a1c1f, 0 0 22px 4px rgba(255,40,40,.35); }
.tb-red svg { stroke: #fff; filter: drop-shadow(0 1px 1px rgba(80,0,0,.6)); }
.tb-red-cap { left: 0; right: 0; bottom: calc(var(--nav-h, 64px) + 1px); color: #c0121c; }
/* room under the content so nothing hides behind the button */
#view { padding-bottom: 120px !important; }
/* the Talk sheet after pressing */
.tk-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 8px; } .tk-h h2 { margin: 0; font-size: 1.15rem; }
.tk-in { display: flex; gap: 8px; align-items: flex-end; margin-top: 12px; } .tk-in textarea { flex: 1; min-height: 48px; font: inherit; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); resize: none; } .tk-in button { min-height: 48px; min-width: 48px; }
.tk-ex { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 4px; } .tk-ex button { background: var(--card); color: var(--ink); border: 1px solid var(--line); font-weight: 600; font-size: .9rem; padding: 9px 14px; min-height: 40px; }
.tk-hint { font-size: .8rem; color: var(--muted); margin: 6px 2px 0; }
`;

const talkSheet = (title = 'Go ahead — what\'s on your mind?') => `<div class="tk-h"><h2>${title}</h2><button type="button" class="icon-btn" aria-label="Close">✕</button></div>
  <div class="tk-ex"><button type="button">Plan my day</button><button type="button">What needs me?</button><button type="button">Plan something this weekend</button></div>
  <p class="tk-hint">🎤 Tap the microphone on your keyboard to speak — only the words reach Pawmily.</p>
  <div class="tk-in"><textarea placeholder="Ask or tell Pawmily…" rows="1"></textarea><button type="button" aria-label="Send">↑</button></div>`;
const confetti = () => {
  const colors = ['#ffd23f', '#ffe680', '#e0a800', '#fff3b0', '#c98d00', '#ffcf33'];
  let out = '';
  for (let i = 0; i < 70; i++) {
    const x = (i * 37) % 100, y = (i * 53) % 62, r = (i * 47) % 180, c = colors[i % colors.length], s = 0.6 + ((i * 13) % 10) / 10;
    out += `<i style="left:${x}%;top:${y}%;background:${c};transform:rotate(${r}deg) scale(${s})"></i>`;
  }
  return `<div class="confetti">${out}</div>`;
};

export const SCREENS = [
  { id: 'B1-green', title: 'Green: a round glowing button, bottom right, on every tab', float: `<button type="button" class="tb tb-green" aria-label="Talk to Pawmily">${MIC}</button><span class="tb-cap tb-green-cap">Talk</span>` },
  { id: 'B2-green-pill', title: 'Green pill with words: says what it does', float: `<button type="button" class="tb tb-pill" aria-label="Talk to Pawmily"><span class="ic">${MIC}</span>Talk to Pawmily</button>` },
  { id: 'B3-gold', title: 'Golden buzzer (star), centered above the bar', float: `<button type="button" class="tb tb-gold" aria-label="Talk to Pawmily"><span class="dome">${STAR}</span></button>` },
  { id: 'B4-gold-paw', title: 'Golden buzzer with a paw — Pawmily\'s own', float: `<button type="button" class="tb tb-gold paw" aria-label="Talk to Pawmily"><span class="dome">${PAW}</span></button>` },
  { id: 'B5-gold-pressed', title: 'Golden buzzer pressed: a burst of gold, then the Talk sheet', float: `${confetti()}<button type="button" class="tb tb-gold paw pressed" aria-label="Talk to Pawmily"><span class="dome">${PAW}</span></button>`, sheet: talkSheet('✨ Go ahead — what\'s on your mind?') },
  { id: 'B6-red', title: 'Red show-style buzzer on a metal base', float: `<button type="button" class="tb tb-red" aria-label="Talk to Pawmily"><span class="dome">${MIC}</span></button>` },
];

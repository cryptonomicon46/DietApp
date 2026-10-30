// 🗣️ Talk — what happens around the button (mockups only, nothing wired up). The golden pill at rest,
// a small gold circle once you scroll, the Talk sheet with the keyboard up (button hidden), the result
// and Undo, and staying out of the way in focused screens. Plus two quieter alternatives: a Talk bar
// on Home (+ a small header icon elsewhere), and the button docked in the bottom bar. No confetti.

const TALKIC = '<svg viewBox="0 0 32 32" aria-hidden="true"><path class="bub" d="M5 7.5A4.5 4.5 0 0 1 9.5 3h13A4.5 4.5 0 0 1 27 7.5v9a4.5 4.5 0 0 1-4.5 4.5H14l-6 5v-5h0A3 3 0 0 1 5 18z"/><rect class="mic" x="13.5" y="6.5" width="5" height="8" rx="2.5"/><path class="mic-s" d="M11 12a5 5 0 0 0 10 0M16 17v2"/></svg>';

export const CSS = `
.bub { fill: #fffbe8; stroke: #8a5a00; stroke-width: 1.6; } .mic { fill: #8a5a00; } .mic-s { fill: none; stroke: #8a5a00; stroke-width: 1.8; stroke-linecap: round; }
.gold-ring { background: conic-gradient(from 200deg, #f6e7b0, #b98a1e, #fff3c4, #8a6410, #f3d77a, #b98a1e, #f6e7b0); }
.gold-dome { background: radial-gradient(120% 140% at 30% 20%, #fffbe2 0%, #ffe680 18%, #ffc928 48%, #e09b00 78%, #a56c00 100%); box-shadow: inset 0 -6px 10px rgba(120,70,0,.4), inset 0 4px 7px rgba(255,255,255,.7); }
/* the golden pill at rest */
.tp { position: fixed; z-index: 40; left: 50%; transform: translateX(-50%); bottom: calc(var(--nav-h, 64px) + 14px); height: 60px; padding: 4px; border-radius: 999px; border: 0; box-shadow: 0 10px 22px rgba(120,80,0,.35); }
.tp .in { height: 52px; border-radius: 999px; display: flex; align-items: center; gap: 10px; padding: 0 20px 0 8px; white-space: nowrap; font: 900 1.02rem/1 system-ui, sans-serif; color: #5a3b00; text-shadow: 0 1px 0 rgba(255,248,210,.85); }
.tp svg { width: 32px; height: 32px; }
.tp .ic { width: 40px; height: 40px; border-radius: 50%; display: grid; place-items: center; background: rgba(255,255,255,.35); }
/* scrolled: a small gold circle in the corner */
.tc { position: fixed; z-index: 40; right: 16px; bottom: calc(var(--nav-h, 64px) + 14px); width: 56px; height: 56px; border-radius: 50%; border: 0; padding: 3px; box-shadow: 0 8px 18px rgba(120,80,0,.35); }
.tc .in { width: 50px; height: 50px; border-radius: 50%; display: grid; place-items: center; } .tc svg { width: 30px; height: 30px; }
#view { padding-bottom: 110px !important; }
/* the sheet with the keyboard */
.tk-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 6px; } .tk-h h2 { margin: 0; font-size: 1.15rem; display: flex; gap: 8px; align-items: center; }
.tk-h h2 svg { width: 26px; height: 26px; }
.tk-lead { font-size: .9rem; color: var(--muted); margin: 0 0 10px; }
.tk-in { display: flex; gap: 8px; align-items: flex-end; } .tk-in .box { flex: 1; min-height: 50px; font: inherit; padding: 13px 14px; border-radius: 16px; border: 2px solid var(--brand); background: var(--card); color: var(--muted); }
.tk-in .box b { display: inline-block; width: 2px; height: 1.1em; background: var(--brand); vertical-align: -3px; margin-right: 2px; }
.tk-in button { min-height: 50px; min-width: 50px; }
.tk-ex { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; } .tk-ex button { background: var(--card); color: var(--ink); border: 1px solid var(--line); font-weight: 600; font-size: .88rem; padding: 8px 12px; min-height: 38px; }
.kb { margin: 12px -16px -18px; background: #d1d4da; padding: 8px 4px 10px; display: grid; gap: 7px; }
.kb .r { display: flex; gap: 5px; justify-content: center; } .kb i { flex: 0 0 8.4%; height: 40px; border-radius: 6px; background: #fff; box-shadow: 0 1px 0 #8e9196; font: 400 1.05rem/40px system-ui; text-align: center; color: #111; font-style: normal; }
.kb .w { flex: 0 0 46%; } .kb .s { flex: 0 0 12%; background: #adb1b9; } .kb .m { flex: 0 0 11%; background: #adb1b9; font-size: 1.1rem; }
@media (prefers-color-scheme: dark) { .kb { background: #2b2b2d; } .kb i { background: #6b6b6e; color: #fff; box-shadow: none; } .kb .s, .kb .m { background: #464649; } }
/* after Apply */
.tk-toast { position: fixed; left: 16px; right: 16px; bottom: calc(var(--nav-h, 64px) + 84px); background: #1f2522; color: #fff; border-radius: 14px; padding: 12px 14px; display: flex; justify-content: space-between; gap: 10px; align-items: center; z-index: 50; font-size: .9rem; }
.tk-toast span:last-child { display: flex; gap: 14px; } .tk-toast b { color: #8fe0b5; white-space: nowrap; }
/* focused screens: no button */
.fx-mock h1 { margin: 4px; } .fx-mock .set { display: grid; grid-template-columns: 54px 1fr 1fr 48px; gap: 6px; align-items: center; padding: 6px 0; border-top: 1px solid var(--line); }
.fx-mock .set input { min-height: 40px; text-align: center; } .fx-mock .ck { width: 44px; height: 44px; border-radius: 50%; padding: 0; }
.fx-foot { position: fixed; left: 0; right: 0; bottom: calc(var(--nav-h, 64px)); padding: 10px 16px; background: linear-gradient(to top, var(--bg) 80%, transparent); }
.fx-foot button { width: 100%; min-height: 50px; }
/* alternative 1: a Talk bar on Home, a small gold icon in the header elsewhere */
.tbar { display: flex; align-items: center; gap: 10px; border-radius: 999px; padding: 4px; margin: 4px 0 14px; box-shadow: 0 6px 16px rgba(120,80,0,.22); }
.tbar .in { flex: 1; display: flex; align-items: center; gap: 10px; border-radius: 999px; padding: 6px 16px 6px 6px; min-height: 52px; font: 800 1rem/1.2 system-ui, sans-serif; color: #5a3b00; }
.tbar .in small { display: block; font-weight: 600; font-size: .8rem; color: #7a5600; }
.tbar svg { width: 34px; height: 34px; flex: none; }
.thead { width: 40px; height: 40px; border-radius: 50%; border: 0; padding: 2px; box-shadow: 0 3px 8px rgba(120,80,0,.3); }
.thead .in { width: 36px; height: 36px; border-radius: 50%; display: grid; place-items: center; } .thead svg { width: 24px; height: 24px; }
/* alternative 2: docked in the bottom bar (an action, not a sixth place to go) */
#nav.dock { grid-template-columns: repeat(6, 1fr) !important; overflow: visible; }
#nav.dock .tdock { position: relative; display: grid; justify-items: center; align-content: end; gap: 2px; padding: 0 0 6px; background: none; color: #a8740a; font: 700 .68rem/1 system-ui; }
#nav.dock .tdock .c { position: absolute; top: -22px; width: 58px; height: 58px; border-radius: 50%; padding: 3px; box-shadow: 0 6px 14px rgba(120,80,0,.35); }
#nav.dock .tdock .c .in { width: 52px; height: 52px; border-radius: 50%; display: grid; place-items: center; } #nav.dock .tdock svg { width: 30px; height: 30px; }
.note { font-size: .8rem; color: var(--muted); margin: 8px 4px; }
`;

const pill = `<button type="button" class="tp gold-ring" aria-label="Talk to Pawmily"><span class="in gold-dome"><span class="ic">${TALKIC}</span>Talk to Pawmily</span></button>`;
const circle = `<button type="button" class="tc gold-ring" aria-label="Talk to Pawmily"><span class="in gold-dome">${TALKIC}</span></button>`;
const kb = `<div class="kb" aria-hidden="true"><div class="r">${'qwertyuiop'.split('').map((k) => `<i>${k}</i>`).join('')}</div><div class="r">${'asdfghjkl'.split('').map((k) => `<i>${k}</i>`).join('')}</div><div class="r"><i class="s">⇧</i>${'zxcvbnm'.split('').map((k) => `<i>${k}</i>`).join('')}<i class="s">⌫</i></div><div class="r"><i class="s">123</i><i class="m">🎤</i><i class="w">space</i><i class="s">send</i></div></div>`;
const talkSheet = (box, extra = '') => `<div class="tk-h"><h2>${TALKIC}Talk to Pawmily</h2><button type="button" class="icon-btn" aria-label="Close">✕</button></div>
  <p class="tk-lead">Type it, or tap 🎤 on the keyboard and say it. You'll see the plan before anything changes.</p>
  <div class="tk-in"><span class="box">${box}</span><button type="button" aria-label="Send">↑</button></div>${extra}`;
const train = `<div class="fx-mock"><p style="margin:4px"><a class="linkish small">‹ Today's Workout</a></p><h1 class="hl-h">Upper Body</h1><p class="small muted" style="margin:0 4px 8px">1 of 2 exercises · 3 of 6 sets · 18 min</p>
  <section class="card"><b>Bench Press</b><p class="small muted" style="margin:2px 0 6px">Plan 3 × 8 @ 135 lb · Last time 135 × 8, 8, 7</p>
  ${[1, 2, 3].map((n) => `<div class="set"><span class="small">Set ${n}</span><input value="8" aria-label="reps"><input value="135" aria-label="lb"><button type="button" class="ck">✓</button></div>`).join('')}</section>
  <section class="card"><b>Rows</b><p class="small muted" style="margin:2px 0 6px">Plan 3 × 10 @ 60 lb</p>${[1, 2, 3].map((n) => `<div class="set"><span class="small">Set ${n}</span><input placeholder="10"><input placeholder="60"><button type="button" class="ck ghost">✓</button></div>`).join('')}</section></div>
  <div class="fx-foot"><button type="button">Complete workout</button></div>`;

export const SCREENS = [
  { id: 'D1-rest', title: '1 · At the top of a page: the golden pill, above the bar', float: pill },
  { id: 'D2-scrolled', title: '2 · Scrolling: it shrinks to a gold circle in the corner (scroll up and the pill is back)', float: circle, scroll: 520 },
  { id: 'D3-open', title: '3 · Tap: the Talk sheet slides up with the keyboard ready; the button hides', sheet: talkSheet('<b></b>Ask or tell Pawmily…', `<div class="tk-ex"><button type="button">Add a movie</button><button type="button">Plan a date</button><button type="button">Log my lunch</button></div>${kb}`) },
  { id: 'D4-result', title: '4 · The plan, then Apply', sheet: talkSheet('Add Project Hail Mary to our reading list', `<div class="card" style="margin-top:10px"><b>Project Hail Mary</b><p class="small muted" style="margin:2px 0 8px">Andy Weir · 2021 → Want to Read, with Pat</p><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><button type="button">Add to Read</button><button type="button" class="ghost">Change</button></div></div>`) },
  { id: 'D5-done', title: '5 · Done: the sheet closes, you stay where you were — Undo or Open, and the button is back', float: circle, toast: '<span>📚 Added to Want to Read</span><span><b>Undo</b><b>Open ›</b></span>' },
  { id: 'D6-focused', title: '6 · Busy screens (a workout in progress, a sheet, typing): no button', view: train },
  { id: 'E1-homebar', title: 'Alternative A · A Talk bar at the top of Home (nothing floating)', homebar: true },
  { id: 'E2-headericon', title: 'Alternative A · Other tabs: a small gold icon in the header', headericon: true, nav: 'us' },
  { id: 'E3-dock', title: 'Alternative B · Docked in the bottom bar (an action, not a sixth place to go)', dock: true },
];
export { TALKIC };

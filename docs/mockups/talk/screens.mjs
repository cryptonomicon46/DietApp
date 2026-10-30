// 🗣️ Talk to Pawmily — Checkpoint T0 mockups (design only, nothing wired up). Each screen is HTML put
// into the running family app (its real header, bottom bar and style.css), then photographed at 390
// and 320 px and in dark mode. Synthetic data only (Sam and Pat). Delete this folder once Talk is built.
// `talk: true` adds the proposed 🗣️ Talk button to the real header (decision 1).

export const CSS = `
.tk-btn { width: 40px; height: 40px; border-radius: 50%; padding: 0; background: var(--brand-soft); color: var(--brand); border: 1px solid color-mix(in srgb, var(--brand) 35%, transparent); font-size: 1.05rem; }
.tk-h { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: 0 0 8px; }
.tk-h h2 { margin: 0; font-size: 1.15rem; }
.tk-in { display: flex; gap: 8px; align-items: flex-end; }
.tk-in textarea { flex: 1; min-height: 48px; max-height: 120px; font: inherit; padding: 12px 14px; border-radius: 16px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); resize: none; }
.tk-in button { min-height: 48px; min-width: 48px; padding: 0 16px; }
.tk-said { background: var(--brand-soft); border-radius: 16px 16px 4px 16px; padding: 10px 12px; margin: 4px 0 10px auto; max-width: 88%; font-size: .95rem; }
.tk-hint { font-size: .8rem; color: var(--muted); margin: 6px 2px 0; }
.tk-ex { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 4px; }
.tk-ex button { background: var(--card); color: var(--ink); border: 1px solid var(--line); font-weight: 600; font-size: .9rem; padding: 9px 14px; min-height: 40px; }
.tk-card { border: 1px solid var(--line); border-radius: 16px; background: var(--card); padding: 12px 14px; margin: 8px 0; }
.tk-card h3 { margin: 0 0 2px; font-size: 1.05rem; }
.tk-step { display: grid; grid-template-columns: 26px minmax(0,1fr); gap: 2px 10px; padding: 10px 0; border-top: 1px solid var(--line); align-items: start; }
.tk-step:first-of-type { border-top: 0; }
.tk-step .ck { width: 22px; height: 22px; border-radius: 6px; background: var(--brand); color: var(--brand-ink); display: grid; place-items: center; font-size: .8rem; font-weight: 800; margin-top: 2px; }
.tk-step .ck.off { background: var(--bg); border: 1px solid var(--line); color: transparent; }
.tk-step b { display: block; } .tk-step small { color: var(--muted); font-size: .83rem; display: block; }
.tk-who { font-size: .72rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; color: var(--muted); }
.tk-time { display: grid; grid-template-columns: 74px minmax(0,1fr); gap: 2px 10px; padding: 8px 0; border-top: 1px dashed var(--line); }
.tk-time:first-of-type { border-top: 0; }
.tk-time > span:first-child { font-weight: 800; font-variant-numeric: tabular-nums; }
.tk-src { font-size: .74rem; color: var(--muted); }
.tk-src.warn { color: var(--warn); }
.tk-ok { color: var(--brand); font-weight: 700; font-size: .88rem; margin: 8px 0 0; }
.tk-acts { display: grid; gap: 8px; margin-top: 12px; }
.tk-acts .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.tk-acts button { min-height: 48px; }
.tk-pick { display: grid; gap: 8px; margin: 8px 0; }
.tk-pick button { justify-content: flex-start; text-align: left; background: var(--card); color: var(--ink); border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; min-height: 56px; font-weight: 600; gap: 12px; }
.tk-pick small { display: block; color: var(--muted); font-weight: 500; }
.tk-poster { width: 38px; height: 54px; border-radius: 6px; background: linear-gradient(135deg, #6b5b3e, #c9a46a); flex: none; }
.tk-poster.b { background: linear-gradient(135deg, #2b4f6e, #6fa3c9); } .tk-poster.c { background: linear-gradient(135deg, #5a2d2d, #b85c4a); } .tk-poster.k { background: linear-gradient(135deg, #1d2f2a, #5c8f7a); }
.tk-book { display: flex; gap: 12px; align-items: center; }
.tk-row { display: flex; justify-content: space-between; align-items: center; gap: 10px; padding: 10px 0; border-top: 1px solid var(--line); font-size: .93rem; }
.tk-row .seg { margin: 0; }
.tk-sw { width: 44px; height: 26px; border-radius: 99px; background: var(--brand); position: relative; flex: none; }
.tk-sw::after { content: ""; position: absolute; top: 3px; right: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; }
.tk-sw.off { background: var(--line); } .tk-sw.off::after { right: auto; left: 3px; }
.tk-note { font-size: .78rem; color: var(--muted); margin: 10px 2px 0; line-height: 1.4; }
.tk-tag { display: inline-block; font-size: .68rem; font-weight: 800; letter-spacing: .04em; text-transform: uppercase; padding: 2px 8px; border-radius: 99px; background: #ede4ff; color: #5b3aa0; margin-left: 6px; vertical-align: middle; }
.tk-dec { font-size: .74rem; font-weight: 800; letter-spacing: .03em; color: #5b3aa0; background: #f3eefe; border-radius: 10px; padding: 6px 10px; margin: 0 0 10px; }
.tk-plan { border: 1px solid var(--line); border-radius: 16px; background: var(--card); padding: 12px 14px; margin: 8px 0; }
.tk-plan .acts { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-top: 10px; }
.tk-plan .acts button { min-height: 44px; padding: 8px 6px; font-size: .88rem; }
.tk-toast { position: fixed; left: 16px; right: 16px; bottom: calc(var(--nav-h, 64px) + 20px); background: #1f2522; color: #fff; border-radius: 14px; padding: 12px 14px; display: flex; justify-content: space-between; gap: 10px; align-items: center; z-index: 50; font-size: .9rem; }
.tk-toast b { color: #8fe0b5; white-space: nowrap; }
.tk-wh { display: inline-flex; gap: 6px; align-items: center; font-size: .8rem; color: var(--muted); }
.tk-wh i { width: 9px; height: 9px; border-radius: 50%; background: #FFDE00; display: inline-block; }
@media (prefers-color-scheme: dark) { .tk-tag, .tk-dec { background: #2d2440; color: #cdb8ff; } }
`;

const sheet = (title, body, { said = '', input = '' } = {}) => `<div class="tk-h"><h2>🗣️ ${title}</h2><button type="button" class="icon-btn" aria-label="Close">✕</button></div>
  ${said ? `<p class="tk-said">${said}</p>` : ''}${body}
  ${input !== null ? `<div class="tk-in" style="margin-top:12px"><textarea placeholder="Ask or tell Pawmily…" rows="1">${input}</textarea><button type="button" aria-label="Send">↑</button></div>` : ''}`;
const card = (inner) => `<div class="tk-card">${inner}</div>`;
const step = (on, title, sub, who = '') => `<div class="tk-step"><span class="ck${on ? '' : ' off'}">✓</span><span>${who ? `<span class="tk-who">${who}</span>` : ''}<b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span></div>`;
const acts = (...rows) => `<div class="tk-acts">${rows.map((r) => (Array.isArray(r) ? `<div class="two">${r.join('')}</div>` : r)).join('')}</div>`;
const b = (t, ghost = false) => `<button type="button"${ghost ? ' class="ghost"' : ''}>${t}</button>`;
const ex = (...xs) => `<div class="tk-ex">${xs.map((x) => `<button type="button">${x}</button>`).join('')}</div>`;

export const SCREENS = [
  { id: 'T1-header', title: 'Where Talk lives: one 🗣️ button in the header on every tab (decision 1, recommended)', likely: 'Tap 🗣️', talk: true, view: null },
  { id: 'T2-home', title: 'Talk on Home: the box, keyboard dictation, three examples for Home', likely: 'Type or say something', talk: true, sheet: sheet('Talk to Pawmily', `
    <p class="small" style="margin:0 0 4px">Say or type what's on your mind — Pawmily shows you a plan before anything changes.</p>
    ${ex('Plan my day', 'What needs me?', 'Plan something this weekend')}
    <p class="tk-hint">🎤 Tap the microphone on your keyboard to speak. Only the words reach Pawmily, never audio.</p>`) },
  { id: 'T3-us', title: 'Talk on Us: examples change with the tab', likely: 'Add a movie', talk: true, sheet: sheet('Talk to Pawmily', `${ex('Plan a date', 'Add a movie', 'Add a book')}<p class="tk-hint">Examples, not commands — say it however you like.</p>`) },
  { id: 'T4-book', title: 'One-step capture: a book to Read (with "recommended by", decision 5)', likely: 'Add to Read', talk: true, sheet: sheet('Talk to Pawmily', card(`<div class="tk-book"><span class="tk-poster b"></span><span><b>Project Hail Mary</b><br><span class="small muted">Andy Weir · 2021 · from Open Library</span></span></div>
    <div class="tk-row" style="margin-top:10px"><span>List</span><div class="seg"><button type="button" class="on">Want to Read</button><button type="button">Reading</button></div></div>
    <div class="tk-row"><span>Who sees it</span><span class="small"><b>Just us</b> ›</span></div>
    <div class="tk-row"><span>Recommended by Pat <span class="tk-tag">decision 5</span></span><span class="tk-sw"></span></div>
    ${acts(b('Add to Read'), b('Change', true))}`), { said: 'Add Project Hail Mary to my reading list — Pat recommended it' }) },
  { id: 'T5-which', title: 'Several matches: the smallest question (Watch)', likely: 'Tap the right Dune', talk: true, sheet: sheet('Talk to Pawmily', `<p class="small" style="margin:0 0 6px"><b>Which Dune?</b></p>
    <div class="tk-pick"><button type="button"><span class="tk-poster"></span><span>Dune: Part Two<small>Movie · 2024 · Denis Villeneuve</small></span></button><button type="button"><span class="tk-poster c"></span><span>Dune<small>Movie · 2021</small></span></button><button type="button"><span class="tk-poster k"></span><span>Dune: Prophecy<small>Series · 2024</small></span></button></div>
    <p class="tk-hint">It goes to <b>Want to Watch</b> on your list with Pat.</p>`, { said: 'Add Dune to our watchlist' }) },
  { id: 'T6-watching', title: 'A status change: one tap, Undo after', likely: 'Move to Watching', talk: true, sheet: sheet('Talk to Pawmily', card(`<div class="tk-book"><span class="tk-poster k"></span><span><b>Severance</b><br><span class="small muted">Season 2 · on your list with Pat</span></span></div>
    <p class="small" style="margin:10px 0 0">Want to Watch → <b>Watching</b></p>${acts(b('Move to Watching'), b('Change', true))}`), { said: "We're watching Severance now" }), toast: '<span>📺 Severance → Watching</span><b>Undo</b>' },
  { id: 'T7-date', title: 'A date proposal: a plan, not a booking — nothing is sent until you tap Propose', likely: 'Propose to Pat', talk: true, sheet: sheet('Talk to Pawmily', card(`<h3>Saturday date 💞</h3><p class="small muted" style="margin:0 0 6px">Sat, Oct 31 · near Santana Row · for you and Pat</p>
    <div class="tk-time"><span>6:30 PM</span><span><b>Dinner</b><br><span class="small">Pick a place — from your saved date ideas and this week's ideas</span><br><span class="tk-src">Your words · places come in T3</span></span></div>
    <div class="tk-time"><span>8:15 PM</span><span><b>Drinks or something after</b><br><span class="tk-src">Your words</span></span></div>
    <p class="tk-ok">✓ You're both free 6–11 PM <span class="tk-src">(checked on this phone)</span></p>
    ${acts(b('Propose to Pat'), [b('Change', true), b('Save idea', true)])}`), { said: "I'd like to propose a date night Saturday at 6:30 near Santana Row" }) },
  { id: 'T8-pat', title: "Pat's side: the proposal on Us — in, another time, or can't (decision 3)", likely: "🙌 I'm in", talk: false, view: `<h1 class="hl-h" style="margin:4px">💞 Us</h1><div class="m-sec" style="margin:14px 4px 6px;font-size:.78rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted)">Plans</div>
    <div class="tk-plan"><span class="tk-who">Sam proposes</span><h3 style="margin:2px 0">💞 Saturday date</h3><p class="small muted" style="margin:0">Sat, Oct 31 · 6:30 PM dinner near Santana Row · 8:15 PM drinks</p>
    <div class="acts"><button type="button">🙌 I'm in</button><button type="button" class="ghost">Another time</button><button type="button" class="ghost">Can't</button></div>
    <p class="tk-note">"Another time" and "Can't" are new (today: In · Maybe · Later). <span class="tk-tag">decision 3</span></p></div>` },
  { id: 'T9-counter', title: 'Suggest another time → Sam sees it and accepts or keeps the first', likely: 'Accept 7:00', talk: false, view: `<h1 class="hl-h" style="margin:4px">💞 Us</h1>
    <div class="tk-plan"><span class="tk-who">Pat suggests another time</span><h3 style="margin:2px 0">💞 Saturday date</h3><p class="small" style="margin:4px 0 0"><s class="muted">6:30 PM</s> → <b>7:00 PM</b> · "Can we push to 7? Dog walk first."</p>
    <div class="acts" style="grid-template-columns:1fr 1fr"><button type="button">Accept 7:00</button><button type="button" class="ghost">Keep 6:30</button></div></div>` },
  { id: 'T10a-agreed-auto', title: "Both in: on the calendar automatically, as today (decision 2, option A — recommended)", likely: 'Nothing; it’s done', talk: false, view: `<h1 class="hl-h" style="margin:4px">💞 Us</h1>
    <div class="tk-plan"><span class="tag tg">You're both in 🎉</span><h3 style="margin:6px 0 2px">💞 Saturday date</h3><p class="small muted" style="margin:0">Sat, Oct 31 · 7:00 PM · near Santana Row</p><p class="tk-ok">📅 On your calendar for both of you</p></div>`, toast: "<span>🎉 It's a plan — it's on the calendar</span><b>Undo</b>" },
  { id: 'T10b-agreed-offer', title: 'Both in: "Add to calendar" offered instead (decision 2, option B)', likely: 'Add to calendar', talk: false, view: `<h1 class="hl-h" style="margin:4px">💞 Us</h1>
    <div class="tk-plan"><span class="tag tg">You're both in 🎉</span><h3 style="margin:6px 0 2px">💞 Saturday date</h3><p class="small muted" style="margin:0">Sat, Oct 31 · 7:00 PM · near Santana Row</p><div class="acts" style="grid-template-columns:1fr"><button type="button">📅 Add to calendar for both of us</button></div></div>` },
  { id: 'T11-compound', title: 'A compound request: one card, every step listed and tickable', likely: 'Do these', talk: true, sheet: sheet('Talk to Pawmily', card(`<h3>Here's a plan</h3>
    ${step(true, 'Add “Dune: Part Two” to Want to Watch', 'Movie · 2024 · your list with Pat', 'Watch')}
    ${step(true, 'Saturday: dinner 6:30, then watch at home 8:30', 'You’re both free 6–11 PM (checked on this phone) · runs 2 h 46 min', 'Calendar')}
    ${step(true, 'Propose it to Pat', 'Pat gets it on Us and answers', 'Us')}
    ${acts(b('Do these'), b('Change', true))}<p class="tk-note">Showtimes at a theater need a provider (T3); until then it plans watching at home.</p>`), { said: 'Add that movie to our Watch list and see whether we can watch it Saturday after dinner' }) },
  { id: 'T12-meal', title: 'Health: a meal, through the same Tell me preview', likely: 'Log lunch', talk: true, sheet: sheet('Talk to Pawmily', card(`<h3>Lunch</h3>
    <div class="tk-row" style="border:0"><span>Chicken burrito bowl <span class="small muted">· 1 bowl</span></span><span class="small"><b>640</b> kcal · 42 g P</span></div>
    <div class="tk-row"><span>Iced latte <span class="small muted">· 16 oz, 2% milk</span></span><span class="small"><b>190</b> kcal · 12 g P</span></div>
    <p class="small" style="margin:8px 0 0">830 kcal · 54 g protein · <span class="muted">≈ 640 left today</span></p>${acts(b('Log lunch'), b('Change', true))}`), { said: 'Log lunch: chicken bowl and an iced latte' }) },
  { id: 'T13-day', title: 'Plan my day (a later step, T4): a proposal you can take or leave', likely: 'Looks good', talk: true, sheet: sheet('Talk to Pawmily', card(`<h3>Your Friday</h3><p class="small muted" style="margin:0 0 4px"><span class="tk-wh"><i></i> Recovery 63% · your usual range</span></p>
    <div class="tk-time"><span>7:00 AM</span><span><b>Upper Body</b> <span class="small muted">· about 50 min (your usual)</span></span></div>
    <div class="tk-time"><span>12:30 PM</span><span><b>Lunch as planned</b> <span class="small muted">· 598 kcal</span></span></div>
    <div class="tk-time"><span>5:30 PM</span><span><b>Dog walk</b> <span class="small muted">· your turn today</span></span></div>
    <div class="tk-time"><span>7:00 PM</span><span><b>Date with Pat</b> <span class="small muted">· agreed</span></span></div>
    ${acts(b('Looks good'), b('Change', true))}<p class="tk-note">Nothing moves unless you change it. WHOOP adds context; it never decides.</p>`), { said: 'Plan my day' }) },
  { id: 'T14-cant', title: "Something it can't do yet: says so, and offers the nearest screen", likely: 'Open the date ideas', talk: true, sheet: sheet('Talk to Pawmily', card(`<p style="margin:0">I can't book tables yet.</p><p class="small muted" style="margin:6px 0 0">Reservations stay on the restaurant's own page. I can add it to your date ideas or propose the evening to Pat.</p>
    ${acts([b('Propose to Pat'), b('Date ideas', true)])}`), { said: 'Book a table for two at 7' }) },
  { id: 'T15-privacy', title: 'First use: what Talk sends (once, before the first request)', likely: 'Got it', talk: true, sheet: `<div class="tk-h"><h2>🗣️ Before you start</h2></div>
    <p class="small"><b>Pawmily reads your request with Claude.</b> Here's exactly what goes:</p>
    <ul class="small" style="padding-left:18px;margin:6px 0">
    <li>Your words — with people's names swapped for roles (<i>"dinner with Pat"</i> → <i>"dinner with your partner"</i>)</li>
    <li>Only the facts that request needs — e.g. when you're free (not what's on your calendar), a movie title</li>
    <li>Never your family key, notes, Threads, Closet, weight or meal history</li></ul>
    <p class="small">Nothing changes until you tap a button. We keep a line that a request happened (not what it said); Anthropic doesn't train on it.</p>
    ${acts(b('Got it'))}` },
];

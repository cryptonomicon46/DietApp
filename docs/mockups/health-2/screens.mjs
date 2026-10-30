// Health 2 — Checkpoint A mockups (design only, not wired up). Each screen is HTML injected into the
// running family app (its real header, bottom nav and style.css), then photographed at 390 and 320
// px by shoot.mjs. Synthetic data only (Sam). Delete this folder once Health 2 is built.

export const CSS = `
.m-sec { margin: 14px 4px 6px; font-size: .78rem; font-weight: 800; letter-spacing: .06em; text-transform: uppercase; color: var(--muted); }
.m-today { padding: 4px 0; }
.m-row { display: grid; grid-template-columns: 30px minmax(0,1fr); gap: 4px 10px; padding: 12px 14px; border-top: 1px solid var(--line); align-items: start; }
.m-row:first-child { border-top: 0; }
.m-ic { font-size: 1.25rem; line-height: 1.5; text-align: center; }
.m-t { font-weight: 700; } .m-s { color: var(--muted); font-size: .85rem; }
.m-acts { grid-column: 2; display: flex; gap: 6px; margin-top: 6px; }
.m-acts button { min-height: 44px; padding: 8px 12px; font-size: .92rem; white-space: nowrap; }
.m-acts .grow { flex: 1; }
.m-ico { width: 46px; flex: none; padding: 8px 0 !important; font-size: 1.15rem !important; }
.m-weigh { grid-column: 2; display: flex; gap: 6px; align-items: center; margin-top: 4px; }
.m-weigh input { flex: 1; min-width: 0; min-height: 44px; font-size: 1.05rem; }
.m-weigh button { min-height: 44px; }
.m-done { color: var(--brand); font-weight: 700; }
.m-prog { grid-column: 2; display: grid; gap: 4px; margin-top: 4px; }
.m-strip { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.m-tile { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 9px 10px; min-height: 44px; }
.m-tile b { display: block; font-size: 1.15rem; } .m-tile span { font-size: .74rem; color: var(--muted); }
.m-rec b { color: #c58a00; } .m-green b { color: var(--brand); }
.m-line { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 14px; min-height: 44px; text-decoration: none; color: inherit; }
.m-line + .m-line { border-top: 1px solid var(--line); }
.m-go { color: var(--brand); font-weight: 700; white-space: nowrap; }
.m-spark { width: 70px; height: 22px; color: var(--brand); }
.m-sheet-h { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin: 0 0 4px; }
.m-sheet-h h2 { margin: 0; font-size: 1.2rem; }
.m-tot { display: flex; gap: 10px; flex-wrap: wrap; font-size: .85rem; margin: 6px 0 10px; }
.m-tot b { font-size: 1rem; } .m-p { color: #c0392b; } .m-c { color: #2f6db5; } .m-f { color: #b7791f; } .m-a { color: #7b4bb3; }
.m-food { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 2px 8px; align-items: center; padding: 8px 0; border-top: 1px solid var(--line); }
.m-step { display: inline-flex; align-items: center; gap: 4px; }
.m-step button { width: 40px; height: 40px; padding: 0; background: var(--bg); color: var(--ink); border: 1px solid var(--line); font-size: 1.1rem; }
.m-step input { width: 64px; text-align: center; min-height: 40px; }
.m-primary { display: grid; gap: 8px; margin-top: 12px; }
.m-primary .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.m-primary button { min-height: 50px; font-size: 1rem; }
.m-more { margin-top: 10px; border-top: 1px solid var(--line); padding-top: 4px; }
.m-more summary { list-style: none; padding: 12px 2px; font-weight: 700; color: var(--brand); cursor: pointer; min-height: 44px; }
.m-more summary::-webkit-details-marker { display: none; }
.m-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.m-grid button { min-height: 56px; flex-direction: column; align-items: flex-start; justify-content: center; gap: 0; text-align: left; padding: 8px 14px; font-size: .92rem; border-radius: 16px; }
.m-grid button small { display: block; font-weight: 500; color: var(--muted); font-size: .74rem; }
.m-macro { display: grid; grid-template-columns: 70px 1fr; align-items: center; gap: 8px; margin: 8px 0; }
.m-macro label { font-weight: 700; }
.m-macro .m-step input { width: 80px; font-size: 1.1rem; }
.m-macro .m-step button { width: 48px; height: 48px; }
.m-note { background: var(--brand-soft); border-radius: 12px; padding: 8px 10px; font-size: .84rem; margin: 8px 0; }
.m-est { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 2px 8px; padding: 9px 0; border-top: 1px solid var(--line); }
.m-est small { color: var(--muted); grid-column: 1 / -1; }
.m-photo { height: 120px; border-radius: 14px; background: linear-gradient(135deg,#d9cbb3,#b9a37f 40%,#8c7a5c); display: grid; place-items: center; color: #fff; font-weight: 700; margin-bottom: 8px; }
.m-drink { display: grid; grid-template-columns: 30px minmax(0,1fr) auto; gap: 8px; align-items: center; padding: 6px 0; border-top: 1px solid var(--line); }
.m-label { font-size: .8rem; font-weight: 700; color: var(--muted); margin: 10px 0 4px; }
.m-banner { background: var(--brand-soft); border-radius: 14px; padding: 10px 12px; font-size: .88rem; margin: 6px 0 10px; }
.m-ex { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 10px 12px; margin: 10px 0; }
.m-ex-h { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
.m-ex-h b { font-size: 1rem; }
.m-set { display: grid; grid-template-columns: 52px 1fr 1fr 48px; gap: 6px; align-items: center; padding: 5px 0; }
.m-set input { min-height: 40px; text-align: center; padding: 6px 4px; }
.m-set .ck { width: 44px; height: 44px; padding: 0; border-radius: 50%; }
.m-set .ck.off { background: var(--bg); color: var(--muted); border: 1px solid var(--line); }
.m-set.done { opacity: .8; } .m-set.done span { color: var(--brand); font-weight: 700; }
.m-foot { position: sticky; bottom: calc(var(--nav-h, 64px) + 8px); display: grid; gap: 8px; padding: 10px 0; background: linear-gradient(to top, var(--bg) 75%, transparent); }
.m-foot button { min-height: 48px; }
.m-foot .two { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
.m-stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 10px 0; }
.m-stats div { background: var(--bg); border-radius: 12px; padding: 8px; text-align: center; }
.m-stats b { display: block; font-size: 1.15rem; } .m-stats span { font-size: .74rem; color: var(--muted); }
.m-zones { display: flex; height: 10px; border-radius: 99px; overflow: hidden; margin: 6px 0 2px; }
.m-zones i:nth-child(1){background:#9ec5e8} .m-zones i:nth-child(2){background:#7cc49b} .m-zones i:nth-child(3){background:#f2c14e} .m-zones i:nth-child(4){background:#ef8a3c} .m-zones i:nth-child(5){background:#d9534f}
.m-mus { display: grid; grid-template-columns: 92px minmax(0,1fr) 54px; gap: 8px; align-items: center; padding: 6px 0; font-size: .88rem; }
.m-track { position: relative; height: 12px; border-radius: 99px; background: var(--line); }
.m-band { position: absolute; top: 0; bottom: 0; background: color-mix(in srgb, var(--brand) 22%, transparent); border-radius: 99px; }
.m-fill { position: absolute; left: 0; top: 3px; height: 6px; border-radius: 99px; background: var(--brand); }
.m-fill.low { background: #c58a00; }
.m-mus span:last-child { text-align: right; color: var(--muted); font-variant-numeric: tabular-nums; }
.m-opt { display: grid; gap: 8px; }
.m-opt label { display: flex; gap: 10px; align-items: center; border: 1px solid var(--line); border-radius: 14px; padding: 12px; min-height: 48px; background: var(--card); }
.m-opt label.on { border-color: var(--brand); background: var(--brand-soft); }
.m-tag { display: inline-block; font-size: .7rem; font-weight: 800; letter-spacing: .04em; padding: 2px 8px; border-radius: 99px; background: #ede4ff; color: #5b3aa0; vertical-align: middle; }
.m-toast { position: fixed; left: 16px; right: 16px; bottom: calc(var(--nav-h, 64px) + 76px); background: #1f2522; color: #fff; border-radius: 14px; padding: 12px 14px; display: flex; justify-content: space-between; align-items: center; z-index: 50; font-size: .9rem; }
.m-toast b { color: #8fe0b5; }
.m-hot { background: color-mix(in srgb, var(--brand) 9%, var(--card)); box-shadow: inset 4px 0 0 var(--brand); }
.m-nexttag { font-size: .7rem; font-weight: 800; letter-spacing: .05em; text-transform: uppercase; color: var(--brand); margin-left: 6px; }
.m-secrow { display: flex; justify-content: space-between; align-items: baseline; margin: 14px 4px 6px; }
.m-secrow .m-sec { margin: 0; }
.m-nextline { font-size: .82rem; color: var(--brand); font-weight: 700; }
.m-mini { grid-column: 2; display: flex; justify-content: space-between; align-items: center; }
.m-last { font-size: .8rem; color: var(--muted); margin: 2px 0 4px; }
.m-last b { color: var(--ink); font-weight: 600; }
.m-timer { display: flex; justify-content: space-between; align-items: center; background: var(--brand-soft); border-radius: 12px; padding: 8px 12px; margin: 6px 0 2px; font-weight: 700; }
.m-ctx { grid-column: 1 / -1; font-size: .86rem; margin-top: 8px; }
.m-opt3 { display: grid; gap: 8px; margin: 8px 0; }
.m-optc { border: 1px solid var(--line); border-radius: 14px; padding: 10px 12px; display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 2px 8px; align-items: center; background: var(--card); }
.m-optc .m-s { grid-column: 1; }
.m-optc button { grid-row: 1 / span 2; grid-column: 2; min-height: 40px; padding: 6px 12px; }
.m-chipline { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 6px; }
.m-wk { display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 2px 8px; padding: 10px 0; border-top: 1px solid var(--line); }
.m-wk:first-child { border-top: 0; }
.m-wk b { font-size: 1.02rem; }
textarea.m-tell { width: 100%; min-height: 84px; font: inherit; padding: 10px 12px; border-radius: 14px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); }
@media (max-width: 359px) { .m-acts:not(.keep) { flex-wrap: wrap; } .m-acts:not(.keep) .grow { flex: 1 1 100%; } .m-trend { display: none; } }
.m-three { grid-template-columns: repeat(3, 1fr) !important; } .m-three button { white-space: nowrap; padding: 8px 6px; font-size: .92rem; }
`;


const spark = `<svg class="m-spark" viewBox="0 0 70 22" aria-hidden="true"><polyline points="0,6 10,7 20,9 30,8 40,11 50,13 60,14 70,16" fill="none" stroke="currentColor" stroke-width="2"/></svg>`;
const head = (sub = 'Friday, October 30') => `<div class="hl-head"><h1 class="hl-h">💪 Health</h1><button type="button" class="linkish small">🔒 Private ›</button></div><p class="m-s" style="margin:-8px 4px 4px">${sub}</p>`;

// ── Today: the three anchors, always in this order. One row may be emphasised (m-hot) and one quiet
// "next" hint sits beside the heading (A1/A2).
const today = (next, rows) => `<div class="m-secrow"><span class="m-sec">Today</span>${next ? `<span class="m-nextline">Next: ${next}</span>` : ''}</div><section class="card m-today" style="padding:0">${rows.join('')}</section>`;
const weightRow = (logged, hot) => logged
  ? `<div class="m-row"><span class="m-ic">⚖️</span><div class="m-mini"><span><span class="m-t">Weight</span> <span class="m-done">✓ 179.4 lb</span></span><span class="m-s m-trend">trend −0.4/wk</span></div></div>`
  : `<div class="m-row${hot ? ' m-hot' : ''}"><span class="m-ic">⚖️</span><div><div class="m-t">Today's weight</div><div class="m-s">Morning is best · last 180.0 lb</div></div><form class="m-weigh"><input type="number" inputmode="decimal" placeholder="180.0" aria-label="Today's weight in pounds"><span class="small">lb</span><button type="button">Save</button></form></div>`;
const acts4 = `<div class="m-acts"><button type="button" class="grow">✓ As planned</button><button type="button" class="ghost m-ico" aria-label="Log with a photo">📷</button><button type="button" class="ghost m-ico" aria-label="Tell me what you ate">🎙️</button><button type="button" class="ghost m-ico" aria-label="Ate out">🍴</button></div>`;
const foodRow = (k) => ({
  breakfast: `<div class="m-row"><span class="m-ic">🍽</span><div><div class="m-t">Breakfast is next</div><div class="m-s">Eggs & toast · 422 kcal</div></div>${acts4}</div>`,
  lunchHot: `<div class="m-row m-hot"><span class="m-ic">🍽</span><div><div class="m-t">Lunch is next</div><div class="m-s">Ground beef & rice · 598 kcal · breakfast ✓</div></div>${acts4}</div>`,
  unexpected: `<div class="m-row m-hot"><span class="m-ic">🍽</span><div><div class="m-t">Lunch logged ✓</div><div class="m-s">Burrito bowl & chips · ~1,050 kcal</div></div>
    <div class="m-ctx">Plans change. You have <b>~850 kcal</b> and <b>~55 g protein</b> left today.</div>
    <div class="m-acts"><button type="button" class="grow">Adjust the rest of today</button><button type="button" class="ghost">What fits?</button></div></div>`,
  dinner: `<div class="m-row"><span class="m-ic">🍽</span><div><div class="m-t">Dinner is next</div><div class="m-s">Cod, rice & veggies · 691 kcal · 2 of 3 logged</div></div>${acts4}</div>`,
  evening: `<div class="m-row m-hot"><span class="m-ic">🍽</span><div><div class="m-t">3 meals logged</div><div class="m-s">1,610 kcal · 151 g protein · ~80 kcal left</div></div>
    <div class="m-acts"><button type="button" class="grow">✓ Done logging today</button><button type="button" class="ghost">＋ Add</button></div></div>`,
}[k]);
const workoutRow = (state, hot) => ({
  planned: `<div class="m-row${hot ? ' m-hot' : ''}"><span class="m-ic">🏋️</span><div><div class="m-t">Lower body today</div><div class="m-s">5 exercises · 15 sets · ~50 min</div></div><div class="m-acts keep"><button type="button" class="grow${hot ? '' : ' ghost'}">Start workout</button><button type="button" class="ghost">View</button></div></div>`,
  active: `<div class="m-row m-hot"><span class="m-ic">🏋️</span><div><div class="m-t">Lower body · in progress</div><div class="m-s">3 of 5 exercises · 9 of 15 sets · 28 min</div></div><div class="m-prog"><span class="hl-bar"><i style="width:60%"></i></span></div><div class="m-acts"><button type="button" class="grow">▶ Resume Lower body</button></div></div>`,
  done: `<div class="m-row"><span class="m-ic">✅</span><div><div class="m-t">Lower body · done</div><div class="m-s">52 min · 15 sets · RDL up to 185 lb</div></div><div class="m-acts"><button type="button" class="ghost grow">View summary</button></div></div>`,
  doneMini: `<div class="m-row"><span class="m-ic">✅</span><div class="m-mini"><span><span class="m-t">Lower body</span> <span class="m-done">done</span></span><a class="m-go small">Summary ›</a></div></div>`,
}[state]);

const whoop = (ctx, strain = '4.2') => `<div class="m-sec">WHOOP</div>
  <section class="card" style="padding:10px"><div class="m-strip"><div class="m-tile ${ctx === 'low' ? 'm-rec' : 'm-green'}"><b>${ctx === 'low' ? '41%' : '72%'}</b><span>Recovery</span></div><div class="m-tile"><b>${ctx === 'low' ? '5:48' : '7:12'}</b><span>Sleep</span></div><div class="m-tile"><b>${strain}</b><span>Strain so far</span></div></div>
  ${ctx === 'low' ? `<p class="small" style="margin:10px 2px 6px">Recovery is lower than usual today. Lower body is planned — you can keep it or make it lighter.</p><div class="m-acts" style="margin:0"><button type="button" class="ghost grow">Keep workout</button><button type="button" class="ghost grow">Make it lighter</button></div><p class="tiny muted" style="margin:6px 2px 0">Lighter = one set fewer per exercise. Your choice; WHOOP's score isn't a safety verdict.</p>`
    : ctx === 'ok' ? `<p class="small" style="margin:10px 2px 0">Recovery is in your usual range. Lower body is planned — no change suggested.</p>`
    : ''}</section>`;
const plan = (kcal, p, extra = '') => `<div class="m-sec">Nutrition & plan</div>
  <section class="card hl-card" style="gap:6px"><div class="row between"><span class="small">Calories</span><span class="small"><b>${kcal.toLocaleString()}</b> / 1,690 kcal</span></div><span class="hl-bar"><i style="width:${Math.min(100, Math.round((kcal / 1690) * 100))}%"></i></span>
  <div class="row between"><span class="small">Protein</span><span class="small"><b>${p}</b> / 168 g</span></div><span class="hl-bar"><i style="width:${Math.round((p / 168) * 100)}%"></i></span>
  ${extra}<a class="hl-plan" style="justify-content:space-between"><span class="small">Cut · week 3 of 8 · check-in Sunday</span><b class="small">Plan ›</b></a></section>`;
const tail = `<div class="m-sec">More</div>
  <section class="card" style="padding:0"><a class="m-line"><span>⚖️ Weight trend <span class="m-s">· −0.4 lb/week</span></span>${spark}</a><a class="m-line"><span>⌚ Devices <span class="m-s">· WHOOP synced 7:40</span></span><span class="m-go">›</span></a></section>
  <p class="tiny muted center">🔒 Your Diet and Fitness are private unless you share them.</p>`;

const mealSheet = (open = false) => `<div class="m-sheet-h"><h2>Breakfast</h2><span class="m-s">planned · 422 kcal</span></div>
  <div class="m-tot"><span><b>422</b> kcal</span><span class="m-p"><b>41</b>P</span><span class="m-c"><b>33</b>C</span><span class="m-f"><b>13</b>F</span><span class="m-s">· 1,268 left today</span></div>
  ${[['Whole eggs', '2 eggs', 100], ['Egg whites', '¾ cup', 195], ['Sourdough bread', '1¼ slices', 63], ['Avocado', 'a sliver', 10]].map(([n, h, g], i, a) => `<div class="m-food"${i === a.length - 1 ? ' style="border-bottom:1px solid var(--line)"' : ''}><span>${n}<br><span class="m-s">${h}</span></span><span class="m-step"><button type="button" aria-label="Less">−</button><input value="${g}" aria-label="${n} grams"><button type="button" aria-label="More">＋</button></span></div>`).join('')}
  <div class="m-primary"><button type="button">✓ Log as planned</button><div class="two m-three"><button type="button" class="ghost">📷 Photo</button><button type="button" class="ghost">🎙️ Tell me</button><button type="button" class="ghost">🍴 Ate out</button></div></div>
  <details class="m-more"${open ? ' open' : ''}><summary>More ${open ? '⌃' : '⌄'}</summary>
    <div class="m-grid"><button type="button" class="ghost">🔁 Same as yesterday<small>Thu's breakfast</small></button><button type="button" class="ghost">✏️ Quick macros<small>Just P, C, F</small></button>
    <button type="button" class="ghost">📦 Packaged<small>Type or snap the label</small></button><button type="button" class="ghost">🍷 Drinks<small>Wine, beer, cocktails</small></button>
    <button type="button" class="ghost">↔ Swap or add food<small>From your lists</small></button><button type="button" class="ghost">⭐ Save as combo<small>Reuse it later</small></button>
    <button type="button" class="ghost">🥑 Low-carb today<small>Rest-day carbs</small></button><button type="button" class="ghost">🔒 Same every day<small>Lock this meal</small></button></div></details>`;
const sec = (t) => `<div class="m-label">${t}</div>`;
const option = (name, sub, btn = 'Use') => `<div class="m-optc"><b>${name}</b><span class="m-s">${sub}</span><button type="button" class="ghost">${btn}</button></div>`;

export const SCREENS = [
  // ── A14 scenarios ─────────────────────────────────────────────
  { id: 'A1-morning', title: 'Morning — weight not logged, breakfast next, workout planned', likely: 'Type the weight and tap Save.',
    view: `${head()}${today('log today\'s weight', [weightRow(false, true), foodRow('breakfast'), workoutRow('planned')])}${whoop('ok')}${plan(0, 0)}${tail}` },
  { id: 'A2-mealtime', title: 'Meal time — next meal emphasised', likely: '✓ As planned on lunch (or 📷 / 🎙️ if it was different).',
    view: `${head()}${today('lunch', [weightRow(true), foodRow('lunchHot'), workoutRow('planned')])}${whoop(null, '6.1')}${plan(422, 41)}${tail}` },
  { id: 'A3-unexpected', title: 'After an unexpected lunch — calm, adapts the day', likely: 'Adjust the rest of today.',
    view: `${head()}${today('adjust the rest of today', [weightRow(true), foodRow('unexpected'), workoutRow('planned')])}${whoop(null, '6.8')}${plan(1472, 86)}${tail}` },
  { id: 'A3b-adjust', title: 'Adjust the rest of today — targets unchanged, dinner re-fitted', likely: 'Use the first dinner option.',
    sheet: `<div class="m-sheet-h"><h2>The rest of today</h2></div>
    <p class="small" style="margin:0 0 6px">Your targets stay the same. Here's dinner re-fitted to what's left: <b>~850 kcal · ~55 g protein</b>.</p>
    ${sec('Dinner options')}<div class="m-opt3">${option('Planned dinner, lighter rice', 'Cod, ½ cup rice, veggies · 560 kcal · 48 g P', 'Use')}${option('Planned dinner as is', 'Cod, rice & veggies · 691 kcal · 52 g P', 'Use')}${option('Salmon & greens (saved)', '520 kcal · 45 g P', 'Use')}</div>
    <p class="tiny muted">Built from your planned meals and saved foods, on your phone. Nothing is changed until you pick one.</p>
    <div class="m-primary"><button type="button" class="ghost">Keep dinner as planned</button></div>` },
  { id: 'A3c-whatfits', title: 'What fits? — next meal from what\'s left', likely: 'Tap the top option to log or plan it.',
    sheet: `<div class="m-sheet-h"><h2>What fits?</h2><span class="m-s">for dinner</span></div>
    <div class="m-note"><b>~850 kcal</b> left · <b>~55 g protein</b> left</div>
    <div class="m-opt3">${option('Salmon, rice & veggies', '510 kcal · 45 g P · a dinner you saved', 'Plan')}${option('Chicken salad + Greek yogurt', '460 kcal · 52 g P · from My foods', 'Plan')}${option('Protein shake + lighter dinner', '640 kcal · 58 g P', 'Plan')}</div>
    <div class="m-chipline"><span class="chip on">Dinner</span><span class="chip">Snack</span><span class="chip">Quick (no cooking)</span></div>
    <p class="tiny muted" style="margin-top:8px">Ranked on your phone from planned meals, saved and recent foods. No AI needed.</p>` },
  { id: 'A4-active', title: 'Active workout — Resume emphasised, other anchors stay', likely: '▶ Resume Lower body.',
    view: `${head()}${today('resume Lower body', [weightRow(true), foodRow('lunchHot').replace(' m-hot', '').replace('<span class="m-nexttag">now</span>', ''), workoutRow('active')])}${whoop(null, '9.6')}${plan(422, 41)}${tail}` },
  { id: 'A4b-train', title: 'Training — last time shown, current sets, optional rest timer', likely: 'Tick the next set ✓.',
    view: `<p style="margin:4px"><a class="linkish small">‹ Health</a></p><h1 class="hl-h" style="margin:4px">Lower body</h1><p class="m-s" style="margin:0 4px 6px">2 of 3 exercises · 5 of 9 sets · 24 min</p><span class="hl-bar"><i style="width:55%"></i></span>
    <div class="m-ex"><div class="m-ex-h"><b>Romanian deadlift ✓</b><span class="m-done small">3 of 3</span></div></div>
    <div class="m-ex"><div class="m-ex-h"><b>Bulgarian split squat</b><button type="button" class="ghost small" style="min-height:40px;padding:6px 12px">✓ All sets</button></div>
      <div class="m-last">Plan 3 × 8 @ 40 · Last time <b>40 × 8, 40 × 8, 40 × 7</b></div>
      <div class="m-set done"><span class="m-s">Set 1</span><span>8 reps</span><span>40 lb</span><button type="button" class="ck" aria-label="Logged">✓</button></div>
      <div class="m-set done"><span class="m-s">Set 2</span><span>8 reps</span><span>40 lb</span><button type="button" class="ck" aria-label="Logged">✓</button></div>
      <div class="m-timer"><span>Rest 1:12</span><span class="small"><button type="button" class="linkish small">+30 s</button> · <button type="button" class="linkish small">Skip</button></span></div>
      <div class="m-set"><span class="m-s">Set 3</span><input value="8" aria-label="reps"><input value="40" aria-label="lb"><button type="button" class="ck off" aria-label="Log set">✓</button></div></div>
    <div class="m-ex"><div class="m-ex-h"><b>Leg curl</b><button type="button" class="ghost small" style="min-height:40px;padding:6px 12px">✓ All sets</button></div><div class="m-last">Plan 3 × 10 @ 90 · Last time <b>85 × 10 ×3</b></div></div>
    <div class="m-foot"><button type="button" class="ghost">✓ Log remaining sets as planned</button><button type="button">Complete workout</button></div>` },
  { id: 'A5-complete', title: 'Workout complete — kept for the day, dinner next', likely: '✓ As planned on dinner.',
    view: `${head()}${today('dinner', [weightRow(true), foodRow('dinner'), workoutRow('done')])}${whoop(null, '13.1')}${plan(1020, 99)}${tail}` },
  { id: 'A5b-summary', title: 'Workout summary — short, with an optional progression nudge', likely: 'Done (or Accept the suggestion).',
    sheet: `<div class="m-sheet-h"><h2>✅ Lower body</h2><span class="m-s">Fri · 7:42 AM</span></div>
    <div class="m-stats"><div><b>52 min</b><span>time</span></div><div><b>9 sets</b><span>3 exercises</span></div><div><b>8,960 lb</b><span>volume</span></div></div>
    <div class="m-note">You did all planned sets of Romanian deadlift at 185 lb. <b>Try 190 lb next time?</b><div class="m-acts" style="margin-top:8px"><button type="button" class="grow">Accept</button><button type="button" class="ghost grow">Keep 185</button></div></div>
    <div class="m-label">From WHOOP <span class="m-tag">PHASE B</span></div>
    <div class="m-stats"><div><b>11.8</b><span>strain</span></div><div><b>412</b><span>kcal</span></div><div><b>128 / 164</b><span>avg / max HR</span></div></div>
    <p class="tiny muted">Matched to WHOOP's "Weightlifting" 6:50–7:42 · <button type="button" class="linkish tiny">not this one?</button></p>
    <div class="m-primary"><button type="button">Done</button></div>` },
  { id: 'A6-whoop', title: 'WHOOP connected — context under the anchors (lower recovery)', likely: 'Start workout (Keep or Make it lighter is optional).',
    view: `${head()}${today('lunch', [weightRow(true), foodRow('lunchHot'), workoutRow('planned')])}${whoop('low', '3.4')}${plan(422, 41)}${tail}` },
  { id: 'A7-evening', title: 'Evening — quiet status, no guilt', likely: '✓ Done logging today.',
    view: `${head('Friday evening')}${today('', [weightRow(true), foodRow('evening'), workoutRow('doneMini')])}${plan(1610, 151, '<p class="small" style="margin:4px 0">4 complete days this week — enough for a useful Sunday review.</p>')}${tail}` },
  { id: 'A8-week', title: 'Weekly check-in — trend, completeness, training, approve-first', likely: 'Keep current plan (or Approve the suggested change).',
    view: `<p style="margin:4px"><a class="linkish small">‹ Health</a></p><h1 class="hl-h" style="margin:4px">Your week</h1><p class="m-s" style="margin:0 4px 8px">Oct 24 – 30 · week 3 of 8 of your cut</p>
    <section class="card" style="padding:4px 14px">
      <div class="m-wk"><span>Weight trend</span><b>180.1 → 179.4 lb</b><span class="m-s">−0.7 lb · your plan aims for −0.9/week</span></div>
      <div class="m-wk"><span>Nutrition</span><b>5 complete days</b><span class="m-s">2 days partly logged (not used for the averages)</span></div>
      <div class="m-wk"><span>Average intake</span><b>1,705 kcal · 158 g P</b><span class="m-s">target 1,690 kcal · 168 g P</span></div>
      <div class="m-wk"><span>Training</span><b>3 strength workouts</b><span class="m-s">Recovery averaged 64% (WHOOP)</span></div>
    </section>
    <section class="card"><b>Suggestion</b><p class="small" style="margin:6px 0">Your trend is a little slower than planned. A small change would bring it closer: <b>−100 kcal/day</b> (carbs).</p>
      <div class="m-acts" style="margin:0"><button type="button" class="grow">Approve −100 kcal</button><button type="button" class="ghost grow">Keep current plan</button></div>
      <p class="tiny muted" style="margin:8px 0 0">Nothing changes unless you approve. Trend confidence: good (5 complete days, 6 weigh-ins).</p></section>` },
  // ── Supporting sheets ──────────────────────────────────────────
  { id: 'M1-meal-sheet', title: 'Meal sheet — Log as planned, then Photo · Tell me · Ate out, then More', likely: '✓ Log as planned.', sheet: mealSheet(false) },
  { id: 'M2-meal-more', title: 'Meal sheet — More opened', likely: 'Same as yesterday.', sheet: mealSheet(true) },
  { id: 'M3-tell-me', title: '🎙️ Tell me — keyboard dictation or typing, editable preview', likely: 'Log 640 kcal (after a glance at the items).',
    sheet: `<div class="m-sheet-h"><h2>🎙️ Tell me</h2><span class="m-s">Breakfast</span></div>
    <textarea class="m-tell" aria-label="What did you eat?">Two eggs, two slices of sourdough, half an avocado and coffee</textarea>
    <p class="tiny muted" style="margin:4px 2px 8px">Type, or tap the 🎤 on your keyboard to speak. OurPawmily only gets the text.</p>
    <div class="m-est"><b>2 eggs</b><span>143 kcal</span><small>13P · 1C · 10F</small></div>
    <div class="m-est"><b>2 slices sourdough</b><span>~230 kcal</span><small>8P · 44C · 2F</small></div>
    <div class="m-est"><b>½ avocado</b><span>~120 kcal</span><small>1P · 6C · 11F</small></div>
    <div class="m-est" style="border-bottom:1px solid var(--line)"><b>Coffee, black</b><span>~5 kcal</span><small>add milk?</small></div>
    <div class="m-tot" style="margin-top:10px"><span><b>~498</b> kcal</span><span class="m-p"><b>22</b>P</span><span class="m-c"><b>51</b>C</span><span class="m-f"><b>23</b>F</span></div>
    <div class="m-primary"><button type="button">✓ Log ~498 kcal</button><button type="button" class="ghost">Edit items</button></div>` },
  { id: 'M4-quick-macros', title: 'Quick macros (under More)', likely: 'Log.', sheet: `<div class="m-sheet-h"><h2>✏️ Quick macros</h2><span class="m-s">Breakfast</span></div>
    <p class="m-s" style="margin:0 0 6px">Type a number or tap ± (5 g steps).</p>
    ${[['Protein', 35, 'm-p'], ['Carbs', 40, 'm-c'], ['Fat', 12, 'm-f']].map(([l, v, c]) => `<div class="m-macro"><label class="${c}">${l}</label><span class="m-step"><button type="button">−</button><input value="${v}" inputmode="decimal" aria-label="${l} grams"><button type="button">＋</button><span class="m-s">g</span></span></div>`).join('')}
    <div class="m-note">≈ <b>408 kcal</b> from these · <button type="button" class="linkish tiny">type calories instead</button></div>
    <input placeholder="Name (optional) — e.g. Protein oats" style="width:100%;min-height:44px">
    <div class="m-primary"><button type="button">Log 408 kcal</button></div>` },
  { id: 'M5-photo-plate', title: '📷 Photo estimate — restaurant plate (photo not kept)', likely: '✓ Log it.', sheet: `<div class="m-sheet-h"><h2>📷 Estimate</h2><span class="m-s">Dinner · ate out</span></div>
    <div class="m-photo">your photo (not kept)</div>
    <div class="m-note">Rough estimate — adjust anything that looks off. Restaurant food usually has more oil than it looks.</div>
    <div class="m-est"><b>Grilled salmon</b><span>~6 oz · 360 kcal</span><small>40P · 0C · 22F</small></div>
    <div class="m-est"><b>Rice pilaf</b><span>~1 cup · 240 kcal</span><small>5P · 45C · 5F</small></div>
    <div class="m-est" style="border-bottom:1px solid var(--line)"><b>Asparagus with butter</b><span>~8 spears · 90 kcal</span><small>3P · 6C · 7F</small></div>
    ${sec('Portion')}<div class="seg"><button type="button">Light</button><button type="button" class="on">Regular</button><button type="button">Large</button></div>
    ${sec('How much you ate')}<div class="seg"><button type="button" class="on">All</button><button type="button">Most</button><button type="button">Half</button></div>
    <div class="m-tot" style="margin-top:12px"><span><b>690</b> kcal</span><span class="m-p"><b>48</b>P</span><span class="m-c"><b>51</b>C</span><span class="m-f"><b>34</b>F</span></div>
    <div class="m-primary"><button type="button">✓ Log it</button><div class="two"><button type="button" class="ghost">Retake</button><button type="button" class="ghost">🍷 Add drinks</button></div></div>` },
  { id: 'M6-photo-label', title: '📷 Photo — packaged label', likely: '✓ Log 420 kcal.', sheet: `<div class="m-sheet-h"><h2>📦 From the label</h2><span class="m-s">Lunch</span></div>
    <div class="m-note">Read from the nutrition label · <b>per serving (1 bowl, 283 g)</b></div>
    <div class="m-tot"><span><b>420</b> kcal</span><span class="m-p"><b>30</b>P</span><span class="m-c"><b>45</b>C</span><span class="m-f"><b>14</b>F</span></div>
    <input value="Chicken burrito bowl" style="width:100%;min-height:44px" aria-label="Name">
    ${sec('Servings')}<div class="seg"><button type="button">½</button><button type="button" class="on">1</button><button type="button">1½</button><button type="button">2</button></div>
    <label style="display:flex;gap:10px;align-items:center;margin:12px 0;min-height:44px"><input type="checkbox" checked style="width:22px;height:22px;flex:none"><span>Save to My foods for next time</span></label>
    <div class="m-primary"><button type="button">✓ Log 420 kcal</button><button type="button" class="ghost">Edit the numbers</button></div>` },
  { id: 'M7-ate-out', title: '🍴 Ate out', likely: '📷 Snap the dish.', sheet: `<div class="m-sheet-h"><h2>🍴 Ate out</h2><span class="m-s">Dinner</span></div>
    <input placeholder="Where? (optional)" style="width:100%;min-height:44px">
    <div class="m-primary"><button type="button">📷 Snap the dish</button></div>
    ${sec('Or pick what\'s closest')}
    <div class="chips"><span class="chip on">Grilled protein & veggies</span><span class="chip">Protein, rice & veggies</span><span class="chip">Steak dinner</span><span class="chip">Pasta</span><span class="chip">Burger & fries</span><span class="chip">Pizza (3 slices)</span><span class="chip">Burrito bowl</span><span class="chip">Sushi</span><span class="chip">More…</span></div>
    ${sec('Portion')}<div class="seg"><button type="button">Light</button><button type="button" class="on">Regular</button><button type="button">Large</button></div>
    ${sec('How much you ate')}<div class="seg"><button type="button" class="on">All</button><button type="button">Most</button><button type="button">Half</button></div>
    <div class="m-tot" style="margin-top:12px"><span><b>650</b> kcal</span><span class="m-p"><b>50</b>P</span><span class="m-c"><b>30</b>C</span><span class="m-f"><b>35</b>F</span></div>
    <div class="m-primary"><button type="button">✓ Log it</button><div class="two"><button type="button" class="ghost">Menu lists calories</button><button type="button" class="ghost">🍷 Add drinks</button></div></div>` },
  { id: 'M8-drinks', title: '🍷 Drinks — simple counters, custom drink, alcohol apart from P/C/F', likely: '＋ on Red wine, then Add.', sheet: `<div class="m-sheet-h"><h2>🍷 Drinks</h2></div>
    <div class="seg"><button type="button" class="on">With dinner</button><button type="button">On their own</button></div>
    ${[['🍷', 'Red wine', 2, '125 kcal a glass'], ['🥂', 'White wine', 0, '120 kcal'], ['🍺', 'Beer', 0, '155 kcal · 12 oz'], ['🍸', 'Cocktail', 1, 'Margarita · 270 kcal ▾']].map(([i, n, q, s2]) => `<div class="m-drink"><span class="m-ic">${i}</span><span><b>${n}</b><br><span class="m-s">${s2}</span></span><span class="m-step"><button type="button" aria-label="One less">−</button><input value="${q}" aria-label="${n} count" style="width:44px"><button type="button" aria-label="One more">＋</button></span></div>`).join('')}
    ${sec('Wine pour')}<div class="seg"><button type="button" class="on">5 oz</button><button type="button">6 oz</button><button type="button">9 oz</button></div>
    <button type="button" class="linkish small" style="min-height:44px">＋ Something else (name + calories)</button>
    <div class="m-note"><b>520 kcal</b> · <span class="m-a">alcohol ~392 kcal</span> · carbs 32 g · counted apart from protein, carbs and fat</div>
    <div class="m-primary"><button type="button">Add 3 drinks</button></div>` },
  { id: 'W1-build', title: 'Build — plan vs log made explicit', likely: '▶ Start now.', view: `<p style="margin:4px"><a class="linkish small">‹ Fitness</a></p><h1 class="hl-h" style="margin:4px">Build a workout</h1>
    <div class="m-banner">This becomes <b>Today's Workout</b>. Start it now and tick sets as you go — or, if you've already done it, <b>Log as done</b>.</div>
    <input value="Lower body" style="width:100%;min-height:44px" aria-label="Name">
    ${[['Romanian deadlift', 185], ['Bulgarian split squat', 40], ['Leg curl', 90]].map(([n, w]) => `<div class="m-ex"><div class="m-ex-h"><b>${n}</b><span class="m-s">3 sets · 8 reps · ${w} lb</span></div></div>`).join('')}
    <div class="chips"><span class="chip">＋ Exercise</span><span class="chip">＋ Superset</span><span class="chip">＋ Circuit</span></div>
    <div class="m-foot"><button type="button">▶ Start now</button><div class="two"><button type="button" class="ghost">Save for later today</button><button type="button" class="ghost">✓ Log as done</button></div></div>` },
  { id: 'W2-confirm', title: 'Log remaining sets as planned — confirm', likely: '✓ Log 4 sets as planned.', view: `<p style="margin:4px"><a class="linkish small">‹ Health</a></p><h1 class="hl-h" style="margin:4px">Lower body</h1>`,
    sheet: `<h2 style="margin:0 0 6px;font-size:1.15rem">Log the 4 remaining sets as planned?</h2>
    <p class="small">They'll be recorded as <b>done with the planned reps and weights</b>:</p>
    <ul class="small" style="margin:6px 0 10px;padding-left:18px"><li>Bulgarian split squat — 1 set × 8 @ 40 lb</li><li>Leg curl — 3 sets × 10 @ 90 lb</li></ul>
    <p class="tiny muted">Did something differently? Cancel and change that set first. You can undo this.</p>
    <div class="m-primary"><button type="button">✓ Log 4 sets as planned</button><button type="button" class="ghost">Cancel</button></div>` },
  { id: 'W3-undo', title: 'After confirming — all ticked, Undo offered', likely: 'Complete workout.', view: `<p style="margin:4px"><a class="linkish small">‹ Health</a></p><h1 class="hl-h" style="margin:4px">Lower body</h1><p class="m-s" style="margin:0 4px 6px">3 of 3 exercises · 9 of 9 sets · 31 min</p><span class="hl-bar"><i style="width:100%"></i></span>
    <div class="m-ex"><div class="m-ex-h"><b>Romanian deadlift ✓</b><span class="m-done small">3 of 3</span></div></div>
    <div class="m-ex"><div class="m-ex-h"><b>Bulgarian split squat ✓</b><span class="m-done small">3 of 3 · 1 as planned</span></div></div>
    <div class="m-ex"><div class="m-ex-h"><b>Leg curl ✓</b><span class="m-done small">3 of 3 · as planned</span></div></div>
    <div class="m-foot"><button type="button">Complete workout</button></div>`, toast: '<span>4 sets logged as planned</span><b>Undo</b>' },
  { id: 'F1-fitness', title: 'Fitness — where Weekly Balance lives', likely: '＋ Add workout (or open Weekly balance).', view: `<p style="margin:4px"><a class="linkish small">‹ Health</a></p><h1 class="hl-h" style="margin:4px">🏋️ Fitness</h1>
    <section class="card" style="padding:0">${workoutRow('done')}</section>
    <section class="card" style="padding:0"><a class="m-line"><span>📊 <b>Weekly balance</b><br><span class="m-s">Which muscles got the most work this week</span></span><span class="m-go">›</span></a><a class="m-line"><span>⭐ My workouts <span class="m-s">· 4 saved</span></span><span class="m-go">›</span></a><a class="m-line"><span>📋 Lifting program</span><span class="m-go">›</span></a></section>
    <button type="button" class="wide">＋ Add workout</button><div class="m-sec">History</div><p class="small muted" style="margin:4px">Wed · Upper body · 48 min · strain 10.2</p>` },
  { id: 'F2-balance-quiz', title: 'Weekly Balance — focus asked only on first visit here', likely: 'Show my week.', view: `<p style="margin:4px"><a class="linkish small">‹ Fitness</a></p><h1 class="hl-h" style="margin:4px">📊 Weekly balance</h1>
    <p class="small" style="margin:4px 4px 10px">One question so the ranges fit you. You can change it any time.</p>
    ${sec('What would you like to focus on?')}
    <div class="m-opt"><label>🧍 Full body — even work everywhere</label><label class="on">💪 Upper body — chest, back, shoulders, arms</label><label>🦵 Lower body — quads, hamstrings, glutes, calves</label><label>🎯 Pick muscles</label></div>
    ${sec('Strength days a week')}<div class="seg"><button type="button">2</button><button type="button" class="on">3</button><button type="button">4</button><button type="button">5+</button></div>
    ${sec('Lifting experience')}<div class="seg"><button type="button">New</button><button type="button" class="on">Some</button><button type="button">Lots</button></div>
    <button type="button" class="wide" style="min-height:48px">Show my week</button><button type="button" class="linkish small wide">Not now</button>` },
  { id: 'F3-balance', title: 'Weekly Balance — descriptive, catch-up optional', likely: 'Read it; nothing required.', view: `<p style="margin:4px"><a class="linkish small">‹ Fitness</a></p><h1 class="hl-h" style="margin:4px">📊 Weekly balance</h1>
    <p class="m-s" style="margin:0 4px 8px">Mon–Sun · day 5 of 7 · focus: upper body · <button type="button" class="linkish tiny">change</button></p>
    <section class="card"><div class="m-s" style="margin-bottom:4px">Finished hard sets this week · shaded = typical range for you</div>
    ${[['Chest', 9, 8, 16], ['Back', 12, 8, 16], ['Shoulders', 7, 8, 16], ['Biceps', 6, 6, 12], ['Triceps', 7.5, 6, 12], ['Quads', 6, 4, 10], ['Hamstrings', 3, 4, 10], ['Glutes', 5.5, 4, 10], ['Calves', 0, 4, 10]].map(([m, v, lo, hi]) => `<div class="m-mus"><span>${m}</span><span class="m-track"><span class="m-band" style="left:${(lo / 20) * 100}%;width:${((hi - lo) / 20) * 100}%"></span><span class="m-fill${v < lo ? ' low' : ''}" style="width:${Math.max(2, (v / 20) * 100)}%"></span></span><span>${v}</span></div>`).join('')}
    </section>
    <section class="card"><b>This week so far</b><p class="small" style="margin:6px 0">Back and chest have had the most work. Hamstrings, calves and shoulders have had less work this week.</p>
    <button type="button" class="ghost wide">Build an optional catch-up workout</button><p class="tiny muted" style="margin:8px 0 0">Counts finished sets: the main muscle counts 1, helpers ½. Ranges come from research on weekly sets for muscle growth — a guide, not a rule.</p></section>` },
  { id: 'R1-reconnect', title: 'Phase B — WHOOP connected before recovery & sleep were allowed', likely: '✓ As planned on lunch (Reconnect is secondary).', view: `${head()}${today('lunch', [weightRow(true), foodRow('lunchHot'), workoutRow('planned')])}
    <div class="m-sec">WHOOP</div><section class="card" style="padding:0"><a class="m-line"><span class="small">Reconnect WHOOP once to see <b>recovery and sleep</b> here.</span><span class="m-go">Reconnect ›</span></a></section>${plan(422, 41)}${tail}` },
];

// 📺 Watch (2.0): the Watch card on 💞 Us and the full Watchlist — loading, episode dates, the cards,
// details and their actions. Loaded the first time Us or Watch needs it, so it isn't in the app's
// start-up script. The shared state (`watch`) and the helpers it uses come from app.js once (init).
let $, LS, act, api, bingo, bingoNew, can, closeSheet, demoBanner, discuss, esc, fam, isoLocal, later, lock, lockedHere, me, member, openData, openSheet, renderUs, shortDay, show, state, toast, tvMap, tvMapKey, unlock, us, watch, who, wide;
export function init(c) { ({ $, LS, act, api, bingo, bingoNew, can, closeSheet, demoBanner, discuss, esc, fam, isoLocal, later, lock, lockedHere, me, member, openData, openSheet, renderUs, shortDay, show, state, toast, tvMap, tvMapKey, unlock, us, watch, who, wide } = c); }

// 📺 The Watch card: "2 watching · 3 want to watch", the shows that matter tonight, one action each.
export function renderUsWatch() {
  const el = $('#usWatch');
  if (!el || !watch.S) return;
  const p = watch.S.usPreview(watch.shows);
  const line = (x) => {
    const life = watch.S.lifecycle(x);
    const what = x.ep?.newCount ? `🆕 ${x.ep.newCount} new episode${x.ep.newCount === 1 ? '' : 's'}` : life === 'watching' ? (pgText(x.progress) ? `Watching · ${pgText(x.progress)}` : 'Watching') : watch.S.isUpNext(x) ? '⭐ Up Next' : 'Want to Watch';
    return `<div class="uw-row"><button type="button" class="uw-main" data-watchopen="${x.id}" aria-label="${esc(x.title)}: details"><b>${esc(x.title)}</b><small class="muted">${svcBadge(x.service)} ${esc(what)}</small></button>${watchPrimary(x, true)}</div>`;
  };
  el.innerHTML = `<div class="row between"><h2 class="card-h" id="usWatchH">📺 Watch</h2>${p.watching || p.want ? `<span class="small muted">${p.watching} watching · ${p.want} want to watch</span>` : ''}</div>
    ${p.items.length ? `<div class="uw-list">${p.items.map(line).join('')}</div>` : '<p class="small muted">What are you two watching? Add it, and what you want to watch next.</p>'}
    <div class="row uw-foot"><button type="button" class="grow" data-view="watch">Open Watchlist →</button><button type="button" class="ghost" data-act="watchadd" aria-label="Add a show or movie">＋ Add</button></div>`;
}
// Bringing over the trackers' "Feeling like" plans, answers and notes (once per family, each
export async function loadWatch() {
  watch.S ||= await import('../js/showsCore.js');
  const w = await api.get(`/families/${state.fid}/watch`);
  const bodies = await Promise.all(w.shows.map(async (x) => ({ ...x, ...((await unlock(x.body)) || {}) })));
  const people = fam().members.filter((m) => m.kind === 'person');
  const records = people.map((m) => ({
    person: m.id,
    shows: bodies.filter((x) => x.by === m.id).map((x) => ({ id: x.id, title: x.title || '🔒 Locked', service: x.service || 'other', kind: x.kind || 'show', date: x.date || isoLocal(new Date(x.at)), at: x.at, locked: !x.title })),
    nights: w.nights.filter((n) => n.by === m.id),
    status: Object.fromEntries(Object.entries(w.status).filter(([, v]) => v.by === m.id)),
    ratings: Object.fromEntries(Object.entries(w.ratings).filter(([, r]) => r[m.id]).map(([k, r]) => [k, r[m.id]])),
  }));
  // Shows added by someone who's since left: still on the list.
  const orphans = bodies.filter((x) => !people.some((m) => m.id === x.by));
  if (orphans.length) records.push({ person: 'gone', shows: orphans.map((x) => ({ id: x.id, title: x.title || '🔒 Locked', service: x.service || 'other', kind: x.kind || 'show', date: x.date || isoLocal(new Date(x.at)), at: x.at })), nights: [], status: {}, ratings: {} });
  watch.data = w;
  const before = new Map((watch.shows || []).map((x) => [x.id, x]));
  watch.shows = watch.S.mergeShows(records).map((x) => ({ ...x, progress: w.progress[x.id] || null, aud: w.shows.find((y) => y.id === x.id)?.aud || 'family' }));
  // Episode dates already looked up stay, worked out again against the new progress.
  for (const x of watch.shows) { const b = before.get(x.id); if (b?.tv && watch.tvm) { x.tv = b.tv; x.ep = watch.tvm.episodeStatus(x.tv, x.progress, isoLocal()); } }
}
async function tvInfo(id) {
  let c = null; try { c = JSON.parse(LS.get(`fam.tv.${id}`) || 'null'); } catch { /* none */ }
  if (c && Date.now() - c.at < 6 * 3600e3) return c.show;
  const r = await api.get(`/tv/${id}`).catch(() => null);
  if (r?.show) { try { LS.set(`fam.tv.${id}`, JSON.stringify({ at: Date.now(), show: r.show })); } catch { /* full */ } return r.show; }
  return c?.show || null;
}
export async function loadTv() {
  watch.tvm ||= await import('../server/tv.js');
  const { episodeStatus } = watch.tvm;
  const map = tvMap();
  const list = watch.shows.filter((x) => x.kind !== 'movie' && !x.locked && ['watching', 'want'].includes(watch.S.lifecycle(x))).slice(0, 15);
  const one = async (x) => {
    if (map[x.id] === undefined) {
      if (watch.tvOff) return;
      // Episode dates not set up on this connector (501): stop asking for this visit.
      const r = await api.get(`/tv/search?q=${encodeURIComponent(x.title)}`).catch((e) => { if (e.status === 501) watch.tvOff = true; return null; });
      if (!r) return;
      map[x.id] = r.results[0]?.id || 0;
    }
    if (!map[x.id]) return;
    x.tv = await tvInfo(map[x.id]);
    x.ep = episodeStatus(x.tv, x.progress, isoLocal());
  };
  // The first on its own: if episode dates aren't set up, nothing else is asked.
  if (list.length) await one(list[0]);
  await Promise.all(list.slice(1).map(one));
  try { LS.set(tvMapKey(), JSON.stringify(map)); } catch { /* full */ }
  watch.tvAt = Date.now();
}
// "🆕 3 new · E9–11 · next Wed, Nov 4 (E12)"
function epLine(x) {
  const e = x.ep;
  if (!e) return '';
  const bits = [];
  if (x.status === 'upnext' && e.latest) bits.push(`📺 Season ${e.season} is out`);
  else if (e.newCount) bits.push(`<b class="ep-new">🆕 ${e.newCount} new${e.from ? ` · E${e.from}${e.to !== e.from ? `–${e.to}` : ''}` : ''}</b>`);
  else if (e.newSeason) bits.push(`<b class="ep-new">🆕 Season ${e.newSeason} is out</b>`);
  else if (x.status === 'watching' && e.latest) bits.push('✓ Caught up');
  if (e.nextDrop) bits.push(`next ${shortDay(e.nextDrop)}${e.nextBatch.length ? ` (E${e.nextBatch[0]}${e.nextBatch.length > 1 ? `–${e.nextBatch[e.nextBatch.length - 1]}` : ''})` : ''}`);
  else if (e.ended) bits.push('ended');
  return bits.length ? `<div class="ep-line small">${bits.join(' · ')} <button type="button" class="linkish tiny" data-tvfix="${x.id}" aria-label="Not this show?">ⓘ</button></div>` : '';
}
export async function tvFixSheet(id) {
  const x = watch.shows.find((y) => y.id === id);
  if (!x) return;
  const r = await api.get(`/tv/search?q=${encodeURIComponent(x.title)}`);
  openSheet(`<h2>Which show is “${esc(x.title)}”?</h2><p class="small muted">For new-episode dates (from TMDB).</p>
    ${r.results.map((s) => `<button type="button" class="fpick" data-tvpick="${id}:${s.id}"><span class="fp-i">${s.poster ? `<img src="${esc(s.poster)}" alt="">` : '📺'}</span><span class="grow"><b>${esc(s.name)}</b><small class="muted">${esc(s.year || '')}</small></span>${tvMap()[id] === s.id ? '✓' : ''}</button>`).join('') || '<p class="small muted">No match on TMDB.</p>'}
    <button type="button" class="linkish small" data-tvpick="${id}:0">It isn't on TMDB — stop looking</button>`);
}
export async function watchView() {
  $('#view').innerHTML = `${demoBanner()}<div class="skeleton card"></div>`;
  importWatch().catch(() => {});
  await act(loadWatch);
  if (state.view !== 'watch') return;
  renderWatch();
  loadTv().then(() => { if (state.view === 'watch') renderWatch(); }).catch(() => {});
}
const svcBadge = (k) => { const v = watch.S.SERVICES[k] || watch.S.SERVICES.other; return `<span class="svc" style="background:${v.bg};color:${v.fg}">${esc(v.name)}</span>`; };
const monthLabel = (ym, month = 'long') => new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month, year: 'numeric' });
// One show: what it is, where you're up to, and one obvious next step. Everything else (episode,
const pgText = (pg) => (pg?.e ? `S${pg.s || 1} · E${pg.e}` : '');
function watchPrimary(x, short = false) {
  const S = watch.S, life = S.lifecycle(x);
  if (life === 'watched') return short || x.ratings[fam().me] ? '' : `<button type="button" class="ghost small" data-watchopen="${x.id}">☆ Rate it</button>`;
  if (life === 'dropped') return '';
  if (x.kind === 'movie') return `<button type="button" class="small" data-watchone="${x.id}" aria-label="We watched ${esc(x.title)}">✓ ${short ? 'Watched' : 'We watched it'}</button>`;
  const tonight = x.nights.some((n) => n.date === isoLocal());
  const label = `Watched ${tonight ? 'another' : 'an'} episode`;
  return `<button type="button" class="small" data-watchone="${x.id}" aria-label="${label} of ${esc(x.title)}">＋ ${short ? 'Episode' : label}</button>`;
}
function watchCard(x) {
  const S = watch.S, life = S.lifecycle(x);
  const bits = [life === 'watching' ? (pgText(x.progress) ? `Watching · ${pgText(x.progress)}` : 'Watching') : life === 'want' ? (S.isUpNext(x) ? '⭐ Up Next' : 'Want to Watch') : life === 'watched' ? `Watched${x.statusDate ? ` · ${shortDay(x.statusDate)}` : ''}` : 'Dropped'];
  if (x.rating && life === 'watched') bits.push(`${x.rating}★`);
  return `<div class="show-card ${life}">
    <button type="button" class="show-main" data-watchopen="${x.id}" aria-label="${esc(x.title)}: details"><span class="show-top">${svcBadge(x.service)}${x.kind === 'movie' ? '<span class="small muted">🍿 Movie</span>' : ''}</span>
      <span class="show-title">${esc(x.title)}</span><span class="small muted">${esc(bits.join(' · '))}</span>${epLine(x)}</button>
    <div class="show-do">${watchPrimary(x)}<button type="button" class="icon-btn" data-watchopen="${x.id}" aria-label="More for ${esc(x.title)}">•••</button></div>
  </div>`;
}
export function watchDetail(id) {
  const S = watch.S, x = watch.shows.find((y) => y.id === id);
  if (!x) return closeSheet();
  const my = fam().me, life = S.lifecycle(x), mine = x.ratings[my] || 0;
  const theirs = Object.entries(x.ratings).filter(([p]) => p !== my);
  const states = [['want', 'Want to Watch'], ['watching', 'Watching'], ['finished', 'Watched']];
  const lifeKey = { want: 'want', watching: 'watching', watched: 'finished' }[life];
  const can = x.by === my || me().role === 'owner';
  openSheet(`<div class="row between"><h2>${esc(x.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small">${svcBadge(x.service)} ${x.kind === 'movie' ? '🍿 Movie' : '📺 Show'} · ${x.aud === 'family' ? '👨‍👩‍👧 the family sees it' : '🔒 just you two'}</p>
    ${life === 'dropped' ? '<p class="small muted">✋ You dropped this one. Pick a state below to bring it back.</p>' : ''}
    <div class="seg" role="group" aria-label="Where it is">${states.map(([k, l]) => `<button type="button" class="${lifeKey === k ? 'on' : ''}" data-watchlife="${x.id}:${k}" aria-pressed="${lifeKey === k}">${l}</button>`).join('')}</div>
    ${life === 'want' ? `<button type="button" class="ghost wide" data-watchlife="${x.id}:${S.isUpNext(x) ? 'want' : 'upnext'}">${S.isUpNext(x) ? '☆ Not Up Next' : '⭐ Make it Up Next'}</button>` : ''}
    ${watchPrimary(x) ? `<div class="row">${watchPrimary(x)}</div>` : ''}
    ${x.kind !== 'movie' ? `<div class="grp">Where you're up to</div><div class="row pg-row"><button type="button" class="icon-btn" data-watchpgstep="${x.id}:-1" aria-label="One episode back">−</button><span class="pill">${pgText(x.progress) || 'Not started'}</span><button type="button" class="icon-btn" data-watchpgstep="${x.id}:1" aria-label="One episode on">＋</button><button type="button" class="linkish small" data-watchpg="${x.id}">Set season &amp; episode…</button></div>${epLine(x)}` : ''}
    <div class="grp">Your rating</div><div class="show-rate">${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star ${n <= mine ? 'on' : ''}" data-watchrate="${x.id}:${n}" aria-label="Rate ${n} of 5" aria-pressed="${n <= mine}">★</button>`).join('')}
      ${theirs.map(([p, r]) => `<span class="small muted">· ${esc(member(p)?.name || '')} <span class="stars" aria-label="${r} of 5">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span></span>`).join('')}</div>
    <div class="grp">History</div><p class="small muted">${x.nights.length ? `${x.nights.length} night${x.nights.length === 1 ? '' : 's'} together · last ${shortDay(x.nights[x.nights.length - 1].date)}` : 'Not watched together yet'}${x.statusDate && life === 'watched' ? ` · finished ${shortDay(x.statusDate)}` : ''}</p>
    <div class="stack tight">
      <button type="button" class="ghost wide" data-discuss="w:${x.id}" data-dtitle="${esc(`🍿 ${x.title}`)}">💬 Discuss</button>
      ${x.locked ? '' : `<button type="button" class="ghost wide" data-watchbingo="${x.id}">🎲 Bingo for it</button>`}
    </div>
    <details class="more"><summary class="small">More</summary><div class="stack tight">
      <button type="button" class="linkish small" data-watchaud="${x.id}:${x.aud === 'family' ? 'us' : 'family'}">${x.aud === 'family' ? '🔒 Make it just us' : '👨‍👩‍👧 Share with the family'}</button>
      ${life !== 'dropped' ? `<button type="button" class="linkish small" data-watchlife="${x.id}:dropped">✋ Drop it (stopped watching)</button>` : ''}
      ${can ? `<button type="button" class="linkish small danger" data-watchdel="${x.id}">Delete it and its history</button>` : ''}
    </div></details>`);
}
// The full Watchlist: Watching · Want to Watch · Watched (history, month by month and the recap).
export function renderWatch() {
  const S = watch.S, shows = watch.shows, ym = isoLocal().slice(0, 7), year = ym.slice(0, 4);
  const L = S.watchlist(shows);
  if (!['watching', 'want', 'watched'].includes(watch.tab)) watch.tab = L.watching.length || !L.want.length ? 'watching' : 'want';
  const tabs = [['watching', `Watching${L.watching.length ? ` ${L.watching.length}` : ''}`], ['want', `Want to Watch${L.want.length ? ` ${L.want.length}` : ''}`], ['watched', 'Watched']];
  let body = '';
  if (watch.tab === 'watching') {
    body = L.watching.length ? L.watching.sort((a, b) => (b.ep?.newCount || 0) - (a.ep?.newCount || 0) || S.lastActive(b).localeCompare(S.lastActive(a))).map(watchCard).join('')
      : `<div class="card center"><p class="small">Nothing on the go.${L.want.length ? ' Pick something from Want to Watch — logging the first episode moves it here.' : ''}</p></div>`;
  } else if (watch.tab === 'want') {
    const next = L.want.filter(S.isUpNext), rest = L.want.filter((x) => !S.isUpNext(x));
    body = L.want.length ? `${next.length ? `<h3 class="wl-h">⭐ Up Next</h3>${next.map(watchCard).join('')}` : ''}${rest.length ? `${next.length ? '<h3 class="wl-h">Later</h3>' : ''}${rest.map(watchCard).join('')}` : ''}`
      : '<div class="card center"><p class="small">Nothing saved for later. Add a show or movie you want to watch together.</p></div>';
  } else {
    const months = [...new Set(shows.flatMap(S.showMonths))].sort().reverse();
    const r = S.yearRecap(shows, year);
    body = `${L.watched.length ? L.watched.sort((a, b) => S.lastActive(b).localeCompare(S.lastActive(a))).slice(0, 20).map(watchCard).join('') : '<div class="card center"><p class="small">Nothing finished yet.</p></div>'}
      ${months.length ? `<details class="card"><summary><b>📅 Month by month</b></summary>${months.map((mo) => {
        const list = S.monthShows(shows, mo), n = list.reduce((a, x) => a + x.monthNights, 0);
        return `<div class="month-shows"><b class="small">${monthLabel(mo)}</b> <span class="small muted">${list.length} title${list.length === 1 ? '' : 's'} · ${n} night${n === 1 ? '' : 's'}</span><ul class="list month-list">${list.map((x) => `<li class="row between">${svcBadge(x.service)}<span class="grow">${esc(x.title)}${x.status === 'finished' && (x.statusDate || '').startsWith(mo) ? ' 🎉' : ''}</span><span class="small muted">${x.kind === 'movie' ? '🍿' : `${x.monthNights}×`}${x.rating ? ` · ${x.rating}★` : ''}</span></li>`).join('')}</ul></div>`;
      }).join('')}</details>` : ''}
      ${r.titles ? `<details class="card recap"><summary><b>🏆 ${year} together</b></summary>
        <div class="recap-stats"><div><b>${r.nights}</b><small>nights</small></div><div><b>${r.shows}</b><small>shows</small></div><div><b>${r.movies}</b><small>movies</small></div><div><b>${r.finished}</b><small>finished</small></div></div>
        ${r.mostWatched ? `<p>🏆 Most watched: <b>${esc(r.mostWatched.title)}</b> (${r.mostWatched.nights.filter((n) => n.date.startsWith(year)).length} nights)</p>` : ''}
        ${r.topRated ? `<p>⭐ Our favourite: <b>${esc(r.topRated.title)}</b> (${r.topRated.rating}★)</p>` : ''}
        ${r.topService ? `<p>Most of it on ${svcBadge(r.topService)}</p>` : ''}</details>` : ''}
      ${L.dropped.length ? `<details class="card"><summary class="small">✋ Dropped · ${L.dropped.length}</summary>${L.dropped.map(watchCard).join('')}</details>` : ''}`;
  }
  $('#view').innerHTML = `${demoBanner()}
    <section class="watch-head"><h2><button type="button" class="linkish" data-view="us" aria-label="Back to Us">‹</button> 📺 Watchlist</h2><button type="button" class="small" data-act="watchadd">＋ Add</button></section>
    <div class="seg" role="tablist">${tabs.map(([k, l]) => `<button type="button" role="tab" aria-selected="${watch.tab === k}" class="${watch.tab === k ? 'on' : ''}" data-watchtab="${k}">${l}</button>`).join('')}</div>
    <div class="watchlist">${body}</div>
    <button type="button" class="linkish small" data-act="games">🎲 Bingo &amp; 💑 couples picks ›</button>`;
}
export function watchAddSheet() {
  const S = watch.S, a = watch.adding;
  openSheet(`<h2>Add to Watch</h2>
    <form id="watchForm" class="stack">
      <div class="seg">${[['show', '📺 Show'], ['movie', '🍿 Movie']].map(([k, l]) => `<label class="segopt"><input type="radio" name="kind" value="${k}" ${a.kind === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <label>Title<input name="title" maxlength="80" required placeholder="e.g. The Bear" autocomplete="off"></label>
      <div class="seg">${[['want', 'Want to Watch'], ['watching', 'Watching'], ['finished', 'Watched']].map(([k, l]) => `<label class="segopt"><input type="radio" name="status" value="${k}" ${(a.status || 'want') === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <fieldset class="svc-pick"><legend class="small">Where</legend>${Object.entries(S.SERVICES).map(([k, v]) => `<label class="svc-opt-l"><input type="radio" name="service" value="${k}" ${a.service === k ? 'checked' : ''}><span class="svc-opt" style="--svc:${v.bg}">${esc(v.name)}</span></label>`).join('')}</fieldset>
      <label class="check"><input type="checkbox" name="family"><span>👨‍👩‍👧 Share with the family (otherwise it's just you two)</span></label>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Add</button></div>
    </form>`);
}
// "＋ Watched an episode" / "✓ We watched it": one PATCH — the next episode, tonight, and Want to
// Watch → Watching (a movie → Watched). Asks before calling a show finished, and only when sure.
export async function watchOne(id) {
  const S = watch.S, x = watch.shows.find((y) => y.id === id);
  if (!x) return;
  const today = isoLocal(), ch = S.watchedOne(x, today, x.tv);
  await api.patch(`/families/${state.fid}/watch/shows/${id}`, { ...(ch.status ? { status: ch.status, date: today } : {}), ...(ch.progress ? { progress: ch.progress } : {}), ...(ch.night ? { night: today } : {}) });
  await watchSaved();
  if (x.kind === 'movie') return toast(`🍿 ${x.title} — watched. Rate it in its details.`);
  toast(`✓ ${x.title} · S${ch.progress.s} E${ch.progress.e}${ch.status === 'watching' ? ' — now in Watching' : ''}`);
  if (S.isFinale(ch.progress, x.tv) && confirm(`That was the last episode of ${x.title}. Mark it Watched?`)) {
    await api.patch(`/families/${state.fid}/watch/shows/${id}`, { status: 'finished', date: today });
    await watchSaved(); toast('🎉 Watched — it goes in your history');
  }
}
export const watchSaved = async () => { await loadWatch(); if (state.view === 'watch') renderWatch(); else if (state.view === 'us') renderUs(); if ($('#sheet').open && $('#sheetBody [data-watchlife]')) watchDetail($('#sheetBody [data-watchlife]').dataset.watchlife.split(':')[0]); };
// Bingo for this show: its live game, or a new game from its card set, or a new card set.
export async function watchBingo(title) {
  const r = await api.get(`/families/${state.fid}/bingo`);
  const same = (t) => t.trim().toLowerCase() === title.trim().toLowerCase();
  const live = r.games.find((g) => g.status === 'live' && same(g.title));
  if (live) { bingo.game = live.id; state.view = 'bingo'; return show('bingo'); }
  const pack = r.packs.find((p) => same(p.title));
  if (pack) { const g = await api.post(`/families/${state.fid}/bingo/games`, { packId: pack.id }); bingo.game = g.game.id; return show('bingo'); }
  return bingoNew({ title });
}
async function importWatch() {
  const flag = `fam.watchImported.${state.fid}`;
  if (LS.get(flag) || lockedHere()) return;
  const data = await openData(await api.get(`/families/${state.fid}/members/${fam().me}/data`).catch(() => null));
  if (!data || data.locked) return;
  const shows = await Promise.all((data.shows || []).filter((x) => x?.id && x.title).map(async (x) => ({ id: x.id, at: x.at, body: await lock({ title: x.title, service: x.service || 'other', kind: x.kind === 'movie' ? 'movie' : 'show', date: x.date || '' }) })));
  if (shows.length || (data.showNights || []).length || Object.keys(data.showStatus || {}).length || Object.keys(data.showRatings || {}).length) {
    const r = await api.post(`/families/${state.fid}/watch/import`, { shows, nights: data.showNights || [], status: data.showStatus || {}, ratings: data.showRatings || {} });
    if (r.imported) await watchSaved();
  }
  LS.set(flag, '1');
}

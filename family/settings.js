// ⚙️ Me, Family, a member's page, notifications, admin and encryption settings — loaded the first
// time one of them opens, so they aren't in the app's start-up script. The helpers they use come
// from app.js once (init).
let $, AREAS, LS, MODULES, act, ageOf, ago, api, avatar, demoBanner, e2eeCard, encryptFamily, esc, fam, fk, hue, iosBrowser, isSealed, isoLocal, loadFamily, loadSupport, me, member, moviePrefs, mv, newKey, openData, openSheet, photoBox, pushOk, relLabel, seal, sealBytes, sealData, sharingHtml, show, state, swReady, theirParts, tryOpen;
export function init(c) { ({ $, AREAS, LS, MODULES, act, ageOf, ago, api, avatar, demoBanner, e2eeCard, encryptFamily, esc, fam, fk, hue, iosBrowser, isSealed, isoLocal, loadFamily, loadSupport, me, member, moviePrefs, mv, newKey, openData, openSheet, photoBox, pushOk, relLabel, seal, sealBytes, sealData, sharingHtml, show, state, swReady, theirParts, tryOpen } = c); }

export function familyView() {
  const f = fam();
  const people = f.members.filter((m) => m.kind === 'person'), pets = f.members.filter((m) => m.kind === 'pet');
  const row = (m) => `<li><button type="button" class="member-row" data-member="${m.id}">${avatar(m, 44)}<span><b>${esc(m.name)}</b><small class="muted">${esc(relLabel(m))}${m.role === 'owner' && m.relation !== 'self' ? ' · Creator' : m.role === 'owner' && m.id === f.me ? ' · Creator' : ''}</small></span>
    ${m.status === 'invited' ? '<span class="pill">Invited</span>' : m.status === 'managed' && m.kind === 'person' ? '<span class="pill soft">No account</span>' : ''}<span class="go">›</span></button></li>`;
  $('#view').innerHTML = `${demoBanner()}
    <section class="card fam-head"><div class="fam-name">${esc(f.name)}</div><div class="small muted">${people.length} ${people.length === 1 ? 'person' : 'people'} · ${pets.length} pet${pets.length === 1 ? '' : 's'}</div></section>
    <h3>People</h3><ul class="card list">${people.map(row).join('')}</ul>
    <button type="button" class="ghost wide" data-act="addperson">＋ Add a person</button>
    <h3>Pets</h3>${pets.length ? `<ul class="card list">${pets.map(row).join('')}</ul>` : ''}
    <button type="button" class="ghost wide" data-act="addpet">＋ Add a pet</button>
    <h3>Connected families</h3>
    <section class="card"><b>What friends' families can see</b>
      <p class="small muted">Posts you share with connected families, and your family's members. Kids are private unless you choose otherwise; a post that tags someone private stays in the family.</p>
      <ul class="list toggles">
        <li><label class="switch-row"><span>🧸 Kids <small class="muted">· names, photos and posts about them</small></span><input type="checkbox" data-sharewhat="kids" ${f.share?.kids ? 'checked' : ''} ${me().role === 'owner' ? '' : 'disabled'}><i class="switch"></i></label></li>
        <li><label class="switch-row"><span>🐾 Pets <small class="muted">· names and posts about them</small></span><input type="checkbox" data-sharewhat="pets" ${f.share?.pets !== false ? 'checked' : ''} ${me().role === 'owner' ? '' : 'disabled'}><i class="switch"></i></label></li>
      </ul>${me().role === 'owner' ? '' : '<p class="tiny muted">The family\'s creator chooses this.</p>'}</section>
    ${state.connected.length ? `<ul class="card list">${state.connected.map((c) => `<li><div class="member-row static"><span class="stack-av">${c.members.slice(0, 3).map((m) => avatar(m, 30)).join('')}</span><span><b>${esc(c.name)}</b><small class="muted">${c.members.length} member${c.members.length === 1 ? '' : 's'} · sees posts you share with connected families</small></span></div></li>`).join('')}</ul>`
      : '<p class="small muted pad">Close friends can have their own family here too. Invite them and your families can share updates — only the posts you choose.</p>'}
    <button type="button" class="ghost wide" data-act="invitefamily">💌 Invite a friend's family</button>`;
}

export async function memberView() {
  const m = member(state.memberId);
  if (!m) return show('family');
  const self = m.id === fam().me;
  const theirPosts = state.feed.filter((p) => p.fid === state.fid && p.by === m.id && (p.photo || p.photoId));
  $('#view').innerHTML = `<button type="button" class="linkish back" data-view="family">‹ Family</button>
    <section class="card profile">${avatar(m, 84)}<h2>${esc(m.name)}</h2>
      <div class="muted">${esc(relLabel(m))}${m.kind === 'pet' && m.breed ? ` · ${esc(m.breed)}` : ''}${m.kind === 'pet' && m.born ? ` · ${ageOf(m.born)}` : ''}</div>
      ${m.status === 'invited' ? `<p class="small">💌 Invited (${esc(m.email)}) <button type="button" class="linkish" data-act="reinvite" data-id="${m.id}">Send the invite again</button></p>` : ''}
      ${m.status === 'managed' && m.kind === 'person' ? `<p class="small muted">No account yet. <button type="button" class="linkish" data-act="reinvite" data-id="${m.id}">Invite by email</button> — or keep managing them here (kids).</p>` : ''}
    </section>
    ${!self && m.kind === 'person' && m.role !== 'owner' && me().role === 'owner' ? `<section class="card areas-card"><b>🔑 What ${esc(m.name)} can use</b>
      <ul class="list toggles">${Object.entries(AREAS).map(([k, l]) => `<li><label class="switch-row"><span>${l}</span><input type="checkbox" data-access="${k}:${m.id}" ${(m.access || Object.keys(AREAS)).includes(k) ? 'checked' : ''}><i class="switch"></i></label></li>`).join('')}</ul>
      <p class="tiny muted">You choose these as the family's creator. ${esc(m.name)}'s 💪 Health is theirs to share, and 💞 Us is just for a couple.</p></section>` : ''}
    <section class="card" id="memberData"><div class="skeleton line"></div></section>
    ${theirPosts.length ? `<h3>Posts</h3><div class="grid">${theirPosts.map((p) => (p.photoId ? photoBox(p, 'grid') : `<img src="${p.photo}" alt="" loading="lazy">`)).join('')}</div>` : ''}
    ${!self && m.role !== 'owner' && (me().role === 'owner' || m.status !== 'active') ? `<button type="button" class="danger linkish small pad" data-act="removemember" data-id="${m.id}">Remove ${esc(m.name)} from ${esc(fam().name)}</button>` : ''}`;
  const el = $('#memberData');
  try {
    // Someone else's: only the Diet / Fitness they share with you (your own and a pet's: the whole copy).
    let data, savedAt;
    if (self || m.kind === 'pet') { const rec = await api.get(`/families/${state.fid}/members/${m.id}/data`); data = await openData(rec); savedAt = rec.savedAt; }
    else { const r = await theirParts(m.id, ['diet', 'fitness']); if (!r) throw Object.assign(new Error('private'), { data: { locked: true } }); ({ data, savedAt } = r); }
    el.innerHTML = data.locked ? '<div class="locked">🔒 <b>Locked on this device</b><p class="small muted">This device needs the family key to show it.</p></div>'
      : m.kind === 'pet' ? petDetails(m, data) : healthCard(m, data, savedAt, self);
  } catch (err) {
    el.innerHTML = err.data?.locked ? `<div class="locked">🔒 <b>Diet & fitness is private</b><p class="small muted">${esc(m.name)} can share it with you from their Me tab.</p></div>` : `<p class="small muted">${esc(err.message)}</p>`;
  }
}

export function healthCard(m, data, savedAt, self) {
  const weights = (data.weights || []).slice().sort((a, b) => a.date.localeCompare(b.date));
  if (!weights.length && !Object.keys(data.mealLog || {}).length) {
    return `<b>Diet & fitness</b><p class="small muted">${self ? 'Nothing here yet — bring over the current app from the Me tab.' : 'Nothing shared yet.'}</p>`;
  }
  const last = weights.at(-1);
  const since = isoLocal(new Date(Date.now() - 30 * 864e5));
  const recent = weights.filter((w) => w.date >= since);
  const change = recent.length > 1 ? recent.at(-1).weight - recent[0].weight : 0;
  const days7 = [...Array(7)].map((_, i) => isoLocal(new Date(Date.now() - i * 864e5)));
  const logged = days7.filter((d) => Object.keys(data.mealLog?.[d]?.meals || {}).length || data.eaten?.date === d).length;
  const W = 300, H = 60;
  const pts = recent.length > 1 ? recent : weights.slice(-10);
  const lo = Math.min(...pts.map((p) => p.weight)), hi = Math.max(...pts.map((p) => p.weight)), span = Math.max(hi - lo, 1);
  const path = pts.map((p, i) => `${i ? 'L' : 'M'}${(4 + (i / Math.max(pts.length - 1, 1)) * (W - 8)).toFixed(1)},${(4 + (1 - (p.weight - lo) / span) * (H - 8)).toFixed(1)}`).join('');
  return `<div class="row between"><b>Diet & fitness</b><small class="muted">${savedAt ? `updated ${ago(savedAt)}` : ''}</small></div>
    <div class="stats3"><div><b>${last ? last.weight.toFixed(1) : '—'}</b><span>lb now</span></div><div><b class="${change <= 0 ? 'good' : ''}">${recent.length > 1 ? `${change <= 0 ? '−' : '+'}${Math.abs(change).toFixed(1)}` : '—'}</b><span>30 days</span></div><div><b>${logged}/7</b><span>days logged</span></div></div>
    ${pts.length > 1 ? `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="Weight trend"><path d="${path}"/></svg>` : ''}
    <a class="small" href="../">Open the full tracker ›</a>`;
}

export function petDetails(m, data) {
  const d = data.profile || {};
  const row = (k, v) => (v ? `<li><span class="muted">${k}</span><span>${v}</span></li>` : '');
  const vax = (d.vaccines || []).map((v) => `${esc(v.name)}${v.due ? ` · due ${esc(v.due)}` : ''}`).join('<br>');
  const food = d.food ? esc([d.food.brand, d.food.amount, d.food.times ? `${d.food.times}× a day` : ''].filter(Boolean).join(' · ') || '') : '';
  const body = [row('Breed', esc(m.breed || d.breed)), row('Born', esc(m.born || d.birthday)), row('Weight', d.weightLb ? `${esc(d.weightLb)} lb` : ''), row('Food', food), row('Vaccines', vax), row('Vet', esc(d.vet?.name || d.vet || '')), row('Microchip', esc(d.microchip))].join('');
  return `<b>About ${esc(m.name)}</b>${body ? `<ul class="kv">${body}</ul><a class="small" href="../#dogs">✎ Edit in 🥗 Trackers › Dogs</a>` : '<p class="small muted">Add food, meds, vaccines and the vet in <a href="../#dogs">🥗 Trackers › Dogs</a> — they show up here.</p>'}
    <button type="button" class="linkish small" data-act="editpet" data-id="${m.id}">✎ Edit photo, name, breed, birthday</button>`;
}

export function meView() {
  if (state.support == null) loadSupport().then(() => { if (state.view === 'me') meView(); });
  const f = fam(), my = me();
  const others = f.members.filter((m) => m.kind === 'person' && m.id !== my.id && m.status === 'active');
  const hasLegacy = Object.keys(localStorage).some((k) => k.startsWith('lp.p.'));
  $('#view').innerHTML = `${demoBanner()}
    <section class="card profile">${avatar({ ...my, avatar: my.avatar || state.user.picture }, 72)}<h2>${esc(my.name)}</h2><div class="muted small">${esc(state.user.email)} · ${api.mode() === 'demo' ? 'Demo account' : 'Google account'}</div></section>
    <h3 class="row between"><span>👨‍👩‍👧 ${esc(f.name)}</span><button type="button" class="linkish small" data-view="family">Manage ›</button></h3>
    <section class="card"><ul class="list">${f.members.map((x) => `<li><button type="button" class="member-row" data-member="${x.id}">${avatar(x, 34)}<span><b>${esc(x.id === my.id ? 'You' : x.name)}</b><small class="muted">${esc(relLabel(x))}${x.status === 'invited' ? ' · invited' : ''}</small></span><span class="go">›</span></button></li>`).join('')}</ul>
      <div class="row wrap"><button type="button" class="ghost small" data-act="addperson">＋ Person</button><button type="button" class="ghost small" data-act="addpet">＋ Pet</button><button type="button" class="ghost small" data-view="family">💌 Invite a friend's family</button></div></section>
    ${(f.modules || []).includes('dogs') && f.members.some((m) => m.kind === 'pet') ? `<section class="card"><form id="petCallsForm" class="row"><label class="grow">What the pets call you<input name="petCalls" maxlength="20" placeholder="e.g. Dad, Mom, Auntie" value="${esc(my.petCalls || '')}"></label><button class="ghost">Save</button></form>
      <div class="chips">${['Dad', 'Mom'].map((x) => `<button type="button" class="chip" data-petcalls="${x}">${x}</button>`).join('')}</div>
      <p class="tiny muted">Used when the dogs thank you for a ⭐ golden day. Until you choose, they write to "Mom &amp; Dad".</p></section>` : ''}
    <h3>Privacy</h3>
    <section class="card" id="shareCard"><b>💪 Who can see my Health</b>${sharingHtml()}
      <p class="tiny muted">Pets, family threads and the calendar are seen by your whole family. Threads you share with connected families are also seen by them.</p></section>
    ${hasLegacy ? `<h3>Your data</h3><section class="card"><b>Bring over the current app</b><p class="small muted">Copies everything from the current app on this phone into ${esc(f.name)}: your meals, weigh-ins, training and dog duties, your partner's shared data, and your dogs. Nothing is removed from the current app, and you can run it again to refresh.</p>
      <div class="row wrap"><button type="button" data-act="import">Bring it over</button><button type="button" class="ghost" data-act="backup">Download a backup</button></div><div id="importLog" class="small"></div></section>` : ''}
    <h3>Families</h3>
    <section class="card"><ul class="list">${state.families.map((x) => `<li><button type="button" class="member-row" data-fam="${x.fid}"><span class="av" style="width:36px;height:36px;--h:${hue(x.fid)}">${esc(x.name[0])}</span><span><b>${esc(x.name)}</b><small class="muted">${x.members.length} members${x.myRole === 'owner' ? ' · you created it' : ''}</small></span>${x.fid === state.fid ? '<span class="pill">Open</span>' : '<span class="go">›</span>'}</button></li>`).join('')}</ul>
      <button type="button" class="linkish small" data-act="newfamily">＋ Create another family</button></section>
    ${my.role === 'owner' ? `<h3>Family settings</h3><section class="card stack">
      <form id="famSettings" class="stack"><label>Family name<input name="name" maxlength="40" value="${esc(f.name)}"></label>
        <fieldset class="modules"><legend>What ${esc(f.name)} manages</legend>${Object.entries(MODULES).filter(([k]) => k !== 'feed').map(([k, v]) => `<label class="check"><input type="checkbox" name="mod" value="${k}" ${(f.modules || []).includes(k) ? 'checked' : ''}><span>${v}</span></label>`).join('')}${(f.modules || []).includes('feed') ? '<input type="hidden" name="mod" value="feed">' : ''}</fieldset>
        <button class="ghost">Save</button></form>
      ${others.filter((o) => o.relation !== 'child').length ? `<button type="button" class="linkish small" data-act="handover">Hand ${esc(f.name)} over to someone else</button>` : ''}
      <button type="button" class="linkish small danger" data-act="deletefamily">Delete ${esc(f.name)}…</button></section>`
      : `<section class="card"><button type="button" class="linkish small danger" data-act="leavefamily">Leave ${esc(f.name)}</button></section>`}
    <h3>Help</h3>
    <section class="card stack"><button type="button" class="ghost" data-act="help">💬 Help &amp; questions</button>
      <p class="tiny muted">How families, invites, chores and the diet app work — and it can check your account, resend an invite, or pass a problem to the app's maintainer.</p></section>
    ${state.user.isAdmin ? '<h3>Maintainer</h3><section class="card"><button type="button" class="ghost wide" data-act="admin">🛠 Problems, glitches &amp; the nightly check</button></section>' : ''}
    <h3>🌗 Appearance</h3>
    <section class="card stack"><div class="seg theme-seg">${[['auto', '📱 Automatic'], ['light', '☀️ Light'], ['dark', '🌙 Dark']].map(([k, l]) => `<label class="segopt"><input type="radio" name="theme" value="${k}" ${(LS.get('pawmily.theme') || 'auto') === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <p class="tiny muted">Automatic follows your phone — on iPhone, Settings › Display &amp; Brightness › Automatic switches to dark at sunset. Applies to OurPawmily and your trackers on this device.</p></section>
    <h3>✨ Next up &amp; reminders</h3>
    <section class="card stack"><button type="button" class="ghost wide" data-act="nuknows">✨ Next up: what it knows, show or hide it</button><button type="button" class="ghost wide" data-act="habits">🔁 Run, ride and hot yoga reminders</button><button type="button" class="ghost wide" data-act="classpick">🧗 Fitness classes on my Home</button></section>
    <h3>🎬 Movies</h3>
    <section class="card stack" id="moviePrefs"><label class="switch-row"><span>🎬 Movie releases &amp; reviews<small class="muted">A card on 🏠 Home: what's in theaters with critic and audience scores, what's coming, where it's streaming, and 🔔 alerts for the ones you're waiting for. Just for you.</small></span><input type="checkbox" data-moviesonoff="1" ${mv.prefs?.on ? 'checked' : ''}><i class="switch"></i></label></section>
    <h3>🔔 Notifications</h3>
    <section class="card stack" id="notifyCard"><div class="skeleton line"></div></section>
    <h3>🔐 Encryption</h3>
    <section class="card stack" id="e2eeCard">${e2eeCard()}</section>
    <h3>Account & security</h3>
    <section class="card stack">
      <div id="sessions" class="small muted">Loading your sign-ins…</div>
      <button type="button" class="ghost" data-act="logoutall">Sign out on all devices</button>
      ${(state.user.blocked || []).length ? `<div><b class="small">Blocked</b><ul class="list">${state.user.blocked.map((b) => `<li class="row between small"><span>${esc(b.name)}</span><button type="button" class="linkish" data-unblock="${b.id}">Unblock</button></li>`).join('')}</ul></div>` : ''}
      <button type="button" class="ghost" data-act="export">⬇️ Download my data</button>
      <button type="button" class="ghost danger" data-act="deleteaccount">Delete my account…</button>
      ${state.support ? `<a class="small" href="mailto:${esc(state.support)}?subject=OurPawmily%20support">✉️ Email support</a>` : ''}
      <p class="tiny muted"><a href="privacy.html" target="_blank">Privacy Policy</a> · <a href="terms.html" target="_blank">Terms</a> · <a href="delete-account.html" target="_blank">How deletion works</a></p>
    </section>
    <section class="card links"><a href="../">🥗 Open your trackers (food, macros, training, calendar) ›</a><p class="tiny muted">Saved to this account, so they're the same on every device you sign in on. Only the people you turn sharing on for above can see them — never friends' families.</p></section>
    <button type="button" class="ghost wide" data-act="signout">Sign out</button>
    <p class="tiny muted center pad">OurPawmily Families · beta</p>`;
  if (fk()) api.get('/account/keybackup').then((r) => {
    const el = $('#backupState');
    if (el) el.innerHTML = r.backup ? `🔑 Recovery backup saved ${new Date(r.backup.at).toLocaleDateString()}. Made a new family or joined one since? Make a new phrase so it's included.` : '<span class="tone-warn">⚠️ No recovery phrase yet — if you lose all your devices, nobody can unlock your family. Tap 🔑 Recovery phrase.</span>';
  }).catch(() => {});
  renderNotify();
  moviePrefs().then((x) => { const c = $('[data-moviesonoff]'); if (c) c.checked = !!x.on; }).catch(() => {});
  api.get('/account/sessions').then((r) => {
    const el = $('#sessions');
    if (el) el.innerHTML = `<b>Signed in on</b><ul class="list">${r.sessions.slice().reverse().map((x) => `<li class="row between"><span>${esc(x.device || 'A device')}${x.current ? ' <span class="pill">This one</span>' : ''}</span><small>${ago(x.at)}</small></li>`).join('')}</ul>`;
  }).catch(() => {});
}

// ---------- the maintainer's desk (ADMIN_EMAILS only) ----------
export async function adminView() {
  openSheet('<h2>🛠 Maintainer</h2><p class="small muted">Loading…</p>');
  const [r, sc] = await Promise.all([act(() => api.get('/admin/overview')), api.get('/admin/scout').catch(() => null)]);
  if (!r) return;
  const runs = sc?.runs || [], wk = sc?.week;
  const scoutCard = sc ? `<section class="card stack"><b>💡 Date scout</b>
      <p class="small">${Object.entries(sc.keys).map(([k, on]) => `${on ? '✅' : '⚪️'} ${esc(k)}`).join(' · ')}</p>
      <p class="small muted">${esc(sc.model)} · ${runs.length} scout run${runs.length === 1 ? '' : 's'} this month · ${runs.reduce((n, x) => n + (x.searches || 0), 0)} searches · ${Math.round(runs.reduce((n, x) => n + (x.input || 0) + (x.output || 0), 0) / 1000)}k tokens</p>
      ${(() => { const days = Object.values(sc.searches || {}), g = days.reduce((n, d) => n + (d.gemini || 0), 0), c = days.reduce((n, d) => n + (d.claude || 0), 0); return g + c ? `<p class="small muted">🔎 Searches this month (scout, outings, news): ${g} Gemini (free) · ${c} Claude</p>` : ''; })()}
      ${wk ? `<p class="small">${wk.ideas.length} ideas for ${esc(wk.area?.label || '')} · ${ago(wk.at)}: ${['movie', 'event', 'food'].map((k) => `${wk.ideas.filter((x) => x.kind === k).length} ${k === 'food' ? 'places' : `${k}s`}`).join(', ')}</p>` : '<p class="small muted">Hasn\'t run yet — it runs Wednesday mornings.</p>'}
      ${wk?.problems?.length ? `<ul class="small danger">${wk.problems.map((x) => `<li>⚠️ ${esc(x)}</li>`).join('')}</ul>` : ''}
      <div class="row wrap"><button type="button" class="ghost" data-act="scoutrun">Run the scout now</button>${wk ? '<button type="button" class="ghost" data-act="linkcheck">🔗 Check links</button>' : ''}</div><div id="linkReport"></div></section>
    <section class="card stack"><b>📰 News</b>${sc.news ? `<p class="small muted">${ago(sc.news.at)} · ${sc.news.stories} stories · 🐶 ${esc(sc.news.rescue || 'no rescue news')}</p>${sc.news.problems?.length ? `<ul class="small danger">${sc.news.problems.map((x) => `<li>⚠️ ${esc(x)}</li>`).join('')}</ul>` : ''}` : '<p class="small muted">Hasn\'t run yet — editions at 6:45 AM and 3:45 PM.</p>'}
      <button type="button" class="ghost" data-act="newsrun">Make an edition now</button></section>` : '';
  const rep = r.report;
  const open = r.tickets.filter((t) => t.status === 'open');
  openSheet(`<div class="row between"><h2>🛠 Maintainer</h2><button type="button" class="linkish small" data-act="close">Done</button></div>
    <section class="card stack"><b>Nightly check</b>${rep ? `<p class="small muted">${ago(rep.at)} · ${rep.counts.families} families · ${rep.counts.accounts} accounts · ${rep.counts.people} people · ${rep.counts.pets} pets</p>
      ${rep.fixes.length ? `<ul class="small">${rep.fixes.map((x) => `<li>🔧 ${esc(x)}</li>`).join('')}</ul>` : '<p class="small">✅ Nothing needed fixing.</p>'}
      ${rep.problems.length ? `<ul class="small danger">${rep.problems.map((x) => `<li>⚠️ ${esc(x)}</li>`).join('')}</ul>` : ''}` : '<p class="small muted">Hasn\'t run yet — it runs every night.</p>'}
      <button type="button" class="ghost" data-act="runcheck">Run the check now</button></section>
    ${scoutCard}
    <section class="card stack"><b>Problems people filed · ${open.length} open</b>
      ${r.tickets.length ? r.tickets.map((t) => `<details class="ticket ${t.status}"><summary><span class="pill">${esc(t.category)}</span> ${esc(t.summary)} <small class="muted">${ago(t.at)}${t.status === 'done' ? ' · done' : ''}</small></summary>
        <p class="small">${esc(t.details) || '<i>No details</i>'}</p>
        <p class="tiny muted">${esc(t.from.name || '')} ${t.from.email ? `<a href="mailto:${esc(t.from.email)}?subject=${encodeURIComponent(`OurPawmily: ${t.summary}`)}">${esc(t.from.email)}</a>` : '(no email)'} · ${t.from.signedIn ? 'signed in' : 'not signed in'} · v${esc(t.app.version)} · ${esc(t.app.device)}${t.app.page ? ` · on ${esc(t.app.page)}` : ''}</p>
        ${t.transcript.length ? `<div class="chat mini">${t.transcript.map((m) => `<div class="bubble ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.text)}</div>`).join('')}</div>` : ''}
        <button type="button" class="ghost small" data-ticket="${t.id}" data-status="${t.status === 'open' ? 'done' : 'open'}">${t.status === 'open' ? '✓ Mark done' : 'Reopen'}</button></details>`).join('') : '<p class="small muted">None yet.</p>'}</section>
    <section class="card stack"><b>App glitches · last 7 days</b>
      ${r.glitches.length ? `<ul class="small">${r.glitches.map((g) => `<li><b>${g.n}×</b> ${esc(g.message)} <small class="muted">${esc(g.where)} · v${esc(g.version)} · ${ago(g.last)}</small></li>`).join('')}</ul>` : '<p class="small muted">✅ None reported.</p>'}</section>`);
}

export async function renderNotify() {
  const el = $('#notifyCard');
  if (!el) return;
  if (api.mode() === 'demo') { el.innerHTML = '<p class="small muted">Notifications work with your Google account on the live app.</p>'; return; }
  if (!pushOk()) {
    el.innerHTML = iosBrowser() ? '<p class="small">On iPhone, notifications need the app on your Home Screen: tap <b>Share › Add to Home Screen</b>, open OurPawmily from there, and turn them on here.</p>'
      : '<p class="small muted">This browser can\'t show notifications.</p>';
    return;
  }
  const [r, sub] = await Promise.all([api.get('/push').catch(() => null), swReady().then((reg) => reg.pushManager.getSubscription()).catch(() => null)]);
  if (!r || !$('#notifyCard')) return;
  const on = !!sub && r.devices.some((x) => x.endpoint === sub.endpoint);
  const others = r.devices.filter((x) => x.endpoint !== sub?.endpoint).length;
  el.innerHTML = `${Notification.permission === 'denied' ? '<p class="small tone-warn">Notifications are blocked for this app. Allow them in your phone\'s Settings (or the browser\'s site settings), then come back.</p>'
      : on ? '<p class="small">✅ <b>On for this device.</b></p><div class="row wrap"><button type="button" class="ghost small" data-act="pushtest">Send a test</button><button type="button" class="ghost small" data-act="pushoff">Turn off here</button></div>'
        : '<p class="small">Get a nudge when your partner sends a plan or a note, when someone books the dogs in or takes a drive, and reminders before appointments and events.</p><button type="button" data-act="pushon">🔔 Turn on for this device</button>'}
    ${others ? `<p class="tiny muted">Also on for ${others} other device${others === 1 ? '' : 's'}.</p>` : ''}
    <ul class="list toggles">${Object.entries(r.kinds).map(([k, v]) => `<li><label class="switch-row"><span>${esc(v)}</span><input type="checkbox" data-notifypref="${k}" ${r.prefs[k] ? 'checked' : ''}><i class="switch"></i></label></li>`).join('')}</ul>
    <p class="tiny muted">Notifications say who did what ("Pat left you a note"), never what an encrypted note, plan or event says — open the app to read it.</p>`;
}

export async function turnOnEncryption(log) {
  const fid = state.fid;
  log('🔑 Making your family key on this phone…');
  await encryptFamily(fid);
  await loadFamily();
  const k = fk();
  // Every post: its text, photo, comments and offers, locked. Posts shared with friends' families get their own key.
  let from = 0, n = 0;
  do {
    const r = await api.get(`/families/${fid}/posts?from=${from}`);
    for (const p of r.posts) {
      const body = {};
      let pkKey = k;
      if (p.audience === 'connections' && !p.pk) {
        pkKey = newKey();
        const conns = {};
        for (const [other, sc] of Object.entries(fam().connkeys || {})) { const ck = await tryOpen(k, sc, null); if (ck) conns[other] = await seal(ck, pkKey); }
        body.pk = { fam: await seal(k, pkKey), conns };
      }
      if (p.text && !isSealed(p.text)) body.text = await seal(pkKey, p.text);
      if (p.photo && !isSealed(p.photo)) body.photo = await seal(pkKey, p.photo);
      // 📸 Photo files sent before encryption was on: fetched, locked, sent back under the same id.
      if (p.photoId && !p.photoLocked) {
        for (const size of ['thumb', 'full']) {
          const plain = await api.bytes('GET', `/families/${fid}/photos/${p.photoId}?size=${size}`).catch(() => null);
          if (plain) await api.bytes('PUT', `/families/${fid}/photos/${p.photoId}?size=${size}`, await sealBytes(pkKey, plain));
        }
        body.photoLocked = true;
      }
      const cs = (p.comments || []).filter((c) => c.text && !isSealed(c.text));
      if (cs.length) body.comments = await Promise.all(cs.map(async (c) => ({ id: c.id, text: await seal(pkKey, c.text) })));
      const os = (p.help?.offers || []).filter((o) => o.msg && !isSealed(o.msg));
      if (os.length) body.offers = await Promise.all(os.map(async (o) => ({ id: o.id, msg: await seal(pkKey, o.msg) })));
      if (Object.keys(body).length && (body.text || body.photo || body.comments || body.offers || body.photoLocked)) { await api.patch(`/posts/${fid}/${p.id}`, body); n++; }
    }
    from = r.next;
    if (n) log(`📸 Locked ${n} post${n === 1 ? '' : 's'}…`);
  } while (from != null);
  // Diet & fitness and the dogs' details: yours, the pets', and anyone's you're holding until they join.
  let d = 0;
  for (const m of fam().members) {
    const rec = await api.get(`/families/${fid}/members/${m.id}/data`).catch(() => null);
    if (!rec?.data || rec.data.enc != null || !Object.keys(rec.data).length) continue;
    if (await api.put(`/families/${fid}/members/${m.id}/data`, { data: await sealData(rec.data) }).then(() => true, () => false)) d++;
  }
  log(`🥗 Locked ${d} set${d === 1 ? '' : 's'} of tracker and dog details`);
  const ap = await api.get(`/families/${fid}/appts`).catch(() => ({ appts: [] }));
  let a = 0;
  for (const x of ap.appts) {
    if ((!x.place || isSealed(x.place)) && (!x.notes || isSealed(x.notes))) continue;
    await api.patch(`/families/${fid}/appts/${x.id}`, { edit: { place: x.place ? await seal(k, x.place) : '', notes: x.notes ? await seal(k, x.notes) : '' } });
    a++;
  }
  if (a) log(`🐾 Locked ${a} appointment${a === 1 ? '' : 's'}`);
  log('✅ Done. Your family is end-to-end encrypted.');
}

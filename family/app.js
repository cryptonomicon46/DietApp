// 👨‍👩‍👧 OurPawmily Families (preview): sign in with Google, create a family, invite the people
// in it by email, add pets and kids, a private feed, and who-sees-what for diet & fitness.
// The trackers (food, training, dogs, calendar) stay in the current app for now; their data
// comes over with "Bring over the current app".
import { api } from './api.js';
import { planImport, legacySnapshot, backupBlob, runImport, importCare, verifyImport } from './migrate.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const LS = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* blocked */ } } };
const RELATION = { self: 'You', spouse: 'Spouse', partner: 'Partner', child: 'Child', parent: 'Parent', sibling: 'Sibling', grandparent: 'Grandparent', relative: 'Relative', friend: 'Close friend', other: 'Family', pet: 'Pet' };
const SPECIES = { dog: '🐶 Dog', cat: '🐱 Cat', other: '🐾 Other' };
const HUES = [152, 18, 210, 280, 340, 45, 190];
const MODULES = { dogs: '🐶 Dogs — feeding, walks, vet & meds', chores: '🧺 Chores — laundry, garbage, groceries, cleaning, with a monthly 🏆 Gold Card', feed: '📸 Family feed — photos and updates', health: '🥗 Diet & fitness — weight, meals, training', calendar: '📅 Family calendar' };
const CARE = { breakfast: ['🍳', 'Breakfast'], dinner: ['🍲', 'Dinner'], walk: ['🦮', 'Walk'], park: ['🌳', 'Dog park'], treat: ['🦴', 'Treat'], meds: ['💊', 'Meds'],
  poop: ['💩', 'Poop patrol'], trash: ['🗑️', 'Garbage'], laundry: ['🧺', 'Laundry'], groceries: ['🛒', 'Groceries'], cleaning: ['🧽', 'Cleaning'], dishes: ['🍽️', 'Dishes'] };
const DOG_KINDS = ['breakfast', 'dinner', 'walk', 'park', 'treat', 'meds'], HOUSE_KINDS = ['poop', 'trash', 'laundry', 'groceries', 'cleaning', 'dishes'];
const PTS = { breakfast: 1, dinner: 1, walk: 2, park: 2, treat: 0, meds: 1, poop: 2, trash: 1, laundry: 3, groceries: 3, cleaning: 4, dishes: 1 };
const HELP = { petsit: ['🐾', 'Pet sitting'], babysit: ['🧸', 'Babysitting'], walk: ['🦮', 'Dog walk'], ride: ['🚗', 'A ride'], meal: ['🍲', 'A meal'], other: ['🙋', 'A hand'] };
const dayRange = (a, b) => { const f = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }); return !b || b === a ? f(a) : `${f(a)} – ${f(b)}`; };
const monthName = (m) => new Date(`${m}-15T12:00:00`).toLocaleDateString(undefined, { month: 'long' });
const deviceName = () => { const u = navigator.userAgent; return `${/iPhone/.test(u) ? 'iPhone' : /iPad/.test(u) ? 'iPad' : /Android/.test(u) ? 'Android' : /Mac/.test(u) ? 'Mac' : /Windows/.test(u) ? 'Windows' : 'Browser'} · ${/CriOS|Chrome/.test(u) ? 'Chrome' : /Safari/.test(u) ? 'Safari' : /Firefox/.test(u) ? 'Firefox' : 'browser'}`; };
const download = (blob, name) => { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 5000); };

const VERSION = new URL(import.meta.url).searchParams.get('v') || 'dev';
const state = { user: null, families: [], fid: LS.get('fam.fid'), family: null, connected: [], feed: [], view: 'feed', memberId: null, invite: null, open: {} };
const fam = () => state.family;
// How someone shows up: relations are as the person who added them described them.
const relLabel = (m) => (m.id === fam()?.me ? 'You' : m.kind === 'pet' ? SPECIES[m.species] || 'Pet' : m.relation === 'self' ? 'Family creator' : RELATION[m.relation] || 'Family');
const me = () => fam()?.members.find((m) => m.id === fam().me);
const member = (id) => fam()?.members.find((m) => m.id === id);

// ---------- little helpers ----------
function toast(text) {
  const t = $('#toast');
  t.textContent = text; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200);
}
const hue = (id = '') => HUES[[...id].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length];
function avatar(m, size = 40) {
  const s = `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px`;
  if (/^(https:|data:image\/)/.test(m?.avatar || '')) return `<img class="av" style="${s}" src="${esc(m.avatar)}" alt="" referrerpolicy="no-referrer">`;
  const face = m?.avatar || (m?.kind === 'pet' ? '🐶' : esc((m?.name || '?').trim()[0]?.toUpperCase() || '?'));
  return `<span class="av" style="${s};--h:${hue(m?.id || m?.name)}">${face}</span>`;
}
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 7 * 86400) return `${Math.floor(s / 86400)}d`;
  return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
const ageOf = (born) => {
  if (!born) return '';
  const mo = Math.floor((Date.now() - Date.parse(`${born}T12:00:00`)) / (30.44 * 864e5));
  return mo < 0 ? '' : mo < 24 ? `${mo} months` : `${Math.floor(mo / 12)} years`;
};
const isoLocal = (d = new Date()) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const inviteLink = (code) => `${location.origin}${location.pathname}#invite=${code}`;
function openSheet(html) { $('#sheetBody').innerHTML = html; if (!$('#sheet').open) $('#sheet').showModal(); }
const closeSheet = () => $('#sheet').open && $('#sheet').close();
async function act(fn) { try { return await fn(); } catch (err) { if (err.status === 401 || err.data?.consent) return boot(); toast(err.message); return null; } }

// ---------- start ----------
async function boot() {
  const m = location.hash.match(/invite=([a-z0-9]{12,40})/);
  if (m) { LS.set('fam.invite', m[1]); history.replaceState(null, '', location.pathname); }
  state.invite = LS.get('fam.invite');
  if (!api.token()) return signIn();
  const r = await api.get('/me').catch((err) => (err.status === 401 ? null : Promise.reject(err)));
  if (!r) return signIn();
  state.user = r.user; state.families = r.families;
  if (state.support == null) api.liveConfig().then((c) => { state.support = c.supportEmail || ''; }).catch(() => {});
  if (r.user.needsConsent) return consentView();
  if (state.invite) return inviteView();
  if (!state.families.length) return onboard();
  if (!state.families.some((f) => f.fid === state.fid)) state.fid = state.families[0].fid;
  await loadFamily();
  show(state.view === 'member' && !member(state.memberId) ? 'feed' : state.view);
}
async function loadFamily() {
  const r = await api.get(`/families/${state.fid}`);
  state.family = r.family; state.connected = r.connected;
  LS.set('fam.fid', state.fid);
}
function chrome(on) {
  $('#bar').hidden = !on; $('#nav').hidden = !on;
  document.body.classList.toggle('with-nav', on);
  if (on) document.querySelector('#nav [data-view=pets]').hidden = !(fam().modules || []).some((x) => x === 'dogs' || x === 'chores');
  if (on) $('#navTrackers').hidden = !(fam().modules || []).includes('health');
  if (on) $('#famSwitch').innerHTML = `<b>${esc(fam().name)}</b><span class="caret">▾</span>${api.mode() === 'demo' ? '<span class="pill demo">Demo</span>' : ''}`;
}

// ---------- signing in ----------
async function signIn() {
  chrome(false);
  const cfg = await api.liveConfig();
  $('#view').innerHTML = `<section class="hero">
      <div class="logo">🐾</div>
      <h1>OurPawmily</h1>
      <p class="lede">A private home for your family — the people, the pets, and the little moments. Only the people you invite can see it.</p>
      ${state.invite ? '<div class="note">💌 You have an invite. Sign in with the Google account it was sent to.</div>' : ''}
      <div class="signin">
        ${cfg.ready ? '<div id="gbtn" class="gbtn"></div><p class="tiny muted">Protected by your Google account, including its 2-Step Verification.</p>'
          : `<p class="small muted">${cfg.missing ? 'Google sign-in turns on once the connector is updated (<code>npx wrangler deploy</code> in <code>server/</code>) and given a Google client ID — see server/README.md.' : 'Google sign-in needs a client ID on the connector — see server/README.md.'}</p>`}
        <button type="button" class="ghost wide" data-act="demo">Try it on this phone (demo)</button>
        <p class="tiny muted">The demo keeps everything on this phone, so you can try families, invites and the feed before anything goes live.</p>
      </div>
      <button type="button" class="linkish small" data-act="help">💬 Trouble signing in? Get help</button>
      <a class="small" href="../">‹ Back to the current app</a>
    </section>`;
  if (cfg.ready) loadGoogle(cfg.googleClientId);
}
function loadGoogle(clientId) {
  const go = () => {
    window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => act(async () => {
      api.setMode('live');
      const s = await api.post('/auth/google', { credential: r.credential, device: deviceName() });
      api.setToken(s.token); boot();
    }) });
    window.google.accounts.id.renderButton($('#gbtn'), { theme: 'outline', size: 'large', shape: 'pill', text: 'continue_with', width: 280 });
  };
  if (window.google?.accounts) return go();
  const s = document.createElement('script');
  s.src = 'https://accounts.google.com/gsi/client'; s.async = true; s.onload = go;
  s.onerror = () => toast("Couldn't reach Google sign-in.");
  document.head.append(s);
}
function demoSignIn() {
  openSheet(`<h2>Try the demo</h2>
    <p class="small muted">Sign in as anyone — it all stays on this phone. To try an invite, sign out and sign in as the person it was sent to.</p>
    <form id="demoForm" class="stack">
      <label>Your name<input name="name" required maxlength="40" autocomplete="given-name"></label>
      <label>Email<input name="email" type="email" required maxlength="120" autocomplete="email"></label>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Continue</button></div>
    </form>`);
}

// ---------- terms (13+), shown once per version ----------
function consentView() {
  chrome(false);
  $('#view').innerHTML = `<section class="hero">
      <div class="logo">🤝</div>
      <h1>Before you start</h1>
      <p class="lede">OurPawmily is private by design: only the people you invite see your family, your diet & fitness stays yours until you share it, and you can download or delete everything at any time.</p>
      <form id="consentForm" class="stack card">
        <label class="check"><input type="checkbox" name="age13" required><span>I'm 13 or older</span></label>
        <label class="check"><input type="checkbox" name="agree" required><span>I agree to the <a href="terms.html" target="_blank">Terms</a> and <a href="privacy.html" target="_blank">Privacy Policy</a></span></label>
        <button class="wide">Continue</button>
      </form>
      <p class="small muted">Under 13? A parent can add you to their family as a profile they manage.</p>
      <button type="button" class="linkish small" data-act="signout">Sign out (${esc(state.user.email)})</button>
    </section>`;
}

// ---------- first family / invites ----------
function onboard() {
  chrome(false);
  $('#view').innerHTML = `<section class="hero">
      <div class="logo">🏡</div>
      <h1>Create your family</h1>
      <p class="lede">You'll be its creator. Then add your partner, kids and pets — grown-ups join with an invite sent to their email.</p>
      <form id="famForm" class="stack card">
        <label>Family name<input name="name" required maxlength="40" placeholder="e.g. The Pawsome Family"></label>
        <label>Your name in the family<input name="myName" maxlength="40" value="${esc(state.user.name.split(' ')[0])}"></label>
        <fieldset class="modules"><legend>What would you like to manage?</legend>
          ${Object.entries(MODULES).map(([k, v]) => `<label class="check"><input type="checkbox" name="mod" value="${k}" ${k === 'calendar' ? '' : 'checked'}><span>${v}</span></label>`).join('')}
          <small class="muted">You can change this any time in Me › Family settings.</small></fieldset>
        <button class="wide">Create family</button>
      </form>
      <p class="small muted">Got an invite instead? Open the link from the email or message.</p>
      <button type="button" class="linkish small" data-act="signout">Sign out (${esc(state.user.email)})</button>
    </section>`;
}
async function inviteView() {
  chrome(false);
  const code = state.invite;
  const r = await api.get(`/invites/${code}`).catch((err) => ({ error: err.message }));
  if (r.error) {
    LS.set('fam.invite', null); state.invite = null;
    $('#view').innerHTML = `<section class="hero"><div class="logo">💌</div><h1>Invite</h1><p class="lede">${esc(r.error)}</p><button type="button" data-act="home">Continue</button></section>`;
    return;
  }
  const inv = r.invite;
  const owned = state.families.filter((f) => f.myRole === 'owner');
  $('#view').innerHTML = `<section class="hero">
      <div class="logo">💌</div>
      <h1>${inv.kind === 'member' ? `Join ${esc(inv.familyName)}` : `Connect with ${esc(inv.familyName)}`}</h1>
      <p class="lede">${esc(inv.byName)} ${inv.kind === 'member' ? `invited you to join the family <b>${esc(inv.familyName)}</b>.` : `would like your family and <b>${esc(inv.familyName)}</b> to share updates.`}</p>
      ${inv.note ? `<blockquote>${esc(inv.note)}</blockquote>` : ''}
      ${!inv.forYou ? `<div class="note warn">This invite was sent to <b>${esc(inv.email)}</b>, but you're signed in as ${esc(state.user.email)}.</div>
          <button type="button" data-act="signout">Sign in with ${esc(inv.email)}</button>`
        : inv.kind === 'member' ? '<button type="button" class="wide" data-act="accept">Join the family</button>'
        : `<form id="connectForm" class="stack card">
            ${owned.length ? `<label>Connect<select name="fid">${owned.map((f) => `<option value="${f.fid}">${esc(f.name)}</option>`).join('')}<option value="">＋ A new family…</option></select></label>` : ''}
            <label ${owned.length ? 'hidden' : ''} data-newfam>Name your family<input name="familyName" maxlength="40" placeholder="e.g. The Garcias" ${owned.length ? '' : 'required'}></label>
            <button class="wide">Connect our families</button>
          </form>`}
      <button type="button" class="linkish small" data-act="declineinvite">Not now</button>
    </section>`;
}

// ---------- views ----------
function show(view, extra) {
  state.view = view;
  if (view === 'member') state.memberId = extra;
  if (view === 'compose') return compose();
  chrome(true);
  document.querySelectorAll('#nav [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === (view === 'member' ? 'family' : view)));
  window.scrollTo(0, 0);
  if (view !== 'bingo') clearInterval(bingo.timer);
  ({ feed: feedView, family: familyView, pets: petsView, me: meView, member: memberView, bingo: bingoView })[view]?.();
}
const demoBanner = () => (api.mode() === 'demo' ? '<div class="banner">Demo — everything stays on this phone.</div>' : '');

async function feedView() {
  const people = fam().members;
  $('#view').innerHTML = `${demoBanner()}
    <div class="stories">${people.map((m) => `<button type="button" class="story" data-member="${m.id}">${avatar(m, 58)}<span>${esc(m.id === fam().me ? 'You' : m.name)}</span></button>`).join('')}
      <button type="button" class="story add" data-act="addperson"><span class="av plus" style="width:58px;height:58px">＋</span><span>Add</span></button></div>
    <button type="button" class="card composer" data-view="compose">${avatar(me(), 36)}<span>Share something with the family…</span><span class="cam">📷</span></button>
    <div id="goldNews"></div>
    <div id="posts"><div class="skeleton card"></div><div class="skeleton card"></div></div>`;
  goldNews();
  const r = await act(() => api.get('/feed'));
  if (!r) return;
  state.feed = r.posts;
  renderPosts();
}
// The first week of a month: last month's Gold Card winner tops the feed.
async function goldNews() {
  if (!(fam().modules || []).some((x) => x === 'dogs' || x === 'chores')) return;
  const today = isoLocal();
  if (+today.slice(8, 10) > 7) return;
  const d = new Date(`${today}T12:00:00`); d.setDate(0);
  const last = isoLocal(d).slice(0, 7);
  const r = await api.get(`/families/${state.fid}/chores?month=${last}&today=${today}`).catch(() => null);
  const g = r?.gold.find((x) => x.month === last);
  const el = $('#goldNews');
  if (!g || !el) return;
  el.innerHTML = `<section class="card gold gold-news"><div class="gold-shine"></div><div class="lbl gold-lbl">🏆 ${monthName(last)} Gold Card</div>
    <div class="gold-title">${g.winners.map((w) => esc(w.id === fam().me ? 'You' : w.name)).join(' & ')} won${g.winners.some((w) => w.id === fam().me) ? '! 🎉' : ' 🎉'}</div>
    <div class="small">${g.points} points of chores${g.prize ? ` · 🎁 ${esc(g.prize)}` : ''}</div></section>`;
}
function renderPosts() {
  const el = $('#posts');
  if (!el) return;
  const asks = state.feed.filter((p) => p.help?.status === 'open' && !p.mine && p.help.to >= isoLocal());
  const rest = state.feed.filter((p) => !asks.includes(p));
  el.innerHTML = state.feed.length ? (asks.length ? `<h3>🙋 Can you help?</h3>${asks.map(postCard).join('')}${rest.length ? '<h3>Latest</h3>' : ''}` : '') + rest.map(postCard).join('')
    : `<div class="empty card"><div class="big">📸</div><b>No posts yet</b><p class="small muted">Share a photo of the dogs, a win at the gym, or what's for dinner. Only your family${state.connected.length ? ' (and the families you connect with, if you choose)' : ''} can see it.</p><button type="button" data-view="compose">Make the first post</button></div>`;
}
function postCard(p) {
  const author = p.own && p.fid === state.fid ? member(p.by) : null;
  // A golden-day post from the dogs shows all of them as the author.
  const who = p.fromPets ? { id: p.by, kind: 'pet', name: p.byName, avatar: author?.avatar || p.byAvatar } : author || { id: p.by, name: p.byName, avatar: p.byAvatar };
  const open = state.open[p.id];
  const comments = open ? p.comments : p.comments.slice(-2);
  return `<article class="post card${p.golden ? ' golden-post' : ''}" data-post="${p.id}" data-fid="${p.fid}">
    ${p.golden ? '<div class="golden-tag">⭐ Golden day</div>' : ''}
    <header><button type="button" class="who" ${author ? `data-member="${author.id}"` : ''}>${avatar(who, 38)}<span><b>${esc(who.name)}</b><small class="muted">${p.fid !== state.fid ? `${esc(p.familyName)} · ` : ''}${ago(p.at)} · ${p.audience === 'connections' ? '👥 Family & friends' : '🏠 Family'}</small></span></button>
      ${p.reported ? `<span class="pill warn" title="Reported by someone in the family">🚩 ${p.reported}</span>` : ''}<button type="button" class="icon-btn" data-act="postmenu" aria-label="Post options">⋯</button></header>
    ${p.help ? helpBlock(p) : ''}
    ${p.photo ? `<img class="photo" src="${p.photo}" alt="" loading="lazy">` : ''}
    <div class="actions"><button type="button" data-act="like" class="${p.liked ? 'liked' : ''}" aria-label="Like">${p.liked ? '❤️' : '🤍'}</button><button type="button" data-act="comment" aria-label="Comment">💬</button>
      <span class="small muted">${p.likes ? `${p.likes} like${p.likes > 1 ? 's' : ''}` : ''}</span></div>
    ${p.text ? `<p class="caption"><b>${esc(who.name)}</b> ${esc(p.text)}</p>` : ''}
    ${p.tags?.length ? `<p class="tags">${p.tags.map((id) => `<button type="button" class="chip" ${member(id) ? `data-member="${id}"` : ''}>${(member(id)?.kind || p.tagKinds?.[id]) === 'pet' ? '🐾' : '👤'} ${esc(p.tagNames?.[id] || member(id)?.name || '')}</button>`).join('')}</p>` : ''}
    ${p.comments.length > 2 && !open ? `<button type="button" class="linkish small" data-act="allcomments">View all ${p.comments.length} comments</button>` : ''}
    <ul class="comments">${comments.map((c) => `<li><b>${esc(c.name)}</b> ${esc(c.text)} <small class="muted">${ago(c.at)}</small></li>`).join('')}</ul>
    <form class="comment-form"><input name="text" maxlength="500" placeholder="Add a comment…" aria-label="Add a comment"><button class="linkish">Post</button></form>
  </article>`;
}

// 🙋 A request for help inside a post: what, when, who offered, and who's helping.
function helpBlock(p) {
  const h = p.help, [ico, label] = HELP[h.type] || HELP.other;
  const mine = p.mine, offered = h.offered;
  return `<div class="help ${h.status}">
    <div class="help-top"><span class="help-ico">${ico}</span><div><div class="help-k">${h.status === 'filled' ? 'Sorted ✓' : 'Can anyone help?'}</div><b>${esc(label)}</b><small>${esc(dayRange(h.from, h.to))}${h.time ? ` · ${esc(h.time)}` : ''}</small></div></div>
    ${h.status === 'filled' ? `<p class="small">💛 ${esc(h.helper.name)}${h.helper.family ? ` (${esc(h.helper.family)})` : ''} is helping.</p>`
      : mine ? (h.offers.length ? `<ul class="offers">${h.offers.map((o) => `<li><span><b>${esc(o.name)}</b>${o.family ? ` <small class="muted">${esc(o.family)}</small>` : ''}${o.msg ? `<br><small>“${esc(o.msg)}”</small>` : ''}</span><button type="button" class="small" data-pick="${o.id}">✓ Choose</button></li>`).join('')}</ul>` : '<p class="small muted">No offers yet. Your network sees this in their feed.</p>')
      : `<div class="row">${offered ? '<span class="pill">🙋 You offered</span><button type="button" class="linkish small" data-act="withdraw">Withdraw</button>' : '<button type="button" data-act="offer">🙋 I can help</button>'}<span class="small muted">${h.offerCount ? `${h.offerCount} offer${h.offerCount > 1 ? 's' : ''}` : ''}</span></div>`}
  </div>`;
}

let draft = { text: '', photo: '', tags: [], audience: 'family' };
function compose() {
  const tags = fam().members.filter((m) => m.id !== fam().me);
  const h = draft.help;
  openSheet(`<div class="seg compose-kind"><button type="button" class="${h ? '' : 'on'}" data-kind="post">📸 Post</button><button type="button" class="${h ? 'on' : ''}" data-kind="help">🙋 Ask for help</button></div>
    <form id="postForm" class="stack">
      ${h ? `<div><div class="small muted">What do you need?</div><div class="chips">${Object.entries(HELP).map(([k, [i, l]]) => `<button type="button" class="chip ${h.type === k ? 'on' : ''}" data-htype="${k}">${i} ${l}</button>`).join('')}</div></div>
        <div class="row"><label style="flex:1">From<input type="date" name="from" required value="${esc(h.from || '')}" min="${isoLocal()}"></label><label style="flex:1">To<input type="date" name="to" value="${esc(h.to || '')}" min="${isoLocal()}"></label></div>
        <label>Time <small class="muted">(optional)</small><input name="time" maxlength="40" placeholder="e.g. 6–10 PM, or overnight" value="${esc(h.time || '')}"></label>` : ''}
      <div class="row top">${avatar(me(), 40)}<textarea name="text" rows="${h ? 3 : 4}" maxlength="2000" placeholder="${h ? 'A few details: feeding, meds, bedtime, where the leash is…' : "What's new with the family?"}">${esc(draft.text)}</textarea></div>
      ${draft.photo ? `<div class="preview"><img src="${draft.photo}" alt=""><button type="button" class="icon-btn" data-act="nophoto" aria-label="Remove photo">✕</button></div>` : ''}
      <label class="filebtn">📷 ${draft.photo ? 'Change photo' : 'Add a photo'}<input type="file" accept="image/*" name="photo" hidden></label>
      ${tags.length ? `<div><div class="small muted">Who's in it?</div><div class="chips">${tags.map((m) => `<button type="button" class="chip ${draft.tags.includes(m.id) ? 'on' : ''}" data-tag="${m.id}">${m.kind === 'pet' ? '🐾' : '👤'} ${esc(m.name)}</button>`).join('')}</div></div>` : ''}
      <div><div class="small muted">Who can see it?</div><div class="seg">
        <button type="button" class="${draft.audience === 'family' ? 'on' : ''}" data-aud="family">🏠 ${esc(fam().name)}</button>
        <button type="button" class="${draft.audience === 'connections' ? 'on' : ''}" data-aud="connections" ${state.connected.length ? '' : 'disabled'}>👥 + connected families</button></div></div>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Share</button></div>
    </form>`);
}
async function shrinkPhoto(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 1080 / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.82);
}

function familyView() {
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

async function petsView() {
  const pets = fam().members.filter((m) => m.kind === 'pet');
  const mods = fam().modules || [];
  $('#view').innerHTML = `${demoBanner()}<section class="card gold" id="race"><div class="skeleton line"></div></section>
    <section class="card care" id="care"><div class="skeleton line"></div></section>
    ${mods.includes('dogs') ? `<h3>Pets</h3>${pets.length ? pets.map((p) => `<button type="button" class="card pet-card" data-member="${p.id}">${avatar(p, 64)}<span><b>${esc(p.name)}</b><small class="muted">${esc([p.breed, ageOf(p.born)].filter(Boolean).join(' · ') || SPECIES[p.species] || '')}</small><small class="pet-alerts" data-alerts="${p.id}"></small></span><span class="go">›</span></button>`).join('')
    : '<div class="empty card"><div class="big">🐾</div><b>No pets yet</b><p class="small muted">Add your dogs (or cats) — everyone in the family sees them.</p></div>'}
    <button type="button" class="ghost wide" data-act="addpet">＋ Add a pet</button>` : ''}
    <section id="fame"></section>`;
  renderCare(); renderRace();
  for (const p of pets) {
    const d = await api.get(`/families/${state.fid}/members/${p.id}/data`).catch(() => null);
    const el = document.querySelector(`[data-alerts="${p.id}"]`);
    if (el && d?.data?.profile) el.innerHTML = vaccineLine(d.data.profile);
  }
}
// 🐾 Today's dog care, shared by the whole family: tap what you did; 👫 logs it for both of you.
let careBoth = false;
async function renderCare() {
  const el = $('#care');
  if (!el) return;
  const today = isoLocal();
  const r = await act(() => api.get(`/families/${state.fid}/care?to=${today}&days=7`));
  if (!r) return;
  const list = r.days[today] || [];
  const count = (k) => list.filter((e) => e.kind === k).length;
  const fedBoth = count('breakfast') && count('dinner');
  const outings = count('walk') + count('park');
  const golden = outings >= 2 || (outings >= 1 && count('treat'));
  const week = Object.entries(r.days).sort().map(([d, l]) => {
    const o = l.filter((e) => e.kind === 'walk' || e.kind === 'park').length;
    return `<span class="wk ${o >= 2 || (o && l.some((e) => e.kind === 'treat')) ? 'gold' : o ? 'some' : ''}" title="${d}">${new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>`;
  }).join('');
  const adults = fam().members.filter((m) => m.kind === 'person' && m.status === 'active' && m.relation !== 'child');
  const mods = fam().modules || [];
  const grid = (kinds) => `<div class="care-grid">${kinds.map((k) => { const [ico, label] = CARE[k]; return `<button type="button" class="care-btn ${count(k) ? 'done' : ''}" data-care="${k}"><span>${ico}</span>${label}<em class="pts">${PTS[k] ? `+${PTS[k]}` : '♡'}</em>${count(k) ? `<small>${count(k) > 1 ? `×${count(k)}` : '✓'}</small>` : ''}</button>`; }).join('')}</div>`;
  el.innerHTML = `<div class="row between"><b>Today</b><span class="small ${golden ? 'good' : 'muted'}">${mods.includes('dogs') ? (golden ? '⭐ Golden day' : `${outings} outing${outings === 1 ? '' : 's'}`) : ''}</span></div>
    ${mods.includes('dogs') ? `<div class="care-sec">🐾 The dogs</div>${grid(DOG_KINDS)}` : ''}
    ${mods.includes('chores') ? `<div class="care-sec">🏠 The house</div>${grid(HOUSE_KINDS)}` : ''}
    ${adults.length > 1 ? `<label class="switch-row small both"><span>👫 Log for both of us</span><input type="checkbox" data-careboth ${careBoth ? 'checked' : ''}><i class="switch"></i></label>` : ''}
    ${list.length ? `<ul class="care-log">${list.slice().reverse().map((e) => `<li><span>${CARE[e.kind]?.[0] || ''} ${esc(CARE[e.kind]?.[1] || e.kind)} · <b>${esc(e.byName)}</b> <small class="muted">${new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small></span>${e.by.includes(fam().me) || me().role === 'owner' ? `<button type="button" class="linkish small" data-careundo="${e.id}">Undo</button>` : ''}</li>`).join('')}</ul>`
      : '<p class="small muted">Nothing logged yet today.</p>'}
    ${mods.includes('dogs') ? `<div class="week" aria-label="This week">${week}</div>
    <p class="tiny muted">${fedBoth ? '✓ Fed twice today. ' : ''}⭐ = two outings, or one plus a treat.</p>` : ''}`;
}
// 🏆 This month's race for the Gold Card, and the hall of fame.
let race = null;
async function renderRace() {
  const el = $('#race');
  if (!el) return;
  const today = isoLocal(), month = today.slice(0, 7);
  race = await act(() => api.get(`/families/${state.fid}/chores?month=${month}&today=${today}`));
  if (!race) return;
  const left = new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate() - +today.slice(8, 10);
  const [a, b] = race.board;
  const lead = !a?.points ? 'Log something to get on the board' : b && a.points === b.points ? "It's a tie!" : b ? `${a.id === fam().me ? 'You lead' : `${esc(a.name)} leads`} by ${a.points - b.points}` : `${a.id === fam().me ? "You're" : `${esc(a.name)} is`} in the lead`;
  el.innerHTML = `<div class="gold-shine"></div>
    <div class="row between"><div><div class="lbl gold-lbl">🏆 ${monthName(month)} Gold Card</div><div class="gold-title">${lead}</div></div><div class="gold-days">${left}<small>day${left === 1 ? '' : 's'} left</small></div></div>
    <ul class="race">${race.board.map((r, i) => `<li><span class="rank">${i === 0 && r.points ? '👑' : i + 1}</span>${avatar(member(r.id), 34)}<span class="rname"><b>${esc(r.id === fam().me ? 'You' : r.name)}</b><small>${r.count} chore${r.count === 1 ? '' : 's'}${r.streak > 1 ? ` · 🔥 ${r.streak}-day streak` : ''}</small><i class="rbar"><i style="width:${race.top ? Math.round((r.points / race.top) * 100) : 0}%"></i></i></span><span class="rpts">${r.points}<small>pts</small></span></li>`).join('')}</ul>
    <div class="row between prize"><span>🎁 Prize: <b>${esc(race.prize || 'set a prize!')}</b></span>${me().role === 'owner' ? '<button type="button" class="linkish small" data-act="prize">✎</button>' : ''}</div>`;
  const fame = $('#fame');
  if (fame) fame.innerHTML = race.gold.length ? `<h3>Hall of fame</h3><div class="fame">${race.gold.map((g) => `<div class="mini-gold"><b>${esc(monthName(g.month))}</b><span>${g.winners.map((w) => esc(w.name)).join(' & ')}</span><small>${g.points} pts${g.prize ? ` · ${esc(g.prize)}` : ''}</small></div>`).join('')}</div>` : '';
}
// A little burst of joy for every chore logged.
function celebrate(kind, x, y) {
  const pts = PTS[kind] || 0;
  const mine = race?.board.find((r) => r.id === fam().me), other = race?.board.find((r) => r.id !== fam().me);
  const after = (mine?.points || 0) + pts;
  const lead = other ? (after > other.points ? ` · ${after - other.points} ahead of ${other.name}` : after === other.points ? ` · tied with ${other.name}` : ` · ${other.points - after} behind ${other.name}`) : '';
  toast(`${CARE[kind][0]} ${pts ? `+${pts} ✨` : '♡'} ${CARE[kind][1]}${lead}`);
  celebrateBurst(x, y);
}
function celebrateBurst(x, y) {
  for (let i = 0; i < 14; i++) {
    const c = document.createElement('i');
    c.className = 'burst';
    c.textContent = ['✨', '⭐', '💛', '🎉'][i % 4];
    c.style.left = `${x}px`; c.style.top = `${y}px`;
    c.style.setProperty('--dx', `${Math.cos((i / 14) * 6.28) * (50 + Math.random() * 40)}px`);
    c.style.setProperty('--dy', `${Math.sin((i / 14) * 6.28) * (50 + Math.random() * 40) - 30}px`);
    document.body.append(c); setTimeout(() => c.remove(), 900);
  }
}

function vaccineLine(dog) {
  const today = Date.now();
  const due = (dog.vaccines || []).map((v) => ({ name: v.name, at: v.due ? Date.parse(`${v.due}T12:00:00`) : null })).filter((v) => v.at).sort((a, b) => a.at - b.at)[0];
  if (!due) return '';
  const days = Math.round((due.at - today) / 864e5);
  return days < 0 ? `<span class="tone-warn">💉 ${esc(due.name)} overdue</span>` : days <= 30 ? `💉 ${esc(due.name)} due in ${days} days` : '';
}

async function memberView() {
  const m = member(state.memberId);
  if (!m) return show('family');
  const self = m.id === fam().me;
  const theirPosts = state.feed.filter((p) => p.fid === state.fid && p.by === m.id && p.photo);
  $('#view').innerHTML = `<button type="button" class="linkish back" data-view="family">‹ Family</button>
    <section class="card profile">${avatar(m, 84)}<h2>${esc(m.name)}</h2>
      <div class="muted">${esc(relLabel(m))}${m.kind === 'pet' && m.breed ? ` · ${esc(m.breed)}` : ''}${m.kind === 'pet' && m.born ? ` · ${ageOf(m.born)}` : ''}</div>
      ${m.status === 'invited' ? `<p class="small">💌 Invited (${esc(m.email)}) <button type="button" class="linkish" data-act="reinvite" data-id="${m.id}">Send the invite again</button></p>` : ''}
      ${m.status === 'managed' && m.kind === 'person' ? `<p class="small muted">No account yet. <button type="button" class="linkish" data-act="reinvite" data-id="${m.id}">Invite by email</button> — or keep managing them here (kids).</p>` : ''}
    </section>
    <section class="card" id="memberData"><div class="skeleton line"></div></section>
    ${theirPosts.length ? `<h3>Posts</h3><div class="grid">${theirPosts.map((p) => `<img src="${p.photo}" alt="" loading="lazy">`).join('')}</div>` : ''}
    ${!self && m.role !== 'owner' && (me().role === 'owner' || m.status !== 'active') ? `<button type="button" class="danger linkish small pad" data-act="removemember" data-id="${m.id}">Remove ${esc(m.name)} from ${esc(fam().name)}</button>` : ''}`;
  const el = $('#memberData');
  try {
    const { data, savedAt } = await api.get(`/families/${state.fid}/members/${m.id}/data`);
    el.innerHTML = m.kind === 'pet' ? petDetails(m, data) : healthCard(m, data, savedAt, self);
  } catch (err) {
    el.innerHTML = err.data?.locked ? `<div class="locked">🔒 <b>Diet & fitness is private</b><p class="small muted">${esc(m.name)} can share it with you from their Me tab.</p></div>` : `<p class="small muted">${esc(err.message)}</p>`;
  }
}
function healthCard(m, data, savedAt, self) {
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
function petDetails(m, data) {
  const d = data.profile || {};
  const row = (k, v) => (v ? `<li><span class="muted">${k}</span><span>${v}</span></li>` : '');
  const vax = (d.vaccines || []).map((v) => `${esc(v.name)}${v.due ? ` · due ${esc(v.due)}` : ''}`).join('<br>');
  const food = d.food ? esc([d.food.brand, d.food.amount, d.food.times ? `${d.food.times}× a day` : ''].filter(Boolean).join(' · ') || '') : '';
  const body = [row('Breed', esc(m.breed || d.breed)), row('Born', esc(m.born || d.birthday)), row('Weight', d.weightLb ? `${esc(d.weightLb)} lb` : ''), row('Food', food), row('Vaccines', vax), row('Vet', esc(d.vet?.name || d.vet || '')), row('Microchip', esc(d.microchip))].join('');
  return `<b>About ${esc(m.name)}</b>${body ? `<ul class="kv">${body}</ul>` : '<p class="small muted">Add food, meds, vaccines and the vet in 🥗 Trackers › Dogs — they show up here.</p>'}
    <button type="button" class="linkish small" data-act="editpet" data-id="${m.id}">✎ Edit photo, name, breed, birthday</button>`;
}

function meView() {
  const f = fam(), my = me();
  const others = f.members.filter((m) => m.kind === 'person' && m.id !== my.id && m.status === 'active');
  const hasLegacy = Object.keys(localStorage).some((k) => k.startsWith('lp.p.'));
  $('#view').innerHTML = `${demoBanner()}
    <section class="card profile">${avatar({ ...my, avatar: my.avatar || state.user.picture }, 72)}<h2>${esc(my.name)}</h2><div class="muted small">${esc(state.user.email)} · ${api.mode() === 'demo' ? 'Demo account' : 'Google account'}</div></section>
    ${(f.modules || []).includes('dogs') && f.members.some((m) => m.kind === 'pet') ? `<section class="card"><form id="petCallsForm" class="row"><label class="grow">What the pets call you<input name="petCalls" maxlength="20" placeholder="e.g. Dad, Mom, Auntie" value="${esc(my.petCalls || '')}"></label><button class="ghost">Save</button></form>
      <div class="chips">${['Dad', 'Mom'].map((x) => `<button type="button" class="chip" data-petcalls="${x}">${x}</button>`).join('')}</div>
      <p class="tiny muted">Used when the dogs thank you for a ⭐ golden day. Until you choose, they write to "Mom &amp; Dad".</p></section>` : ''}
    <h3>Privacy</h3>
    <section class="card"><b>Who can see my diet & fitness</b><p class="small muted">Weight, meals and training. Off for everyone until you turn it on.</p>
      ${others.length ? `<ul class="list toggles">${others.map((o) => `<li><label class="switch-row">${avatar(o, 32)}<span>${esc(o.name)} <small class="muted">${esc(relLabel(o))}</small></span><input type="checkbox" data-share="${o.id}" ${(my.shareWith || []).includes(o.id) ? 'checked' : ''}><i class="switch"></i></label></li>`).join('')}</ul>`
        : '<p class="small muted">Once someone accepts their invite, you can choose here.</p>'}
      <p class="tiny muted">Pets and posts are seen by your whole family. Posts you mark "+ connected families" are also seen by the families you've connected with.</p></section>
    ${hasLegacy ? `<h3>Your data</h3><section class="card"><b>Bring over the current app</b><p class="small muted">Copies everything from the current app on this phone into ${esc(f.name)}: your meals, weigh-ins, training and dog duties, your partner's shared data, and your dogs. Nothing is removed from the current app, and you can run it again to refresh.</p>
      <div class="row wrap"><button type="button" data-act="import">Bring it over</button><button type="button" class="ghost" data-act="backup">Download a backup</button></div><div id="importLog" class="small"></div></section>` : ''}
    <h3>Families</h3>
    <section class="card"><ul class="list">${state.families.map((x) => `<li><button type="button" class="member-row" data-fam="${x.fid}"><span class="av" style="width:36px;height:36px;--h:${hue(x.fid)}">${esc(x.name[0])}</span><span><b>${esc(x.name)}</b><small class="muted">${x.members.length} members${x.myRole === 'owner' ? ' · you created it' : ''}</small></span>${x.fid === state.fid ? '<span class="pill">Open</span>' : '<span class="go">›</span>'}</button></li>`).join('')}</ul>
      <button type="button" class="linkish small" data-act="newfamily">＋ Create another family</button></section>
    ${my.role === 'owner' ? `<h3>Family settings</h3><section class="card stack">
      <form id="famSettings" class="stack"><label>Family name<input name="name" maxlength="40" value="${esc(f.name)}"></label>
        <fieldset class="modules"><legend>What ${esc(f.name)} manages</legend>${Object.entries(MODULES).map(([k, v]) => `<label class="check"><input type="checkbox" name="mod" value="${k}" ${(f.modules || []).includes(k) ? 'checked' : ''}><span>${v}</span></label>`).join('')}</fieldset>
        <label class="check"><input type="checkbox" name="goldenPosts" ${f.goldenPosts !== false ? 'checked' : ''}><span>🐾 On a ⭐ golden day, the dogs post a thank-you on the feed</span></label>
        <button class="ghost">Save</button></form>
      ${others.filter((o) => o.relation !== 'child').length ? `<button type="button" class="linkish small" data-act="handover">Hand ${esc(f.name)} over to someone else</button>` : ''}
      <button type="button" class="linkish small danger" data-act="deletefamily">Delete ${esc(f.name)}…</button></section>`
      : `<section class="card"><button type="button" class="linkish small danger" data-act="leavefamily">Leave ${esc(f.name)}</button></section>`}
    <h3>Help</h3>
    <section class="card stack"><button type="button" class="ghost" data-act="help">💬 Help &amp; questions</button>
      <p class="tiny muted">How families, invites, chores and the diet app work — and it can check your account, resend an invite, or pass a problem to the app's maintainer.</p></section>
    ${state.user.isAdmin ? '<h3>Maintainer</h3><section class="card"><button type="button" class="ghost wide" data-act="admin">🛠 Problems, glitches &amp; the nightly check</button></section>' : ''}
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
  api.get('/account/sessions').then((r) => {
    const el = $('#sessions');
    if (el) el.innerHTML = `<b>Signed in on</b><ul class="list">${r.sessions.slice().reverse().map((x) => `<li class="row between"><span>${esc(x.device || 'A device')}${x.current ? ' <span class="pill">This one</span>' : ''}</span><small>${ago(x.at)}</small></li>`).join('')}</ul>`;
  }).catch(() => {});
}

// ---------- 🎲 show bingo ----------
// Card sets are lists of squares anyone can add (pasted from a chatbot, a file, or written by
// Claude), so a new show never needs an app update. Each player gets their own shuffled card.
const bingo = { list: null, game: null, view: null, timer: null, season: null, seasons: [], open: {} };
const BINGO_PROMPT = (show) => `Make a bingo card set for watching "${show || 'our show'}" together.
Give me 30 short squares (under 8 words each) — funny, specific moments and clichés that are likely to happen in an episode, a mix of easy and rare.
Reply with just the squares, one per line, no numbers or bullets.`;
async function bingoView() {
  if (bingo.game) return bingoGame();
  if (bingo.season) return seasonView();
  const [r, pk] = await Promise.all([act(() => api.get(`/families/${state.fid}/bingo`)), api.get(`/families/${state.fid}/picks`).catch(() => ({ seasons: [] }))]);
  if (!r || state.view !== 'bingo') return;
  bingo.seasons = pk.seasons;
  bingo.list = r;
  const live = r.games.filter((g) => g.status === 'live'), past = r.games.filter((g) => g.status !== 'live').slice(0, 5);
  $('#view').innerHTML = `${demoBanner()}
    <section class="card bingo-hero"><div class="big">🎲</div><h2>Show bingo</h2><p class="small muted">Pick a card set before an episode, everyone gets their own card, and the first line wins. New show? Add a card set — no app update needed.</p></section>
    ${live.length ? `<h3>Playing now</h3>${live.map((g) => `<button type="button" class="card bingo-row" data-bingogame="${g.id}"><b>${esc(g.title)}</b><small class="muted">started by ${esc(g.byName)} · ${ago(g.at)}${g.winners.length ? ` · 🏆 ${g.winners.map((w) => esc(w.name)).join(', ')}` : ''}</small><span class="go">Play ›</span></button>`).join('')}` : ''}
    <h3>Card sets</h3>
    ${r.packs.length ? r.packs.map((p) => `<div class="card bingo-row"><b>${esc(p.title)}</b><small class="muted">${p.count} squares · added by ${esc(p.byName)}</small>
      <div class="row"><button type="button" data-bingostart="${p.id}">▶ Start a game</button>${p.mine || me().role === 'owner' ? `<button type="button" class="linkish small danger" data-bingodel="${p.id}">Remove</button>` : ''}</div></div>`).join('')
      : '<p class="small muted">No card sets yet — add one for the next show you watch.</p>'}
    <button type="button" class="ghost wide" data-act="bingonew">＋ New card set</button>
    <h3>💑 Couples picks</h3>
    <p class="small muted">Predict what each couple will do — fights, tears, cheating, "I do" at the altar — and score points as the season plays out.</p>
    ${bingo.seasons.map((s) => `<button type="button" class="card bingo-row" data-season="${s.id}"><b>${esc(s.title)}</b><small class="muted">${s.couples} couples · ${s.status === 'live' ? 'playing' : 'finished'}</small><span class="go">Open ›</span></button>`).join('')}
    <button type="button" class="ghost wide" data-act="seasonnew">＋ New season</button>
    ${past.length ? `<h3>Earlier games</h3><ul class="list small">${past.map((g) => `<li class="row between"><span>${esc(g.title)} <small class="muted">${ago(g.at)}</small></span><span>${g.winners.length ? `🏆 ${g.winners.map((w) => esc(w.name)).join(', ')}` : 'no bingo'}</span></li>`).join('')}</ul>` : ''}`;
}
function bingoNew(prefill = {}) {
  openSheet(`<h2>New card set</h2>
    <form id="bingoForm" class="stack">
      <label>Show<input name="title" required maxlength="60" placeholder="e.g. Love Is Blind" value="${esc(prefill.title || '')}"></label>
      <div class="row wrap"><button type="button" class="ghost small" data-act="bingoclaude">✨ Write them with Claude</button><button type="button" class="ghost small" data-act="bingoprompt">📋 Copy a prompt for any chatbot</button>
        <label class="filebtn ghost small">📄 Load a file<input type="file" name="bingofile" accept=".txt,.json,.csv,text/plain,application/json" hidden></label></div>
      <label>Squares — one per line (at least 24, 30+ is best)<textarea name="text" rows="10" placeholder="Someone cries in the pods&#10;“I've never felt this way before”&#10;Dramatic slow-motion walk…">${esc(prefill.text || '')}</textarea></label>
      <p class="tiny muted" id="bingoCount"></p>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Save card set</button></div>
    </form>`);
  bingoCountLine();
}
const bingoCountLine = () => {
  const el = $('#bingoCount'), ta = $('#bingoForm [name=text]');
  if (!el || !ta) return;
  const n = ta.value.split(/\n/).map((x) => x.trim()).filter(Boolean).length;
  el.textContent = n ? `${n} square${n === 1 ? '' : 's'}${n < 24 ? ` — ${24 - n} more needed` : ' ✓'}` : '';
};
async function bingoGame(r) {
  r ||= await act(() => api.get(`/families/${state.fid}/bingo/games/${bingo.game}`));
  if (!r || state.view !== 'bingo') return;
  bingo.view = r;
  const c = r.card, done = r.game.status !== 'live';
  $('#view').innerHTML = `<div class="row between bingo-top"><button type="button" class="linkish" data-act="bingoback">‹ Show bingo</button>${!done && (r.game.byName === me().name || me().role === 'owner') ? '<button type="button" class="linkish small" data-act="bingoend">End game</button>' : ''}</div>
    <h2 class="bingo-title">${esc(r.game.title)} <small>bingo</small></h2>
    ${r.game.winners.length ? `<p class="bingo-win">🏆 ${r.game.winners.map((w, i) => `${i === 0 ? '<b>' : ''}${esc(w.name)}${i === 0 ? '</b>' : ''}`).join(' · ')}</p>` : ''}
    <div class="bingo-grid ${done ? 'done' : ''}">${c.squares.map((s, i) => (i === 12 ? '<div class="bsq free">⭐<small>FREE</small></div>'
      : `<button type="button" class="bsq ${c.marks[i] ? 'on' : ''}" data-bsq="${i}" ${done ? 'disabled' : ''}>${esc(s)}</button>`)).join('')}</div>
    <ul class="bingo-players">${r.players.map((p) => `<li>${avatar(member(p.id), 26)}<span>${esc(p.id === fam().me ? 'You' : p.name)}</span><small class="muted">${p.playing ? `${p.marked} marked${p.lines ? ` · ${p.lines} line${p.lines > 1 ? 's' : ''} 🎉` : ''}` : 'not playing yet'}</small></li>`).join('')}</ul>
    ${done ? '<p class="small muted center">This game has ended.</p>' : '<p class="tiny muted center">Tap a square when it happens. A full row, column or diagonal is BINGO.</p>'}`;
  clearInterval(bingo.timer);
  if (!done) bingo.timer = setInterval(() => { if (state.view === 'bingo' && bingo.game && document.visibilityState === 'visible') api.get(`/families/${state.fid}/bingo/games/${bingo.game}`).then((x) => { if (state.view === 'bingo' && bingo.game) bingoGame(x); }).catch(() => {}); }, 8000);
}

// 💑 Couples picks: one season of a dating show, everyone's predictions and the leaderboard.
function seasonNew() {
  openSheet(`<h2>💑 New season</h2>
    <form id="seasonForm" class="stack">
      <label>Show<input name="title" maxlength="60" value="Love Is Blind"></label>
      <label>Couples — one per line<textarea name="text" rows="7" placeholder="Name & Name&#10;Name & Name"></textarea></label>
      <label>Anything else to predict? (optional, one per line)<textarea name="events" rows="3" placeholder="Talks about their dog&#10;Brings up astrology"></textarea></label>
      <p class="tiny muted">Built in: they fight · someone cries · someone cheats · gets drunk &amp; passes out · says "I love you" · family disapproves · an ex comes up · fights about money — and how it ends: 💍 I do, 🙅 a no at the altar, or 💔 split before the wedding.</p>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Start</button></div>
    </form>`);
}
async function seasonView(r) {
  r ||= await act(() => api.get(`/families/${state.fid}/picks/${bingo.season}`));
  if (!r || state.view !== 'bingo') return;
  bingo.view = r;
  const s = r.season, mine = r.mine || {};
  const ev = (id) => s.events.find((e) => e.id === id)?.label || id;
  const chip = (on, attrs, label, extra = '') => `<button type="button" class="chip ${on ? 'on' : ''} ${extra}" ${attrs}>${esc(label)}</button>`;
  $('#view').innerHTML = `<div class="row between bingo-top"><button type="button" class="linkish" data-act="bingoback">‹ Show games</button></div>
    <h2 class="bingo-title">${esc(s.title)} <small>couples picks</small></h2>
    <section class="card"><b>🏆 Leaderboard</b><ul class="bingo-players">${r.board.map((p, i) => `<li>${avatar(member(p.id), 26)}<span>${i === 0 && p.points > 0 ? '👑 ' : ''}${esc(p.id === fam().me ? 'You' : p.name)}</span><small class="muted">${p.hits} right · ${p.endings} ending${p.endings === 1 ? '' : 's'}</small><b class="pts-big">${p.points}</b></li>`).join('')}</ul>
      <p class="tiny muted">+2 for each pick that happens · +5 for calling the ending · −1 for a pick that never happened once the couple's ending is in.</p></section>
    ${s.couples.map((c) => {
      const my = mine[c.id] || { events: [], outcome: null }, happened = new Set(s.happened[c.id] || []), end = s.outcome[c.id];
      const open = bingo.open[c.id] ?? !c.locked;
      return `<details class="card couple" data-couple="${c.id}" ${open ? 'open' : ''}><summary><b>${esc(c.a)}${c.b ? ` &amp; ${esc(c.b)}` : ''}</b> <span class="pill">${end ? esc(s.outcomes[end]) : c.locked ? '🔒 picks locked' : '✏️ make your picks'}</span></summary>
        ${c.locked ? `<div class="small"><b>Your picks:</b> ${my.events.length || my.outcome ? [...my.events.map((e) => `${happened.has(e) ? '✅' : end ? '❌' : '⏳'} ${esc(ev(e))}`), my.outcome ? `${end ? (my.outcome === end ? '✅' : '❌') : '⏳'} ${esc(s.outcomes[my.outcome])}` : ''].filter(Boolean).join(' · ') : '<span class="muted">none</span>'}</div>
          ${(r.revealed[c.id] || []).map((o) => `<div class="small muted"><b>${esc(o.name)}:</b> ${[...o.events.map((e) => `${happened.has(e) ? '✅' : ''}${esc(ev(e))}`), o.outcome ? esc(s.outcomes[o.outcome]) : ''].filter(Boolean).join(' · ') || 'none'}</div>`).join('')}`
        : `<div class="lbl">Your picks <span class="muted">(only you see them until something happens)</span></div>
          <div class="chips">${s.events.map((e) => chip(my.events.includes(e.id), `data-pick="${e.id}"`, e.label)).join('')}</div>
          <div class="lbl">How it ends</div><div class="chips">${Object.entries(s.outcomes).map(([k, v]) => chip(my.outcome === k, `data-pickend="${k}"`, v)).join('')}</div>`}
        ${s.status === 'live' ? `<div class="lbl happened-lbl">What happened ${c.locked ? '' : '<span class="muted">(marking anything locks everyone\'s picks)</span>'}</div>
          <div class="chips">${s.events.map((e) => chip(happened.has(e.id), `data-happened="${e.id}"`, `${happened.has(e.id) ? '✓ ' : ''}${e.label}`, 'hap')).join('')}</div>
          <div class="chips">${Object.entries(s.outcomes).map(([k, v]) => chip(end === k, `data-ending="${k}"`, v, 'hap')).join('')}</div>` : ''}
      </details>`;
    }).join('')}
    ${s.status === 'live' ? `<form id="addCoupleForm" class="row card"><input name="a" placeholder="Name" maxlength="30" required><span>&amp;</span><input name="b" placeholder="Name" maxlength="30"><button class="ghost small">＋ Couple</button></form>` : ''}
    ${s.mine || me().role === 'owner' ? `<button type="button" class="linkish small" data-act="seasonstatus">${s.status === 'live' ? 'Finish the season' : 'Reopen the season'}</button>` : ''}`;
}

// ---------- help: chat with the assistant, report a problem ----------
const chat = { messages: [], busy: false };
const CHIPS = ['How do I set up a family?', 'How do I add people and pets?', "My invite isn't working", "I can't sign in", 'How do I enter macros for a meal?', 'Help me set up my diet plan', 'Something is broken'];
// Assistant text → safe HTML: **bold**, links, line breaks.
const rich = (t) => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<i>$2</i>').replace(/https:\/\/[^\s<)]+/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u}</a>`).replace(/\n/g, '<br>');
function helpView() {
  openSheet(`<div class="row between"><h2>💬 Help</h2><button type="button" class="linkish small" data-act="close">Done</button></div>
    <div class="chat" id="chatLog"></div>
    <div class="chips" id="chatChips">${CHIPS.map((c) => `<button type="button" class="chip" data-ask="${esc(c)}">${esc(c)}</button>`).join('')}</div>
    <form id="chatForm" class="chat-form"><input name="text" placeholder="Ask anything about OurPawmily…" maxlength="1000" autocomplete="off"><button ${chat.busy ? 'disabled' : ''}>Send</button></form>
    <div class="row between"><button type="button" class="linkish small" data-act="reportproblem">📮 Report a problem</button>${chat.messages.length ? '<button type="button" class="linkish small" data-act="chatclear">Start over</button>' : ''}</div>
    <p class="tiny muted">Answers come from Claude (Anthropic) using the app's guide. Don't share passwords or codes. Problems you report go to the app's maintainer.</p>`);
  renderChat();
}
function renderChat() {
  const log = $('#chatLog');
  if (!log) return;
  const hello = `Hi${state.user ? ` ${esc(state.user.name.split(' ')[0])}` : ''}! I can explain how OurPawmily works — families, invites, chores, the feed and the diet app${state.user ? ' — check your account, resend an invite, or pass a problem to the maintainer' : ', help with signing in, or pass a problem to the maintainer'}.`;
  log.innerHTML = `<div class="bubble bot">${hello}</div>${chat.messages.map((m) => `<div class="bubble ${m.role === 'user' ? 'me' : 'bot'}">${m.role === 'user' ? esc(m.text) : rich(m.text)}${m.invite ? `<button type="button" class="ghost small" data-chatinvite="${m.invite.code}">💌 Share ${esc(m.invite.name)}'s invite</button>` : ''}${m.filed ? `<small class="muted">📮 Sent to the maintainer · #${esc(m.filed)}</small>` : ''}</div>`).join('')}${chat.busy ? '<div class="bubble bot typing"><i></i><i></i><i></i></div>' : ''}`;
  $('#chatChips').hidden = chat.messages.length > 0;
  log.scrollTop = log.scrollHeight;
}
async function ask(text) {
  text = text.trim();
  if (!text || chat.busy) return;
  chat.messages.push({ role: 'user', text }); chat.busy = true; renderChat();
  try {
    const r = await api.post('/help/chat', { messages: chat.messages.map(({ role, text: t }) => ({ role, text: t })), app: { version: VERSION, device: deviceName(), page: state.view } });
    chat.messages.push({ role: 'assistant', text: r.note ? `${r.reply}\n\n_${r.note}_` : r.reply, invite: r.invite, filed: r.filed });
    if (r.signedOutOthers) toast('Signed out on your other devices');
  } catch (err) {
    if (err.status === 429) chat.messages.push({ role: 'assistant', text: err.message });
    else {
      // The connector is out of reach (offline, or not set up yet): answer from the guide on this phone.
      const { offlineAnswer } = await import('../server/helpAgent.js');
      chat.messages.push({ role: 'assistant', text: `${offlineAnswer(text).reply}\n\n_(Offline answer from the guide — the help desk isn't reachable right now.)_` });
    }
  }
  chat.busy = false; renderChat();
  const b = $('#chatForm button'); if (b) b.disabled = false;
}
function reportSheet() {
  openSheet(`<h2>📮 Report a problem</h2><p class="small muted">It goes to the app's maintainer${chat.messages.length ? ', with this help chat' : ''}.</p>
    <form id="reportForm" class="stack">
      <label>What kind<select name="category"><option value="bug">Something's broken</option><option value="sign-in">Signing in</option><option value="invite">Invites</option><option value="data">Missing or wrong data</option><option value="feature">An idea</option><option value="other">Something else</option></select></label>
      <label>What happened<input name="summary" required maxlength="120"></label>
      <label>Details<textarea name="details" rows="4" maxlength="2000" placeholder="What you were doing, what you expected, what you saw"></textarea></label>
      ${state.user ? '' : '<label>Your email (so we can reply)<input name="contact" type="email" maxlength="120"></label>'}
      <div class="row end"><button type="button" class="ghost" data-act="help">Back</button><button>Send</button></div>
    </form>`);
}

// ---------- the maintainer's desk (ADMIN_EMAILS only) ----------
async function adminView() {
  openSheet('<h2>🛠 Maintainer</h2><p class="small muted">Loading…</p>');
  const r = await act(() => api.get('/admin/overview'));
  if (!r) return;
  const rep = r.report;
  const open = r.tickets.filter((t) => t.status === 'open');
  openSheet(`<div class="row between"><h2>🛠 Maintainer</h2><button type="button" class="linkish small" data-act="close">Done</button></div>
    <section class="card stack"><b>Nightly check</b>${rep ? `<p class="small muted">${ago(rep.at)} · ${rep.counts.families} families · ${rep.counts.accounts} accounts · ${rep.counts.people} people · ${rep.counts.pets} pets</p>
      ${rep.fixes.length ? `<ul class="small">${rep.fixes.map((x) => `<li>🔧 ${esc(x)}</li>`).join('')}</ul>` : '<p class="small">✅ Nothing needed fixing.</p>'}
      ${rep.problems.length ? `<ul class="small danger">${rep.problems.map((x) => `<li>⚠️ ${esc(x)}</li>`).join('')}</ul>` : ''}` : '<p class="small muted">Hasn\'t run yet — it runs every night.</p>'}
      <button type="button" class="ghost" data-act="runcheck">Run the check now</button></section>
    <section class="card stack"><b>Problems people filed · ${open.length} open</b>
      ${r.tickets.length ? r.tickets.map((t) => `<details class="ticket ${t.status}"><summary><span class="pill">${esc(t.category)}</span> ${esc(t.summary)} <small class="muted">${ago(t.at)}${t.status === 'done' ? ' · done' : ''}</small></summary>
        <p class="small">${esc(t.details) || '<i>No details</i>'}</p>
        <p class="tiny muted">${esc(t.from.name || '')} ${t.from.email ? `<a href="mailto:${esc(t.from.email)}?subject=${encodeURIComponent(`OurPawmily: ${t.summary}`)}">${esc(t.from.email)}</a>` : '(no email)'} · ${t.from.signedIn ? 'signed in' : 'not signed in'} · v${esc(t.app.version)} · ${esc(t.app.device)}${t.app.page ? ` · on ${esc(t.app.page)}` : ''}</p>
        ${t.transcript.length ? `<div class="chat mini">${t.transcript.map((m) => `<div class="bubble ${m.role === 'user' ? 'me' : 'bot'}">${esc(m.text)}</div>`).join('')}</div>` : ''}
        <button type="button" class="ghost small" data-ticket="${t.id}" data-status="${t.status === 'open' ? 'done' : 'open'}">${t.status === 'open' ? '✓ Mark done' : 'Reopen'}</button></details>`).join('') : '<p class="small muted">None yet.</p>'}</section>
    <section class="card stack"><b>App glitches · last 7 days</b>
      ${r.glitches.length ? `<ul class="small">${r.glitches.map((g) => `<li><b>${g.n}×</b> ${esc(g.message)} <small class="muted">${esc(g.where)} · v${esc(g.version)} · ${ago(g.last)}</small></li>`).join('')}</ul>` : '<p class="small muted">✅ None reported.</p>'}</section>`);
}

// ---------- add people & pets, invites ----------
function addPerson() {
  openSheet(`<h2>Add a person</h2>
    <form id="personForm" class="stack">
      <label>Name<input name="name" required maxlength="40"></label>
      <label>They are your…<select name="relation">${['spouse', 'partner', 'child', 'parent', 'sibling', 'grandparent', 'relative', 'friend'].map((r) => `<option value="${r}">${RELATION[r].toLowerCase()}</option>`).join('')}</select></label>
      <label>Email for their invite <small class="muted">(their Google account)</small><input name="email" type="email" maxlength="120" placeholder="Leave empty for a young child you manage"></label>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Add</button></div>
    </form>`);
}
// The pet photo being chosen in the form: undefined = unchanged, '' = removed, or a data URL.
let petPhoto;
const petPhotoBox = (p) => {
  const shown = petPhoto === undefined ? p?.avatar || '' : petPhoto;
  const has = /^data:image\//.test(shown) || /^https:/.test(shown);
  return `${avatar({ ...(p || { kind: 'pet', name: '?' }), kind: 'pet', avatar: shown }, 72)}
    <div class="stack"><label class="filebtn ghost small">📷 ${has ? 'Change photo' : 'Add a photo'}<input type="file" name="petphoto" accept="image/*" hidden></label>
    ${has ? '<button type="button" class="linkish small" data-act="petnophoto">Remove photo</button>' : ''}</div>`;
};
// A square, small copy of a photo for a profile picture (center crop, 320 px).
async function squarePhoto(file) {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height), out = Math.min(320, side);
  const c = document.createElement('canvas');
  c.width = c.height = out;
  c.getContext('2d').drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
  return c.toDataURL('image/jpeg', 0.82);
}
function addPet(p = null) {
  petPhoto = undefined;
  openSheet(`<h2>${p ? `Edit ${esc(p.name)}` : 'Add a pet'}</h2>
    <form id="petForm" class="stack" data-id="${p?.id || ''}">
      <div class="row pet-photo" id="petPhotoBox">${petPhotoBox(p)}</div>
      <label>Name<input name="name" required maxlength="40" value="${esc(p?.name || '')}"></label>
      ${p ? '' : `<label>Kind<select name="species">${Object.entries(SPECIES).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}</select></label>`}
      <label>Breed<input name="breed" maxlength="40" value="${esc(p?.breed || '')}"></label>
      <label>Birthday<input name="born" type="date" value="${esc(p?.born || '')}"></label>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>${p ? 'Save' : 'Add'}</button></div>
    </form>`);
}
function inviteSheet(invite, who) {
  const link = inviteLink(invite.code);
  const subject = encodeURIComponent(`Join ${fam().name} on OurPawmily`);
  const body = encodeURIComponent(`${me().name} invited you to ${invite.kind === 'family' ? 'connect your family with' : 'join'} ${fam().name} on OurPawmily.\n\nOpen this link and sign in with this Google account (${invite.email}):\n${link}\n\nThe invite works for 14 days.`);
  openSheet(`<h2>💌 Invite ready</h2>
    <p class="small">Send this to ${esc(who)}. Only <b>${esc(invite.email)}</b> can use it, once, within 14 days.</p>
    <div class="linkbox"><input readonly value="${esc(link)}" aria-label="Invite link"></div>
    <div class="row wrap">${navigator.share ? '<button type="button" data-act="shareinvite">Share…</button>' : ''}<a class="btn ghost" href="mailto:${esc(invite.email)}?subject=${subject}&body=${body}">✉️ Email</a><button type="button" class="ghost" data-act="copyinvite">Copy link</button></div>
    ${api.mode() === 'demo' ? '<p class="tiny muted">Demo: copy the link, sign out (Me tab), sign in with that email, then open the link.</p>' : ''}
    <div class="row end"><button type="button" data-act="close">Done</button></div>`);
  $('#sheetBody').dataset.link = link;
}

// ---------- the import ----------
async function runTheImport() {
  const log = $('#importLog');
  const say = (t) => { if (log) log.innerHTML += `<div>✓ ${esc(t)}</div>`; };
  if (!confirm(`Copy the current app's data on this phone into ${fam().name}?`)) return;
  log.innerHTML = '<div class="muted">Reading the current app…</div>';
  const legacy = await legacySnapshot();
  const ops = planImport(legacy, fam());
  if (!ops.length) { log.innerHTML = '<div class="muted">Nothing to bring over.</div>'; return; }
  const done = await runImport(api, state.fid, ops, say);
  await loadFamily();
  await importCare(api, state.fid, legacy, fam(), say);
  // Read everything back and compare it with this phone, section by section.
  const checks = await verifyImport(api, state.fid, done);
  const highlight = (c) => c.sections.filter((x) => ['weigh-ins', 'days of meals', 'workouts', 'calendar events', 'meal combos', 'feedings'].includes(x.label) && x.count).map((x) => `${x.count} ${x.count === 1 ? x.label.replace(/^days of /, 'day of ').replace(/s$/, '') : x.label}`).join(', ');
  log.innerHTML += `<div class="verify">${checks.map((c) => `<div class="${c.ok ? 'good' : 'tone-warn'}">${c.ok ? '✅' : '⚠️'} <b>${esc(c.name)}</b>: ${c.ok ? `${c.sections.length === 1 ? 'everything matches' : `all ${c.sections.length} sections match`}${highlight(c) ? ` (${esc(highlight(c))})` : ''}` : `didn't match: ${esc(c.missing.join(', '))} — tap Bring it over again`}</div>`).join('')}</div>`;
  say('Done. Your partner can claim theirs by accepting an invite — open them under Family and tap "Invite by email".');
}

async function postAction(kind, { fid, pid }) {
  const name = state.feed.find((x) => x.id === pid)?.byName || 'them';
  const drop = () => { state.feed = state.feed.filter((x) => x.id !== pid); closeSheet(); renderPosts(); };
  return act(async () => {
    if (kind === 'delete') { if (!confirm('Delete this post?')) return; await api.del(`/posts/${fid}/${pid}`); drop(); return; }
    if (kind === 'hide') { await api.post(`/posts/${fid}/${pid}/hide`); drop(); toast('Hidden'); return; }
    if (kind === 'report') {
      const reason = prompt("What's wrong with this post? (The family's creator sees that it was reported.)", '');
      if (reason == null) return;
      await api.post(`/posts/${fid}/${pid}/report`, { reason }); drop(); toast('Reported — thanks for letting us know'); return;
    }
    if (kind === 'block') {
      if (!confirm(`Block ${name}? You won't see their posts or comments. You can unblock them in Me.`)) return;
      const r = await api.post(`/posts/${fid}/${pid}/block`);
      state.user.blocked = r.blocked; closeSheet(); toast(`${name} is blocked`);
      const f = await api.get('/feed'); state.feed = f.posts; renderPosts();
    }
  });
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-view], [data-member], [data-fam]');
  if (!t) return;
  const d = t.dataset;
  const post = t.closest('[data-post]');
  if (d.pact) return postAction(d.pact, t.closest('.menu').dataset);
  if (d.care) {
    const box = t.getBoundingClientRect();
    celebrate(d.care, box.left + box.width / 2, box.top + box.height / 2);
    return act(async () => {
      const r = await api.post(`/families/${state.fid}/care`, { kind: d.care, date: isoLocal(), by: careBoth ? 'both' : 'me' });
      renderCare(); renderRace();
      if (r.golden) { state.feed = [r.golden, ...state.feed]; setTimeout(() => toast(`⭐ Golden day! ${r.golden.byName} left you a note on the feed`), 1600); }
    });
  }
  if (d.careundo) return act(async () => { await api.del(`/families/${state.fid}/care/${isoLocal()}/${d.careundo}`); renderCare(); renderRace(); });
  if (d.unblock) return act(async () => { await api.del(`/account/blocks/${d.unblock}`); state.user.blocked = state.user.blocked.filter((b) => b.id !== d.unblock); meView(); });
  if (d.season) { bingo.season = d.season; return seasonView(); }
  if (d.pick || d.pickend) {
    const cid = t.closest('[data-couple]').dataset.couple, cur = bingo.view.mine?.[cid] || { events: [], outcome: null };
    const events = d.pick ? (cur.events.includes(d.pick) ? cur.events.filter((x) => x !== d.pick) : [...cur.events, d.pick]) : cur.events;
    const outcome = d.pickend ? (cur.outcome === d.pickend ? null : d.pickend) : cur.outcome;
    t.classList.toggle('on');
    return act(async () => seasonView(await api.put(`/families/${state.fid}/picks/${bingo.season}/mine`, { couple: cid, events, outcome })));
  }
  if (d.happened || d.ending) {
    const cid = t.closest('[data-couple]').dataset.couple, s = bingo.view.season;
    const c = s.couples.find((x) => x.id === cid);
    if (!c.locked && !confirm(`Mark this for ${c.a}${c.b ? ` & ${c.b}` : ''}? Everyone's picks for them lock.`)) return;
    return act(async () => {
      const r = d.happened
        ? await api.post(`/families/${state.fid}/picks/${bingo.season}/happened`, { couple: cid, event: d.happened, on: !(s.happened[cid] || []).includes(d.happened) })
        : await api.post(`/families/${state.fid}/picks/${bingo.season}/outcome`, { couple: cid, outcome: s.outcome[cid] === d.ending ? null : d.ending });
      seasonView(r);
      if (d.ending && r.season.outcome[cid] === d.ending) { const b = t.getBoundingClientRect(); celebrateBurst(b.left + b.width / 2, b.top); toast(r.mine?.[cid]?.outcome === d.ending ? '🔮 You called it! +5' : `${r.season.outcomes[d.ending]}`); }
    });
  }
  if (d.bingogame) { bingo.game = d.bingogame; return bingoGame(); }
  if (d.bingostart) return act(async () => { const r = await api.post(`/families/${state.fid}/bingo/games`, { packId: d.bingostart }); bingo.game = r.game.id; bingoGame(); });
  if (d.bingodel) { if (!confirm('Remove this card set?')) return; return act(async () => { await api.del(`/families/${state.fid}/bingo/packs/${d.bingodel}`); bingoView(); }); }
  if (d.bsq != null) {
    t.classList.toggle('on');
    return act(async () => {
      const r = await api.post(`/families/${state.fid}/bingo/games/${bingo.game}/mark`, { i: +d.bsq });
      bingoGame(r);
      if (r.bingo) { const b = t.getBoundingClientRect(); for (let k = 0; k < 3; k++) setTimeout(() => celebrateBurst(b.left + b.width / 2, b.top), k * 250); toast(r.bingo.first ? '🎉 BINGO! You got there first!' : '🎉 BINGO!'); }
    });
  }
  if (d.petcalls) { $('#petCallsForm [name=petCalls]').value = d.petcalls; return $('#petCallsForm').requestSubmit(); }
  if (d.ask) return ask(d.ask);
  if (d.chatinvite) { const m = chat.messages.find((x) => x.invite?.code === d.chatinvite); return inviteSheet(m.invite, m.invite.name); }
  if (d.ticket) return act(async () => { await api.patch(`/admin/tickets/${d.ticket}`, { status: d.status }); adminView(); });
  if (d.view) { e.preventDefault(); return show(d.view); }
  if (d.member) { closeSheet(); return show('member', d.member); }
  if (d.fam) { state.fid = d.fam; return act(async () => { await loadFamily(); show('feed'); }); }
  if (d.tag) { draft.tags = draft.tags.includes(d.tag) ? draft.tags.filter((x) => x !== d.tag) : [...draft.tags, d.tag]; t.classList.toggle('on'); return; }
  if (d.kind) { draft.text = $('#postForm textarea')?.value || draft.text; draft.help = d.kind === 'help' ? (draft.help || { type: 'petsit', from: '', to: '', time: '' }) : null; if (draft.help && state.connected.length) draft.audience = 'connections'; return compose(); }
  if (d.htype) { const f = $('#postForm'); Object.assign(draft.help, { type: d.htype, from: f.from.value, to: f.to.value, time: f.time.value }); draft.text = f.text.value; return compose(); }
  if (d.pick) return act(async () => { const r = await api.post(`/posts/${post.dataset.fid}/${post.dataset.post}/accept`, { offer: d.pick }); const p = state.feed.find((x) => x.id === post.dataset.post); p.help = r.help; post.outerHTML = postCard(p); toast(`💛 ${r.help.helper.name} is helping`); });
  if (d.aud) { draft.audience = d.aud; t.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === t)); return; }
  switch (d.act) {
    case 'close': return closeSheet();
    case 'demo': return demoSignIn();
    case 'help': return helpView();
    case 'bingonew': return bingoNew();
    case 'seasonnew': return seasonNew();
    case 'seasonstatus': return act(async () => seasonView(await api.patch(`/families/${state.fid}/picks/${bingo.season}`, { status: bingo.view.season.status === 'live' ? 'done' : 'live' })));
    case 'bingoback': bingo.game = null; bingo.season = null; clearInterval(bingo.timer); return bingoView();
    case 'bingoend': if (!confirm('End this game for everyone?')) return; return act(async () => { await api.post(`/families/${state.fid}/bingo/games/${bingo.game}/end`); bingoGame(); });
    case 'bingoprompt': {
      const text = BINGO_PROMPT($('#bingoForm [name=title]').value.trim());
      return navigator.clipboard?.writeText(text).then(() => toast('Prompt copied — paste it into Claude or ChatGPT, then paste the squares here'), () => prompt('Copy this prompt:', text));
    }
    case 'bingoclaude': {
      const title = $('#bingoForm [name=title]').value.trim();
      if (!title) return toast('Name the show first');
      t.disabled = true; t.textContent = '✨ Writing…';
      return api.post(`/families/${state.fid}/bingo/generate`, { show: title })
        .then((r) => { $('#bingoForm [name=text]').value = r.squares.join('\n'); bingoCountLine(); toast('Here are Claude\'s squares — edit anything, then save'); })
        .catch((err) => toast(err.message))
        .finally(() => { t.disabled = false; t.textContent = '✨ Write them with Claude'; });
    }
    case 'chatclear': chat.messages = []; return helpView();
    case 'reportproblem': return reportSheet();
    case 'admin': return adminView();
    case 'runcheck': t.disabled = true; t.textContent = 'Checking…'; return act(async () => { await api.post('/admin/maintenance'); adminView(); });
    case 'home': return boot();
    case 'signout': return act(async () => { await api.post('/auth/logout').catch(() => {}); api.setToken(null); chat.messages = []; state.family = null; state.view = 'feed'; boot(); });
    case 'addperson': return addPerson();
    case 'addpet': return addPet();
    case 'editpet': return addPet(member(d.id));
    case 'petnophoto': petPhoto = ''; $('#petPhotoBox').innerHTML = petPhotoBox(member($('#petForm').dataset.id)); return;
    case 'nophoto': draft.photo = ''; return compose();
    case 'accept': return act(async () => {
      const r = await api.post(`/invites/${state.invite}/accept`);
      LS.set('fam.invite', null); state.invite = null; state.fid = r.family.fid; state.view = 'feed';
      toast(`Welcome to ${r.family.name}!`); boot();
    });
    case 'declineinvite': LS.set('fam.invite', null); state.invite = null; return boot();
    case 'like': return act(async () => {
      const p = state.feed.find((x) => x.id === post.dataset.post);
      const r = await api.post(`/posts/${post.dataset.fid}/${p.id}/like`);
      Object.assign(p, { liked: r.liked, likes: r.likes }); post.outerHTML = postCard(p);
    });
    case 'comment': return post.querySelector('.comment-form input').focus();
    case 'offer': case 'withdraw': {
      const msg = d.act === 'offer' ? prompt('Add a note? (optional)', "Happy to help — tell me what they need!") : '';
      if (msg == null) return;
      return act(async () => {
        const r = await api.post(`/posts/${post.dataset.fid}/${post.dataset.post}/offer`, d.act === 'offer' ? { msg } : { withdraw: true });
        const p = state.feed.find((x) => x.id === post.dataset.post); p.help = r.help; post.outerHTML = postCard(p);
        if (d.act === 'offer') toast('💛 Offer sent');
      });
    }
    case 'allcomments': state.open[post.dataset.post] = true; return renderPosts();
    case 'postmenu': {
      const p = state.feed.find((x) => x.id === post.dataset.post);
      const canDelete = p.mine || (p.own && p.fid === state.fid && me().role === 'owner');
      return openSheet(`<div class="menu" data-fid="${p.fid}" data-pid="${p.id}">
        ${canDelete ? '<button type="button" class="ghost danger" data-pact="delete">🗑 Delete post</button>' : ''}
        ${p.mine ? '' : `<button type="button" class="ghost" data-pact="hide">🙈 Hide this post</button>
          <button type="button" class="ghost" data-pact="report">🚩 Report…</button>
          <button type="button" class="ghost danger" data-pact="block">⛔ Block ${esc(p.byName)}</button>`}
        <button type="button" data-act="close">Cancel</button></div>`);
    }
    case 'invitefamily': return openSheet(`<h2>💌 Invite a friend's family</h2>
      <p class="small muted">They'll create their own family (or use one they already have), and your two families can share the posts you choose.</p>
      <form id="famInviteForm" class="stack"><label>Their email (Google account)<input name="email" type="email" required maxlength="120"></label>
        <label>A note <small class="muted">(optional)</small><input name="note" maxlength="140" placeholder="Let's share dog pics!"></label>
        <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Create invite</button></div></form>`);
    case 'reinvite': {
      const m = member(d.id);
      const email = m.email || prompt(`${m.name}'s email (their Google account)`) || '';
      if (!email) return;
      return act(async () => { const r = await api.post(`/families/${state.fid}/invites`, { kind: 'member', memberId: m.id, email }); await loadFamily(); inviteSheet(r.invite, m.name); });
    }
    case 'removemember': { const m = member(d.id); if (!confirm(`Remove ${m.name} from ${fam().name}?`)) return; return act(async () => { await api.del(`/families/${state.fid}/members/${m.id}`); await loadFamily(); show('family'); }); }
    case 'shareinvite': return navigator.share({ title: `Join ${fam().name}`, url: $('#sheetBody').dataset.link }).catch(() => {});
    case 'copyinvite': return navigator.clipboard.writeText($('#sheetBody').dataset.link).then(() => toast('Link copied'));
    case 'import': return act(runTheImport);
    case 'backup': {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(backupBlob()); a.download = `ourpawmily-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(a); a.click(); a.remove(); return toast('Backup saved');
    }
    case 'prize': {
      const v = prompt("What does this month's Gold Card winner get?", race?.prize || 'Picks date night + breakfast in bed');
      if (v == null) return;
      return act(async () => { await api.patch(`/families/${state.fid}`, { goldPrize: v }); renderRace(); });
    }
    case 'export': return act(async () => { const r = await api.get('/account/export'); download(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }), `ourpawmily-my-data-${isoLocal()}.json`); toast('Your data is downloaded'); });
    case 'logoutall': if (!confirm('Sign out on every device, including this one?')) return; return act(async () => { await api.post('/auth/logout-all'); api.setToken(null); boot(); });
    case 'deleteaccount': return openSheet(`<h2>Delete your account</h2>
      <p class="small">This permanently deletes:</p>
      <ul class="small"><li>your account and sign-ins on every device</li><li>your diet & fitness data in every family</li><li>your posts, comments and likes</li></ul>
      <p class="small">${state.families.filter((x) => x.myRole === 'owner').length ? 'Families you created pass to another grown-up who has joined them; a family with nobody else is deleted with everything in it (pets, posts, care log). ' : ''}It can't be undone. <button type="button" class="linkish" data-act="export">Download your data first</button></p>
      <form id="deleteForm" class="stack"><label>Type DELETE to confirm<input name="confirm" autocomplete="off" autocapitalize="characters" required></label>
        <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button class="danger-btn">Delete my account</button></div></form>`);
    case 'deletefamily': return openSheet(`<h2>Delete ${esc(fam().name)}</h2>
      <p class="small">Removes the family for everyone: its pets, posts, comments, care log and everyone's data in it. Members keep their accounts. This can't be undone.</p>
      <form id="deleteFamForm" class="stack"><label>Type the family's name to confirm<input name="confirm" autocomplete="off" required placeholder="${esc(fam().name)}"></label>
        <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button class="danger-btn">Delete family</button></div></form>`);
    case 'leavefamily': if (!confirm(`Leave ${fam().name}? Your data, posts and comments in it are removed.`)) return; return act(async () => { await api.post(`/families/${state.fid}/leave`); state.fid = null; boot(); });
    case 'handover': {
      const options = fam().members.filter((m) => m.kind === 'person' && m.status === 'active' && m.id !== fam().me && m.relation !== 'child');
      return openSheet(`<h2>Hand over ${esc(fam().name)}</h2><p class="small muted">They become the family's creator (settings, deleting it). You stay in the family.</p>
        <form id="handoverForm" class="stack"><label>New creator<select name="memberId">${options.map((m) => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label>
        <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Hand over</button></div></form>`);
    }
    case 'newfamily': return openSheet(`<h2>Create another family</h2><form id="famForm" class="stack"><label>Family name<input name="name" required maxlength="40"></label><div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Create</button></div></form>`);
    default:
  }
  if (t.id === 'famSwitch') return show('me');
  if (t.id === 'newPostTop') return show('compose');
  if (t.id === 'bingoTop') { bingo.game = null; return show('bingo'); }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.name === 'photo' && t.files?.[0]) {
    draft.text = $('#postForm textarea')?.value || draft.text;
    draft.photo = await shrinkPhoto(t.files[0]).catch(() => '');
    return compose();
  }
  if (t.name === 'bingofile' && t.files?.[0]) {
    const text = await t.files[0].text();
    let lines;
    try { const j = JSON.parse(text); lines = (Array.isArray(j) ? j : j.squares || []).map((x) => (typeof x === 'string' ? x : x.text || '')); } catch { lines = text.split(/\r?\n/); }
    $('#bingoForm [name=text]').value = lines.map((x) => x.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim()).filter(Boolean).join('\n');
    if (!$('#bingoForm [name=title]').value) $('#bingoForm [name=title]').value = t.files[0].name.replace(/\.[a-z]+$/i, '').replace(/[-_]+/g, ' ');
    return bingoCountLine();
  }
  if (t.name === 'petphoto' && t.files?.[0]) {
    petPhoto = await squarePhoto(t.files[0]).catch(() => { toast("Couldn't read that photo"); return petPhoto; });
    $('#petPhotoBox').innerHTML = petPhotoBox(member($('#petForm').dataset.id));
    return;
  }
  if (t.dataset.careboth != null) { careBoth = t.checked; return; }
  if (t.dataset.sharewhat) {
    const share = { kids: !!document.querySelector('[data-sharewhat=kids]')?.checked, pets: !!document.querySelector('[data-sharewhat=pets]')?.checked };
    return act(async () => { await api.patch(`/families/${state.fid}`, { share }); await loadFamily(); toast(`Friends' families ${share.kids ? 'can' : "can't"} see the kids, ${share.pets ? 'can' : "can't"} see the pets`); });
  }
  if (t.dataset.share) {
    const ids = [...document.querySelectorAll('[data-share]')].filter((x) => x.checked).map((x) => x.dataset.share);
    return act(async () => { await api.patch(`/families/${state.fid}/members/${fam().me}`, { shareWith: ids }); await loadFamily(); toast(ids.length ? 'Sharing updated' : 'Your diet & fitness is private'); });
  }
  if (t.name === 'fid' && t.form?.id === 'connectForm') {
    const nf = t.form.querySelector('[data-newfam]');
    nf.hidden = !!t.value; nf.querySelector('input').required = !t.value;
  }
});

document.addEventListener('submit', (e) => {
  const f = e.target;
  const v = Object.fromEntries(new FormData(f));
  if (f.id === 'chatForm') {
    e.preventDefault();
    f.text.value = ''; f.querySelector('button').disabled = true;
    return ask(v.text || '');
  }
  if (f.id === 'reportForm') {
    e.preventDefault();
    return act(async () => {
      const r = await api.post('/help/report', { ...v, messages: chat.messages.map(({ role, text }) => ({ role, text })), app: { version: VERSION, device: deviceName(), page: state.view } });
      chat.messages.push({ role: 'assistant', text: "Thanks — I've passed that to the app's maintainer.", filed: r.ticket });
      helpView();
    });
  }
  if (f.id === 'demoForm') {
    e.preventDefault();
    return act(async () => { api.setMode('demo'); const s = await api.post('/auth/demo', { ...v, device: deviceName() }); api.setToken(s.token); closeSheet(); state.view = 'feed'; boot(); });
  }
  if (f.id === 'famForm') {
    e.preventDefault();
    const mods = new FormData(f).getAll('mod');
    return act(async () => {
      const r = await api.post('/families', v); state.fid = r.family.fid;
      if (mods.length) await api.patch(`/families/${r.family.fid}`, { modules: mods });
      closeSheet(); toast(`${r.family.name} is ready`); state.view = 'family'; boot();
    });
  }
  if (f.id === 'consentForm') {
    e.preventDefault();
    return act(async () => { await api.post('/account/consent', { version: state.user.termsVersion, age13: !!v.age13 }); boot(); });
  }
  if (f.id === 'famSettings') {
    e.preventDefault();
    return act(async () => { await api.patch(`/families/${state.fid}`, { name: v.name, modules: new FormData(f).getAll('mod'), goldenPosts: !!v.goldenPosts }); await loadFamily(); chrome(true); toast('Saved'); });
  }
  if (f.id === 'seasonForm') {
    e.preventDefault();
    return act(async () => {
      const r = await api.post(`/families/${state.fid}/picks`, { title: v.title, text: v.text, events: v.events.split(/\n/).map((x) => x.trim()).filter(Boolean) });
      closeSheet(); bingo.season = r.season.id; seasonView(); toast('💑 Make your picks — they stay private until something happens');
    });
  }
  if (f.id === 'addCoupleForm') {
    e.preventDefault();
    return act(async () => seasonView(await api.patch(`/families/${state.fid}/picks/${bingo.season}`, { addCouple: { a: v.a, b: v.b } })));
  }
  if (f.id === 'bingoForm') {
    e.preventDefault();
    return act(async () => { const r = await api.post(`/families/${state.fid}/bingo/packs`, { title: v.title, text: v.text }); closeSheet(); toast(`${r.pack.title}: ${r.pack.count} squares saved 🎲`); bingoView(); });
  }
  if (f.id === 'petCallsForm') {
    e.preventDefault();
    return act(async () => { await api.patch(`/families/${state.fid}/members/${fam().me}`, { petCalls: v.petCalls.trim() }); await loadFamily(); toast(v.petCalls.trim() ? `The pets will call you ${v.petCalls.trim()} 🐾` : 'Saved'); });
  }
  if (f.id === 'deleteForm') {
    e.preventDefault();
    return act(async () => {
      const r = await api.post('/account/delete', { confirm: v.confirm.trim() });
      api.setToken(null); LS.set('fam.fid', null); closeSheet(); state.fid = null; state.family = null;
      boot().then(() => toast(`Account deleted${r.familiesHandedOver?.length ? ` · ${r.familiesHandedOver.map((x) => `${x.family} → ${x.to}`).join(', ')}` : ''}`));
    });
  }
  if (f.id === 'deleteFamForm') {
    e.preventDefault();
    return act(async () => { await api.del(`/families/${state.fid}`, { confirm: v.confirm.trim() }); closeSheet(); state.fid = null; toast('Family deleted'); boot(); });
  }
  if (f.id === 'handoverForm') {
    e.preventDefault();
    return act(async () => { await api.post(`/families/${state.fid}/owner`, { memberId: v.memberId }); closeSheet(); await boot(); toast('Handed over'); });
  }
  if (f.id === 'connectForm') {
    e.preventDefault();
    return act(async () => {
      const r = await api.post(`/invites/${state.invite}/accept`, { fid: v.fid || '', familyName: v.familyName });
      LS.set('fam.invite', null); state.invite = null; state.fid = r.family.fid; state.view = 'family';
      toast(`Connected with ${r.connectedTo}`); boot();
    });
  }
  if (f.id === 'personForm') {
    e.preventDefault();
    return act(async () => {
      const r = await api.post(`/families/${state.fid}/members`, { kind: 'person', ...v });
      await loadFamily(); show('family');
      if (r.invite) inviteSheet(r.invite, v.name); else { closeSheet(); toast(`${v.name} added`); }
    });
  }
  if (f.id === 'petForm') {
    e.preventDefault();
    delete v.petphoto;
    if (petPhoto !== undefined) v.avatar = petPhoto;
    return act(async () => {
      if (f.dataset.id) await api.patch(`/families/${state.fid}/members/${f.dataset.id}`, v);
      else await api.post(`/families/${state.fid}/members`, { kind: 'pet', ...v });
      closeSheet(); await loadFamily(); toast(`${v.name} ${f.dataset.id ? 'saved' : 'added'}`);
      show(f.dataset.id ? 'member' : state.view, f.dataset.id);
    });
  }
  if (f.id === 'famInviteForm') {
    e.preventDefault();
    return act(async () => { const r = await api.post(`/families/${state.fid}/invites`, { kind: 'family', ...v }); inviteSheet(r.invite, v.email); });
  }
  if (f.id === 'postForm') {
    e.preventDefault();
    return act(async () => {
      const help = draft.help ? { type: draft.help.type, from: v.from, to: v.to || v.from, time: v.time } : null;
      const r = await api.post(`/families/${state.fid}/posts`, { text: v.text, photo: draft.photo, tags: draft.tags, audience: draft.audience, help });
      draft = { text: '', photo: '', tags: [], audience: 'family' };
      state.view = 'feed'; closeSheet(); state.feed = [r.post, ...state.feed]; show('feed');
      if (r.note) toast(r.note); else if (help) toast(r.post.audience === 'connections' ? 'Asked your family and connected families 🙋' : 'Asked your family 🙋');
    });
  }
  if (f.classList.contains('comment-form')) {
    e.preventDefault();
    const post = f.closest('[data-post]');
    if (!v.text?.trim()) return;
    return act(async () => {
      const r = await api.post(`/posts/${post.dataset.fid}/${post.dataset.post}/comments`, { text: v.text });
      const p = state.feed.find((x) => x.id === post.dataset.post);
      p.comments.push(r.comment); post.outerHTML = postCard(p);
    });
  }
});
$('#sheet').addEventListener('close', () => { if (state.view === 'compose') { draft.text = $('#postForm textarea')?.value ?? draft.text; show('feed'); } });
window.addEventListener('hashchange', () => { if (/invite=/.test(location.hash)) boot(); });

// Errors this phone hits are counted on the connector (message and place only) so the
// maintainer sees glitches nobody reported.
let glitches = 0;
const glitch = (message, where) => { if (glitches++ < 3) api.post('/help/glitch', { message: String(message || '').slice(0, 160), where: String(where || '').replace(location.origin, '').slice(0, 120), version: VERSION }).catch(() => {}); };
window.addEventListener('error', (e) => glitch(e.message, `${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => glitch(e.reason?.message || e.reason, 'promise'));

const wantHelp = new URLSearchParams(location.search).has('help');
if (wantHelp) history.replaceState(null, '', location.pathname + location.hash);
boot().then(() => { if (wantHelp) helpView(); }).catch((err) => { $('#view').innerHTML = `<section class="hero"><h1>Something went wrong</h1><p class="lede">${esc(err.message)}</p><button type="button" data-act="home">Try again</button></section>`; });
document.addEventListener('toggle', (e) => { const c = e.target.closest?.('[data-couple]'); if (c && e.target === c) bingo.open[c.dataset.couple] = c.open; }, true);
document.addEventListener('input', (e) => { if (e.target.closest?.('#bingoForm') && e.target.name === 'text') bingoCountLine(); });

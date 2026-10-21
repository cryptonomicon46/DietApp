// 👨‍👩‍👧 OurPawmily Families (preview): sign in with Google, create a family, invite the people
// in it by email, add pets and kids, a private feed, and who-sees-what for diet & fitness.
// The trackers (food, training, dogs, calendar) stay in the current app for now; their data
// comes over with "Bring over the current app".
import { api } from './api.js';
import { planImport, legacySnapshot, backupBlob, runImport } from './migrate.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const LS = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* blocked */ } } };
const RELATION = { self: 'You', spouse: 'Spouse', partner: 'Partner', child: 'Child', parent: 'Parent', sibling: 'Sibling', grandparent: 'Grandparent', relative: 'Relative', friend: 'Close friend', other: 'Family', pet: 'Pet' };
const SPECIES = { dog: '🐶 Dog', cat: '🐱 Cat', other: '🐾 Other' };
const HUES = [152, 18, 210, 280, 340, 45, 190];

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
  if (m?.avatar?.startsWith?.('http')) return `<img class="av" style="${s}" src="${esc(m.avatar)}" alt="" referrerpolicy="no-referrer">`;
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
async function act(fn) { try { return await fn(); } catch (err) { if (err.status === 401) return boot(); toast(err.message); return null; } }

// ---------- start ----------
async function boot() {
  const m = location.hash.match(/invite=([a-z0-9]{12,40})/);
  if (m) { LS.set('fam.invite', m[1]); history.replaceState(null, '', location.pathname); }
  state.invite = LS.get('fam.invite');
  if (!api.token()) return signIn();
  const r = await api.get('/me').catch((err) => (err.status === 401 ? null : Promise.reject(err)));
  if (!r) return signIn();
  state.user = r.user; state.families = r.families;
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
      <a class="small" href="../">‹ Back to the current app</a>
    </section>`;
  if (cfg.ready) loadGoogle(cfg.googleClientId);
}
function loadGoogle(clientId) {
  const go = () => {
    window.google.accounts.id.initialize({ client_id: clientId, callback: (r) => act(async () => {
      api.setMode('live');
      const s = await api.post('/auth/google', { credential: r.credential });
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
  ({ feed: feedView, family: familyView, pets: petsView, me: meView, member: memberView })[view]?.();
}
const demoBanner = () => (api.mode() === 'demo' ? '<div class="banner">Demo — everything stays on this phone.</div>' : '');

async function feedView() {
  const people = fam().members;
  $('#view').innerHTML = `${demoBanner()}
    <div class="stories">${people.map((m) => `<button type="button" class="story" data-member="${m.id}">${avatar(m, 58)}<span>${esc(m.id === fam().me ? 'You' : m.name)}</span></button>`).join('')}
      <button type="button" class="story add" data-act="addperson"><span class="av plus" style="width:58px;height:58px">＋</span><span>Add</span></button></div>
    <button type="button" class="card composer" data-view="compose">${avatar(me(), 36)}<span>Share something with the family…</span><span class="cam">📷</span></button>
    <div id="posts"><div class="skeleton card"></div><div class="skeleton card"></div></div>`;
  const r = await act(() => api.get('/feed'));
  if (!r) return;
  state.feed = r.posts;
  renderPosts();
}
function renderPosts() {
  const el = $('#posts');
  if (!el) return;
  el.innerHTML = state.feed.length ? state.feed.map(postCard).join('')
    : `<div class="empty card"><div class="big">📸</div><b>No posts yet</b><p class="small muted">Share a photo of the dogs, a win at the gym, or what's for dinner. Only your family${state.connected.length ? ' (and the families you connect with, if you choose)' : ''} can see it.</p><button type="button" data-view="compose">Make the first post</button></div>`;
}
function postCard(p) {
  const author = p.own && p.fid === state.fid ? member(p.by) : null;
  const who = author || { id: p.by, name: p.byName, avatar: p.byAvatar };
  const canDelete = p.own && p.fid === state.fid && (p.by === fam().me || me().role === 'owner');
  const open = state.open[p.id];
  const comments = open ? p.comments : p.comments.slice(-2);
  return `<article class="post card" data-post="${p.id}" data-fid="${p.fid}">
    <header><button type="button" class="who" ${author ? `data-member="${author.id}"` : ''}>${avatar(who, 38)}<span><b>${esc(who.name)}</b><small class="muted">${p.fid !== state.fid ? `${esc(p.familyName)} · ` : ''}${ago(p.at)} · ${p.audience === 'connections' ? '👥 Family & friends' : '🏠 Family'}</small></span></button>
      ${canDelete ? '<button type="button" class="icon-btn" data-act="postmenu" aria-label="Post options">⋯</button>' : ''}</header>
    ${p.photo ? `<img class="photo" src="${p.photo}" alt="" loading="lazy">` : ''}
    <div class="actions"><button type="button" data-act="like" class="${p.liked ? 'liked' : ''}" aria-label="Like">${p.liked ? '❤️' : '🤍'}</button><button type="button" data-act="comment" aria-label="Comment">💬</button>
      <span class="small muted">${p.likes ? `${p.likes} like${p.likes > 1 ? 's' : ''}` : ''}</span></div>
    ${p.text ? `<p class="caption"><b>${esc(who.name)}</b> ${esc(p.text)}</p>` : ''}
    ${p.tags?.length ? `<p class="tags">${p.tags.map((id) => `<button type="button" class="chip" ${member(id) ? `data-member="${id}"` : ''}>${member(id)?.kind === 'pet' ? '🐾' : '👤'} ${esc(p.tagNames?.[id] || member(id)?.name || '')}</button>`).join('')}</p>` : ''}
    ${p.comments.length > 2 && !open ? `<button type="button" class="linkish small" data-act="allcomments">View all ${p.comments.length} comments</button>` : ''}
    <ul class="comments">${comments.map((c) => `<li><b>${esc(c.name)}</b> ${esc(c.text)} <small class="muted">${ago(c.at)}</small></li>`).join('')}</ul>
    <form class="comment-form"><input name="text" maxlength="500" placeholder="Add a comment…" aria-label="Add a comment"><button class="linkish">Post</button></form>
  </article>`;
}

let draft = { text: '', photo: '', tags: [], audience: 'family' };
function compose() {
  const tags = fam().members.filter((m) => m.id !== fam().me);
  openSheet(`<h2>New post</h2>
    <form id="postForm" class="stack">
      <div class="row top">${avatar(me(), 40)}<textarea name="text" rows="4" maxlength="2000" placeholder="What's new with the family?">${esc(draft.text)}</textarea></div>
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
    ${state.connected.length ? `<ul class="card list">${state.connected.map((c) => `<li><div class="member-row static"><span class="stack-av">${c.members.slice(0, 3).map((m) => avatar(m, 30)).join('')}</span><span><b>${esc(c.name)}</b><small class="muted">${c.members.length} members · sees posts you share with connected families</small></span></div></li>`).join('')}</ul>`
      : '<p class="small muted pad">Close friends can have their own family here too. Invite them and your families can share updates — only the posts you choose.</p>'}
    <button type="button" class="ghost wide" data-act="invitefamily">💌 Invite a friend's family</button>`;
}

async function petsView() {
  const pets = fam().members.filter((m) => m.kind === 'pet');
  $('#view').innerHTML = `${demoBanner()}<h3>Pets</h3>${pets.length ? pets.map((p) => `<button type="button" class="card pet-card" data-member="${p.id}">${avatar(p, 64)}<span><b>${esc(p.name)}</b><small class="muted">${esc([p.breed, ageOf(p.born)].filter(Boolean).join(' · ') || SPECIES[p.species] || '')}</small><small class="pet-alerts" data-alerts="${p.id}"></small></span><span class="go">›</span></button>`).join('')
    : '<div class="empty card"><div class="big">🐾</div><b>No pets yet</b><p class="small muted">Add your dogs (or cats) — everyone in the family sees them.</p></div>'}
    <button type="button" class="ghost wide" data-act="addpet">＋ Add a pet</button>
    <p class="small muted pad">Feeding, walks and vet records are still tracked in the current app's Dogs tab. <a href="../">Open it ›</a></p>`;
  for (const p of pets) {
    const d = await api.get(`/families/${state.fid}/members/${p.id}/data`).catch(() => null);
    const el = document.querySelector(`[data-alerts="${p.id}"]`);
    if (el && d?.data?.profile) el.innerHTML = vaccineLine(d.data.profile);
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
  return `<b>About ${esc(m.name)}</b>${body ? `<ul class="kv">${body}</ul>` : '<p class="small muted">Bring over the current app (Me tab) to fill this in, or edit it in the Dogs tab there.</p>'}
    <button type="button" class="linkish small" data-act="editpet" data-id="${m.id}">✎ Edit name, breed, birthday</button>`;
}

function meView() {
  const f = fam(), my = me();
  const others = f.members.filter((m) => m.kind === 'person' && m.id !== my.id && m.status === 'active');
  const hasLegacy = Object.keys(localStorage).some((k) => k.startsWith('lp.p.'));
  $('#view').innerHTML = `${demoBanner()}
    <section class="card profile">${avatar({ ...my, avatar: my.avatar || state.user.picture }, 72)}<h2>${esc(my.name)}</h2><div class="muted small">${esc(state.user.email)} · ${api.mode() === 'demo' ? 'Demo account' : 'Google account'}</div></section>
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
    <section class="card links"><a href="../">📊 Open the trackers (food, training, dogs, calendar) ›</a></section>
    <button type="button" class="ghost wide" data-act="signout">Sign out</button>
    <p class="tiny muted center pad">OurPawmily Families · preview</p>`;
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
function addPet(p = null) {
  openSheet(`<h2>${p ? `Edit ${esc(p.name)}` : 'Add a pet'}</h2>
    <form id="petForm" class="stack" data-id="${p?.id || ''}">
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
  await runImport(api, state.fid, ops, say);
  await loadFamily();
  say('Done. Your partner can claim theirs by accepting an invite — open them under Family and tap "Invite by email".');
}

// ---------- events ----------
document.addEventListener('click', (e) => {
  const t = e.target.closest('button, [data-view], [data-member], [data-fam]');
  if (!t) return;
  const d = t.dataset;
  if (d.view) { e.preventDefault(); return show(d.view); }
  if (d.member) { closeSheet(); return show('member', d.member); }
  if (d.fam) { state.fid = d.fam; return act(async () => { await loadFamily(); show('feed'); }); }
  if (d.tag) { draft.tags = draft.tags.includes(d.tag) ? draft.tags.filter((x) => x !== d.tag) : [...draft.tags, d.tag]; t.classList.toggle('on'); return; }
  if (d.aud) { draft.audience = d.aud; t.parentElement.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b === t)); return; }
  const post = t.closest('[data-post]');
  switch (d.act) {
    case 'close': return closeSheet();
    case 'demo': return demoSignIn();
    case 'home': return boot();
    case 'signout': return act(async () => { await api.post('/auth/logout').catch(() => {}); api.setToken(null); state.family = null; state.view = 'feed'; boot(); });
    case 'addperson': return addPerson();
    case 'addpet': return addPet();
    case 'editpet': return addPet(member(d.id));
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
    case 'allcomments': state.open[post.dataset.post] = true; return renderPosts();
    case 'postmenu': if (!confirm('Delete this post?')) return; return act(async () => {
      await api.del(`/posts/${post.dataset.fid}/${post.dataset.post}`);
      state.feed = state.feed.filter((x) => x.id !== post.dataset.post); renderPosts();
    });
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
    case 'newfamily': return openSheet(`<h2>Create another family</h2><form id="famForm" class="stack"><label>Family name<input name="name" required maxlength="40"></label><div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Create</button></div></form>`);
    default:
  }
  if (t.id === 'famSwitch') return show('me');
  if (t.id === 'newPostTop') return show('compose');
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.name === 'photo' && t.files?.[0]) {
    draft.text = $('#postForm textarea')?.value || draft.text;
    draft.photo = await shrinkPhoto(t.files[0]).catch(() => '');
    return compose();
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
  if (f.id === 'demoForm') {
    e.preventDefault();
    return act(async () => { api.setMode('demo'); const s = await api.post('/auth/demo', v); api.setToken(s.token); closeSheet(); state.view = 'feed'; boot(); });
  }
  if (f.id === 'famForm') {
    e.preventDefault();
    return act(async () => { const r = await api.post('/families', v); state.fid = r.family.fid; closeSheet(); toast(`${r.family.name} is ready`); state.view = 'family'; boot(); });
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
      const r = await api.post(`/families/${state.fid}/posts`, { text: v.text, photo: draft.photo, tags: draft.tags, audience: draft.audience });
      draft = { text: '', photo: '', tags: [], audience: 'family' };
      state.view = 'feed'; closeSheet(); state.feed = [r.post, ...state.feed]; show('feed');
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

boot().catch((err) => { $('#view').innerHTML = `<section class="hero"><h1>Something went wrong</h1><p class="lede">${esc(err.message)}</p><button type="button" data-act="home">Try again</button></section>`; });

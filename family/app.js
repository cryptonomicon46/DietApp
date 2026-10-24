// 👨‍👩‍👧 OurPawmily Families (preview): sign in with Google, create a family, invite the people
// in it by email, add pets and kids, a private feed, and who-sees-what for diet & fitness.
// The trackers (food, training, dogs, calendar) stay in the current app for now; their data
// comes over with "Bring over the current app".
import { api } from './api.js';
import { keys, seal, tryOpen, newKey, makeCheck, checkKey, lockBackup, unlockBackup, newPhrase, keyFromHash, deviceLink, isSealed } from './crypto.js';
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

// ---------- 🔐 end-to-end encryption (keys never leave the family's devices; see crypto.js) ----------
const famKeys = {}; // {familyId: key} on this device, each checked against the family's key check
async function loadKeys() {
  const all = await keys.all();
  for (const f of [...state.families, ...(state.family ? [state.family] : [])]) {
    const k = all[f.fid];
    famKeys[f.fid] = k && (!f.keyCheck || await checkKey(k, f.keyCheck)) ? k : null;
  }
}
const fk = (fid = state.fid) => famKeys[fid] || null;
const lockedHere = () => !!fam()?.e2ee && !fk();
// Lock a value for this family (when this device has its key); unlock what the server sends.
const lock = async (v, fid = state.fid) => (fk(fid) && v ? seal(fk(fid), v) : v);
const unlock = (v, fid = state.fid) => tryOpen(fk(fid), v, null);
const openData = async (rec, fid = state.fid) => { const d = rec?.data || {}; return d.enc == null ? d : (await tryOpen(fk(fid), d.enc, null)) || { locked: true }; };
const sealData = async (data, fid = state.fid) => (fk(fid) ? { enc: await seal(fk(fid), data) } : data);
// A family starts encrypted: a fresh key on this device and a key check on the server.
async function encryptFamily(fid) {
  const k = newKey();
  await keys.set(fid, k);
  famKeys[fid] = k;
  return api.patch(`/families/${fid}`, { e2ee: true, keyCheck: await makeCheck(k) });
}
// A post's key: the family key, or (shared with friends' families) its own key, unlocked through
// the family key or the connection's key.
async function postKey(p) {
  if (!p.pk) return fk(p.fid);
  if (fk(p.fid)) return tryOpen(fk(p.fid), p.pk.fam, null);
  for (const f of state.families) {
    const ck = f.connkeys?.[p.fid] ? await tryOpen(fk(f.fid), f.connkeys[p.fid], null) : null;
    if (ck && p.pk.conns?.[f.fid]) return tryOpen(ck, p.pk.conns[f.fid], null);
  }
  return null;
}
async function openPost(p) {
  const k = await postKey(p);
  const o = (v) => tryOpen(k, v, null);
  const text = await o(p.text), photo = await o(p.photo);
  const comments = await Promise.all((p.comments || []).map(async (c) => ({ ...c, text: (await o(c.text)) ?? '🔒' })));
  const help = p.help ? { ...p.help, offers: await Promise.all((p.help.offers || []).map(async (x) => ({ ...x, msg: (await o(x.msg)) ?? '' }))) } : p.help;
  return { ...p, text: text ?? '', photo: photo ?? '', comments, help, locked: text === null || photo === null, _key: k };
}
// What only family members can read on an appointment: where, notes, how it went.
const openAppt = async (a) => ({ ...a, place: (await unlock(a.place)) ?? '🔒', notes: (await unlock(a.notes)) ?? '', outcome: (await unlock(a.outcome)) ?? '' });
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
  if (m) {
    // An invite can carry the family key (k) or the connection key (ck), after the "#".
    LS.set('fam.invite', m[1]);
    LS.set('fam.inviteKey', location.hash.match(/[#&]k=([A-Za-z0-9_-]{43})/)?.[1] || null);
    LS.set('fam.inviteCk', location.hash.match(/[#&]ck=([A-Za-z0-9_-]{43})/)?.[1] || null);
    history.replaceState(null, '', location.pathname);
  }
  // "Add a device": the family key, straight into this device's key store.
  const dk = keyFromHash(location.hash);
  if (dk) { await keys.set(dk.fid, dk.key); history.replaceState(null, '', location.pathname); state.fid = dk.fid; state.keyAdded = true; }
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
  const hv = location.hash.match(/^#(feed|dogs|calendar|me)$/)?.[1];
  if (hv) { state.view = hv === 'dogs' ? 'pets' : hv; history.replaceState(null, '', location.pathname + location.search); }
  show(state.view === 'member' && !member(state.memberId) ? 'feed' : state.view);
  refreshPush();
}
async function loadFamily() {
  const r = await api.get(`/families/${state.fid}`);
  state.family = r.family; state.connected = r.connected;
  LS.set('fam.fid', state.fid);
  await loadKeys();
  if (state.keyAdded) { state.keyAdded = false; setTimeout(() => toast(fk() ? '🔐 This device can now read your family' : "That link's key doesn't match this family"), 400); }
  lockMyData().catch(() => {});
}
// Once the family is encrypted: lock anything of yours still stored readable (e.g. data saved
// before this device had the key).
async function lockMyData() {
  if (!fam().e2ee || !fk() || state.lockedMine === state.fid) return;
  state.lockedMine = state.fid;
  const rec = await api.get(`/families/${state.fid}/members/${fam().me}/data`).catch(() => null);
  if (rec?.data && rec.data.enc == null && Object.keys(rec.data).length) await api.put(`/families/${state.fid}/members/${fam().me}/data`, { data: await sealData(rec.data) });
}
function chrome(on) {
  $('#bar').hidden = !on; $('#nav').hidden = !on;
  const lb = $('#lockBanner');
  if (lb) {
    lb.hidden = !(on && lockedHere());
    lb.innerHTML = `<span>🔒 <b>${esc(fam()?.name || 'This family')} is end-to-end encrypted</b> and this device doesn't have its key yet, so posts and private details show as locked.</span>
      <span class="row wrap"><button type="button" class="small" data-act="keylink">Use a link from my phone</button><button type="button" class="ghost small" data-act="keyrestore">Use my recovery phrase</button></span>`;
  }
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
  if (view !== 'compose') state.prevView = view;
  state.view = view;
  if (view === 'member') state.memberId = extra;
  if (view === 'compose') { state.view = state.prevView || 'feed'; return plusMenu(); }
  chrome(true);
  document.querySelectorAll('#nav [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === (view === 'member' || view === 'family' ? 'me' : view)));
  window.scrollTo(0, 0);
  if (view !== 'bingo') clearInterval(bingo.timer);
  ({ feed: feedView, family: familyView, pets: petsView, me: meView, member: memberView, bingo: bingoView, calendar: calendarView })[view]?.();
}
const demoBanner = () => (api.mode() === 'demo' ? '<div class="banner">Demo — everything stays on this phone.</div>' : '');

async function feedView() {
  $('#view').innerHTML = `${demoBanner()}
    <section class="card today" id="today"><div class="skeleton line"></div></section>
    <section class="feelhero" id="feel"><div class="skeleton line"></div></section>
    <div id="usNotes"></div>
    <div id="comingLine"></div>
    <div id="goldNews"></div>
    <div id="posts"><div class="skeleton card"></div><div class="skeleton card"></div></div>`;
  goldNews();
  importUs().catch(() => {});
  const [r] = await Promise.all([act(() => api.get('/feed')), loadAppts(), loadUs()]);
  renderFeel(); renderNotes(); renderToday(); renderComingLine();
  if (!r) return;
  state.feed = await Promise.all(r.posts.map(openPost));
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
// A vaccination done: on each dog's record, given that day and next due when the vet said.
async function recordVaccine(a, given, due) {
  for (const pid of a.pets) {
    const rec = await api.get(`/families/${state.fid}/members/${pid}/data`).catch(() => null);
    const data = await openData(rec);
    if (data.locked) continue;
    const prof = { ...(data.profile || {}) };
    const vax = [...(prof.vaccines || [])];
    const i = vax.findIndex((x) => x.name?.trim().toLowerCase() === a.vaccine.toLowerCase());
    const entry = { ...(i >= 0 ? vax[i] : { name: a.vaccine }), given, due: due || given };
    if (i >= 0) vax[i] = entry; else vax.push(entry);
    const now = Date.now();
    prof.vaccines = vax; prof.times = { ...(prof.times || {}), vaccines: now }; prof.updatedAt = now;
    await api.put(`/families/${state.fid}/members/${pid}/data`, { data: await sealData({ ...data, profile: prof }) });
  }
}
// After any change to an appointment: refresh whichever screen shows them.
async function apptChanged() {
  await loadAppts();
  if (state.view === 'pets') {
    renderComing(); renderVax(); renderSpend();
    // A finished vaccination changes the dog's record: show the new due date.
    for (const p of dogsOf()) dogsHub.profiles[p.id] = (await openData(await api.get(`/families/${state.fid}/members/${p.id}/data`).catch(() => null)))?.profile || dogsHub.profiles[p.id];
    renderVax();
    const cards = $('#dogcards');
    if (cards) cards.innerHTML = dogsOf().map((p) => dogCard(p)).join('');
  }
  if (state.view === 'feed') renderPosts();
}
// A dog appointment someone added: live, so whoever's free can take the open leg from here.
function apptPost(p) {
  const a = dogsHub.appts.find((x) => x.id === p.appt);
  return `<article class="post card appt-post" data-post="${p.id}" data-fid="${p.fid}">
    <header><span class="who">${avatar(member(p.by) || { name: p.byName }, 38)}<span><b>${esc(p.by === fam().me ? 'You' : p.byName)}</b><small class="muted">added a dog appointment · ${ago(p.at)}</small></span></span><button type="button" class="icon-btn" data-act="postmenu" aria-label="Post options">⋯</button></header>
    ${a ? apptRow(a, { feed: true }) : '<p class="small muted">This appointment was removed.</p>'}
    ${a ? `<button type="button" class="linkish small" data-apptopen="${a.id}">Open in Dogs &amp; chores ›</button>` : ''}
  </article>`;
}
function postCard(p) {
  if (p.appt) return apptPost(p);
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
    ${p.locked ? '<p class="caption muted">🔒 Locked on this device</p>' : ''}
    ${p.tags?.length ? `<p class="tags">${p.tags.map((id) => `<button type="button" class="chip" ${member(id) ? `data-member="${id}"` : ''}>${(member(id)?.kind || p.tagKinds?.[id]) === 'pet' ? '🐾' : '👤'} ${esc(p.tagNames?.[id] || member(id)?.name || '')}</button>`).join('')}</p>` : ''}
    ${p.comments.length > 2 && !open ? `<button type="button" class="linkish small" data-act="allcomments">View all ${p.comments.length} comments</button>` : ''}
    <ul class="comments">${comments.map((c) => `<li><b>${esc(c.name)}</b> ${esc(c.text)} <small class="muted">${ago(c.at)}</small></li>`).join('')}</ul>
    ${p.locked ? '' : '<form class="comment-form"><input name="text" maxlength="500" placeholder="Add a comment…" aria-label="Add a comment"><button class="linkish">Post</button></form>'}
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

// 🐾 Dogs & chores: appointments, vaccines, the best time to walk, today's log, each dog, how
// happy they are, spending, the house and the Gold Card — everything about the dogs in one place.
const APPT = { groom: ['✂️', 'Grooming'], vet: ['🩺', 'Vet visit'], vaccine: ['💉', 'Vaccination'], dental: ['🦷', 'Dental'], boarding: ['🏨', 'Boarding / daycare'], other: ['📌', 'Other'] };
const VACCINES = ['Rabies', 'DHPP', 'Bordetella', 'Leptospirosis', 'Canine influenza', 'Lyme'];
const dogsHub = { appts: [], spending: null, profiles: {} };
const dogsOf = () => fam().members.filter((m) => m.kind === 'pet');
const whenText = (at) => { if (!at) return ''; const d = new Date(at.length === 10 ? `${at}T12:00` : at); return d.toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(at.length > 10 ? { hour: 'numeric', minute: '2-digit' } : {}) }); };
const timeText = (at) => (at && at.length > 10 ? new Date(at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
const who = (id) => (id === fam().me ? 'You' : member(id)?.name || '');
const daysTo = (d) => Math.round((Date.parse(`${d}T12:00:00`) - Date.parse(`${isoLocal()}T12:00:00`)) / 864e5);
async function loadAppts() {
  const r = await api.get(`/families/${state.fid}/appts?today=${isoLocal()}`).catch(() => null);
  if (r) { dogsHub.appts = await Promise.all(r.appts.map(openAppt)); dogsHub.spending = r.spending; }
  return dogsHub.appts;
}
async function petsView() {
  const mods = fam().modules || [];
  const dogs = mods.includes('dogs');
  $('#view').innerHTML = `${demoBanner()}
    ${dogs ? `<section class="card" id="coming"><div class="skeleton line"></div></section>
    <section class="card" id="vax" hidden></section>
    <section class="card walkcard" id="walk"><div class="skeleton line"></div></section>` : ''}
    <section class="card care" id="care"><div class="skeleton line"></div></section>
    ${dogs ? `<h3>The dogs</h3><div class="dogcards" id="dogcards">${dogsOf().map((p) => dogCard(p)).join('')}</div>
    <button type="button" class="ghost wide" data-act="addpet">＋ Add a pet</button>
    <h3>How happy are the dogs</h3><section class="card" id="happy"><div class="skeleton line"></div></section>
    <section class="card" id="spend" hidden></section>` : ''}
    <section class="card gold" id="race"><div class="skeleton line"></div></section>
    <section id="fame"></section>
    ${dogs ? '<section class="card small"><a href="../#adopt">🐾 Adoption board ›</a></section>' : ''}`;
  renderCare(); renderRace();
  if (!dogs) return;
  renderWalk();
  await loadAppts();
  renderComing();
  await Promise.all(dogsOf().map(async (p) => { dogsHub.profiles[p.id] = (await openData(await api.get(`/families/${state.fid}/members/${p.id}/data`).catch(() => null)))?.profile || {}; }));
  const cards = $('#dogcards');
  if (cards) cards.innerHTML = dogsOf().map((p) => dogCard(p)).join('');
  renderVax(); renderSpend(); renderHappy();
}
function dogCard(p) {
  const d = dogsHub.profiles[p.id] || {};
  const alert = dogAlert(p, d);
  return `<button type="button" class="dogcard" data-member="${p.id}">${avatar(p, 54)}<b>${esc(p.name)}</b>
    <small class="muted">${esc([p.breed, ageOf(p.born), d.weightLb ? `${d.weightLb} lb` : ''].filter(Boolean).join(' · '))}</small>
    ${d.food?.brand || d.food?.amount ? `<small>🍖 ${esc([d.food.brand, d.food.amount].filter(Boolean).join(' · '))}</small>` : ''}
    ${alert ? `<small class="tone-warn">${alert}</small>` : ''}</button>`;
}
// The most urgent thing about a dog: a vaccine due within 45 days, or a meds refill within a week.
function dogAlert(p, d) {
  const out = [];
  for (const v of d.vaccines || []) if (v.due) { const n = daysTo(v.due); if (n <= 45) out.push([n, n < 0 ? `💉 ${esc(v.name)} overdue` : `💉 ${esc(v.name)} due in ${n} day${n === 1 ? '' : 's'}`]); }
  for (const m of d.meds || []) if (m.refill && m.active !== false) { const n = daysTo(m.refill); if (n <= 7) out.push([n, n < 0 ? `💊 ${esc(m.name)} refill late` : `💊 ${esc(m.name)} refill in ${n} day${n === 1 ? '' : 's'}`]); }
  return out.sort((a, b) => a[0] - b[0])[0]?.[1] || '';
}
function apptRow(a, { feed = false } = {}) {
  const [ico, label] = APPT[a.type] || APPT.other;
  const pets = a.pets.map((id) => member(id)?.name).filter(Boolean).join(' & ');
  const leg = (k, icon, name) => {
    const at = a[`${k}At`], by = a[`${k}By`];
    if (!at) return '';
    return by ? `<span class="leg">${icon} ${name} ${timeText(at) || whenText(at)} · ${esc(who(by))}</span>`
      : `<button type="button" class="leg open" data-claim="${k}" data-appt="${a.id}">${icon} ${name} ${timeText(at) || whenText(at)} · who? Tap to take it</button>`;
  };
  const d = new Date((a.dropAt || a.pickAt).slice(0, 10) + 'T12:00');
  return `<div class="appt ${a.status === 'done' ? 'done' : ''}" ${feed ? '' : `data-apptopen="${a.id}"`}>
    <div class="date">${d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase()}<b>${d.getDate()}</b>${d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()}</div>
    <div><b>${ico} ${esc(label)}${a.vaccine ? ` (${esc(a.vaccine)})` : ''} · ${esc(pets)}</b>
      <div class="small muted">${esc([a.place, a.repeatWeeks ? `every ${a.repeatWeeks} weeks` : '', a.status === 'done' ? `done ✓${a.cost ? ` · $${a.cost}` : ''}` : ''].filter(Boolean).join(' · '))}</div>
      ${a.notes ? `<div class="small">“${esc(a.notes)}”</div>` : ''}
      ${a.status === 'done' ? '' : `<div class="legs">${a.dropAt && a.pickAt && a.dropBy && a.dropBy === a.pickBy ? `<span class="leg">🚗 Drop-off &amp; pick-up · ${esc(who(a.dropBy))}</span>` : `${leg('drop', '🚗', 'Drop-off')}${leg('pick', '🏁', 'Pick-up')}`}</div>`}</div></div>`;
}
function renderComing() {
  const el = $('#coming');
  if (!el) return;
  const up = dogsHub.appts.filter((a) => a.status !== 'done');
  el.innerHTML = `<div class="row between"><b>📅 Coming up</b><button type="button" class="linkish small" data-act="apptnew">＋ Appointment</button></div>
    ${up.length ? up.slice(0, 6).map((a) => apptRow(a)).join('') : '<p class="small muted">No appointments. Add grooming, the vet or a vaccination — with who drops off and who picks up.</p>'}`;
}
function renderVax() {
  const el = $('#vax');
  if (!el) return;
  const rows = [];
  for (const p of dogsOf()) {
    const d = dogsHub.profiles[p.id] || {};
    for (const v of d.vaccines || []) {
      if (!v.due) continue;
      const n = daysTo(v.due);
      if (n > 60) continue;
      const booked = dogsHub.appts.some((a) => a.status !== 'done' && a.type === 'vaccine' && a.pets.includes(p.id) && a.vaccine?.toLowerCase() === v.name.toLowerCase());
      rows.push([n, `<li>${avatar(p, 24)} <b>${esc(p.name)}</b> · <span class="tone-warn">${esc(v.name)} ${n < 0 ? 'overdue' : `due in ${n} day${n === 1 ? '' : 's'}`}</span> ${booked ? '<span class="muted">· booked ✓</span>' : `<button type="button" class="ghost small" data-book="${p.id}" data-vaccine="${esc(v.name)}">📅 Book it</button>`}</li>`]);
    }
  }
  // The dates (just pet and day) go to the connector for the 9 AM "due next week" reminders.
  const due = dogsOf().flatMap((p) => (dogsHub.profiles[p.id]?.vaccines || []).filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v.due || '')).map((v) => ({ pet: p.id, due: v.due }))).sort((a, b) => (a.pet + a.due).localeCompare(b.pet + b.due));
  if (JSON.stringify(due) !== LS.get(`fam.vaxdue.${state.fid}`)) api.put(`/families/${state.fid}/vaxdue`, { due }).then(() => LS.set(`fam.vaxdue.${state.fid}`, JSON.stringify(due))).catch(() => {});
  el.hidden = !rows.length;
  el.innerHTML = `<b>💉 Vaccines</b><ul class="list vaxlist">${rows.sort((a, b) => a[0] - b[0]).map((r) => r[1]).join('')}</ul>`;
}
function renderSpend() {
  const el = $('#spend'), s = dogsHub.spending;
  if (!el || !s) return;
  el.hidden = !s.total;
  el.innerHTML = `<div class="row between"><b>💰 Dog spending ${isoLocal().slice(0, 4)}</b><b class="pts-big">$${Math.round(s.total).toLocaleString()}</b></div>
    <p class="tiny muted">${Object.entries(s.byType).map(([k, v]) => `${APPT[k]?.[1] || k} $${Math.round(v).toLocaleString()}`).join(' · ')} · from costs you add when an appointment is done</p>`;
}
async function renderHappy() {
  const el = $('#happy');
  if (!el) return;
  const s = await api.get(`/families/${state.fid}/dogstats?today=${isoLocal()}`).catch(() => null);
  if (!s || !$('#happy')) return;
  const max = Math.max(1, ...s.months.map((m) => m.golden));
  el.innerHTML = `<div class="stats3"><div><b>${s.month.golden}</b>golden days<br>this month</div><div><b>${s.streak}${s.streak > 1 ? '🔥' : ''}</b>day streak</div><div><b>${s.month.walks}</b>outings<br>this month</div></div>
    <div class="months" aria-label="Golden days by month">${s.months.map((m) => `<i title="${monthName(m.ym)}: ${m.golden} golden days" style="opacity:${m.golden ? 0.3 + 0.7 * (m.golden / max) : 1}" class="${m.golden ? '' : 'e'}"></i>`).join('')}</div>
    <p class="tiny muted">⭐ A golden day = two outings, or one plus a treat. The strip is the last 12 months.</p>`;
}
// 🦮 When to walk: the trackers' weather scoring (San Jose), and how hot the pavement gets.
// Today's walk weather (cached 30 minutes): the best hour, the hottest pavement, the hourly strip.
async function walkWeather() {
  const B = await import('../js/brief.js');
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem('fam.weather') || 'null'); } catch { /* none */ }
  if (!cached || Date.now() - cached.at > 30 * 60000) {
    const u = B.weatherUrls(B.PLACE);
    const [f, air] = await Promise.all([fetch(u.forecast).then((r) => r.json()), fetch(u.air).then((r) => (r.ok ? r.json() : null)).catch(() => null)]);
    cached = { at: Date.now(), f, air };
    try { localStorage.setItem('fam.weather', JSON.stringify(cached)); } catch { /* full */ }
  }
  const hourly = B.parseWeather(cached.f, cached.air);
  const now = new Date();
  const from = Math.max(0, hourly.findIndex((h) => h.time > now) - 1);
  const w = B.dogWalks(hourly, from), hot = B.hottestPavement(hourly, from);
  const pick = [w.morning, w.evening].filter(Boolean).sort((a, b) => b.score - a.score)[0];
  const hr = (i) => hourly[i].time.toLocaleTimeString(undefined, { hour: 'numeric' }).replace(' ', '').toLowerCase();
  return { B, hourly, now, from, w, hot, pick, hr };
}
async function renderWalk() {
  const el = $('#walk');
  if (!el) return;
  try {
    const { B, hourly, now, from, w, hot, pick, hr } = await walkWeather();
    const strip = hourly.slice(from, from + 14).filter((h) => h.time.getHours() >= 6 && h.time.getHours() <= 21).slice(0, 8);
    const cls = (s) => (s >= 80 ? 'g' : s >= 60 ? 'ok2' : s >= 40 ? 'meh' : 'bad');
    const other = [w.morning, w.evening].filter((x) => x && x !== pick)[0];
    el.innerHTML = `<div class="row between"><b>🦮 Best time to walk ${now.getHours() >= 21 ? 'tomorrow' : 'today'}</b><span class="small muted">${esc(B.PLACE.name)}</span></div>
      ${pick ? `<div class="best">${hr(pick.index)}–${hr(pick.index + 1)} <span class="small muted">· ${Math.round(hourly[pick.index].temp)}°</span></div>` : ''}
      <div class="hours">${strip.map((h) => `<div class="hr ${cls(B.scoreHour(h, 'dog').score)}">${h.time.toLocaleTimeString(undefined, { hour: 'numeric' }).replace(' ', '').toLowerCase()}</div>`).join('')}</div>
      ${hot && hot.asphalt >= 125 ? `<div class="tone-warn small">🔥 Pavement ~${Math.round(hot.asphalt)}°F around ${hr(hot.index)} — too hot for paws. Grass or shade then.</div>` : ''}
      ${other ? `<p class="tiny muted">Also good: ${hr(other.index)}</p>` : ''}`;
  } catch { el.innerHTML = '<b>🦮 Best time to walk</b><p class="small muted">Weather is unavailable right now.</p>'; }
}
// ＋ Dog appointment (new, or editing one).
function apptSheet(a = null, pre = {}) {
  const v = a || { type: pre.type || 'groom', pets: pre.pets || dogsOf().filter((p) => p.species === 'dog').map((p) => p.id), vaccine: pre.vaccine || '', dropBy: fam().me, pickBy: '', repeatWeeks: 0, remind: ['day'] };
  const people = fam().members.filter((m) => m.kind === 'person' && m.status !== 'managed');
  const drivers = (sel) => `<option value="">Anyone</option>${people.map((p) => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.id === fam().me ? 'You' : p.name)}</option>`).join('')}`;
  openSheet(`<h2>${a ? 'Edit appointment' : '＋ Dog appointment'}</h2>
    <form id="apptForm" class="stack" data-id="${a?.id || ''}">
      <div class="seg2 radios">${Object.entries(APPT).map(([k, [ico, label]]) => `<label><input type="radio" name="type" value="${k}" ${v.type === k ? 'checked' : ''}><span>${ico} ${label}</span></label>`).join('')}</div>
      <fieldset class="chips plain"><legend>Who's going</legend>${dogsOf().map((p) => `<label class="chipcheck"><input type="checkbox" name="pets" value="${p.id}" ${v.pets.includes(p.id) ? 'checked' : ''}><span>🐾 ${esc(p.name)}</span></label>`).join('')}</fieldset>
      <label class="vaxonly" ${v.type === 'vaccine' ? '' : 'hidden'}>Which vaccine<input name="vaccine" list="vaxlist" value="${esc(v.vaccine)}"><datalist id="vaxlist">${VACCINES.map((x) => `<option value="${x}">`).join('')}</datalist></label>
      <label>Where<input name="place" maxlength="80" value="${esc(v.place || '')}" placeholder="e.g. Wag N' Wash, Willow Glen"></label>
      <div class="two"><label>🚗 Drop-off<input type="datetime-local" name="dropAt" value="${esc(v.dropAt || '')}"></label><label>Driver<select name="dropBy">${drivers(v.dropBy)}</select></label></div>
      <div class="two"><label>🏁 Pick-up<input type="datetime-local" name="pickAt" value="${esc(v.pickAt || '')}"></label><label>Driver<select name="pickBy">${drivers(v.pickBy)}</select></label></div>
      <label>Repeat<select name="repeatWeeks">${[[0, 'Never'], [4, 'Every 4 weeks'], [6, 'Every 6 weeks'], [8, 'Every 8 weeks'], [12, 'Every 3 months']].map(([n, t]) => `<option value="${n}" ${+v.repeatWeeks === n ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
      <label>Notes<textarea name="notes" rows="2" maxlength="300">${esc(v.notes || '')}</textarea></label>
      <p class="tiny muted">On the family 📅 calendar (drop-off and pick-up) and the feed. Only your family sees it. Leave a driver as "Anyone" and whoever's free taps to take it.</p>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>${a ? 'Save' : 'Add'}</button></div>
    </form>`);
}
// An appointment: take or give up a leg, edit, mark done (cost; a vaccine's next due date), remove.
function apptDetail(a) {
  const mine = (k) => a[`${k}By`] === fam().me;
  // The next shot, counted from the appointment (rabies and DHPP every 3 years, the rest yearly).
  const vaxDue = a.type === 'vaccine' && a.vaccine ? (() => { const y = { rabies: 3, dhpp: 3 }[a.vaccine.toLowerCase()] || 1; const d = new Date(`${(a.dropAt || a.pickAt).slice(0, 10)}T12:00`); d.setFullYear(d.getFullYear() + y); return isoLocal(d); })() : '';
  openSheet(`<div class="row between"><h2>${(APPT[a.type] || APPT.other)[0]} ${esc((APPT[a.type] || APPT.other)[1])}</h2><button type="button" class="linkish small" data-act="close">Done</button></div>
    ${apptRow(a, { feed: true })}
    ${a.status === 'done' ? `<p class="small">✓ Done ${esc(a.doneAt || '')}${a.cost ? ` · $${a.cost}` : ''}${a.outcome ? ` · “${esc(a.outcome)}”` : ''}</p><button type="button" class="ghost small" data-apptundone="${a.id}">Not done after all</button>`
      : `<div class="row wrap">${['drop', 'pick'].filter((k) => a[`${k}At`]).map((k) => `<button type="button" class="ghost small" data-claim="${k}" data-appt="${a.id}" ${mine(k) ? 'data-release="1"' : ''}>${mine(k) ? `Give up the ${k === 'drop' ? 'drop-off' : 'pick-up'}` : `🙋 I'll do the ${k === 'drop' ? 'drop-off' : 'pick-up'}`}</button>`).join('')}
        <button type="button" class="ghost small" data-apptedit="${a.id}">✎ Edit</button></div>
      <form id="apptDoneForm" class="stack card" data-id="${a.id}"><b>✓ Mark it done</b>
        <div class="two"><label>Cost ($)<input name="cost" type="number" min="0" step="0.01" inputmode="decimal" placeholder="optional"></label><label>Date<input name="date" type="date" value="${esc((a.dropAt || a.pickAt).slice(0, 10))}"></label></div>
        ${a.type === 'vaccine' ? `<label>${esc(a.vaccine || 'Vaccine')} next due<input name="nextDue" type="date" value="${vaxDue}"></label>` : ''}
        <label>How did it go? (optional)<input name="outcome" maxlength="300"></label>
        <button>✓ Done${a.repeatWeeks ? ` · next one in ${a.repeatWeeks} weeks` : ''}</button></form>`}
    <button type="button" class="linkish small danger" data-apptdel="${a.id}">Remove this appointment</button>`);
}
// 🐾 Today's dog care, shared by the whole family: tap what you did; 👫 logs it for both of you.
let careBoth = false, careToday = [];
async function renderCare() {
  const el = $('#care');
  if (!el) return;
  const today = isoLocal();
  const r = await act(() => api.get(`/families/${state.fid}/care?to=${today}&days=7`));
  if (!r) return;
  const list = r.days[today] || [];
  careToday = list;
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
    ${mods.includes('chores') ? (() => {
      // The house folds away (remembered on this phone); its taps still count for the Gold Card.
      const done = HOUSE_KINDS.reduce((n, k) => n + count(k), 0);
      const open = LS.get('fam.houseOpen') !== '0';
      return `<details class="house" data-house ${open ? 'open' : ''}><summary class="care-sec">🏠 The house <span class="muted">${done ? `· ${done} done today` : ''}</span><span class="fold">${open ? 'Hide' : 'Show'}</span></summary>${grid(HOUSE_KINDS)}</details>`;
    })() : ''}
    ${adults.length > 1 ? `<label class="switch-row small both"><span>👫 Log for both of us</span><input type="checkbox" data-careboth ${careBoth ? 'checked' : ''}><i class="switch"></i></label>` : ''}
    ${list.length ? `<ul class="care-log">${list.slice().reverse().map((e) => `<li><span>${CARE[e.kind]?.[0] || ''} ${esc(CARE[e.kind]?.[1] || e.kind)} · <b>${esc(e.byName)}</b> <small class="muted">${new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small></span>${e.by.includes(fam().me) || me().role === 'owner' ? `<span class="care-acts">${adults.length > 1 ? (e.by.length > 1 ? `<button type="button" class="linkish small" data-careboth-entry="${e.id}" data-solo="1">Just me</button>` : `<button type="button" class="linkish small" data-careboth-entry="${e.id}">👫 Both</button>`) : ''}<button type="button" class="linkish small" data-careundo="${e.id}">Undo</button></span>` : ''}</li>`).join('')}</ul>`
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
    const rec = await api.get(`/families/${state.fid}/members/${m.id}/data`);
    const data = await openData(rec), savedAt = rec.savedAt;
    el.innerHTML = data.locked ? '<div class="locked">🔒 <b>Locked on this device</b><p class="small muted">This device needs the family key to show it.</p></div>'
      : m.kind === 'pet' ? petDetails(m, data) : healthCard(m, data, savedAt, self);
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
    <h3 class="row between"><span>👨‍👩‍👧 ${esc(f.name)}</span><button type="button" class="linkish small" data-view="family">Manage ›</button></h3>
    <section class="card"><ul class="list">${f.members.map((x) => `<li><button type="button" class="member-row" data-member="${x.id}">${avatar(x, 34)}<span><b>${esc(x.id === my.id ? 'You' : x.name)}</b><small class="muted">${esc(relLabel(x))}${x.status === 'invited' ? ' · invited' : ''}</small></span><span class="go">›</span></button></li>`).join('')}</ul>
      <div class="row wrap"><button type="button" class="ghost small" data-act="addperson">＋ Person</button><button type="button" class="ghost small" data-act="addpet">＋ Pet</button><button type="button" class="ghost small" data-view="family">💌 Invite a friend's family</button></div></section>
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
  api.get('/account/sessions').then((r) => {
    const el = $('#sessions');
    if (el) el.innerHTML = `<b>Signed in on</b><ul class="list">${r.sessions.slice().reverse().map((x) => `<li class="row between"><span>${esc(x.device || 'A device')}${x.current ? ' <span class="pill">This one</span>' : ''}</span><small>${ago(x.at)}</small></li>`).join('')}</ul>`;
  }).catch(() => {});
}

// ---------- 💞 just us: feeling like, notes, the Today card, the ＋ menu ----------
const KINDS = {
  dinner: ['🍽️', 'Dinner', 'Anything special? (optional)', 'Where?'], movie: ['🍿', 'Movie', 'Which movie?', 'Theater (optional)'],
  show: ['📺', 'Watch a show', 'Which show?', ''], brunch: ['🥞', 'Brunch', 'Anything special? (optional)', 'Where?'],
  lunch: ['🥗', 'Lunch', 'Anything special? (optional)', 'Where?'], coffee: ['☕', 'Coffee', '', 'Where?'],
  walk: ['🚶', 'Walk / hike', '', 'Where?'], workout: ['🏋️', 'Work out together', 'What? e.g. a run', 'Where? (optional)'],
  other: ['✨', 'Something else', 'What are you feeling like?', 'Where? (optional)'],
};
const WHENS = { tonight: 'Tonight', today: 'Today', tomorrow: 'Tomorrow', weekend: 'This weekend', date: 'Pick a day' };
const ANSWERS = { in: "🙌 I'm in", maybe: '🤔 Maybe', later: '⏰ Another time' };
const NOTE_COLORS = ['yellow', 'pink', 'blue', 'green', 'peach'];
const NOTE_EMOJI = ['❤️', '😘', '🥰', '🐶', '☕', '🍕', '🌙', '✨', '🙏', '😂'];
// The day a plan is for (as the trackers worked it out): tonight/today = that day, weekend = Saturday.
function planDayOf(when, made, day) {
  if (when === 'date' && /^\d{4}-\d{2}-\d{2}$/.test(day || '')) return day;
  const d = new Date(`${made}T12:00:00`);
  if (when === 'tomorrow') d.setDate(d.getDate() + 1);
  if (when === 'weekend') d.setDate(d.getDate() + ((6 - d.getDay() + 7) % 7));
  return isoLocal(d);
}
const us = { plans: [], notes: [], partner: null, streak: 0, theirStreak: 0 };
async function loadUs() {
  const r = await api.get(`/families/${state.fid}/us?today=${isoLocal()}`).catch(() => null);
  if (!r) return;
  // 🔐 Unlocked here: what it is, where, when, the note.
  us.plans = await Promise.all(r.plans.map(async (p) => ({ ...p, ...((await unlock(p.body)) || { kind: 'other', what: '🔒', locked: true }) })));
  us.notes = await Promise.all(r.notes.map(async (n) => ({ ...n, ...((await unlock(n.body)) || { text: '🔒', color: 'yellow' }) })));
  Object.assign(us, { partner: r.partner, streak: r.streak, theirStreak: r.theirStreak });
}
const partnerName = () => us.partner?.name || 'your partner';
// Still ahead (a weekend plan through Sunday), and not done.
const isUpcoming = (p) => !p.done && (p.weekend ? shiftLocal(p.day, 1) >= isoLocal() : p.day >= isoLocal());
const shiftLocal = (d, n) => { const x = new Date(`${d}T12:00:00`); x.setDate(x.getDate() + n); return isoLocal(x); };
function planWhen(p) {
  const t = p.time ? ` · ${new Date(`2000-01-01T${p.time}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : '';
  if (p.weekend) return `This weekend${t}`;
  if (p.day === isoLocal()) return `${p.when === 'tonight' ? 'Tonight' : 'Today'}${t}`;
  if (p.day === shiftLocal(isoLocal(), 1)) return `Tomorrow${t}`;
  return `${new Date(`${p.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${t}`;
}
const planTitle = (p) => `${(KINDS[p.kind] || KINDS.other)[1]}${p.what ? `: ${p.what}` : ''}`;
// The ✨ card: one-tap kinds, what's waiting for your answer, what you sent, what's agreed, recaps.
function renderFeel() {
  const el = $('#feel');
  if (!el) return;
  if (!us.partner && !us.plans.length) { el.hidden = true; return; }
  el.hidden = false;
  const up = us.plans.filter(isUpcoming).sort((a, b) => a.day.localeCompare(b.day) || (a.time || '').localeCompare(b.time || ''));
  const toMe = up.filter((p) => p.by !== fam().me && !p.replies?.[fam().me]);
  const agreed = up.filter((p) => p.agreed);
  const mineWaiting = up.filter((p) => p.by === fam().me && !p.agreed);
  const past = us.plans.filter((p) => !isUpcoming(p)).sort((a, b) => b.day.localeCompare(a.day)).slice(0, 6);
  const map = (p) => (p.where ? ` · 📍 ${esc(p.where)} · <a href="https://maps.apple.com/?q=${encodeURIComponent(p.where)}" target="_blank" rel="noopener">map</a>` : '');
  const card = (p, cls, inner) => `<div class="fh-in ${cls}" data-plan="${p.id}">${cls === 'incoming' ? '<span class="newdot">NEW</span>' : ''}<div class="fic big">${(KINDS[p.kind] || KINDS.other)[0]}</div>
    <div><div class="small">${p.by === fam().me ? "You're" : `${esc(member(p.by)?.name || partnerName())} is`} feeling like</div><b class="fh-what">${esc(planTitle(p))}</b>
    <div class="small">${esc(planWhen(p))}${map(p)}</div>${p.note ? `<div class="small fnote">“${esc(p.note)}”</div>` : ''}${inner}</div></div>`;
  const answers = (p) => `<div class="rsvp full">${Object.entries(ANSWERS).map(([k, t]) => `<button type="button" class="${p.replies?.[fam().me]?.r === k ? '' : 'ghost'}" data-answer="${p.id}:${k}">${t}</button>`).join('')}</div>`;
  const them = (p) => p.to.map((id) => { const r = p.replies?.[id]?.r; return r ? `${esc(member(id)?.name || '')}: <b>${ANSWERS[r]}</b>` : ''; }).filter(Boolean).join(' · ');
  el.innerHTML = `<div class="row between"><b class="fh-title">✨ What are you feeling like?</b><span class="fh-sub">${esc(us.partner ? `you & ${us.partner.name}` : 'just you two')}</span></div>
    <div class="fh-kinds">${Object.entries(KINDS).map(([k, [ico, label]]) => `<button type="button" data-feel="${k}"><b>${ico}</b>${esc(label.split(' / ')[0].replace('Watch a show', 'Show').replace('Work out together', 'Work out').replace('Something else', 'Other'))}</button>`).join('')}</div>
    ${toMe.map((p) => card(p, 'incoming', answers(p))).join('')}
    ${agreed.map((p) => `<div class="itsaplan" data-plan="${p.id}"><div class="big">🎉 It's a plan!</div><div class="small">${(KINDS[p.kind] || KINDS.other)[0]} ${esc(planTitle(p))} · ${esc(planWhen(p))}${p.where ? ` · ${esc(p.where)}` : ''}</div>
      <div class="chips center">${p.where ? `<a class="chip" href="https://maps.apple.com/?q=${encodeURIComponent(p.where)}" target="_blank" rel="noopener">🗺 Directions</a>` : ''}${p.kind === 'movie' && p.what ? `<a class="chip" href="https://www.fandango.com/search?q=${encodeURIComponent(p.what)}" target="_blank" rel="noopener">🎟 Get tickets</a>` : ''}${p.by === fam().me ? `<button type="button" class="chip" data-plandone="${p.id}">✓ We did it</button>` : ''}</div></div>`).join('')}
    ${mineWaiting.map((p) => card(p, 'waiting', `<div class="small muted" style="margin-top:4px">${them(p) || `⏳ Waiting for ${esc(partnerName())}…`} · <button type="button" class="linkish small" data-planmove="${p.id}">Another day</button> · <button type="button" class="linkish small" data-plandel="${p.id}">Cancel</button></div>`)).join('')}
    ${!toMe.length && !agreed.length && !mineWaiting.length ? '<p class="small fh-empty">Nothing waiting on an answer · tap above to suggest something 💡</p>' : ''}
    ${past.length ? `<div class="fh-past">${past.map((p) => `<span>${p.done || p.agreed ? '✓' : '·'} ${esc((KINDS[p.kind] || KINDS.other)[1].split(' ')[0])} ${new Date(`${p.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })}${p.agreed ? ' · 🙌' : ''}</span>`).join('')}</div>` : ''}`;
}
function feelSheet(kind = 'dinner') {
  const k = KINDS[kind] || KINDS.other;
  openSheet(`<h2>✨ I'm feeling like…</h2>
    <form id="feelForm" class="stack">
      <div class="kinds radios">${Object.entries(KINDS).map(([key, [ico, label]]) => `<label><input type="radio" name="kind" value="${key}" ${key === kind ? 'checked' : ''}><span><b>${ico}</b>${esc(label)}</span></label>`).join('')}</div>
      <label class="kwhat" ${k[2] ? '' : 'hidden'}><span>${esc(k[2] || 'What?')}</span><input name="what" maxlength="80"></label>
      <label class="kwhere" ${k[3] ? '' : 'hidden'}><span>${esc(k[3] || 'Where?')}</span><input name="where" maxlength="80"></label>
      <div class="seg2 radios whens">${Object.entries(WHENS).map(([key, t]) => `<label><input type="radio" name="when" value="${key}" ${key === 'tonight' ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      <label class="kday" hidden>Day<input type="date" name="day" min="${isoLocal()}" value="${isoLocal()}"></label>
      <div class="two"><label>Time (optional)<input type="time" name="time"></label><label>Who<select name="audience"><option value="couple">Just us two</option><option value="family">The whole family</option></select></label></div>
      <label>Note (optional)<input name="note" maxlength="140" placeholder="😊"></label>
      <p class="tiny muted">${esc(partnerName())} gets it on their feed with 🙌 I'm in · 🤔 Maybe · ⏰ Another time. 🔐 Only the people it's for can read it.</p>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Send to ${esc(partnerName())} 💌</button></div>
    </form>`);
}
// 💞 Just us: post-its only the two of you see.
function renderNotes() {
  const el = $('#usNotes');
  if (!el) return;
  if (!us.partner && !us.notes.length) { el.innerHTML = ''; return; }
  const mine = (n) => n.by === fam().me;
  const fresh = us.notes.filter((n) => !mine(n) && Date.now() - n.at < 864e5).length;
  el.innerHTML = `<h3 class="row between"><span>💞 Just us ${fresh ? `<span class="newpill">${fresh} NEW</span>` : ''}</span></h3>
    <div class="postits">${us.notes.slice().sort((a, b) => b.at - a.at).map((n) => `<div class="postit ${esc(n.color || 'yellow')}" data-note="${n.id}">${esc(n.text)}
      <small>${esc(mine(n) ? 'You' : member(n.by)?.name || '')} · ${ago(n.at)} <button type="button" class="heart" data-noteheart="${n.id}" aria-label="Heart">${n.hearts?.length ? '❤️'.repeat(Math.min(2, n.hearts.length)) : '🤍'}</button>${mine(n) ? ` <button type="button" class="heart" data-notedel="${n.id}" aria-label="Remove">✕</button>` : ''}</small></div>`).join('')}
      <button type="button" class="postit add" data-act="note">＋ Note</button></div>
    <p class="tiny muted pad">${us.streak > 1 ? `🔥 ${us.streak}-day note streak · ` : ''}only you two see these · they clear after a week unless you ❤️ them</p>`;
}
function noteSheet() {
  openSheet(`<h2>💌 Leave a note</h2><p class="small muted">A post-it only you and ${esc(partnerName())} see.</p>
    <form id="noteForm" class="stack">
      <textarea name="text" rows="4" maxlength="280" required placeholder="Thanks for walking the girls ☔"></textarea>
      <div class="emo">${NOTE_EMOJI.map((e) => `<button type="button" class="chip" data-emoji="${e}">${e}</button>`).join('')}</div>
      <div class="colors">${NOTE_COLORS.map((c, i) => `<label><input type="radio" name="color" value="${c}" ${i === 0 ? 'checked' : ''}><i class="sw-${c}"></i></label>`).join('')}</div>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Stick it 📌</button></div>
    </form>`);
}
// ☀️ Today: the dogs fed, the next walk, tonight's plan, your macros left.
async function renderToday() {
  const el = $('#today');
  if (!el) return;
  const today = isoLocal();
  const tile = (ico, label, value, sub = '', attrs = '') => `<button type="button" class="tile" ${attrs}>${ico} ${label}<b>${value}</b>${sub ? `<small class="muted">${sub}</small>` : ''}</button>`;
  const [care, mine, weather] = await Promise.all([
    (fam().modules || []).includes('dogs') ? api.get(`/families/${state.fid}/care?to=${today}&days=1`).catch(() => null) : null,
    api.get(`/families/${state.fid}/members/${fam().me}/data`).then(openData).catch(() => null),
    (fam().modules || []).includes('dogs') ? walkWeather().catch(() => null) : null,
  ]);
  if (!$('#today')) return;
  const tiles = [];
  if (care) {
    const list = care.days?.[today] || [];
    const fed = (k) => list.find((e) => e.kind === k);
    const meal = new Date().getHours() < 15 ? 'breakfast' : 'dinner';
    const f = fed(meal);
    tiles.push(tile(meal === 'breakfast' ? '🍳' : '🍲', meal === 'breakfast' ? 'Breakfast' : 'Dinner', f ? '<span class="ok">Fed ✓</span>' : 'Not yet', f ? `${esc(f.byName)} · ${new Date(f.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : 'tap to log', 'data-view="pets"'));
  }
  if (weather?.pick) tiles.push(tile('🦮', 'Next walk', `${weather.hr(weather.pick.index)}–${weather.hr(weather.pick.index + 1)}`, weather.hot && weather.hot.asphalt >= 125 ? `🔥 pavement hot ~${weather.hr(weather.hot.index)}` : 'pavement cool ✓', 'data-view="pets"'));
  const tonight = us.plans.filter((p) => isUpcoming(p) && p.day === today).sort((a, b) => (b.agreed ? 1 : 0) - (a.agreed ? 1 : 0))[0];
  tiles.push(tonight ? tile((KINDS[tonight.kind] || KINDS.other)[0], 'Tonight', esc(planTitle(tonight)), tonight.agreed ? 'it\'s a plan 🙌' : 'waiting for an answer') : tile('✨', 'Tonight', 'Nothing yet', 'suggest something', 'data-feel="dinner"'));
  const day = mine?.days?.[today];
  tiles.push(day?.left ? tile('🥗', 'Macros left', `${day.left.p}P · ${day.left.c}C · ${day.left.f}F`, `${Math.max(0, day.left.kcal).toLocaleString()} kcal`, 'data-trackers="1"') : tile('🥗', 'Trackers', 'Today\'s plan', 'open your trackers', 'data-trackers="1"'));
  el.innerHTML = `<div class="row between"><b>☀️ Today · ${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</b>${weather ? `<span class="small muted">${Math.round(weather.hourly[weather.from].temp)}°</span>` : ''}</div>
    <div class="grid4">${tiles.join('')}</div>`;
}
// 📅 Coming up (one line): the next dog appointment (and an open leg), and the next agreed plan.
function renderComingLine() {
  const el = $('#comingLine');
  if (!el) return;
  const a = dogsHub.appts.find((x) => x.status !== 'done');
  const p = us.plans.filter((x) => x.agreed && isUpcoming(x) && x.day !== isoLocal()).sort((x, y) => x.day.localeCompare(y.day))[0];
  const bits = [];
  if (p) bits.push(`${(KINDS[p.kind] || KINDS.other)[0]} ${esc(planTitle(p))} · ${esc(planWhen(p))}`);
  if (a) {
    const pets = a.pets.map((id) => member(id)?.name).filter(Boolean).join(' & ');
    const open = (a.dropAt && !a.dropBy) || (a.pickAt && !a.pickBy);
    bits.push(`${(APPT[a.type] || APPT.other)[0]} ${esc(whenText(a.dropAt || a.pickAt))} ${esc(pets)}${open ? ' · <span class="tone-warn">a ride needs a driver</span>' : ''}`);
  }
  el.innerHTML = bits.length ? `<button type="button" class="card coming-line" data-view="pets"><span class="small">📅 <b>Coming up:</b> ${bits.join(' · ')}</span></button>` : '';
}
// The center ＋: everything you can add, feeling-like first.
function plusMenu() {
  const items = [
    ['feel', '✨', "I'm feeling like…", `dinner, a movie, a walk — send it to ${partnerName()}`, 'hot'],
    ['note', '💌', 'Leave a note', 'a post-it just for you two'],
    ['post', '📸', 'Post', 'a photo or update for the family'],
    ...((fam().modules || []).includes('dogs') ? [['apptnew', '🐾', 'Dog appointment', 'grooming, vet, vaccine']] : []),
    ['eventnew', '📅', 'Calendar event', 'family only'],
    ['askhelp', '🙋', 'Ask for help', 'pet sitting, babysitting, a ride'],
  ];
  openSheet(`<h2>What would you like to do?</h2><div class="pluslist">${items.map(([act, ico, title, sub, hot]) => `<button type="button" class="pl ${hot || ''}" data-act="${act}"><b>${ico}</b><span><strong>${esc(title)}</strong><small>${esc(sub)}</small></span></button>`).join('')}</div>`);
}
// Bringing over the trackers' "Feeling like" plans, answers and notes (once per family, each
// person their own, locked before they're sent).
async function importUs() {
  const flag = `fam.usImported.${state.fid}`;
  if (LS.get(flag) || lockedHere()) return;
  const data = await openData(await api.get(`/families/${state.fid}/members/${fam().me}/data`).catch(() => null));
  if (!data || data.locked) return;
  const plans = await Promise.all((data.plans || []).filter((p) => p?.id && p.date).map(async (p) => ({
    id: p.id, at: p.at, done: !!p.done, weekend: p.when === 'weekend', day: planDayOf(p.when, p.date, p.day),
    body: await lock({ kind: KINDS[p.kind] ? p.kind : 'other', what: p.what || '', where: p.where || '', when: p.when, time: p.time || '', note: p.note || '' }),
  })));
  const notes = await Promise.all((data.notes || []).filter((n) => n?.id && n.at > Date.now() - 7 * 864e5).map(async (n) => ({ id: n.id, at: n.at, body: await lock({ text: `${n.text || ''}${n.emoji ? ` ${n.emoji}` : ''}`.trim(), color: NOTE_COLORS.includes(n.color) ? n.color : 'yellow' }) })));
  if (plans.length || notes.length || Object.keys(data.planReplies || {}).length) {
    await api.post(`/families/${state.fid}/us/import`, { plans, notes, replies: data.planReplies || {}, noteDays: data.noteDays || [] });
    await loadUs(); renderFeel(); renderNotes(); renderToday();
  }
  LS.set(flag, '1');
}
async function usChanged(r) {
  await loadUs(); renderFeel(); renderNotes(); renderToday(); renderComingLine();
  return r;
}

// ---------- 📅 the family calendar (family only; titles, places and notes end-to-end encrypted) ----------
const calm = { month: null, day: null, events: [], feeds: [], golden: [], rhythm: null, C: null };
const calModule = () => import('../js/calendar.js');
async function loadCal() {
  calm.C ||= await calModule();
  const [r, stats] = await Promise.all([
    api.get(`/families/${state.fid}/events`).catch(() => ({ events: [], feeds: [] })),
    (fam().modules || []).includes('dogs') ? api.get(`/families/${state.fid}/dogstats?today=${isoLocal()}`).catch(() => null) : null,
    loadAppts(), loadUs(),
  ]);
  calm.events = await Promise.all(r.events.map(async (e) => ({ ...e, ...((await unlock(e.body)) || { title: '🔒 Locked', locked: true }) })));
  calm.feeds = (await Promise.all(r.feeds.map(async (f) => ({ ...f, ...((await unlock(f.body)) || {}) })))).filter((f) => f.url);
  calm.golden = stats?.goldenDays || [];
  refreshFeeds().catch(() => {});
}
// Linked calendars (iCloud, Google): fetched through the connector, kept on this device for 30 minutes.
const feedCache = () => { try { return JSON.parse(localStorage.getItem('fam.calFeeds') || '{}'); } catch { return {}; } };
async function refreshFeeds(force = false) {
  const cache = feedCache();
  const due = calm.feeds.filter((f) => force || Date.now() - (cache[f.id]?.at || 0) > 30 * 60000);
  if (!due.length) return;
  const from = shiftLocal(isoLocal(), -30);
  for (const f of due) {
    try {
      const { ics } = await api.get(`/ics?url=${encodeURIComponent(f.url)}`);
      cache[f.id] = { at: Date.now(), events: calm.C.parseIcs(ics, { localTz: Intl.DateTimeFormat().resolvedOptions().timeZone, from, source: f.name }).slice(0, 1500) };
    } catch (err) { cache[f.id] = { ...(cache[f.id] || {}), at: Date.now(), error: err.message }; }
  }
  try { localStorage.setItem('fam.calFeeds', JSON.stringify(cache)); } catch { /* full */ }
  if (state.view === 'calendar') renderCal();
}
// Everything on one day, in time order: events, linked calendars, dog drop-offs and pick-ups,
// plans, Call Mom windows. {time, icon, title, sub, cls, open}
async function dayEntries(day) {
  const out = [];
  const C = calm.C;
  for (const e of C.eventsOn(calm.events, day)) out.push({ time: e.allDay ? '' : e.start, icon: '📅', title: e.title, sub: [e.place, (e.who || []).map((id) => (id === fam().me ? 'You' : member(id)?.name)).filter(Boolean).join(', ')].filter(Boolean).join(' · '), cls: 'fam', open: `data-event="${e.id}"` });
  const cache = feedCache();
  for (const f of calm.feeds) for (const e of C.eventsOn(cache[f.id]?.events || [], day)) out.push({ time: e.allDay ? '' : e.start, icon: '📲', title: e.title, sub: `${f.name}${f.by !== fam().me ? ` · ${member(f.by)?.name || ''}` : ''}`, cls: 'fam' });
  for (const a of dogsHub.appts.filter((x) => x.status !== 'done')) {
    const pets = a.pets.map((id) => member(id)?.name).filter(Boolean).join(' & ');
    const [ico, label] = APPT[a.type] || APPT.other;
    for (const [k, verb] of [['drop', 'Drop off'], ['pick', 'Pick up']]) {
      const at = a[`${k}At`];
      if (!at || at.slice(0, 10) !== day) continue;
      const by = a[`${k}By`];
      out.push({ time: at.slice(11, 16), icon: k === 'drop' ? ico : '🏁', title: `${verb} ${pets} · ${label.toLowerCase()}`, sub: by ? who(by) : '<span class="tone-warn">nobody yet — tap to take it</span>', cls: 'dog', open: `data-apptopen="${a.id}"` });
    }
  }
  for (const p of us.plans.filter((x) => !x.done && x.day === day)) out.push({ time: p.time || '', icon: (KINDS[p.kind] || KINDS.other)[0], title: planTitle(p), sub: p.agreed ? "it's a plan 🙌" : 'waiting for an answer', cls: 'plan' });
  // 📞 Call Mom windows, for whoever the trackers set them up for.
  if (me()?.legacyId) {
    const B = await import('../js/brief.js');
    if (B.CALL.who === me().legacyId) for (const w of B.callWindows(day)) out.push({ time: `${String(w.start.getHours()).padStart(2, '0')}:${String(w.start.getMinutes()).padStart(2, '0')}`, icon: '📞', title: 'Call Mom window', sub: `until ${w.end.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`, cls: 'fam' });
  }
  return out.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}
const timeLabel = (t) => (t ? new Date(`2000-01-01T${t}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase() : 'all day');
async function calendarView() {
  calm.month ||= isoLocal().slice(0, 7); calm.day ||= isoLocal();
  $('#view').innerHTML = `${demoBanner()}<section class="card" id="calMonth"><div class="skeleton line"></div></section><div id="calRhythm"></div><div id="calDay"></div><div id="calNext"></div><div id="calFeeds"></div>
    <p class="tiny muted center pad">🔒 Only your family sees this calendar — friends' families see nothing. Titles, places and notes are end-to-end encrypted.</p>`;
  await loadCal();
  importCal().catch(() => {});
  renderCal();
}
async function renderCal() {
  if (!$('#calMonth')) return;
  const [y, mo] = calm.month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1), start = new Date(first); start.setDate(1 - first.getDay());
  const days = Array.from({ length: 42 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return isoLocal(d); });
  const weeks = days.slice(35).every((d) => !d.startsWith(calm.month)) ? days.slice(0, 35) : days;
  const cache = feedCache();
  const dots = (d) => {
    const out = [];
    if (dogsHub.appts.some((a) => a.status !== 'done' && [a.dropAt, a.pickAt].some((x) => x?.startsWith(d)))) out.push('dv');
    if (calm.C.eventsOn(calm.events, d).length || calm.feeds.some((f) => calm.C.eventsOn(cache[f.id]?.events || [], d).length)) out.push('df');
    if (us.plans.some((p) => !p.done && p.day === d)) out.push('dp');
    if (calm.golden.includes(d)) out.push('dg');
    return out.map((c) => `<i class="${c}"></i>`).join('');
  };
  $('#calMonth').innerHTML = `<div class="row between"><button type="button" class="linkish" data-calmove="-1" aria-label="Previous month">‹</button><b>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><button type="button" class="linkish" data-calmove="1" aria-label="Next month">›</button></div>
    <div class="cal7">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<div class="dh">${x}</div>`).join('')}${weeks.map((d) => `<button type="button" class="d ${d.startsWith(calm.month) ? '' : 'o'} ${d === isoLocal() ? 't' : ''} ${d === calm.day ? 'sel' : ''}" data-calday="${d}">${+d.slice(8)}<span class="dots">${dots(d)}</span></button>`).join('')}</div>
    <div class="legend"><span><i class="dv"></i>Dogs</span><span><i class="df"></i>Family</span><span><i class="dp"></i>Plans</span><span><i class="dg"></i>⭐ Golden</span></div>`;
  const list = (entries) => entries.map((e) => `<button type="button" class="ev ${e.cls}" ${e.open || ''}><span class="tm">${timeLabel(e.time)}</span><span><b>${e.icon} ${esc(e.title)}</b>${e.sub ? `<small class="muted"> · ${e.sub}</small>` : ''}</span></button>`).join('');
  const sel = await dayEntries(calm.day);
  const label = calm.day === isoLocal() ? 'Today' : new Date(`${calm.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  $('#calDay').innerHTML = `<h3 class="row between"><span>${esc(label)}</span><button type="button" class="linkish small" data-act="eventnew">＋ Event</button></h3>
    <section class="card agenda">${sel.length ? list(sel) : '<p class="small muted">Nothing on this day.</p>'}</section>`;
  // Coming up: the next two weeks after the chosen day.
  const next = [];
  for (let i = 1, d = shiftLocal(calm.day, 1); i <= 14 && next.length < 10; i++, d = shiftLocal(d, 1)) for (const e of await dayEntries(d)) next.push({ ...e, time: e.time, day: d });
  $('#calNext').innerHTML = next.length ? `<h3>Coming up</h3><section class="card agenda">${next.slice(0, 10).map((e) => `<button type="button" class="ev ${e.cls}" ${e.open || ''}><span class="tm">${new Date(`${e.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' })} ${timeLabel(e.time)}</span><span><b>${e.icon} ${esc(e.title)}</b>${e.sub ? `<small class="muted"> · ${e.sub}</small>` : ''}</span></button>`).join('')}</section>` : '';
  const fc = feedCache();
  $('#calFeeds').innerHTML = `<details class="card"><summary><b>📲 Linked calendars</b> <span class="small muted">${calm.feeds.length ? `${calm.feeds.length} linked` : 'bring in your iPhone or Google calendar'}</span></summary>
    ${calm.feeds.length ? `<ul class="list">${calm.feeds.map((f) => `<li class="row between small"><span><b>${esc(f.name)}</b> <small class="${fc[f.id]?.error ? 'tone-warn' : 'muted'}">${fc[f.id]?.error ? esc(fc[f.id].error) : fc[f.id]?.events ? `${fc[f.id].events.length} events` : 'loading…'}</small></span>${f.by === fam().me ? `<button type="button" class="linkish small danger" data-feeddel="${f.id}">Unlink</button>` : ''}</li>`).join('')}</ul><button type="button" class="linkish small" data-act="feedsrefresh">↻ Refresh</button>` : ''}
    <form id="feedForm" class="stack"><p class="small">iPhone: Calendar app › Calendars › ⓘ next to yours › turn on <b>Public Calendar</b> › Share Link › Copy. Google: Settings › your calendar › <b>Secret address in iCal format</b>.</p>
      <label>Name<input name="name" maxlength="40" required placeholder="My iPhone calendar"></label><label>Link<input name="url" required placeholder="webcal://p…icloud.com/…"></label>
      <label class="check"><input type="checkbox" name="both"><span>It's for both of us</span></label><button>Link it</button></form></details>`;
  // 💞 2-2-2-2: what's due, from the trackers' log.
  rhythmLine().catch(() => {});
}
async function rhythmLine() {
  const el = $('#calRhythm');
  if (!el) return;
  const mine = await openData(await api.get(`/families/${state.fid}/members/${fam().me}/data`).catch(() => null));
  const entries = Array.isArray(mine?.rhythm) ? mine.rhythm : [];
  if (!entries.length) { el.innerHTML = ''; return; }
  const R = await import('../js/rhythm.js');
  const st = R.rhythmStatus(entries, isoLocal());
  const n = R.nextNudge(st);
  el.innerHTML = `<section class="card small rhythm-line">💞 <b>2-2-2-2</b> · ${['date', 'overnight', 'getaway'].map((k) => `${R.RHYTHMS[k].icon} ${st[k].level === 'due' ? '<b class="tone-warn">due</b>' : st[k].level === 'soon' ? `in ${Math.max(0, st[k].daysLeft)}d` : '✓'}`).join(' · ')}${n ? ` — ${esc(R.RHYTHMS[n.kind].label)} ${n.level === 'due' ? 'is due' : 'is coming up'}` : ''}</section>`;
}
function eventSheet(ev = null, day = calm.day || isoLocal()) {
  const v = ev || { date: day, allDay: false, start: '', end: '', who: [fam().me], remind: 60, repeat: null };
  const C = calm.C;
  const people = fam().members.filter((m) => m.kind === 'person' || m.kind === 'pet');
  openSheet(`<h2>${ev ? 'Edit event' : '📅 New event'}</h2>
    <form id="eventForm" class="stack" data-id="${ev?.id || ''}">
      <label>What<input name="title" required maxlength="100" value="${esc(v.title || '')}" placeholder="Diwali dinner at Mom's 🪔"></label>
      <label class="check"><input type="checkbox" name="allDay" ${v.allDay ? 'checked' : ''}><span>All day</span></label>
      <div class="two"><label>Day<input type="date" name="date" required value="${esc(v.date)}"></label><label class="timeonly" ${v.allDay ? 'hidden' : ''}>Starts<input type="time" name="start" value="${esc(v.start || '')}"></label></div>
      <label class="timeonly" ${v.allDay ? 'hidden' : ''}>Ends (optional)<input type="time" name="end" value="${esc(v.end || '')}"></label>
      <label>Where<input name="place" maxlength="100" value="${esc(v.place || '')}"></label>
      <fieldset class="chips plain"><legend>Who's going</legend>${people.map((p) => `<label class="chipcheck"><input type="checkbox" name="who" value="${p.id}" ${(v.who || []).includes(p.id) ? 'checked' : ''}><span>${p.kind === 'pet' ? '🐾' : '👤'} ${esc(p.id === fam().me ? 'You' : p.name)}</span></label>`).join('')}</fieldset>
      <div class="two"><label>Repeat<select name="repeat">${Object.entries(C?.REPEATS || { '': 'Does not repeat' }).filter(([k]) => k !== 'twiceMonthly').map(([k, t]) => `<option value="${k}" ${(v.repeat?.kind || '') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
        <label>Remind<select name="remind">${Object.entries(C?.REMINDERS || { '': 'No reminder' }).map(([k, t]) => `<option value="${k}" ${String(v.remind ?? '') === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label></div>
      <label>Notes<textarea name="notes" rows="2" maxlength="500">${esc(v.notes || '')}</textarea></label>
      <p class="tiny muted">🔒 Family only, end-to-end encrypted.</p>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>${ev ? 'Save' : 'Add'}</button></div>
    </form>`);
}
function eventDetail(e) {
  const C = calm.C;
  const ics = { ...e, who: 'both' };
  openSheet(`<div class="row between"><h2>📅 ${esc(e.title)}</h2><button type="button" class="linkish small" data-act="close">Done</button></div>
    <p class="small">${new Date(`${e.date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}${e.allDay ? ' · all day' : e.start ? ` · ${timeLabel(e.start)}${e.end ? `–${timeLabel(e.end)}` : ''}` : ''}${e.repeat ? ` · ${esc(C.repeatText(e))}` : ''}</p>
    ${e.place ? `<p class="small">📍 ${esc(e.place)} · <a href="https://maps.apple.com/?q=${encodeURIComponent(e.place)}" target="_blank" rel="noopener">map</a></p>` : ''}
    ${(e.who || []).length ? `<p class="small">👥 ${(e.who || []).map((id) => esc(id === fam().me ? 'You' : member(id)?.name || '')).join(', ')}</p>` : ''}
    ${e.notes ? `<p class="small">“${esc(e.notes)}”</p>` : ''}
    <div class="row wrap"><button type="button" class="ghost small" data-eventics="${e.id}">📲 Add to my phone's calendar</button><a class="btn ghost small" href="${esc(C.googleUrl(ics))}" target="_blank" rel="noopener">Google Calendar</a>
      <button type="button" class="ghost small" data-eventedit="${e.id}">✎ Edit</button><button type="button" class="linkish small danger" data-eventdel="${e.id}">Delete</button></div>`);
}
// The trackers' calendar events and linked calendars, brought over once per person (locked).
async function importCal() {
  const flag = `fam.calImported.${state.fid}`;
  if (LS.get(flag) || lockedHere()) return;
  const data = await openData(await api.get(`/families/${state.fid}/members/${fam().me}/data`).catch(() => null));
  if (!data || data.locked) return;
  const adults = fam().members.filter((m) => m.kind === 'person' && m.relation !== 'child').map((m) => m.id);
  const whoOf = (w) => (w === 'both' || !w ? adults : [fam().members.find((m) => m.legacyId === w)?.id || fam().me]);
  const events = await Promise.all((data.events || []).filter((e) => e?.id && e.date && e.title && !e.deleted).map(async (e) => ({
    id: e.id, date: e.date, start: e.start || '', end: e.end || '', allDay: !!e.allDay, repeat: e.repeat || null, skip: e.skip || [], who: whoOf(e.who), remind: e.remind ?? null, at: e.at, updatedAt: e.updatedAt,
    body: await lock({ title: e.title, place: e.place || '', notes: e.notes || '' }),
  })));
  if (events.length) await api.post(`/families/${state.fid}/events/import`, { events });
  const feeds = await Promise.all((data.calFeeds || []).filter((f) => f?.url).map(async (f) => ({ id: f.id, who: f.who === 'both' ? 'both' : fam().me, body: await lock({ name: f.name || 'Calendar', url: f.url }) })));
  if (feeds.length) await saveFeeds([...calm.feeds.filter((f) => f.by === fam().me).map((f) => ({ id: f.id, name: f.name, url: f.url, who: f.who })), ...feeds.map((f) => ({ ...f, raw: true }))]);
  LS.set(flag, '1');
  if (events.length || feeds.length) { await loadCal(); renderCal(); }
}
async function saveFeeds(list) {
  const feeds = await Promise.all(list.map(async (f) => (f.raw ? { id: f.id, who: f.who, body: f.body } : { id: f.id, who: f.who, body: await lock({ name: f.name, url: f.url }) })));
  await api.put(`/families/${state.fid}/calfeeds`, { feeds });
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

// ---------- 🔐 encryption: turning it on, adding a device, the recovery phrase ----------
// ---------- 🔔 notifications (Web Push, through the trackers' service worker) ----------
const pushOk = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
const iosBrowser = () => (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)) && !(navigator.standalone || matchMedia('(display-mode: standalone)').matches);
const swReady = () => { navigator.serviceWorker.register('../sw.js').catch(() => {}); return navigator.serviceWorker.ready; };
const keyBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const myTz = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } };
const sendSub = (sub) => { const j = sub.toJSON(); return api.post('/push/subscribe', { endpoint: j.endpoint, keys: j.keys, device: deviceName(), tz: myTz() }); };
async function renderNotify() {
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
async function pushOn() {
  const perm = await Notification.requestPermission(); // first, while it's still the tap
  if (perm !== 'granted') { toast('Notifications weren\'t allowed'); return renderNotify(); }
  const reg = await swReady();
  const { publicKey } = await api.get('/push');
  let sub = await reg.pushManager.getSubscription();
  const same = sub?.options?.applicationServerKey && btoa(String.fromCharCode(...new Uint8Array(sub.options.applicationServerKey))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') === publicKey;
  if (sub && !same) { await sub.unsubscribe().catch(() => {}); sub = null; }
  sub ||= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
  await sendSub(sub);
  LS.set('fam.pushSync', isoLocal());
  toast('🔔 Notifications are on');
  renderNotify();
}
// Once a day: tell the connector this phone is still here (and its time zone, for reminders).
function refreshPush() {
  if (api.mode() === 'demo' || !pushOk() || Notification.permission !== 'granted' || LS.get('fam.pushSync') === isoLocal()) return;
  swReady().then((reg) => reg.pushManager.getSubscription()).then((sub) => sub && sendSub(sub)).then(() => LS.set('fam.pushSync', isoLocal())).catch(() => {});
}
if (pushOk()) navigator.serviceWorker.addEventListener('message', (e) => { if (e.data?.open && state.family) show(e.data.open === 'dogs' ? 'pets' : e.data.open); });

function e2eeCard() {
  const f = fam(), owner = me().role === 'owner';
  if (!f.e2ee) return `<p class="small">Posts, photos, notes, plans, diet &amp; fitness and the dogs' details are stored readable on your server today.</p>
    ${owner ? `<p class="small">Turn on <b>end-to-end encryption</b> and only your family's devices can read them — not the server, not Cloudflare, not anyone who maintains the app.</p><button type="button" data-act="e2eeon">🔐 Turn on encryption</button>`
      : `<p class="small muted">${esc(f.members.find((m) => m.role === 'owner')?.name || "The family's creator")} can turn on end-to-end encryption from their Me tab.</p>`}`;
  if (!fk()) return `<p class="small">🔒 ${esc(f.name)} is end-to-end encrypted, and this device doesn't have the key yet.</p>
    <div class="row wrap"><button type="button" data-act="keylink">Use a link from my phone</button><button type="button" class="ghost" data-act="keyrestore">Use my recovery phrase</button></div>`;
  return `<p class="small">✅ <b>End-to-end encrypted.</b> Posts, photos, comments, notes, plans, diet &amp; fitness, the dogs' details and appointment notes are locked on your devices before they're sent; the server only keeps text it can't read.</p>
    <div class="row wrap"><button type="button" class="ghost" data-act="adddevice">📲 Add a device</button><button type="button" class="ghost" data-act="phrase">🔑 Recovery phrase</button></div>
    <p class="tiny muted">Not encrypted (the server needs these to work): names of family members and pets, the chores log and Gold Card, games, and the golden-day notes.</p>
    <p class="tiny muted" id="backupState"></p>`;
}
async function turnOnEncryption(log) {
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
      const cs = (p.comments || []).filter((c) => c.text && !isSealed(c.text));
      if (cs.length) body.comments = await Promise.all(cs.map(async (c) => ({ id: c.id, text: await seal(pkKey, c.text) })));
      const os = (p.help?.offers || []).filter((o) => o.msg && !isSealed(o.msg));
      if (os.length) body.offers = await Promise.all(os.map(async (o) => ({ id: o.id, msg: await seal(pkKey, o.msg) })));
      if (Object.keys(body).length && (body.text || body.photo || body.comments || body.offers)) { await api.patch(`/posts/${fid}/${p.id}`, body); n++; }
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
function phraseSheet() {
  const phrase = newPhrase();
  openSheet(`<h2>🔑 Your recovery phrase</h2>
    <p class="small">If you ever lose all your devices, this phrase unlocks your family again. <b>Write it down</b> and keep it somewhere safe — it's never stored readable anywhere, so nobody (including us) can recover it for you.</p>
    <div class="phrase">${phrase.split('-').map((g) => `<span>${g}</span>`).join('')}</div>
    <form id="phraseForm" class="stack" data-phrase="${phrase}"><label class="check"><input type="checkbox" required><span>I've written it down</span></label>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Save my backup</button></div></form>
    <p class="tiny muted">Making a new phrase replaces the old one.</p>`);
}
function addDeviceSheet() {
  const link = deviceLink(`${location.origin}${location.pathname}`, state.fid, fk());
  openSheet(`<h2>📲 Add a device</h2>
    <p class="small">Open this link on your other phone or computer (signed in to OurPawmily) and it can read ${esc(fam().name)}. Send it <b>only to yourself</b> — AirDrop, or a note to yourself.</p>
    <div class="linkbox"><input readonly value="${esc(link)}" aria-label="Device link"></div>
    <div class="row wrap">${navigator.share ? '<button type="button" data-act="sharedevice">Share…</button>' : ''}<button type="button" class="ghost" data-act="copydevice">Copy link</button></div>
    <p class="tiny muted">For your partner: their invite link already carries the key. If they joined before encryption was on, send them this link too.</p>`);
}
function keyLinkSheet() {
  openSheet(`<h2>Use a link from my phone</h2><p class="small">On a phone that can read ${esc(fam()?.name || 'your family')}: Me › 🔐 Encryption › 📲 Add a device. Open that link here, or paste it:</p>
    <form id="keyLinkForm" class="stack"><input name="link" required placeholder="https://…/family/#k=…" autocomplete="off"><div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Unlock</button></div></form>`);
}
function keyRestoreSheet() {
  openSheet(`<h2>Use my recovery phrase</h2><form id="restoreForm" class="stack"><label>Recovery phrase<input name="phrase" required autocomplete="off" autocapitalize="none" placeholder="xxxxx-xxxxx-xxxxx-xxxxx-xxxxx"></label>
    <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Unlock</button></div></form>`);
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
function inviteSheet(invite, who, ck = null) {
  // 🔐 The key rides after the "#": the family key for a member, the connection key for a friend's family.
  const link = `${inviteLink(invite.code)}${invite.kind === 'member' && fk() ? `&k=${fk()}` : ''}${ck ? `&ck=${ck}` : ''}`;
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
  const done = await runImport(api, state.fid, ops, say, (d) => sealData(d));
  await loadFamily();
  await importCare(api, state.fid, legacy, fam(), say);
  // Read everything back and compare it with this phone, section by section.
  const checks = await verifyImport(api, state.fid, done, (rec) => openData(rec));
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
  const t = e.target.closest('button, [data-view], [data-member], [data-fam], [data-apptopen]');
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
  if (d.carebothEntry) return act(async () => { await api.patch(`/families/${state.fid}/care/${isoLocal()}/${d.carebothEntry}`, { both: !d.solo }); renderCare(); renderRace(); toast(d.solo ? 'Logged as just you' : '👫 Logged for both of you'); });
  if (d.careundo) return act(async () => { await api.del(`/families/${state.fid}/care/${isoLocal()}/${d.careundo}`); renderCare(); renderRace(); });
  if (d.unblock) return act(async () => { await api.del(`/account/blocks/${d.unblock}`); state.user.blocked = state.user.blocked.filter((b) => b.id !== d.unblock); meView(); });
  if (d.claim && d.appt) return act(async () => { await api.patch(`/families/${state.fid}/appts/${d.appt}`, { claim: d.claim, release: !!d.release }); await apptChanged(); toast(d.release ? 'Given up — it\'s open again' : `You've got the ${d.claim === 'drop' ? 'drop-off' : 'pick-up'} 🚗`); });
  if (d.apptopen) { const a = dogsHub.appts.find((x) => x.id === d.apptopen); return a ? apptDetail(a) : null; }
  if (d.apptedit) return apptSheet(dogsHub.appts.find((x) => x.id === d.apptedit));
  if (d.book) return apptSheet(null, { type: 'vaccine', pets: [d.book], vaccine: d.vaccine });
  if (d.apptdel) { if (!confirm('Remove this appointment?')) return; return act(async () => { await api.del(`/families/${state.fid}/appts/${d.apptdel}`); closeSheet(); await apptChanged(); }); }
  if (d.apptundone) return act(async () => { await api.patch(`/families/${state.fid}/appts/${d.apptundone}`, { undone: true }); closeSheet(); await apptChanged(); });
  if (d.calmove) { const [y, m] = calm.month.split('-').map(Number); const x = new Date(y, m - 1 + +d.calmove, 1); calm.month = isoLocal(x).slice(0, 7); return renderCal(); }
  if (d.calday) { calm.day = d.calday; if (!d.calday.startsWith(calm.month)) calm.month = d.calday.slice(0, 7); return renderCal(); }
  if (d.event) { const e = calm.events.find((x) => x.id === d.event); return e ? eventDetail(e) : null; }
  if (d.eventedit) return eventSheet(calm.events.find((x) => x.id === d.eventedit));
  if (d.eventdel) { if (!confirm('Delete this event?')) return; return act(async () => { await api.del(`/families/${state.fid}/events/${d.eventdel}`); closeSheet(); await loadCal(); renderCal(); }); }
  if (d.eventics) { const e = calm.events.find((x) => x.id === d.eventics); download(new Blob([calm.C.icsCalendar([{ ...e, who: 'both' }], { name: fam().name })], { type: 'text/calendar' }), `${(e.title || 'event').replace(/[^a-z0-9]+/gi, '-').slice(0, 40)}.ics`); return; }
  if (d.feeddel) return act(async () => { await saveFeeds(calm.feeds.filter((f) => f.by === fam().me && f.id !== d.feeddel)); await loadCal(); renderCal(); });
  if (d.feel) return feelSheet(d.feel);
  if (d.trackers) { location.href = '../'; return; }
  if (d.answer) { const [id, r] = d.answer.split(':'); return act(async () => { await api.post(`/families/${state.fid}/us/plans/${id}/reply`, { r }); await usChanged(); if (r === 'in') toast("🎉 It's a plan!"); }); }
  if (d.plandone) return act(async () => { await api.patch(`/families/${state.fid}/us/plans/${d.plandone}`, { done: true }); await usChanged(); toast('✓ Nice — added to your recap'); });
  if (d.plandel) { if (!confirm('Cancel this plan?')) return; return act(async () => { await api.del(`/families/${state.fid}/us/plans/${d.plandel}`); await usChanged(); }); }
  if (d.planmove) { const day = prompt('Which day instead? (YYYY-MM-DD)', shiftLocal(isoLocal(), 1)); if (!/^\d{4}-\d{2}-\d{2}$/.test(day || '')) return; return act(async () => { await api.patch(`/families/${state.fid}/us/plans/${d.planmove}`, { day }); await usChanged(); }); }
  if (d.noteheart) return act(async () => { await api.post(`/families/${state.fid}/us/notes/${d.noteheart}/heart`); await usChanged(); });
  if (d.notedel) return act(async () => { await api.del(`/families/${state.fid}/us/notes/${d.notedel}`); await usChanged(); });
  if (d.emoji) { const ta = $('#noteForm textarea'); if (ta) { ta.value = `${ta.value}${d.emoji}`.slice(0, 280); ta.focus(); } return; }
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
    case 'feel': return feelSheet();
    case 'eventnew': return calModule().then((C) => { calm.C = C; eventSheet(); });
    case 'feedsrefresh': return act(async () => { await refreshFeeds(true); renderCal(); });
    case 'note': return noteSheet();
    case 'post': state.view = 'compose'; draft.help = null; return compose();
    case 'askhelp': state.view = 'compose'; draft.help = draft.help || { type: 'petsit', from: '', to: '', time: '' }; return compose();
    case 'pushon': return act(pushOn);
    case 'pushoff': return act(async () => {
      const sub = await (await swReady()).pushManager.getSubscription();
      if (sub) { await api.post('/push/unsubscribe', { endpoint: sub.endpoint }); await sub.unsubscribe().catch(() => {}); }
      toast('Notifications are off on this device'); renderNotify();
    });
    case 'pushtest': return act(async () => { const r = await api.post('/push/test'); toast(r.sent ? 'Sent — it should show in a moment' : 'Nothing was sent — try turning it off and on again'); });
    case 'e2eeon': return openSheet(`<h2>🔐 Turn on encryption</h2>
      <p class="small">This phone makes a secret family key and locks everything private that's already stored: posts, photos, comments, diet &amp; fitness, the dogs' details and appointment notes. From then on the server only keeps text it can't read.</p>
      <p class="small">Afterwards: send your partner <b>📲 Add a device</b> (once), and write down your <b>🔑 recovery phrase</b>.</p>
      <div class="row end"><button type="button" class="ghost" data-act="close">Not now</button><button type="button" data-act="e2eego">Turn it on</button></div><div id="e2eeLog" class="small"></div>`);
    case 'e2eego': {
      t.disabled = true; t.textContent = 'Locking…';
      const out = $('#e2eeLog');
      return act(async () => { await turnOnEncryption((s) => { out.insertAdjacentHTML('beforeend', `<div>${esc(s)}</div>`); }); toast('🔐 Encrypted'); setTimeout(() => { meView(); phraseSheet(); }, 900); });
    }
    case 'adddevice': return addDeviceSheet();
    case 'sharedevice': return navigator.share({ title: 'OurPawmily on my other device', url: $('.linkbox input').value }).catch(() => {});
    case 'copydevice': return navigator.clipboard?.writeText($('.linkbox input').value).then(() => toast('Copied — open it on your other device'));
    case 'phrase': return phraseSheet();
    case 'keylink': return keyLinkSheet();
    case 'keyrestore': return keyRestoreSheet();
    case 'apptnew': return apptSheet();
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
      if (LS.get('fam.inviteKey')) await keys.set(r.family.fid, LS.get('fam.inviteKey'));
      LS.set('fam.invite', null); LS.set('fam.inviteKey', null); state.invite = null; state.fid = r.family.fid; state.view = 'feed';
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
        const p = state.feed.find((x) => x.id === post.dataset.post);
        const r = await api.post(`/posts/${post.dataset.fid}/${post.dataset.post}/offer`, d.act === 'offer' ? { msg: p._key && msg ? await seal(p._key, msg) : msg } : { withdraw: true });
        p.help = (await openPost({ ...p, text: '', photo: '', comments: [], help: r.help })).help; post.outerHTML = postCard(p);
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
    case 'export': return act(async () => {
      const r = await api.get('/account/export');
      // 🔐 Unlocked on this phone, so the file is readable.
      for (const f of r.families) {
        for (const x of [...f.posts, ...f.comments]) {
          const k = await postKey({ fid: f.fid, pk: x.pk });
          x.text = (await tryOpen(k, x.text, null)) ?? '(locked)';
          if (x.photo != null) x.photo = (await tryOpen(k, x.photo, null)) ?? '';
          delete x.pk;
        }
        f.myData = await openData({ data: f.myData }, f.fid);
        delete f.fid;
      }
      download(new Blob([JSON.stringify(r, null, 2)], { type: 'application/json' }), `ourpawmily-my-data-${isoLocal()}.json`); toast('Your data is downloaded'); });
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
  if (t.id === 'newPostTop') return plusMenu();
  if (t.id === 'bingoTop') { bingo.game = null; return show('bingo'); }
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.name === 'photo' && t.files?.[0]) {
    draft.text = $('#postForm textarea')?.value || draft.text;
    draft.photo = await shrinkPhoto(t.files[0]).catch(() => '');
    return compose();
  }
  if (t.dataset.notifypref) {
    const prefs = Object.fromEntries([...document.querySelectorAll('[data-notifypref]')].map((x) => [x.dataset.notifypref, x.checked]));
    return act(() => api.put('/push/prefs', prefs));
  }
  if (t.form?.id === 'eventForm' && t.name === 'allDay') { t.form.querySelectorAll('.timeonly').forEach((x) => { x.hidden = t.checked; }); return; }
  if (t.form?.id === 'feelForm' && t.name === 'kind') {
    const k = KINDS[t.value] || KINDS.other;
    const w = t.form.querySelector('.kwhat'), h = t.form.querySelector('.kwhere');
    w.hidden = !k[2]; w.querySelector('span').textContent = k[2] || 'What?';
    h.hidden = !k[3]; h.querySelector('span').textContent = k[3] || 'Where?';
    return;
  }
  if (t.form?.id === 'feelForm' && t.name === 'when') { t.form.querySelector('.kday').hidden = t.value !== 'date'; return; }
  if (t.name === 'type' && t.form?.id === 'apptForm') { t.form.querySelector('.vaxonly').hidden = t.value !== 'vaccine'; return; }
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
  if (t.dataset.careboth != null) {
    careBoth = t.checked;
    // Turned on after logging some things yourself? Offer to count those for both too.
    const solo = careToday.filter((x) => x.by.length === 1 && x.by[0] === fam().me);
    if (careBoth && solo.length && confirm(`Also log your ${solo.length} earlier ${solo.length === 1 ? 'entry' : 'entries'} today for both of you?`)) {
      return act(async () => { for (const x of solo) await api.patch(`/families/${state.fid}/care/${isoLocal()}/${x.id}`, { both: true }); renderCare(); renderRace(); toast(`👫 ${solo.length} logged for both of you`); });
    }
    return;
  }
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
      await encryptFamily(r.family.fid);
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
  if (f.id === 'eventForm') {
    e.preventDefault();
    if (lockedHere()) return toast('🔒 This device needs the family key first — Me › 🔐 Encryption');
    const fd = new FormData(f);
    return act(async () => {
      const b = { date: v.date, allDay: !!v.allDay, start: v.start, end: v.end, who: fd.getAll('who'), remind: v.remind === '' ? null : +v.remind, repeat: v.repeat ? { kind: v.repeat } : null, body: await lock({ title: v.title.trim(), place: v.place.trim(), notes: v.notes.trim() }) };
      if (f.dataset.id) await api.patch(`/families/${state.fid}/events/${f.dataset.id}`, b);
      else await api.post(`/families/${state.fid}/events`, b);
      closeSheet(); calm.day = v.date; calm.month = v.date.slice(0, 7);
      if (state.view === 'calendar') { await loadCal(); renderCal(); } else toast('📅 On the calendar');
    });
  }
  if (f.id === 'feedForm') {
    e.preventDefault();
    if (!/^(webcals?|https):\/\//i.test(v.url.trim())) return toast('Paste the calendar link (webcal:// or https://)');
    return act(async () => {
      await saveFeeds([...calm.feeds.filter((x) => x.by === fam().me).map((x) => ({ id: x.id, name: x.name, url: x.url, who: x.who })), { id: Math.random().toString(36).slice(2, 10), name: v.name.trim(), url: v.url.trim(), who: v.both ? 'both' : fam().me }]);
      await loadCal(); await refreshFeeds(true); renderCal(); toast('📲 Linked');
    });
  }
  if (f.id === 'feelForm') {
    e.preventDefault();
    if (lockedHere()) return toast('🔒 This device needs the family key first — Me › 🔐 Encryption');
    const k = KINDS[v.kind] || KINDS.other;
    if (k[2] && !k[2].includes('optional') && !v.what.trim()) return toast(k[2]);
    if (k[3] && !k[3].includes('optional') && !v.where.trim()) return toast(k[3]);
    return act(async () => {
      const day = planDayOf(v.when, isoLocal(), v.day);
      const body = await lock({ kind: v.kind, what: v.what.trim(), where: v.where.trim(), when: v.when, time: v.time, note: v.note.trim() });
      await api.post(`/families/${state.fid}/us/plans`, { day, weekend: v.when === 'weekend', audience: v.audience, body });
      closeSheet(); await usChanged(); toast(`💌 Sent to ${v.audience === 'family' ? 'the family' : partnerName()}`);
    });
  }
  if (f.id === 'noteForm') {
    e.preventDefault();
    if (lockedHere()) return toast('🔒 This device needs the family key first — Me › 🔐 Encryption');
    return act(async () => { await api.post(`/families/${state.fid}/us/notes`, { body: await lock({ text: v.text.trim(), color: v.color }) }); closeSheet(); await usChanged(); toast('📌 Stuck'); });
  }
  if (f.id === 'phraseForm') {
    e.preventDefault();
    return act(async () => { await api.put('/account/keybackup', { backup: await lockBackup(f.dataset.phrase, await keys.all()) }); closeSheet(); toast('🔑 Recovery backup saved'); });
  }
  if (f.id === 'keyLinkForm') {
    e.preventDefault();
    const k = keyFromHash(v.link.slice(v.link.indexOf('#')));
    if (!k) return toast("That isn't a device link");
    return act(async () => { await keys.set(k.fid, k.key); closeSheet(); state.fid = k.fid; await boot(); toast(fk() ? '🔐 Unlocked on this device' : "That link's key doesn't match"); });
  }
  if (f.id === 'restoreForm') {
    e.preventDefault();
    return act(async () => {
      const { backup } = await api.get('/account/keybackup');
      if (!backup) throw new Error('No recovery backup is saved for this account');
      const ks = await unlockBackup(v.phrase, backup);
      for (const [fid, k] of Object.entries(ks)) await keys.set(fid, k);
      closeSheet(); await boot(); toast('🔐 Unlocked with your recovery phrase');
    });
  }
  if (f.id === 'apptForm') {
    e.preventDefault();
    const fd = new FormData(f);
    const body = { ...v, pets: fd.getAll('pets'), repeatWeeks: +v.repeatWeeks };
    const sealIt = async () => { body.place = await lock(body.place); body.notes = await lock(body.notes); };
    return act(async () => {
      await sealIt();
      if (f.dataset.id) await api.patch(`/families/${state.fid}/appts/${f.dataset.id}`, { edit: body });
      else await api.post(`/families/${state.fid}/appts`, body);
      closeSheet(); await apptChanged(); toast(f.dataset.id ? 'Saved' : '🐾 Added — it\'s on the feed and the calendar');
    });
  }
  if (f.id === 'apptDoneForm') {
    e.preventDefault();
    return act(async () => {
      const r = await api.patch(`/families/${state.fid}/appts/${f.dataset.id}`, { done: true, ...v, outcome: await lock(v.outcome) });
      // An encrypted family's dog records are locked, so this phone writes the new due date.
      if (fam().e2ee && r.appt.type === 'vaccine' && r.appt.vaccine) await recordVaccine(r.appt, v.date || (r.appt.dropAt || r.appt.pickAt).slice(0, 10), v.nextDue);
      closeSheet(); await apptChanged();
      toast(r.next ? `✓ Done · next one ${whenText(r.next.dropAt || r.next.pickAt)}` : '✓ Done');
    });
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
      // 🔐 Our family is encrypted from the start, and keeps its copy of the connection key.
      const all = await keys.all();
      if (!r.family.e2ee) await encryptFamily(r.family.fid); else famKeys[r.family.fid] = all[r.family.fid] || null;
      const ck = LS.get('fam.inviteCk');
      if (ck && fk(r.family.fid) && r.connectedFid) await api.put(`/families/${r.family.fid}/connkeys/${r.connectedFid}`, { ck: await seal(fk(r.family.fid), ck) });
      LS.set('fam.invite', null); LS.set('fam.inviteCk', null); state.invite = null; state.fid = r.family.fid; state.view = 'family';
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
    return act(async () => {
      const r = await api.post(`/families/${state.fid}/invites`, { kind: 'family', ...v });
      let ck = null;
      if (fk()) { ck = newKey(); await api.put(`/families/${state.fid}/connkeys/pending/${r.invite.code}`, { ck: await seal(fk(), ck) }); }
      inviteSheet(r.invite, v.email, ck);
    });
  }
  if (f.id === 'postForm') {
    e.preventDefault();
    if (lockedHere()) return toast('🔒 This device needs the family key first — Me › 🔐 Encryption');
    return act(async () => {
      const help = draft.help ? { type: draft.help.type, from: v.from, to: v.to || v.from, time: v.time } : null;
      // 🔐 Locked on this phone: with the family key, or (for friends' families) the post's own key.
      let text = v.text, photo = draft.photo, pk;
      if (fk()) {
        let k = fk();
        if (draft.audience === 'connections') {
          k = newKey();
          const conns = {};
          for (const [other, sealedCk] of Object.entries(fam().connkeys || {})) { const ck = await tryOpen(fk(), sealedCk, null); if (ck) conns[other] = await seal(ck, k); }
          pk = { fam: await seal(fk(), k), conns };
        }
        text = text ? await seal(k, text) : ''; photo = photo ? await seal(k, photo) : '';
      }
      const r = await api.post(`/families/${state.fid}/posts`, { text, photo, pk, tags: draft.tags, audience: draft.audience, help });
      r.post = await openPost(r.post);
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
      const p = state.feed.find((x) => x.id === post.dataset.post);
      const r = await api.post(`/posts/${post.dataset.fid}/${post.dataset.post}/comments`, { text: p._key ? await seal(p._key, v.text) : v.text });
      r.comment.text = v.text;
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
document.addEventListener('toggle', (e) => {
  if (e.target.matches?.('details[data-house]')) { LS.set('fam.houseOpen', e.target.open ? '1' : '0'); const f = e.target.querySelector('.fold'); if (f) f.textContent = e.target.open ? 'Hide' : 'Show'; return; } const c = e.target.closest?.('[data-couple]'); if (c && e.target === c) bingo.open[c.dataset.couple] = c.open; }, true);
document.addEventListener('input', (e) => { if (e.target.closest?.('#bingoForm') && e.target.name === 'text') bingoCountLine(); });

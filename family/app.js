// 👨‍👩‍👧 OurPawmily Families (preview): sign in with Google, create a family, invite the people
// in it by email, add pets and kids, a private feed, and who-sees-what for diet & fitness.
// The trackers (food, training, dogs, calendar) stay in the current app for now; their data
// comes over with "Bring over the current app".
import { api } from './api.js';
import { sealBytes, openBytes } from './crypto.js';
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
  poop: ['💩', 'Poop patrol'], trash: ['🗑️', 'Garbage'], laundry: ['🧺', 'Laundry'], groceries: ['🛒', 'Groceries'], cleaning: ['🧽', 'Cleaning'], dishes: ['🍽️', 'Dishes'],
  cook_b: ['🍳', 'Cooked breakfast'], cook_l: ['🥪', 'Cooked lunch'], cook_d: ['🍝', 'Cooked dinner'] };
const DOG_KINDS = ['breakfast', 'dinner', 'walk', 'park', 'treat', 'meds'], HOUSE_KINDS = ['cook_b', 'cook_l', 'cook_d', 'dishes', 'trash', 'laundry', 'groceries', 'cleaning', 'poop'];
const PTS = { breakfast: 1, dinner: 1, walk: 2, park: 2, treat: 0, meds: 1, poop: 2, trash: 1, laundry: 3, groceries: 3, cleaning: 4, dishes: 1, cook_b: 2, cook_l: 2, cook_d: 3 };
// The family's own chores (added with ＋ Add a chore) sit with the built-in ones: "x_<id>".
const ownChores = () => (fam()?.chores || []);
const careMeta = (k) => CARE[k] || (() => { const c = ownChores().find((x) => `x_${x.id}` === k); return c ? [c.icon, c.label] : ['✅', 'Chore']; })();
const ptsOf = (k) => PTS[k] ?? ownChores().find((x) => `x_${x.id}` === k)?.pts ?? 0;
// Two rows: the dogs and the house (older "kitchen" chores belong to the house). Built-in chores
// a family removed (fam.hiddenChores) are left out.
const hiddenChores = () => fam()?.hiddenChores || [];
const sectionOf = (c) => (c.section === 'dogs' ? 'dogs' : 'house');
const kindsIn = (section, base) => [...base.filter((k) => !hiddenChores().includes(k)), ...ownChores().filter((c) => !c.gone && sectionOf(c) === section).map((c) => `x_${c.id}`)];
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
// Something in the sheet that's open now (a closed sheet keeps its last content).
const open$ = (sel) => ($('#sheet').open ? $(`#sheetBody ${sel}`) : null);
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
  const hv = location.hash.match(/^#(feed|dogs|calendar|me|us|threads)$/)?.[1];
  if (hv) { state.view = hv === 'dogs' ? 'pets' : hv; history.replaceState(null, '', location.pathname + location.search); }
  show(state.view === 'member' && !member(state.memberId) ? 'feed' : state.view === 'us' && !partnerMember() ? 'feed' : state.view);
  refreshPush();
  if (partnerMember() && state.view !== 'us') loadUs().then(usBadge).catch(() => {});
}
async function loadFamily() {
  const r = await api.get(`/families/${state.fid}`);
  state.family = r.family; state.connected = r.connected;
  LS.set('fam.fid', state.fid);
  jobs.list = null; setTimeout(() => resumeJobs().catch(() => {}), 0);
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
  if (on) {
    $('#navMe').hidden = !$('#navTrackers').hidden;
    document.querySelector('#nav [data-view=us]').hidden = !partnerMember();
    const m = me(), pic = m?.avatar?.startsWith('data:') || m?.avatar?.startsWith('http') ? m.avatar : state.user?.picture;
    $('#meTop').innerHTML = pic ? `<img src="${esc(pic)}" alt="">` : esc((m?.name || '?')[0]);
  }
  if (on) $('#famSwitch').innerHTML = `<b>${esc(fam().name)}</b><span class="caret">▾</span>${api.mode() === 'demo' ? '<span class="pill demo">Demo</span>' : ''}`;
}

// ---------- signing in ----------
async function signIn() {
  chrome(false);
  const cfg = await api.liveConfig();
  $('#view').innerHTML = `<section class="hero">
      <img class="logo-img" src="../icon.svg?v=2" alt="" width="88" height="88">
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
      <a class="small" href="../">🥗 Just the trackers? Open them without signing in ›</a>
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
  if (view === 'threads') { state.famTab = 'threads'; LS.set('fam.famTab', 'threads'); view = 'feed'; }
  if (view !== 'compose') state.prevView = view;
  state.view = view;
  if (view === 'member') state.memberId = extra;
  if (view === 'compose') { state.view = state.prevView || 'feed'; return plusMenu(); }
  chrome(true);
  const lit = view === 'member' || view === 'family' ? 'me' : view === 'watch' || view === 'bingo' ? 'us' : view;
  document.querySelectorAll('#nav [data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === lit));
  window.scrollTo(0, 0);
  if (view !== 'bingo') clearInterval(bingo.timer);
  ({ feed: feedView, family: familyView, pets: petsView, me: meView, member: memberView, bingo: bingoView, calendar: calendarView, watch: watchView, us: usView })[view]?.();
}
const demoBanner = () => (api.mode() === 'demo' ? '<div class="banner">Demo — everything stays on this phone.</div>' : '');

async function feedView() {
  state.famTab ||= LS.get('fam.famTab') || 'moments';
  $('#view').innerHTML = `${demoBanner()}<div class="seg famtabs" role="tablist">${[['moments', 'Moments'], ['threads', 'Threads']].map(([k, l]) => `<button type="button" role="tab" class="${state.famTab === k ? 'on' : ''}" data-famtab="${k}">${l}${k === 'threads' ? ' <i class="dot" id="thDot" hidden></i>' : ''}</button>`).join('')}</div>
    <div id="famBody"></div>`;
  if (th.list.length) $('#thDot').hidden = !unreadThreads().length;
  if (state.famTab === 'threads') { threadsView(); loadUs().then(() => usBadge()); return; }
  $('#famBody').innerHTML = `<section class="nextup" id="nextUp" hidden></section><div id="digest"></div>
    <button type="button" class="sharebar" data-act="post">${avatar(me(), 30)}<span>Share with the family…</span><b>📷 Photo</b></button>
    <section class="card yourday" id="yourDay"><div class="skeleton line"></div></section>
    <section class="card today" id="today"><div class="skeleton line"></div></section>
    <section class="card news" id="newsCard" hidden></section>
    <section class="card movies" id="moviesCard" hidden></section>
    <div id="comingLine"></div>
    <div id="goldNews"></div>
    <div id="posts"><div class="skeleton card"></div><div class="skeleton card"></div></div>`;
  goldNews();
  renderYourDay();
  renderMovies().catch(() => {});
  renderNews().catch(() => {});
  renderNextUp().catch(() => {});
  importUs().catch(() => {});
  const [r] = await Promise.all([act(() => api.get('/feed')), loadAppts(), loadUs(), loadThreads().catch(() => {})]);
  renderToday(); renderComingLine(); usBadge();
  if ($('#digest')) $('#digest').innerHTML = digestCard();
  if ($('#thDot')) $('#thDot').hidden = !unreadThreads().length;
  if (!r) return;
  state.feed = await Promise.all(r.posts.map(openPost));
  renderPosts();
  setTimeout(() => moveOldPhotos().catch(() => {}), 1500);
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
    ${p.photoId ? photoBox(p) : p.photo ? `<img class="photo" src="${p.photo}" alt="" loading="lazy">` : ''}
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
let posting = false; // one post at a time: extra taps while it sends do nothing
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
// ---------- 📸 photos as files: two sizes, locked as bytes, loaded as they scroll into view ----------
const randomToken = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
let photoSupport = null;
// Does the connector have photo storage (R2)? Asked once.
function photosReady() {
  photoSupport ||= api.get(`/families/${state.fid}/photos`).then(() => true).catch((e) => (e.status === 501 ? false : (photoSupport = null, false)));
  return photoSupport;
}
// A picked photo (File, or the preview data URL) → {full, thumb: JPEG bytes, aspect}.
async function photoFiles(src) {
  // A data URL is turned into bytes here (the app's security policy doesn't allow fetching data: links).
  const fromDataUrl = (u) => { const [head, b64] = u.split(','); const bin = atob(b64); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return new Blob([out], { type: head.slice(5).split(';')[0] || 'image/jpeg' }); };
  const bmp = await createImageBitmap(src instanceof Blob ? src : fromDataUrl(src));
  const make = async (max, q) => {
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas');
    c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
    return new Uint8Array(await blob.arrayBuffer());
  };
  return { full: await make(1600, 0.82), thumb: await make(560, 0.72), aspect: Math.round((bmp.width / bmp.height) * 1000) / 1000 };
}
// Unlocked photos: in memory for this visit, and on the phone (IndexedDB) for next time.
const photoKeys = new Map();   // photoId → the post's key (null when not locked)
const photoUrls = new Map();   // "id:size" → blob: URL
const photoDb = () => new Promise((res, rej) => { const r = indexedDB.open('pawmily-photos', 1); r.onupgradeneeded = () => r.result.createObjectStore('p'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function photoCached(key) { try { const d = await photoDb(); return await new Promise((res) => { const q = d.transaction('p').objectStore('p').get(key); q.onsuccess = () => res(q.result || null); q.onerror = () => res(null); }); } catch { return null; } }
async function photoCache(key, bytes) { try { const d = await photoDb(); d.transaction('p', 'readwrite').objectStore('p').put(bytes, key); } catch { /* private mode */ } }
function rememberPhoto(id, size, bytes) {
  const k = `${id}:${size}`;
  if (!photoUrls.has(k)) photoUrls.set(k, URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })));
  photoCache(k, bytes);
  return photoUrls.get(k);
}
async function photoUrl(fid, id, size, key) {
  const k = `${id}:${size}`;
  if (photoUrls.has(k)) return photoUrls.get(k);
  const cached = await photoCached(k);
  if (cached) { photoUrls.set(k, URL.createObjectURL(new Blob([cached], { type: 'image/jpeg' }))); return photoUrls.get(k); }
  const locked = await api.bytes('GET', `/families/${fid}/photos/${id}?size=${size}`);
  return rememberPhoto(id, size, key ? await openBytes(key, locked) : locked);
}
async function photoDataUrl(fid, id, key) {
  await photoUrl(fid, id, 'full', key);
  const bytes = await photoCached(`${id}:full`);
  if (!bytes) return '';
  let bin = ''; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return `data:image/jpeg;base64,${btoa(bin)}`;
}
// The box a photo shows in: the right shape straight away (no jumping), filled when it's near.
function photoBox(p, cls = '') {
  photoKeys.set(p.photoId, p._key || null);
  const src = photoUrls.get(`${p.photoId}:thumb`) || '';
  return `<button type="button" class="ph ${cls}" style="aspect-ratio:${cls === 'grid' ? 1 : p.aspect || 1}" data-photoid="${p.photoId}" data-pfid="${p.fid}" aria-label="Open photo"><img alt="" ${src ? `src="${src}"` : ''}></button>`;
}
const photoSeen = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver((list) => {
  for (const x of list) {
    if (!x.isIntersecting) continue;
    photoSeen.unobserve(x.target);
    const el = x.target, id = el.dataset.photoid, img = el.querySelector('img');
    if (img.getAttribute('src')) continue;
    el.classList.add('loading');
    photoUrl(el.dataset.pfid, id, 'thumb', photoKeys.get(id)).then((u) => { img.src = u; }).catch(() => { el.classList.add('missing'); }).finally(() => el.classList.remove('loading'));
  }
}, { rootMargin: '600px 0px' }) : null;
// Any photo box that appears on screen (feed, a person's page) gets watched.
new MutationObserver(() => { for (const el of document.querySelectorAll('.ph[data-photoid]:not([data-w])')) { el.dataset.w = '1'; if (photoSeen) photoSeen.observe(el); else photoUrl(el.dataset.pfid, el.dataset.photoid, 'thumb', photoKeys.get(el.dataset.photoid)).then((u) => { el.querySelector('img').src = u; }).catch(() => {}); } })
  .observe(document.body, { childList: true, subtree: true });
// Tap: the full photo.
async function photoViewer(fid, id) {
  openSheet(`<div class="viewer"><img alt="" src="${photoUrls.get(`${id}:thumb`) || ''}"><p class="small muted center" id="viewerNote">Loading the full photo…</p><div class="row end"><button type="button" class="ghost" data-act="close">Close</button></div></div>`);
  try { const u = await photoUrl(fid, id, 'full', photoKeys.get(id)); const img = $('.viewer img'); if (img) img.src = u; $('#viewerNote')?.remove(); }
  catch { if ($('#viewerNote')) $('#viewerNote').textContent = "Couldn't load the full photo."; }
}
// Older posts kept their photo inside: moved to files in the background, once per family per
// phone (only a device that can unlock them). It also frees the storage the old copies used.
let moving = false;
async function moveOldPhotos() {
  const flag = `fam.photosMoved.${state.fid}`;
  if (moving || LS.get(flag) || lockedHere() || !(await photosReady())) return;
  moving = true;
  let n = 0;
  try {
    for (let from = 0; from != null;) {
      const r = await api.get(`/families/${state.fid}/posts?from=${from}`);
      for (const raw of r.posts) {
        if (!raw.photo || raw.photoId) continue;
        const p = await openPost(raw);
        if (!p.photo) continue;
        const made = await photoFiles(p.photo);
        const id = randomToken();
        for (const size of ['thumb', 'full']) await api.bytes('PUT', `/families/${state.fid}/photos/${id}?size=${size}`, p._key ? await sealBytes(p._key, made[size]) : made[size]);
        try { await api.patch(`/posts/${state.fid}/${p.id}`, { photoId: id, aspect: made.aspect }); n++; rememberPhoto(id, 'thumb', made.thumb); }
        catch (e) { await api.bytes('DELETE', `/families/${state.fid}/photos/${id}`).catch(() => {}); if (e.status !== 409) throw e; } // another phone moved it first
      }
      from = r.next;
    }
    LS.set(flag, '1');
    if (n) toast(`📸 Moved ${n} photo${n === 1 ? '' : 's'} to faster storage`);
  } catch { /* try again next time */ } finally { moving = false; }
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
  const chores = mods.includes('chores');
  // 🏆 The scores first, then the house, then everything about the dogs together, news last.
  $('#view').innerHTML = `${demoBanner()}
    <section class="card gold" id="race"><div class="skeleton line"></div></section>
    ${chores ? `<h3 class="grp-h">🏠 The house</h3><section class="card care" id="careHouse"><div class="skeleton line"></div></section>` : ''}
    ${dogs ? `<h3 class="grp-h">🐾 The dogs</h3><section class="card care" id="careDogs"><div class="skeleton line"></div></section>
    <section class="card walkcard" id="walk"><div class="skeleton line"></div></section>
    <section class="card" id="coming"><div class="skeleton line"></div></section>
    <section class="card" id="vax" hidden></section>
    <section class="card"><b class="small">😊 How happy are the dogs</b><div id="happy"><div class="skeleton line"></div></div></section>
    <div class="dogcards" id="dogcards">${dogsOf().map((p) => dogCard(p)).join('')}</div>
    <button type="button" class="ghost wide" data-act="addpet">＋ Add a pet</button>
    <section class="card" id="spend" hidden></section>` : ''}
    <section id="fame"></section>
    ${dogs ? '<section class="card rescue" id="rescue"><div class="skeleton line"></div></section>' : ''}`;
  renderCare(); renderRace();
  if (dogs) renderRescue().catch(() => {});
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
  el.innerHTML = `<div class="row between"><b>📅 Appointments</b><button type="button" class="linkish small" data-act="apptnew">＋ Appointment</button></div>
    ${up.length ? up.slice(0, 6).map((a) => apptRow(a)).join('') : '<p class="small muted">No appointments. Add grooming, the vet or a vaccination — with who drops off and who picks up.</p>'}
    <div id="dogCal"></div>`;
  dogCalSuggestions().catch(() => {});
}
// 📲 Dog things in your linked calendars (an iPhone calendar's "Grooming – Layla"), offered as
// dog appointments. Your answer is kept on this phone; a made one hides the calendar copy.
const dogCalKey = () => `fam.dogCal.${state.fid}`;
const dogCalMarks = () => { try { return JSON.parse(LS.get(dogCalKey()) || '{}'); } catch { return {}; } };
const dogCal = { list: [] };
async function dogCalSuggestions() {
  const el = $('#dogCal');
  if (!el) return;
  if (!calm.feeds.length && !dogCal.loaded) { dogCal.loaded = true; await loadCal().catch(() => {}); }
  const { dogEvent } = await import('../js/dogcal.js');
  const cache = feedCache(), marks = dogCalMarks(), today = isoLocal(), until = shiftLocal(today, 45);
  const dogs = dogsOf().map((p) => ({ id: p.id, name: p.name }));
  const places = Object.values(dogsHub.profiles).flatMap((d) => [d.vet?.name || d.vet, d.groomer?.name || d.groomer]).filter((x) => typeof x === 'string');
  dogCal.list = [];
  for (const f of calm.feeds) for (const e of cache[f.id]?.events || []) {
    const key = `${f.id}:${String(e.id || '').replace(/-\d+$/, '')}:${e.date}`;
    if (!e.date || e.date < today || e.date > until || marks[key]) continue;
    const m = dogEvent(e, dogs, places);
    if (!m) continue;
    // Already an appointment that day for those dogs: nothing to offer.
    if (dogsHub.appts.some((a) => (a.dropAt || a.pickAt || '').slice(0, 10) === e.date && (!m.pets.length || m.pets.some((id) => a.pets.includes(id))))) continue;
    dogCal.list.push({ key, e, m, feed: f.name });
  }
  dogCal.list.sort((a, b) => `${a.e.date}${a.e.start || ''}`.localeCompare(`${b.e.date}${b.e.start || ''}`));
  if (!$('#dogCal')) return;
  $('#dogCal').innerHTML = dogCal.list.slice(0, 4).map((x, i) => `<div class="dogcal"><div class="grow"><small class="muted">📲 From ${esc(x.feed || 'a linked calendar')}</small>
      <b>${(APPT[x.m.type] || APPT.other)[0]} ${esc(x.e.title)}</b><small class="muted">${esc(dayText(x.e.date, x.e.allDay ? '' : x.e.start))}${x.e.place ? ` · ${esc(x.e.place)}` : ''}</small>
      <div class="row wrap"><button type="button" class="small" data-dogcal="${i}">Make it a dog appointment</button><button type="button" class="ghost small" data-dogcalno="${i}">Not a dog thing</button></div></div></div>`).join('');
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
// Your own trackers (unlocked), read once a minute at most: Today and Your day both use them.
let mineCache = null;
function myTrackers() {
  if (!mineCache || Date.now() - mineCache.at > 60000 || mineCache.fid !== state.fid) {
    mineCache = { at: Date.now(), fid: state.fid, p: api.get(`/families/${state.fid}/members/${fam().me}/data`).then(openData).catch(() => null) };
  }
  return mineCache.p;
}
// 🏃 Your day (top of the feed): the best run and ride windows, dog walks, and your Movement
// classes, in time order — what the trackers' Home used to show. After 9 PM it plans tomorrow.
async function renderYourDay() {
  const el = $('#yourDay');
  if (!el) return;
  try {
    const [{ B, hourly }, mine] = await Promise.all([walkWeather(), myTrackers()]);
    if (!$('#yourDay')) return;
    const clock = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
    const temps = (start, n) => { const ts = hourly.slice(start, start + n + 1).map((h) => Math.round(h.temp)); const lo = Math.min(...ts), hi = Math.max(...ts); return hi - lo < 2 ? `${lo}°` : `${lo}–${hi}°`; };
    const { from, end, late } = B.planRange(hourly, new Date());
    const day = hourly[from].time;
    const items = [], acts = [];
    const run = B.bestWindow(hourly, 'run', 1, from, end), bike = B.bestWindow(hourly, 'bike', 3, from, end);
    if (run?.score > 0) acts.push({ w: run, item: { t: hourly[run.start].time, label: '🏃 Run', temp: temps(run.start, 1) } });
    if (bike?.score > 0) acts.push({ w: bike, item: { t: hourly[bike.start].time, label: '🚴 Ride', temp: temps(bike.start, 3), note: `until ${clock(new Date(hourly[bike.start + 2].time.getTime() + 36e5))}` } });
    if ((fam().modules || []).includes('dogs') && dogsOf().length) {
      const walks = B.dogWalks(hourly, from);
      // A dog walk inside a run or ride window rides along (🐾 on that line).
      for (const wk of [walks.morning, walks.evening]) {
        if (!wk || wk.index >= end) continue;
        const with_ = acts.filter((a) => wk.index >= a.w.start && wk.index < a.w.start + a.w.hours);
        if (with_.length) for (const a of with_) a.paw = true;
        else items.push({ t: hourly[wk.index].time, label: '🐕 Walk the dogs', temp: temps(wk.index, 1) });
      }
    }
    for (const a of acts) items.push(a.paw ? { ...a.item, label: `${a.item.label} 🐾` } : a.item);
    for (const c of B.classesOn(Array.isArray(mine?.gymClasses) ? mine.gymClasses : [], day)) {
      const [hh, mm] = String(c.time).split(':').map(Number);
      const t = new Date(day); t.setHours(hh, mm || 0, 0, 0);
      items.push({ t, label: `${B.CLASS_TYPES[c.type]?.split(' ')[0] || '🧗'} ${c.name}`, note: B.GYMS[c.gym]?.short || '' });
    }
    const now = Date.now();
    const list = items.filter((i) => late || i.t.getTime() + 36e5 > now).sort((a, b) => a.t - b.t);
    const gyms = Object.keys(B.GYMS).map((k) => `<span><b>${esc(B.GYMS[k].short)}</b> <a href="${B.gymSchedule(k, 'yoga')}" target="_blank" rel="noopener">🧘 Yoga</a> · <a href="${B.gymSchedule(k, 'fitness')}" target="_blank" rel="noopener">🏋️ Fitness</a></span>`).join('');
    el.innerHTML = `<div class="row between"><b>🏃 ${late ? `Tomorrow · ${day.toLocaleDateString(undefined, { weekday: 'long' })}` : 'Your day'}</b><span class="small muted">best times outside</span></div>
      ${list.length ? `<ul class="dayplan">${list.map((i) => `<li><b>${clock(i.t)}</b><span>${esc(i.label)}${i.temp ? ` <span class="plan-temp">${i.temp}</span>` : ''}</span>${i.note ? `<small class="muted">${esc(i.note)}</small>` : ''}</li>`).join('')}</ul>` : '<p class="small muted">No good run, ride or walk windows left today.</p>'}
      ${await habitsLine(mine).catch(() => '')}
      <div class="gymlinks small">🧗 Movement classes: ${gyms}</div>
      ${acts.length > 1 ? '<p class="tiny muted">Run and ride are alternatives — pick whichever fits.' + (list.some((i) => i.label.endsWith('🐾')) ? ' 🐾 = a good time to walk the dogs too.' : '') + '</p>' : ''}`;
  } catch { if ($('#yourDay')) $('#yourDay').remove(); }
}
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
  const v = a || { type: pre.type || 'groom', pets: pre.pets || dogsOf().filter((p) => p.species === 'dog').map((p) => p.id), vaccine: pre.vaccine || '', place: pre.place || '', dropAt: pre.dropAt || '', notes: pre.notes || '', dropBy: fam().me, pickBy: '', repeatWeeks: 0, remind: ['day'] };
  const people = fam().members.filter((m) => m.kind === 'person' && m.status !== 'managed');
  const drivers = (sel) => `<option value="">Anyone</option>${people.map((p) => `<option value="${p.id}" ${sel === p.id ? 'selected' : ''}>${esc(p.id === fam().me ? 'You' : p.name)}</option>`).join('')}`;
  openSheet(`<h2>${a ? 'Edit appointment' : '＋ Dog appointment'}</h2>
    <form id="apptForm" class="stack" data-id="${a?.id || ''}" data-calkey="${esc(pre.calKey || '')}">
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
let careWho = 'me', careToday = []; // who did it: 'me', 'both', or the other grown-up's member id
// A dog chore (built in, or one you added to the dogs' row)?
const isDogKind = (k) => DOG_KINDS.includes(k) || ownChores().some((c) => `x_${c.id}` === k && sectionOf(c) === 'dogs');
async function renderCare() {
  if (!$('#careHouse') && !$('#careDogs')) return;
  const today = isoLocal();
  const r = await act(() => api.get(`/families/${state.fid}/care?to=${today}&days=1`));
  if (!r) return;
  const list = r.days[today] || [];
  careToday = list;
  const count = (k) => list.filter((e) => e.kind === k).length;
  const fedBoth = count('breakfast') && count('dinner');
  const outings = count('walk') + count('park');
  const golden = outings >= 2 || (outings >= 1 && count('treat'));
  const adults = fam().members.filter((m) => m.kind === 'person' && m.status === 'active' && m.relation !== 'child');
  const grownUp = adults.some((m) => m.id === fam().me);
  const other = grownUp && adults.length > 1 ? adults.find((m) => m.id !== fam().me) : null;
  if (careWho !== 'me' && careWho !== 'both' && careWho !== other?.id) careWho = 'me';
  const mods = fam().modules || [];
  const grid = (kinds) => `<div class="care-grid">${kinds.map((k) => { const [ico, label] = careMeta(k); return `<button type="button" class="care-btn ${count(k) ? 'done' : ''}" data-care="${k}"><span>${esc(ico)}</span>${esc(label)}<em class="pts">${ptsOf(k) ? `+${ptsOf(k)}` : '♡'}</em>${count(k) ? `<small>${count(k) > 1 ? `×${count(k)}` : '✓'}</small>` : ''}</button>`; }).join('')}</div>`;
  // Who did it, and today's log, under each card (the house and the dogs each their own).
  const whoHtml = other ? `<div class="whodid" role="radiogroup" aria-label="Who did it"><span class="small muted">Who did it?</span>${[['me', 'Me'], ['both', '👫 Both'], [other.id, esc(other.name)]].map(([v, l]) => `<button type="button" role="radio" aria-checked="${careWho === v}" class="${careWho === v ? 'on' : ''}" data-carewho="${v}">${l}</button>`).join('')}</div>` : '';
  const logHtml = (entries) => (entries.length ? `<ul class="care-log">${entries.slice().reverse().map((e) => {
    const whoNow = e.by.length > 1 ? 'both' : e.by[0];
    const swaps = other && grownUp ? [[fam().me, 'Me'], ['both', '👫 Both'], [other.id, esc(other.name)]].filter(([v]) => v !== whoNow) : [];
    const undo = e.by.includes(fam().me) || e.loggedBy === fam().me || me().role === 'owner';
    return `<li><span>${esc(careMeta(e.kind)[0])} ${esc(careMeta(e.kind)[1])} · <b>${esc(e.byName)}</b> <small class="muted">${new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}</small></span>${swaps.length || undo ? `<span class="care-acts">${swaps.map(([v, l]) => `<button type="button" class="linkish small" data-careset="${e.id}" data-who="${v}">${l}</button>`).join('')}${undo ? '<button type="button" class="linkish small" data-careundo="' + e.id + '">Undo</button>' : ''}</span>` : ''}</li>`;
  }).join('')}</ul>` : '');
  const edit = grownUp ? '<button type="button" class="linkish small" data-act="chores">✎ Edit</button>' : '';
  const dogList = list.filter((e) => isDogKind(e.kind)), houseList = list.filter((e) => !isDogKind(e.kind));
  const house = $('#careHouse'), dogsEl = $('#careDogs');
  if (house) house.innerHTML = `<div class="row between"><span class="small muted">${houseList.length ? `${houseList.length} done today` : 'Nothing yet today'}</span>${edit}</div>
    ${grid(kindsIn('house', HOUSE_KINDS))}${whoHtml}${logHtml(houseList)}`;
  if (dogsEl) dogsEl.innerHTML = `<div class="row between"><span class="small ${golden ? 'good' : 'muted'}">${golden ? '⭐ Golden day' : `${outings} outing${outings === 1 ? '' : 's'} today`}${fedBoth ? ' · ✓ fed twice' : ''}</span>${edit}</div>
    ${grid(kindsIn('dogs', DOG_KINDS))}${whoHtml}${logHtml(dogList)}
    <p class="tiny muted">⭐ A golden day = two outings, or one plus a treat.</p>`;
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
    <ul class="race">${race.board.map((r, i) => `<li><span class="rank">${i === 0 && r.points ? '👑' : i + 1}</span>${avatar(member(r.id), 34)}<span class="rname"><b>${esc(r.id === fam().me ? 'You' : r.name)}</b><small>${r.count} chore${r.count === 1 ? '' : 's'}${(() => { const k = Object.entries(r.kinds || {}), d = k.filter(([x]) => isDogKind(x)).reduce((n, [, c]) => n + c, 0), h = k.filter(([x]) => !isDogKind(x)).reduce((n, [, c]) => n + c, 0); return d && h ? ` · 🐾 ${d} · 🏠 ${h}` : ''; })()}${r.streak > 1 ? ` · 🔥 ${r.streak}-day streak` : ''}</small><i class="rbar"><i style="width:${race.top ? Math.round((r.points / race.top) * 100) : 0}%"></i></i></span><span class="rpts">${r.points}<small>pts</small></span></li>`).join('')}</ul>
    <div class="row between prize"><span>🎁 Prize: <b>${esc(race.prize || 'set a prize!')}</b></span>${me().role === 'owner' ? '<button type="button" class="linkish small" data-act="prize">✎</button>' : ''}</div>`;
  const fame = $('#fame');
  if (fame) fame.innerHTML = race.gold.length ? `<h3>Hall of fame</h3><div class="fame">${race.gold.map((g) => `<div class="mini-gold"><b>${esc(monthName(g.month))}</b><span>${g.winners.map((w) => esc(w.name)).join(' & ')}</span><small>${g.points} pts${g.prize ? ` · ${esc(g.prize)}` : ''}</small></div>`).join('')}</div>` : '';
}
// A little burst of joy for every chore logged.
function celebrate(kind, x, y) {
  const pts = ptsOf(kind);
  const mine = race?.board.find((r) => r.id === fam().me), other = race?.board.find((r) => r.id !== fam().me);
  const after = (mine?.points || 0) + pts;
  const lead = other ? (after > other.points ? ` · ${after - other.points} ahead of ${other.name}` : after === other.points ? ` · tied with ${other.name}` : ` · ${other.points - after} behind ${other.name}`) : '';
  const [ico, label] = careMeta(kind);
  toast(`${ico} ${pts ? `+${pts} ✨` : '♡'} ${label}${lead}`);
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
  const theirPosts = state.feed.filter((p) => p.fid === state.fid && p.by === m.id && (p.photo || p.photoId));
  $('#view').innerHTML = `<button type="button" class="linkish back" data-view="family">‹ Family</button>
    <section class="card profile">${avatar(m, 84)}<h2>${esc(m.name)}</h2>
      <div class="muted">${esc(relLabel(m))}${m.kind === 'pet' && m.breed ? ` · ${esc(m.breed)}` : ''}${m.kind === 'pet' && m.born ? ` · ${ageOf(m.born)}` : ''}</div>
      ${m.status === 'invited' ? `<p class="small">💌 Invited (${esc(m.email)}) <button type="button" class="linkish" data-act="reinvite" data-id="${m.id}">Send the invite again</button></p>` : ''}
      ${m.status === 'managed' && m.kind === 'person' ? `<p class="small muted">No account yet. <button type="button" class="linkish" data-act="reinvite" data-id="${m.id}">Invite by email</button> — or keep managing them here (kids).</p>` : ''}
    </section>
    <section class="card" id="memberData"><div class="skeleton line"></div></section>
    ${theirPosts.length ? `<h3>Posts</h3><div class="grid">${theirPosts.map((p) => (p.photoId ? photoBox(p, 'grid') : `<img src="${p.photo}" alt="" loading="lazy">`)).join('')}</div>` : ''}
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
  return `<b>About ${esc(m.name)}</b>${body ? `<ul class="kv">${body}</ul><a class="small" href="../#dogs">✎ Edit in 🥗 Trackers › Dogs</a>` : '<p class="small muted">Add food, meds, vaccines and the vet in <a href="../#dogs">🥗 Trackers › Dogs</a> — they show up here.</p>'}
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
    <h3>🌗 Appearance</h3>
    <section class="card stack"><div class="seg theme-seg">${[['auto', '📱 Automatic'], ['light', '☀️ Light'], ['dark', '🌙 Dark']].map(([k, l]) => `<label class="segopt"><input type="radio" name="theme" value="${k}" ${(LS.get('pawmily.theme') || 'auto') === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <p class="tiny muted">Automatic follows your phone — on iPhone, Settings › Display &amp; Brightness › Automatic switches to dark at sunset. Applies to OurPawmily and your trackers on this device.</p></section>
    <h3>🎬 Movies</h3>
    <section class="card stack" id="moviePrefs"><label class="switch-row"><span>🎬 Movie releases &amp; reviews<small class="muted">A card in Moments: what's in theaters with critic and audience scores, what's coming, where it's streaming, and 🔔 alerts for the ones you're waiting for. Just for you.</small></span><input type="checkbox" data-moviesonoff="1" ${mv.prefs?.on ? 'checked' : ''}><i class="switch"></i></label></section>
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

// ---------- 💞 just us: feeling like, notes, the Today card, the ＋ menu ----------
const KINDS = {
  dinner: ['🍽️', 'Dinner', 'Anything special? (optional)', 'Where?'], movie: ['🍿', 'Movie', 'Which movie?', 'Theater (optional)'],
  show: ['📺', 'Watch a show', 'Which show?', ''], brunch: ['🥞', 'Brunch', 'Anything special? (optional)', 'Where?'],
  lunch: ['🥗', 'Lunch', 'Anything special? (optional)', 'Where?'], coffee: ['☕', 'Coffee', '', 'Where?'],
  walk: ['🚶', 'Walk / hike', '', 'Where?'], workout: ['🏋️', 'Work out together', 'What? e.g. a run', 'Where? (optional)'],
  date: ['🍷', 'Date night', 'Anything special? (optional)', 'Where? (optional)'],
  drinks: ['🍸', 'Drinks', 'Anything special? (optional)', 'Where?'], event: ['🎟', 'Event', 'Which event?', 'Where? (optional)'],
  outing: ['🧭', 'Outing', '', ''],
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
function feelSheet(kind = 'dinner', preset = null) {
  const k = KINDS[kind] || KINDS.other;
  openSheet(`<h2>✨ Suggest a plan</h2><p class="small muted">to ${esc(partnerName())}</p>
    <form id="feelForm" class="stack">
      <div class="kinds radios">${Object.entries(KINDS).filter(([key]) => key !== 'outing').map(([key, [ico, label]]) => `<label><input type="radio" name="kind" value="${key}" ${key === kind ? 'checked' : ''}><span><b>${ico}</b>${esc(label)}</span></label>`).join('')}</div>
      <label class="kwhat" ${k[2] ? '' : 'hidden'}><span>${esc(k[2] || 'What?')}</span><input name="what" maxlength="80"></label>
      <label class="kwhere" ${k[3] ? '' : 'hidden'}><span>${esc(k[3] || 'Where?')}</span><input name="where" maxlength="80"></label>
      <input type="hidden" name="idea">
      <div class="seg2 radios whens">${Object.entries(WHENS).filter(([key]) => key !== 'today').map(([key, t]) => `<label><input type="radio" name="when" value="${key}" ${key === 'tonight' ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      <label class="kday" hidden>Day<input type="date" name="day" min="${isoLocal()}" value="${isoLocal()}"></label>
      <div class="two"><label>Time (optional)<input type="time" name="time"></label><label>Who<select name="audience"><option value="couple">Just us two</option><option value="family">The whole family</option></select></label></div>
      <div id="feelPicks" class="feelpicks"></div>
      <label>Note (optional)<input name="note" maxlength="140" placeholder="😊"></label>
      <p class="tiny muted">${esc(partnerName())} answers 🙌 I'm in · 🤔 Maybe · ⏰ Another time in 💞 Us. When you're both in, it goes on the 📅 calendar for both of you. 🔐 Only the people it's for can read it.</p>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Send to ${esc(partnerName())} 💞</button></div>
    </form>`);
  feel.cuisine = '';
  if (preset) { const f = $('#feelForm'); feelFill(preset.idea, preset.show); if (preset.note) f.note.value = preset.note; }
  renderFeelPicks();
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
    myTrackers(),
    (fam().modules || []).includes('dogs') ? walkWeather().catch(() => null) : null,
    partnerMember() && !ideas.loaded ? loadIdeas().catch(() => {}) : null,
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
  tiles.push(tonight ? tile((KINDS[tonight.kind] || KINDS.other)[0], 'Tonight', esc(planTitle(tonight)), tonight.agreed ? 'it\'s a plan 🙌' : 'waiting for an answer', 'data-view="us"') : (tonightPick() ? tile('✨', 'Tonight?', esc(tonightPick().title), esc(tonightPick().sub), 'data-tonight="1"') : tile('✨', 'Tonight', 'Nothing yet', 'suggest something', 'data-feel="dinner"')));
  const day = mine?.days?.[today];
  tiles.push(day?.left ? tile('🥗', 'Macros left', `${day.left.p}P · ${day.left.c}C · ${day.left.f}F`, `${Math.max(0, day.left.kcal).toLocaleString()} kcal`, 'data-trackers="1"') : tile('🥗', 'Trackers', 'Today\'s plan', 'open your trackers', 'data-trackers="1"'));
  el.innerHTML = `<div class="row between"><b>☀️ Today · ${new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</b>${weather ? `<span class="small muted">${Math.round(weather.hourly[weather.from].temp)}°</span>` : ''}</div>
    <div class="grid4">${tiles.join('')}</div>${await callLine()}`;
}
// 📞 One line under Today: the best time to call Mom (for whoever the trackers set it up for) —
// the next window that's still open today, else tomorrow's first.
async function callLine() {
  if (!me()?.legacyId) return '';
  const B = await import('../js/brief.js');
  if (B.CALL.who !== me().legacyId) return '';
  const now = Date.now();
  let day = 'today', w = B.callWindows(isoLocal()).find((x) => x.end > now);
  if (!w) { day = 'tomorrow'; w = B.callWindows(shiftLocal(isoLocal(), 1))[0]; }
  const t = (d, tz) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', ...(tz ? { timeZone: tz } : {}) }).replace(':00', '');
  const live = w && w.start <= now;
  const when = w ? `${live ? `<span class="ok">now</span> — until ${t(w.end)}` : `${day} ${t(w.start)}–${t(w.end)}`} <span class="muted">(${t(w.start, B.CALL.there.tz)} her time)</span>` : '';
  // 🔁 Every two weeks: quiet until it's due, then a box to tick (and a notification each day it's due).
  await loadNudges();
  const n = callNudge.data;
  const short = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  if (!n) return `<p class="call-line small">📞 <b>Call Mom</b> ${when} · <button type="button" class="linkish small" data-callnudge="setup">🔁 Remind me every 2 weeks</button></p>`;
  if (!n.due) {
    const left = Math.round((Date.parse(n.next) - Date.parse(isoLocal())) / 864e5);
    return `<p class="call-line small">📞 Called Mom ${n.last ? short(n.last) : ''} ✓ <span class="muted">· next in ${left} day${left === 1 ? '' : 's'}</span>${n.canUndo && n.last === isoLocal() ? ' · <button type="button" class="linkish small" data-callnudge="undo">Undo</button>' : ''} · <button type="button" class="linkish small" data-callnudge="edit">every ${n.every} days</button></p>`;
  }
  return `<div class="call-due"><label class="call-check"><input type="checkbox" data-callnudge="done"><span></span></label>
    <div class="grow"><b>📞 Time to call Mom</b><small class="muted">${n.last ? `Last call ${short(n.last)} (${Math.round((Date.parse(isoLocal()) - Date.parse(n.last)) / 864e5)} days ago)` : `Every ${n.every} days`}${w ? ` · best ${when}` : ''}</small></div>
    <button type="button" class="linkish tiny" data-callnudge="edit">⋯</button></div>`;
}
const callNudge = { data: null, all: null };
// 🔁 Check-in reminders for this account (Call Mom, Run, Ride, Hot yoga), loaded once a session.
async function loadNudges(fresh = false) {
  if (!callNudge.all || fresh) callNudge.all = await api.get(`/account/nudges?today=${isoLocal()}`).then((r) => r.nudges).catch(() => callNudge.all || {});
  callNudge.data = callNudge.all.callmom || null;
  return callNudge.all;
}
const setNudges = (r) => { callNudge.all = r.nudges; callNudge.data = r.nudges.callmom || null; };
const MOVE_NUDGES = { run: ['🏃', 'Run', 2, 'running'], bike: ['🚴', 'Ride', 3, 'cycling'], hotyoga: ['🧘', 'Hot yoga', 3, 'hotYoga'] };
// The last day you did each, from WHOOP / Strava workouts and what you logged in the trackers.
async function lastWorkouts(mine) {
  const A = await import('../js/activity.js');
  const last = {};
  const note = (sport, day) => { if (sport && day && (!last[sport] || day > last[sport])) last[sport] = day; };
  for (const w of Array.isArray(mine?.workouts) ? mine.workouts : []) note(A.sportOf(w.name || ''), isoLocal(new Date(w.start)));
  for (const a of Array.isArray(mine?.activities) ? mine.activities : []) note(a.sport, a.date);
  return last;
}
// 🏃 The habits line in Your day: due ones with a box to tick, the rest quietly "next Thu".
async function habitsLine(mine) {
  const all = await loadNudges();
  const on = Object.keys(MOVE_NUDGES).filter((k) => all[k]);
  if (!on.length) return '<p class="small habits-setup"><button type="button" class="linkish small" data-act="habits">🔁 Remind me to run, ride or do hot yoga every few days</button></p>';
  // A run or ride from WHOOP / Strava (or logged in the trackers) ticks it off by itself.
  const last = await lastWorkouts(mine).catch(() => ({}));
  for (const k of on) {
    const d = last[MOVE_NUDGES[k][3]];
    if (d && d <= isoLocal() && (!all[k].last || d > all[k].last)) setNudges(await api.post(`/account/nudges/${k}/done?today=${isoLocal()}`, { date: d }));
  }
  const short = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short' });
  return `<div class="habits">${on.map((k) => {
    const n = callNudge.all[k], [ico, label] = MOVE_NUDGES[k];
    if (n.due) return `<label class="habit due"><input type="checkbox" data-nudgedone="${k}"><span class="hc"></span>${ico} <b>${label}</b><small>${n.last ? `${Math.round((Date.parse(isoLocal()) - Date.parse(n.last)) / 864e5)} days` : 'due'}</small></label>`;
    return `<span class="habit">${ico} ${label} <small>✓ ${n.last === isoLocal() ? 'today' : short(n.last)} · next ${short(n.next)}</small>${n.canUndo && n.last === isoLocal() ? ` <button type="button" class="linkish tiny" data-nudgeundo="${k}">Undo</button>` : ''}</span>`;
  }).join('')}<button type="button" class="linkish tiny" data-act="habits" aria-label="Reminder settings">⋯</button></div>`;
}
function habitsSheet() {
  const all = callNudge.all || {};
  const opts = (cur) => [1, 2, 3, 4, 5, 7].map((d) => `<option value="${d}" ${d === cur ? 'selected' : ''}>${d === 1 ? 'every day' : d === 7 ? 'once a week' : `every ${d} days`}</option>`).join('');
  openSheet(`<h2>🔁 Remind me</h2><form id="habitForm" class="stack">
    ${Object.entries(MOVE_NUDGES).map(([k, [ico, label, every]]) => `<div class="habit-row"><label class="switch-row"><span>${ico} ${label}</span><input type="checkbox" name="on_${k}" ${all[k] ? 'checked' : ''}><i class="switch"></i></label>
      <select name="every_${k}" aria-label="How often: ${label}">${opts(all[k]?.every || every)}</select></div>`).join('')}
    <p class="tiny muted">It stays quiet until it's been that long since the last one. Then it shows a box to tick in Your day, and a 7 AM notification lists what's due. A run or ride from WHOOP or Strava — or anything you log in the trackers — ticks it off by itself. Turn the notifications off in Me › 🔔 Notifications › Check-in reminders.</p>
    <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Save</button></div></form>`);
}
async function saveHabits(f) {
  const v = Object.fromEntries(new FormData(f));
  for (const k of Object.keys(MOVE_NUDGES)) {
    if (v[`on_${k}`]) setNudges(await api.put(`/account/nudges/${k}?today=${isoLocal()}`, { every: +v[`every_${k}`] }));
    else if (callNudge.all?.[k]) setNudges(await api.del(`/account/nudges/${k}?today=${isoLocal()}`));
  }
  closeSheet(); renderYourDay(); toast('Saved');
}
async function callNudgeAct(what, t) {
  const P = '/account/nudges/callmom';
  if (what === 'setup') { const r = await api.put(`${P}?today=${isoLocal()}`, { every: 14 }); setNudges(r); toast('🔁 Every 2 weeks — tick it off when you\'ve called'); }
  else if (what === 'done') {
    const r = await api.post(`${P}/done?today=${isoLocal()}`, { date: isoLocal() });
    setNudges(r);
    toast(`✓ Called Mom — next reminder ${new Date(`${callNudge.data.next}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}`);
  } else if (what === 'undo') { const r = await api.post(`${P}/undo?today=${isoLocal()}`); setNudges(r); }
  else if (what === 'edit') {
    const n = callNudge.data;
    return openSheet(`<h2>📞 Call Mom</h2><form id="callForm" class="stack">
      <label>Remind me every<select name="every">${[7, 10, 14, 21, 30].map((d) => `<option value="${d}" ${d === n.every ? 'selected' : ''}>${d === 7 ? 'week' : d === 14 ? '2 weeks' : d === 21 ? '3 weeks' : d === 30 ? 'month' : `${d} days`}</option>`).join('')}</select></label>
      <label>Last called<input type="date" name="last" max="${isoLocal()}" value="${n.last || ''}"></label>
      <p class="tiny muted">When it's due, you get one notification a day at the start of a good time to call (her morning or evening) until you tick it off. Turn these off in Me › 🔔 Notifications › Check-in reminders.</p>
      <div class="row between"><button type="button" class="ghost danger" data-callnudge="off">Stop reminding me</button><button>Save</button></div></form>`);
  } else if (what === 'off') { setNudges(await api.del(`${P}?today=${isoLocal()}`)); closeSheet(); toast('Reminders stopped'); }
  renderToday();
}

// 📅 Coming up (one line): the next dog appointment (and an open leg), and the next agreed plan.
function renderComingLine() {
  const el = $('#comingLine');
  if (!el) return;
  const a = dogsHub.appts.find((x) => x.status !== 'done');
  const bits = [];
  if (a) {
    const pets = a.pets.map((id) => member(id)?.name).filter(Boolean).join(' & ');
    const open = (a.dropAt && !a.dropBy) || (a.pickAt && !a.pickBy);
    bits.push(`${(APPT[a.type] || APPT.other)[0]} ${esc(whenText(a.dropAt || a.pickAt))} ${esc(pets)}${open ? ' · <span class="tone-warn">a ride needs a driver</span>' : ''}`);
  }
  el.innerHTML = bits.length ? `<button type="button" class="card coming-line" data-view="pets"><span class="small">📅 <b>Coming up:</b> ${bits.join(' · ')}</span></button>` : '';
}
// ＋ Create: three things for the two of you first, then the family.
function plusMenu() {
  const p = partnerMember();
  const fam4 = [
    ['writeup', '📖', 'Write it up'],
    ['eventnew', '📅', 'Event'],
    ...((fam().modules || []).includes('dogs') ? [['apptnew', '🐾', 'Dog appt']] : []),
    ['post', '📸', 'Post'],
    ['askhelp', '🙋', 'Ask for help'],
  ];
  openSheet(`<div class="row between"><h2>Create</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    ${p ? `<div class="grp">💞 You &amp; ${esc(p.name)}</div><div class="create4">
      <button type="button" class="hot" data-act="feel"><b>✨</b>Suggest</button><button type="button" data-act="outing"><b>🧭</b>Outing</button><button type="button" data-act="note"><b>💌</b>Note</button><button type="button" data-act="lognew"><b>❤️</b>Log date</button></div>` : ''}
    <div class="grp">👨‍👩‍👧 Family</div><div class="create3">${fam4.map(([a, i, l]) => `<button type="button" data-act="${a}"><b>${i}</b>${l}</button>`).join('')}</div>
    <button type="button" class="ghost wide" data-act="close" style="margin-top:12px">Cancel</button>`);
}

// ---------- 💞 Us: everything private between the two of you ----------
// The other grown-up of a couple: a spouse or partner for the family's creator, the creator for them.
function partnerMember() {
  const f = fam(), m = me();
  if (!f || !m || m.kind !== 'person') return null;
  const couple = ['spouse', 'partner'];
  if (m.relation === 'self') return f.members.find((x) => x.kind === 'person' && couple.includes(x.relation)) || null;
  if (couple.includes(m.relation)) return f.members.find((x) => x.kind === 'person' && x.relation === 'self') || null;
  return null;
}
const usSeenKey = () => `fam.usSeen.${state.fid}`;
// What's waiting on you: plans to answer, notes you haven't seen, and "did it happen?" after a plan.
function forYou() {
  const meId = fam().me, seen = +(LS.get(usSeenKey()) || 0);
  const ask = us.plans.filter((p) => isUpcoming(p) && p.by !== meId && p.to?.includes(meId) && !p.replies?.[meId]);
  const notes = us.notes.filter((n) => n.by !== meId && n.at > seen);
  const after = us.plans.filter((p) => p.agreed && !p.done && !isUpcoming(p) && p.day >= shiftLocal(isoLocal(), -7) && !ratedByMe(p.id));
  const matches = ideas.matches || [];
  const eps = (watch.shows || []).filter((x) => x.status === 'watching' && x.ep?.newCount && x.ep.latest >= shiftLocal(isoLocal(), -7) && LS.get(`fam.epSeen.${x.id}`) !== x.ep.latest);
  const letters = th.list.filter((t) => t.aud === 'us' && t.unread).sort((a, b) => (LS.get(`fam.tonight.${b.id}`) ? 1 : 0) - (LS.get(`fam.tonight.${a.id}`) ? 1 : 0));
  return { ask, notes, after, matches, letters, eps, count: ask.length + notes.length + matches.length + letters.length + eps.length };
}
function usBadge() {
  const b = $('#usBadge');
  if (!b) return;
  const n = partnerMember() ? forYou().count : 0;
  b.hidden = !n || state.view === 'us';
  b.textContent = n > 9 ? '9+' : String(n);
}
async function usView() {
  const p = partnerMember();
  if (!p) { $('#view').innerHTML = `${demoBanner()}<section class="card stack"><h2>💞 Us</h2><p class="small">A private space for you and your partner: love notes, plans, date nights and what you're watching. Add your spouse or partner to the family (Me › ＋ Person) to start.</p></section>`; return; }
  $('#view').innerHTML = `${demoBanner()}<div class="us-page">
    <div class="us-title"><h2>💞 ${esc(me().name)} &amp; ${esc(p.name)}</h2><span class="small muted" id="usSub">🔒 Just you two</span></div>
    <section id="usFor"></section>
    <section class="card" id="usNotesC"><div class="skeleton line"></div></section>
    <section class="card" id="usBookC"></section>
    <section class="card" id="usPlansC"></section>
    <section class="card" id="usIdeasC" hidden></section>
    <section class="card" id="usOutC"></section>
    <section class="card" id="usRhythmC"></section>
    <section id="usTonight"></section></div>`;
  importUs().catch(() => {});
  await Promise.all([loadUs(), loadRhythm().then((r) => { calm.rhythm = r; }).catch(() => {}), loadWatch().catch(() => {}), loadIdeas().catch(() => {}), loadThreads().catch(() => {})]);
  if (state.view !== 'us') return;
  renderUs();
  loadTv().then(() => { if (state.view === 'us' && $('#usNotesC')) { renderUs(); usBadge(); } }).catch(() => {});
  // Opening Us counts its new notes as seen (after this visit's "new" marks are drawn).
  LS.set(usSeenKey(), String(Date.now()));
  usBadge();
}
function renderUs() {
  if (!$('#usNotesC')) return;
  const meId = fam().me, f = forYou(), pName = partnerName();
  const wn = (p) => (KINDS[p.kind] || KINDS.other);
  $('#usSub').textContent = `🔒 Just you two${us.streak > 1 ? ` · 💌 ${us.streak}-day note streak` : ''}`;
  // For you
  $('#usFor').innerHTML = f.ask.length || f.notes.length || f.after.length ||  f.matches.length || f.letters.length || f.eps.length ? `<div class="foryou"><div class="row between"><b class="small up">For you</b>${f.count ? `<span class="small" style="color:var(--like);font-weight:800">${f.count}</span>` : ''}</div>
    ${f.eps.map((x) => `<div class="fy"><span class="fy-i">🆕</span><div><b>${esc(x.title)}: ${x.ep.newCount} new episode${x.ep.newCount === 1 ? '' : 's'}</b><small>E${x.ep.from}${x.ep.to !== x.ep.from ? `–${x.ep.to}` : ''} out ${x.ep.latest === isoLocal() ? 'today' : shortDay(x.ep.latest)}${x.ep.nextDrop ? ` · next ${shortDay(x.ep.nextDrop)}` : ''}</small>
      <div class="ans"><button type="button" class="small" data-watchnight="${x.id}">📺 Watching tonight</button><button type="button" class="ghost small" data-epseen="${x.id}:${x.ep.latest}">Later</button></div></div></div>`).join('')}
    ${f.letters.map((t) => `<div class="fy"><span class="fy-i">📓</span><div><b>${t.mine ? `${esc(t.lastByName)} added a note to “${esc(t.title)}”` : `${esc(t.byName)} wrote: ${esc(t.title)}`}</b><small>${t.mins} min read${t.replies ? ` · ${t.replies} note${t.replies === 1 ? '' : 's'}` : ''}${LS.get(`fam.tonight.${t.id}`) ? ' · 🌙 saved for tonight' : ''}</small>
      <div class="ans"><button type="button" class="small" data-thread="${t.fid}:${t.id}">Read</button>${LS.get(`fam.tonight.${t.id}`) ? '' : `<button type="button" class="ghost small" data-tonightlater="${t.id}">🌙 Tonight</button>`}</div></div></div>`).join('')}
    ${f.matches.map((m) => `<div class="fy"><span class="fy-i">💞</span><div><b>It's a match: ${esc(m.idea.title)}</b><small>You both 💗 it${m.idea.day ? ` · ${esc(dayText(m.idea.day, m.idea.time))}` : ''}</small>
      <div class="ans"><button type="button" class="small" data-match="${esc(m.t)}">📅 Make it a plan</button></div></div></div>`).join('')}
    ${f.ask.map((x) => `<div class="fy"><span class="fy-i">${wn(x)[0]}</span><div><b>${esc(member(x.by)?.name || pName)} suggested ${esc(planTitle(x).toLowerCase().startsWith('date night') ? 'a date night' : planTitle(x))}</b><small>${esc(planWhen(x))}${x.where ? ` · ${esc(x.where)}` : ''}${x.note ? ` · “${esc(x.note)}”` : ''}</small>
      ${x.idea ? ideaStrip(x) : ''}
      ${x.outing ? `<small class="muted">${x.outing.stops.map((st) => `${STOP_ICON[st.kind] || '📍'} ${esc(hm(st.time))}`).join(' → ')}</small><button type="button" class="linkish small" data-outplan="${x.id}">🧭 See the plan</button>` : ''}
      <div class="ans">${Object.entries(ANSWERS).map(([k, t], i) => `<button type="button" class="${i ? 'ghost' : ''} small" data-answer="${x.id}:${k}">${t}</button>`).join('')}</div></div></div>`).join('')}
    ${f.notes.map((n) => `<div class="fy"><span class="fy-i">💌</span><div><b>New note from ${esc(member(n.by)?.name || pName)}</b><small>“${esc(n.text)}”</small></div><button type="button" class="heart" data-noteheart="${n.id}" aria-label="Heart">${n.hearts?.includes(meId) ? '❤️' : '🤍'}</button></div>`).join('')}
    ${f.after.map((x) => `<div class="fy"><span class="fy-i">${wn(x)[0]}</span><div><b>How was ${esc(x.outing ? x.outing.title : (FOOD_KINDS.includes(x.kind) && x.where) || planTitle(x))}?</b><small>${esc(planWhen(x))}</small>
      <div class="ans"><button type="button" class="small" data-rate="${x.id}">⭐ Rate it</button><button type="button" class="ghost small" data-rateskip="${x.id}">Skip</button></div></div></div>`).join('')}</div>` : '';
  // Notes
  const mine = (n) => n.by === meId;
  $('#usNotesC').innerHTML = `<div class="row between"><b class="us-h">💌 Notes</b><span class="tiny muted">🔒 just you two</span></div>
    <form id="usNoteForm" class="notebar"><input name="text" maxlength="280" placeholder="Write ${esc(pName)} a note…" autocomplete="off" aria-label="A note"><button>Post</button></form>
    <div class="postits">${us.notes.slice().sort((a, b) => b.at - a.at).map((n) => `<div class="postit ${esc(n.color || 'yellow')}" data-note="${n.id}">${esc(n.text)}
      <small>${esc(mine(n) ? 'You' : member(n.by)?.name || '')} · ${ago(n.at)} <button type="button" class="heart" data-noteheart="${n.id}" aria-label="Heart">${n.hearts?.length ? '❤️'.repeat(Math.min(2, n.hearts.length)) : '🤍'}</button>${mine(n) ? ` <button type="button" class="heart" data-notedel="${n.id}" aria-label="Remove">✕</button>` : ''}</small></div>`).join('') || `<p class="small muted">Leave ${esc(pName)} the first note 💌</p>`}</div>
    <p class="tiny muted">Notes clear after a week unless one of you ❤️ it.</p>`;
  // Plans
  const up = us.plans.filter(isUpcoming).filter((x) => !f.ask.includes(x)).sort((a, b) => a.day.localeCompare(b.day) || (a.time || '').localeCompare(b.time || ''));
  const status = (x) => (x.agreed ? '<span class="tag tg">You\'re both in 🎉</span>'
    : x.by === meId ? (x.to.map((id) => x.replies?.[id]?.r).find(Boolean) ? `<span class="tag tw">${esc(pName)}: ${esc(ANSWERS[x.to.map((id) => x.replies?.[id]?.r).find(Boolean)].replace(/^\S+ /, '').toLowerCase())}</span>` : `<span class="tag">waiting for ${esc(pName)}</span>`)
      : `<span class="tag">you: ${esc((ANSWERS[x.replies?.[meId]?.r] || '').replace(/^\S+ /, '').toLowerCase())}</span>`);
  $('#usPlansC').innerHTML = `<div class="row between"><b class="us-h">✨ Plans</b><button type="button" class="linkish small" data-act="feel">＋ Suggest</button></div>
    ${up.length ? up.map((x) => `<div class="planrow" data-plan="${x.id}"><span>${wn(x)[0]} <b>${esc(planTitle(x))}</b> <small class="muted">· ${esc(planWhen(x))}${x.where ? ` · ${esc(x.where)}` : ''}</small>${x.outing ? ` <button type="button" class="linkish small" data-outplan="${x.id}">See plan</button>` : ''}${x.agreed && x.idea?.reserve ? ` <a class="linkish small" href="${esc(x.idea.reserve)}" target="_blank" rel="noopener">🍽 Reserve</a>` : ''}${x.agreed && x.idea?.kind === 'movie' && x.idea.url ? ` <a class="linkish small" href="${esc(x.idea.url)}" target="_blank" rel="noopener">🎟 Book seats</a>` : ''}</span>${status(x)}
      ${x.by === meId && !x.agreed ? `<span class="planacts"><button type="button" class="linkish small" data-planmove="${x.id}">Another day</button> · <button type="button" class="linkish small" data-plandel="${x.id}">Cancel</button></span>` : ''}</div>`).join('')
      : `<p class="small muted">Nothing planned. <button type="button" class="linkish" data-act="feel">Suggest something for this weekend ✨</button></p>`}`;
  // 2-2-2-2
  const R = calm.R, list = calm.rhythm || [];
  if (R) {
    const st = R.rhythmStatus(list, isoLocal());
    const chip = (k) => { const x = st[k]; const r = R.RHYTHMS[k]; if (k === 'close') return `<span class="rchip">${r.icon} ${x.count} of 2 this week</span>`; const name = r.label.replace('Multi-night ', '').toLowerCase(); return `<span class="rchip ${x.last && x.level === 'due' ? 'due' : ''}">${r.icon} ${!x.last ? `${name} · not yet` : x.level === 'due' ? `${name} due` : x.level === 'soon' ? `${name} soon` : `${name} ✓`}</span>`; };
    const dates = list.filter((e) => e.kind !== 'close').slice().reverse();
    $('#usRhythmC').innerHTML = `<div class="row between"><b class="us-h">💞 2-2-2-2</b><button type="button" class="linkish small" data-act="lognew">❤️ Log a date</button></div>
      <div class="rchips">${['date', 'close', 'overnight', 'getaway'].map(chip).join('')}</div>
      ${dates.length ? `<details class="small"><summary>Last: ${R.momentIcon(dates[0])} ${esc(R.momentText(dates[0]))} · ${esc(new Date(`${dates[0].date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</summary><ul class="list">${dates.slice(0, 12).map((e) => `<li class="row between"><span>${R.momentIcon(e)} ${esc(R.momentText(e))}</span><span><small class="muted">${esc(new Date(`${e.date}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: e.date.slice(0, 4) !== isoLocal().slice(0, 4) ? 'numeric' : undefined }))}</small> <button type="button" class="linkish small" data-momentedit="${esc(e.id)}">✎</button></span></li>`).join('')}</ul></details>`
        : '<p class="small muted">Log your dates and it keeps the rhythm: a date every 2 weeks, us time twice a week, an overnight twice a year, a getaway every 2 years.</p>'}`;
  } else $('#usRhythmC').hidden = true;
  renderIdeasCard(); renderOutingCard();
  // 📓 Our notebook: the write-ups just for the two of you, newest first.
  const book = th.list.filter((t) => t.aud === 'us').sort((a, b) => (b.pinned - a.pinned) || b.lastAt - a.lastAt);
  $('#usBookC').innerHTML = `<div class="row between"><b class="us-h">📓 Our notebook</b><button type="button" class="linkish small" data-act="writeup">✍️ Write</button></div>
    ${book.length ? book.slice(0, 6).map((t) => `<button type="button" class="nbrow" data-thread="${t.fid}:${t.id}"><span class="fp-i">${(THREAD_CATS[t.cat] || THREAD_CATS.learned)[0]}</span><span class="grow"><b>${t.unread ? '<i class="dot"></i>' : ''}${esc(t.title)}</b><small class="muted">${esc(t.mine ? 'You' : t.byName)} · ${ago(t.lastAt)}${t.replies ? ` · ✍️ ${t.replies}` : ''}${t.pinned ? ' · 📌' : ''}</small></span></button>`).join('')
      : `<p class="small muted">Read something, tried something, had an idea? Write ${esc(pName)} about it while it's fresh — it waits here until they have a moment.</p>`}
    ${book.length > 6 ? '<button type="button" class="linkish small" data-board="us" data-famtab="threads">All of it ›</button>' : ''}`;
  // Tonight's show
  const on = (watch.shows || []).filter((x) => x.status === 'watching').sort((a, b) => (b.ep?.newCount ? 1 : 0) - (a.ep?.newCount ? 1 : 0) || (watch.S?.lastActive(b) || '').localeCompare(watch.S?.lastActive(a) || ''))[0];
  const tonightLogged = on?.nights.some((n) => n.date === isoLocal());
  $('#usTonight').innerHTML = `<section class="card tonightc"><span class="big">🍿</span><div class="grow">${on ? `<b>${esc(on.title)}</b>${on.progress ? ` <small class="muted">S${on.progress.s || 1} · E${on.progress.e}</small>` : ''}${on.ep?.newCount ? ` <small class="ep-new">🆕 ${on.ep.newCount} new</small>` : ''}<br><small class="muted">${on.aud === 'family' ? '👨‍👩‍👧 shared with the family' : '🔒 just you two'}</small>` : '<b>Watching together</b><br><small class="muted">Add what you two are watching</small>'}</div>
    ${on ? `<button type="button" class="${tonightLogged ? '' : 'ghost'} small" data-watchnight="${on.id}">${tonightLogged ? '✓ Tonight' : '📺 Tonight'}</button>` : ''}<button type="button" class="linkish small" data-view="watch">All ›</button></section>`;
}
// When you both say yes, the plan goes on the calendar for both of you (once).
async function planToCalendar(p) {
  if (!p?.agreed || p.done) return;
  const k = KINDS[p.kind] || KINDS.other;
  await api.post(`/families/${state.fid}/events/import`, { events: [{ id: `plan${p.id}`, date: p.day, start: p.time || '', end: '', allDay: !p.time, who: [p.by, ...(p.to || [])], remind: p.time ? 60 : null, at: Date.now(), updatedAt: p.at || Date.now(),
    body: await lock({ title: p.outing ? `🧭 ${p.outing.title}` : `${k[0]} ${planTitle(p)}`, place: p.where || '', notes: p.outing ? outingNotes(p.outing) : p.note ? `“${p.note}” — ✨ planned in Us` : '✨ planned in Us' }) }] }).catch(() => {});
}

// ---------- 💡 date ideas: the week's scouted ideas and a starter list, picked in private ----------
// You 💗 ideas on your own; nobody sees your picks. When you've both 💗 the same one, it's a
// match — on both phones, ready to make into a plan.
const ideas = { I: null, week: null, settings: null, mine: [], matches: [], tok: {}, tab: 'all', i: 0, loaded: false };
const passKey = () => `fam.ideaPass.${state.fid}`;
const passed = () => { try { return JSON.parse(LS.get(passKey()) || '{}'); } catch { return {}; } };
async function loadIdeas() {
  ideas.I ||= await import('./ideas.js');
  const r = await api.get(`/families/${state.fid}/ideas`).catch(() => null);
  if (!r) return;
  Object.assign(ideas, { week: r.week, settings: r.settings, mine: r.mine || [], loaded: true });
  const openBox = async (b) => (isSealed(b) ? unlock(b) : (() => { try { return typeof b === 'string' ? JSON.parse(b) : b; } catch { return null; } })());
  ideas.matches = (await Promise.all((r.matches || []).map(async (m) => ({ ...m, idea: (await openBox(m.boxes?.[fam().me])) || (await openBox(Object.values(m.boxes || {})[0])) })))).filter((m) => m.idea);
  const all = [...(r.week?.ideas || []), ...ideas.I.STARTERS, ...ideas.I.againIdeas(calm.rhythm || [])];
  await Promise.all(all.filter((x) => !ideas.tok[x.id]).map(async (x) => { ideas.tok[x.id] = await ideas.I.ideaToken(fk(), state.fid, x.id); }));
}
const ideaById = (id) => [...(ideas.week?.ideas || []), ...(ideas.I?.STARTERS || []), ...(ideas.I?.againIdeas(calm.rhythm || []) || [])].find((x) => x.id === id);
const ideaDeck = (tab = ideas.tab) => (ideas.I ? ideas.I.deck({ week: ideas.week, rhythm: calm.rhythm || [], passed: passed(), tab, today: isoLocal(), taste: taste() }) : []);
const picked = (x) => ideas.mine.includes(ideas.tok[x.id]);
const dayText = (d, t) => `${new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}${t ? ` · ${new Date(`2000-01-01T${t}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}` : ''}`;
function ideaMeta(x) {
  const bits = [];
  if (x.day) bits.push(dayText(x.day, x.time));
  if (x.where) bits.push(x.where);
  if (x.price != null && x.price !== '') bits.push(typeof x.price === 'number' ? (x.price ? `from $${x.price}` : 'free') : x.price);
  if (x.opened) bits.push(`opened ${x.opened}`);
  return bits.map(esc).join(' · ');
}
const scoreLine = (x) => (x.scores ? [x.scores.rt != null ? `🍅 ${x.scores.rt}%` : x.scores.meta != null ? `Ⓜ ${x.scores.meta}` : '', x.scores.audience != null ? `🍿 ${x.scores.audience}` : ''].filter(Boolean).join(' · ') : '');
const ideaIcon = (x) => x.icon || ideas.I?.KIND_ICON[x.kind] || '💡';
// The Us card: "Time for a date?" when the 2-2-2-2 date is due, and the top three.
function ideasCard() {
  if (!ideas.loaded) return '';
  const st = calm.R ? calm.R.rhythmStatus(calm.rhythm || [], isoLocal()).date : null;
  const due = st && (!st.last || st.level === 'due' || st.level === 'soon');
  const top = ideaDeck('all').filter((x) => !picked(x)).slice(0, 3);
  return `<div class="row between"><b class="us-h">${due ? '💡 Time for a date?' : '💡 Date ideas'}</b><span><button type="button" class="linkish small" data-act="ideaset" aria-label="Date idea settings">⚙︎</button> <button type="button" class="linkish small" data-act="ideas">All ›</button></span></div>
    ${due ? `<p class="small muted">${st.last ? 'It\'s been a while since your last date.' : 'Your first date on the 2-2-2-2 is waiting.'} 💗 what you'd like — when you both pick the same one, it's a match.</p>` : '<p class="tiny muted">🔒 Your 💗 stay private until you both pick the same one.</p>'}
    <div class="idealist">${top.map((x) => `<div class="idearow"><span class="ii">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : ideaIcon(x)}</span><div class="grow"><b>${esc(x.title)}</b><small class="muted">${ideaMeta(x) || esc(x.why || '')}${scoreLine(x) ? ` · ${scoreLine(x)}` : ''}</small></div>
      <button type="button" class="icon-btn" data-idea="${esc(x.id)}:pass" aria-label="Not for us">✕</button><button type="button" class="icon-btn pick" data-idea="${esc(x.id)}:pick" aria-label="Pick">💗</button></div>`).join('') || '<p class="small muted">You\'ve been through them all — new ones come every Wednesday.</p>'}</div>
    ${ideas.week ? `<p class="tiny muted">This week around ${esc(ideas.week.area?.label || ideas.settings?.label || 'you')} · ${ideas.week.ideas.length} ideas</p>` : '<p class="tiny muted">Movies, events and new places for your area arrive every Wednesday morning.</p>'}`;
}
function renderIdeasCard() { const el = $('#usIdeasC'); if (el) { el.innerHTML = ideasCard(); el.hidden = !ideas.loaded; } }
// The deck: one idea at a time.
function ideasSheet() {
  const list = ideaDeck();
  ideas.i = Math.min(ideas.i, Math.max(0, list.length - 1));
  const x = list[ideas.i];
  const tabs = Object.entries(ideas.I.TABS).map(([k, l]) => `<button type="button" class="chip ${k === ideas.tab ? 'on' : ''}" data-ideatab="${k}">${l}</button>`).join('');
  const links = x ? [x.reserve ? `<a class="btn small" href="${esc(x.reserve)}" target="_blank" rel="noopener">🍽️ Reserve on OpenTable</a>` : '', x.url ? `<a class="btn ghost small" href="${esc(x.url)}" target="_blank" rel="noopener">${x.kind === 'event' ? '🎟 Tickets' : '🔗 More'}</a>` : ''].join('') : '';
  const times = x?.theatres?.length ? `<div class="stack tight">${x.theatres.map((t) => `<div class="small"><b>${esc(t.name)}</b><div class="rchips">${t.times.slice(0, 8).map((s) => `<span class="rchip">${esc(dayText(s.day, s.time))}${s.format ? ` · ${esc(s.format)}` : ''}</span>`).join('')}</div></div>`).join('')}</div>`
    : x?.kind === 'movie' ? `<p class="tiny muted">Showtimes: ${(ideas.settings?.theatres || []).map(esc).join(' · ') || 'your theatres'}</p>` : '';
  openSheet(`<div class="row between"><h2>💡 Date ideas</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <div class="rchips ideatabs">${tabs}</div>
    ${x ? `<article class="ideacard">${x.img ? `<img class="poster" src="${esc(x.img)}" alt="">` : `<div class="ideabig">${ideaIcon(x)}</div>`}
      <h3>${esc(x.title)}${x.pick ? ' <span class="tag pk">Critics\' pick</span>' : ''}</h3>
      ${ideaMeta(x) ? `<p class="small">${ideaMeta(x)}</p>` : ''}${scoreLine(x) ? `<p class="small"><b>${scoreLine(x)}</b> <span class="tiny muted">critics · audiences</span></p>` : ''}
      ${x.why ? `<p class="small muted">${esc(x.why)}</p>` : ''}${taste() && ideas.I.fit(x, taste()).why ? `<p class="fitwhy small">${esc(ideas.I.fit(x, taste()).why)}</p>` : ''}${times}
      ${links ? `<div class="row wrap">${links}</div>` : ''}
      <button type="button" class="linkish small" data-ideasuggest="${esc(x.id)}">✨ Suggest it to ${esc(partnerName())} now</button>
      <div class="deckbtns"><button type="button" class="ghost" data-idea="${esc(x.id)}:pass">✕ Not for us</button><button type="button" class="ghost" data-idea="${esc(x.id)}:later">⏭ Later</button>${picked(x) ? `<button type="button" data-idea="${esc(x.id)}:unpick">💗 Picked</button>` : `<button type="button" class="hot" data-idea="${esc(x.id)}:pick">💗 I'd love this</button>`}</div>
      <p class="tiny muted center">${ideas.i + 1} of ${list.length}${x.src ? ` · ${esc(x.src)}` : ''}</p></article>`
      : ideasEmpty()}
    <p class="tiny muted">🔒 ${esc(partnerName())} can't see what you 💗 — only a match, when you've both picked it.</p>`);
}
// ✨ Tonight?: the best thing from the scout for tonight — a showing at least 45 minutes away, else
// a new place for dinner.
function tonightPick() {
  if (!partnerMember() || !ideas.week) return null;
  const today = isoLocal(), soon = new Date(Date.now() + 45 * 60000).toTimeString().slice(0, 5);
  const films = ideas.week.ideas.filter((x) => x.kind === 'movie' && !(passed()[x.id] > Date.now())).map((x) => ({ x, show: (x.theatres || []).flatMap((th) => th.times.filter((t) => t.day === today && t.time >= soon).map((t) => ({ ...t, where: th.name })))[0] })).filter((y) => y.show)
    .sort((a, b) => (b.x.pick ? 1 : 0) - (a.x.pick ? 1 : 0) || (b.x.rank || 0) - (a.x.rank || 0));
  if (films[0]) return { kind: 'movie', idea: films[0].x, show: films[0].show, title: `${films[0].x.title} ${hm(films[0].show.time)}`, sub: `${scoreLine(films[0].x) || films[0].show.where} · tap to suggest` };
  const place = ideas.week.ideas.find((x) => x.kind === 'food' && !(passed()[x.id] > Date.now()));
  return place ? { kind: 'dinner', idea: place, title: place.title, sub: `${place.price ? `${place.price} · ` : ''}dinner? tap to suggest` } : null;
}
// A suggested plan from a scout pick: its poster, scores and links, for whoever's answering.
const ideaStrip = (p) => `<div class="istrip">${p.idea.img ? `<img src="${esc(p.idea.img)}" alt="" loading="lazy">` : ''}<small class="muted">${p.idea.pick ? '<span class="tag pk">Critics\' pick</span> ' : ''}${scoreLine(p.idea) || esc(p.idea.why || '')}${p.idea.format ? ` · ${esc(p.idea.format)}` : ''}
  ${p.idea.reserve ? ` · <a href="${esc(p.idea.reserve)}" target="_blank" rel="noopener">OpenTable</a>` : ''}${p.idea.url ? ` · <a href="${esc(p.idea.url)}" target="_blank" rel="noopener">${p.idea.kind === 'movie' ? 'Showtimes' : 'More'}</a>` : ''}</small></div>`;
// Why the deck is empty, and what to do about it.
function ideasEmpty() {
  const w = ideas.week, tab = ideas.tab, label = ideas.I.TABS[tab].replace(/^\S+ /, '').toLowerCase();
  const all = tab === 'all' || tab === 'starter' ? null : (w?.ideas || []).filter((x) => x.kind === tab).length;
  if (!w && tab !== 'starter') return `<div class="card"><b class="small">The scout hasn't run for your area yet.</b><p class="tiny muted">New ${tab === 'all' ? 'ideas' : label} arrive Wednesday mornings.${state.user?.isAdmin ? ' Me › Maintainer › Run the scout now.' : ''}</p></div>`;
  if (all === 0) return `<div class="card"><b class="small">No ${esc(label)} this week.</b><p class="tiny muted">${w.problems?.length ? 'The scout had trouble this time — new ones Wednesday.' : 'New ones arrive Wednesday mornings.'}</p></div>`;
  return `<div class="card"><b class="small">You've been through all of them.</b><p class="tiny muted"><button type="button" class="linkish tiny" data-act="ideaunpass">Show the ones you passed</button> · new ones Wednesday</p></div>`;
}
async function ideaAct(id, what) {
  const x = ideaById(id);
  if (!x) return;
  const inDeck = $('.ideacard');
  if (what === 'pass' || what === 'later') {
    const p = passed(); p[id] = Date.now() + (what === 'later' ? 2 : 90) * 864e5;
    for (const k of Object.keys(p)) if (p[k] < Date.now()) delete p[k];
    LS.set(passKey(), JSON.stringify(p));
  } else {
    const t = ideas.tok[id] || (ideas.tok[id] = await ideas.I.ideaToken(fk(), state.fid, id));
    if (what === 'unpick') { const r = await api.del(`/families/${state.fid}/ideas/picks/${t}`); ideas.mine = r.mine; }
    else {
      const r = await api.post(`/families/${state.fid}/ideas/picks/${t}`, { box: await lock(ideas.I.pickBox(x)) });
      ideas.mine = r.mine;
      if (r.match) { await loadIdeas(); renderUs(); return matchSheet(t, true); }
      if (inDeck) ideas.i++;
      toast('💗 Picked — just between you and the app');
    }
  }
  if (inDeck) ideasSheet();
  renderIdeasCard();
}
// 💞 A match: pick a time and it goes on the calendar for both of you.
function matchSheet(t, fresh = false) {
  const m = ideas.matches.find((y) => y.t === t);
  if (!m) return;
  const x = { ...m.idea, ...(ideaById(m.idea.id) || {}) };
  const shows = (x.theatres || []).flatMap((th) => th.times.map((s) => ({ ...s, where: th.name }))).filter((s) => s.day >= isoLocal()).slice(0, 10);
  const sat = shiftLocal(isoLocal(), (6 - new Date().getDay() + 7) % 7);
  openSheet(`<div class="row between"><h2>${fresh ? "💞 It's a match!" : '💞 You both picked'}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <div class="ideacard">${x.img ? `<img class="poster sm" src="${esc(x.img)}" alt="">` : `<div class="ideabig">${ideaIcon(x)}</div>`}<h3>${esc(x.title)}</h3>${ideaMeta(x) ? `<p class="small">${ideaMeta(x)}</p>` : ''}</div>
    <form id="matchForm" class="stack" data-t="${esc(t)}">
      ${shows.length ? `<div class="radios showtimes">${shows.map((s, i) => `<label><input type="radio" name="slot" value="${esc(`${s.day}|${s.time}|${s.where}`)}" ${i ? '' : 'checked'}><span>${esc(dayText(s.day, s.time))}<small>${esc(s.where)}${s.format ? ` · ${esc(s.format)}` : ''}</small></span></label>`).join('')}</div>` : ''}
      <div class="two" ${shows.length ? 'hidden' : ''}><label>Day<input type="date" name="day" min="${isoLocal()}" value="${esc(x.day || sat)}"></label><label>Time<input type="time" name="time" value="${esc(x.time || '19:00')}"></label></div>
      <div class="row wrap">${x.reserve ? `<a class="btn ghost small" href="${esc(x.reserve)}" target="_blank" rel="noopener">🍽️ Reserve on OpenTable</a>` : ''}${x.url ? `<a class="btn ghost small" href="${esc(x.url)}" target="_blank" rel="noopener">${x.kind === 'event' ? '🎟 Get tickets' : x.kind === 'movie' ? '🎟 Book seats' : '🔗 More'}</a>` : ''}</div>
      <div class="row end"><button type="button" class="ghost" data-matchskip="${esc(t)}">Not this time</button><button>📅 Make it a plan</button></div>
      <p class="tiny muted">It goes on the 📅 calendar for both of you, with a reminder an hour before.</p>
    </form>`);
}
async function matchToPlan(t, v) {
  const m = ideas.matches.find((y) => y.t === t);
  if (!m) return;
  const x = { ...m.idea, ...(ideaById(m.idea.id) || {}) };
  let [day, time, where] = [v.day, v.time, x.where || ''];
  if (v.slot) [day, time, where] = v.slot.split('|');
  await api.post(`/families/${state.fid}/events/import`, { events: [{ id: `idea${t.slice(0, 16)}`, date: day, start: time || '', end: '', allDay: !time, who: m.who, remind: time ? 60 : null, at: Date.now(), updatedAt: Date.now(),
    body: await lock({ title: `${ideaIcon(x)} ${x.title}`, place: where, notes: ['💞 a date-idea match', x.reserve ? `Reserve: ${x.reserve}` : '', x.url || ''].filter(Boolean).join('\n') }) }] });
  await api.patch(`/families/${state.fid}/ideas/matches/${t}`, { done: true });
  await loadIdeas();
  closeSheet(); renderUs(); usBadge();
  toast("🎉 It's a plan — it's on both your calendars");
}
function ideaSettingsSheet() {
  const s = ideas.settings || {};
  openSheet(`<h2>⚙︎ Date ideas</h2>
    <form id="ideaSetForm" class="stack">
      <label>Your ZIP code<input name="zip" inputmode="numeric" pattern="\\d{5}" maxlength="5" value="${esc(s.zip || '')}"></label>
      <label>Movie theatres (one per line, up to 4)<textarea name="theatres" rows="3" maxlength="300">${esc((s.theatres || []).join('\n'))}</textarea></label>
      <div class="two"><label>Critics at least<select name="critic">${[60, 70, 75, 80, 85, 90, 95].map((n) => `<option value="${n}" ${n === s.critic ? 'selected' : ''}>${n}%</option>`).join('')}</select></label>
        <label>Audiences at least<select name="audience">${[60, 65, 70, 75, 80, 85].map((n) => `<option value="${n}" ${n === s.audience ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
      <p class="tiny muted">Critics: Rotten Tomatoes (else Metacritic). Audiences: IMDb ×10 (else TMDB). The weekly scout only ever gets your area and the dates — never your names, plans or picks. New settings apply from the next Wednesday.</p>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Save</button></div>
    </form>`);
}

// ---------- 🧭 plan an outing: a neighborhood or a town nearby, planned with Claude ----------
const OUT_PLACES = {
  'San Francisco': ['Hayes Valley', 'Mission', 'North Beach', 'Japantown', 'Inner Sunset', 'Marina & Presidio', 'Ferry Building', 'Dogpatch'],
  'East Bay': ['Oakland · Temescal', 'Oakland · Rockridge', 'Jack London Square', 'Berkeley · Gourmet Ghetto', 'Alameda'],
  'North Bay': ['San Rafael', 'Sausalito', 'Mill Valley', 'Tiburon'],
  'South Bay & coast': ['Los Gatos', 'Palo Alto', 'Santana Row', 'Half Moon Bay', 'Santa Cruz'],
};
const CUISINES = [['sushi', '🍣 Sushi'], ['thai', '🍜 Thai'], ['indian', '🍛 Indian'], ['tapas', '🥘 Tapas'], ['italian', '🍝 Italian'], ['mexican', '🌮 Mexican'], ['american', '🍔 American'], ['chinese', '🥟 Chinese'], ['korean', '🍲 Korean'], ['vietnamese', '🍜 Vietnamese'], ['mediterranean', '🥙 Mediterranean'], ['seafood', '🦪 Seafood'], ['pizza', '🍕 Pizza'], ['french', '🥐 French'], ['vegetarian', '🥗 Vegetarian']];
const OUT_CHIPS = { Food: CUISINES.slice(0, 8), 'What for': [['dinner', '🍽 Dinner'], ['drinks', '🍸 Drinks'], ['coffee', '☕ Coffee'], ['brunch', '🥞 Brunch'], ['walk', '🚶 Walk around'], ['shops', '🛍 Shops'], ['museum', '🖼 Museum'], ['music', '🎶 Live music'], ['views', '🌅 Views']],
  How: [['caltrain', '🚆 Caltrain'], ['bart', '🚇 BART'], ['ferry', '⛴ Ferry'], ['drive', '🚗 Drive'], ['dogs', '🐕 Bring the dogs'], ['$$', '💲💲'], ['$$$', '💲💲💲'], ['no long waits', 'No long waits'], ['easy walking', 'Easy walking']] };
const outing = { cur: null, tab: 'plan', plan: null };
const outKey = () => `fam.outings.${state.fid}`;
const savedOutings = () => { try { return JSON.parse(LS.get(outKey()) || '[]'); } catch { return []; } };
const STOP_ICON = { coffee: '☕', brunch: '🥞', lunch: '🥗', dinner: '🍽', drinks: '🍸', dessert: '🍰', walk: '🚶', view: '🌅', do: '🎟', shop: '🛍', museum: '🖼', music: '🎶', park: '🌳' };
const MODE_ICON = { train: '🚆', bart: '🚇', transit: '🚌', ferry: '⛴', drive: '🚗', walk: '🚶', bike: '🚲' };
const hm = (t) => (t ? new Date(`2000-01-01T${t}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) : '');
function outingCard() {
  const saved = savedOutings().slice(0, 3);
  return `<div class="row between"><b class="us-h">🧭 Where to?</b><span class="tiny muted">SF, Oakland, Marin…</span></div>
    <button type="button" class="input-like" data-act="outing">Hayes Valley Saturday, Sausalito for lunch…</button>
    <div class="rchips">${['Hayes Valley', 'Oakland · Temescal', 'San Rafael', 'Sausalito'].map((p) => `<button type="button" class="chip" data-outplace="${esc(p)}">${esc(p)}</button>`).join('')}</div>
    ${saved.length ? `<p class="tiny muted">Recent: ${saved.map((o, i) => `<button type="button" class="linkish tiny" data-outsaved="${i}">${esc(o.title)}</button>`).join(' · ')}</p>` : ''}`;
}
function outingAsk(place = '') {
  const sat = shiftLocal(isoLocal(), (6 - new Date().getDay() + 7) % 7 || 7);
  const days = [[isoLocal(), 'Today'], [shiftLocal(isoLocal(), 1), 'Tomorrow'], [sat, 'Sat'], [shiftLocal(sat, 1), 'Sun']].filter(([d], i, a) => a.findIndex(([e]) => e === d) === i);
  openSheet(`<div class="row between"><h2>🧭 Plan an outing</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <form id="outForm" class="stack">
      <input name="text" maxlength="120" required value="${esc(place)}" placeholder="Hayes Valley, afternoon into dinner" aria-label="Where to?" autocomplete="off">
      <details class="small"><summary class="muted">Ideas around the Bay</summary>${Object.entries(OUT_PLACES).map(([g, l]) => `<div class="grp">${esc(g)}</div><div class="rchips">${l.map((p) => `<button type="button" class="chip" data-outfill="${esc(p)}">${esc(p)}</button>`).join('')}</div>`).join('')}</details>
      <div class="grp">When</div><div class="rchips radios chipradios">${days.map(([d, l], i) => `<label><input type="radio" name="day" value="${d}" ${i === (days.length > 2 ? 2 : 0) ? 'checked' : ''}><span class="chip">${l}${l.length < 4 ? ` ${new Date(`${d}T12:00:00`).getDate()}` : ''}</span></label>`).join('')}<label><input type="radio" name="day" value="pick"><span class="chip">Pick…</span></label></div>
      <input type="date" name="pickday" min="${isoLocal()}" hidden>
      ${Object.entries(OUT_CHIPS).map(([g, l]) => `<div class="grp">${g}</div><div class="rchips radios chipradios">${l.map(([v, t]) => `<label><input type="checkbox" name="chip" value="${esc(v)}" ${['dinner', 'walk'].includes(v) ? 'checked' : ''}><span class="chip">${t}</span></label>`).join('')}</div>`).join('')}
      ${tasteLineNow() ? `<label class="switch-row"><span>💞 Use our taste<small class="muted">“${esc(tasteLineNow())}”</small></span><input type="checkbox" name="usetaste" ${LS.get('fam.useTaste') === '0' ? '' : 'checked'}><i class="switch"></i></label>` : ''}
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>🧭 Plan it</button></div>
      <p class="tiny muted">🔒 Only the place, the day, these choices and your home town go out — never your names or anything else in the app. Takes about a minute.</p>
    </form>`);
}
async function outingGo(f) {
  const v = Object.fromEntries(new FormData(f));
  const day = v.day === 'pick' ? v.pickday : v.day;
  if (!day) return toast('Which day?');
  const chips = [...f.querySelectorAll('[name=chip]:checked')].map((x) => x.value);
  LS.set('fam.useTaste', v.usetaste ? '1' : f.querySelector('[name=usetaste]') ? '0' : LS.get('fam.useTaste'));
  outing.taste = v.usetaste ? tasteLineNow() : '';
  const body = { text: v.text.trim(), day, chips, taste: outing.taste };
  const id = await jobId('outing', body);
  jobWait(id, `🧭 Planning ${v.text.trim()}…`);
  runJob('outing', body, `🧭 ${v.text.trim()}`);
}
const stopRow = (x, opt) => `<div class="pick"><span class="ph">${STOP_ICON[x.kind] || '📍'}</span><div class="grow"><b>${esc(x.name)}</b>${x.price ? ` <span class="tag">${esc(x.price)}</span>` : ''}${x.note ? ` <span class="tag tw">${esc(x.note)}</span>` : ''}<small class="muted">${esc(x.why)}${x.where ? ` · ${esc(x.where)}` : ''}</small>
  <span class="links">${x.reserve ? `<a href="${esc(x.reserve)}" target="_blank" rel="noopener">OpenTable${x.time ? ` ${esc(hm(x.time))}` : ''}</a>` : ''}${x.url ? `<a href="${esc(x.url)}" target="_blank" rel="noopener">Website</a>` : ''}<a href="${esc(x.map)}" target="_blank" rel="noopener">Map</a></span></div>
  ${opt != null ? `<button type="button" class="ghost small" data-outswap="${opt}">Use this</button>` : ''}</div>`;
function outingView() {
  const o = outing.cur;
  if (!o) return;
  const mine = !outing.plan || outing.plan.by === fam().me;
  const tabs = { plan: 'Plan', eat: 'Eat & drink', do: 'Do', go: 'Getting there' };
  const go = `${o.getting.map((g) => `<div class="pick"><span class="ph">${MODE_ICON[g.mode] || '🚌'}</span><div class="grow">${g.depart ? `<b>${esc(hm(g.depart))}</b> ` : ''}${esc(g.text)}</div></div>`).join('')}
    ${o.back ? `<div class="pick"><span class="ph">↩︎</span><div class="grow">${esc(o.back)}</div></div>` : ''}${o.parking ? `<div class="pick"><span class="ph">🅿️</span><div class="grow">${esc(o.parking)}</div></div>` : ''}
    <a class="btn ghost small" href="${esc(o.directions)}" target="_blank" rel="noopener">🗺 Directions from ${esc(o.from)}</a>`;
  const body = {
    plan: `${o.getting[0] ? `<div class="card soft small">${MODE_ICON[o.getting[0].mode] || '🚌'} ${o.getting[0].depart ? `<b>Leave ${esc(hm(o.getting[0].depart))}</b> · ` : ''}${esc(o.getting[0].text)}${o.back ? `<br>↩︎ ${esc(o.back)}` : ''}</div>` : ''}
      <div class="tl">${o.stops.map((x, i) => `<div class="st"><div class="t">${esc(hm(x.time))}</div>${stopRow(x)}${mine ? `<span class="tiny">${(o.options[EATK.includes(x.kind) ? 'eat' : 'do'] || []).length ? `<button type="button" class="linkish tiny" data-outtab="${EATK.includes(x.kind) ? 'eat' : 'do'}" data-outfor="${i}">⇄ Other options</button>` : ''}${EATK.includes(x.kind) && x.kind !== 'coffee' ? ` · <button type="button" class="linkish tiny" data-outcuisine="${i}">🍽 Something else…</button>` : ''}</span>` : ''}</div>`).join('')}</div>
      ${o.tips.length ? `<ul class="small tips">${o.tips.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : ''}`,
    eat: (o.options.eat || []).map((x, i) => stopRow(x, mine ? `eat:${i}` : null)).join('') || '<p class="small muted">No other picks this time.</p>',
    do: (o.options.do || []).map((x, i) => stopRow(x, mine ? `do:${i}` : null)).join('') || '<p class="small muted">No other picks this time.</p>',
    go,
  }[outing.tab];
  const p = outing.plan, meId = fam().me;
  const foot = !p ? `<div class="row"><button type="button" class="ghost grow" data-act="outsave">💾 Save</button>${partnerMember() ? `<button type="button" class="hot grow" data-act="outsend">💞 Send to ${esc(partnerName())}</button>` : ''}</div>`
    : p.by !== meId && !p.replies?.[meId] ? `<div class="ans">${Object.entries(ANSWERS).map(([k, t], i) => `<button type="button" class="${i ? 'ghost' : ''} small" data-answer="${p.id}:${k}">${t}</button>`).join('')}</div>` : '';
  openSheet(`<div class="row between"><h2>🧭 ${esc(o.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small muted">${esc(o.area)} · ${esc(dayText(o.day))}</p>
    <div class="seg-tabs">${Object.entries(tabs).map(([k, l]) => `<button type="button" class="${k === outing.tab ? 'on' : ''}" data-outtab="${k}">${l}</button>`).join('')}</div>
    <div class="outbody">${body}</div>${foot}
    <p class="tiny muted">Found with web search just now — check hours before you go.</p>`);
}
const EATK = ['coffee', 'brunch', 'lunch', 'dinner', 'drinks', 'dessert'];
// "Use this": the option takes the place of the stop you came from (else the first of its kind).
function outingSwap(ref) {
  const o = outing.cur, [k, i] = ref.split(':');
  const x = o.options[k]?.[+i];
  if (!x) return;
  let at = outing.swapFor ?? -1;
  if (at < 0) at = o.stops.findIndex((s) => s.kind === x.kind);
  if (at < 0) at = o.stops.findIndex((s) => (k === 'eat') === EATK.includes(s.kind));
  if (at < 0) return toast('Nothing to swap it for');
  const old = o.stops[at];
  const time = old.time;
  o.stops[at] = { ...x, time, reserve: x.reserve ? x.reserve.replace(/dateTime=[^&]+/, `dateTime=${o.day}T${encodeURIComponent(time)}`) : '' };
  o.options[k][+i] = { ...old, time: undefined };
  outing.swapFor = null; outing.tab = 'plan';
  toast(`⇄ ${x.name} is in`);
  outingView();
}
async function outingSend() {
  const o = outing.cur;
  // What goes to your partner (locked): the plan without the extra options, to keep it small.
  const lean = { ...o, options: { eat: o.options.eat.slice(0, 3), do: o.options.do.slice(0, 2) } };
  const first = o.getting.find((g) => g.depart)?.depart || o.stops[0]?.time || '';
  const body = await lock({ kind: 'outing', what: o.title, where: o.area, when: 'date', time: first, note: '', outing: lean });
  await api.post(`/families/${state.fid}/us/plans`, { body, day: o.day, audience: 'couple' });
  closeSheet(); await usChanged();
  toast(`💞 Sent — ${partnerName()} can say 🙌 I'm in`);
}
// 🍽 Something else: pick a cuisine for one stop and get 2-3 places nearby for the same time.
function cuisineSheet(i) {
  const x = outing.cur.stops[i];
  openSheet(`<div class="row between"><h2>🍽 Instead of ${esc(x.name)}</h2><button type="button" class="icon-btn" data-outtab="plan" aria-label="Back">✕</button></div>
    <p class="small muted">${esc(hm(x.time))} · near ${esc(outing.cur.area)}</p>
    <div class="rchips">${CUISINES.map(([v, l]) => `<button type="button" class="chip" data-outcpick="${i}:${v}">${l}</button>`).join('')}<button type="button" class="chip" data-outcpick="${i}:">🎲 Surprise us</button></div>`);
}
async function cuisinePick(i, cuisine) {
  const o = outing.cur, x = o.stops[i];
  const body = { area: o.area, day: o.day, time: x.time, kind: x.kind, cuisine, avoid: x.name, taste: outing.taste || '' };
  const id = await jobId('swap', body);
  jobWait(id, `🍽 Finding ${cuisine || 'something else'} near ${o.area.split(',')[0]}…`);
  runJob('swap', body, `🍽 ${cuisine ? cuisine[0].toUpperCase() + cuisine.slice(1) : 'Other'} picks`, { outing: `${o.title}|${o.day}`, stop: i });
}
function outingSave() {
  const l = [outing.cur, ...savedOutings().filter((x) => !(x.title === outing.cur.title && x.day === outing.cur.day))].slice(0, 8);
  try { LS.set(outKey(), JSON.stringify(l)); toast('💾 Saved on this phone'); } catch { toast("Couldn't save — this phone is out of space"); }
  renderOutingCard();
}
// The calendar event's notes: getting there, the timeline with links, and the way home.
const outingNotes = (o) => [...o.getting.map((g) => `${MODE_ICON[g.mode] || '🚌'} ${g.depart ? `${hm(g.depart)} ` : ''}${g.text}`),
  ...o.stops.map((x) => `${hm(x.time)} ${STOP_ICON[x.kind] || '📍'} ${x.name}${x.reserve ? ` — ${x.reserve}` : ''}`), o.back ? `↩︎ ${o.back}` : '', '🧭 planned in Us'].filter(Boolean).join('\n');
function renderOutingCard() { const el = $('#usOutC'); if (el) el.innerHTML = outingCard(); }

// ---------- ✨ the scout inside Suggest: picks for the kind, day and time you chose ----------
const CUISINE_WORDS = { sushi: ['sushi', 'japanese', 'omakase', 'izakaya'], thai: ['thai'], indian: ['indian', 'curry'], tapas: ['tapas', 'spanish', 'basque'], italian: ['italian', 'pasta', 'trattoria'], mexican: ['mexican', 'taco', 'taqueria'], american: ['american', 'burger', 'bbq', 'steak', 'diner'], chinese: ['chinese', 'dim sum', 'dumpling', 'sichuan'], korean: ['korean'], vietnamese: ['vietnamese', 'pho'], mediterranean: ['mediterranean', 'greek', 'middle eastern'], seafood: ['seafood', 'oyster', 'fish'], pizza: ['pizza'], french: ['french', 'bistro'], vegetarian: ['vegetarian', 'vegan'] };
const FOOD_KINDS = ['dinner', 'lunch', 'brunch', 'drinks', 'date'];
const feel = { picks: [], cuisine: '', found: {} };
// The day the form is set to ("weekend" = Saturday and Sunday).
function feelDays(f) {
  const when = f.when.value, today = isoLocal();
  if (when === 'date') return [f.day.value || today];
  if (when === 'tomorrow') return [shiftLocal(today, 1)];
  if (when === 'weekend') { const sat = planDayOf('weekend', today); return [sat, shiftLocal(sat, 1)]; }
  return [today];
}
const cuisineOf = (x, c) => !c || (CUISINE_WORDS[c] || [c]).some((w) => `${x.title} ${(x.tags || []).join(' ')} ${x.why || ''}`.toLowerCase().includes(w));
async function renderFeelPicks() {
  const f = $('#feelForm'), el = $('#feelPicks');
  if (!f || !el) return;
  if (!ideas.loaded) { el.innerHTML = '<div class="skeleton line"></div>'; await loadIdeas().catch(() => {}); if (!$('#feelPicks')) return; }
  const kind = f.kind.value, days = feelDays(f), time = f.time.value, now = new Date();
  const later = (d, t) => d > isoLocal() || `${d}T${t}` > `${isoLocal()}T${now.toTimeString().slice(0, 5)}`;
  const week = ideas.week?.ideas || [];
  feel.picks = [];
  let html = '';
  if (kind === 'movie') {
    const films = week.filter((x) => x.kind === 'movie').map((x) => ({ ...x, shows: (x.theatres || []).flatMap((th) => th.times.filter((s) => days.includes(s.day) && later(s.day, s.time)).map((s) => ({ ...s, where: th.name }))) }))
      .sort((a, b) => (b.shows.length ? 1 : 0) - (a.shows.length ? 1 : 0) || (b.pick ? 1 : 0) - (a.pick ? 1 : 0) || (b.rank || 0) - (a.rank || 0)).slice(0, 6);
    feel.picks = films;
    html = films.length ? `<div class="grp">🍿 Playing ${esc(days.length > 1 ? 'this weekend' : dayText(days[0]).replace(/ ·.*/, ''))} near you</div>${films.map((x, i) => `<div class="fpick"><span class="fp-i">${x.img ? `<img src="${esc(x.img)}" alt="" loading="lazy">` : '🎬'}</span><div class="grow"><b>${esc(x.title)}</b>${x.pick ? ' <span class="tag pk">Critics\' pick</span>' : ''}<small class="muted">${scoreLine(x)}${x.why ? ` · ${esc(x.why)}` : ''}</small>
        <div class="stimes">${x.shows.slice(0, 6).map((s, j) => `<button type="button" class="st" data-feelshow="${i}:${j}">${esc(days.length > 1 ? dayText(s.day, s.time).replace(/, \w+ \d+/, '') : hm(s.time))}${s.format ? ` ${esc(s.format)}` : ''} <small>${esc(s.where.split(/[ ,]/)[0])}</small></button>`).join('') || `<button type="button" class="st" data-feelpick="${i}">Pick it</button> <a class="tiny" href="${esc(x.url)}" target="_blank" rel="noopener">Showtimes on Fandango</a>`}</div></div></div>`).join('')}`
      : `<p class="tiny muted">${ideas.week ? 'No movies from the scout this week.' : 'Movie picks arrive Wednesday mornings.'} Type one above.</p>`;
  } else if (FOOD_KINDS.includes(kind)) {
    const t = taste();
    const places = week.filter((x) => x.kind === 'food' && cuisineOf(x, feel.cuisine)).map((x) => ({ ...x, fit: t ? ideas.I.fit(x, t) : { score: 0, why: '' } })).filter((x) => !x.fit.hide).sort((a, b) => b.fit.score - a.fit.score);
    const found = feel.found[`${feel.cuisine}|${days[0]}|${time}`] || [];
    const again = (ideas.I?.againIdeas(calm.rhythm || []) || []).map((x) => ({ ...x, kind: 'again', where: x.title.replace(/^Back to /, '') }));
    feel.picks = [...found, ...places.slice(0, 5), ...again.slice(0, 3)];
    const row = (x, i) => `<div class="fpick"><span class="fp-i">${x.kind === 'again' ? '🔁' : '🍽'}</span><div class="grow"><b>${esc(x.kind === 'again' ? x.where : x.title || x.name)}</b>${x.opened ? ' <span class="tag tg">New</span>' : ''}<small class="muted">${esc([x.price, x.where && x.kind !== 'again' ? x.where : '', x.why].filter(Boolean).join(' · '))}</small>${x.fit?.why ? `<small class="fitwhy">${esc(x.fit.why)}</small>` : ''}</div>
      <button type="button" class="ghost small" data-feelpick="${i}">Pick</button></div>`;
    html = `<div class="rchips cuis">${[['', 'Any'], ...CUISINES.slice(0, 8)].map(([v, l]) => `<button type="button" class="chip ${feel.cuisine === v ? 'on' : ''}" data-feelcuisine="${v}">${l}</button>`).join('')}</div>
      ${feel.picks.length ? `<div class="grp">${kind === 'drinks' ? '🍸' : '🍽'} For ${days[0] === isoLocal() ? `tonight${time ? ` · ${esc(hm(time))}` : ''}` : esc(dayText(days[0], time))} near you</div>${feel.picks.map(row).join('')}` : ''}
      ${feel.cuisine && !found.length ? `<button type="button" class="linkish small" data-feelfind="1">🔎 Find ${esc(feel.cuisine)} places for ${esc(dayText(days[0], time || '19:00').replace(/^\w+, /, ''))}</button>` : ''}
      <div class="fpick"><span class="fp-i">🧭</span><div class="grow"><b>Somewhere further?</b><small class="muted">Plan an evening in SF, Oakland or Marin</small></div><button type="button" class="ghost small" data-act="outing">Outing ›</button></div>`;
  } else if (['walk', 'coffee', 'workout', 'other'].includes(kind)) {
    const sub = { walk: ['active', 'out'], workout: ['active'], coffee: ['food', 'out'], other: ['out', 'home', 'food', 'active'] }[kind];
    const evs = kind === 'other' ? week.filter((x) => x.kind === 'event' && days.includes(x.day)).slice(0, 3) : [];
    feel.picks = [...evs, ...(ideas.I?.STARTERS || []).filter((x) => sub.includes(x.sub)).sort(() => Math.random() - 0.5).slice(0, 4)];
    html = feel.picks.length ? `<div class="grp">💡 Ideas</div>${feel.picks.map((x, i) => `<div class="fpick"><span class="fp-i">${x.icon || '🎟'}</span><div class="grow"><b>${esc(x.title)}</b><small class="muted">${esc(x.day ? ideaMeta(x).replace(/&amp;/g, '&') : x.why || '')}</small></div><button type="button" class="ghost small" data-feelpick="${i}">Pick</button></div>`).join('')}` : '';
  }
  el.innerHTML = html;
}
// A pick fills in the form (and remembers the idea, so the plan shows its poster, scores and links).
function feelFill(x, show) {
  const f = $('#feelForm');
  const k = f.kind.value;
  const name = x.kind === 'again' ? x.where : x.title || x.name;
  const whatShown = !f.querySelector('.kwhat').hidden;
  if (whatShown && !FOOD_KINDS.includes(k)) f.what.value = name; else f.where.value = name;
  if (k === 'movie' && show) f.where.value = show.where;
  if (x.where && k === 'other') f.where.value = x.where;
  const day = show?.day || x.day;
  if (day && day !== isoLocal()) { f.querySelector(`[name=when][value=date]`).checked = true; f.day.value = day; f.querySelector('.kday').hidden = false; }
  if (show?.time || x.time) f.time.value = show?.time || x.time;
  f.idea.value = JSON.stringify({ id: x.id, kind: x.kind, img: x.img || '', scores: x.scores || null, pick: !!x.pick, url: x.url || '', reserve: x.reserve ? x.reserve.replace(/dateTime=[^&]+/, `dateTime=${f.day.value || isoLocal()}T${encodeURIComponent(f.time.value || '19:30')}`) : '', why: x.why || '', format: show?.format || '' });
  f.querySelectorAll('.fpick.on').forEach((n) => n.classList.remove('on'));
  toast(`✨ ${name}${show ? ` · ${hm(show.time)}` : ''}`);
  f.querySelector('button:not(.ghost):not([type=button])')?.scrollIntoView({ block: 'nearest' });
}
async function feelFind() {
  const f = $('#feelForm'), days = feelDays(f), time = f.time.value || '19:00';
  const key = `${feel.cuisine}|${days[0]}|${f.time.value}`;
  const b = $('[data-feelfind]'); if (b) { b.disabled = true; b.textContent = '🔎 Looking… you can keep going, it shows below when ready'; }
  const body = { area: ideas.settings?.label || 'San Jose', day: days[0], time, kind: f.kind.value === 'drinks' ? 'drinks' : 'dinner', cuisine: feel.cuisine, taste: LS.get('fam.useTaste') === '0' ? '' : tasteLineNow() };
  await runJob('find', body, `🍽 ${feel.cuisine ? feel.cuisine[0].toUpperCase() + feel.cuisine.slice(1) : 'Dinner'} places`, { key });
  if (open$('#feelPicks')) renderFeelPicks();
}

// ---------- ⭐ How was it? Ratings kept in your own (encrypted) trackers; they shape the picks ----------
let tasteCache = null;
const tasteLineNow = () => (ideas.I && taste() ? ideas.I.tasteLine(taste()) : '');
const taste = () => (ideas.I ? (tasteCache ||= ideas.I.tasteOf(calm.ratings || [])) : null);
const ratedByMe = (planId) => (calm.myRatings || []).some((r) => r.plan === planId);
function rateSheet(p) {
  const k = KINDS[p.kind] || KINDS.other;
  const stops = p.outing ? p.outing.stops.map((x) => ({ name: x.name, kind: x.kind, price: x.price || '', tags: [x.kind] }))
    : [{ name: (FOOD_KINDS.includes(p.kind) ? p.where : p.what) || p.what || p.where || planTitle(p), kind: p.kind, price: p.idea?.price || '', tags: [...(p.idea?.tags || []), p.kind] }];
  const logged = (calm.rhythm || []).some((e) => e.kind === 'date' && e.date === p.day);
  rateSheet.cur = { p, stops };
  openSheet(`<div class="row between"><h2>⭐ How was ${esc(p.outing ? p.outing.title : stops[0].name)}?</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small muted">${esc(planWhen(p))} · it helps the scout pick better for you two</p>
    <form id="rateForm" class="stack">
      <div class="faces radios">${[[1, '😕', 'Meh'], [2, '🙂', 'Good'], [3, '😍', 'Loved it']].map(([v, e, l]) => `<label><input type="radio" name="overall" value="${v}" ${v === 2 ? 'checked' : ''}><span><b>${e}</b>${l}</span></label>`).join('')}</div>
      ${stops.map((x, i) => `<div class="rstop"><span>${STOP_ICON[x.kind] || k[0]} <b>${esc(x.name)}</b></span><span class="thumbs radios">${[[-1, '👎'], [1, '👍'], [2, '❤️']].map(([v, e]) => `<label><input type="radio" name="s${i}" value="${v}"><span>${e}</span></label>`).join('')}</span></div>`).join('')}
      <div class="rchips radios chipradios">${Object.entries(ideas.I.RATE_TAGS).map(([v, l]) => `<label><input type="checkbox" name="tag" value="${v}"><span class="chip">${l}</span></label>`).join('')}</div>
      <label class="switch-row"><span>❤️ Log it as a date (2-2-2-2)</span><input type="checkbox" name="log" ${logged ? '' : 'checked'}><i class="switch"></i></label>
      <div class="row end"><button type="button" class="ghost" data-rateskip="${p.id}">Skip</button><button>Save</button></div>
      <p class="tiny muted">🔒 Kept in your trackers, end-to-end encrypted — ${esc(partnerName())} sees them if you share your trackers.</p>
    </form>`);
}
async function saveRating(f) {
  const { p, stops } = rateSheet.cur;
  const v = new FormData(f);
  const at = Date.now();
  const rating = { id: at.toString(36), at, date: p.day, plan: p.id, what: p.outing ? p.outing.title : planTitle(p), overall: +v.get('overall') || 2,
    stops: stops.map((x, i) => ({ ...x, r: +v.get(`s${i}`) || 0 })), tags: v.getAll('tag') };
  await saveRhythm((r) => {
    if (v.get('log')) r.entries.push({ id: at.toString(36) + Math.random().toString(36).slice(2, 5), kind: 'date', date: p.day, at, what: rating.what.replace(/^Date night: ?/, '') || 'Date night', ...(p.where ? { place: p.where } : {}) });
  }, (data) => { data.taste = { ratings: [...(data.taste?.ratings || []), rating].slice(-200) }; });
  calm.myRatings = [...(calm.myRatings || []), rating]; calm.ratings = [...(calm.ratings || []), rating]; tasteCache = null;
  closeSheet(); calm.rhythm = await loadRhythm().catch(() => calm.rhythm); renderUs(); usBadge();
  toast(rating.overall === 3 ? '😍 Noted — more like this' : rating.overall === 1 ? "😕 Noted — we'll steer clear" : '🙂 Thanks — noted');
}
async function skipRating(id) {
  const p = us.plans.find((x) => x.id === id);
  if (!p) return;
  await saveRhythm(() => {}, (data) => { data.taste = { ratings: [...(data.taste?.ratings || []), { id: Date.now().toString(36), plan: id, skip: true, at: Date.now() }].slice(-200) }; });
  calm.myRatings = [...(calm.myRatings || []), { plan: id, skip: true }];
  closeSheet(); renderUs(); usBadge();
}

// ---------- ⏳ planning jobs: they run in the background, show in a pill, and are never lost ----------
// Each job is named by a hash of what was asked, so asking again reuses it (and the connector's
// saved copy); results stay on this phone, and a job cut off by closing the app is picked up later.
const jobsKey = () => `fam.jobs.${state.fid}`;
const jobs = { list: null, running: new Map(), tick: null, told: new Set() };
const jobList = () => (jobs.list ||= (() => { try { return JSON.parse(LS.get(jobsKey()) || '[]'); } catch { return []; } })());
const saveJobs = () => { jobs.list = jobList().filter((j) => Date.now() - j.at < 864e5).slice(-12); try { LS.set(jobsKey(), JSON.stringify(jobs.list)); } catch { /* full */ } };
const jobResult = (id) => { try { return JSON.parse(LS.get(`fam.jobres.${id}`) || 'null'); } catch { return null; } };
const JOB_STEPS = { outing: ['Finding places', 'Checking hours', 'Planning the route', 'Checking the links'], swap: ['Searching nearby', 'Checking the links'], find: ['Searching nearby', 'Checking the links'] };
async function jobId(kind, body) {
  const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([state.fid, kind, body])));
  return [...new Uint8Array(h)].slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
}
async function runJob(kind, body, label, ctx = {}) {
  const id = await jobId(kind, body);
  if (jobs.running.has(id)) return jobs.running.get(id);
  const prior = jobList().find((j) => j.id === id);
  if (prior?.status === 'done' && jobResult(id)) { jobDone(prior, jobResult(id), true); return jobResult(id); }
  const job = { id, kind, label, body, ctx, at: Date.now(), status: 'running' };
  jobs.list = [...jobList().filter((j) => j.id !== id), job]; saveJobs();
  const path = `/families/${state.fid}/outing${kind === 'outing' ? '' : '/swap'}`;
  const p = api.post(path, { ...body, job: id }).then((r) => { jobDone(job, r); return r; }, (err) => {
    if (err.status) { Object.assign(job, { status: 'failed', error: err.message }); saveJobs(); renderPill(); }
    // No answer at all (the phone lost the connection): the connector carries on; check back later.
    return null;
  }).finally(() => { jobs.running.delete(id); renderPill(); });
  jobs.running.set(id, p);
  renderPill();
  return p;
}
function jobDone(job, r, quiet = false) {
  try { LS.set(`fam.jobres.${job.id}`, JSON.stringify(r)); } catch { /* full */ }
  Object.assign(job, { status: 'done', seen: false, doneAt: Date.now() });
  jobs.list = [...jobList().filter((j) => j.id !== job.id), job]; saveJobs();
  if (job.kind === 'outing' && r.outing) {
    const l = [r.outing, ...savedOutings().filter((x) => !(x.title === r.outing.title && x.day === r.outing.day))].slice(0, 8);
    try { LS.set(outKey(), JSON.stringify(l)); } catch { /* full */ }
    renderOutingCard();
  }
  if (job.kind === 'find') feel.found[job.ctx.key] = r.options.map((x) => ({ ...x, title: x.name, opened: '' }));
  if (job.kind === 'swap' && outing.cur && `${outing.cur.title}|${outing.cur.day}` === job.ctx.outing) mergeSwap(r.options);
  // Show it only where you're already looking at it; anywhere else, the pill says it's ready.
  const here = (job.kind !== 'find' && open$(`#jobWait[data-job="${job.id}"]`)) || (job.kind === 'find' && open$('#feelPicks'));
  if (here) { job.seen = true; saveJobs(); openJob(job); } else if (!quiet) toast(`✅ ${job.label} — ready`);
  renderPill();
}
function mergeSwap(options) {
  const o = outing.cur;
  o.options.eat = [...options.map((y) => ({ ...y, fresh: true })), ...(o.options.eat || []).filter((y) => !y.fresh)].slice(0, 10);
}
function openJob(job) {
  const r = jobResult(job.id);
  job.seen = true; saveJobs(); renderPill();
  if (!r) return;
  if (job.kind === 'outing') { outing.cur = r.outing; outing.tab = 'plan'; outing.plan = null; outing.taste = job.body.taste || ''; return outingView(); }
  if (job.kind === 'swap') {
    if (!outing.cur || `${outing.cur.title}|${outing.cur.day}` !== job.ctx.outing) { const o = savedOutings().find((x) => `${x.title}|${x.day}` === job.ctx.outing); if (!o) return toast('That outing is gone'); outing.cur = structuredClone(o); outing.plan = null; mergeSwap(r.options); }
    outing.tab = 'eat'; outing.swapFor = job.ctx.stop; return outingView();
  }
  if (job.kind === 'find') {
    if (open$('#feelPicks')) return renderFeelPicks();
    feel.picks = r.options.map((x) => ({ ...x, title: x.name }));
    return openSheet(`<div class="row between"><h2>${esc(job.label)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
      ${feel.picks.map((x, i) => `<div class="fpick"><span class="fp-i">🍽</span><div class="grow"><b>${esc(x.name)}</b><small class="muted">${esc([x.price, x.where, x.why].filter(Boolean).join(' · '))}</small>${x.reserve ? `<a class="tiny" href="${esc(x.reserve)}" target="_blank" rel="noopener">OpenTable</a>` : ''}</div><button type="button" class="ghost small" data-jobsuggest="${i}">Suggest</button></div>`).join('')}`);
  }
}
// The wait screen (only if you stay): what it's doing, and that you can leave.
function jobWait(id, title) {
  openSheet(`<div id="jobWait" data-job="${id}"><h2>${esc(title)}</h2><p class="small muted" id="jobStep">Starting…</p><div class="skeleton line"></div><div class="skeleton line"></div>
    <p class="tiny muted">You can close this and keep using the app — it carries on, and the bar at the bottom says when it's ready. You'll get a notification if you leave the app.</p>
    <div class="row end"><button type="button" class="ghost" data-act="close">Keep using the app</button></div></div>`);
  renderPill();
}
function renderPill() {
  let el = $('#jobPill');
  if (!el) { el = document.createElement('div'); el.id = 'jobPill'; el.className = 'jobpill'; document.body.appendChild(el); }
  const list = state.fid ? jobList() : [];
  const run = list.filter((j) => j.status === 'running'), ready = list.filter((j) => j.status === 'done' && j.seen === false), bad = list.filter((j) => j.status === 'failed' && !j.dismissed);
  const secs = (j) => Math.round((Date.now() - j.at) / 1000);
  const step = (j) => { const s = JOB_STEPS[j.kind]; return s[Math.min(s.length - 1, Math.floor(secs(j) / 7))]; };
  const rows = [
    ...run.map((j) => `<button type="button" class="jp run" data-jobopen="${j.id}"><span class="spin"></span><b>${esc(j.label)}</b> <small>${esc(step(j))}… ${Math.floor(secs(j) / 60)}:${String(secs(j) % 60).padStart(2, '0')}</small></button>`),
    ...ready.map((j) => `<span class="jp done"><button type="button" data-jobopen="${j.id}">✅ <b>${esc(j.label)}</b> ready · <u>Open</u></button><button type="button" class="x" data-jobx="${j.id}" aria-label="Dismiss">✕</button></span>`),
    ...bad.map((j) => `<span class="jp bad"><button type="button" data-jobretry="${j.id}">⚠️ <b>${esc(j.label)}</b> ${esc(j.error || "didn't finish")} · <u>Try again</u></button><button type="button" class="x" data-jobx="${j.id}" aria-label="Dismiss">✕</button></span>`),
  ];
  el.innerHTML = rows.slice(-3).join('');
  el.hidden = !rows.length;
  const w = open$('#jobWait'), wj = w && list.find((j) => j.id === w.dataset.job);
  if (wj && wj.status === 'running') $('#jobStep').textContent = `${step(wj)}… ${secs(wj)}s`;
  if (wj && wj.status === 'failed') $('#jobStep').innerHTML = `⚠️ ${esc(wj.error || "Didn't finish")}`;
  clearInterval(jobs.tick);
  if (run.length) jobs.tick = setInterval(renderPill, 1000);
}
// Back in the app: pick up jobs that finished (or gave up) while the phone was away.
async function resumeJobs() {
  for (const j of jobList().filter((x) => x.status === 'running' && !jobs.running.has(x.id))) {
    const r = await api.get(`/families/${state.fid}/outing/job/${j.id}`).catch(() => null);
    if (r && !r.pending) jobDone(j, r);
    else if (Date.now() - j.at > 4 * 60000) { Object.assign(j, { status: 'failed', error: "didn't finish" }); saveJobs(); }
  }
  renderPill();
}
document.addEventListener('visibilitychange', () => {
  if (!state.fid) return;
  if (document.hidden) {
    // Leaving with a plan still cooking: ask for a notification when it's done.
    for (const j of jobList().filter((x) => x.status === 'running' && !jobs.told.has(x.id))) { jobs.told.add(j.id); api.post(`/families/${state.fid}/outing/job/${j.id}/notify`).catch(() => {}); }
  } else resumeJobs();
});

// ---------- 📖 threads: write-ups read in your own time, with replies, polls and best answers ----------
const THREAD_CATS = { learned: ['📚', 'Learned'], talk: ['💬', 'Talk'], howto: ['📌', 'How-to'], ask: ['❓', 'Ask'], poll: ['📊', 'Poll'] };
const THREAD_BOARDS = { us: '💞 Just us', family: '👨‍👩‍👧 Family', dogs: '🐾 Dogs', house: '🏠 House & money', friends: "🤝 Friends'" };
const th = { list: [], board: 'new', cur: null, quote: null, loaded: 0 };
const threadKey = (t) => (t.pk ? postKey(t) : Promise.resolve(fk(t.fid)));
async function openThreadText(t, k) {
  const o = async (v) => { if (v == null) return ''; const r = await tryOpen(k, v, null); return r ?? (isSealed(v) ? '🔒' : v); };
  return { ...t, title: await o(t.title), body: await o(t.body),
    replies: Array.isArray(t.replies) ? await Promise.all(t.replies.map(async (r) => ({ ...r, text: await o(r.text), quote: typeof r.quote === "string" ? await o(r.quote) : r.quote }))) : t.replies,
    poll: t.poll?.opts ? { ...t.poll, opts: await Promise.all(t.poll.opts.map(o)) } : t.poll };
}
async function loadThreads() {
  const r = await api.get('/threads').catch(() => null);
  if (!r) return th.list;
  th.list = await Promise.all(r.threads.map(async (t) => openThreadText(t, await threadKey(t))));
  th.loaded = Date.now();
  famBadge(); usBadge();
  return th.list;
}
const unreadThreads = (us = false) => th.list.filter((t) => t.unread && (us ? t.aud === 'us' : t.aud !== 'us'));
function famBadge() {
  const b = $('#famBadge');
  if (!b) return;
  const n = unreadThreads().length;
  b.hidden = !n; b.textContent = n > 9 ? '9+' : String(n);
}
// A little markdown: "## " headings, "- " lists, paragraphs, links. Each block is numbered, so a
// reply can sit next to the paragraph it's about.
function mdBlocks(text) {
  const blocks = [];
  let list = null;
  for (const raw of String(text || '').split('\n')) {
    const line = raw.trimEnd();
    if (/^\s*[-•*]\s+/.test(line)) { if (!list) { list = { type: 'ul', items: [] }; blocks.push(list); } list.items.push(line.replace(/^\s*[-•*]\s+/, '')); continue; }
    list = null;
    if (!line.trim()) { blocks.push(null); continue; }
    const h = line.match(/^#{1,3}\s+(.*)/);
    if (h) { blocks.push({ type: 'h', text: h[1] }); continue; }
    const last = blocks[blocks.length - 1];
    if (last?.type === 'p') last.text += `\n${line}`; else blocks.push({ type: 'p', text: line });
  }
  return blocks.filter(Boolean);
}
const linkify = (s) => esc(s).replace(/https:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => `<a href="${u}" target="_blank" rel="noopener">${u.replace(/^https:\/\/(www\.)?/, '').slice(0, 40)}${u.length > 52 ? '…' : ''}</a>`).replace(/\n/g, '<br>');
const blockHtml = (b) => (b.type === 'h' ? `<h4>${linkify(b.text)}</h4>` : b.type === 'ul' ? `<ul>${b.items.map((i) => `<li>${linkify(i)}</li>`).join('')}</ul>` : `<p>${linkify(b.text)}</p>`);
const blockText = (b) => (b.type === 'ul' ? b.items.join(' · ') : b.text);

function threadRow(t) {
  const [ico, cat] = THREAD_CATS[t.cat] || THREAD_CATS.talk;
  const last = t.replies ? `${t.replies} repl${t.replies === 1 ? 'y' : 'ies'}${t.lastByName && t.lastAt > t.at ? ` · ${esc(t.lastByName)} ${ago(t.lastAt)}` : ''}` : `${t.mins} min read`;
  return `<button type="button" class="th ${t.unread ? 'unread' : ''}" data-thread="${t.fid}:${t.id}"><span class="cat">${ico} ${cat} · <span class="aud a-${t.board}">${THREAD_BOARDS[t.board] || ''}</span>${t.pinned ? ' · 📌' : ''}${t.best ? ' · ✓ answered' : ''}${t.poll ? ` · ${t.poll.n} voted` : ''}</span>
    <b>${t.unread ? '<i class="dot"></i>' : ''}${esc(t.title)}</b><small class="muted">${esc(t.mine ? 'You' : t.byName)}${t.own ? '' : ` · ${esc(t.familyName)}`} · ${ago(t.at)} · ${last}</small></button>`;
}
// The Sunday digest: one calm summary of the week, on Sundays and Mondays until you close it.
function digestCard() {
  const d = new Date().getDay(), wk = shiftLocal(isoLocal(), -d);
  if (![0, 1].includes(d) || LS.get('fam.digestSeen') === wk || !th.list.length) return '';
  const since = Date.now() - 7 * 864e5;
  const fresh = th.list.filter((t) => t.at > since && !t.mine), asks = th.list.filter((t) => t.cat === 'ask' && !t.best && t.at > Date.now() - 21 * 864e5 && !t.mine), polls = th.list.filter((t) => t.poll && !t.poll.voted && (!t.poll.closes || t.poll.closes >= isoLocal()));
  const busy = th.list.filter((t) => t.replies >= 8 && t.lastAt > since);
  const rows = [
    fresh.length && ['📚', `${fresh.length} new thread${fresh.length === 1 ? '' : 's'}`, fresh.slice(0, 2).map((t) => t.title).join(' · ')],
    asks.length && ['❓', `${asks.length} question${asks.length === 1 ? '' : 's'} waiting for an answer`, asks[0].title],
    polls.length && ['📊', `${polls.length} poll${polls.length === 1 ? '' : 's'} to vote on`, `${polls[0].title}${polls[0].poll.closes ? ` · closes ${dayText(polls[0].poll.closes).replace(/ ·.*/, '')}` : ''}`],
    busy.length && ['🧵', `${busy[0].title} went long`, `${busy[0].replies} replies`],
  ].filter(Boolean);
  if (!rows.length) return '';
  return `<section class="digest"><div class="row between"><b>☕ This week in the family</b><button type="button" class="icon-btn" data-digestx="${wk}" aria-label="Close">✕</button></div>
    ${rows.map(([i, a, b]) => `<button type="button" class="fpick" data-famtab="threads"><span class="fp-i">${i}</span><div class="grow"><b class="small">${esc(a)}</b><small class="muted">${esc(b)}</small></div></button>`).join('')}</section>`;
}
async function threadsView() {
  const el = $('#famBody');
  if (!el) return;
  if (!th.loaded || Date.now() - th.loaded > 20000) { el.innerHTML = '<div class="skeleton card"></div>'; await loadThreads(); if (!$('#famBody') || state.famTab !== 'threads') return; }
  const hasFriends = (fam().connections || []).length || th.list.some((t) => !t.own);
  const boards = ['new', ...(partnerMember() ? ['us'] : []), 'family', ...((fam().modules || []).includes('dogs') ? ['dogs'] : []), 'house', ...(hasFriends ? ['friends'] : [])];
  const list = th.board === 'new' ? th.list : th.list.filter((t) => t.board === th.board);
  el.innerHTML = `<div class="row between"><div class="rchips boards">${boards.map((b) => `<button type="button" class="chip ${th.board === b ? 'on' : ''}" data-board="${b}">${b === 'new' ? 'New' : THREAD_BOARDS[b]}${b !== 'new' && th.list.some((t) => t.board === b && t.unread) ? ' <i class="dot"></i>' : ''}</button>`).join('')}</div></div>
    <button type="button" class="input-like" data-act="writeup">✍️ Write something up…</button>
    <div class="thlist">${list.map(threadRow).join('') || `<div class="card center"><p class="small">${th.board === 'us' ? `Write ${esc(partnerName())} something to read later — what you read about, a plan, an idea.` : 'Start a thread: something you learned, a question, a decision to talk through, or a how-to.'}</p><button type="button" data-act="writeup">✍️ Write it up</button></div>`}</div>`;
}
// One thread: just-us ones read like a letter (notes in the margin); the rest like a forum topic.
async function threadView(fid, id) {
  const r = await api.get(`/families/${fid}/threads/${id}`);
  const k = await threadKey(r.thread);
  th.cur = await openThreadText(r.thread, k);
  th.cur._key = k;
  const s = th.list.find((x) => x.id === id); if (s) { s.unread = false; famBadge(); usBadge(); }
  renderThread();
}
function renderThread() {
  const t = th.cur, meId = fam()?.me;
  const [ico, cat] = THREAD_CATS[t.cat] || THREAD_CATS.talk;
  const blocks = mdBlocks(t.body);
  const letter = t.aud === 'us';
  const atPara = (i) => t.replies.filter((r) => r.quote === i);
  const replyHtml = (r, n) => `<div class="post" id="r-${r.id}"><span class="av ${r.mine ? 'a1' : 'a2'}">${esc((r.name || '?')[0])}</span><div class="grow">
      <div class="h"><b>${esc(r.mine ? 'You' : r.name)}</b> · ${ago(r.at)}${letter ? '' : ` · #${n + 2}`}${t.bestId === r.id ? ' <span class="tag tg">✓ Best answer</span>' : ''}</div>
      ${r.quote != null && !letter ? `<div class="quote">❝ ${esc(typeof r.quote === 'number' ? (blocks[r.quote] ? blockText(blocks[r.quote]).slice(0, 140) : '') : r.quote)} ❞</div>` : ''}
      <div class="t">${linkify(r.text)}</div>
      <div class="ractions">${t.cat === 'ask' ? `<button type="button" class="linkish tiny" data-thup="${r.id}">▲ ${r.ups}${r.upped ? ' · you' : ''}</button>` : ''}${t.cat === 'ask' && t.mine ? `<button type="button" class="linkish tiny" data-thbest="${r.id}">${t.bestId === r.id ? 'Unmark best' : '✓ Best answer'}</button>` : ''}
        <button type="button" class="linkish tiny" data-thquote="r:${r.id}">❝ Quote</button>${r.mine ? `<button type="button" class="linkish tiny" data-thrdel="${r.id}">Delete</button>` : ''}</div></div></div>`;
  const pollHtml = t.poll ? `<div class="poll">${t.poll.opts.map((o, i) => { const total = t.poll.counts.reduce((a, b) => a + b, 0) || 1; return `<button type="button" class="${t.poll.mine === i ? 'on' : ''}" data-thvote="${i}"><i style="width:${Math.round((t.poll.counts[i] / total) * 100)}%"></i><span>${t.poll.mine === i ? '✓ ' : ''}${esc(o)} · ${t.poll.counts[i]}</span></button>`; }).join('')}
    <p class="tiny muted">${t.poll.closes ? `Closes ${esc(dayText(t.poll.closes).replace(/ ·.*/, ''))} · ` : ''}tap to vote, tap another to change</p></div>` : '';
  const seen = !t.mine ? '' : letter ? (t.readers.length ? `✓ Read by ${esc(partnerName())} ${ago(Math.max(...t.readers))}` : `Not read yet by ${esc(partnerName())}`) : t.readCount ? `Seen by ${t.readCount}` : '';
  const body = letter
    ? `<article class="letter"><div class="lmeta">${esc(t.mine ? 'You' : t.byName)} · ${esc(new Date(t.at).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }))} · ${t.mins} min</div><h3>${esc(t.title)}</h3>
        ${blocks.map((b, i) => `<div class="para" data-para="${i}">${blockHtml(b)}${atPara(i).map((r) => `<div class="margin">✍️ <b>${esc(r.mine ? 'You' : r.name)}:</b> ${linkify(r.text)}</div>`).join('')}${b.type === 'h' ? '' : `<button type="button" class="linkish tiny note-btn" data-thquote="p:${i}">✍️ Note</button>`}</div>`).join('')}</article>`
    : `<div class="cat">${ico} ${cat} · ${THREAD_BOARDS[t.board] || ''}</div><h2 class="thtitle">${esc(t.title)}</h2>
       <div class="post first"><span class="av a1">${esc((t.byName || '?')[0])}</span><div class="grow"><div class="h"><b>${esc(t.mine ? 'You' : t.byName)}</b>${t.own ? '' : ` · ${esc(t.familyName)}`} · ${ago(t.at)} · #1${t.editedAt ? ' · edited' : ''}</div><div class="t thbody">${blocks.map(blockHtml).join('')}</div></div></div>${pollHtml}`;
  const replies = letter ? t.replies.filter((r) => r.quote == null || typeof r.quote !== 'number') : t.replies;
  const sorted = t.cat === 'ask' ? [...replies].sort((a, b) => (b.id === t.bestId) - (a.id === t.bestId) || b.ups - a.ups || a.at - b.at) : replies;
  $('#view').innerHTML = `${demoBanner()}<div class="thread-page">
    <div class="row between"><button type="button" class="linkish" data-thback="1">‹ ${letter ? 'Us' : 'Threads'}</button>
      <span class="row"><button type="button" class="linkish small" data-thfollow="1">${t.following ? '🔔 Following' : '🔕 Follow'}</button>${t.mine ? ` <button type="button" class="linkish small" data-thedit="1">Edit</button>` : ''}${t.mine || fam()?.members.find((x) => x.id === meId)?.role === 'owner' ? ` <button type="button" class="linkish small" data-thpin="1">${t.pinned ? 'Unpin' : '📌 Pin'}</button> <button type="button" class="linkish small danger" data-thdel="1">Delete</button>` : ''}</span></div>
    ${body}
    ${seen ? `<p class="tiny muted">${seen}</p>` : ''}
    ${sorted.length ? `<div class="grp">${letter ? 'Notes' : `${sorted.length} repl${sorted.length === 1 ? 'y' : 'ies'}`}</div>${sorted.map(replyHtml).join('')}` : ''}
    <form id="thReplyForm" class="stack reply-box">${th.quote ? `<div class="quote">❝ ${esc(th.quote.label)} ❞ <button type="button" class="linkish tiny" data-thquote="x">✕</button></div>` : ''}
      <textarea name="text" rows="2" maxlength="4000" placeholder="${letter ? 'Write a note…' : t.cat === 'ask' ? 'Your answer…' : 'Reply…'}" required></textarea><div class="row end"><button>${letter ? 'Add note' : 'Reply'}</button></div></form>
  </div>`;
}
// ✍️ Write it up: for just the two of you, the family, or friends' families. Drafts keep themselves.
const draftKey = () => `fam.threadDraft.${state.fid}`;
function writeupSheet(preset = {}) {
  let d = {}; try { d = JSON.parse(LS.get(draftKey()) || '{}'); } catch { /* none */ }
  if (preset.edit) {
    const t = preset.edit;
    openSheet(`<h2>✎ Edit</h2><form id="writeForm" class="stack" data-edit="${t.id}"><input name="title" maxlength="120" value="${esc(t.title)}" required><textarea name="body" rows="12" maxlength="12000">${esc(t.body)}</textarea>
      <div class="toolbar"><button type="button" class="linkish small" data-wfmt="## ">H</button><button type="button" class="linkish small" data-wfmt="- ">• List</button><span class="grow"></span><button type="button" class="linkish small" data-act="tidy">✨ Tidy it up</button></div>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Save</button></div></form>`);
    return;
  }
  const p = partnerMember(), hasFriends = (fam().connections || []).length;
  const aud = preset.aud || d.aud || (state.view === 'us' && p ? 'us' : 'family');
  const v = { aud, board: d.board || 'family', cat: preset.cat || d.cat || (aud === 'us' ? 'learned' : 'talk'), title: d.title || '', body: d.body || '', opts: d.opts || ['', ''] };
  const auds = [...(p ? [['us', `💞 Just ${p.name}`]] : []), ['family', '👨‍👩‍👧 Family'], ...(hasFriends ? [['connections', "🤝 Friends' families"]] : [])];
  const boards = [['family', 'General'], ...((fam().modules || []).includes('dogs') ? [['dogs', '🐾 Dogs']] : []), ['house', '🏠 House & money']];
  openSheet(`<div class="row between"><h2>✍️ Write it up</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <form id="writeForm" class="stack">
      <div class="rchips radios chipradios">${auds.map(([k, l]) => `<label><input type="radio" name="aud" value="${k}" ${v.aud === k ? 'checked' : ''}><span class="chip">${esc(l)}</span></label>`).join('')}</div>
      <div class="rchips radios chipradios wboards" ${v.aud === 'family' ? '' : 'hidden'}>${boards.map(([k, l]) => `<label><input type="radio" name="board" value="${k}" ${v.board === k ? 'checked' : ''}><span class="chip">${l}</span></label>`).join('')}</div>
      <div class="rchips radios chipradios">${Object.entries(THREAD_CATS).filter(([k]) => v.aud !== 'us' || !['ask', 'poll'].includes(k)).map(([k, [i, l]]) => `<label><input type="radio" name="cat" value="${k}" ${v.cat === k ? 'checked' : ''}><span class="chip">${i} ${l}</span></label>`).join('')}</div>
      <input name="title" maxlength="120" placeholder="Title" value="${esc(v.title)}" required>
      <textarea name="body" rows="9" maxlength="12000" placeholder="${v.aud === 'us' ? 'Just type it while it\'s fresh — rough is fine. Paste links. Tap ✨ to tidy it up.' : 'What\'s it about? Paste links; “## ” makes a heading, “- ” a list.'}">${esc(v.body)}</textarea>
      <div class="toolbar"><button type="button" class="linkish small" data-wfmt="## ">H</button><button type="button" class="linkish small" data-wfmt="- ">• List</button><span class="grow"></span><button type="button" class="linkish small" data-act="tidy">✨ Tidy it up</button></div>
      <div class="wpoll stack" ${v.cat === 'poll' ? '' : 'hidden'}>${v.opts.map((o, i) => `<input name="opt" maxlength="80" placeholder="Choice ${i + 1}" value="${esc(o)}">`).join('')}<button type="button" class="linkish small" data-act="pollopt">＋ Another choice</button><label class="small">Closes (optional)<input type="date" name="closes" min="${isoLocal()}"></label></div>
      ${p ? `<label class="switch-row wnudge" ${v.aud === 'us' ? '' : 'hidden'}><span>🔔 Let ${esc(p.name)} know now<small class="muted">Otherwise it waits quietly in Us › For you</small></span><input type="checkbox" name="nudge"><i class="switch"></i></label>` : ''}
      <div class="row end"><button type="button" class="ghost" data-act="close">Later</button><button>Post</button></div>
      <p class="tiny muted">🔒 End-to-end encrypted. Drafts stay on this phone. ✨ Tidy it up sends only this text to Claude, and only when you tap it.</p>
    </form>`);
}
function saveDraft() {
  const f = $('#writeForm'); if (!f) return;
  const v = Object.fromEntries(new FormData(f));
  try { LS.set(draftKey(), JSON.stringify({ aud: v.aud, board: v.board, cat: v.cat, title: v.title, body: v.body, opts: [...f.querySelectorAll('[name=opt]')].map((x) => x.value) })); } catch { /* full */ }
}
async function postThread(f) {
  if (lockedHere()) return toast('🔒 This device needs the family key first — Me › 🔐 Encryption');
  const v = Object.fromEntries(new FormData(f));
  const opts = [...f.querySelectorAll('[name=opt]')].map((x) => x.value.trim()).filter(Boolean);
  if (v.cat === 'poll' && opts.length < 2) return toast('A poll needs at least two choices');
  let k = fk(), pk;
  if (k && v.aud === 'connections') {
    k = newKey();
    const conns = {};
    for (const [other, sealedCk] of Object.entries(fam().connkeys || {})) { const ck = await tryOpen(fk(), sealedCk, null); if (ck) conns[other] = await seal(ck, k); }
    pk = { fam: await seal(fk(), k), conns };
  }
  const L = (x) => (k ? seal(k, x) : x);
  const words = `${v.title} ${v.body}`.split(/\s+/).length;
  const r = await api.post(`/families/${state.fid}/threads`, { aud: v.aud, board: v.board, cat: v.cat, title: await L(v.title.trim()), body: await L(v.body.trim()), mins: Math.max(1, Math.round(words / 200)), nudge: !!v.nudge, cid: f.dataset.cid || (f.dataset.cid = Math.random().toString(36).slice(2, 12)),
    ...(v.cat === 'poll' ? { poll: { opts: await Promise.all(opts.map(L)), closes: v.closes || '' } } : {}), ...(pk ? { pk } : {}) });
  LS.set(draftKey(), null);
  closeSheet();
  th.loaded = 0; th.board = v.aud === 'us' ? 'us' : 'new';
  toast(v.aud === 'us' ? `📓 Saved for ${partnerName()} to read` : '📖 Posted');
  if (v.aud === 'us' && state.view === 'us') { await loadThreads(); return renderUs(); }
  state.famTab = 'threads'; LS.set('fam.famTab', 'threads');
  show('feed');
  return threadView(state.fid, r.thread.id);
}
async function saveThreadEdit(f) {
  const k = th.cur._key, L = (x) => (k ? seal(k, x) : x);
  const words = `${f.title.value} ${f.body.value}`.split(/\s+/).length;
  const patch = { title: await L(f.title.value.trim()), body: await L(f.body.value.trim()), mins: Math.max(1, Math.round(words / 200)) };
  closeSheet();
  return threadAct(() => api.patch(`/families/${th.cur.fid}/threads/${th.cur.id}`, patch));
}
async function threadAct(fn) { const r = await fn(); if (r?.thread) { const k = th.cur._key; th.cur = await openThreadText(r.thread, k); th.cur._key = k; renderThread(); } return r; }

// ---------- ✨ Next up: what to do next, and when (worked out on this phone) ----------
const nu = { res: null, ctx: null, watchKick: false };
const NU_H = 3600e3;
const nuKey = () => `fam.nextup.${state.fid}`;
const nuLearned = () => { try { return JSON.parse(LS.get(nuKey()) || '{}'); } catch { return {}; } };
const nuSettings = () => { try { return JSON.parse(LS.get('fam.nextupSet') || '{}'); } catch { return {}; } };
async function nextUpCtx() {
  const [N, B] = await Promise.all([import('../js/nextup.js'), import('../js/brief.js')]);
  const now = new Date(), today = isoLocal(), tomorrow = shiftLocal(today, 1);
  const wx = await walkWeather().catch(() => null);
  const hours = wx ? wx.hourly.filter((h) => h.time > now && h.time - now < 30 * NU_H) : [];
  if (!calm.nuLoaded) { calm.nuLoaded = true; await loadCal().catch(() => {}); }
  const p = partnerMember();
  const days = await Promise.all([today, tomorrow].map(async (d) => ({ d, list: await dayEntries(d).catch(() => []) })));
  const busyFor = (pid) => days.flatMap(({ d, list }) => list.filter((e) => e.time && !e.allDay && (e.who === 'both' || e.who === pid)).map((e) => {
    const start = new Date(`${d}T${e.time}`), end = e.end ? new Date(`${d}T${e.end}`) : new Date(start.getTime() + NU_H);
    return { start, end: end > start ? end : new Date(start.getTime() + NU_H), title: e.title, icon: e.icon };
  }));
  const all = await loadNudges().catch(() => ({}));
  const mine = await myTrackers().catch(() => null);
  const classes = [today, tomorrow].flatMap((d) => B.classesOn(Array.isArray(mine?.gymClasses) ? mine.gymClasses : [], new Date(`${d}T12:00:00`))
    .filter((c) => c.type === 'yoga').map((c) => ({ at: new Date(`${d}T${c.time}`), label: c.name || 'Yoga class', place: B.GYMS[c.gym]?.short || '' })));
  const callWindows = me()?.legacyId && B.CALL.who === me().legacyId ? [...B.callWindows(today), ...B.callWindows(tomorrow)] : [];
  let dogs = null;
  if ((fam().modules || []).includes('dogs') && dogsOf().length) {
    const c = await api.get(`/families/${state.fid}/care?to=${today}&days=1`).catch(() => null);
    dogs = { enabled: true, walkedToday: (c?.days?.[today] || []).some((e) => e.kind === 'walk' || e.kind === 'park') };
  }
  // New episodes need the Watch list; it's fetched once in the background, then this runs again.
  if (p && !watch.shows.length && !nu.watchKick) { nu.watchKick = true; loadWatch().then(loadTv).then(() => renderNextUp()).catch(() => {}); }
  const shows = (watch.shows || []).filter((x) => x.status === 'watching' && x.ep?.newCount).map((x) => ({ id: x.id, title: x.title, newCount: x.ep.newCount, from: x.ep.from, to: x.ep.to }));
  const A = await import('../js/activity.js');
  const workouts = {};
  for (const w of Array.isArray(mine?.workouts) ? mine.workouts : []) { const k = { running: 'run', cycling: 'bike', hotYoga: 'hotyoga' }[A.sportOf(w.name || '')]; if (k) (workouts[k] ||= []).push(new Date(w.start).getHours()); }
  return { N, ctx: { now, hours, busy: busyFor(fam().me), partnerBusy: p ? busyFor(p.id) : [], nudges: all, classes, callWindows, dogs, shows, learned: nuLearned(), workouts } };
}
async function renderNextUp() {
  const el = $('#nextUp');
  if (!el || nuSettings().off) { if (el) el.hidden = true; return; }
  const { N, ctx } = await nextUpCtx();
  nu.ctx = ctx; nu.res = N.plan(ctx);
  if (!$('#nextUp')) return;
  const [top, ...alts] = nu.res.picks;
  if (!top) { el.hidden = false; el.innerHTML = `<div class="nu-k">✨ Next up</div><p class="small muted">Nothing due right now. ${Object.keys(callNudge.all || {}).length ? '' : '<button type="button" class="linkish small" data-act="habits">🔁 Set up runs, rides or hot yoga</button>'}</p>`; return; }
  el.hidden = false;
  el.innerHTML = `<div class="row between"><span class="nu-k">✨ Next up · ${esc(top.when)}</span><span><button type="button" class="linkish tiny" data-act="nuplan">📅 Today's plan</button> <button type="button" class="linkish tiny" data-act="nuknows" aria-label="What Next up knows">⋯</button></span></div>
    <h3 class="nu-t">${top.icon} ${esc(top.title)}</h3>
    <p class="nu-why">${top.why.map(esc).join(' · ')}</p>
    <div class="row wrap nu-acts"><button type="button" class="small" data-nu="done:0">✓ Done</button><button type="button" class="ghost small" data-nu="later:0">⏰ Later</button><button type="button" class="ghost small" data-nu="skip:0">✕ Not today</button><button type="button" class="linkish small" data-nu="why:0">Why?</button></div>
    ${alts.map((a, i) => `<div class="nu-alt"><span>${a.icon}</span><span class="grow"><b>${esc(a.title)}</b> <small class="muted">${esc(a.when)} · ${esc(a.why[0] || '')}</small></span><button type="button" class="linkish tiny" data-nu="done:${i + 1}">✓</button><button type="button" class="linkish tiny" data-nu="skip:${i + 1}">✕</button></div>`).join('')}`;
  nuSendNudge(top);
}
// 🔔 Optional: a notification 30 minutes before the top pick (sent by the connector).
function nuSendNudge(top) {
  if (!nuSettings().nudge || api.mode() === 'demo') return;
  const sig = `${top.kind}:${top.at.getTime()}`;
  if (LS.get('fam.nextupSent') === sig) return;
  LS.set('fam.nextupSent', sig);
  api.put('/account/nextup', { at: top.at.getTime(), title: `${top.icon} ${top.title} in 30 min?`, body: top.why.slice(0, 2).join(' · ') }).catch(() => {});
}
async function nuAct(what, i) {
  const pick = nu.res?.picks[i];
  if (!pick) return;
  const N = await import('../js/nextup.js');
  if (what === 'why') return nuWhy(pick);
  if (what === 'done') {
    if (['run', 'bike', 'hotyoga', 'callmom'].includes(pick.kind)) setNudges(await api.post(`/account/nudges/${pick.kind}/done?today=${isoLocal()}`, { date: isoLocal() }));
    if (pick.kind === 'walk' || pick.withDogs) await api.post(`/families/${state.fid}/care`, { kind: 'walk', date: isoLocal(), by: 'me' }).catch(() => {});
    if (pick.kind === 'show') await api.post(`/families/${state.fid}/watch/shows/${pick.show}/night`, { date: isoLocal() }).catch(() => {});
    toast(`✓ ${pick.icon} ${pick.title} — nice`);
  } else toast(what === 'later' ? `⏰ ${pick.title} — later` : `✕ Not today: ${pick.title}`);
  LS.set(nuKey(), JSON.stringify(N.learn(nuLearned(), what, pick)));
  if (what !== 'later') LS.set('fam.nextupSent', null);
  closeSheet(); renderNextUp(); renderYourDay();
}
function nuWhy(p) {
  const pct = Math.round(p.sure * 100);
  openSheet(`<div class="row between"><h2>Why ${esc(p.title.toLowerCase())} at ${esc(p.when)}?</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <ul class="list">${p.why.map((w) => `<li>${esc(w)}</li>`).join('')}${p.kind !== 'show' && p.kind !== 'callmom' ? `<li>📅 You're free then</li>` : ''}</ul>
    <div class="grp">How sure</div><div class="nu-bar"><i style="width:${pct}%"></i></div>
    <p class="tiny muted">Out of ${nu.res.considered} times and things it tried. ${nu.res.all.length > 3 ? `Also possible: ${nu.res.all.slice(3, 6).map((x) => `${x.icon} ${esc(x.title)} ${esc(x.when)}`).join(', ')}.` : ''}</p>
    <div class="grp">Tell it</div><div class="row wrap"><button type="button" class="ghost small" data-nu="later:${nu.res.picks.indexOf(p)}">⏰ Later</button><button type="button" class="ghost small" data-nu="skip:${nu.res.picks.indexOf(p)}">✕ Not today</button><button type="button" class="ghost small" data-act="habits">🔁 Change how often</button></div>`);
}
function nuPlan() {
  const today = isoLocal(), ctx = nu.ctx;
  const fixed = ctx.busy.filter((b) => isoLocal(b.start) === today).map((b) => ({ at: b.start, label: `${b.icon || '📅'} ${b.title}`, fixed: true }));
  const sugg = nu.res.all.filter((x) => isoLocal(x.at) === today).map((x) => ({ at: x.at, label: `${x.icon} ${x.title}`, why: x.why[0] || '' }));
  const items = [...fixed, ...sugg].sort((a, b) => a.at - b.at);
  const clock = (d) => d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '');
  openSheet(`<div class="row between"><h2>📅 Today's plan</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <div class="tl">${items.map((x) => `<div class="st ${x.fixed ? 'fixed' : ''}"><div class="t">${esc(clock(x.at))}</div><b>${esc(x.label)}</b>${x.why ? `<small class="muted">${esc(x.why)}</small>` : ''}</div>`).join('') || '<p class="small muted">Nothing on the calendar, and nothing due today.</p>'}</div>
    <p class="tiny muted">Calendar items are fixed; ✨ suggestions are slotted into the free time around them.</p>`);
}
async function nuKnows() {
  const ctx = nu.ctx || (await nextUpCtx()).ctx;
  const l = ctx.learned, N = await import('../js/nextup.js');
  const usual = N.usualHours(l, ctx.workouts);
  const mode = (h) => { const e = Object.entries(h || {}).sort((a, b) => b[1] - a[1])[0]; return e ? new Date(2000, 0, 1, +e[0]).toLocaleTimeString(undefined, { hour: 'numeric' }) : ''; };
  const DAYS = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'];
  const rows = Object.entries(N.KINDS).map(([k, v]) => {
    const done = (l.done || []).filter((d) => d.kind === k).length + (ctx.workouts[k]?.length || 0);
    const skipDays = Object.entries(l.skips?.[k] || {}).filter(([, n]) => n >= 2).map(([d]) => DAYS[d]);
    const set = ctx.nudges[k];
    if (!done && !skipDays.length && !set) return '';
    return `<li><span>${v.icon} <b>${v.label}</b></span><small class="muted">${[set ? `every ${set.every} day${set.every === 1 ? '' : 's'}` : '', done ? `${done} logged lately` : '', mode(usual[k]) ? `usually ~${mode(usual[k])}` : '', skipDays.length ? `skipped on ${skipDays.join(', ')}` : ''].filter(Boolean).join(' · ')}</small></li>`;
  }).join('');
  const took = (l.done || []).length, skipped = Object.values(l.skips || {}).reduce((n, o) => n + Object.values(o).reduce((a, b) => a + b, 0), 0);
  const st = nuSettings();
  openSheet(`<div class="row between"><h2>✨ What Next up knows</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <ul class="list nu-knows">${rows || '<li class="small muted">Not much yet — it learns from what you tick off, skip, and what WHOOP / Strava shows you did.</li>'}</ul>
    ${took + skipped ? `<p class="small">Took ${took} of ${took + skipped} suggestions.</p>` : ''}
    <div class="grp">Settings</div>
    <label class="switch-row"><span>🔔 Nudge me 30 minutes before<small class="muted">A notification for the top pick, if it's still the plan</small></span><input type="checkbox" data-nuset="nudge" ${st.nudge ? 'checked' : ''}><i class="switch"></i></label>
    <label class="switch-row"><span>✨ Show Next up<small class="muted">The bubble at the top of Moments</small></span><input type="checkbox" data-nuset="show" ${st.off ? '' : 'checked'}><i class="switch"></i></label>
    <button type="button" class="linkish small danger" data-act="nureset">Forget what it learned</button>
    <p class="tiny muted">Worked out on this phone from your reminders, workouts, calendar, the weather, class times and your Watch list. Nothing extra leaves the phone (the 30-minute nudge sends just that one suggestion to the connector so it can notify you).</p>`);
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
    await usChanged();
  }
  LS.set(flag, '1');
}
async function usChanged(r) {
  await loadUs(); renderToday(); renderComingLine();
  if (state.view === 'us') renderUs();
  usBadge();
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
// plans. {time, icon, title, sub, cls, open, who}
// One day's calendar events: the family's own and linked calendars'. The same event in two
// calendars (an invite you both accepted, or one also added here) shows once, for both of you.
function calItems(day) {
  const C = calm.C, out = [];
  for (const e of C.eventsOn(calm.events, day)) out.push({ uid: '', time: e.allDay ? '' : e.start, end: e.allDay ? '' : e.end, allDay: !!e.allDay, icon: '📅', title: e.title, place: e.place || '', rpt: C.repeatText?.(e) || '', who: calWho(e.who), sub: e.place || '', cls: 'fam', open: `data-event="${e.id}"` });
  const cache = feedCache();
  const made = dogCalMarks();
  for (const f of calm.feeds) for (const e of C.eventsOn(cache[f.id]?.events || [], day)) if (made[`${f.id}:${String(e.id || '').replace(/-\d+$/, '')}:${e.date || day}`] !== 'appt') out.push({ uid: String(e.id || '').replace(/-\d+$/, ''), time: e.allDay ? '' : e.start, end: e.allDay ? '' : e.end, allDay: !!e.allDay, icon: '📲', title: e.title, place: e.place || '', feed: f.name, who: f.who === 'both' ? 'both' : f.who || f.by, cls: 'fam' });
  return mergeSame(out);
}
const sameKey = (e) => `${e.allDay ? 'all' : e.time}|${String(e.title || '').toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
function mergeSame(list) {
  const adults = calPeople().map((m) => m.id);
  const out = [];
  for (const e of list) {
    const twin = out.find((x) => (e.uid && x.uids.includes(e.uid)) || sameKey(x) === sameKey(e));
    if (!twin) { out.push({ ...e, uids: e.uid ? [e.uid] : [], whos: e.who === 'both' ? [...adults] : [e.who], feeds: e.feed ? [e.feed] : [] }); continue; }
    if (e.uid && !twin.uids.includes(e.uid)) twin.uids.push(e.uid);
    for (const w of e.who === 'both' ? adults : [e.who]) if (!twin.whos.includes(w)) twin.whos.push(w);
    if (e.feed && !twin.feeds.includes(e.feed)) twin.feeds.push(e.feed);
    // The family's own copy is the one you can open and edit; a linked copy fills in what it lacks.
    if (!twin.open && e.open) Object.assign(twin, { open: e.open, icon: e.icon, rpt: e.rpt });
    twin.place ||= e.place; twin.end ||= e.end;
  }
  for (const e of out) {
    e.who = adults.length > 1 && adults.every((id) => e.whos.includes(id)) ? 'both' : e.whos.length === 1 ? e.whos[0] : 'both';
    e.feed = e.open ? '' : e.feeds.join(' + ');
  }
  return out;
}
async function dayEntries(day) {
  const out = calItems(day);
  for (const a of dogsHub.appts.filter((x) => x.status !== 'done')) {
    const pets = a.pets.map((id) => member(id)?.name).filter(Boolean).join(' & ');
    const [ico, label] = APPT[a.type] || APPT.other;
    for (const [k, verb] of [['drop', 'Drop off'], ['pick', 'Pick up']]) {
      const at = a[`${k}At`];
      if (!at || at.slice(0, 10) !== day) continue;
      const by = a[`${k}By`];
      out.push({ time: at.slice(11, 16), icon: k === 'drop' ? ico : '🏁', title: `${verb} ${pets} · ${label.toLowerCase()}`, sub: by ? who(by) : '<span class="tone-warn">nobody yet — tap to take it</span>', who: by || 'nobody', cls: 'dog', open: `data-apptopen="${a.id}"` });
    }
  }
  // An agreed plan that's already on the calendar (planToCalendar) shows once, as that event.
  for (const p of us.plans.filter((x) => !x.done && x.day === day && !calm.events.some((e) => e.id === `tplan${x.id}`))) out.push({ time: p.time || '', icon: (KINDS[p.kind] || KINDS.other)[0], title: planTitle(p), sub: p.agreed ? "it's a plan 🙌" : 'waiting for an answer', who: 'both', cls: 'plan' });
  return out.sort((a, b) => (a.time || '').localeCompare(b.time || ''));
}
const timeLabel = (t) => (t ? new Date(`2000-01-01T${t}`).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).replace(':00', '').replace(' ', '').toLowerCase() : 'all day');
async function calendarView() {
  calm.month ||= isoLocal().slice(0, 7); calm.day ||= isoLocal();
  $('#view').innerHTML = `${demoBanner()}<div class="tcal"><button type="button" class="ghost wide add-ev" data-act="eventnew">＋ Add an event</button><section class="card" id="calMonth"><div class="skeleton line"></div></section><div id="calRhythm"></div><div id="calDay"></div><div id="calNext"></div><div id="calFeeds"></div></div>
    <p class="tiny muted center pad">🔒 Only your family sees this calendar — friends' families see nothing. Titles, places and notes are end-to-end encrypted.</p>`;
  await loadCal();
  importCal().catch(() => {});
  renderCal();
}
// The grown-ups, in family order: each gets a colour (blue, pink…), and "both" is green.
const calPeople = () => fam().members.filter((m) => m.kind === 'person' && m.relation !== 'child');
function calWho(list) {
  const ids = (Array.isArray(list) ? list : [list]).filter(Boolean);
  const adults = calPeople().map((m) => m.id);
  if (!ids.length || adults.every((id) => ids.includes(id)) && adults.length > 1) return 'both';
  return ids.length === 1 ? ids[0] : 'both';
}
const whoCls = (w) => (w === 'both' ? 'w-both' : w === 'nobody' ? 'w-none' : `w-p${Math.min(3, Math.max(0, calPeople().findIndex((m) => m.id === w)))}`);
const whoName = (w) => (w === 'both' ? 'Both' : w === 'nobody' ? 'Open' : w === fam().me ? 'You' : member(w)?.name || '');
const calDayLabel = (d) => (d === isoLocal() ? 'Today' : d === shiftLocal(isoLocal(), 1) ? 'Tomorrow' : new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }));
function calRow(e, day = null) {
  const t = e.allDay || !e.time ? 'All day' : timeLabel(e.time);
  return `<li class="ev ${e.feed ? 'feed' : ''} ${e.cls}"><button type="button" class="ev-main" ${e.open || ''}>
    <span class="ev-time">${day ? `${esc(calDayLabel(day))}<br>` : ''}${t}</span>
    <span class="ev-body"><b>${e.icon} ${esc(e.title)}</b>${e.rpt ? `<small class="muted">🔁 ${esc(e.rpt)}</small>` : ''}${e.place ? `<small class="muted">📍 ${esc(e.place)}</small>` : ''}${e.feed ? `<small class="muted">📲 ${esc(e.feed)}</small>` : e.cls !== 'fam' && e.sub ? `<small class="muted">${e.sub}</small>` : ''}</span>
    ${e.who ? `<span class="who-chip ${whoCls(e.who)}">${esc(whoName(e.who))}</span>` : ''}
  </button></li>`;
}
async function renderCal() {
  if (!$('#calMonth')) return;
  const [y, mo] = calm.month.split('-').map(Number);
  const first = new Date(y, mo - 1, 1);
  const daysIn = new Date(y, mo, 0).getDate();
  const today = isoLocal();
  const hearts = {};
  for (const r of calm.rhythm || []) (hearts[r.date] ||= []).push(r);
  const cells = Array.from({ length: first.getDay() }, () => '<span class="cal-pad"></span>');
  for (let i = 1; i <= daysIn; i++) {
    const d = `${calm.month}-${String(i).padStart(2, '0')}`;
    const evs = calItems(d).map((e) => e.who);
    const dog = dogsHub.appts.some((a) => a.status !== 'done' && [a.dropAt, a.pickAt].some((x) => x?.startsWith(d)));
    const plan = us.plans.some((p) => !p.done && p.day === d);
    const marks = `${calm.golden.includes(d) ? '⭐' : ''}${hearts[d] ? '❤️' : ''}${dog ? '🐾' : ''}${plan ? '💞' : ''}`;
    cells.push(`<button type="button" class="cd ${d === calm.day ? 'sel' : ''} ${d === today ? 'today' : ''}" data-calday="${d}" aria-label="${d}${evs.length ? `, ${evs.length} events` : ''}"><span>${i}</span><span class="dots">${evs.slice(0, 3).map((w) => `<i class="${whoCls(w)}"></i>`).join('')}</span>${marks ? `<span class="marks">${marks}</span>` : ''}</button>`);
  }
  const people = calPeople().slice(0, 4);
  const gold = calm.golden.filter((d) => d.startsWith(calm.month)).length;
  const dates = Object.entries(hearts).filter(([d]) => d.startsWith(calm.month)).flatMap(([, l]) => l).filter((r) => r.kind === 'date').length;
  $('#calMonth').innerHTML = `<div class="row between" style="margin-top:0"><button type="button" class="ghost small" data-calmove="-1" aria-label="Previous month">‹</button><b>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</b><button type="button" class="ghost small" data-calmove="1" aria-label="Next month">›</button></div>
    <div class="cal-grid month">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((x) => `<span class="cal-h">${x}</span>`).join('')}${cells.join('')}</div>
    <div class="cal-key small muted"><span><i class="w-both"></i>Both</span>${people.map((m) => `<span><i class="${whoCls(m.id)}"></i>${esc(m.id === fam().me ? `${m.name} (you)` : m.name)}</span>`).join('')}<span>⭐ Golden day</span><span>❤️ Us time</span><span>🐾 Dogs</span><span>💞 Plans</span></div>
    ${dates || gold ? `<p class="small cal-month-sum">This month: ${dates ? `❤️ ${dates} date${dates === 1 ? '' : 's'}` : ''}${dates && gold ? ' · ' : ''}${gold ? `⭐ ${gold} golden day${gold === 1 ? '' : 's'} for the dogs` : ''}</p>` : ''}`;
  // The chosen day.
  const sel = await dayEntries(calm.day);
  const dayMarks = [
    ...(hearts[calm.day] || []).map((r) => `<li class="mark-row">${calm.R ? calm.R.momentIcon(r) : '❤️'} <span>${esc(calm.R ? calm.R.momentText(r) : 'Us time')}${r.by && r.by !== fam().me ? ` <small class="muted">· ${esc(member(r.by)?.name || '')}</small>` : ''}</span><button type="button" class="linkish small" data-momentedit="${esc(r.id)}">✎ Edit</button></li>`),
    ...(calm.golden.includes(calm.day) ? ['<li class="mark-row">⭐ <span>Golden day for the dogs</span></li>'] : []),
  ];
  $('#calDay').innerHTML = `<section class="card"><div class="row between" style="margin-top:0"><div class="eyebrow">${esc(calDayLabel(calm.day))}${calm.day !== today ? ` · ${new Date(`${calm.day}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}` : ''}</div><button type="button" class="linkish small" data-act="eventnew">＋ Event</button></div>
    ${dayMarks.length ? `<ul class="mark-list">${dayMarks.join('')}</ul>` : ''}
    ${sel.length ? `<ul class="ev-list">${sel.map((e) => calRow(e)).join('')}</ul>` : dayMarks.length ? '' : '<p class="small muted">Nothing planned. Tap ＋ to add something.</p>'}
    ${calm.day <= today ? `<button type="button" class="ghost small logdate" data-act="lognew">❤️ Log a date on this day</button>` : ''}</section>
    <div id="calDress"></div>`;
  renderCalDress(calm.day).catch(() => {});
  // Coming up: the next two weeks after the chosen day.
  const next = [];
  for (let i = 1, d = shiftLocal(calm.day, 1); i <= 14 && next.length < 8; i++, d = shiftLocal(d, 1)) for (const e of await dayEntries(d)) next.push({ ...e, day: d });
  $('#calNext').innerHTML = next.length ? `<section class="card"><div class="eyebrow">Coming up</div><ul class="ev-list">${next.slice(0, 8).map((e) => calRow(e, e.day)).join('')}</ul></section>` : '';
  const fc = feedCache();
  $('#calFeeds').innerHTML = `<details class="card"><summary><b>📲 Linked calendars</b> <span class="small muted">${calm.feeds.length ? `${calm.feeds.length} linked` : 'bring in your iPhone or Google calendar'}</span></summary>
    ${calm.feeds.length ? `<ul class="list">${calm.feeds.map((f) => `<li class="row between small"><span><i class="who-dot ${whoCls(f.who === 'both' ? 'both' : f.who || f.by)}"></i> <b>${esc(f.name)}</b> <small class="${fc[f.id]?.error ? 'tone-warn' : 'muted'}">${fc[f.id]?.error ? esc(fc[f.id].error) : fc[f.id]?.events ? `${fc[f.id].events.length} events` : 'loading…'}</small></span>${f.by === fam().me ? `<button type="button" class="linkish small danger" data-feeddel="${f.id}">Unlink</button>` : ''}</li>`).join('')}</ul><button type="button" class="linkish small" data-act="feedsrefresh">↻ Refresh</button>` : ''}
    <form id="feedForm" class="stack"><p class="small">iPhone: Calendar app › Calendars › ⓘ next to yours › turn on <b>Public Calendar</b> › Share Link › Copy. Google: Settings › your calendar › <b>Secret address in iCal format</b>.</p>
      <label>Name<input name="name" maxlength="40" required placeholder="My iPhone calendar"></label><label>Link<input name="url" required placeholder="webcal://p…icloud.com/…"></label>
      <label class="check"><input type="checkbox" name="both"><span>It's for both of us</span></label><button>Link it</button></form></details>`;
  // 💞 2-2-2-2: what's due, from the trackers' log.
  rhythmLine().catch(() => {});
}

// 👔 Dress for the day, for each grown-up: where the calendar puts them (else home), and how to
// layer for that place's feels-like temperatures from leaving to getting home.
const dressPicks = () => { try { return JSON.parse(LS.get('fam.dressPicks') || '{}'); } catch { return {}; } };
async function dressHours(place, date) {
  const B = await import('../js/brief.js');
  let cache = {};
  try { cache = JSON.parse(LS.get('fam.dressWx') || '{}'); } catch { /* none */ }
  let c = cache[place.id];
  if (!c || Date.now() - c.at > 60 * 60000) {
    const r = await fetch(B.weatherUrls(place, 7).forecast);
    if (!r.ok) throw new Error(`weather ${r.status}`);
    c = { at: Date.now(), forecast: await r.json() };
    cache[place.id] = c;
    try { LS.set('fam.dressWx', JSON.stringify(cache)); } catch { /* full */ }
  }
  return B.parseWeather(c.forecast, null).filter((h) => isoLocal(h.time) === date);
}
// Towns from the day's event addresses (Hayward, Sausalito…), looked up once with Open-Meteo's
// free place search and kept on this phone, so the weather is for where you'll actually be.
async function eventPlaces(D, entries) {
  let geo = {}; try { geo = JSON.parse(LS.get('fam.geo') || '{}'); } catch { /* none */ }
  const out = [];
  for (const town of [...new Set(entries.map((e) => D.townOf(e.place)).filter(Boolean))]) {
    if (D.matchPlace(town)) continue;
    const k = town.toLowerCase();
    if (!(k in geo)) {
      const j = await fetch(`https://geocoding-api.open-meteo.com/v1/search?${new URLSearchParams({ name: town, count: '5', language: 'en' })}`).then((r) => r.json()).catch(() => null);
      const hit = (j?.results || []).find((x) => x.country_code === 'US' && x.admin1 === 'California') || (j?.results || []).find((x) => x.country_code === 'US') || j?.results?.[0];
      geo[k] = hit ? { lat: hit.latitude, lon: hit.longitude, name: hit.name } : null;
      try { LS.set('fam.geo', JSON.stringify(geo)); } catch { /* full */ }
    }
    if (geo[k]) out.push({ id: `g-${k.replace(/[^a-z0-9]+/g, '')}`, name: geo[k].name || town, lat: geo[k].lat, lon: geo[k].lon, keys: [k] });
  }
  return out;
}
async function renderCalDress(date) {
  const el = $('#calDress');
  if (!el) return;
  const today = isoLocal(), last = shiftLocal(today, 6);
  const people = calPeople().filter((m) => m.status === 'active' || m.id === fam().me).slice(0, 2);
  if (!people.length || date < today || date > last) { el.innerHTML = ''; return; }
  const D = await import('../js/dress.js');
  const entries = (await dayEntries(date)).filter((e) => e.cls === 'fam');
  const label = date === today ? 'today' : new Date(`${date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
  if (!el.innerHTML) el.innerHTML = `<section class="card dress-card"><div class="eyebrow">👔 Dress for ${esc(label)}</div><p class="small muted">Getting the weather…</p></section>`;
  const picks = dressPicks();
  const temps = (t) => `<div class="dress-temps"><span>🌅 ${D.hourLabel(t.leave.hour)} <b>${t.leave.f}°</b></span><i>→</i><span>☀️ ${D.hourLabel(t.peak.hour)} <b>${t.peak.f}°</b></span><i>→</i><span>🌆 ${D.hourLabel(t.back.hour)} <b>${t.back.f}°</b></span></div>`;
  let body;
  try {
    // Where each of you will be; the same place for both of you is one box for both, dressed
    // for the longer day (the earlier start to the later finish).
    const places = [...D.PLACES, ...(await eventPlaces(D, entries).catch(() => []))];
    const wheres = people.map((m) => {
      const evs = entries.map((e) => ({ title: e.title, place: e.place, start: e.time, end: e.end, allDay: e.allDay || !e.time, who: e.who === 'both' || e.who === m.id ? m.id : '-' }));
      return { m, where: D.whereOn(evs, m.id, places, picks[`${m.id}|${date}`] || null) };
    });
    const groups = [];
    for (const w of wheres) {
      const g = groups.find((x) => x.place.id === w.where.place.id);
      if (g) g.list.push(w); else groups.push({ place: w.where.place, list: [w] });
    }
    const why = (where) => (where.picked ? 'picked by hand' : where.fromCalendar ? `📅 from “${esc(where.event.title)}”${where.placeFound ? '' : ` (no town in it — ${esc(where.place.name)} weather)`}` : 'nothing on the calendar — home');
    const parts = await Promise.all(groups.map(async (g) => {
      const leave = Math.min(...g.list.map((w) => w.where.leave)), back = Math.max(...g.list.map((w) => w.where.back));
      const plan = D.dressFor(await dressHours(g.place, date), leave, back);
      const ids = g.list.map((w) => w.m.id);
      const names = g.list.map((w) => `<i class="who-dot ${whoCls(w.m.id)}"></i> ${esc(w.m.name)}`).join(' &amp; ');
      const whys = [...new Set(g.list.map((w) => why(w.where)))];
      const reason = whys.length === 1 ? whys[0] : g.list.map((w) => `${esc(w.m.name)}: ${why(w.where)}`).join(' · ');
      const picked = g.list.some((w) => w.where.picked);
      return `<div class="dress-person${g.list.length > 1 ? ' together' : ''}">
        <div class="row between dress-who"><b>${names}${g.list.length > 1 ? ' <span class="pill">together</span>' : ''}</b>
          <select data-dresspick="${ids.join(',')}" data-dressdate="${date}" aria-label="Where ${g.list.map((w) => esc(w.m.name)).join(' and ')} will be">${places.map((p) => `<option value="${p.id}" ${p.id === g.place.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}${picked ? '<option value="">↺ Use the calendar</option>' : ''}</select></div>
        <small class="muted">${reason} · out ${D.hourLabel(leave)}–${D.hourLabel(back)}</small>
        ${plan ? `${temps(plan.temps)}<div class="dress-shape">${esc(plan.label)}</div>
          <ul class="dress-layers">${plan.layers.map((l) => `<li><span>${l.icon}</span><span>${esc(l.text)}${l.carry ? ' <em class="dress-carry">take off later</em>' : ''}</span></li>`).join('')}</ul>
          ${plan.when ? `<p class="small dress-when">⏱ ${esc(plan.when)}</p>` : ''}${plan.extras.length ? `<p class="small muted">${plan.extras.map(esc).join(' · ')}</p>` : ''}`
        : '<p class="small muted">No forecast for this day yet.</p>'}</div>`;
    }));
    body = parts.join('');
  } catch (err) { body = `<p class="small tone-warn">Couldn't get the weather (${esc(err.message)}).</p>`; }
  if ($('#calDress') && calm.day === date) $('#calDress').innerHTML = `<section class="card dress-card"><div class="eyebrow">👔 Dress for ${esc(label)}</div>${body}<p class="tiny muted">Feels-like temperatures from when you leave to when you're home (from the calendar, else 8 AM–6 PM). An event whose title or place names San Francisco or Oakland puts that person there. Weather: Open-Meteo.</p></section>`;
}
// 💞 2-2-2-2 moments: kept in each person's own trackers ({entries, removed}, end-to-end
// encrypted), combined with your partner's when they share their trackers with you.
async function loadRhythm() {
  const R = await import('../js/rhythm.js');
  const partner = us.partner;
  const [mine, theirs] = await Promise.all([myTrackers(), partner ? api.get(`/families/${state.fid}/members/${partner.id}/data`).then(openData).catch(() => null) : null]);
  calm.R = R;
  calm.myRatings = mine?.taste?.ratings || [];
  calm.ratings = [...calm.myRatings, ...(theirs && !theirs.locked ? theirs.taste?.ratings || [] : [])];
  tasteCache = null;
  return R.mergeRhythm([{ person: fam().me, rhythm: mine?.rhythm || {} }, ...(partner && theirs && !theirs.locked ? [{ person: partner.id, rhythm: theirs.rhythm || {} }] : [])]);
}
async function rhythmLine() {
  const el = $('#calRhythm');
  if (!el) return;
  const entries = await loadRhythm().catch(() => []);
  const R = calm.R;
  const had = JSON.stringify(calm.rhythm || []);
  calm.rhythm = entries;
  // New ❤️ moments: draw the month again (this runs again from there, finds nothing new, and stops).
  if (had !== JSON.stringify(calm.rhythm) && state.view === 'calendar') setTimeout(() => renderCal());
  if (!$('#calRhythm') || !R) return;
  const st = R.rhythmStatus(entries, isoLocal());
  const n = R.nextNudge(st);
  $('#calRhythm').innerHTML = `<section class="card small rhythm-line"><div class="row between"><span>💞 <b>2-2-2-2</b> · ${['date', 'overnight', 'getaway'].map((k) => `${R.RHYTHMS[k].icon} ${!st[k].last ? '–' : st[k].level === 'due' ? '<b class="tone-warn">due</b>' : st[k].level === 'soon' ? `in ${Math.max(0, st[k].daysLeft)}d` : '✓'}`).join(' · ')}</span><button type="button" class="linkish small" data-act="lognew">❤️ Log</button></div>${n ? `<div class="muted">${esc(R.loveLine(n.kind, isoLocal()))}</div>` : ''}</section>`;
}
// Log or edit a moment. A date gets what and where; the others are just the day.
async function momentSheet({ id = null, date = calm.day && calm.day <= isoLocal() ? calm.day : isoLocal() } = {}) {
  if (lockedHere()) return toast('🔒 This device needs the family key first — Me › 🔐 Encryption');
  const R = calm.R || (calm.R = await import('../js/rhythm.js'));
  const e = id ? (calm.rhythm || []).find((x) => x.id === id) : null;
  const v = e ? { kind: e.kind, date: e.date, what: e.what || R.DATE_TYPES[e.type]?.label || '', place: e.place || '' } : { kind: 'date', date, what: '', place: '' };
  const past = (k) => [...new Set((calm.rhythm || []).filter((x) => x.kind === 'date' && x[k]).reverse().map((x) => x[k]))].slice(0, 15);
  openSheet(`<h2>${e ? '✎ Edit' : '❤️ Log'} ${v.kind === 'date' ? 'a date' : 'a moment'}</h2>
    <form id="momentForm" class="stack" data-id="${e?.id || ''}">
      <div class="seg kinds4">${Object.entries(R.RHYTHMS).map(([k, r]) => `<label class="segopt"><input type="radio" name="kind" value="${k}" ${v.kind === k ? 'checked' : ''}><span>${r.icon} ${({ date: 'Date', close: 'Us time', overnight: 'Overnight trip', getaway: 'Getaway' })[k] || esc(r.label)}</span></label>`).join('')}</div>
      <div class="datebits" ${v.kind === 'date' ? '' : 'hidden'}>
        <label>What did you do?<input name="what" list="mWhats" maxlength="60" placeholder="e.g. Movie, drinks & dinner" value="${esc(v.what)}"></label>
        <label>Where?<input name="place" list="mPlaces" maxlength="60" placeholder="e.g. Santana Row" value="${esc(v.place)}"></label>
        <datalist id="mWhats">${past('what').map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist><datalist id="mPlaces">${past('place').map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>
      </div>
      <label>When<input type="date" name="date" value="${v.date}" max="${isoLocal()}" required></label>
      <p class="tiny muted">Just for the two of you — it shows as a ❤️ on the calendar and counts toward your 2-2-2-2. End-to-end encrypted.</p>
      <div class="row end">${e ? '<button type="button" class="ghost danger" data-act="momentdel">Delete</button>' : ''}<button type="button" class="ghost" data-act="close">Cancel</button><button>Save ❤️</button></div>
    </form>`);
}
// Your own trackers' rhythm, changed and saved back (sealed). An edit or delete of your
// partner's moment is recorded as "removed" in yours — the two copies combine that way.
async function saveRhythm(change, changeData = null) {
  mineCache = null;
  const mine = await myTrackers();
  if (mine?.locked) throw new Error('This device needs the family key first');
  const data = { ...(mine || {}) };
  const r = { entries: [...(data.rhythm?.entries || [])], removed: [...(data.rhythm?.removed || [])] };
  change(r);
  data.rhythm = { entries: r.entries.slice(-400), removed: [...new Set(r.removed)].slice(-400) };
  if (changeData) changeData(data);
  await api.put(`/families/${state.fid}/members/${fam().me}/data`, { data: await sealData(data) });
  mineCache = null;
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

// ---------- 🍿 what we watch: shows and movies, nights together, progress, the year ----------
// Titles and services are end-to-end encrypted; the merging and the recap are the trackers' own
// (js/showsCore.js), run over everyone in the family.
const watch = { data: null, shows: [], tab: 'now', S: null, adding: { kind: 'show', service: 'netflix' } };
async function loadWatch() {
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
// 📺 Episode dates for the shows you're watching (or have up next), from TMDB through the
// connector. Which TMDB show each one is, and the dates, are kept on this phone.
const tvMapKey = () => `fam.tmdbMap.${state.fid}`;
const tvMap = () => { try { return JSON.parse(LS.get(tvMapKey()) || '{}'); } catch { return {}; } };
async function tvInfo(id) {
  let c = null; try { c = JSON.parse(LS.get(`fam.tv.${id}`) || 'null'); } catch { /* none */ }
  if (c && Date.now() - c.at < 6 * 3600e3) return c.show;
  const r = await api.get(`/tv/${id}`).catch(() => null);
  if (r?.show) { try { LS.set(`fam.tv.${id}`, JSON.stringify({ at: Date.now(), show: r.show })); } catch { /* full */ } return r.show; }
  return c?.show || null;
}
async function loadTv() {
  watch.tvm ||= await import('../server/tv.js');
  const { episodeStatus } = watch.tvm;
  const map = tvMap();
  const list = watch.shows.filter((x) => x.kind !== 'movie' && !x.locked && ['watching', 'upnext'].includes(x.status)).slice(0, 15);
  await Promise.all(list.map(async (x) => {
    if (map[x.id] === undefined) {
      const r = await api.get(`/tv/search?q=${encodeURIComponent(x.title)}`).catch(() => null);
      if (!r) return;
      map[x.id] = r.results[0]?.id || 0;
    }
    if (!map[x.id]) return;
    x.tv = await tvInfo(map[x.id]);
    x.ep = episodeStatus(x.tv, x.progress, isoLocal());
  }));
  try { LS.set(tvMapKey(), JSON.stringify(map)); } catch { /* full */ }
  watch.tvAt = Date.now();
}
const shortDay = (d) => new Date(`${d}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
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
async function tvFixSheet(id) {
  const x = watch.shows.find((y) => y.id === id);
  if (!x) return;
  const r = await api.get(`/tv/search?q=${encodeURIComponent(x.title)}`);
  openSheet(`<h2>Which show is “${esc(x.title)}”?</h2><p class="small muted">For new-episode dates (from TMDB).</p>
    ${r.results.map((s) => `<button type="button" class="fpick" data-tvpick="${id}:${s.id}"><span class="fp-i">${s.poster ? `<img src="${esc(s.poster)}" alt="">` : '📺'}</span><span class="grow"><b>${esc(s.name)}</b><small class="muted">${esc(s.year || '')}</small></span>${tvMap()[id] === s.id ? '✓' : ''}</button>`).join('') || '<p class="small muted">No match on TMDB.</p>'}
    <button type="button" class="linkish small" data-tvpick="${id}:0">It isn't on TMDB — stop looking</button>`);
}
// ---------- 📰 the news: Politics, Tech, Bay Area on Moments; rescue news on Dogs (shared, twice a day) ----------
const nw = { data: null, tab: null };
const newsSet = () => { try { return { off: false, topics: ['politics', 'tech', 'bay'], ...JSON.parse(LS.get('fam.newsSet') || '{}') }; } catch { return { off: false, topics: ['politics', 'tech', 'bay'] }; } };
async function loadNews() {
  let c = null; try { c = JSON.parse(LS.get('fam.news') || 'null'); } catch { /* none */ }
  if (c && Date.now() - c.got < 30 * 60e3) return (nw.data = c.data);
  const r = await api.get('/news').catch(() => null);
  if (r?.news) { nw.data = r.news; try { LS.set('fam.news', JSON.stringify({ got: Date.now(), data: r.news })); } catch { /* full */ } }
  return nw.data || c?.data || null;
}
const newsRow = (x) => `<a class="newsrow" href="${esc(x.url)}" target="_blank" rel="noopener"><b>${esc(x.title)}</b>${x.line ? `<small>${esc(x.line)}</small>` : ''}<small class="muted">${esc(x.src)} · ${ago(x.at)}</small></a>`;
async function renderNews() {
  const el = $('#newsCard'), st = newsSet();
  if (!el || st.off) return;
  const n = await loadNews();
  if (!$('#newsCard') || !n) return;
  const tabs = st.topics.filter((t) => n.topics?.[t]?.length);
  if (!tabs.length) return;
  if (!tabs.includes(nw.tab)) nw.tab = tabs[0];
  const list = n.topics[nw.tab];
  el.hidden = false;
  el.innerHTML = `<div class="row between"><b>📰 News</b><button type="button" class="icon-btn" data-act="newsset" aria-label="News settings">⋯</button></div>
    <div class="rchips">${tabs.map((t) => `<button type="button" class="chip ${nw.tab === t ? 'on' : ''}" data-newstab="${t}">${esc(n.labels?.[t] || t)}</button>`).join('')}</div>
    ${list.slice(0, 3).map(newsRow).join('')}
    <div class="row between"><button type="button" class="linkish small" data-act="newsall">All ${esc(n.labels?.[nw.tab] || '')} ›</button><span class="tiny muted">Updated ${ago(n.at)}</span></div>`;
}
function newsAllSheet() {
  const n = nw.data;
  if (!n) return;
  openSheet(`<div class="row between"><h2>📰 ${esc(n.labels?.[nw.tab] || 'News')}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <div class="stack">${(n.topics[nw.tab] || []).map(newsRow).join('')}</div>
    <p class="tiny muted">Headlines from each outlet's public feed, picked and summed up in a line by AI twice a day. Tap one to read it there.</p>`);
}
function newsSetSheet() {
  const st = newsSet(), labels = nw.data?.labels || { politics: 'Politics', tech: 'Tech', bay: 'Bay Area' };
  openSheet(`<div class="row between"><h2>📰 News</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <p class="small muted">Just for you, on this phone.</p>
    <div class="card stack">${Object.entries(labels).map(([k, l]) => `<label class="switch-row"><span>${esc(l)}</span><input type="checkbox" data-newstopic="${k}" ${st.topics.includes(k) ? 'checked' : ''}><i class="switch"></i></label>`).join('')}
    <label class="switch-row"><span>Show the news on Moments</span><input type="checkbox" data-newstopic="on" ${st.off ? '' : 'checked'}><i class="switch"></i></label></div>`);
}
async function renderRescue() {
  const el = $('#rescue');
  if (!el) return;
  const r = (await loadNews())?.rescue;
  if (!$('#rescue')) return;
  if (!r || !(r.dogs.length || r.events.length)) { el.innerHTML = `<div class="row between"><b class="small">🐶 Rescue news</b><span class="tiny muted">${r ? 'nothing new today' : 'coming soon'}</span></div><a class="small" href="../#adopt">🐾 Adoption board ›</a>`; return; }
  el.innerHTML = `<div class="row between"><b>🐶 ${esc(r.name)}</b>${r.site ? `<a class="small" href="${esc(r.site)}" target="_blank" rel="noopener">Their site ›</a>` : ''}</div>
    ${r.events.length ? `<div class="stack tight">${r.events.map((e) => `<div class="small">📅 <b>${esc(shortDay(e.day))}</b> · ${e.url ? `<a href="${esc(e.url)}" target="_blank" rel="noopener">${esc(e.title)}</a>` : esc(e.title)}${e.where ? ` <span class="muted">· ${esc(e.where)}</span>` : ''}</div>`).join('')}</div>` : ''}
    ${r.dogs.length ? `<p class="tiny muted">Looking for a home</p><div class="rescuedogs">${r.dogs.map((d) => `<${d.url ? `a href="${esc(d.url)}" target="_blank" rel="noopener"` : 'div'} class="rescuedog"><b>🐕 ${esc(d.name)}</b><small class="muted">${esc(d.about)}</small></${d.url ? 'a' : 'div'}>`).join('')}</div>` : ''}
    <div class="row between"><a class="small" href="../#adopt">🐾 Adoption board ›</a><span class="tiny muted">Looked up ${ago(r.at)} · check with the rescue</span></div>`;
}

// ---------- 🎬 movies: in theaters, coming soon, streaming, and alerts (opt-in, per person) ----------
const mv = { prefs: null, lists: null, tab: 'now' };
async function moviePrefs() { mv.prefs ||= await api.get('/account/movies').then((r) => r.movies).catch(() => ({ on: false, list: [] })); return mv.prefs; }
async function movieLists() {
  let c = null; try { c = JSON.parse(LS.get('fam.movies') || 'null'); } catch { /* none */ }
  if (c && Date.now() - c.at < 6 * 3600e3) return (mv.lists = c.data);
  const r = await api.get('/movies').catch(() => null);
  if (r) { mv.lists = r; try { LS.set('fam.movies', JSON.stringify({ at: Date.now(), data: r })); } catch { /* full */ } }
  return mv.lists || c?.data || null;
}
const alerting = (id) => (mv.prefs?.list || []).some((x) => x.id === id);
async function renderMovies() {
  const el = $('#moviesCard');
  if (!el || !(await moviePrefs()).on) return;
  const l = await movieLists();
  if (!$('#moviesCard') || !l) return;
  const list = (mv.tab === 'now' ? l.now : l.soon) || [];
  el.hidden = false;
  el.innerHTML = `<div class="row between"><b>🎬 Movies</b><span class="rchips">${[['now', 'In theaters'], ['soon', 'Coming soon']].map(([k, t]) => `<button type="button" class="chip ${mv.tab === k ? 'on' : ''}" data-movietab="${k}">${t}</button>`).join('')}</span></div>
    ${list.slice(0, 4).map((m) => `<button type="button" class="fpick mrow" data-movie="${m.id}"><span class="fp-i">${m.img ? `<img src="${esc(m.img)}" alt="" loading="lazy">` : '🎬'}</span><span class="grow"><b>${esc(m.title)}</b>${m.pick ? ' <span class="tag pk">Critics\' pick</span>' : ''}${alerting(m.id) ? ' 🔔' : ''}
      <small class="muted">${mv.tab === 'now' ? [scoreLine(m), esc(m.why || '')].filter(Boolean).join(' · ') : `${esc(shortDay(m.released))}${m.why ? ` · ${esc(m.why.slice(0, 70))}…` : ''}`}</small></span></button>`).join('') || '<p class="small muted">Nothing here right now.</p>'}
    ${list.length > 4 ? `<button type="button" class="linkish small" data-movieall="${mv.tab}">All ${list.length} ›</button>` : ''}`;
}
function movieAllSheet(tab) {
  const list = (tab === 'now' ? mv.lists?.now : mv.lists?.soon) || [];
  openSheet(`<div class="row between"><h2>🎬 ${tab === 'now' ? 'In theaters' : 'Coming soon'}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    ${list.map((m) => `<button type="button" class="fpick mrow" data-movie="${m.id}"><span class="fp-i">${m.img ? `<img src="${esc(m.img)}" alt="" loading="lazy">` : '🎬'}</span><span class="grow"><b>${esc(m.title)}</b>${m.pick ? ' <span class="tag pk">Critics\' pick</span>' : ''}${alerting(m.id) ? ' 🔔' : ''}<small class="muted">${tab === 'now' ? scoreLine(m) || esc(m.why || '') : esc(shortDay(m.released))}</small></span></button>`).join('')}`);
}
async function movieSheet(id) {
  openSheet('<h2>🎬</h2><div class="skeleton line"></div>');
  const r = await api.get(`/movies/${id}`);
  const d = r.movie, fromList = [...(mv.lists?.now || []), ...(mv.lists?.soon || [])].find((x) => x.id === +id) || {};
  const out = d.theaters && d.theaters <= isoLocal();
  openSheet(`<div class="row between"><h2>🎬 ${esc(d.title)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <div class="moviehead">${d.img ? `<img src="${esc(d.img)}" alt="">` : ''}<div class="stack tight small">
      ${fromList.scores ? `<b>${scoreLine(fromList)}</b>${fromList.pick ? ' <span class="tag pk">Critics\' pick</span>' : ''}` : ''}
      <span class="muted">${esc([d.genres.join(', '), d.runtime ? `${d.runtime} min` : ''].filter(Boolean).join(' · '))}</span>
      <span>🎟 Theaters: <b>${d.theaters ? esc(out ? `since ${shortDay(d.theaters)}` : shortDay(d.theaters)) : 'no date yet'}</b></span>
      <span>🏠 At home: <b>${d.stream.length ? esc(d.stream.join(', ')) : d.digital ? `from ${esc(shortDay(d.digital))}` : 'not yet'}</b>${!d.stream.length && d.rent.length ? ` <span class="muted">(rent: ${esc(d.rent.slice(0, 2).join(', '))})</span>` : ''}</span></div></div>
    ${d.overview ? `<p class="small">${esc(d.overview)}</p>` : ''}
    <div class="row wrap">${alerting(d.id) ? `<button type="button" class="ghost small" data-moviealert="${d.id}:off">🔔 Alert set · remove</button>` : `<button type="button" class="small" data-moviealert="${d.id}:on" data-movietitle="${esc(d.title)}" data-movieout="${out ? 1 : ''}">🔔 Alert me ${out ? 'when it streams' : 'when it\'s out'}</button>`}
      ${partnerMember() ? `<button type="button" class="ghost small" data-moviesuggest="${d.id}">✨ Suggest to ${esc(partnerName())}</button>` : ''}
      ${out ? `<a class="btn ghost small" href="https://www.fandango.com/search?q=${encodeURIComponent(d.title)}" target="_blank" rel="noopener">🎟 Showtimes</a>` : ''}</div>
    <p class="tiny muted">Movie data from TMDB; where to watch from JustWatch. Scores: Rotten Tomatoes and IMDb via OMDb.</p>`);
}
async function watchView() {
  $('#view').innerHTML = `${demoBanner()}<div class="skeleton card"></div>`;
  importWatch().catch(() => {});
  await act(loadWatch);
  if (state.view !== 'watch') return;
  renderWatch();
  loadTv().then(() => { if (state.view === 'watch') renderWatch(); }).catch(() => {});
}
const svcBadge = (k) => { const v = watch.S.SERVICES[k] || watch.S.SERVICES.other; return `<span class="svc" style="background:${v.bg};color:${v.fg}">${esc(v.name)}</span>`; };
const monthLabel = (ym, month = 'long') => new Date(`${ym}-15T12:00:00`).toLocaleDateString(undefined, { month, year: 'numeric' });
function watchCard(x, opts = {}) {
  const S = watch.S, my = fam().me, today = isoLocal();
  const tonight = x.nights.find((n) => n.date === today);
  const mine = x.ratings[my] || 0;
  const theirs = Object.entries(x.ratings).filter(([p]) => p !== my);
  const pg = x.progress;
  const nights = x.kind === 'movie' ? `🍿 Movie${x.statusDate ? ` · ${new Date(`${x.statusDate}T12:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}` : ''}`
    : `${x.nights.length} night${x.nights.length === 1 ? '' : 's'} together${opts.monthNights != null ? ` · ${opts.monthNights} this month` : ''}`;
  return `<div class="show-card ${x.status}" data-watchshow="${x.id}">
    <div class="show-top">${svcBadge(x.service)}<span class="show-status">${S.STATUS[x.status] || ''}</span></div>
    <div class="show-title">${esc(x.title)}</div>${epLine(x)}
    <div class="small muted">${nights}${x.rating ? ` · ${x.rating}★ avg` : ''}</div>
    ${x.kind !== 'movie' && x.status === 'watching' ? `<div class="row wrap progress-row"><span class="pill">${pg ? `S${pg.s || 1} · E${pg.e}` : 'Not started'}</span><button type="button" class="ghost small" data-watchep="${x.id}">＋ Episode</button><button type="button" class="linkish small" data-watchpg="${x.id}">Set…</button></div>
      <button type="button" class="${tonight ? 'tonight on' : 'tonight'}" data-watchnight="${x.id}">${tonight ? `✓ Watched tonight${tonight.by === my ? '' : ` (${esc(member(tonight.by)?.name || '')})`}` : '📺 We watched tonight'}</button>` : ''}
    <div class="show-rate"><span class="small muted">You</span>${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="star ${n <= mine ? 'on' : ''}" data-watchrate="${x.id}:${n}" aria-label="Rate ${n} of 5">★</button>`).join('')}
      ${theirs.map(([p, r]) => `<span class="small muted">· ${esc(member(p)?.name || '')} <span class="stars">${'★'.repeat(r)}${'☆'.repeat(5 - r)}</span></span>`).join('')}</div>
    <div class="show-actions">
      ${x.kind !== 'movie' ? Object.entries(S.STATUS).filter(([k]) => k !== x.status).map(([k, label]) => `<button type="button" class="linkish small" data-watchstatus="${x.id}:${k}">${label}</button>`).join('') : ''}
      ${x.locked ? '' : `<button type="button" class="linkish small" data-watchbingo="${x.id}">🎲 Bingo</button>`}
      <button type="button" class="linkish small muted" data-watchaud="${x.id}:${x.aud === 'family' ? 'us' : 'family'}">${x.aud === 'family' ? '👨‍👩‍👧 family · make it just us' : '🔒 just us · share with family'}</button>
      ${x.by === fam().me || me().role === 'owner' ? `<button type="button" class="linkish small muted" data-watchdel="${x.id}">Delete</button>` : ''}
    </div>
  </div>`;
}
function renderWatch() {
  const S = watch.S, shows = watch.shows, ym = isoLocal().slice(0, 7), year = ym.slice(0, 4);
  const tabs = [['now', 'Now'], ['month', 'By month'], ['year', `${year} recap`]];
  let body = '';
  if (watch.tab === 'now') {
    const on = shows.filter((x) => x.status === 'watching').sort((a, b) => (b.ep?.newCount || 0) - (a.ep?.newCount || 0));
    const next = shows.filter((x) => x.status === 'upnext');
    const also = S.monthShows(shows, ym).filter((x) => x.status !== 'watching' && x.status !== 'upnext');
    body = `${on.length ? on.map((x) => watchCard(x)).join('') : '<p class="small muted">Nothing on the go. Add what you\'re watching together.</p>'}
      ${next.length ? `<h3>🕐 Up next</h3>${next.map((x) => watchCard(x)).join('')}` : ''}
      ${also.length ? `<details class="us-more"><summary>Also in ${monthLabel(ym).split(' ')[0]} · ${also.length}</summary>${also.map((x) => watchCard(x, { monthNights: x.monthNights })).join('')}</details>` : ''}
      <button type="button" class="ghost wide" data-act="watchadd">＋ Add a show or movie</button>`;
  } else if (watch.tab === 'month') {
    const months = [...new Set(shows.flatMap(S.showMonths))].sort().reverse();
    body = months.length ? months.map((mo) => {
      const list = S.monthShows(shows, mo), n = list.reduce((a, x) => a + x.monthNights, 0);
      return `<details class="card month-shows" ${mo === ym ? 'open' : ''}><summary><b>${monthLabel(mo)}</b> <span class="small muted">${list.length} title${list.length === 1 ? '' : 's'} · ${n} night${n === 1 ? '' : 's'}</span></summary>
        <ul class="list month-list">${list.map((x) => `<li class="row between">${svcBadge(x.service)}<span class="grow">${esc(x.title)}${x.status === 'finished' && (x.statusDate || '').startsWith(mo) ? ' 🎉' : ''}</span><span class="small muted">${x.kind === 'movie' ? '🍿' : `${x.monthNights}×`}${x.rating ? ` · ${x.rating}★` : ''}</span></li>`).join('')}</ul></details>`;
    }).join('') : '<p class="small muted">Nothing logged yet.</p>';
  } else {
    const r = S.yearRecap(shows, year);
    const rows = Object.entries(r.perService).sort((a, b) => b[1] - a[1]), max = rows[0]?.[1] || 1;
    body = r.titles ? `<section class="card recap">
        <div class="eyebrow">🍿 ${year} together</div>
        <div class="recap-stats"><div><b>${r.nights}</b><small>nights</small></div><div><b>${r.shows}</b><small>shows</small></div><div><b>${r.movies}</b><small>movies</small></div><div><b>${r.finished}</b><small>finished</small></div></div>
        ${r.mostWatched ? `<p>🏆 Most watched: <b>${esc(r.mostWatched.title)}</b> (${r.mostWatched.nights.filter((n) => n.date.startsWith(year)).length} nights)</p>` : ''}
        ${r.topRated ? `<p>⭐ Our favourite: <b>${esc(r.topRated.title)}</b> (${r.topRated.rating}★)</p>` : ''}
        ${r.topService ? `<p>Most of it on ${svcBadge(r.topService)}</p>` : ''}
        <div class="svc-bars">${rows.map(([k, n]) => { const v = S.SERVICES[k] || S.SERVICES.other; return `<div class="svc-bar"><span class="small">${esc(v.name)}</span><span class="track"><span style="width:${Math.round((n / max) * 100)}%;background:${v.bg}"></span></span><span class="small muted">${n}</span></div>`; }).join('')}</div></section>
      <h3>Month by month</h3>
      <ul class="card list year-months">${r.months.map((mo) => `<li><b>${monthLabel(mo.month, 'short').split(' ')[0]}</b> <span>${mo.shows.map((x) => esc(x.title)).join(', ')}</span></li>`).join('')}</ul>`
      : '<p class="small muted">Nothing logged this year yet.</p>';
  }
  $('#view').innerHTML = `${demoBanner()}
    <section class="watch-head"><h2><button type="button" class="linkish" data-view="us" aria-label="Back to Us">‹</button> 🍿 Watching</h2><button type="button" class="ghost small" data-act="games">🎲 Bingo &amp; 💑 picks ›</button></section>
    <div class="seg">${tabs.map(([k, l]) => `<button type="button" class="${watch.tab === k ? 'on' : ''}" data-watchtab="${k}">${l}</button>`).join('')}</div>
    ${body}`;
}
function watchAddSheet() {
  const S = watch.S, a = watch.adding;
  openSheet(`<h2>Add to Watch</h2>
    <form id="watchForm" class="stack">
      <div class="seg">${[['show', '📺 Show'], ['movie', '🍿 Movie']].map(([k, l]) => `<label class="segopt"><input type="radio" name="kind" value="${k}" ${a.kind === k ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <label>Title<input name="title" maxlength="80" required placeholder="e.g. The Bear" autocomplete="off"></label>
      <fieldset class="svc-pick"><legend class="small">Where</legend>${Object.entries(S.SERVICES).map(([k, v]) => `<label class="svc-opt-l"><input type="radio" name="service" value="${k}" ${a.service === k ? 'checked' : ''}><span class="svc-opt" style="--svc:${v.bg}">${esc(v.name)}</span></label>`).join('')}</fieldset>
      <label class="small">Started / watched on<input type="date" name="date" value="${isoLocal()}"></label>
      <label class="check"><input type="checkbox" name="family"><span>👨‍👩‍👧 Share with the family (otherwise it's just you two)</span></label>
      <div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Add</button></div>
    </form>`);
}
const watchSaved = async () => { await loadWatch(); if (state.view === 'watch') renderWatch(); };
// Bingo for this show: its live game, or a new game from its card set, or a new card set.
async function watchBingo(title) {
  const r = await api.get(`/families/${state.fid}/bingo`);
  const same = (t) => t.trim().toLowerCase() === title.trim().toLowerCase();
  const live = r.games.find((g) => g.status === 'live' && same(g.title));
  if (live) { bingo.game = live.id; state.view = 'bingo'; return show('bingo'); }
  const pack = r.packs.find((p) => same(p.title));
  if (pack) { const g = await api.post(`/families/${state.fid}/bingo/games`, { packId: pack.id }); bingo.game = g.game.id; return show('bingo'); }
  return bingoNew({ title });
}
// Bringing over the trackers' 📺 Watching (once per family; each person their own).
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

// ✎ Edit chores: remove any chore (built-in or your own) from the buttons, bring one back, or
// add your own to the dogs or the house. What's already logged always keeps its points.
function choresSheet() {
  const mods = fam().modules || [];
  const SECT = { ...(mods.includes('dogs') ? { dogs: ['🐾 The dogs', DOG_KINDS] } : {}), ...(mods.includes('chores') ? { house: ['🏠 The house', HOUSE_KINDS] } : {}) };
  const row = (k, on) => { const [ico, label] = careMeta(k); return `<li class="row between"><span>${esc(ico)} <b>${esc(label)}</b> <small class="muted">${ptsOf(k) ? `+${ptsOf(k)}` : '♡'}</small></span>${on ? `<button type="button" class="linkish small danger" data-act="chorehide" data-chorekind="${k}">Remove</button>` : `<button type="button" class="linkish small" data-act="choreshow" data-chorekind="${k}">＋ Bring back</button>`}</li>`; };
  openSheet(`<h2>✎ Edit chores</h2>
    ${Object.entries(SECT).map(([sec, [title, base]]) => {
      const off = base.filter((k) => hiddenChores().includes(k));
      return `<h3>${title}</h3><ul class="list">${kindsIn(sec, base).map((k) => row(k, true)).join('')}</ul>${off.length ? `<details class="small"><summary class="muted">Removed (${off.length})</summary><ul class="list">${off.map((k) => row(k, false)).join('')}</ul></details>` : ''}`;
    }).join('')}
    <h3>＋ Add a chore</h3>
    <form id="choreForm" class="stack">
      <div class="row"><label style="flex:0 0 74px">Emoji<input name="icon" maxlength="4" value="✅" autocomplete="off"></label><label class="grow">Chore<input name="label" maxlength="24" required placeholder="e.g. Water the plants"></label></div>
      <div class="seg">${Object.entries(SECT).map(([k, [l]], i) => `<label class="segopt"><input type="radio" name="section" value="${k}" ${(k === 'house' || Object.keys(SECT).length === 1) && i >= 0 ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>
      <label>Points <select name="pts">${[0, 1, 2, 3, 4, 5].map((n) => `<option value="${n}" ${n === 2 ? 'selected' : ''}>${n ? `+${n}` : '♡ just for love'}</option>`).join('')}</select></label>
      <p class="tiny muted">Points by effort: dishes +1, walks +2, cooking dinner +3, cleaning +4. Removing a chore keeps what's already logged.</p>
      <div class="row end"><button type="button" class="ghost" data-act="close">Done</button><button>＋ Add</button></div>
    </form>`);
}
async function saveChores(list, hidden = hiddenChores()) {
  const r = await api.put(`/families/${state.fid}/chores/custom`, { chores: list.map(({ gone, ...c }) => c), hidden });
  state.family.chores = r.chores;
  state.family.hiddenChores = r.hidden || [];
}

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
      const r = await api.post(`/families/${state.fid}/care`, { kind: d.care, date: isoLocal(), by: careWho });
      renderCare(); renderRace();
      if (r.golden) { state.feed = [r.golden, ...state.feed]; setTimeout(() => toast(`⭐ Golden day! ${r.golden.byName} left you a note on the feed`), 1600); }
    });
  }
  if (d.carewho) {
    careWho = d.carewho;
    // Switched to Both after logging some things yourself? Offer to count those for both too.
    const solo = careToday.filter((x) => x.by.length === 1 && x.by[0] === fam().me);
    if (careWho === 'both' && solo.length && confirm(`Also log your ${solo.length} earlier ${solo.length === 1 ? 'entry' : 'entries'} today for both of you?`)) {
      return act(async () => { for (const x of solo) await api.patch(`/families/${state.fid}/care/${isoLocal()}/${x.id}`, { who: 'both' }); renderCare(); renderRace(); toast(`👫 ${solo.length} logged for both of you`); });
    }
    return renderCare();
  }
  if (d.careset) return act(async () => {
    const r = await api.patch(`/families/${state.fid}/care/${isoLocal()}/${d.careset}`, { who: d.who });
    renderCare(); renderRace(); toast(`Logged for ${r.entry.byName}`);
  });
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
  if (d.jobopen) { const j = jobList().find((x) => x.id === d.jobopen); if (!j) return; if (j.status === 'running') return jobWait(j.id, j.label); return openJob(j); }
  if (d.jobx) { const j = jobList().find((x) => x.id === d.jobx); if (j) { j.seen = true; j.dismissed = true; saveJobs(); } return renderPill(); }
  if (d.jobretry) { const j = jobList().find((x) => x.id === d.jobretry); if (!j) return; jobs.list = jobList().filter((x) => x.id !== j.id); saveJobs(); if (j.kind !== 'find') jobWait(j.id, j.label); return runJob(j.kind, j.body, j.label, j.ctx); }
  if (d.jobsuggest != null) { const x = feel.picks[+d.jobsuggest]; return x && feelSheet('dinner', { idea: { ...x, kind: 'food', title: x.name } }); }
  if (d.rate) { const p = us.plans.find((x) => x.id === d.rate); if (!p) return; return act(async () => { ideas.I ||= await import('./ideas.js'); rateSheet(p); }); }
  if (d.rateskip) return act(() => skipRating(d.rateskip));
  if (d.tonight) { const t = tonightPick(); return t && feelSheet(t.kind, { idea: t.idea, show: t.show }); }
  if (d.ideasuggest) { const x = ideaById(d.ideasuggest); if (!x) return; const kind = x.kind === 'movie' ? 'movie' : x.kind === 'food' ? 'dinner' : 'other'; const show = x.theatres?.flatMap((th) => th.times.map((t) => ({ ...t, where: th.name }))).find((t) => t.day >= isoLocal()); return feelSheet(kind, { idea: x, show }); }
  if (d.feelshow) { const [i, j] = d.feelshow.split(':').map(Number); const x = feel.picks[i]; return x && feelFill(x, x.shows[j]); }
  if (d.feelpick != null) { const x = feel.picks[+d.feelpick]; return x && feelFill(x); }
  if (d.feelcuisine != null) { feel.cuisine = d.feelcuisine; return renderFeelPicks(); }
  if (d.feelfind) return act(feelFind);
  if (d.nu) { const [w, i] = d.nu.split(':'); return act(() => nuAct(w, +i)); }
  if (d.newstab) { nw.tab = d.newstab; return renderNews(); }
  if (d.movietab) { mv.tab = d.movietab; return renderMovies(); }
  if (d.movieall) return movieAllSheet(d.movieall);
  if (d.movie) return act(() => movieSheet(d.movie));
  if (d.moviealert) {
    const [id, how] = d.moviealert.split(':');
    return act(async () => {
      mv.prefs = (how === 'on' ? await api.put(`/account/movies/alerts/${id}`, { title: t.dataset.movietitle || '', inTheaters: !!t.dataset.movieout }) : await api.del(`/account/movies/alerts/${id}`)).movies;
      toast(how === 'on' ? '🔔 We\'ll let you know' : 'Alert removed'); renderMovies(); movieSheet(id);
    });
  }
  if (d.moviesuggest) { const m = [...(mv.lists?.now || []), ...(mv.lists?.soon || [])].find((x) => x.id === +d.moviesuggest); return feelSheet('movie', { idea: { ...(m || {}), id: `mv${d.moviesuggest}`, kind: 'movie', title: m?.title || '' } }); }
  if (d.tvfix) return act(() => tvFixSheet(d.tvfix));
  if (d.tvpick) { const [id, tid] = d.tvpick.split(':'); const m = tvMap(); m[id] = +tid; LS.set(tvMapKey(), JSON.stringify(m)); closeSheet(); const x = watch.shows.find((y) => y.id === id); if (x) { delete x.tv; delete x.ep; } return act(async () => { await loadTv(); if (state.view === 'watch') renderWatch(); else if (state.view === 'us') renderUs(); }); }
  if (d.epseen) { const i = d.epseen.indexOf(':'); LS.set(`fam.epSeen.${d.epseen.slice(0, i)}`, d.epseen.slice(i + 1)); renderUs(); return usBadge(); }
  if (d.dogcal != null) { const x = dogCal.list[+d.dogcal]; if (!x) return; return apptSheet(null, { type: x.m.type, pets: x.m.pets.length ? x.m.pets : undefined, place: x.e.place || '', dropAt: `${x.e.date}T${x.e.allDay || !x.e.start ? '09:00' : x.e.start}`, notes: `From ${x.feed || 'a linked calendar'}: ${x.e.title}`, calKey: x.key }); }
  if (d.dogcalno != null) { const x = dogCal.list[+d.dogcalno]; if (!x) return; const mk = dogCalMarks(); mk[x.key] = 'no'; LS.set(dogCalKey(), JSON.stringify(mk)); return dogCalSuggestions(); }
  if (d.nudgeundo) return act(async () => { setNudges(await api.post(`/account/nudges/${d.nudgeundo}/undo?today=${isoLocal()}`)); renderYourDay(); });
  if (d.callnudge && d.callnudge !== 'done') return act(() => callNudgeAct(d.callnudge, t));
  if (d.famtab) { if (d.board) th.board = d.board; state.famTab = d.famtab; LS.set('fam.famTab', d.famtab); if (state.view !== 'feed') return show('feed'); return feedView(); }
  if (d.board) { th.board = d.board; return threadsView(); }
  if (d.thread) { const [f, id] = d.thread.split(':'); th.quote = null; return act(() => threadView(f, id)); }
  if (d.thback) { th.cur = null; th.quote = null; return show(state.view === 'us' ? 'us' : 'feed'); }
  if (d.thfollow) return act(async () => { const r = await api.post(`/families/${th.cur.fid}/threads/${th.cur.id}/follow`); th.cur.following = r.following; renderThread(); toast(r.following ? '🔔 You\'ll hear about new replies' : '🔕 No more replies from this one'); });
  if (d.thpin) return act(() => threadAct(() => api.patch(`/families/${th.cur.fid}/threads/${th.cur.id}`, { pinned: !th.cur.pinned })));
  if (d.thdel) { if (!confirm('Delete this thread and its replies?')) return; return act(async () => { await api.del(`/families/${th.cur.fid}/threads/${th.cur.id}`); th.loaded = 0; th.list = th.list.filter((x) => x.id !== th.cur.id); th.cur = null; toast('Deleted'); show('feed'); }); }
  if (d.thedit) return writeupSheet({ edit: th.cur });
  if (d.thup) return act(() => threadAct(() => api.post(`/families/${th.cur.fid}/threads/${th.cur.id}/up/${d.thup}`)));
  if (d.thbest) return act(() => threadAct(() => api.post(`/families/${th.cur.fid}/threads/${th.cur.id}/best`, { reply: d.thbest })));
  if (d.thvote != null) return act(() => threadAct(() => api.post(`/families/${th.cur.fid}/threads/${th.cur.id}/vote`, { i: +d.thvote })));
  if (d.thrdel) { if (!confirm('Delete your reply?')) return; return act(() => threadAct(() => api.del(`/families/${th.cur.fid}/threads/${th.cur.id}/replies/${d.thrdel}`))); }
  if (d.thquote) {
    if (d.thquote === 'x') th.quote = null;
    else if (d.thquote.startsWith('p:')) { const i = +d.thquote.slice(2); th.quote = { para: i, label: blockText(mdBlocks(th.cur.body)[i] || { text: '' }).slice(0, 120) }; }
    else { const r = th.cur.replies.find((x) => x.id === d.thquote.slice(2)); if (r) th.quote = { text: `${r.name}: ${r.text}`.slice(0, 280), label: `${r.name}: ${r.text}`.slice(0, 120) }; }
    const keep = $('#thReplyForm textarea')?.value || '';
    renderThread();
    const ta = $('#thReplyForm textarea'); ta.value = keep; ta.focus(); return;
  }
  if (d.tonightlater) { LS.set(`fam.tonight.${d.tonightlater}`, '1'); toast('🌙 Saved for tonight'); return renderUs(); }
  if (d.digestx) { LS.set('fam.digestSeen', d.digestx); $('#digest').innerHTML = ''; return; }
  if (d.wfmt) { const ta = $('#writeForm [name=body]'); const at = ta.value.lastIndexOf('\n', ta.selectionStart - 1) + 1; ta.value = ta.value.slice(0, at) + d.wfmt + ta.value.slice(at); ta.focus(); return saveDraft(); }
  if (d.outplace) return outingAsk(d.outplace);
  if (d.outfill) { const i = $('#outForm [name=text]'); i.value = d.outfill; return i.focus(); }
  if (d.outsaved != null) { outing.cur = savedOutings()[+d.outsaved]; outing.tab = 'plan'; outing.plan = null; return outing.cur && outingView(); }
  if (d.outtab) { outing.tab = d.outtab; outing.swapFor = d.outfor != null ? +d.outfor : null; return outingView(); }
  if (d.outswap) return outingSwap(d.outswap);
  if (d.outcuisine != null) return cuisineSheet(+d.outcuisine);
  if (d.outcpick) { const [i, c] = d.outcpick.split(':'); return act(() => cuisinePick(+i, c)); }
  if (d.outplan) { const p = us.plans.find((x) => x.id === d.outplan); if (!p?.outing) return; outing.cur = structuredClone(p.outing); outing.plan = p; outing.tab = 'plan'; return outingView(); }
  if (d.idea) { const i = d.idea.lastIndexOf(':'); return act(() => ideaAct(d.idea.slice(0, i), d.idea.slice(i + 1))); }
  if (d.ideatab) { ideas.tab = d.ideatab; ideas.i = 0; return ideasSheet(); }
  if (d.match) return matchSheet(d.match);
  if (d.matchskip) return act(async () => { await api.patch(`/families/${state.fid}/ideas/matches/${d.matchskip}`, { done: true }); await loadIdeas(); closeSheet(); renderUs(); usBadge(); });
  if (d.answer) { const [id, r] = d.answer.split(':'); if ($('#sheetBody .outbody')) closeSheet(); return act(async () => { const res = await api.post(`/families/${state.fid}/us/plans/${id}/reply`, { r }); const p = us.plans.find((x) => x.id === id); if (res.plan?.agreed && p) await planToCalendar({ ...p, agreed: true, replies: res.plan.replies }); await usChanged(); if (res.plan?.agreed) toast("🎉 It's a plan — it's on the calendar"); else if (r === 'in') toast('🙌 Sent'); }); }
  if (d.planlog) { const p = us.plans.find((x) => x.id === d.planlog); return p ? act(async () => { await saveRhythm((r) => { const at = Date.now(); r.entries.push({ id: at.toString(36) + Math.random().toString(36).slice(2, 5), kind: 'date', date: p.day, at, what: planTitle(p).replace(/^Date night: ?/, '') || 'Date night', ...(p.where ? { place: p.where } : {}) }); }); await api.patch(`/families/${state.fid}/us/plans/${p.id}`, { done: true }); calm.rhythm = await loadRhythm().catch(() => calm.rhythm); await usChanged(); toast('❤️ Logged — it counts for your 2-2-2-2'); }) : null; }
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
  if (d.photoid && t.classList.contains('ph')) return photoViewer(d.pfid, d.photoid);
  if (d.momentedit) return momentSheet({ id: d.momentedit });
  if (d.watchaud) { const [id, aud] = d.watchaud.split(':'); return act(async () => { await api.patch(`/families/${state.fid}/watch/shows/${id}`, { aud }); await watchSaved(); toast(aud === 'family' ? '👨‍👩‍👧 Shared with the family' : '🔒 Just you two now'); }); }
  if (d.watchtab) { watch.tab = d.watchtab; return renderWatch(); }
  if (d.watchnight) return act(async () => { await api.post(`/families/${state.fid}/watch/shows/${d.watchnight}/night`, { date: isoLocal() }); await watchSaved(); });
  if (d.watchrate) { const [id, n] = d.watchrate.split(':'); const cur = watch.shows.find((x) => x.id === id)?.ratings[fam().me]; return act(async () => { await api.patch(`/families/${state.fid}/watch/shows/${id}`, { rating: cur === +n ? null : +n }); await watchSaved(); }); }
  if (d.watchstatus) { const [id, st] = d.watchstatus.split(':'); return act(async () => { await api.patch(`/families/${state.fid}/watch/shows/${id}`, { status: st, date: isoLocal() }); await watchSaved(); if (st === 'finished') toast('🎉 Finished — it goes in the recap'); }); }
  if (d.watchep) { const pg = watch.shows.find((x) => x.id === d.watchep)?.progress; return act(async () => { await api.patch(`/families/${state.fid}/watch/shows/${d.watchep}`, { progress: { s: pg?.s || 1, e: (pg?.e || 0) + 1 } }); await watchSaved(); }); }
  if (d.watchpg) {
    const pg = watch.shows.find((x) => x.id === d.watchpg)?.progress;
    return openSheet(`<h2>Where are you up to?</h2><form id="watchPgForm" class="stack" data-id="${d.watchpg}"><div class="row"><label>Season<input name="s" type="number" min="1" max="99" value="${pg?.s || 1}"></label><label>Episode<input name="e" type="number" min="0" max="999" value="${pg?.e || 0}"></label></div><div class="row end"><button type="button" class="ghost" data-act="close">Cancel</button><button>Save</button></div></form>`);
  }
  if (d.watchbingo) { const x = watch.shows.find((y) => y.id === d.watchbingo); return x ? act(() => watchBingo(x.title)) : null; }
  if (d.watchdel) { if (!confirm('Delete this from Watch? Its nights and ratings go too.')) return; return act(async () => { await api.del(`/families/${state.fid}/watch/shows/${d.watchdel}`); await watchSaved(); }); }
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
    case 'outing': return outingAsk();
    case 'writeup': return writeupSheet();
    case 'newsall': return newsAllSheet();
    case 'newsset': return newsSetSheet();
    case 'nuplan': return nu.res ? nuPlan() : null;
    case 'nuknows': return act(nuKnows);
    case 'nureset': if (!confirm('Forget what Next up learned about you?')) return; LS.set(nuKey(), null); closeSheet(); toast('Forgotten'); return renderNextUp();
    case 'habits': return act(async () => { await loadNudges(); habitsSheet(); });
    case 'pollopt': { const w = $('#writeForm .wpoll'); if (w.querySelectorAll('[name=opt]').length >= 8) return; w.querySelector('[data-act=pollopt]').insertAdjacentHTML('beforebegin', `<input name="opt" maxlength="80" placeholder="Choice ${w.querySelectorAll('[name=opt]').length + 1}">`); return; }
    case 'tidy': {
      const ta = $('#writeForm [name=body]');
      if (ta.value.trim().length < 20) return toast('Write a little more first');
      const before = ta.value;
      t.disabled = true; t.textContent = '✨ Tidying…';
      return api.post(`/families/${state.fid}/tidy`, { text: before }).then((r) => { ta.value = r.text; saveDraft(); t.textContent = '↩︎ Undo tidy'; t.dataset.act = 'untidy'; t.dataset.before = before; })
        .catch((err) => { toast(err.message); t.textContent = '✨ Tidy it up'; }).finally(() => { t.disabled = false; });
    }
    case 'untidy': { const ta = $('#writeForm [name=body]'); ta.value = t.dataset.before || ta.value; saveDraft(); t.textContent = '✨ Tidy it up'; t.dataset.act = 'tidy'; return; }
    case 'outsave': return outingSave();
    case 'outsend': return act(outingSend);
    case 'ideaunpass': LS.set(passKey(), null); ideas.i = 0; return ideasSheet();
    case 'ideas': return act(async () => { if (!ideas.loaded) await loadIdeas(); ideas.i = 0; ideasSheet(); });
    case 'ideaset': return act(async () => { if (!ideas.loaded) await loadIdeas(); ideaSettingsSheet(); });
    case 'linkcheck': t.disabled = true; t.textContent = '🔗 Checking…'; return act(async () => {
      const r = await api.post('/admin/links');
      $('#linkReport').innerHTML = `<p class="small">${r.broken.length ? '⚠️' : '✅'} ${r.checked} of ${r.total} links opened · <b>${r.broken.length} broken</b>${r.shy.length ? ` · ${r.shy.length} sites turn away robots (fine in a browser)` : ''}</p>
        ${r.broken.length ? `<ul class="small">${r.broken.map((x) => `<li>${esc(x.title)} — ${esc(String(x.status || x.error))} <a href="${esc(x.url)}" target="_blank" rel="noopener">open</a></li>`).join('')}</ul>` : ''}`;
      t.disabled = false; t.textContent = '🔗 Check again';
    });
    case 'newsrun': t.disabled = true; t.textContent = 'Reading the news…'; return act(async () => { const r = await api.post('/admin/news/run'); LS.set('fam.news', null); toast(`📰 ${r.stories} stories${r.rescue ? ' · 🐶 rescue news' : ''}`); adminView(); });
    case 'scoutrun': t.disabled = true; t.textContent = 'Scouting… (a minute or two)'; return act(async () => { const r = await api.post('/admin/scout/run'); toast(`💡 ${r.areas?.map((a) => `${a.ideas ?? 0} ideas`).join(', ') || 'Done'}`); adminView(); });
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
    case 'games': bingo.game = null; bingo.season = null; return show('bingo');
    case 'watchadd': return watchAddSheet();
    case 'chores': return choresSheet();
    case 'chorehide': case 'choreshow': {
      const k = t.dataset.chorekind, show = d.act === 'choreshow';
      const own = ownChores().filter((c) => !c.gone);
      return act(async () => {
        if (k.startsWith('x_')) await saveChores(own.filter((c) => `x_${c.id}` !== k));
        else await saveChores(own, show ? hiddenChores().filter((x) => x !== k) : [...hiddenChores(), k]);
        choresSheet(); renderCare(); toast(show ? `${careMeta(k)[0]} ${careMeta(k)[1]} is back` : 'Removed — past entries keep their points');
      });
    }
    case 'lognew': return momentSheet(state.view === 'calendar' ? {} : { date: isoLocal() });
    case 'momentdel': {
      const id = $('#momentForm')?.dataset.id;
      if (!id || !confirm('Delete this moment?')) return;
      return act(async () => { await saveRhythm((r) => { r.entries = r.entries.filter((x) => x.id !== id); r.removed.push(id); }); closeSheet(); toast('Deleted'); if (state.view === 'calendar') rhythmLine(); });
    }
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
    case 'nophoto': draft.photo = ''; draft.file = null; return compose();
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
          // 📸 A photo kept as a file: fetched and unlocked into the download too.
          if (x.photoId) { x.photo = await photoDataUrl(f.fid, x.photoId, k).catch(() => ''); delete x.photoId; }
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
});

document.addEventListener('change', async (e) => {
  const t = e.target;
  if (t.name === 'photo' && t.files?.[0]) {
    draft.text = $('#postForm textarea')?.value || draft.text;
    draft.file = t.files[0];
    draft.photo = await shrinkPhoto(t.files[0]).catch(() => '');
    if (!draft.photo) draft.file = null;
    return compose();
  }
  if (t.dataset.dresspick) {
    // A shared box changes it for both of you.
    const picks = dressPicks();
    for (const id of t.dataset.dresspick.split(',')) { const k = `${id}|${t.dataset.dressdate}`; if (t.value) picks[k] = t.value; else delete picks[k]; }
    LS.set('fam.dressPicks', JSON.stringify(picks));
    return renderCalDress(t.dataset.dressdate);
  }
  if (t.name === 'theme') {
    LS.set('pawmily.theme', t.value === 'auto' ? null : t.value);
    if (t.value === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t.value;
    const dark = t.value === 'dark' || (t.value === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name=theme-color]')?.setAttribute('content', dark ? '#111513' : '#2f7d5b');
    return;
  }
  if (t.dataset.notifypref) {
    const prefs = Object.fromEntries([...document.querySelectorAll('[data-notifypref]')].map((x) => [x.dataset.notifypref, x.checked]));
    return act(() => api.put('/push/prefs', prefs));
  }
  if (t.form?.id === 'momentForm' && t.name === 'kind') { t.form.querySelector('.datebits').hidden = t.value !== 'date'; return; }
  if (t.form?.id === 'eventForm' && t.name === 'allDay') { t.form.querySelectorAll('.timeonly').forEach((x) => { x.hidden = t.checked; }); return; }
  if (t.form?.id === 'feelForm' && t.name === 'kind') {
    const k = KINDS[t.value] || KINDS.other;
    const w = t.form.querySelector('.kwhat'), h = t.form.querySelector('.kwhere');
    w.hidden = !k[2]; w.querySelector('span').textContent = k[2] || 'What?';
    h.hidden = !k[3]; h.querySelector('span').textContent = k[3] || 'Where?';
    t.form.idea.value = '';
    return renderFeelPicks();
  }
  if (t.dataset.newstopic) {
    const st = newsSet(), k = t.dataset.newstopic;
    if (k === 'on') st.off = !t.checked;
    else st.topics = t.checked ? [...new Set([...st.topics, k])] : st.topics.filter((x) => x !== k);
    LS.set('fam.newsSet', JSON.stringify(st));
    if ($('#newsCard')) { $('#newsCard').hidden = true; renderNews(); }
    return;
  }
  if (t.dataset.nuset) {
    const st = nuSettings();
    if (t.dataset.nuset === 'nudge') { st.nudge = t.checked; LS.set('fam.nextupSent', null); if (!t.checked && api.mode() !== 'demo') api.del('/account/nextup').catch(() => {}); }
    else st.off = !t.checked;
    LS.set('fam.nextupSet', JSON.stringify(st)); toast('Saved'); return renderNextUp();
  }
  if (t.dataset.moviesonoff) return act(async () => { mv.prefs = (await api.put('/account/movies', { on: t.checked })).movies; toast(t.checked ? '🎬 Movies are on — see Family › Moments' : 'Movies are off'); });
  if (t.dataset.nudgedone && t.checked) {
    const k = t.dataset.nudgedone; t.disabled = true; t.closest('.habit')?.classList.add('done');
    return act(async () => { await new Promise((r) => setTimeout(r, 400)); setNudges(await api.post(`/account/nudges/${k}/done?today=${isoLocal()}`, { date: isoLocal() })); toast(`✓ ${MOVE_NUDGES[k][1]} done — next ${new Date(`${callNudge.all[k].next}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long' })}`); renderYourDay(); });
  }
  if (t.dataset.callnudge === 'done' && t.checked) { t.disabled = true; t.closest('.call-due')?.classList.add('done'); return act(() => new Promise((r) => setTimeout(r, 450)).then(() => callNudgeAct('done', t))); }
  if (t.form?.id === 'writeForm' && (t.name === 'aud' || t.name === 'cat')) {
    const f = t.form;
    f.querySelector('.wboards').hidden = f.aud.value !== 'family';
    f.querySelector('.wnudge')?.toggleAttribute('hidden', f.aud.value !== 'us');
    f.querySelector('.wpoll').hidden = f.cat.value !== 'poll';
    saveDraft();
    if (t.name === 'aud' && (t.value === 'us') !== !f.querySelector('input[name=cat][value=poll]')) { const keep = { aud: t.value }; return writeupSheet(keep); }
    return;
  }
  if (t.form?.id === 'outForm' && t.name === 'day') { const pd = t.form.querySelector('[name=pickday]'); pd.hidden = t.value !== 'pick'; if (!pd.hidden) pd.focus(); return; }
  if (t.form?.id === 'feelForm' && t.name === 'when') { t.form.querySelector('.kday').hidden = t.value !== 'date'; return renderFeelPicks(); }
  if (t.form?.id === 'feelForm' && (t.name === 'day' || t.name === 'time')) return renderFeelPicks();
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
  if (f.id === 'habitForm') { e.preventDefault(); return act(() => saveHabits(f)); }
  if (f.id === 'callForm') { e.preventDefault(); return act(async () => { const r = await api.put(`/account/nudges/callmom?today=${isoLocal()}`, { every: +v.every, last: v.last || undefined }); setNudges(r); closeSheet(); renderToday(); toast('Saved'); }); }
  if (f.id === 'writeForm') { e.preventDefault(); return act(() => (f.dataset.edit ? saveThreadEdit(f) : postThread(f))); }
  if (f.id === 'thReplyForm') {
    e.preventDefault();
    const text = f.text.value.trim();
    if (!text) return;
    return act(async () => {
      const k = th.cur._key, L = (x) => (k ? seal(k, x) : x);
      const quote = th.quote ? (th.quote.para != null ? th.quote.para : await L(th.quote.text)) : null;
      const sealedText = await L(text);
      await threadAct(() => api.post(`/families/${th.cur.fid}/threads/${th.cur.id}/replies`, { text: sealedText, quote }));
      th.quote = null; renderThread(); window.scrollTo(0, document.body.scrollHeight);
    });
  }
  if (f.id === 'rateForm') { e.preventDefault(); return act(() => saveRating(f)); }
  if (f.id === 'outForm') { e.preventDefault(); return act(() => outingGo(f)); }
  if (f.id === 'matchForm') { e.preventDefault(); return act(() => matchToPlan(f.dataset.t, v)); }
  if (f.id === 'ideaSetForm') {
    e.preventDefault();
    return act(async () => {
      const r = await api.put(`/families/${state.fid}/ideas/settings`, { zip: v.zip, theatres: v.theatres.split('\n').map((x) => x.trim()).filter(Boolean), critic: +v.critic, audience: +v.audience });
      ideas.settings = r.settings; closeSheet(); toast('Saved — the next scout uses these'); renderIdeasCard();
    });
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
  if (f.id === 'watchForm') {
    e.preventDefault();
    if (lockedHere()) return toast('🔒 This device needs the family key first — Me › 🔐 Encryption');
    watch.adding = { kind: v.kind, service: v.service };
    return act(async () => {
      await api.post(`/families/${state.fid}/watch/shows`, { aud: v.family ? 'family' : 'us', body: await lock({ title: v.title.trim(), service: v.service || 'other', kind: v.kind === 'movie' ? 'movie' : 'show', date: v.date || isoLocal() }) });
      closeSheet(); watch.tab = 'now';
      if (state.view === 'watch') await watchSaved(); else show('watch');
      toast(`🍿 ${v.title.trim()} added`);
    });
  }
  if (f.id === 'momentForm') {
    e.preventDefault();
    const id = f.dataset.id, date = v.date && v.date <= isoLocal() ? v.date : isoLocal();
    const what = (v.what || '').trim().slice(0, 60), place = (v.place || '').trim().slice(0, 60);
    return act(async () => {
      await saveRhythm((r) => {
        // An edit replaces the old moment (whoever logged it) with the corrected one.
        if (id) { r.entries = r.entries.filter((x) => x.id !== id); r.removed.push(id); }
        const at = Date.now();
        r.entries.push({ id: at.toString(36) + Math.random().toString(36).slice(2, 5), kind: v.kind, date, at, ...(v.kind === 'date' ? { ...(what ? { what } : {}), ...(place ? { place } : {}) } : {}) });
      });
      closeSheet(); toast(id ? 'Saved ❤️' : '❤️ Logged');
      if (state.view === 'calendar') { calm.day = date; calm.month = date.slice(0, 7); rhythmLine(); renderCal(); }
    });
  }
  if (f.id === 'choreForm') {
    e.preventDefault();
    return act(async () => {
      await saveChores([...ownChores().filter((c) => !c.gone), { icon: v.icon || '✅', label: v.label.trim(), pts: +v.pts, section: v.section }]);
      toast(`${v.icon || '✅'} ${v.label.trim()} added`); choresSheet(); renderCare();
    });
  }
  if (f.id === 'watchPgForm') {
    e.preventDefault();
    return act(async () => { await api.patch(`/families/${state.fid}/watch/shows/${f.dataset.id}`, { progress: { s: +v.s, e: +v.e } }); closeSheet(); await watchSaved(); });
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
      let idea = null; try { idea = v.idea ? JSON.parse(v.idea) : null; } catch { /* typed by hand */ }
      const body = await lock({ kind: v.kind, what: v.what.trim(), where: v.where.trim(), when: v.when, time: v.time, note: v.note.trim(), ...(idea ? { idea } : {}) });
      await api.post(`/families/${state.fid}/us/plans`, { day, weekend: v.when === 'weekend', audience: v.audience, body });
      closeSheet(); await usChanged(); toast(`💌 Sent to ${v.audience === 'family' ? 'the family' : partnerName()}`);
    });
  }
  if (f.id === 'usNoteForm') {
    e.preventDefault();
    if (!v.text?.trim()) return;
    if (lockedHere()) return toast('🔒 This device needs the family key first — Me › 🔐 Encryption');
    const color = NOTE_COLORS[us.notes.filter((n) => n.by === fam().me).length % NOTE_COLORS.length];
    return act(async () => { await api.post(`/families/${state.fid}/us/notes`, { body: await lock({ text: v.text.trim(), color }) }); f.reset(); await usChanged(); toast('📌 Stuck'); });
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
      if (f.dataset.calkey) { const mk = dogCalMarks(); mk[f.dataset.calkey] = 'appt'; LS.set(dogCalKey(), JSON.stringify(mk)); }
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
    if (posting) return;
    if (lockedHere()) return toast('🔒 This device needs the family key first — Me › 🔐 Encryption');
    // The same post id on a retry, so the server never saves it twice (a dropped connection, a
    // second tap after an error).
    draft.cid ||= Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
    posting = true;
    const btn = f.querySelector('button:not([type=button])'), label = btn?.innerHTML;
    const step = (t) => { if (btn) { btn.disabled = true; btn.innerHTML = `<span class="spin"></span> ${t}`; } };
    f.classList.add('sending');
    step(draft.photo ? 'Locking your photo…' : 'Posting…');
    return act(async () => {
      const help = draft.help ? { type: draft.help.type, from: v.from, to: v.to || v.from, time: v.time } : null;
      // 🔐 Locked on this phone: with the family key, or (for friends' families) the post's own key.
      let text = v.text, photo = draft.photo, pk, postK = null;
      if (fk()) {
        let k = fk();
        if (draft.audience === 'connections') {
          k = newKey();
          const conns = {};
          for (const [other, sealedCk] of Object.entries(fam().connkeys || {})) { const ck = await tryOpen(fk(), sealedCk, null); if (ck) conns[other] = await seal(ck, k); }
          pk = { fam: await seal(fk(), k), conns };
        }
        text = text ? await seal(k, text) : '';
        postK = k;
      }
      // 📸 With photo storage: the photo goes up as two locked files, and the post just names it.
      let photoId = '', aspect = 1;
      if (photo && await photosReady()) {
        step('Preparing photo…');
        const made = await photoFiles(draft.file || photo);
        photoId = draft.photoId ||= randomToken();
        aspect = made.aspect;
        step('Sending photo…');
        for (const size of ['thumb', 'full']) await api.bytes('PUT', `/families/${state.fid}/photos/${photoId}?size=${size}`, postK ? await sealBytes(postK, made[size]) : made[size]);
        rememberPhoto(photoId, 'thumb', made.thumb);
        photo = '';
      } else if (photo && postK) photo = await seal(postK, photo);
      step(photoId || photo ? 'Posting…' : 'Posting…');
      const r = await api.post(`/families/${state.fid}/posts`, { text, photo, photoId, aspect, pk, tags: draft.tags, audience: draft.audience, help, cid: draft.cid });
      r.post = await openPost(r.post);
      draft = { text: '', photo: '', tags: [], audience: 'family' };
      if (r.post.photoId) photoKeys.set(r.post.photoId, r.post._key);
      if (state.feed.some((x) => x.id === r.post.id)) state.feed = state.feed.filter((x) => x.id !== r.post.id);
      state.view = 'feed'; closeSheet(); state.feed = [r.post, ...state.feed]; show('feed');
      if (r.note) toast(r.note); else if (help) toast(r.post.audience === 'connections' ? 'Asked your family and connected families 🙋' : 'Asked your family 🙋');
      else toast(r.dup ? 'Already posted ✓' : 'Posted ✓');
    }).finally(() => {
      posting = false;
      // Still open (it didn't go through): ready to try again, as the same post.
      if (btn?.isConnected) { btn.disabled = false; btn.innerHTML = label; f.classList.remove('sending'); }
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
// Tapping outside a sheet (on the dimmed backdrop) closes it.
$('#sheet').addEventListener('click', (e) => {
  if (e.target !== $('#sheet')) return;
  const r = $('#sheet').getBoundingClientRect();
  if (e.clientY < r.top || e.clientY > r.bottom || e.clientX < r.left || e.clientX > r.right) closeSheet();
});
$('#sheet').addEventListener('close', () => { if (state.view === 'compose') { draft.text = $('#postForm textarea')?.value ?? draft.text; show('feed'); } });
window.addEventListener('hashchange', () => { if (/invite=/.test(location.hash)) boot(); });

// Errors this phone hits are counted on the connector (message and place only) so the
// maintainer sees glitches nobody reported.
let glitches = 0;
const glitch = (message, where) => { if (glitches++ < 3) api.post('/help/glitch', { message: String(message || '').slice(0, 160), where: String(where || '').replace(location.origin, '').slice(0, 120), version: VERSION }).catch(() => {}); };
window.addEventListener('error', (e) => glitch(e.message, `${e.filename}:${e.lineno}`));
window.addEventListener('unhandledrejection', (e) => glitch(e.reason?.message || e.reason, 'promise'));

// ✨ A newer version is out (a Home Screen app can keep the old one in memory for a while):
// checked when the app opens or comes back, and offered as one tap.
let updateCheckedAt = 0;
async function checkForUpdate() {
  if (VERSION === 'dev' || Date.now() - updateCheckedAt < 60000 || $('.update-bar')) return;
  updateCheckedAt = Date.now();
  try {
    const html = await (await fetch('./index.html', { cache: 'no-store' })).text();
    const latest = html.match(/app\.js\?v=(\d+)/)?.[1];
    if (!latest || +latest <= +VERSION) return;
    const bar = document.createElement('button');
    bar.type = 'button'; bar.className = 'update-bar';
    bar.innerHTML = '✨ A new version is ready — <b>tap to update</b>';
    bar.onclick = () => { bar.textContent = 'Updating…'; navigator.serviceWorker?.getRegistration?.().then((r) => r?.update()).catch(() => {}).finally(() => location.reload()); };
    document.body.append(bar);
  } catch { /* offline: next time */ }
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  checkForUpdate();
  if (state.family && partnerMember()) loadUs().then(() => { usBadge(); if (state.view === 'us') renderUs(); }).catch(() => {});
});
setTimeout(checkForUpdate, 3000);

const wantHelp = new URLSearchParams(location.search).has('help');
if (wantHelp) history.replaceState(null, '', location.pathname + location.hash);
boot().then(() => { if (wantHelp) helpView(); }).catch((err) => { $('#view').innerHTML = `<section class="hero"><h1>Something went wrong</h1><p class="lede">${esc(err.message)}</p><button type="button" data-act="home">Try again</button></section>`; });
document.addEventListener('toggle', (e) => {
  if (e.target.matches?.('details[data-house]')) { LS.set(`fam.${e.target.dataset.house || 'house'}Open`, e.target.open ? '1' : '0'); const f = e.target.querySelector('.fold'); if (f) f.textContent = e.target.open ? 'Hide' : 'Show'; return; } const c = e.target.closest?.('[data-couple]'); if (c && e.target === c) bingo.open[c.dataset.couple] = c.open; }, true);
document.addEventListener('input', (e) => { if (e.target.closest?.('#bingoForm') && e.target.name === 'text') bingoCountLine(); if (e.target.closest?.('#writeForm')) { clearTimeout(saveDraft.t); saveDraft.t = setTimeout(saveDraft, 400); } });

// 💬 Chats: messages between the grown-ups in the family — one to one, and the Grown-ups group.
// Loaded only after the app has started (or when you open it), so it never slows the start.
// Messages are sealed on this phone with the family key before they're sent; a live connection
// to the connector brings new ones, reactions, "typing…" and read receipts the moment they happen
// (the demo checks every few seconds instead). See server/chat.js for who can chat.

const REACTIONS = ['❤️', '😂', '😮', '😢', '🙏', '👍'];
const EMOJIS = '😀 😂 🥹 😊 😍 🥰 😘 😎 🤗 🤔 😴 😅 😭 😡 🥳 🤤 👍 👏 🙌 🙏 💪 👋 ❤️ 💕 🔥 ✨ 🎉 🌮 🍕 🍜 ☕ 🍷 🐶 🐕 🦮 🐾 🦴 🏠 🚗 ✈️ 📅 ⏰ ✅ ❓ 👀 💤'.split(' ');
const GROUP = 'g';
const MAX_FILES = 6, DOC_MAX = 20_000_000;
let C = null; // the app's helpers (start)
const S = { fid: null, list: null, online: new Set(), ws: null, retry: 0, cur: null, convs: {}, typing: {}, reply: null, files: [], plain: new Map(), poll: null, listAt: 0, lastTyping: 0 };

const $ = (s) => document.querySelector(s);
const meId = () => C.fam()?.me;
const nameOf = (id) => (id === meId() ? 'You' : C.member(id)?.name || 'Someone');
const chatName = (c) => (c.kind === 'group' ? '👨‍👩‍👧 Grown-ups' : nameOf(c.with.find((x) => x !== meId())));
const other = (c) => C.member(c.with.find((x) => x !== meId()));
const time = (t) => new Date(t).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const key = () => C.fk(S.fid);
const randomId = () => Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
const emojiOnly = (t) => !!t && t.length <= 24 && /^(\p{Extended_Pictographic}|\p{Emoji_Component}|‍|️|\s)+$/u.test(t) && !/^[\d#*\s]+$/.test(t);
// Links in a message open in a new tab; everything else stays text.
const linkify = (t) => C.esc(t).replace(/\bhttps?:\/\/[^\s<]+[^\s<.,!?;:'")\]]/g, (u) => `<a href="${u}" target="_blank" rel="noopener noreferrer">${u}</a>`).replace(/\n/g, '<br>');

// ---------- start, the list, the badge ----------
export async function start(ctx) {
  C = ctx;
  if (S.fid !== C.state.fid) stop();
  S.fid = C.state.fid;
  await loadList();
  connect();
}
export function stop() {
  try { S.ws?.close(); } catch { /* closed */ }
  Object.assign(S, { ws: null, list: null, cur: null, convs: {}, typing: {}, reply: null, files: [], online: new Set() });
  S.plain.clear();
  clearInterval(S.poll);
}
export const unread = () => (S.list || []).reduce((n, c) => n + (c.unread ? 1 : 0), 0);
const badge = () => C.setBadge(unread());
async function loadList() {
  const r = await C.api.get(`/families/${S.fid}/chats`).catch((e) => (e.status === 403 ? { chats: [] } : Promise.reject(e)));
  S.list = r.chats;
  S.live = !!r.live;
  if (r.online) S.online = new Set(r.online);
  S.listAt = Date.now();
  for (const c of S.list) if (c.lastT) c.preview = await C.tryOpen(key(), c.lastT, '🔒');
  badge();
  return S.list;
}
const preview = (c) => (c.lastAt ? `${c.lastBy === meId() ? 'You: ' : c.kind === 'group' ? `${nameOf(c.lastBy)}: ` : ''}${c.lastT == null && !c.lastP ? 'Message unsent' : c.preview || (c.lastP ? '📷 Photo' : '')}` : c.kind === 'group' ? 'Everyone grown-up in the family' : 'Say hi 👋');
const ago = (t) => (Date.now() - t < 86400e3 && new Date(t).getDate() === new Date().getDate() ? time(t) : C.ago(t));
function groupFace(c, size) {
  const ids = c.with.filter((x) => x !== meId()).slice(0, 4);
  return `<span class="dm-grp" style="width:${size}px;height:${size}px">${ids.map((id) => `<i style="--h:${C.hue(id)}">${C.esc((C.member(id)?.name || '?')[0])}</i>`).join('')}</span>`;
}
const face = (c, size) => (c.kind === 'group' ? groupFace(c, size) : `<span class="dm-face">${C.avatar(other(c), size)}${S.online.has(other(c)?.id) ? '<i class="dm-on" aria-label="online"></i>' : ''}</span>`);
const sorted = () => [...(S.list || [])].sort((a, b) => (b.lastAt - a.lastAt) || (a.kind === 'group' ? -1 : 1));
function listHtml() {
  const list = sorted();
  return `<div class="dm-list">
    <div class="row between"><h2>💬 Chats</h2></div>
    ${list.length ? list.map((c) => `<button type="button" class="dm-row ${S.cur === c.id ? 'on' : ''}" data-dm="open" data-id="${c.id}">${face(c, 46)}
      <span class="grow"><b>${C.esc(chatName(c))}</b><small class="${c.unread ? 'unread' : ''}">${C.esc(preview(c))}</small></span>
      <span class="dm-meta">${c.lastAt ? `<small>${ago(c.lastAt)}</small>` : ''}${c.unread ? `<span class="dm-cnt">${c.unread > 99 ? '99+' : c.unread}</span>` : ''}</span></button>`).join('')
    : '<p class="small muted">Chats are for the grown-ups in the family. Once another grown-up has joined with their own account, you can message them here.</p>'}
    <p class="dm-lock">🔒 Locked on your phones. Only the people in a chat can see it.</p>
  </div>`;
}
export async function listView() {
  setChatBody(false);
  S.cur = null; view();
  if (C.wide() && S.list?.length) return convView(sorted()[0].id);
  $('#view').innerHTML = `${C.demoBanner()}${S.list ? listHtml() : '<div class="skeleton line"></div>'}`;
  if (!S.list || Date.now() - S.listAt > 15000) { await loadList().catch(() => {}); if (C.state.view === 'chats') $('#view').innerHTML = `${C.demoBanner()}${listHtml()}`; }
  startPoll();
}

// ---------- a conversation ----------
const conv = (id) => (S.convs[id] ||= { messages: [], more: false, reads: {}, seq: 0, loaded: false });
const chatOf = (id) => S.list?.find((c) => c.id === id);
async function loadPage(id, before = null) {
  const r = await C.api.get(`/families/${S.fid}/chats/${id}${before ? `?before=${before}` : ''}`);
  const v = conv(id);
  merge(id, r.messages);
  if (!before) { v.seq = r.seq; v.reads = r.reads; }
  if (before || !v.loaded) v.more = r.more;
  v.loaded = true;
}
// New or changed messages in; a pending one (sent from here) is replaced by the saved one.
function merge(id, list) {
  const v = conv(id);
  for (const m of list) {
    const i = v.messages.findIndex((x) => (m.c && x.c === m.c) || (x.s != null && x.s === m.s));
    if (i >= 0) { if (v.messages[i]._local) m._local = v.messages[i]._local; v.messages[i] = m; } else v.messages.push(m);
    v.seq = Math.max(v.seq, m.s || 0);
  }
  v.messages.sort((a, b) => (a.s ?? 1e12) - (b.s ?? 1e12));
}
const plainOf = async (id, m) => {
  if (m._plain != null) return m._plain;
  if (m.d || !m.t) return '';
  const k = `${id}:${m.s}`;
  if (!S.plain.has(k)) S.plain.set(k, await C.tryOpen(key(), m.t, null) ?? '🔒 Locked');
  return S.plain.get(k);
};
const dayLabel = (t) => {
  const d = new Date(t), today = new Date(), y = new Date(Date.now() - 864e5);
  return d.toDateString() === today.toDateString() ? 'Today' : d.toDateString() === y.toDateString() ? 'Yesterday' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', ...(d.getFullYear() !== today.getFullYear() ? { year: 'numeric' } : {}) });
};
function filesHtml(m) {
  const pics = m.p.filter((f) => f.k !== 'doc'), docs = m.p.filter((f) => f.k === 'doc');
  let h = '';
  if (pics.length) {
    const shown = pics.slice(0, 4);
    const box = (f, cls) => (m._local?.[f.id] ? `<button type="button" class="ph ${cls}" style="aspect-ratio:${cls ? 1 : f.a || 1}"><img alt="" src="${m._local[f.id]}"></button>` : C.photoBox({ photoId: f.id, fid: S.fid, aspect: f.a, _key: key() }, cls));
    h += pics.length === 1 ? `<div class="dm-pics one">${box(pics[0], '')}</div>`
      : `<div class="dm-pics">${shown.map((f, i) => `<span class="dm-pic">${box(f, 'grid')}${i === 3 && pics.length > 4 ? `<b class="dm-more">+${pics.length - 4}</b>` : ''}</span>`).join('')}</div>`;
  }
  for (const f of docs) h += `<button type="button" class="dm-doc" data-dm="doc" data-id="${f.id}" data-meta="${C.esc(f.meta || '')}"><span>📄</span><span class="grow"><b data-docname="${f.id}">PDF</b><small>${f.size ? `${Math.max(1, Math.round(f.size / 1024 / 102.4) / 10)} MB` : ''}</small></span></button>`;
  return h;
}
async function msgsHtml(id) {
  const c = chatOf(id), v = conv(id), me = meId();
  const texts = await Promise.all(v.messages.map((m) => plainOf(id, m)));
  let h = v.more ? '<button type="button" class="linkish small dm-older" data-dm="older">Earlier messages</button>' : '';
  let day = '', prev = null;
  v.messages.forEach((m, i) => {
    const d = dayLabel(m.at);
    if (d !== day) { h += `<span class="dm-day">${d}</span>`; day = d; prev = null; }
    const mine = m.by === me, text = texts[i];
    if (c.kind === 'group' && !mine && m.by !== prev) h += `<div class="dm-who">${C.esc(nameOf(m.by))}</div>`;
    const big = !m.d && !m.p.length && !m.r && emojiOnly(text);
    const q = m.r && v.messages.find((x) => x.s === m.r);
    const quote = q ? `<div class="dm-quote">↩︎ ${C.esc(nameOf(q.by))}: ${C.esc((S.plain.get(`${id}:${q.s}`) ?? q._plain ?? '').slice(0, 80) || (q.p.length ? '📷 Photo' : '…'))}</div>` : '';
    const rx = Object.entries(m.x || {}).map(([e, who]) => `${e}${who.length > 1 ? ` ${who.length}` : ''}`).join(' ');
    const bubble = `<div class="dm-m ${mine ? 'mine' : 'them'} ${big ? 'big' : ''} ${m.s == null ? 'pending' : ''} ${rx ? 'has-rx' : ''} ${!m.d && m.p.length && !text && !quote ? 'media' : ''}" data-dm="msg" data-s="${m.s ?? ''}" title="${time(m.at)}">
      ${m.d ? '<i class="dm-gone">Message unsent</i>' : `${quote}${m.p.length ? filesHtml(m) : ''}${text ? `<div class="dm-t">${linkify(text)}</div>` : ''}`}
      ${rx ? `<span class="dm-rx">${C.esc(rx)}</span>` : ''}</div>`;
    const next = v.messages[i + 1];
    const lastOfRun = !next || next.by !== m.by || dayLabel(next.at) !== d;
    h += c.kind === 'group' && !mine ? `<div class="dm-gm">${lastOfRun ? C.avatar(C.member(m.by), 28) : '<span class="dm-sp"></span>'}${bubble}</div>` : bubble;
    prev = m.by;
  });
  // Under your latest message: sending, sent, or read (one to one); who's seen it (the group).
  const last = v.messages.at(-1);
  if (last && last.by === me && !last.d) {
    const seen = c.with.filter((x) => x !== me && (v.reads[x] || 0) >= (last.s || Infinity));
    h += `<span class="dm-seen">${last.s == null ? (last._err ? `⚠️ Not sent · <button type="button" class="linkish small" data-dm="retry" data-c="${last.c}">Try again</button>` : 'Sending…') : c.kind === 'group' ? (seen.length ? `Seen by ${seen.map((x) => C.esc(nameOf(x))).join(', ')}` : '✓ Sent') : seen.length ? '✓✓ Read' : '✓ Sent'}</span>`;
  }
  if (Object.entries(S.typing[id] || {}).some(([m, until]) => m !== me && until > Date.now())) h += '<div class="dm-typing" aria-label="typing"><i></i><i></i><i></i></div>';
  return h || '<p class="small muted center">No messages yet. Say hi 👋</p>';
}
function headHtml(c) {
  const typing = Object.entries(S.typing[c.id] || {}).filter(([m, until]) => m !== meId() && until > Date.now()).map(([m]) => nameOf(m));
  const status = typing.length ? `${c.kind === 'group' ? `${C.esc(typing.join(', '))} ` : ''}typing…` : c.kind === 'group' ? C.esc(c.with.filter((x) => x !== meId()).map(nameOf).join(', ')) : S.online.has(other(c)?.id) ? '● online' : '';
  return `${C.wide() ? '' : '<button type="button" class="icon-btn dm-back" data-dm="back" aria-label="Back to chats">‹</button>'}${face(c, 38)}<span class="grow"><b>${C.esc(chatName(c))}</b><small class="${typing.length || S.online.has(other(c)?.id) ? 'live' : ''}">${status}</small></span>`;
}
export async function convView(id) {
  if (!S.list) await loadList().catch(() => {});
  const c = chatOf(id);
  if (!c) { C.toast('That chat isn’t here'); return listView(); }
  S.cur = id; S.reply = null; S.files = [];
  setChatBody(true);
  const locked = C.fam()?.e2ee && !key();
  $('#view').innerHTML = `<div class="${C.wide() ? 'dm-split' : ''}">${C.wide() ? listHtml() : ''}
    <section class="dm-conv" id="dmConv">
      <header class="dm-head" id="dmHead">${headHtml(c)}</header>
      <div class="dm-msgs" id="dmMsgs">${conv(id).loaded ? '' : '<div class="skeleton line"></div><div class="skeleton line"></div>'}</div>
      <div class="dm-replybar" id="dmReply" hidden></div>
      <div class="dm-files" id="dmFiles" hidden></div>
      <div class="dm-attach" id="dmAttach" hidden>
        <label><b>🖼️</b>Photos<input type="file" accept="image/*" multiple data-dmfile="photo" hidden></label>
        <label><b>📷</b>Camera<input type="file" accept="image/*" capture="environment" data-dmfile="photo" hidden></label>
        <label><b>📋</b>Screenshot<input type="file" accept="image/*" multiple data-dmfile="shot" hidden></label>
        <label><b>📎</b>PDF<input type="file" accept="application/pdf,.pdf" multiple data-dmfile="doc" hidden></label>
      </div>
      <div class="dm-emojis" id="dmEmojis" hidden>${EMOJIS.map((e) => `<button type="button" data-dm="emoji" data-e="${e}">${e}</button>`).join('')}</div>
      ${locked ? '<p class="small muted dm-lockednote">🔒 This device doesn’t have the family key yet, so it can’t read or send messages.</p>' : `<form class="dm-composer" id="dmForm">
        <button type="button" class="icon-btn" data-dm="attach" aria-label="Add photos, a screenshot or a PDF">＋</button>
        <textarea name="t" rows="1" maxlength="4000" placeholder="${c.kind === 'group' ? 'Message everyone…' : 'Message…'}" aria-label="Message" enterkeyhint="send"></textarea>
        <button type="button" class="icon-btn" data-dm="emojis" aria-label="Emoji">😊</button>
        <button class="dm-send" aria-label="Send">➤</button></form>`}
    </section></div>`;
  fit();
  view(id);
  if (!conv(id).loaded) await loadPage(id).catch((e) => C.toast(e.message));
  else loadPage(id).then(() => draw(id)).catch(() => {}); // catch up quietly
  await draw(id, true);
  if (!matchMedia('(pointer: coarse)').matches) $('#dmForm textarea')?.focus();
  startPoll();
}
// Draws the messages; stays at the bottom when you were there (or `bottom`).
async function draw(id, bottom = false) {
  const box = $('#dmMsgs');
  if (!box || S.cur !== id) return;
  const atEnd = bottom || box.scrollHeight - box.scrollTop - box.clientHeight < 80;
  const fromEnd = box.scrollHeight - box.scrollTop;
  const html = await msgsHtml(id);
  if (S.cur !== id || !$('#dmMsgs')) return;
  box.innerHTML = html;
  box.scrollTop = atEnd ? box.scrollHeight : box.scrollHeight - fromEnd;
  const c = chatOf(id);
  if (c && $('#dmHead')) $('#dmHead').innerHTML = headHtml(c);
  markRead(id);
}
function markRead(id) {
  const v = conv(id), c = chatOf(id), s = v.seq;
  if (!c || document.visibilityState !== 'visible' || !s || (v.reads[meId()] || 0) >= s) { if (c?.unread) { c.unread = 0; badge(); if ($('.dm-list')) $('.dm-list').outerHTML = listHtml(); } return; }
  v.reads[meId()] = s; c.unread = 0; badge();
  if ($('.dm-list')) $('.dm-list').outerHTML = listHtml();
  if (S.ws?.readyState === 1) S.ws.send(JSON.stringify({ type: 'read', chat: id, s }));
  else C.api.post(`/families/${S.fid}/chats/${id}/read`, { s }).catch(() => {});
}
// The conversation fills the screen above the keyboard; the tab bar steps aside on a phone.
function setChatBody(on) { document.body.classList.toggle('in-chat', on && !C.wide()); }
function fit() {
  const el = $('#dmConv');
  if (!el) return;
  const vv = window.visualViewport;
  const top = el.getBoundingClientRect().top;
  el.style.height = `${Math.max(320, (vv ? vv.height : innerHeight) - Math.max(0, top) - (C.wide() ? 24 : 0))}px`;
}
window.visualViewport?.addEventListener('resize', () => { if (S.cur && $('#dmConv')) { window.scrollTo(0, 0); fit(); const b = $('#dmMsgs'); if (b) b.scrollTop = b.scrollHeight; } });
addEventListener('resize', () => { if (S.cur) fit(); });

// ---------- sending ----------
async function send(text, retry = null) {
  const id = S.cur, c = chatOf(id);
  if (!c) return;
  const files = retry ? retry._files : S.files;
  if (!text.trim() && !files.length) return;
  const m = retry || { s: null, c: randomId(), by: meId(), at: Date.now(), t: '', _plain: text.trim(), r: S.reply, p: [], x: {}, d: 0, _local: {}, _files: files };
  if (!retry) {
    // Shows straight away: photos from the phone, the text as typed.
    m.p = files.map((f) => ({ id: f.tmp, ...(f.kind === 'doc' ? { k: 'doc', size: f.file.size, meta: '' } : { a: f.aspect || 1 }) }));
    for (const f of files) if (f.url) m._local[f.tmp] = f.url;
    conv(id).messages.push(m);
    S.reply = null; S.files = []; drawExtras();
    await draw(id, true);
  }
  m._err = false;
  try {
    const k = key();
    const p = [];
    for (const f of files) {
      if (f.done) { p.push(f.done); continue; }
      const fileId = randomId();
      if (f.kind === 'doc') {
        const bytes = new Uint8Array(await f.file.arrayBuffer());
        await C.api.bytes('PUT', `/families/${S.fid}/photos/${fileId}?size=doc`, k ? await C.sealBytes(k, bytes) : bytes);
        const meta = { name: f.file.name || 'Document.pdf' };
        f.done = { id: fileId, k: 'doc', size: f.file.size, meta: k ? await C.seal(k, meta) : JSON.stringify(meta) };
      } else {
        const made = await C.photoFiles(f.file, f.kind === 'shot' ? { max: 2400, q: 0.9 } : {});
        for (const size of ['thumb', 'full']) await C.api.bytes('PUT', `/families/${S.fid}/photos/${fileId}?size=${size}`, k ? await C.sealBytes(k, made[size]) : made[size]);
        C.rememberPhoto(fileId, 'thumb', made.thumb);
        f.done = { id: fileId, a: made.aspect };
        m._local[fileId] = f.url;
      }
      p.push(f.done);
    }
    const t = m._plain ? (k ? await C.seal(k, m._plain) : m._plain) : '';
    const r = await C.api.post(`/families/${S.fid}/chats/${id}`, { cid: m.c, t, r: m.r, p });
    S.plain.set(`${id}:${r.message.s}`, m._plain);
    merge(id, [r.message]);
    Object.assign(c, { seq: Math.max(c.seq, r.message.s), lastAt: r.message.at, lastBy: meId(), lastT: t, lastP: p.length, preview: m._plain });
  } catch (e) {
    m._err = true;
    C.toast(e.message);
  }
  draw(id);
}
function drawExtras() {
  const rb = $('#dmReply'), fb = $('#dmFiles');
  if (rb) {
    const q = S.reply && conv(S.cur).messages.find((x) => x.s === S.reply);
    rb.hidden = !q;
    if (q) rb.innerHTML = `<span>↩︎ Replying to <b>${C.esc(nameOf(q.by))}</b>: ${C.esc((S.plain.get(`${S.cur}:${q.s}`) || (q.p.length ? '📷 Photo' : '')).slice(0, 60))}</span><button type="button" class="icon-btn" data-dm="noreply" aria-label="Cancel reply">✕</button>`;
  }
  if (fb) {
    fb.hidden = !S.files.length;
    fb.innerHTML = S.files.map((f, i) => `<span class="dm-file">${f.url ? `<img alt="" src="${f.url}">` : `<i>📄</i><small>${C.esc(f.file.name)}</small>`}<button type="button" data-dm="unfile" data-i="${i}" aria-label="Remove">✕</button></span>`).join('');
  }
}
async function addFiles(list, kind) {
  for (const file of list) {
    if (S.files.length >= MAX_FILES) { C.toast(`Up to ${MAX_FILES} at a time`); break; }
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '');
    if (isPdf && file.size > DOC_MAX) { C.toast(`${file.name} is over 20 MB`); continue; }
    if (!isPdf && !file.type?.startsWith('image/')) continue;
    if (isPdf && !(await C.photosReady())) { C.toast('Files need storage on the connector'); return; }
    if (!isPdf && !(await C.photosReady())) { C.toast('Photos need storage on the connector'); return; }
    S.files.push({ file, kind: isPdf ? 'doc' : kind === 'doc' ? 'photo' : kind, tmp: `tmp${randomId()}`, url: isPdf ? '' : URL.createObjectURL(file) });
  }
  $('#dmAttach') && ($('#dmAttach').hidden = true);
  drawExtras();
}

// ---------- tapping a message: react, reply, copy, unsend ----------
function actions(s) {
  const v = conv(S.cur), m = v.messages.find((x) => x.s === s);
  if (!m || m.d) return;
  const mine = m.by === meId(), c = chatOf(S.cur);
  const readBy = c.with.filter((x) => x !== m.by && (v.reads[x] || 0) >= s).map(nameOf);
  const myRx = Object.keys(m.x || {}).find((e) => m.x[e].includes(meId()));
  C.openSheet(`<div class="dm-actions">
    <div class="dm-rxpick">${REACTIONS.map((e) => `<button type="button" class="${myRx === e ? 'on' : ''}" data-dm="react" data-s="${s}" data-e="${e}" aria-label="React ${e}">${e}</button>`).join('')}</div>
    <p class="tiny muted center">${new Date(m.at).toLocaleString(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}${mine && readBy.length ? ` · Read by ${C.esc(readBy.join(', '))}` : ''}${Object.keys(m.x || {}).length ? `<br>${Object.entries(m.x).map(([e, who]) => `${e} ${C.esc(who.map(nameOf).join(', '))}`).join(' · ')}` : ''}</p>
    <div class="stack">
      <button type="button" class="ghost" data-dm="reply" data-s="${s}">↩︎ Reply</button>
      ${S.plain.get(`${S.cur}:${s}`) ? `<button type="button" class="ghost" data-dm="copy" data-s="${s}">Copy text</button>` : ''}
      ${mine ? `<button type="button" class="ghost danger" data-dm="unsend" data-s="${s}">Unsend</button>`
    : `<button type="button" class="ghost" data-dm="report" data-s="${s}">🚩 Report…</button>
      <button type="button" class="ghost danger" data-dm="block" data-by="${m.by}">⛔ Block ${C.esc(nameOf(m.by))}</button>`}
      <button type="button" class="ghost" data-act="close">Close</button>
    </div></div>`);
}
async function openDoc(fileId, metaRaw) {
  const meta = (await C.tryOpen(key(), metaRaw, null)) ?? (() => { try { return JSON.parse(metaRaw); } catch { return {}; } })();
  const name = (meta && typeof meta === 'object' ? meta.name : '') || 'Document.pdf';
  C.openSheet(`<div class="row between"><h2>📄 ${C.esc(name)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div><p class="small muted" id="dmDocNote">Opening…</p>`);
  try {
    const locked = await C.api.bytes('GET', `/families/${S.fid}/photos/${fileId}?size=doc`);
    const bytes = key() ? await C.openBytes(key(), locked) : locked;
    const u = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    if (!$('#dmDocNote')) return;
    C.openSheet(`<div class="row between"><h2>📄 ${C.esc(name)}</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
      ${matchMedia('(min-width: 700px)').matches ? `<iframe class="docframe" src="${u}" title="${C.esc(name)}"></iframe>` : ''}
      <div class="row wrap"><a class="btn" href="${u}" target="_blank" rel="noopener">Open</a><a class="btn ghost" href="${u}" download="${C.esc(name)}">⬇︎ Save a copy</a></div>
      <p class="tiny muted">Unlocked on this device only.</p>`);
  } catch { if ($('#dmDocNote')) $('#dmDocNote').textContent = "Couldn't open this PDF."; }
}

document.addEventListener('click', async (e) => {
  const t = e.target.closest('[data-dm]');
  if (!t || !C) return;
  const d = t.dataset, id = S.cur;
  switch (d.dm) {
    case 'open': return C.show('chat', d.id);
    case 'back': return C.show('chats');
    case 'older': { const v = conv(id), box = $('#dmMsgs'); t.disabled = true; await loadPage(id, v.messages.find((x) => x.s != null)?.s).catch(() => {}); if (box) await draw(id); return; }
    case 'msg': if (e.target.closest('a, .ph, .dm-doc') || !d.s) return; return actions(+d.s);
    case 'react': C.closeSheet(); return C.api.post(`/families/${S.fid}/chats/${id}/react`, { s: +d.s, e: d.e }).then((r) => { merge(id, [r.message]); draw(id); }).catch((err) => C.toast(err.message));
    case 'reply': C.closeSheet(); S.reply = +d.s; drawExtras(); return $('#dmForm textarea')?.focus();
    case 'noreply': S.reply = null; return drawExtras();
    case 'copy': C.closeSheet(); return navigator.clipboard?.writeText(S.plain.get(`${id}:${d.s}`) || '').then(() => C.toast('Copied')).catch(() => {});
    case 'unsend': C.closeSheet(); return C.api.del(`/families/${S.fid}/chats/${id}/${d.s}`).then((r) => { merge(id, [r.message]); draw(id); }).catch((err) => C.toast(err.message));
    case 'report': {
      const reason = prompt("What's wrong with this message? (It stays encrypted; only that it was reported is kept.)", '');
      if (reason == null) return;
      C.closeSheet();
      return C.api.post(`/families/${S.fid}/chats/${id}/report`, { s: +d.s, reason }).then(() => C.toast('Reported — you can also block them')).catch((err) => C.toast(err.message));
    }
    case 'block': {
      const name = nameOf(d.by);
      if (!confirm(`Block ${name}? Your chats with them, and their threads and replies, disappear for you. You can unblock them in Me › Blocked.`)) return;
      C.closeSheet();
      return C.api.post(`/families/${S.fid}/members/${d.by}/block`).then(async (r) => { if (C.state.user) C.state.user.blocked = r.blocked; C.toast(`${name} is blocked`); await loadList(); C.show('chats'); }).catch((err) => C.toast(err.message));
    }
    case 'attach': $('#dmEmojis').hidden = true; $('#dmAttach').hidden = !$('#dmAttach').hidden; return;
    case 'emojis': $('#dmAttach').hidden = true; $('#dmEmojis').hidden = !$('#dmEmojis').hidden; return;
    case 'emoji': { const ta = $('#dmForm textarea'); if (!ta) return; const at = ta.selectionStart ?? ta.value.length; ta.value = ta.value.slice(0, at) + d.e + ta.value.slice(ta.selectionEnd ?? at); ta.selectionStart = ta.selectionEnd = at + d.e.length; grow(ta); return; }
    case 'unfile': S.files.splice(+d.i, 1); return drawExtras();
    case 'doc': return openDoc(d.id, d.meta);
    case 'retry': { const m = conv(id).messages.find((x) => x.c === d.c); if (m) send(m._plain, m); return; }
    default:
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id !== 'dmForm') return;
  e.preventDefault();
  const ta = e.target.t;
  const text = ta.value;
  ta.value = ''; grow(ta);
  $('#dmEmojis').hidden = true;
  send(text);
});
document.addEventListener('keydown', (e) => {
  // Enter sends on a keyboard (Shift+Enter for a new line); phones keep Enter for new lines.
  if (e.target.closest?.('#dmForm') && e.target.name === 't' && e.key === 'Enter' && !e.shiftKey && !e.isComposing && !matchMedia('(pointer: coarse)').matches) { e.preventDefault(); e.target.form.requestSubmit(); }
});
const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = `${Math.min(140, ta.scrollHeight)}px`; };
document.addEventListener('input', (e) => {
  if (e.target.closest?.('#dmForm') && e.target.name === 't') {
    grow(e.target);
    if (S.ws?.readyState === 1 && Date.now() - S.lastTyping > 2500 && e.target.value) { S.lastTyping = Date.now(); S.ws.send(JSON.stringify({ type: 'typing', chat: S.cur })); }
  }
});
document.addEventListener('change', (e) => { const k = e.target.dataset?.dmfile; if (k && e.target.files?.length) { addFiles([...e.target.files], k); e.target.value = ''; } });
// Paste or drop photos and PDFs into a conversation.
document.addEventListener('paste', (e) => {
  if (!$('#dmForm') || $('#sheet').open) return;
  const files = [...(e.clipboardData?.items || [])].filter((it) => it.kind === 'file').map((it) => it.getAsFile()).filter(Boolean);
  if (files.length) { e.preventDefault(); addFiles(files, 'shot'); }
});
document.addEventListener('dragover', (e) => { if ($('#dmConv') && !$('#sheet').open) e.preventDefault(); });
document.addEventListener('drop', (e) => { if (!$('#dmConv') || $('#sheet').open) return; e.preventDefault(); addFiles([...(e.dataTransfer?.files || [])], 'shot'); });

// ---------- live: the connection, and what it brings ----------
function view(id = null) { if (S.ws?.readyState === 1) S.ws.send(JSON.stringify({ type: 'view', chat: id })); }
async function connect() {
  if (!S.live || !S.list?.length || (S.ws && S.ws.readyState <= 1) || document.visibilityState !== 'visible') return;
  const fid = S.fid;
  const r = await C.api.post(`/families/${fid}/chats/ticket`).catch(() => null);
  if (!r?.ticket || fid !== S.fid) return;
  const ws = new WebSocket(`${C.api.base().replace(/^http/, 'ws')}/v2/chat/ws?fid=${fid}&t=${r.ticket}`);
  S.ws = ws;
  let ping;
  ws.onopen = () => { S.retry = 0; view(S.cur); ping = setInterval(() => ws.readyState === 1 && ws.send('ping'), 25000); };
  ws.onmessage = (e) => { if (e.data !== 'pong') { try { onEvent(JSON.parse(e.data)); } catch { /* ignore */ } } };
  ws.onclose = (e) => {
    clearInterval(ping);
    if (S.ws !== ws) return;
    S.ws = null;
    if (e.code === 4003 || e.code === 4004) return;
    // Back again shortly (sooner the first times), only while the app is on screen.
    const wait = Math.min(30000, 1000 * 2 ** S.retry++);
    setTimeout(() => { if (S.fid === fid) catchUp(); }, wait);
  };
}
// Back on screen or reconnected: the list, and the open chat, brought up to date.
async function catchUp() {
  if (!C || !S.fid || document.visibilityState !== 'visible') return;
  await loadList().catch(() => {});
  if (S.cur) await loadPage(S.cur).then(() => draw(S.cur)).catch(() => {});
  else if (C.state.view === 'chats' && $('.dm-list')) $('#view').innerHTML = `${C.demoBanner()}${listHtml()}`;
  connect();
}
document.addEventListener('visibilitychange', () => {
  if (!C || !S.fid) return;
  if (document.visibilityState === 'visible') { if (!S.ws || Date.now() - S.listAt > 20000) catchUp(); else view(S.cur); }
  else view(null);
});
async function onEvent(ev) {
  if (ev.type === 'online') { S.online = new Set(ev.members); return refreshChrome(); }
  const c = chatOf(ev.chat);
  if (!c) return;
  if (ev.type === 'typing') {
    S.typing[ev.chat] = { ...(S.typing[ev.chat] || {}), [ev.m]: Date.now() + 4000 };
    if (S.cur === ev.chat) { draw(ev.chat); setTimeout(() => S.cur === ev.chat && draw(ev.chat), 4100); }
    return;
  }
  if (ev.type === 'read') { conv(ev.chat).reads[ev.m] = ev.s; if (ev.m === meId() && ev.s >= c.seq) { c.unread = 0; badge(); } if (S.cur === ev.chat) draw(ev.chat); return; }
  if (ev.type === 'msg' || ev.type === 'edit') {
    const m = ev.message;
    if (S.typing[ev.chat]) delete S.typing[ev.chat][m.by];
    if (ev.type === 'edit') S.plain.delete(`${ev.chat}:${m.s}`);
    if (S.convs[ev.chat]?.loaded) merge(ev.chat, [m]);
    if (ev.type === 'msg' && m.s > c.seq) {
      Object.assign(c, { seq: m.s, lastAt: m.at, lastBy: m.by, lastT: m.t, lastP: m.p.length, preview: m.t ? await C.tryOpen(key(), m.t, '🔒') : '' });
      if (m.by !== meId() && !(S.cur === ev.chat && document.visibilityState === 'visible')) { c.unread += 1; badge(); banner(c, m); }
    }
    if (S.cur === ev.chat) draw(ev.chat); else refreshChrome();
  }
}
function refreshChrome() {
  if (C.state.view === 'chats' && $('.dm-list') && !S.cur) $('#view').innerHTML = `${C.demoBanner()}${listHtml()}`;
  else if (S.cur && $('.dm-list')) { const l = $('.dm-list'); l.outerHTML = listHtml(); }
  const c = S.cur && chatOf(S.cur);
  if (c && $('#dmHead')) $('#dmHead').innerHTML = headHtml(c);
}
// A message arriving while you're elsewhere in the app: a banner you can tap (the text stays on this phone).
function banner(c, m) {
  if ($('#sheet').open) return;
  $('#dropBanner')?.remove();
  const el = document.createElement('div');
  el.id = 'dropBanner'; el.className = 'dropban'; el.setAttribute('role', 'status');
  el.innerHTML = `<button type="button" class="db-go" data-dm="open" data-id="${c.id}"><b>💬 ${C.esc(c.kind === 'group' ? `${nameOf(m.by)} in Grown-ups` : nameOf(m.by))}</b><small>${C.esc((c.preview || (m.p.length ? '📷 Photo' : 'New message')).slice(0, 90))}</small></button><button type="button" class="db-x" aria-label="Dismiss">✕</button>`;
  document.body.append(el);
  el.querySelector('.db-x').onclick = () => el.remove();
  el.querySelector('.db-go').addEventListener('click', () => el.remove());
  setTimeout(() => el.classList.add('out'), 6000); setTimeout(() => el.remove(), 6600);
}
// The demo (no live connection): a quick look every few seconds while chats are on screen.
function startPoll() {
  clearInterval(S.poll);
  if (S.live && S.ws) return;
  S.poll = setInterval(async () => {
    if (document.visibilityState !== 'visible' || !['chats', 'chat'].includes(C.state.view)) return;
    if (S.cur) { const before = conv(S.cur).seq; await loadPage(S.cur).catch(() => {}); if (conv(S.cur).seq !== before) draw(S.cur); }
    else { await loadList().catch(() => {}); refreshChrome(); }
    if (S.live && !S.ws) connect();
  }, S.live ? 15000 : 4000);
}
// Leaving the chat screens.
export function leave() { if (S.cur || document.body.classList.contains('in-chat')) { S.cur = null; view(null); setChatBody(false); } clearInterval(S.poll); }
export const refresh = () => catchUp();

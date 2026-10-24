// 🔐 Our household code: see it, change it, and — when your partner changed it — enter the
// new one. Changing it moves everything to a fresh random code and empties the old one, so
// anyone who had the old code (an old screenshot, a shared calendar link) is locked out.
import { PROFILES, ownerId, profileStore } from './storage.js';
import { sync } from './sync.js';
import { account } from './account.js';
import { syncLine } from './plans.js';
import { allDogs } from './dogs.js';
import { allAdopt } from './adopt.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const nameOf = (id) => profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || id;
const partner = () => PROFILES.find((p) => p.id !== ownerId())?.id;
export const prettyCode = (code) => String(code || '').replace(/(.{4})(?=.)/g, '$1-');
const linkFor = (code) => `${location.origin}${location.pathname}#link=${encodeURIComponent(code)}`;
const ago = (t) => { const d = Math.floor((Date.now() - t) / 864e5); return d < 1 ? 'today' : d === 1 ? 'yesterday' : d < 60 ? `${d} days ago` : `${Math.round(d / 30)} months ago`; };

let shown = false;   // code visible
let fresh = null;    // {code, files} right after changing it
let msg = '';
let busy = false;
let dismissed = false; // "Later" on the pop-up: ask again next time the app opens

function movedCard(inDialog = false) {
  const by = sync.settings().moved.by;
  return `<div class="card hh-card hh-moved">
    <div class="eyebrow">🔐 New household code</div>
    <p><b>${esc(nameOf(by))} changed your household code.</b> Sharing is paused on this phone until you enter the new one.</p>
    <p class="small muted">On ${esc(nameOf(by))}'s phone: 🔐 Privacy › Our household code › Send. Tap the link they send, or paste the code here.</p>
    <div class="row"><input class="hh-input" data-hhinput autocomplete="off" autocapitalize="none" placeholder="xxxx-xxxx-xxxx" style="flex:1">
      <button type="button" class="ghost small" data-hhpaste>📋 Paste</button></div>
    <div class="row"><button type="button" data-hhjoin ${busy ? 'disabled' : ''}>${busy ? 'Checking…' : 'Use the new code'}</button>${inDialog ? '<button type="button" class="ghost" data-hhlater>Later</button>' : ''}</div>
    ${msg ? `<p class="small">${esc(msg)}</p>` : ''}
  </div>`;
}

function codeCard() {
  const s = sync.settings();
  if (account.get()?.householdOff) {
    return `<div class="card hh-card"><div class="eyebrow">✅ Moved to your accounts</div>
      <p class="small">You're both on OurPawmily accounts and share with each other, so the household code isn't used any more: your trackers sync through your accounts, end-to-end encrypted. Its last copies stay on the server, and 🛟 Recover my data can still read them.</p></div>`;
  }
  if (!s?.code || !sync.household()) {
    return `<div class="card hh-card"><div class="eyebrow">🔐 Our household code</div>
      <p class="small muted">Sharing is off on this phone. Link your phones first (open ${esc(nameOf(partner()))}'s day and tap Link phones).</p></div>`;
  }
  const code = s.code;
  const masked = `••••-••••-${code.slice(-4)}`;
  return `<div class="card hh-card">
    <div class="eyebrow">🔐 Our household code</div>
    <p class="small muted">Both phones share through this private code. It works like a password: anyone who has it can see your shared data. Change it now and then, or any time it may have been seen.</p>
    <div class="row"><code class="share-code">${esc(shown ? prettyCode(code) : masked)}</code><button type="button" class="ghost small" data-hhshow>${shown ? 'Hide' : 'Show'}</button></div>
    <p class="small muted">${s.changedAt ? `Last changed ${ago(s.changedAt)}.` : 'Not changed since you linked your phones.'}${/^[a-hj-km-np-z2-9]{12}$/.test(code) ? '' : ' <b class="tone-warn">This is a phrase you typed — changing it gives you a strong random code.</b>'}</p>
    ${fresh ? `<div class="hh-fresh">
        <p><b>✓ Changed.</b> New code: <code class="share-code">${esc(prettyCode(fresh.code))}</code></p>
        <p class="small">Now send it to ${esc(nameOf(partner()))}: their phone has paused sharing and is asking for it. Send it privately (Messages, AirDrop) — never in a group or a post.</p>
        <div class="row"><button type="button" data-hhsend>Send to ${esc(nameOf(partner()))}</button><button type="button" class="ghost small" data-hhcopy>Copy</button></div>
        <p class="small muted">Subscribed to the shared calendar in Apple or Google Calendar? That link used the old code — add it again from the Calendar tab on both phones.${fresh.files ? ` ${fresh.files} file${fresh.files === 1 ? '' : 's'} moved over.` : ''}</p>
      </div>`
      : `<div class="row"><button type="button" class="ghost" data-hhchange ${busy ? 'disabled' : ''}>${busy ? 'Changing…' : '🔄 Change our code'}</button>
        ${shown ? `<button type="button" class="ghost small" data-hhsend>Send to ${esc(nameOf(partner()))}</button>` : ''}</div>`}
    ${msg ? `<p class="small">${esc(msg)}</p>` : ''}
  </div>`;
}

// The rest of the Privacy tab: sharing status and how your data is kept.
function privacyInfo() {
  const s = sync.settings();
  const acct = account.get();
  if (acct) {
    return `<div class="card">
      <div class="eyebrow">🛡 How your data is kept</div>
      <ul class="small privacy-list">
        <li><b>Saved to your OurPawmily account</b> (${esc(acct.email)}), so it's the same on every device you sign in on.</li>
        ${acct.e2ee ? `<li><b>End-to-end encrypted.</b> Your trackers are locked on your devices with ${esc(acct.family)}'s family key before they're sent; the server only keeps text it can't read.</li>` : `<li><b>Not end-to-end encrypted yet.</b> ${esc(acct.family)}'s creator can turn it on in OurPawmily › Me › 🔐 Encryption.</li>`}
        <li><b>Who can see it:</b> only the people in ${esc(acct.family)} you turned sharing on for (OurPawmily › Me › Who can see my diet &amp; fitness).</li>
        <li><b>${acct.householdOff ? 'The household code is retired' : 'The household code still runs alongside'}</b>${acct.householdOff ? ' — you both share through your accounts now.' : ` until ${esc(nameOf(partner()))} is on an account too and you share with each other.`}</li>
        <li><b>Keys stay secret.</b> WHOOP, Strava and Claude keys live in Cloudflare's secret store; WHOOP and Strava sign-ins never leave the device that made them.</li>
        <li><b>🐾 Dogs, 💞 notes and plans, and 🍿 what you watch</b> live in OurPawmily now.</li>
      </ul>
    </div>`;
  }
  return `<div class="card">
      <div class="eyebrow">📡 Sharing between your phones</div>
      ${syncLine()}
      <p class="small">This phone belongs to <b>${esc(nameOf(ownerId()))}</b>; it shares ${esc(nameOf(ownerId()))}'s data and shows ${esc(nameOf(partner()))}'s.${s?.url ? ` Connector: <code class="small">${esc(new URL(s.url).host)}</code>.` : ''}</p>
      <div class="row"><button type="button" class="ghost small" data-hhdevices>Sharing, connector & devices…</button></div>
    </div>
    <div class="card">
      <div class="eyebrow">🛡 How your data is kept</div>
      <ul class="small privacy-list">
        <li><b>On your phones.</b> Each phone keeps its owner's data in this browser; nothing personal is in the app's public code.</li>
        <li><b>Shared through your connector</b>, filed under your household code and sent over HTTPS — readable only with the code.</li>
        <li><b>Keys stay secret.</b> WHOOP, Strava and Claude keys live in Cloudflare's secret store; WHOOP and Strava sign-ins never leave the phone that made them.</li>
        <li><b>Treat the code like a password:</b> share it only in a private message, never in a group, a post or a screenshot — and change it now and then (above).</li>
        <li>Lock both phones with Face ID or a passcode, and don't keep passwords or ID numbers in notes or documents.</li>
      </ul>
    </div>`;
}

export function renderHousehold() {
  if (!ownerId()) return;
  const moved = !!sync.settings()?.moved && !account.get()?.householdOff;
  // A pop-up rather than a Home card: Home can't be typed in while you view your partner's day.
  const dlg = $('#hhDialog');
  if (dlg) {
    if (moved && !dismissed) {
      // Redraw only when something changed, so typing (and a tap) isn't interrupted.
      const html = movedCard(true);
      if (dlg.dataset.html !== html) {
        const typed = dlg.querySelector('[data-hhinput]')?.value || '';
        dlg.innerHTML = html;
        dlg.dataset.html = html;
        dlg.querySelector('[data-hhinput]').value = typed;
      }
      if (!dlg.open) dlg.showModal();
    } else if (dlg.open) dlg.close();
  }
  if ($('#usHousehold')) $('#usHousehold').innerHTML = moved ? movedCard() : codeCard();
  if ($('#privacyInfo')) $('#privacyInfo').innerHTML = privacyInfo();
}

async function share(code) {
  const text = `Our new OurPawmily household code. Tap to switch (open it in the browser you use for OurPawmily): ${linkFor(code)}\nOr paste this code when the app asks: ${prettyCode(code)}`;
  try {
    if (navigator.share) await navigator.share({ text });
    else { await navigator.clipboard.writeText(text); msg = 'Copied — paste it in a private message.'; renderHousehold(); }
  } catch { /* share sheet closed */ }
}

export function initHousehold() {
  window.addEventListener('lp:household', renderHousehold);
  $('#hhDialog')?.addEventListener('cancel', () => { dismissed = true; });
  document.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (t?.dataset.hhdevices != null) { window.dispatchEvent(new Event('lp:opendevices')); return; }
    if (t?.dataset.syncnow != null && t.closest('#tab-privacy')) { t.textContent = 'Checking…'; sync.push().then(() => sync.pull()).catch(() => {}).finally(renderHousehold); return; }
    if (!t || !t.closest('.hh-card')) return;
    const ds = t.dataset;
    if (ds.hhlater != null) { dismissed = true; renderHousehold(); }
    else if (ds.hhshow != null) { shown = !shown; renderHousehold(); }
    else if (ds.hhsend != null) share(fresh?.code || sync.settings().code);
    else if (ds.hhcopy != null) { await navigator.clipboard?.writeText(prettyCode(fresh.code)).catch(() => {}); msg = 'Code copied.'; renderHousehold(); }
    else if (ds.hhchange != null) {
      const p = nameOf(partner());
      if (!confirm(`Change your household code?\n\nEverything moves to a new code and the old one stops working. ${p}'s phone will pause sharing until ${p} enters the new code, which you'll send from here.`)) return;
      busy = true; msg = ''; renderHousehold();
      try {
        const fileIds = [
          ...allDogs().flatMap((d) => (d.docs || []).filter((f) => f.shared).map((f) => f.id)),
          ...allAdopt().filter((d) => d.photo?.shared).map((d) => d.photo.id),
        ];
        fresh = await sync.rotate(fileIds);
        shown = false;
      } catch (err) { msg = err.message; }
      busy = false; renderHousehold();
    } else if (ds.hhpaste != null) {
      const text = await navigator.clipboard?.readText?.().catch(() => '') || '';
      const m = text.match(/#link=([^\s&]+)/) || text.match(/\b([a-z0-9]{4}-?[a-z0-9]{4}-?[a-z0-9]{4}[a-z0-9-]*)\b/i);
      const input = t.closest('.hh-card').querySelector('[data-hhinput]');
      if (m && input) input.value = decodeURIComponent(m[1]);
      else { msg = 'Nothing to paste — copy the code from the message first.'; renderHousehold(); }
    } else if (ds.hhjoin != null) {
      const value = t.closest('.hh-card').querySelector('[data-hhinput]')?.value.trim();
      if (!value) return;
      busy = true; msg = ''; renderHousehold();
      try {
        await sync.join(value);
        busy = false; msg = '';
        location.reload();
      } catch (err) { busy = false; msg = err.message; renderHousehold(); }
    }
  });
}

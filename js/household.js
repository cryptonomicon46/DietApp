// 🔐 Privacy › how your trackers are kept and shared. In 2.0 sharing happens only through your
// OurPawmily family (membership and who you choose to share diet & fitness with), so no household
// code is shown, typed or sent here. A phone that shared through a code before and isn't signed in
// keeps syncing it in the background (js/sync.js); once signed in it only reads partners who haven't
// moved. 🛟 Recover can still read old copies.
import { PROFILES, ownerId, profileStore } from './storage.js';
import { sync } from './sync.js';
import { account } from './account.js';

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const nameOf = (id) => profileStore(id).get('profile', null)?.name?.split(/\s+/)[0] || PROFILES.find((p) => p.id === id)?.name || id;

// Not signed in: sharing with your partner now means a family.
function familyCard() {
  return `<div class="card hh-card">
    <div class="eyebrow">👨‍👩‍👧 Share through your family</div>
    <p class="small">To see each other's day, sign in to OurPawmily with Google and create or join your family. Each of you then chooses whether to share your diet, and your fitness, with the other. Your trackers on this phone come along.</p>
    <div class="row"><a class="btn small" href="family/">Open OurPawmily</a></div>
  </div>`;
}

function privacyInfo() {
  const acct = account.get();
  if (acct) {
    return `<div class="card">
      <div class="eyebrow">🛡 How your data is kept</div>
      <ul class="small privacy-list">
        <li><b>Saved to your OurPawmily account</b> (${esc(acct.email)}), so it's the same on every device you sign in on.</li>
        ${acct.e2ee ? `<li><b>End-to-end encrypted.</b> Your trackers are locked on your devices with ${esc(acct.family)}'s family key before they're sent; the server only keeps text it can't read.</li>` : `<li><b>Not end-to-end encrypted yet.</b> ${esc(acct.family)}'s creator can turn it on in OurPawmily › Me › 🔐 Encryption.</li>`}
        <li><b>Who can see it:</b> only the people in ${esc(acct.family)} you turned sharing on for — Diet and Fitness separately (OurPawmily › 💪 Health, or Me › 💪 Who can see my Health). The way phones shared before 2.0 no longer gets your updates.</li>
        <li><b>Keys stay secret.</b> WHOOP and Claude keys live in Cloudflare's secret store; a WHOOP sign-in never leaves the device that made it.</li>
        <li><b>🐾 Dogs, 💞 notes and plans, and 🍿 what you watch</b> live in OurPawmily now.</li>
      </ul>
    </div>`;
  }
  return `<div class="card">
      <div class="eyebrow">🛡 How your data is kept</div>
      <ul class="small privacy-list">
        <li><b>On this phone.</b> Your trackers are kept in this browser; nothing personal is in the app's public code.</li>
        ${sync.household() ? '<li><b>Still shared the old way.</b> This phone keeps sending your trackers to the phone you linked before 2.0. Sign in to OurPawmily to choose who sees your Diet and your Fitness instead — from then on this phone stops sending them the old way.</li>' : '<li><b>Private until you share.</b> Sharing happens only through an OurPawmily family, and only with the people you choose.</li>'}
        <li>Lock your phone with Face ID or a passcode, and don't keep passwords or ID numbers in notes or documents.</li>
      </ul>
      <div class="row"><button type="button" class="ghost small" data-hhdevices>Devices…</button></div>
    </div>`;
}

export function renderHousehold() {
  if (!ownerId()) return;
  if ($('#usHousehold')) $('#usHousehold').innerHTML = account.get() ? '' : familyCard();
  if ($('#privacyInfo')) $('#privacyInfo').innerHTML = privacyInfo();
}

export function initHousehold() {
  window.addEventListener('lp:household', renderHousehold);
  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (t?.dataset.hhdevices != null) window.dispatchEvent(new Event('lp:opendevices'));
    else if (t?.dataset.syncnow != null && t.closest('#tab-privacy')) { t.textContent = 'Checking…'; sync.push().then(() => sync.pull()).catch(() => {}).finally(renderHousehold); }
  });
}

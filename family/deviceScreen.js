// ⌚ Health › Devices (loaded only when opened, or when you come back from connecting WHOOP). The
// WHOOP sign-in is kept on this device by the trackers' device code (js/devices.js); what it brings
// in goes into your Fitness — shared only as your Fitness is. Connecting shares nothing.
let c = null;
export function init(ctx) { c = ctx; }
const D = () => import(`../js/devices.js?v=${c.VERSION}`);
const A = () => import(`../js/account.js?v=${c.VERSION}`);
// Whose trackers this device holds: found through your account (as the trackers do), so a device
// that has only ever opened OurPawmily keeps the sign-in and the workouts under your own profile.
async function owner() {
  const { ownerId } = await import(`../js/storage.js?v=${c.VERSION}`);
  if (ownerId()) return ownerId();
  const { account } = await A();
  await account.connect().catch(() => null);
  return ownerId();
}

export async function sheet() {
  await owner();
  const { devices } = await D();
  let cfg = c.state.devCfg;
  if (!cfg) { cfg = await c.api.liveConfig().catch(() => ({ offline: true })); if (!cfg.missing && !cfg.offline) c.state.devCfg = cfg; }
  const w = devices.get().whoop, st = devices.status('whoop'), strava = devices.get().strava;
  const can = !!cfg.devices?.whoop, E = c.esc;
  c.openSheet(`<div class="row between"><h2>⌚ Devices</h2><button type="button" class="icon-btn" data-act="close" aria-label="Close">✕</button></div>
    <div class="dev-row"><div class="grow"><b>WHOOP</b><p class="small muted" id="devWhoop" role="status">${E(w ? st.text : can ? 'Brings in your workouts, each day\'s calories burned and strain, and your Recovery and Sleep (those stay private to you).' : cfg.offline ? 'Couldn\'t check — you seem to be offline.' : 'Not available yet on this app.')}</p></div></div>
    <div class="row wrap">${w ? `${st.needsReconnect ? '<button type="button" data-act="devconnect">Reconnect</button>' : '<button type="button" data-act="devsync">Sync now</button>'}<button type="button" class="ghost" data-act="devoff">Disconnect</button>` : can ? '<button type="button" data-act="devconnect">Connect WHOOP</button>' : ''}</div>
    ${strava ? '<div class="dev-row"><div class="grow"><b>Strava</b><p class="small muted">Connected before; no longer offered. You can disconnect it.</p></div><button type="button" class="ghost small" data-act="devoffstrava">Disconnect</button></div>' : ''}
    <div class="dev-row"><div class="grow"><b>Garmin</b><p class="small muted">Not available. Garmin only opens its data to approved companies, so OurPawmily can't connect to it directly.</p></div></div>
    <div class="dev-row"><div class="grow"><b>Apple Health</b><p class="small muted">Needs an iPhone app, which isn't available yet.</p></div></div>
    <p class="tiny muted">Connecting a device shares nothing with your family. Workouts and calories it brings in become part of your Fitness, which only the people you chose can see. The WHOOP sign-in stays on this device; disconnecting asks WHOOP to remove OurPawmily's access and keeps the workouts already brought in.</p>`);
}
// Bring in what's new, then save your trackers to your account (your Fitness part included).
// Your account copy comes down first, so a device that has only opened OurPawmily adds the new
// workouts to everything else you have — never uploads a copy with only them in it.
async function syncHere(days = 3) {
  const { account } = await A();
  if (!account.active()) await account.connect().catch(() => null);
  if (account.active()) await account.pull().catch(() => null);
  const { syncOwner } = await D();
  const r = await syncOwner(days, { daily: true });
  if (account.active()) await account.push().catch(() => {});
  c.clearShared();
  return r;
}
// Opening Health: the same, quietly. → whether anything new came in.
export async function quietSync() {
  const id = await owner();
  if (!id) return false;
  const now = () => ['whoopDaily', 'workoutHistory'].map((k) => localStorage.getItem(`lp.p.${id}.${k}`)).join('|');
  const before = now();
  await syncHere(3);
  return now() !== before;
}
const said = (out, fresh) => (out.errors.length ? out.errors[0].message : out.added ? `⌚ ${out.added} ${fresh ? '' : 'new '}workout${out.added === 1 ? '' : 's'}${fresh ? ' brought in' : ''}` : fresh ? '⌚ Connected — no workouts in the last two weeks' : '⌚ Up to date');

export async function onAct(act, t) {
  const { devices } = await D();
  if (act === 'devconnect') { location.href = devices.connectUrl('whoop', { back: 'family' }); return; }
  if (act === 'devsync') {
    const el = c.$('#devWhoop'); if (el) el.textContent = 'Syncing…';
    if (t) t.disabled = true;
    c.toast(said(await syncHere(), false));
  } else {
    const which = act === 'devoff' ? 'whoop' : 'strava';
    if (!confirm(`Disconnect ${which === 'whoop' ? 'WHOOP' : 'Strava'}? Workouts already brought in stay.`)) return;
    await devices.disconnect(which);
    c.toast('Disconnected');
  }
  await sheet();
  c.refresh();
}
// Back from WHOOP's sign-in page (#connect=…): check it started here, then bring in two weeks.
export async function back() {
  if (!/^#connect=/.test(location.hash)) return;
  if (!(await owner())) { history.replaceState(null, '', location.pathname); c.toast('WHOOP wasn\'t connected — open 💪 Health › Plan & weight once on this device, then connect again.'); return; }
  const { devices } = await D();
  const r = devices.takeRedirect();
  if (!r) return;
  if (r.error) { c.toast(r.error === 'denied' ? 'WHOOP wasn\'t connected — you said no on WHOOP\'s page' : r.error === 'state' ? 'WHOOP wasn\'t connected — that sign-in didn\'t start here. Try Connect again.' : 'WHOOP wasn\'t connected — something went wrong on WHOOP\'s side. Try again.'); return; }
  c.toast('⌚ WHOOP connected — bringing in your workouts…');
  const out = await syncHere(14).catch(() => null);
  c.toast(out ? said(out, true) : 'Connected. Workouts come in next time.');
  c.refresh();
}

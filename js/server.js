// 🔌 The connector both apps talk to. It has its own setting (fam.server), so the trackers'
// sharing settings can never re-point the family app. A phone that used another connector before
// 2.0 keeps it: copied once from the trackers' old sync settings (lp.g.sync).
export const CONNECTOR = 'https://lean-plate-connect.sandman-amani.workers.dev';

export function serverUrl(store = globalThis.localStorage) {
  const get = (k) => { try { return store.getItem(k); } catch { return null; } };
  let v = get('fam.server');
  if (!v) {
    let old = '';
    try { old = String(JSON.parse(get('lp.g.sync'))?.url || '').replace(/\/+$/, ''); } catch { /* none */ }
    v = /^(https:\/\/[a-z0-9.-]+|http:\/\/localhost(:\d+)?)$/i.test(old) && old !== CONNECTOR ? old : 'default';
    try { store.setItem('fam.server', v); } catch { /* blocked */ }
  }
  return v === 'default' ? CONNECTOR : v;
}

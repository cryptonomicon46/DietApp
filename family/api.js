// Talks to the family API: the connector (live, Google sign-in) or, for trying it out, the very
// same code running on this phone with storage that never leaves it (demo).
const CONNECTOR = 'https://lean-plate-connect.sandman-amani.workers.dev';
const LS = {
  get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
  set: (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* blocked */ } },
};
// The connector this phone already uses for sharing, if it has one.
const connectorUrl = () => { try { return JSON.parse(LS.get('lp.g.sync'))?.url || CONNECTOR; } catch { return CONNECTOR; } };

// A KV store over localStorage, for the demo.
const demoKv = {
  get: async (k) => LS.get(`fam.demo.${k}`),
  put: async (k, v) => LS.set(`fam.demo.${k}`, v),
  delete: async (k) => LS.set(`fam.demo.${k}`, null),
};
let demoApi = null;

export const api = {
  mode: () => LS.get('fam.mode') || 'live',
  setMode: (m) => LS.set('fam.mode', m),
  token: () => LS.get(`fam.token.${api.mode()}`),
  setToken: (t) => LS.set(`fam.token.${api.mode()}`, t),
  async call(method, path, body) {
    let status, data;
    if (api.mode() === 'demo') {
      demoApi ||= (await import('../server/family.js')).familyApi;
      const u = new URL(`https://demo.local${path}`);
      const req = new Request(u, { method, headers: api.token() ? { Authorization: `Bearer ${api.token()}` } : {}, body: body ? JSON.stringify(body) : undefined });
      ({ status, data } = await demoApi(req, { HOUSEHOLD: demoKv, DEMO: true }, u.pathname));
    } else {
      const res = await fetch(`${connectorUrl()}/v2${path}`, { method, headers: { 'Content-Type': 'application/json', ...(api.token() ? { Authorization: `Bearer ${api.token()}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
      status = res.status;
      data = await res.json().catch(() => ({}));
    }
    if (status === 401 && path !== '/auth/google') api.setToken(null);
    if (status >= 400) { const e = new Error(data.error || `error ${status}`); e.status = status; e.data = data; throw e; }
    return data;
  },
  // 📸 Photo files: PUT bytes up, GET bytes back (Uint8Array).
  async bytes(method, path, body) {
    let status, data, raw;
    if (api.mode() === 'demo') {
      demoApi ||= (await import('../server/family.js')).familyApi;
      const u = new URL(`https://demo.local${path}`);
      const req = new Request(u, { method, headers: api.token() ? { Authorization: `Bearer ${api.token()}` } : {}, body: body || undefined });
      ({ status, data, raw } = await demoApi(req, { HOUSEHOLD: demoKv, DEMO: true }, u.pathname));
    } else {
      const res = await fetch(`${connectorUrl()}/v2${path}`, { method, headers: { ...(body ? { 'Content-Type': 'application/octet-stream' } : {}), ...(api.token() ? { Authorization: `Bearer ${api.token()}` } : {}) }, body: body || undefined });
      status = res.status;
      if (res.ok && method === 'GET') raw = new Uint8Array(await res.arrayBuffer());
      else data = await res.json().catch(() => ({}));
    }
    if (status >= 400) { const e = new Error(data?.error || `error ${status}`); e.status = status; throw e; }
    return raw || data;
  },
  get: (p) => api.call('GET', p),
  post: (p, b = {}) => api.call('POST', p, b),
  put: (p, b) => api.call('PUT', p, b),
  patch: (p, b) => api.call('PATCH', p, b),
  del: (p, b) => api.call('DELETE', p, b),
  // Is the live connector updated for families? {ready, googleClientId} or {missing: true}.
  async liveConfig() {
    try {
      const res = await fetch(`${connectorUrl()}/v2/config`);
      if (res.status === 404) return { missing: true };
      return await res.json();
    } catch { return { missing: true, offline: true }; }
  },
};

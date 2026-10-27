// 💬 One family's chats, live: a Cloudflare Durable Object (SQLite-backed, on the free plan). It keeps
// the messages (sealed — it can't read them) and the open connections from phones looking at the
// app, so a message, a reaction, "typing…" and "read" reach the others the moment they happen.
// Connections sleep between messages (hibernation), so an idle chat costs nothing.
//
// Only the connector talks to it: worker.js passes signed-in requests from family.js (POST /op)
// and phones' live connections, which bring a one-time ticket the connector issued (/ws).

import { ChatCore, runOp } from './chat.js';

const TICKET_TTL = 60_000;

export class ChatHub {
  constructor(ctx, env) {
    this.ctx = ctx; this.env = env;
    this.core = new ChatCore({ get: (k) => ctx.storage.get(k), put: (k, v) => ctx.storage.put(k, v), delete: (k) => ctx.storage.delete(k) });
    // Keep-alives are answered without waking it up.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  sockets() { return this.ctx.getWebSockets().filter((ws) => ws.readyState === 1).map((ws) => ({ ws, a: ws.deserializeAttachment() || {} })); }
  online() { return [...new Set(this.sockets().map((x) => x.a.m).filter(Boolean))]; }
  send(ws, data) { try { ws.send(JSON.stringify(data)); } catch { /* gone */ } }
  // To everyone in the chat with it open on a phone (yourself included: your other phones).
  broadcast(event, to, { except = null } = {}) {
    for (const { ws, a } of this.sockets()) if (ws !== except && to.includes(a.m) && (a.chats || []).includes(event.chat)) this.send(ws, event);
  }
  announce() { const on = this.online(); for (const { ws } of this.sockets()) this.send(ws, { type: 'online', members: on }); }

  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/ws') return this.connect(req, url);
    if (url.pathname !== '/op' || req.method !== 'POST') return new Response('not found', { status: 404 });
    const { op, ...a } = await req.json();
    // Someone who's no longer a grown-up in the family loses their live connection straight away.
    if (Array.isArray(a.adults)) for (const { ws, a: att } of this.sockets()) if (!a.adults.includes(att.m)) ws.close(4003, 'not in the family chats');
    if (op === 'forget') for (const { ws, a: att } of this.sockets()) if (att.m === a.member) ws.close(4003, 'left the family');
    if (op === 'ticket') {
      const ticket = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('');
      await this.ctx.storage.put(`tk:${ticket}`, { m: a.me, chats: a.chats, exp: Date.now() + TICKET_TTL });
      return Response.json({ ticket });
    }
    if (op === 'wipe') { for (const { ws } of this.sockets()) ws.close(4004, 'family deleted'); await this.ctx.storage.deleteAll(); return Response.json({ ok: true }); }
    const { out, event, to } = await runOp(this.core, op, a);
    if (op === 'list') out.online = this.online();
    if (op === 'send' && event) {
      // Push notifications only for people not looking at this chat right now.
      const looking = new Set(this.sockets().filter((x) => x.a.v === a.chat.id).map((x) => x.a.m));
      out.notify = a.chat.with.filter((x) => !looking.has(x));
    }
    if (event) this.broadcast(event, to);
    return Response.json(out);
  }

  async connect(req, url) {
    if (req.headers.get('Upgrade') !== 'websocket') return new Response('expected a websocket', { status: 426 });
    const t = url.searchParams.get('t') || '';
    const pass = /^[a-f0-9]{36}$/.test(t) ? await this.ctx.storage.get(`tk:${t}`) : null;
    if (pass) await this.ctx.storage.delete(`tk:${t}`);
    if (!pass || pass.exp < Date.now()) return new Response('sign in again', { status: 401 });
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server, [pass.m]);
    server.serializeAttachment({ m: pass.m, chats: pass.chats, v: null, ty: 0 });
    this.announce();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws, raw) {
    if (typeof raw !== 'string' || raw.length > 500) return;
    let msg; try { msg = JSON.parse(raw); } catch { return; }
    const a = ws.deserializeAttachment() || {};
    const mine = (id) => id === null || (a.chats || []).includes(id);
    if (!mine(msg.chat ?? null)) return;
    const chat = msg.chat ? { id: msg.chat } : null;
    if (msg.type === 'view') { a.v = msg.chat || null; ws.serializeAttachment(a); return; }
    if (msg.type === 'typing' && chat) {
      if (Date.now() - (a.ty || 0) < 1500) return;
      a.ty = Date.now(); ws.serializeAttachment(a);
      for (const { ws: w, a: o } of this.sockets()) if (w !== ws && o.m !== a.m && (o.chats || []).includes(msg.chat)) this.send(w, { type: 'typing', chat: msg.chat, m: a.m });
      return;
    }
    if (msg.type === 'read' && chat) {
      const s = await this.core.read(chat, a.m, msg.s);
      if (s) for (const { ws: w, a: o } of this.sockets()) if ((o.chats || []).includes(msg.chat)) this.send(w, { type: 'read', chat: msg.chat, m: a.m, s });
    }
  }
  webSocketClose(ws) { try { ws.close(); } catch { /* closed */ } this.announce(); }
  webSocketError() { this.announce(); }
}

// Serves the repo the way GitHub Pages does (gzip, Cache-Control max-age=600, ETag → 304), at
// http://localhost:8098/DietApp/, for the performance budget (budget.mjs).
import http from 'node:http';
import { readFileSync, statSync, existsSync } from 'node:fs';
import zlib from 'node:zlib';
import { createHash } from 'node:crypto';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/\/$/, '');
const TYPES = { html: 'text/html; charset=utf-8', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json', ico: 'image/x-icon' };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.startsWith('/DietApp')) p = p.slice(8);
  let f = ROOT + p;
  if (existsSync(f) && statSync(f).isDirectory()) f += '/index.html';
  if (!f.startsWith(ROOT) || !existsSync(f)) { res.writeHead(404); return res.end('not found'); }
  const body = readFileSync(f), etag = `"${createHash('md5').update(body).digest('hex')}"`, ext = f.split('.').pop();
  if (req.headers['if-none-match'] === etag) { res.writeHead(304, { ETag: etag, 'Cache-Control': 'max-age=600' }); return res.end(); }
  const gz = /gzip/.test(req.headers['accept-encoding'] || '') && /^(html|js|css|json|svg|webmanifest)$/.test(ext);
  res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control': 'max-age=600', ETag: etag, ...(gz ? { 'Content-Encoding': 'gzip' } : {}) });
  res.end(gz ? zlib.gzipSync(body) : body);
}).listen(+process.env.PORT || 8098, () => console.log('pages on', +process.env.PORT || 8098));

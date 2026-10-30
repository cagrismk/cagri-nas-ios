import http from 'node:http';
import { Buffer } from 'node:buffer';
import { XMLParser } from 'fast-xml-parser';

const HOST = '127.0.0.1';
const PORT = 3001;
const NAS_URL = 'http://100.81.27.80:8102';
const ROOT = '/Dosyalar/';
const USERNAME = process.env.NAS_USER;
const PASSWORD = process.env.NAS_PASSWORD;
if (!USERNAME || !PASSWORD) {
  console.error('NAS_USER veya NAS_PASSWORD tanimlanmamis.');
  process.exit(1);
}
const auth = `Basic ${Buffer.from(`${USERNAME}:${PASSWORD}`, 'utf8').toString('base64')}`;
const parser = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true });
const list = (value) => value == null ? [] : Array.isArray(value) ? value : [value];
const mime = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp', avif: 'image/avif', mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', m4v: 'video/mp4' };
function safePath(p) {
  return typeof p === 'string' && p.startsWith(ROOT) && !p.includes('\\') && !p.includes('\0') &&
    !p.split('/').some(s => s === '.' || s === '..') &&
    !/%2f|%5c|%2e/i.test(p) && p.length < 4096;
}
function urlFor(p) {
  return `${NAS_URL}/${p.split('/').filter(Boolean).map(encodeURIComponent).join('/')}${p.endsWith('/') ? '/' : ''}`;
}
function sendJson(res, code, value) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(value));
}
http.createServer(async (req, res) => {
  let url;
  try { url = new URL(req.url || '/', 'http://localhost'); }
  catch { return sendJson(res, 400, { error: 'Gecersiz istek' }); }
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Sadece okuma izni var' });
  if (!['/api/files', '/api/media'].includes(url.pathname)) return sendJson(res, 404, { error: 'Bulunamadi' });
  const requested = url.searchParams.get('path') || (url.pathname === '/api/files' ? ROOT : '');
  if (!safePath(requested)) return sendJson(res, 400, { error: 'Gecersiz dosya yolu' });
  try {
    if (url.pathname === '/api/media') {
      if (requested.endsWith('/')) return sendJson(res, 400, { error: 'Klasor medya degil' });
      const ext = requested.split('.').pop()?.toLowerCase();
      if (!ext || !mime[ext]) return sendJson(res, 415, { error: 'Onizleme desteklenmiyor' });
      const headers = { Authorization: auth };
      if (req.headers.range) headers.Range = req.headers.range;
      const upstream = await fetch(urlFor(requested), { headers, signal: AbortSignal.timeout(30000) });
      if (![200, 206].includes(upstream.status)) return sendJson(res, 502, { error: `WebDAV medya HTTP ${upstream.status}` });
      const out = { 'Content-Type': mime[ext], 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes' };
      for (const h of ['content-range','content-length']) if (upstream.headers.has(h)) out[h] = upstream.headers.get(h);
      res.writeHead(upstream.status, out);
      if (!upstream.body) return res.end();
      const { Readable } = await import('node:stream');
      Readable.fromWeb(upstream.body).on('error', () => res.destroy()).pipe(res);
      return;
    }
    const path = requested.endsWith('/') ? requested : `${requested}/`;
    const upstream = await fetch(urlFor(path), { method: 'PROPFIND', headers: { Authorization: auth, Depth: '1' }, signal: AbortSignal.timeout(15000) });
    if (upstream.status !== 207) return sendJson(res, 502, { error: `WebDAV HTTP ${upstream.status}` });
    const doc = parser.parse(await upstream.text());
    const entries = list(doc?.multistatus?.response).map(entry => {
      if (typeof entry?.href !== 'string') return null;
      let entryPath;
      try { entryPath = decodeURIComponent(new URL(entry.href, NAS_URL).pathname); } catch { return null; }
      if (!safePath(entryPath) || entryPath.replace(/\/$/, '') === path.replace(/\/$/, '') || !entryPath.startsWith(path)) return null;
      const props = list(entry.propstat)[0]?.prop || {};
      return { name: String(props.displayname || entryPath.split('/').filter(Boolean).at(-1) || ''), path: entryPath, type: props.resourcetype?.collection !== undefined ? 'folder' : 'file', size: props.getcontentlength ? Number(props.getcontentlength) : null };
    }).filter(Boolean);
    return sendJson(res, 200, { path, entries });
  } catch (e) {
    console.error('NAS istek hatasi:', e?.message);
    if (!res.headersSent) sendJson(res, 502, { error: 'NAS baglantisi veya okuma hatasi' });
    else res.destroy();
  }
}).listen(PORT, HOST, () => console.log(`Cagri NAS API: http://${HOST}:${PORT}/api/files`));

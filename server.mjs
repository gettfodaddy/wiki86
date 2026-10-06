import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.WIKI86_DATA_DIR || path.join(root, '.wiki86-data'));
const dataFile = path.join(dataDir, 'manuals.json');
const port = Number(process.env.PORT || 8765);
const isProduction = process.env.NODE_ENV === 'production';
const adminPassword = process.env.WIKI86_ADMIN_PASSWORD || (isProduction ? '' : 'wiki86-preview');
const sessions = new Map();
const failedLogins = new Map();
const maxBodyBytes = 1_000_000;
const categories = new Set(['remnawave', 'protocols', 'cdn', 'security']);
const blockTypes = new Set(['heading', 'text', 'step', 'code', 'note', 'image', 'divider']);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };

if (!adminPassword) throw new Error('Set WIKI86_ADMIN_PASSWORD before starting in production.');
await mkdir(dataDir, { recursive: true });
try { await stat(dataFile); } catch { await writeFile(dataFile, '[]\n', { mode: 0o600 }); }

async function readManuals() {
  try { const list = JSON.parse(await readFile(dataFile, 'utf8')); return Array.isArray(list) ? list : []; }
  catch { return []; }
}
async function writeManuals(list) {
  const tmp = `${dataFile}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, dataFile);
}
function send(res, status, body, headers = {}) {
  res.writeHead(status, { 'Cache-Control': 'no-store', ...(typeof body === 'string' ? { 'Content-Type': 'text/plain; charset=utf-8' } : { 'Content-Type': 'application/json; charset=utf-8' }), ...headers });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}
function cookieValue(req, key) {
  return (req.headers.cookie || '').split(';').map((part) => part.trim()).find((part) => part.startsWith(`${key}=`))?.slice(key.length + 1) || '';
}
function isAuthenticated(req) {
  const token = cookieValue(req, 'wiki86_session');
  const expiry = sessions.get(token);
  if (!expiry || expiry < Date.now()) { sessions.delete(token); return false; }
  sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
  return true;
}
async function readBody(req) {
  let size = 0; const chunks = [];
  for await (const chunk of req) { size += chunk.length; if (size > maxBodyBytes) throw new Error('Request too large'); chunks.push(chunk); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}
function safeManual(input, previous = {}) {
  if (!input || typeof input !== 'object') throw new Error('Invalid page data');
  const title = String(input.title || '').trim().slice(0, 100);
  const category = String(input.category || '');
  const slug = String(input.slug || '').trim().toLowerCase();
  const description = String(input.description || '').trim().slice(0, 500);
  const status = input.status === 'published' ? 'published' : 'draft';
  if (!title || !categories.has(category) || slug.length > 60 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) throw new Error('Enter a title, valid category and URL slug (up to 60 characters).');
  if (!Array.isArray(input.blocks) || input.blocks.length > 150) throw new Error('Invalid block list.');
  const blocks = input.blocks.map((raw) => {
    if (!raw || !blockTypes.has(raw.type)) throw new Error('Unknown block type.');
    const block = { id: String(raw.id || randomUUID()).slice(0, 60), type: raw.type };
    for (const key of ['title', 'text', 'code', 'language', 'src', 'alt', 'level']) {
      if (raw[key] !== undefined) block[key] = String(raw[key]).slice(0, key === 'code' || key === 'text' ? 30000 : 500);
    }
    if (block.type === 'image' && block.src && !/^https:\/\//i.test(block.src)) throw new Error('Images must use HTTPS URLs.');
    return block;
  });
  return { id: previous.id || String(input.id || randomUUID()), title, category, slug, path: `/manual/${category}/${slug}`, description, status, blocks, createdAt: previous.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url || '/', 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (pathname === '/api/session' && req.method === 'GET') return send(res, 200, { authenticated: isAuthenticated(req), passwordConfigured: Boolean(adminPassword) });
    if (pathname === '/api/login' && req.method === 'POST') {
      const source = req.socket.remoteAddress || 'unknown'; const attempts = failedLogins.get(source) || { count: 0, blockedUntil: 0 };
      if (attempts.blockedUntil > Date.now()) return send(res, 429, { error: 'Слишком много попыток. Подожди 15 минут.' });
      const data = await readBody(req); const candidate = Buffer.from(String(data.password || '')); const expected = Buffer.from(adminPassword);
      if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
        attempts.count += 1; if (attempts.count >= 10) { attempts.count = 0; attempts.blockedUntil = Date.now() + 15 * 60 * 1000; }
        failedLogins.set(source, attempts); return send(res, 401, { error: 'Неверный пароль.' });
      }
      failedLogins.delete(source);
      for (const [session, expiry] of sessions) if (expiry < Date.now()) sessions.delete(session);
      const token = randomBytes(32).toString('hex'); sessions.set(token, Date.now() + 12 * 60 * 60 * 1000);
      return send(res, 200, { authenticated: true }, { 'Set-Cookie': `wiki86_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${isProduction ? '; Secure' : ''}` });
    }
    if (pathname === '/api/logout' && req.method === 'POST') { sessions.delete(cookieValue(req, 'wiki86_session')); return send(res, 200, { ok: true }, { 'Set-Cookie': 'wiki86_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' }); }
    if (pathname === '/api/manuals' && req.method === 'GET') {
      const list = await readManuals();
      if (url.searchParams.has('path')) return send(res, 200, list.find((item) => item.path === url.searchParams.get('path') && item.status === 'published') || null);
      return send(res, 200, list.filter((item) => item.status === 'published').map(({ id, title, category, slug, path: route, description }) => ({ id, title, category, slug, path: route, description })));
    }
    if (pathname.startsWith('/api/admin/')) {
      if (!isAuthenticated(req)) return send(res, 401, { error: 'Нужен вход администратора.' });
      if (pathname === '/api/admin/manuals' && req.method === 'GET') return send(res, 200, await readManuals());
      if (pathname === '/api/admin/manuals' && req.method === 'PUT') {
        const input = await readBody(req); const current = await readManuals();
        const old = input.id ? current.find((item) => item.id === input.id) : null;
        const manual = safeManual(input, old || {});
        if (current.some((item) => item.path === manual.path && item.id !== manual.id)) return send(res, 409, { error: 'Этот URL уже занят.' });
        const next = old ? current.map((item) => item.id === old.id ? manual : item) : [...current, manual];
        await writeManuals(next); return send(res, 200, manual);
      }
      const deleteMatch = pathname.match(/^\/api\/admin\/manuals\/([a-f0-9-]+)$/i);
      if (deleteMatch && req.method === 'DELETE') {
        const current = await readManuals(); const next = current.filter((item) => item.id !== deleteMatch[1]);
        if (next.length === current.length) return send(res, 404, { error: 'Страница не найдена.' });
        await writeManuals(next); return send(res, 200, { ok: true });
      }
      return send(res, 404, { error: 'API endpoint not found.' });
    }
    if (pathname.startsWith('/api/')) return send(res, 404, { error: 'API endpoint not found.' });
    const resolved = path.resolve(root, `.${pathname}`);
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return send(res, 403, 'Forbidden');
    if (resolved === dataDir || resolved.startsWith(`${dataDir}${path.sep}`)) return send(res, 404, 'Not found');
    let file = resolved;
    try { const info = await stat(file); if (info.isDirectory()) file = path.join(file, 'index.html'); await stat(file); }
    catch { file = path.join(root, 'index.html'); }
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    res.end(body);
  } catch (error) {
    send(res, error.message === 'Request too large' ? 413 : error instanceof SyntaxError ? 400 : 400, { error: error.message || 'Bad request.' });
  }
});
server.listen(port, process.env.HOST || '127.0.0.1', () => console.log(`wiki86 server listening on ${process.env.HOST || '127.0.0.1'}:${port}`));

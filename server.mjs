import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual, randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir, stat, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSelfstealManual } from './selfsteal-manual.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.WIKI86_DATA_DIR || path.join(root, '.wiki86-data'));
const dataFile = path.join(dataDir, 'manuals.json');
const navigationFile = path.join(dataDir, 'navigation.json');
const port = Number(process.env.PORT || 8765);
const isProduction = process.env.NODE_ENV === 'production';
const adminPassword = process.env.WIKI86_ADMIN_PASSWORD || (isProduction ? '' : 'wiki86-preview');
const sessions = new Map();
const failedLogins = new Map();
const maxBodyBytes = 1_000_000;
const defaultGroups = [{ id: 'manuals', title: 'МАНУАЛЫ', icon: 'book' }];
const defaultSectionColors = { remnawave: '#64e2c1', protocols: '#f3bd70', cdn: '#5bbdf2', security: '#ef88b7' };
const defaultNavigation = [
  { id: 'remnawave', groupId: 'manuals', title: 'Remnawave', icon: 'book', color: defaultSectionColors.remnawave, manualIds: [] },
  { id: 'protocols', groupId: 'manuals', title: 'Протоколы', icon: 'network', color: defaultSectionColors.protocols, manualIds: [] },
  { id: 'cdn', groupId: 'manuals', title: 'CDN', icon: 'cloud', color: defaultSectionColors.cdn, manualIds: [] },
  { id: 'security', groupId: 'manuals', title: 'Безопасность', icon: 'shield', color: defaultSectionColors.security, manualIds: [] }
];
const iconNames = new Set(['book','network','cloud','shield','globe','terminal','spark','heading','text','list','code','alert','image','panel']);
let categories = new Set(defaultNavigation.map((section) => section.id));
const blockTypes = new Set(['heading', 'text', 'step', 'accordion', 'tabs', 'code', 'note', 'data', 'image', 'table', 'divider']);
const stepItemTypes = new Set(['text', 'code', 'note', 'image', 'table', 'divider']);
const mime = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.svg':'image/svg+xml', '.json':'application/json; charset=utf-8', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp' };

if (!adminPassword) throw new Error('Set WIKI86_ADMIN_PASSWORD before starting in production.');
await mkdir(dataDir, { recursive: true });
try { await stat(dataFile); } catch { await writeFile(dataFile, '[]\n', { mode: 0o600 }); }
try { await stat(navigationFile); } catch { await writeFile(navigationFile, `${JSON.stringify({ groups: defaultGroups, sections: defaultNavigation }, null, 2)}\n`, { mode: 0o600 }); }

async function readManuals() {
  try { const list = JSON.parse(await readFile(dataFile, 'utf8')); return Array.isArray(list) ? list : []; }
  catch { return []; }
}
async function writeManuals(list) {
  const tmp = `${dataFile}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(list, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, dataFile);
}
async function readNavigation() {
  const saved = JSON.parse(await readFile(navigationFile, 'utf8'));
  const sections = Array.isArray(saved.sections) && saved.sections.length ? saved.sections : structuredClone(defaultNavigation);
  if (!Array.isArray(saved.groups) || !saved.groups.length) {
    const migrated = { groups: structuredClone(defaultGroups), sections: sections.map((section) => ({ ...section, groupId: 'manuals', color: /^#[\da-f]{6}$/i.test(section.color || '') ? section.color : defaultSectionColors[section.id] || defaultSectionColors.remnawave })) };
    await writeNavigation(migrated);
    return migrated;
  }
  const groups = saved.groups.map((group) => ({ id: String(group.id), title: String(group.title), icon: String(group.icon || 'book') }));
  const groupIds = new Set(groups.map((group) => group.id));
  return { groups, sections: sections.map((section) => ({ ...section, groupId: groupIds.has(section.groupId) ? section.groupId : groups[0].id, color: /^#[\da-f]{6}$/i.test(section.color || '') ? section.color : defaultSectionColors[section.id] || defaultSectionColors.remnawave })) };
}
async function writeNavigation(value) {
  const tmp = `${navigationFile}.${randomUUID()}.tmp`;
  await writeFile(tmp, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await rename(tmp, navigationFile);
}
const initialNavigation = await readNavigation();
categories = new Set(initialNavigation.sections.map((section) => section.id));
const selfstealSeedMarker = path.join(dataDir, '.selfsteal-seeded-v2');
try { await stat(selfstealSeedMarker); }
catch {
  const list = await readManuals();
  const existingIndex = list.findIndex((manual) => manual.category === 'protocols' && manual.slug === 'selfsteal' || manual.path === '/manual/selfsteal');
  const replacement = createSelfstealManual(existingIndex >= 0 ? list[existingIndex] : {});
  if (existingIndex >= 0) list[existingIndex] = replacement;
  else list.unshift(replacement);
  await writeManuals(list);
  await writeFile(selfstealSeedMarker, '1\n', { mode: 0o600 });
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
    for (const key of ['title', 'text', 'code', 'language', 'src', 'alt', 'level', 'variant', 'number', 'icon']) {
      if (raw[key] !== undefined) block[key] = String(raw[key]).slice(0, key === 'code' || key === 'text' ? 30000 : 500);
    }
    if (raw.type === 'step' && Array.isArray(raw.items)) {
      if (raw.items.length > 50) throw new Error('A step can contain at most 50 items.');
      block.items = raw.items.map((item) => {
        if (!item || !stepItemTypes.has(item.type)) throw new Error('Unsupported item inside a step.');
        const safe = { id: String(item.id || randomUUID()).slice(0, 60), type: item.type };
        for (const key of ['title', 'text', 'code', 'language', 'src', 'alt', 'variant']) if (item[key] !== undefined) safe[key] = String(item[key]).slice(0, key === 'text' || key === 'code' ? 30000 : 500);
        if (item.type === 'table') {
          if (!Array.isArray(item.headers) || item.headers.length < 1 || item.headers.length > 8 || !Array.isArray(item.rows) || item.rows.length > 40) throw new Error('Invalid table dimensions.');
          safe.headers = item.headers.map((cell) => String(cell || '').slice(0, 300));
          safe.rows = item.rows.map((row) => safe.headers.map((_, index) => String(row?.[index] || '').slice(0, 2000)));
        }
        if (item.type === 'image' && item.src && !(/^https:\/\//i.test(item.src) || /^\/assets\/[\w./-]+\.svg$/i.test(item.src) && !item.src.includes('..'))) throw new Error('Images must use HTTPS URLs or a local SVG from /assets/.');
        return safe;
      });
    }
    if (raw.type === 'table') {
      if (!Array.isArray(raw.headers) || raw.headers.length < 1 || raw.headers.length > 8 || !Array.isArray(raw.rows) || raw.rows.length > 40) throw new Error('Invalid table dimensions.');
      block.headers = raw.headers.map((cell) => String(cell || '').slice(0, 300));
      block.rows = raw.rows.map((row) => block.headers.map((_, index) => String(row?.[index] || '').slice(0, 2000)));
    }
    if (raw.collapsible !== undefined) block.collapsible = raw.collapsible !== false;
    if (block.type === 'tabs') {
      if (!Array.isArray(raw.tabs) || raw.tabs.length < 2 || raw.tabs.length > 6) throw new Error('A tabs block must contain between 2 and 6 tabs.');
      block.tabs = raw.tabs.map((tab) => ({ title: String(tab?.title || '').trim().slice(0, 80), language: String(tab?.language || 'TEXT').trim().slice(0, 40), text: String(tab?.text || '').slice(0, 12000), code: String(tab?.code || '').slice(0, 30000) }));
      if (block.tabs.some((tab) => !tab.title)) throw new Error('Every tab needs a title.');
    }
    if (block.type === 'data') {
      if (!Array.isArray(raw.fields) || raw.fields.length < 1 || raw.fields.length > 20) throw new Error('A data form must contain between 1 and 20 fields.');
      const seenKeys = new Set();
      block.fields = raw.fields.map((field) => {
        const key = String(field?.key || '').trim();
        if (!/^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(key) || seenKeys.has(key.toLowerCase())) throw new Error('Data field keys must be unique and use Latin letters, numbers and underscores.');
        seenKeys.add(key.toLowerCase());
        return { key, label: String(field.label || key).trim().slice(0, 80), placeholder: String(field.placeholder || '').slice(0, 160), help: String(field.help || '').slice(0, 240) };
      });
    }
    if (block.type === 'image' && block.src && !(/^https:\/\//i.test(block.src) || /^\/assets\/[\w./-]+\.svg$/i.test(block.src) && !block.src.includes('..'))) throw new Error('Images must use HTTPS URLs or a local SVG from /assets/.');
    return block;
  });
  if (blocks.filter((block) => block.type === 'data').length > 1) throw new Error('A manual can contain only one data form.');
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
      return send(res, 200, list.filter((item) => item.status === 'published').map(({ id, title, category, slug, path: route, description, status }) => ({ id, title, category, slug, path: route, description, status })));
    }
    if (pathname === '/api/navigation' && req.method === 'GET') return send(res, 200, await readNavigation());
    if (pathname.startsWith('/api/admin/')) {
      if (!isAuthenticated(req)) return send(res, 401, { error: 'Нужен вход администратора.' });
      if (pathname === '/api/admin/navigation' && req.method === 'GET') return send(res, 200, await readNavigation());
      if (pathname === '/api/admin/navigation' && req.method === 'PUT') {
        const input = await readBody(req);
        if (!Array.isArray(input.groups) || input.groups.length < 1 || input.groups.length > 20) throw new Error('Нужно оставить от 1 до 20 групп.');
        if (!Array.isArray(input.sections) || input.sections.length < 1 || input.sections.length > 100) throw new Error('Добавь хотя бы один подраздел и не больше 100.');
        const ids = new Set(); const groupTitles = new Set();
        const groups = input.groups.map((raw) => {
          const id = String(raw.id || '').trim(); const title = String(raw.title || '').trim().slice(0, 40); const icon = String(raw.icon || 'book');
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) throw new Error('Идентификаторы групп должны быть уникальными.');
          if (!title || groupTitles.has(title.toLocaleLowerCase('ru'))) throw new Error('Названия групп должны быть заполнены и не повторяться.');
          if (!iconNames.has(icon)) throw new Error('Выбрана неизвестная иконка группы.');
          ids.add(id); groupTitles.add(title.toLocaleLowerCase('ru')); return { id, title, icon };
        });
        const groupIds = new Set(groups.map((group) => group.id)); const sectionTitles = new Set();
        const sections = input.sections.map((raw) => {
          const id = String(raw.id || '').trim(); const title = String(raw.title || '').trim().slice(0, 40); const icon = String(raw.icon || 'book'); const color = String(raw.color || defaultSectionColors[id] || defaultSectionColors.remnawave);
          if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id) || ids.has(id)) throw new Error('Идентификаторы разделов должны быть уникальными.');
          const groupId = String(raw.groupId || ''); const normalizedTitle = `${groupId}:${title.toLocaleLowerCase('ru')}`;
          if (!title || sectionTitles.has(normalizedTitle) || !groupIds.has(groupId)) throw new Error('Укажи уникальное название подраздела и существующую группу.');
          if (!iconNames.has(icon)) throw new Error('Выбрана неизвестная иконка.');
          if (!/^#[\da-f]{6}$/i.test(color)) throw new Error('Цвет подраздела должен быть в формате HEX.');
          ids.add(id); sectionTitles.add(normalizedTitle);
          const manualIds = Array.isArray(raw.manualIds) ? [...new Set(raw.manualIds.map(String))].slice(0, 1000) : [];
          return { id, groupId, title, icon, color, manualIds };
        });
        const currentManuals = await readManuals(); const sectionIds = new Set(sections.map((section) => section.id));
        const orphan = currentManuals.find((manual) => !sectionIds.has(manual.category));
        if (orphan) throw new Error(`Сначала перенеси мануал «${orphan.title}» в другой раздел.`);
        for (const section of sections) section.manualIds = section.manualIds.filter((id) => currentManuals.some((manual) => manual.id === id && manual.category === section.id));
        const saved = { groups, sections }; await writeNavigation(saved); categories = sectionIds; return send(res, 200, saved);
      }
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

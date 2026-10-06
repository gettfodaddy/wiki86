const sidebar = document.querySelector('#sidebar');
const scrim = document.querySelector('#mobile-scrim');
const searchBox = document.querySelector('.search-box');
const searchInput = document.querySelector('#search');
const categories = { remnawave: 'Remnawave', protocols: 'Протоколы', cdn: 'CDN', security: 'Безопасность' };
const blockNames = { heading: 'Заголовок', text: 'Текст', step: 'Шаг инструкции', code: 'Команда / код', note: 'Примечание', image: 'Изображение', divider: 'Разделитель' };
const routeViews = { '/': document.querySelector('#welcome-view'), '/manual/selfsteal': document.querySelector('#selfsteal-view'), '/admin': document.querySelector('#admin-view') };
let manuals = [];
let currentManual = null;
let selectedBlockId = null;
let adminAuthenticated = false;

async function api(url, options = {}) {
  const response = await fetch(url, { credentials: 'same-origin', ...options, headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) { const error = new Error(data?.error || `Запрос не выполнен (${response.status})`); error.status = response.status; throw error; }
  return data;
}

document.querySelectorAll('.section-toggle').forEach((button) => button.addEventListener('click', () => {
  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', String(!expanded));
  button.nextElementSibling.hidden = expanded;
}));
function closeMobileSidebar() { sidebar.classList.remove('open'); scrim.classList.remove('show'); document.querySelector('#sidebar-toggle').setAttribute('aria-expanded', 'false'); }
document.querySelector('#sidebar-toggle').addEventListener('click', () => {
  const open = sidebar.classList.toggle('open'); scrim.classList.toggle('show', open); document.querySelector('#sidebar-toggle').setAttribute('aria-expanded', String(open));
});
scrim.addEventListener('click', closeMobileSidebar);
function normalizePath(path) { return path.length > 1 && path.endsWith('/') ? path.slice(0, -1) : path; }
function currentRoute() {
  if (location.protocol === 'file:') { const hash = location.hash.slice(1); if (hash === 'selfsteal' || hash === 'manual/selfsteal') return '/manual/selfsteal'; if (hash === 'admin') return '/admin'; if (hash.startsWith('manual/')) return `/${hash}`; return '/'; }
  return location.pathname;
}
function navigate(path) {
  if (location.protocol === 'file:') { location.hash = path === '/' ? 'home' : path.slice(1); renderRoute(path); return; }
  if (normalizePath(location.pathname) !== normalizePath(path)) history.pushState({}, '', path);
  renderRoute(path);
}
function openCategory(category) {
  const section = document.querySelector(`[data-section="${category}"]`);
  if (!section) return;
  section.querySelector('.section-toggle').setAttribute('aria-expanded', 'true');
  section.querySelector('.section-items').hidden = false;
}
function renderRoute(path, { scroll = true } = {}) {
  const currentPath = normalizePath(path);
  const custom = manuals.find((manual) => manual.path === currentPath && manual.status === 'published');
  const view = routeViews[currentPath] || (custom ? document.querySelector('#generated-manual-view') : document.querySelector('#not-found-view'));
  Object.values(routeViews).forEach((item) => { item.hidden = item !== view; });
  document.querySelector('#generated-manual-view').hidden = !custom;
  document.querySelector('#not-found-view').hidden = Boolean(routeViews[currentPath] || custom);
  document.querySelectorAll('.manual-link').forEach((link) => link.classList.toggle('active', link.dataset.route === currentPath));
  document.querySelector('.admin-link').classList.toggle('active', currentPath === '/admin');
  document.querySelector('#admin-login').hidden = currentPath !== '/admin' || adminAuthenticated;
  if (custom && !Array.isArray(custom.blocks)) {
    document.querySelector('#published-manual-content').replaceChildren(make('p', 'editor-no-blocks', 'Загружаем инструкцию…'));
    api(`/api/manuals?path=${encodeURIComponent(currentPath)}`).then((full) => {
      if (!full || normalizePath(location.pathname) !== currentPath) return;
      manuals = manuals.filter((item) => item.path !== full.path).concat(full);
      renderRoute(currentPath, { scroll: false });
    }).catch(() => {});
    document.title = `${custom.title} — wiki86`; openCategory(custom.category);
  } else if (custom) { renderPublishedManual(custom); document.title = `${custom.title} — wiki86`; openCategory(custom.category); }
  else if (currentPath === '/manual/selfsteal') { document.title = 'Self-steal — wiki86'; openCategory('protocols'); }
  else if (currentPath === '/') document.title = 'wiki86 — мануалы и настройки';
  else if (currentPath === '/admin') document.title = 'Конструктор страниц — wiki86';
  else document.title = 'Страница не найдена — wiki86';
  closeMobileSidebar();
  if (scroll) window.scrollTo({ top: 0, behavior: 'smooth' });
}
document.addEventListener('click', (event) => {
  const link = event.target.closest('[data-route]');
  if (!link || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  event.preventDefault(); navigate(link.dataset.route || link.getAttribute('href'));
});
document.querySelector('.brand').addEventListener('click', (event) => { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate('/'); } });
window.addEventListener('popstate', () => renderRoute(location.pathname));
window.addEventListener('hashchange', () => renderRoute(currentRoute()));

const userDataKey = 'wiki86-user-data-v1';
const dataFields = [...document.querySelectorAll('[data-value]')];
let storedUserData = {};
try { storedUserData = JSON.parse(localStorage.getItem(userDataKey) || '{}'); } catch { storedUserData = {}; }
dataFields.forEach((field) => { field.value = typeof storedUserData[field.dataset.value] === 'string' ? storedUserData[field.dataset.value] : ''; });
function updateDataPreview() {
  dataFields.forEach((field) => document.querySelectorAll(`[data-preview="${field.dataset.value}"]`).forEach((target) => { target.textContent = field.value.trim() || (field.dataset.value === 'nodeDomain' ? 'node.example.com' : field.dataset.value === 'email' ? 'mail@example.com' : '—'); }));
}
dataFields.forEach((field) => field.addEventListener('input', () => { storedUserData[field.dataset.value] = field.value; localStorage.setItem(userDataKey, JSON.stringify(storedUserData)); updateDataPreview(); document.querySelector('#save-indicator').classList.add('visible'); setTimeout(() => document.querySelector('#save-indicator').classList.remove('visible'), 1200); }));
document.querySelector('#clear-data').addEventListener('click', () => { localStorage.removeItem(userDataKey); dataFields.forEach((field) => { field.value = ''; }); storedUserData = {}; updateDataPreview(); });
updateDataPreview();

function renderManualLinks() {
  const sections = [...document.querySelectorAll('.nav-section')];
  sections.forEach((section) => {
    const category = section.dataset.section; const list = section.querySelector('.manual-list');
    list.querySelectorAll('[data-api-manual]').forEach((link) => link.remove());
    manuals.filter((manual) => manual.category === category && manual.status === 'published').forEach((manual) => {
      const link = document.createElement('a'); link.className = 'manual-link'; link.href = manual.path; link.dataset.route = manual.path; link.dataset.apiManual = 'true';
      const icon = document.createElement('span'); icon.className = 'item-icon'; const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add('icon'); const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', '#i-book'); svg.append(use); icon.append(svg);
      const title = document.createElement('span'); title.textContent = manual.title; const dot = document.createElement('i'); link.append(icon, title, dot); list.append(link);
    });
    section.querySelector('.section-count').textContent = String(list.querySelectorAll('.manual-link').length);
    section.querySelector('.empty-category').hidden = list.querySelectorAll('.manual-link').length > 0;
  });
}

function make(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function renderPublishedManual(manual) {
  const root = document.querySelector('#published-manual-content'); root.replaceChildren();
  const crumbs = document.querySelector('#generated-category-label'); crumbs.textContent = categories[manual.category].toLocaleUpperCase('ru');
  document.querySelector('#generated-slug-label').textContent = manual.title.toLocaleUpperCase('ru');
  const hero = make('header', 'published-manual-header');
  hero.append(make('p', 'eyebrow', `${categories[manual.category].toLocaleUpperCase('ru')} · ИНСТРУКЦИЯ`), make('h1', '', manual.title));
  if (manual.description) hero.append(make('p', 'published-description', manual.description));
  root.append(hero);
  const content = make('div', 'published-blocks');
  manual.blocks.forEach((block, index) => {
    let element;
    if (block.type === 'heading') { element = make(block.level === '3' ? 'h3' : 'h2', 'published-heading', block.title || 'Заголовок'); }
    else if (block.type === 'text') { element = make('p', 'published-text', block.text || ''); }
    else if (block.type === 'step') { element = make('section', 'published-step'); element.append(make('span', 'step-number', String(index + 1).padStart(2, '0')), make('div', '', '')); element.lastChild.append(make('h2', '', block.title || `Шаг ${index + 1}`), make('p', '', block.text || '')); }
    else if (block.type === 'code') { element = make('section', 'published-code'); const top = make('div', 'published-code-top'); top.append(make('span', '', block.language || 'TEXT')); const copy = make('button', 'copy-code', 'Копировать'); copy.type = 'button'; copy.addEventListener('click', async () => { await navigator.clipboard.writeText(block.code || ''); copy.textContent = 'Скопировано'; setTimeout(() => copy.textContent = 'Копировать', 1100); }); top.append(copy); const pre = make('pre'); pre.append(make('code', '', block.code || '')); element.append(top, pre); }
    else if (block.type === 'note') { element = make('aside', 'published-note'); element.append(make('strong', '', block.title || 'Примечание'), make('p', '', block.text || '')); }
    else if (block.type === 'image') { element = make('figure', 'published-image'); const img = document.createElement('img'); img.src = block.src || ''; img.alt = block.alt || ''; img.loading = 'lazy'; element.append(img); if (block.alt) element.append(make('figcaption', '', block.alt)); }
    else element = make('hr', 'published-divider');
    element.dataset.blockId = block.id; content.append(element);
  });
  root.append(content);
}

const loginOverlay = document.querySelector('#admin-login');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const adminView = document.querySelector('#admin-view');
const pageTitle = document.querySelector('#page-title');
const pageCategory = document.querySelector('#page-category');
const pageSlug = document.querySelector('#page-slug');
const pageDescription = document.querySelector('#page-description');
const editorCanvas = document.querySelector('#editor-canvas');
const blockProperties = document.querySelector('#block-properties');
const editorMessage = document.querySelector('#editor-message');
function defaultBlock(type) {
  const common = { id: crypto.randomUUID(), type };
  if (type === 'heading') return { ...common, title: 'Новый раздел', level: '2' };
  if (type === 'text') return { ...common, text: 'Добавьте пояснение к инструкции.' };
  if (type === 'step') return { ...common, title: 'Новый шаг', text: 'Опишите действие и ожидаемый результат.' };
  if (type === 'code') return { ...common, language: 'bash', code: 'команда' };
  if (type === 'note') return { ...common, title: 'Важно', text: 'Добавьте важное примечание.' };
  if (type === 'image') return { ...common, src: 'https://example.com/image.png', alt: 'Описание изображения' };
  return common;
}
function currentPageData() { return { id: currentManual?.id, title: pageTitle.value.trim(), category: pageCategory.value, slug: pageSlug.value.trim().toLowerCase(), description: pageDescription.value.trim(), status: currentManual?.status || 'draft', blocks: currentManual?.blocks || [] }; }
function refreshEditorCanvas() {
  const data = currentPageData(); editorCanvas.replaceChildren();
  const meta = make('div', 'canvas-page-meta'); meta.append(make('span', '', categories[data.category].toLocaleUpperCase('ru')), make('span', '', '·'), make('span', '', data.status === 'published' ? 'ОПУБЛИКОВАНО' : 'ЧЕРНОВИК'));
  const head = make('header', 'canvas-title-block'); head.append(make('div', '', '')); head.firstChild.append(make('small', '', 'ЗАГОЛОВОК МАНУАЛА'), make('h2', '', data.title || 'Название инструкции'), make('p', '', data.description || 'Краткое описание инструкции'));
  editorCanvas.append(meta, head);
  data.blocks.forEach((block, index) => {
    const card = make('article', `editor-block editor-block-${block.type}${selectedBlockId === block.id ? ' selected' : ''}`); card.dataset.blockId = block.id;
    const tools = make('div', 'editor-block-tools'); tools.append(make('span', 'editor-block-label', `${String(index + 1).padStart(2, '0')} · ${blockNames[block.type]}`));
    [['↑','up'],['↓','down'],['✎','edit'],['×','delete']].forEach(([label, action]) => { const button = make('button', 'block-action', label); button.type = 'button'; button.dataset.blockAction = action; button.title = action; tools.append(button); });
    card.append(tools);
    if (block.type === 'heading') card.append(make(block.level === '3' ? 'h3' : 'h2', '', block.title || 'Заголовок'));
    if (block.type === 'text') card.append(make('p', '', block.text || 'Текстовый блок'));
    if (block.type === 'step') { card.append(make('h3', '', block.title || `Шаг ${index + 1}`), make('p', '', block.text || 'Описание шага')); }
    if (block.type === 'code') { card.append(make('small', 'code-language', block.language || 'TEXT')); const pre = make('pre'); pre.append(make('code', '', block.code || '')); card.append(pre); }
    if (block.type === 'note') card.append(make('strong', '', block.title || 'Примечание'), make('p', '', block.text || ''));
    if (block.type === 'image') { const img = document.createElement('img'); img.src = block.src || ''; img.alt = block.alt || ''; img.className = 'editor-image-preview'; card.append(img, make('p', '', block.alt || 'Изображение')); }
    if (block.type === 'divider') card.append(make('hr'));
    card.addEventListener('click', (event) => { if (event.target.closest('button')) return; selectedBlockId = block.id; renderBlockInspector(); refreshEditorCanvas(); });
    editorCanvas.append(card);
  });
  if (!data.blocks.length) { const empty = make('p', 'editor-no-blocks', 'Нажми на тип блока слева, чтобы начать собирать инструкцию.'); editorCanvas.append(empty); }
  const path = data.slug && data.category ? `/manual/${data.category}/${data.slug}` : 'URL появится после заполнения раздела и slug';
  document.querySelector('#editor-url').textContent = path.startsWith('/') ? `${location.origin}${path}` : path;
  document.querySelector('#delete-manual').hidden = !currentManual?.id;
  document.querySelector('#manual-picker').value = currentManual?.id || '';
}
function inputControl(labelText, key, value, { multiline = false, placeholder = '' } = {}) {
  const label = make('label', 'inspector-field', labelText); const field = document.createElement(multiline ? 'textarea' : 'input'); field.dataset.blockField = key; field.value = value || ''; field.placeholder = placeholder;
  if (!multiline) field.type = 'text'; label.append(field); return label;
}
function renderBlockInspector() {
  blockProperties.replaceChildren(); const block = currentManual?.blocks.find((item) => item.id === selectedBlockId);
  if (!block) { blockProperties.hidden = true; document.querySelector('#page-properties').hidden = false; return; }
  blockProperties.hidden = false; document.querySelector('#page-properties').hidden = true;
  const heading = make('div', 'inspector-heading'); heading.append(make('span', 'block-icon heading-icon', '✦')); const titles = make('div'); titles.append(make('small', '', 'РЕДАКТИРОВАНИЕ БЛОКА'), make('strong', '', blockNames[block.type])); heading.append(titles); blockProperties.append(heading);
  if (block.type === 'heading' || block.type === 'step' || block.type === 'note') blockProperties.append(inputControl(block.type === 'note' ? 'Заголовок примечания' : 'Заголовок', 'title', block.title));
  if (block.type === 'text' || block.type === 'step' || block.type === 'note') blockProperties.append(inputControl('Текст', 'text', block.text, { multiline: true, placeholder: 'Введите текст' }));
  if (block.type === 'heading') { const selectLabel = make('label', 'inspector-field', 'Уровень заголовка'); const select = document.createElement('select'); select.dataset.blockField = 'level'; [['2','H2'],['3','H3']].forEach(([value,label]) => { const opt = document.createElement('option'); opt.value = value; opt.textContent = label; select.append(opt); }); select.value = block.level || '2'; selectLabel.append(select); blockProperties.append(selectLabel); }
  if (block.type === 'code') { blockProperties.append(inputControl('Язык блока', 'language', block.language, { placeholder: 'bash' }), inputControl('Команды и код', 'code', block.code, { multiline: true })); }
  if (block.type === 'image') blockProperties.append(inputControl('HTTPS-ссылка на изображение', 'src', block.src), inputControl('Alt-текст', 'alt', block.alt));
  blockProperties.querySelectorAll('[data-block-field]').forEach((field) => field.addEventListener('input', () => { block[field.dataset.blockField] = field.value; refreshEditorCanvas(); }));
}
function resetEditor() {
  currentManual = null; selectedBlockId = null; pageTitle.value = ''; pageCategory.value = 'cdn'; pageSlug.value = ''; pageSlug.dataset.edited = ''; pageDescription.value = ''; document.querySelector('#manual-picker').value = ''; renderBlockInspector(); refreshEditorCanvas(); setEditorMessage('Новая страница. Заполни поля и добавь блоки.', '');
}
function setEditorMessage(message, kind = 'success') { editorMessage.textContent = message; editorMessage.dataset.kind = kind; }
function hydrateEditor(manual) {
  currentManual = structuredClone(manual); selectedBlockId = null; pageTitle.value = manual.title; pageCategory.value = manual.category; pageSlug.value = manual.slug; pageSlug.dataset.edited = 'true'; pageDescription.value = manual.description || ''; renderBlockInspector(); refreshEditorCanvas(); setEditorMessage(manual.status === 'published' ? 'Опубликовано. Сохранение обновит страницу на сайте.' : 'Черновик загружен.');
}
function renderPicker() {
  const picker = document.querySelector('#manual-picker'); picker.replaceChildren();
  const fresh = document.createElement('option'); fresh.value = ''; fresh.textContent = 'Новая инструкция'; picker.append(fresh);
  manuals.forEach((manual) => { const option = document.createElement('option'); option.value = manual.id; option.textContent = `${manual.title} · ${manual.status === 'published' ? 'опубликовано' : 'черновик'}`; picker.append(option); });
  if (currentManual?.id) picker.value = currentManual.id;
}
async function loadAdminManuals() { manuals = await api('/api/admin/manuals'); renderPicker(); renderManualLinks(); }
async function migrateBrowserDrafts() {
  let legacy = [];
  try { legacy = JSON.parse(localStorage.getItem('wiki86-manuals-v1') || '[]'); } catch { return; }
  if (!Array.isArray(legacy) || !legacy.length) return;
  for (const old of legacy) {
    if (!old?.title || !categories[old.category] || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(old.slug || '')) continue;
    const path = `/manual/${old.category}/${old.slug}`;
    if (manuals.some((manual) => manual.path === path)) continue;
    const draft = await api('/api/admin/manuals', { method: 'PUT', body: JSON.stringify({ title: old.title, category: old.category, slug: old.slug, description: '', status: 'draft', blocks: [] }) });
    manuals.push(draft);
  }
  localStorage.removeItem('wiki86-manuals-v1');
}
async function activateAdmin() {
  const session = await api('/api/session'); adminAuthenticated = session.authenticated;
  loginOverlay.hidden = adminAuthenticated; if (!adminAuthenticated) return;
  await loadAdminManuals();
  await migrateBrowserDrafts();
  renderPicker();
  if (currentManual?.id) hydrateEditor(manuals.find((manual) => manual.id === currentManual.id) || manuals[0]);
  else if (manuals.length) hydrateEditor(manuals[0]);
  else resetEditor();
}
loginForm.addEventListener('submit', async (event) => {
  event.preventDefault(); loginError.hidden = true;
  try { await api('/api/login', { method: 'POST', body: JSON.stringify({ password: document.querySelector('#admin-password').value }) }); adminAuthenticated = true; loginOverlay.hidden = true; await activateAdmin(); }
  catch (error) { loginError.textContent = error.message; loginError.hidden = false; }
});
document.querySelector('#logout-button').addEventListener('click', async () => { await api('/api/logout', { method: 'POST' }); adminAuthenticated = false; renderRoute('/admin'); });
document.querySelector('#manual-picker').addEventListener('change', (event) => { if (!event.target.value) resetEditor(); else { const manual = manuals.find((item) => item.id === event.target.value); if (manual) hydrateEditor(manual); } });
document.querySelector('#page-properties').addEventListener('input', () => { const slug = pageSlug.value.trim().toLowerCase(); pageSlug.value = slug; refreshEditorCanvas(); });
pageTitle.addEventListener('input', () => { if (!pageSlug.dataset.edited) pageSlug.value = pageTitle.value.toLowerCase().replace(/[а-яё]/g, (char) => ({'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'}[char])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); refreshEditorCanvas(); });
pageSlug.addEventListener('input', () => { pageSlug.dataset.edited = 'true'; });
document.querySelector('#page-category').addEventListener('change', refreshEditorCanvas);
document.querySelectorAll('[data-add-block]').forEach((button) => button.addEventListener('click', () => {
  if (!currentManual) currentManual = { id: null, title: pageTitle.value.trim(), category: pageCategory.value, slug: pageSlug.value.trim(), description: pageDescription.value.trim(), status: 'draft', blocks: [] };
  const block = defaultBlock(button.dataset.addBlock); currentManual.blocks.push(block); selectedBlockId = block.id; renderBlockInspector(); refreshEditorCanvas(); setEditorMessage(`${blockNames[block.type]} добавлен. Не забудь сохранить.`);
}));
editorCanvas.addEventListener('click', (event) => {
  const actionButton = event.target.closest('[data-block-action]'); if (!actionButton) return;
  const card = actionButton.closest('[data-block-id]'); const index = currentManual?.blocks.findIndex((block) => block.id === card.dataset.blockId); if (index < 0) return;
  const action = actionButton.dataset.blockAction;
  if (action === 'delete') { currentManual.blocks.splice(index, 1); selectedBlockId = null; }
  else if (action === 'up' && index > 0) [currentManual.blocks[index - 1], currentManual.blocks[index]] = [currentManual.blocks[index], currentManual.blocks[index - 1]];
  else if (action === 'down' && index < currentManual.blocks.length - 1) [currentManual.blocks[index + 1], currentManual.blocks[index]] = [currentManual.blocks[index], currentManual.blocks[index + 1]];
  else { selectedBlockId = card.dataset.blockId; }
  renderBlockInspector(); refreshEditorCanvas();
});
async function saveManual(status) {
  const payload = currentPageData(); payload.status = status;
  if (!payload.title || !payload.slug) return setEditorMessage('Заполни название и URL-slug.', 'error');
  try {
    const saved = await api('/api/admin/manuals', { method: 'PUT', body: JSON.stringify(payload) });
    const ix = manuals.findIndex((item) => item.id === saved.id); if (ix < 0) manuals.push(saved); else manuals[ix] = saved;
    hydrateEditor(saved); renderPicker(); renderManualLinks();
    setEditorMessage(status === 'published' ? 'Инструкция опубликована и доступна посетителям.' : 'Черновик сохранён на сервере.');
    if (status === 'published') { const select = document.querySelector('#manual-picker'); select.value = saved.id; }
  } catch (error) { setEditorMessage(error.message, 'error'); }
}
document.querySelector('#save-draft').addEventListener('click', () => saveManual(currentManual?.status === 'published' ? 'published' : 'draft'));
document.querySelector('#publish-manual').addEventListener('click', () => saveManual('published'));
document.querySelector('#delete-manual').addEventListener('click', async () => {
  if (!currentManual?.id || !window.confirm(`Удалить «${currentManual.title}»?`)) return;
  try { await api(`/api/admin/manuals/${currentManual.id}`, { method: 'DELETE' }); manuals = manuals.filter((manual) => manual.id !== currentManual.id); renderPicker(); renderManualLinks(); resetEditor(); setEditorMessage('Инструкция удалена.'); }
  catch (error) { setEditorMessage(error.message, 'error'); }
});

function filterManuals(query) {
  const normalized = query.trim().toLocaleLowerCase('ru');
  document.querySelectorAll('.nav-section').forEach((section) => {
    const links = [...section.querySelectorAll('.manual-link')]; const sectionName = section.querySelector('.section-name').textContent.toLocaleLowerCase('ru'); let count = 0;
    links.forEach((link) => { const visible = !normalized || link.textContent.toLocaleLowerCase('ru').includes(normalized) || sectionName.includes(normalized); link.hidden = !visible; if (visible) count++; });
    section.hidden = Boolean(normalized) && !sectionName.includes(normalized) && count === 0;
    if (normalized && count) { section.querySelector('.section-toggle').setAttribute('aria-expanded', 'true'); section.querySelector('.section-items').hidden = false; }
  });
}
searchInput.addEventListener('input', () => filterManuals(searchInput.value));
searchInput.addEventListener('focus', () => searchBox.classList.add('open'));
searchInput.addEventListener('blur', () => { if (!searchInput.value && window.innerWidth <= 680) searchBox.classList.remove('open'); });
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchBox.classList.add('open'); searchInput.focus(); } if (event.key === 'Escape') { searchInput.value = ''; filterManuals(''); searchInput.blur(); closeMobileSidebar(); } });

async function init() {
  try {
    manuals = await api('/api/manuals'); renderManualLinks();
    const path = currentRoute();
    if (path.startsWith('/manual/') && path !== '/manual/selfsteal') {
      const manual = await api(`/api/manuals?path=${encodeURIComponent(path)}`);
      if (manual) { manuals = manuals.filter((item) => item.path !== manual.path).concat(manual); }
    }
  } catch (error) { console.error('wiki86 startup failed', error); }
  renderRoute(currentRoute(), { scroll: false });
  if (currentRoute() === '/admin') activateAdmin().catch((error) => setEditorMessage(error.message, 'error'));
}
window.addEventListener('popstate', () => { renderRoute(location.pathname); if (location.pathname === '/admin' && !adminAuthenticated) activateAdmin().catch(() => {}); });
window.addEventListener('hashchange', () => renderRoute(currentRoute()));
init();

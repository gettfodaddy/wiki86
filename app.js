const sidebar = document.querySelector('#sidebar');
const scrim = document.querySelector('#mobile-scrim');
const searchBox = document.querySelector('.search-box');
const searchInput = document.querySelector('#search');
const defaultSections = [
  { id: 'remnawave', title: 'Remnawave', icon: 'book', manualIds: [] },
  { id: 'protocols', title: 'Протоколы', icon: 'network', manualIds: [] },
  { id: 'cdn', title: 'CDN', icon: 'cloud', manualIds: [] },
  { id: 'security', title: 'Безопасность', icon: 'shield', manualIds: [] }
];
const iconChoices = [['book','Книга'],['network','Сеть'],['cloud','Облако'],['shield','Щит'],['globe','Глобус'],['terminal','Терминал'],['spark','Искра'],['heading','Заголовок'],['text','Текст'],['list','Список'],['code','Код'],['alert','Внимание'],['image','Изображение'],['panel','Панель'],['chevron','Стрелка']];
let navigationSections = structuredClone(defaultSections);
let categories = Object.fromEntries(navigationSections.map((section) => [section.id, section.title]));
const openSections = new Set();
const blockNames = { heading: 'Заголовок', text: 'Текст', step: 'Шаг инструкции', code: 'Команда / код', note: 'Примечание', image: 'Изображение', divider: 'Разделитель' };
const routeViews = { '/': document.querySelector('#welcome-view'), '/admin': document.querySelector('#admin-view') };
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

function closeMobileSidebar() { sidebar.classList.remove('open'); scrim.classList.remove('show'); document.querySelector('#sidebar-toggle').setAttribute('aria-expanded', 'false'); }
function isMobileLayout() { return window.matchMedia('(max-width: 680px)').matches; }
document.body.classList.remove('sidebar-compact');
localStorage.removeItem('wiki86-sidebar-compact-v1');
document.querySelector('#sidebar-toggle').addEventListener('click', () => {
  if (isMobileLayout()) { const open = sidebar.classList.toggle('open'); scrim.classList.toggle('show', open); document.querySelector('#sidebar-toggle').setAttribute('aria-expanded', String(open)); }
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
  const section = document.querySelector(`[data-section="${CSS.escape(category)}"]`);
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
let storedUserData = {};
try { storedUserData = JSON.parse(localStorage.getItem(userDataKey) || '{}'); } catch { storedUserData = {}; }
function updateDataPreview(root = document) {
  root.querySelectorAll('[data-value]').forEach((field) => { field.value = typeof storedUserData[field.dataset.value] === 'string' ? storedUserData[field.dataset.value] : ''; });
  root.querySelectorAll('[data-preview]').forEach((target) => { const key = target.dataset.preview; target.textContent = storedUserData[key]?.trim() || (key === 'nodeDomain' ? 'node.example.com' : key === 'email' ? 'mail@example.com' : '—'); });
}
document.addEventListener('input', (event) => {
  const field = event.target.closest('[data-value]'); if (!field) return;
  storedUserData[field.dataset.value] = field.value; localStorage.setItem(userDataKey, JSON.stringify(storedUserData));
  const panel = field.closest('.user-data'); panel?.querySelector('.save-indicator')?.classList.add('visible');
  setTimeout(() => panel?.querySelector('.save-indicator')?.classList.remove('visible'), 1200);
  updateDataPreview(field.closest('#published-manual-content') || document);
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-clear-data]')) return;
  localStorage.removeItem(userDataKey); storedUserData = {};
  document.querySelectorAll('[data-value]').forEach((field) => { field.value = ''; }); updateDataPreview();
});

function iconElement(name, className = 'icon') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add(...className.split(' '));
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#i-${iconChoices.some(([key]) => key === name) ? name : 'book'}`); svg.append(use); return svg;
}
function sortedSectionManuals(section, { publishedOnly = true } = {}) {
  const rows = manuals.filter((manual) => manual.category === section.id && (!publishedOnly || manual.status === 'published'));
  const rank = new Map((section.manualIds || []).map((id, index) => [id, index]));
  return rows.sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6) || a.title.localeCompare(b.title, 'ru'));
}
function renderManualLinks() {
  const nav = document.querySelector('#manual-nav'); nav.replaceChildren(); categories = Object.fromEntries(navigationSections.map((section) => [section.id, section.title]));
  navigationSections.forEach((data, sectionIndex) => {
    const section = make('section', `nav-section section-${['remna','protocols','cdn','security'][sectionIndex % 4]}`); section.dataset.section = data.id;
    const toggle = make('button', 'section-toggle'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', String(openSections.has(data.id)));
    const icon = make('span', 'section-icon'); icon.append(iconElement(data.icon)); const name = make('span', 'section-name', data.title);
    const rows = sortedSectionManuals(data); const count = make('span', 'section-count', String(rows.length)); const chevron = iconElement('chevron', 'icon chevron');
    toggle.append(icon, name, count, chevron); toggle.title = data.title;
    const items = make('div', 'section-items'); items.hidden = !openSections.has(data.id);
    const list = make('div', 'manual-list');
    rows.forEach((manual) => {
      const link = document.createElement('a'); link.className = 'manual-link'; link.href = manual.path; link.dataset.route = manual.path; link.title = manual.title;
      const badge = make('span', 'item-icon'); badge.append(iconElement(manual.path === '/manual/selfsteal' ? 'globe' : 'book'));
      link.append(badge, make('span', '', manual.title), make('i')); list.append(link);
    });
    const empty = make('p', 'empty-category', 'Мануалы скоро появятся'); empty.hidden = rows.length > 0;
    items.append(list, empty); section.append(toggle, items); nav.append(section);
  });
  renderSidebarManager();
}
document.querySelector('#manual-nav').addEventListener('click', (event) => {
  const toggle = event.target.closest('.section-toggle'); if (!toggle) return;
  const section = toggle.closest('.nav-section'); const id = section.dataset.section; const expanded = openSections.has(id);
  if (expanded) openSections.delete(id); else openSections.add(id);
  toggle.setAttribute('aria-expanded', String(!expanded)); section.querySelector('.section-items').hidden = expanded;
});

function make(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function renderPublishedManual(manual) {
  const root = document.querySelector('#published-manual-content'); root.replaceChildren();
  const crumbs = document.querySelector('#generated-category-label'); crumbs.textContent = categories[manual.category].toLocaleUpperCase('ru');
  document.querySelector('#generated-slug-label').textContent = manual.title.toLocaleUpperCase('ru');
  const hero = make('header', 'published-manual-header');
  hero.append(make('p', 'eyebrow', `${categories[manual.category].toLocaleUpperCase('ru')} · ИНСТРУКЦИЯ`), make('h1', '', manual.title));
  if (manual.description) hero.append(make('p', 'published-description', manual.description));
  root.append(hero);
  if (manual.path === '/manual/selfsteal') { const template = document.querySelector('#selfsteal-data-template'); const dataPanel = template.content.cloneNode(true); root.append(dataPanel); updateDataPreview(root); }
  const content = make('div', 'published-blocks');
  manual.blocks.forEach((block, index) => {
    let element;
    if (block.type === 'heading') { element = make(block.level === '3' ? 'h3' : 'h2', 'published-heading', block.title || 'Заголовок'); }
    else if (block.type === 'text') { element = make('p', 'published-text', block.text || ''); }
    else if (block.type === 'step') { element = make('section', 'published-step'); element.append(make('span', 'step-number', String(index + 1).padStart(2, '0')), make('div', '', '')); element.lastChild.append(make('h2', '', block.title || `Шаг ${index + 1}`), make('p', '', block.text || '')); }
    else if (block.type === 'code') { element = make('section', 'published-code'); const top = make('div', 'published-code-top'); top.append(make('span', '', block.language || 'TEXT')); const copy = make('button', 'copy-code', ''); copy.type = 'button'; copy.title = 'Скопировать код'; copy.setAttribute('aria-label', 'Скопировать код'); copy.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-copy"></use></svg><span class="copy-feedback">Скопировано</span>'; copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(block.code || ''); } catch { const range = document.createRange(); range.selectNodeContents(element.querySelector('code')); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('copy'); selection.removeAllRanges(); } copy.classList.add('copied'); setTimeout(() => copy.classList.remove('copied'), 1200); }); top.append(copy); const pre = make('pre'); pre.append(make('code', '', block.code || '')); element.append(top, pre); }
    else if (block.type === 'note') { element = make('aside', `published-note note-${block.variant || 'warning'}`); element.append(make('span', 'note-mark', block.variant === 'success' ? '✓' : block.variant === 'info' ? 'i' : '!'), make('div', 'note-content', '')); element.lastChild.append(make('strong', '', block.title || 'Примечание'), make('p', '', block.text || '')); }
    else if (block.type === 'image') { element = make('figure', 'published-image'); const src = /^https:\/\//i.test(block.src || '') && !/example\.com/i.test(block.src) ? block.src : ''; if (src) { const img = document.createElement('img'); img.src = src; img.alt = block.alt || ''; img.loading = 'lazy'; element.append(img); } else element.append(make('div', 'image-placeholder', 'Добавьте HTTPS-ссылку на изображение в редакторе')); if (block.alt) element.append(make('figcaption', '', block.alt)); }
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
  if (type === 'note') return { ...common, title: 'Важно', text: 'Добавьте важное примечание.', variant: 'warning' };
  if (type === 'image') return { ...common, src: '', alt: 'Описание изображения' };
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
    [['up','<path d="m6 14 6-6 6 6"/>'],['down','<path d="m6 10 6 6 6-6"/>'],['edit','<path d="m14 5 5 5M4 20l4.2-.9L19 8.3 15.7 5 4.9 15.8 4 20Z"/>'],['delete','<path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/>']].forEach(([action, path]) => { const button = make('button', 'block-action', ''); button.type = 'button'; button.dataset.blockAction = action; button.title = ({up:'Переместить выше',down:'Переместить ниже',edit:'Редактировать',delete:'Удалить'})[action]; button.setAttribute('aria-label', button.title); button.innerHTML = `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${path}</svg>`; button.disabled = (action === 'up' && index === 0) || (action === 'down' && index === data.blocks.length - 1); tools.append(button); });
    card.append(tools);
    if (block.type === 'heading') card.append(make(block.level === '3' ? 'h3' : 'h2', '', block.title || 'Заголовок'));
    if (block.type === 'text') card.append(make('p', '', block.text || 'Текстовый блок'));
    if (block.type === 'step') { card.append(make('h3', '', block.title || `Шаг ${index + 1}`), make('p', '', block.text || 'Описание шага')); }
    if (block.type === 'code') { card.append(make('small', 'code-language', block.language || 'TEXT')); const pre = make('pre'); pre.append(make('code', '', block.code || '')); card.append(pre); }
    if (block.type === 'note') card.append(make('strong', '', block.title || 'Примечание'), make('p', '', block.text || ''));
    if (block.type === 'image') { if (/^https:\/\//i.test(block.src || '') && !/example\.com/i.test(block.src)) { const img = document.createElement('img'); img.src = block.src; img.alt = block.alt || ''; img.className = 'editor-image-preview'; card.append(img); } else card.append(make('div', 'image-placeholder', 'Вставь HTTPS-ссылку на изображение в свойствах блока')); card.append(make('p', '', block.alt || 'Изображение')); }
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
  if (block.type === 'note') { const label = make('label', 'inspector-field', 'Вид примечания'); const select = document.createElement('select'); select.dataset.blockField = 'variant'; [['warning','Важно'],['info','Информация'],['success','Успех']].forEach(([value,title]) => { const option = document.createElement('option'); option.value=value; option.textContent=title; select.append(option); }); select.value=block.variant||'warning'; label.append(select); blockProperties.append(label); }
  blockProperties.querySelectorAll('[data-block-field]').forEach((field) => { const update = () => { block[field.dataset.blockField] = field.value; refreshEditorCanvas(); }; field.addEventListener('input', update); field.addEventListener('change', update); });
}
function resetEditor() {
  currentManual = null; selectedBlockId = null; pageTitle.value = ''; pageCategory.value = navigationSections.some((item) => item.id === 'cdn') ? 'cdn' : navigationSections[0]?.id || ''; pageSlug.value = ''; pageSlug.dataset.edited = ''; pageDescription.value = ''; document.querySelector('#manual-picker').value = ''; renderCategoryOptions(pageCategory.value); renderBlockInspector(); refreshEditorCanvas(); setEditorMessage('Новая страница. Заполни поля и добавь блоки.', '');
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
function fillIconOptions(select, selected = 'book') {
  select.replaceChildren();
  iconChoices.filter(([id]) => id !== 'chevron').forEach(([id, label]) => { const option = document.createElement('option'); option.value = id; option.textContent = label; select.append(option); });
  select.value = selected;
}
function renderCategoryOptions(selected = pageCategory.value) {
  pageCategory.replaceChildren();
  navigationSections.forEach((section) => { const option = document.createElement('option'); option.value = section.id; option.textContent = section.title; pageCategory.append(option); });
  pageCategory.value = navigationSections.some((section) => section.id === selected) ? selected : navigationSections[0]?.id || '';
}
function renderSidebarManager() {
  const root = document.querySelector('#sidebar-manager-sections'); if (!root) return;
  root.replaceChildren();
  navigationSections.forEach((section, sectionIndex) => {
    const card = make('section', 'manager-section'); card.dataset.sectionId = section.id;
    const heading = make('div', 'manager-section-heading'); heading.append(make('span', 'manager-order', String(sectionIndex + 1).padStart(2, '0')), make('strong', '', section.title));
    [['↑','up'],['↓','down']].forEach(([label, direction]) => { const button = make('button', 'manager-move', label); button.type = 'button'; button.title = `${direction === 'up' ? 'Выше' : 'Ниже'}`; button.dataset.moveSection = direction; button.disabled = (direction === 'up' && sectionIndex === 0) || (direction === 'down' && sectionIndex === navigationSections.length - 1); heading.append(button); });
    const remove = make('button', 'manager-remove', 'Удалить'); remove.type = 'button'; remove.dataset.deleteSection = ''; remove.disabled = navigationSections.length === 1 || manuals.some((manual) => manual.category === section.id); remove.title = remove.disabled ? 'Сначала перемести мануалы из раздела' : 'Удалить пустой раздел'; heading.append(remove); card.append(heading);
    const fields = make('div', 'manager-section-fields'); const nameLabel = make('label', 'inspector-field', 'Название раздела'); const name = document.createElement('input'); name.maxLength = 40; name.value = section.title; name.dataset.sectionTitle = ''; nameLabel.append(name);
    const iconLabel = make('label', 'inspector-field', 'Иконка из библиотеки'); const iconSelect = document.createElement('select'); iconSelect.dataset.sectionIcon = ''; fillIconOptions(iconSelect, section.icon); iconLabel.append(iconSelect);
    const preview = make('span', 'manager-icon-preview'); preview.append(iconElement(section.icon)); fields.append(nameLabel, iconLabel, preview); card.append(fields);
    const manualsList = make('div', 'manager-manuals'); manualsList.append(make('small', 'manager-list-title', `МАНУАЛЫ · ${manuals.filter((item) => item.category === section.id).length}`));
    const rows = sortedSectionManuals(section, { publishedOnly: false });
    if (!rows.length) manualsList.append(make('p', 'manager-empty', 'В разделе пока нет мануалов.'));
    rows.forEach((manual, index) => { const row = make('div', 'manager-manual-row'); row.dataset.manualId = manual.id; row.append(make('span', '', manual.title), make('small', '', manual.status === 'published' ? 'опубликован' : 'черновик'));
      [['↑','up'],['↓','down']].forEach(([label, direction]) => { const button = make('button', 'manager-move', label); button.type = 'button'; button.dataset.moveManual = direction; button.disabled = (direction === 'up' && index === 0) || (direction === 'down' && index === rows.length - 1); button.title = `${direction === 'up' ? 'Переместить выше' : 'Переместить ниже'}`; row.append(button); }); manualsList.append(row); });
    card.append(manualsList); root.append(card);
  });
  renderCategoryOptions(pageCategory.value);
}
async function persistNavigation(message = 'Настройки меню сохранены на сервере.') {
  const indicator = document.querySelector('#navigation-message'); indicator.textContent = 'Сохраняю меню…'; indicator.dataset.kind = '';
  try { const saved = await api('/api/admin/navigation', { method: 'PUT', body: JSON.stringify({ sections: navigationSections }) }); navigationSections = saved.sections; renderManualLinks(); indicator.textContent = message; }
  catch (error) { indicator.textContent = error.message; indicator.dataset.kind = 'error'; }
}
document.querySelector('#sidebar-manager-sections').addEventListener('click', async (event) => {
  const card = event.target.closest('.manager-section'); if (!card) return;
  const sectionIndex = navigationSections.findIndex((section) => section.id === card.dataset.sectionId); if (sectionIndex < 0) return;
  const section = navigationSections[sectionIndex]; const sectionMove = event.target.closest('[data-move-section]');
  if (sectionMove) { const targetIndex = sectionIndex + (sectionMove.dataset.moveSection === 'up' ? -1 : 1); if (targetIndex < 0 || targetIndex >= navigationSections.length) return; [navigationSections[sectionIndex], navigationSections[targetIndex]] = [navigationSections[targetIndex], navigationSections[sectionIndex]]; await persistNavigation('Порядок разделов обновлён.'); return; }
  const remove = event.target.closest('[data-delete-section]');
  if (remove && !remove.disabled) { navigationSections.splice(sectionIndex, 1); await persistNavigation('Пустой раздел удалён.'); return; }
  const manualMove = event.target.closest('[data-move-manual]'); if (!manualMove) return;
  const rows = sortedSectionManuals(section, { publishedOnly: false }); const index = rows.findIndex((manual) => manual.id === manualMove.closest('[data-manual-id]').dataset.manualId); const targetIndex = index + (manualMove.dataset.moveManual === 'up' ? -1 : 1);
  if (index < 0 || targetIndex < 0 || targetIndex >= rows.length) return;
  const ids = rows.map((manual) => manual.id); [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]]; section.manualIds = ids; await persistNavigation('Порядок мануалов обновлён.');
});
document.querySelector('#sidebar-manager-sections').addEventListener('change', async (event) => {
  const card = event.target.closest('.manager-section'); if (!card) return; const section = navigationSections.find((item) => item.id === card.dataset.sectionId); if (!section) return;
  if (event.target.matches('[data-section-title]')) { const title = event.target.value.trim(); if (!title) { event.target.value = section.title; return; } if (navigationSections.some((item) => item.id !== section.id && item.title.toLocaleLowerCase('ru') === title.toLocaleLowerCase('ru'))) { event.target.value = section.title; document.querySelector('#navigation-message').textContent = 'Такое название раздела уже есть.'; return; } section.title = title; }
  if (event.target.matches('[data-section-icon]')) section.icon = event.target.value;
  await persistNavigation('Раздел обновлён.');
});
document.querySelector('#new-section-icon').addEventListener('focus', (event) => { if (!event.target.options.length) fillIconOptions(event.target); });
document.querySelector('#new-section-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const title = document.querySelector('#new-section-title').value.trim(); if (!title) return;
  if (navigationSections.some((section) => section.title.toLocaleLowerCase('ru') === title.toLocaleLowerCase('ru'))) { document.querySelector('#navigation-message').textContent = 'Такое название раздела уже есть.'; return; }
  navigationSections.push({ id: `section-${crypto.randomUUID().slice(0, 8)}`, title, icon: document.querySelector('#new-section-icon').value || 'book', manualIds: [] });
  document.querySelector('#new-section-title').value = ''; await persistNavigation('Новый раздел добавлен.'); document.querySelector('#sidebar-manager').open = true;
});
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
  const actionButton = event.target.closest('[data-block-action]'); if (!actionButton || actionButton.disabled || !currentManual) return;
  const card = actionButton.closest('[data-block-id]'); const index = currentManual.blocks.findIndex((block) => block.id === card.dataset.blockId); if (index < 0) return;
  const action = actionButton.dataset.blockAction;
  if (action === 'delete') { currentManual.blocks.splice(index, 1); selectedBlockId = null; }
  else if (action === 'up' && index > 0) { const [block] = currentManual.blocks.splice(index, 1); currentManual.blocks.splice(index - 1, 0, block); selectedBlockId = block.id; }
  else if (action === 'down' && index < currentManual.blocks.length - 1) { const [block] = currentManual.blocks.splice(index, 1); currentManual.blocks.splice(index + 1, 0, block); selectedBlockId = block.id; }
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
    const navigation = await api('/api/navigation'); navigationSections = navigation.sections || structuredClone(defaultSections); categories = Object.fromEntries(navigationSections.map((section) => [section.id, section.title]));
    renderCategoryOptions(); fillIconOptions(document.querySelector('#new-section-icon'));
    manuals = await api('/api/manuals'); renderManualLinks();
    const path = currentRoute();
    if (path.startsWith('/manual/')) {
      const manual = await api(`/api/manuals?path=${encodeURIComponent(path)}`);
      if (manual) { manuals = manuals.filter((item) => item.path !== manual.path).concat(manual); renderManualLinks(); }
    }
  } catch (error) { console.error('wiki86 startup failed', error); }
  renderRoute(currentRoute(), { scroll: false });
  if (currentRoute() === '/admin') activateAdmin().catch((error) => setEditorMessage(error.message, 'error'));
}
window.addEventListener('popstate', () => { renderRoute(location.pathname); if (location.pathname === '/admin' && !adminAuthenticated) activateAdmin().catch(() => {}); });
window.addEventListener('hashchange', () => renderRoute(currentRoute()));
init();

const sidebar = document.querySelector('#sidebar');
const scrim = document.querySelector('#mobile-scrim');
const searchBox = document.querySelector('.search-box');
const searchInput = document.querySelector('#search');
const defaultGroups = [{ id: 'manuals', title: 'МАНУАЛЫ', icon: 'book' }];
const defaultSectionColors = { remnawave: '#64e2c1', protocols: '#f3bd70', cdn: '#5bbdf2', security: '#ef88b7' };
const sectionColorPresets = [
  ['Бирюзовый', '#64e2c1'], ['Янтарный', '#f3bd70'], ['Голубой', '#5bbdf2'], ['Розовый', '#ef88b7'],
  ['Фиолетовый', '#ae91ff'], ['Индиго', '#718cff'], ['Коралловый', '#ff8a70'], ['Лаймовый', '#a6d977'],
  ['Лазурный', '#44c4c9'], ['Сиреневый', '#c28dff'], ['Красный', '#ef647c'], ['Золотой', '#e7c66a']
];
const defaultSections = [
  { id: 'remnawave', groupId: 'manuals', title: 'Remnawave', icon: 'book', color: defaultSectionColors.remnawave, manualIds: [] },
  { id: 'protocols', groupId: 'manuals', title: 'Протоколы', icon: 'network', color: defaultSectionColors.protocols, manualIds: [] },
  { id: 'cdn', groupId: 'manuals', title: 'CDN', icon: 'cloud', color: defaultSectionColors.cdn, manualIds: [] },
  { id: 'security', groupId: 'manuals', title: 'Безопасность', icon: 'shield', color: defaultSectionColors.security, manualIds: [] }
];
const iconChoices = [['book','Книга'],['network','Сеть'],['cloud','Облако'],['shield','Щит'],['globe','Глобус'],['terminal','Терминал'],['spark','Искра'],['heading','Заголовок'],['text','Текст'],['list','Список'],['code','Код'],['alert','Внимание'],['image','Изображение'],['panel','Панель'],['chevron','Стрелка']];
let navigationGroups = structuredClone(defaultGroups);
let navigationSections = structuredClone(defaultSections);
let categories = Object.fromEntries(navigationSections.map((section) => [section.id, section.title]));
const openSections = new Set();
const blockNames = { heading: 'Заголовок', text: 'Текст', step: 'Шаг инструкции', accordion: 'Сворачиваемый раздел', tabs: 'Вкладки с вариантами', code: 'Команда / код', note: 'Примечание', data: 'Форма «Твои данные»', image: 'Изображение', table: 'Таблица', divider: 'Разделитель' };
const routeViews = { '/': document.querySelector('#welcome-view'), '/admin': document.querySelector('#admin-view') };
let manuals = [];
let currentManual = null;
let selectedBlockId = null;
const selectedSpacingBlockIds = new Set();
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
  if (normalizePath(path) === '/admin' && !adminAuthenticated) activateAdmin().catch((error) => setEditorMessage(error.message, 'error'));
}
function openCategory(category) {
  const section = document.querySelector(`[data-section="${CSS.escape(category)}"]`);
  if (!section) return;
  section.querySelector('.section-toggle').setAttribute('aria-expanded', 'true');
  section.querySelector('.section-items').hidden = false;
}
function renderRoute(path, { scroll = true } = {}) {
  const currentPath = normalizePath(path);
  document.body.classList.toggle('constructor-mode', currentPath === '/admin');
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
  if (link.target === '_blank' && location.protocol !== 'file:') return;
  event.preventDefault(); navigate(link.dataset.route || link.getAttribute('href'));
});
document.querySelector('.brand').addEventListener('click', (event) => { if (event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); navigate('/'); } });
window.addEventListener('popstate', () => renderRoute(location.pathname));
window.addEventListener('hashchange', () => renderRoute(currentRoute()));

const userDataKey = 'wiki86-user-data-v1';
let storedUserData = {};
try { storedUserData = JSON.parse(localStorage.getItem(userDataKey) || '{}'); } catch { storedUserData = {}; }
function updateDataPreview(root = document) {
  root.querySelectorAll('[data-value]').forEach((field) => { field.value = typeof storedUserData[field.dataset.value] === 'string' ? storedUserData[field.dataset.value] : ''; field.classList.toggle('is-filled', Boolean(field.value.trim())); });
  root.querySelectorAll('[data-preview]').forEach((target) => { const key = target.dataset.preview; target.textContent = storedUserData[key]?.trim() || (key === 'nodeDomain' ? 'node.example.com' : key === 'email' ? 'mail@example.com' : '—'); });
  document.querySelectorAll('.editor-data-form .field').forEach((label) => { const key = label.querySelector('code')?.textContent; const preview = label.querySelector('.data-editor-value'); if (!preview || !key) return; const resolved = resolveVariable(key); preview.className = `data-editor-value template-value ${resolved.filled ? 'is-filled' : 'is-example'}`; preview.textContent = resolved.value; });
}
const defaultDataFields = () => [
  { key: 'NODE_DOMAIN', label: 'Домен ноды', placeholder: 'node.example.com', help: 'A-запись домена должна вести на IP ноды.' },
  { key: 'SITE_NAME', label: 'Название сайта', placeholder: 'Например, заметки на полях', help: 'Заголовок сайта, которым прикрывается Reality.' },
  { key: 'LE_EMAIL', label: 'Почта для сертификата', placeholder: 'mail@example.com', help: 'Адрес для уведомлений Let’s Encrypt.' }
];
function getVariableValue(key) {
  const legacyKeys = { NODE_DOMAIN: 'nodeDomain', SITE_NAME: 'siteName', LE_EMAIL: 'email' };
  return storedUserData[key] ?? storedUserData[legacyKeys[key]] ?? storedUserData[key.toLowerCase()] ?? '';
}
function variableField(key) {
  const manual = currentManual || manuals.find((item) => item.path === normalizePath(location.pathname));
  return manual?.blocks?.find((block) => block.type === 'data')?.fields?.find((field) => field.key === key) || defaultDataFields().find((field) => field.key === key);
}
function resolveVariable(key) { const entered = String(getVariableValue(key) || '').trim(); return entered ? { value: entered, filled: true } : { value: variableField(key)?.placeholder || `{{${key}}}`, filled: false }; }
function interpolate(value) {
  return String(value || '').replace(/\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g, (_token, key) => resolveVariable(key).value);
}
function validImageSource(value) { const src = String(value || ''); return (/^https:\/\//i.test(src) && !/example\.com/i.test(src)) || (/^\/assets\/[\w./-]+\.svg$/i.test(src) && !src.includes('..')); }
function safeLinkUrl(value) { const url = String(value || '').trim(); if (!/^(https?:\/\/|mailto:|\/(?!\/))/i.test(url)) return ''; try { const parsed = new URL(url, location.origin); if (!['http:', 'https:', 'mailto:'].includes(parsed.protocol) || /^https?:$/.test(parsed.protocol) && !parsed.hostname) return ''; return url; } catch { return ''; } }
function appendTemplateText(parent, source) {
  const value = String(source || ''); const pattern = /\{\{\s*([A-Za-z][A-Za-z0-9_]*)\s*\}\}/g; let cursor = 0;
  for (const match of value.matchAll(pattern)) { if (match.index > cursor) parent.append(document.createTextNode(value.slice(cursor, match.index))); const resolved = resolveVariable(match[1]); const span = make('span', `template-value ${resolved.filled ? 'is-filled' : 'is-example'}`, resolved.value); span.dataset.variableKey = match[1]; parent.append(span); cursor = match.index + match[0].length; }
  if (cursor < value.length) parent.append(document.createTextNode(value.slice(cursor)));
}
function renderRichText(node, source) {
  const value = String(source || '');
  const pattern = /\[[^\]]+\]\((?:https?:\/\/|mailto:|\/(?!\/))[^)]+\)|\*\*.+?\*\*|==.+?==|`.+?`|\*[^*\n]+\*/g;
  node.replaceChildren(); let cursor = 0;
  for (const match of value.matchAll(pattern)) {
    if (match.index > cursor) appendTemplateText(node, value.slice(cursor, match.index));
    const token = match[0]; let element;
    const link = token.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) { const href = safeLinkUrl(link[2]); element = href ? make('a', 'rich-link') : make('span', ''); if (href) { element.href = href; if (/^https?:/i.test(href)) element.target = '_blank'; element.rel = 'noopener noreferrer'; } renderRichText(element, link[1]); }
    else if (token.startsWith('==')) { element = make('mark', 'rich-green'); appendTemplateText(element, token.slice(2, -2)); }
    else if (token.startsWith('**')) { element = make('strong', 'rich-bold'); appendTemplateText(element, token.slice(2, -2)); }
    else if (token.startsWith('`')) { element = make('code', 'rich-inline-code'); appendTemplateText(element, token.slice(1, -1)); }
    else { element = make('em', 'rich-italic'); appendTemplateText(element, token.slice(1, -1)); }
    node.append(element); cursor = match.index + token.length;
  }
  if (cursor < value.length) appendTemplateText(node, value.slice(cursor));
  if (!value) node.append(document.createTextNode(''));
}
function templateText(tag, className, source, { rich = true } = {}) { const node = make(tag, className); node.dataset.templateSource = source || ''; node.dataset.templatePlain = String(!rich); if (rich) renderRichText(node, source); else appendTemplateText(node, source); return node; }
function refreshVariableTexts(root = document) {
  root.querySelectorAll('[data-template-source]').forEach((node) => { if (node.dataset.templatePlain === 'true') { node.replaceChildren(); appendTemplateText(node, node.dataset.templateSource); } else renderRichText(node, node.dataset.templateSource); });
}
function createDataForm(fields, { editor = false } = {}) {
  const details = make('details', `user-data${editor ? ' editor-data-form' : ''}`); details.open = true;
  const summary = make('summary'); const icon = make('span', 'data-summary-icon'); icon.append(iconElement('terminal')); summary.append(icon, make('span', 'data-summary-title', 'Твои данные'), make('span', 'data-summary-help', 'заполни один раз — значения подставятся по мануалу'), iconElement('chevron', 'icon summary-arrow'));
  const content = make('div', 'data-content'); content.append(make('p', 'data-intro', editor ? 'Добавь поля и указывай их в тексте как {{ИМЯ_ПОЛЯ}}. Например: {{NODE_DOMAIN}}.' : 'Укажи значения для этой инструкции. Данные сохраняются только в этом браузере и не отправляются на сервер.'));
  const grid = make('div', 'data-grid');
  fields.forEach((field) => {
    const label = make('label', 'field'); const span = make('span'); span.append(document.createTextNode(field.label || field.key || 'Поле'), make('code', '', field.key || 'FIELD'));
    if (editor) { const resolved = resolveVariable(field.key); label.append(span, make('div', `data-editor-value template-value ${resolved.filled ? 'is-filled' : 'is-example'}`, resolved.value)); }
    else { const input = document.createElement('input'); input.dataset.value = field.key; input.placeholder = field.placeholder || ''; input.value = getVariableValue(field.key); input.autocomplete = 'off'; label.append(span, input); if (field.help) label.append(make('small', '', field.help)); }
    grid.append(label);
  });
  content.append(grid);
  if (!editor) { const actions = make('div', 'data-actions'); const clear = make('button', 'text-button', 'Очистить поля'); clear.type = 'button'; clear.dataset.clearData = ''; actions.append(clear, make('span', '', 'сохраняется локально в твоём браузере'), make('span', 'save-indicator', 'Сохранено')); content.append(actions); }
  details.append(summary, content); return details;
}
function createAccordionBlock(block, { editor = false } = {}) {
  const rawText = String(block.text || '').trim();
  const text = ['Добавьте содержимое сворачиваемого раздела.', 'Добавьте описание раздела.'].includes(rawText) ? '' : block.text || '';
  if (block.collapsible === false) {
    const section = make('section', `published-accordion accordion-static${editor ? ' editor-accordion' : ''}`);
    const summary = make('div', 'accordion-summary'); const badge = make('span', 'accordion-number', block.number || '1'); const icon = make('span', 'accordion-icon'); icon.append(iconElement(block.icon || 'list'));
    summary.append(icon, badge, templateText('strong', 'accordion-title', block.title || 'Как это работает'));
    section.append(summary);
    if (text.trim()) section.append(templateText('div', 'accordion-content', text));
    return section;
  }
  const details = make('details', `published-accordion${editor ? ' editor-accordion' : ''}`); details.open = editor;
  const summary = make('summary', 'accordion-summary');
  const badge = make('span', 'accordion-number', block.number || '1');
  const icon = make('span', 'accordion-icon'); icon.append(iconElement(block.icon || 'list'));
  summary.append(icon, badge, templateText('strong', 'accordion-title', block.title || 'Как это работает'), iconElement('chevron', 'icon summary-arrow'));
  details.append(summary);
  if (text.trim()) details.append(templateText('div', 'accordion-content', text));
  return details;
}
function createTabsBlock(block, { editor = false } = {}) {
  const tabs = Array.isArray(block.tabs) && block.tabs.length ? block.tabs : [{ title: 'Вариант 1', language: 'TEXT', text: '', code: '' }];
  const activeTab = Math.min(Math.max(Number(block.activeTab) || 0, 0), tabs.length - 1);
  const section = make('section', `published-tabs${editor ? ' editor-tabs' : ''}`);
  if (block.title) section.append(make('h3', 'published-tabs-title', block.title));
  const tablist = make('div', 'published-tabs-list'); tablist.setAttribute('role', 'tablist');
  const panels = tabs.map((tab, index) => {
    const button = make('button', `published-tab${index === activeTab ? ' active' : ''}`, tab.title || `Вариант ${index + 1}`); button.type = 'button'; button.setAttribute('role', 'tab'); button.setAttribute('aria-selected', String(index === activeTab));
    const panel = make('div', 'published-tab-panel'); panel.setAttribute('role', 'tabpanel'); panel.hidden = index !== activeTab;
    if (tab.text) panel.append(templateText('p', 'published-text', tab.text));
    if (tab.code) { const codeBlock = make('section', 'published-code'); const top = make('div', 'published-code-top'); top.append(make('span', '', tab.language || 'TEXT')); const copy = make('button', 'copy-code', 'Копировать'); copy.type = 'button'; copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(interpolate(tab.code)); copy.textContent = 'Скопировано'; setTimeout(() => copy.textContent = 'Копировать', 1200); } catch { copy.textContent = 'Выдели и скопируй'; } }); top.append(copy); const pre = make('pre'); pre.append(templateText('code', '', tab.code, { rich: false })); codeBlock.append(top, pre); panel.append(codeBlock); }
    button.addEventListener('click', () => { block.activeTab = index; tablist.querySelectorAll('[role="tab"]').forEach((item, itemIndex) => { item.classList.toggle('active', itemIndex === index); item.setAttribute('aria-selected', String(itemIndex === index)); panels[itemIndex].hidden = itemIndex !== index; }); });
    tablist.append(button); return panel;
  });
  section.append(tablist, ...panels); return section;
}
document.addEventListener('input', (event) => {
  const field = event.target.closest('[data-value]'); if (!field) return;
  storedUserData[field.dataset.value] = field.value; localStorage.setItem(userDataKey, JSON.stringify(storedUserData));
  const panel = field.closest('.user-data'); panel?.querySelector('.save-indicator')?.classList.add('visible');
  setTimeout(() => panel?.querySelector('.save-indicator')?.classList.remove('visible'), 1200);
  const root = field.closest('#published-manual-content') || document;
  updateDataPreview(root);
  refreshVariableTexts(root);
  document.querySelectorAll('.editor-data-form .field').forEach((label) => { const key = label.querySelector('code')?.textContent; const preview = label.querySelector('.data-editor-value'); if (!preview || !key) return; const resolved = resolveVariable(key); preview.className = `data-editor-value template-value ${resolved.filled ? 'is-filled' : 'is-example'}`; preview.textContent = resolved.value; });
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('[data-clear-data]')) return;
  localStorage.removeItem(userDataKey); storedUserData = {};
  document.querySelectorAll('[data-value]').forEach((field) => { field.value = ''; }); updateDataPreview(); refreshVariableTexts();
});

function iconElement(name, className = 'icon') {
  if (typeof name === 'string' && /^data:image\/(?:png|jpeg|webp|svg\+xml);base64,/.test(name)) { const image = document.createElement('img'); image.className = `${className} uploaded-icon`; image.src = name; image.alt = ''; return image; }
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.classList.add(...className.split(' '));
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use'); use.setAttribute('href', `#i-${iconChoices.some(([key]) => key === name) ? name : 'book'}`); svg.append(use); return svg;
}
function sortedSectionManuals(section, { publishedOnly = true } = {}) {
  const rows = manuals.filter((manual) => manual.category === section.id && (!publishedOnly || manual.status === 'published'));
  const rank = new Map((section.manualIds || []).map((id, index) => [id, index]));
  return rows.sort((a, b) => (rank.get(a.id) ?? 1e6) - (rank.get(b.id) ?? 1e6) || a.title.localeCompare(b.title, 'ru'));
}
function sectionColor(section) { return /^#[\da-f]{6}$/i.test(section.color || '') ? section.color : defaultSectionColors[section.id] || defaultSectionColors.remnawave; }
function renderManualLinks() {
  const nav = document.querySelector('#manual-nav'); nav.replaceChildren(); categories = Object.fromEntries(navigationSections.map((section) => [section.id, section.title]));
  navigationGroups.forEach((group, groupIndex) => {
    const groupNode = make('section', 'nav-group'); groupNode.dataset.group = group.id;
    const heading = make('div', 'sidebar-label'); const groupIcon = make('span', 'group-icon'); groupIcon.append(iconElement(group.icon)); heading.append(groupIcon, make('span', 'group-title', group.title), make('span', 'label-line')); groupNode.append(heading);
    const sectionsWrap = make('div', 'nav-group-sections');
    navigationSections.filter((section) => section.groupId === group.id).forEach((data, sectionIndex) => {
      const section = make('section', `nav-section section-${['remna','protocols','cdn','security'][sectionIndex % 4]}`); section.dataset.section = data.id;
      const color = sectionColor(data); section.style.setProperty('--accent', color); section.style.setProperty('--border', `color-mix(in srgb, ${color} 55%, #172033)`); section.style.setProperty('--wash', `color-mix(in srgb, ${color} 18%, #171c2c)`); section.style.setProperty('--icon-bg', `color-mix(in srgb, ${color} 20%, #152338)`);
      const toggle = make('button', 'section-toggle'); toggle.type = 'button'; toggle.setAttribute('aria-expanded', String(openSections.has(data.id)));
      const icon = make('span', 'section-icon'); icon.append(iconElement(data.icon)); const name = make('span', 'section-name', data.title); const nameWrap = make('span', 'section-heading-name'); nameWrap.append(name);
      const rows = sortedSectionManuals(data); const count = make('span', 'section-count', String(rows.length)); const updatedCount = rows.filter((manual) => manual.updated).length; const updates = make('span', 'section-updates', `Обновлений: ${updatedCount}`); updates.hidden = updatedCount === 0; const chevron = iconElement('chevron', 'icon chevron');
      if (updatedCount) nameWrap.append(updates); toggle.append(icon, nameWrap, count, chevron); toggle.title = data.title;
      const items = make('div', 'section-items'); items.hidden = !openSections.has(data.id);
      const list = make('div', 'manual-list');
      rows.forEach((manual) => {
        const link = document.createElement('a'); link.className = 'manual-link'; link.href = manual.path; link.dataset.route = manual.path; link.title = manual.title;
        const badge = make('span', 'item-icon'); badge.append(iconElement(manual.icon || (manual.path === '/manual/selfsteal' ? 'globe' : 'book')));
        link.append(badge, make('span', 'manual-link-title', manual.title)); if (manual.updated) link.append(make('span', 'manual-update-badge', 'UPD')); link.append(make('i')); list.append(link);
      });
      const empty = make('p', 'empty-category', 'Мануалы скоро появятся'); empty.hidden = rows.length > 0;
      items.append(list, empty); section.append(toggle, items); sectionsWrap.append(section);
    });
    groupNode.append(sectionsWrap); nav.append(groupNode);
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
function defaultTable() { return { headers: ['Параметр', 'Значение'], rows: [['Домен', '{{NODE_DOMAIN}}'], ['Порт', '443']] }; }
function normalizeStep(block) { if (!Array.isArray(block.items)) block.items = []; if (block.text && !block.items.length) block.items.push({ id: crypto.randomUUID(), type: 'text', text: block.text }); block.text = ''; }
function renderTable(block) {
  const wrap = make('div', 'published-table-wrap'); const table = make('table', 'published-table'); const thead = document.createElement('thead'); const head = document.createElement('tr');
  (block.headers || []).forEach((value) => head.append(templateText('th', '', value || ''))); thead.append(head); table.append(thead);
  const body = document.createElement('tbody'); (block.rows || []).forEach((row) => { const tr = document.createElement('tr'); (block.headers || []).forEach((_, index) => tr.append(templateText('td', '', row[index] || ''))); body.append(tr); }); table.append(body); wrap.append(table); return wrap;
}
function renderStepItem(block, { editor = false } = {}) {
  let element;
  if (block.type === 'text') element = templateText(editor ? 'p' : 'p', editor ? 'published-text step-item-text' : 'published-text step-item-text', block.text || '');
  else if (block.type === 'code') { element = make('section', 'published-code'); const top = make('div', 'published-code-top'); top.append(make('span', '', block.language || 'TEXT')); const copy = make('button', 'copy-code', ''); copy.type = 'button'; copy.title = 'Скопировать код'; copy.setAttribute('aria-label', copy.title); copy.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-copy"></use></svg><span class="copy-feedback">Скопировано</span>'; copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(interpolate(block.code || '')); copy.classList.add('copied'); setTimeout(() => copy.classList.remove('copied'), 1200); } catch { copy.title = 'Не удалось скопировать'; } }); top.append(copy); const pre = make('pre'); pre.append(templateText('code', '', block.code || '', { rich: false })); element.append(top, pre); }
  else if (block.type === 'note') { element = make('aside', `published-note note-${block.variant || 'warning'}`); const mark = make('span', 'note-mark'); mark.innerHTML = `<svg class="icon" aria-hidden="true"><use href="#i-${block.variant === 'success' ? 'check' : block.variant === 'info' ? 'info' : 'alert'}"></use></svg>`; const content = make('div', 'note-content'); content.append(templateText('strong', '', block.title || 'Примечание'), templateText('p', '', block.text || '')); element.append(mark, content); }
  else if (block.type === 'image') { element = make('figure', 'published-image'); if (validImageSource(block.src)) { const img = document.createElement('img'); img.src = block.src; img.alt = block.alt || ''; img.loading = 'lazy'; element.append(img); } else element.append(make('div', 'image-placeholder', 'Добавьте изображение')); if (block.alt) element.append(make('figcaption', '', block.alt)); }
  else if (block.type === 'table') element = renderTable(block);
  else element = make('hr', 'published-divider');
  return element;
}
function renderPublishedManual(manual) {
  const root = document.querySelector('#published-manual-content'); root.replaceChildren();
  const crumbs = document.querySelector('#generated-category-label'); crumbs.textContent = categories[manual.category].toLocaleUpperCase('ru');
  document.querySelector('#generated-slug-label').textContent = manual.title.toLocaleUpperCase('ru');
  const hero = make('header', 'published-manual-header');
  hero.append(make('p', 'eyebrow', `${categories[manual.category].toLocaleUpperCase('ru')} · ИНСТРУКЦИЯ`), make('h1', '', manual.title));
  if (manual.description) hero.append(make('p', 'published-description', manual.description));
  root.append(hero);
  const dataBlock = manual.blocks.find((block) => block.type === 'data');
  if (!dataBlock && manual.path === '/manual/selfsteal') { const template = document.querySelector('#selfsteal-data-template'); const dataPanel = template.content.cloneNode(true); root.append(dataPanel); updateDataPreview(root); }
  const content = make('div', 'published-blocks');
  const defaultGap = normalizeBlockSpacing(manual.blockSpacing);
  content.style.setProperty('--manual-block-gap', `${defaultGap}px`);
  manual.blocks.forEach((block, index) => {
    let element;
    if (block.type === 'data') { element = createDataForm(block.fields || defaultDataFields()); }
    else if (block.type === 'heading') { element = templateText(block.level === '3' ? 'h3' : 'h2', 'published-heading', block.title || 'Заголовок'); }
    else if (block.type === 'text') { element = templateText('p', 'published-text', block.text || ''); }
    else if (block.type === 'step') { element = make('section', `published-step${block.showNumber === false ? ' step-without-number' : ''}${block.showTitle === false ? ' step-without-title' : ''}`); if (block.showNumber !== false) element.append(make('span', 'step-number', block.number || String(index + 1).padStart(2, '0'))); element.append(make('div', 'published-step-content', '')); const body = element.lastChild; if (block.showTitle !== false) body.append(templateText('h2', '', block.title || `Шаг ${index + 1}`)); const items = Array.isArray(block.items) ? block.items : (block.text ? [{ type: 'text', text: block.text }] : []); items.forEach((item) => body.append(renderStepItem(item))); }
    else if (block.type === 'accordion') { element = createAccordionBlock(block); }
    else if (block.type === 'tabs') { element = createTabsBlock(block); }
    else if (block.type === 'code') { element = make('section', 'published-code'); const top = make('div', 'published-code-top'); top.append(make('span', '', block.language || 'TEXT')); const copy = make('button', 'copy-code', ''); copy.type = 'button'; copy.title = 'Скопировать код'; copy.setAttribute('aria-label', 'Скопировать код'); copy.innerHTML = '<svg class="icon" aria-hidden="true"><use href="#i-copy"></use></svg><span class="copy-feedback">Скопировано</span>'; copy.addEventListener('click', async () => { try { await navigator.clipboard.writeText(interpolate(block.code || '')); } catch { const range = document.createRange(); range.selectNodeContents(element.querySelector('code')); const selection = getSelection(); selection.removeAllRanges(); selection.addRange(range); document.execCommand('copy'); selection.removeAllRanges(); } copy.classList.add('copied'); setTimeout(() => copy.classList.remove('copied'), 1200); }); top.append(copy); const pre = make('pre'); pre.append(templateText('code', '', block.code || '', { rich: false })); element.append(top, pre); }
    else if (block.type === 'note') { element = renderStepItem(block); }
    else if (block.type === 'table') { element = renderTable(block); }
    else if (block.type === 'image') { element = make('figure', 'published-image'); const src = validImageSource(block.src) ? block.src : ''; if (src) { const img = document.createElement('img'); img.src = src; img.alt = block.alt || ''; img.loading = 'lazy'; element.append(img); } else element.append(make('div', 'image-placeholder', 'Добавьте HTTPS-ссылку или SVG-файл из /assets/')); if (block.alt) element.append(make('figcaption', '', block.alt)); }
    else element = make('hr', 'published-divider');
  element.dataset.blockId = block.id; element.style.marginBottom = `${normalizeBlockSpacing(block.spacingAfter ?? defaultGap)}px`; content.append(element);
  });
  if (content.lastElementChild) content.lastElementChild.style.marginBottom = '0px';
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
function setAdminMode(mode) {
  const manualMode = mode !== 'navigation';
  document.querySelector('#manual-workspace').hidden = !manualMode;
  document.querySelector('#navigation-workspace').hidden = manualMode;
  document.querySelectorAll('[data-admin-mode]').forEach((button) => button.setAttribute('aria-selected', String(button.dataset.adminMode === (manualMode ? 'manuals' : 'navigation'))));
}
document.querySelector('.admin-mode-switch').addEventListener('click', (event) => { const button = event.target.closest('[data-admin-mode]'); if (button) setAdminMode(button.dataset.adminMode); });
function defaultBlock(type) {
  const common = { id: crypto.randomUUID(), type };
  if (type === 'heading') return { ...common, title: 'Новый раздел', level: '2' };
  if (type === 'text') return { ...common, text: 'Добавьте пояснение к инструкции.' };
  if (type === 'step') return { ...common, title: 'Новый шаг', number: '', text: '', items: [{ id: crypto.randomUUID(), type: 'text', text: 'Опишите действие и ожидаемый результат.' }] };
  if (type === 'accordion') return { ...common, number: '1', icon: 'list', collapsible: true, title: 'Как это работает', text: '' };
  if (type === 'tabs') return { ...common, title: 'Варианты настройки', tabs: [{ title: 'Вариант 1', language: 'bash', text: '', code: 'команда 1' }, { title: 'Вариант 2', language: 'bash', text: '', code: 'команда 2' }] };
  if (type === 'code') return { ...common, language: 'bash', code: 'команда' };
  if (type === 'note') return { ...common, title: 'Важно', text: 'Добавьте важное примечание.', variant: 'warning' };
  if (type === 'data') return { ...common, fields: defaultDataFields() };
  if (type === 'image') return { ...common, src: '', alt: 'Описание изображения' };
  if (type === 'table') return { ...common, ...defaultTable() };
  return common;
}
function currentPageData() { return { id: currentManual?.id, title: pageTitle.value.trim(), category: pageCategory.value, slug: pageSlug.value.trim().toLowerCase(), description: pageDescription.value.trim(), icon: document.querySelector('#page-manual-icon').value || 'book', blockSpacing: normalizeBlockSpacing(currentManual?.blockSpacing ?? 14), status: currentManual?.status || 'draft', blocks: currentManual?.blocks || [] }; }
function normalizeBlockSpacing(value) { const legacy = { compact: 8, normal: 14, relaxed: 24 }; const parsed = Number.isFinite(Number(value)) ? Number(value) : legacy[value]; return Math.max(0, Math.min(80, Math.round(parsed ?? 14))); }
function refreshEditorCanvas() {
  const data = currentPageData(); editorCanvas.replaceChildren();
  const meta = make('div', 'canvas-page-meta'); meta.append(make('span', '', categories[data.category].toLocaleUpperCase('ru')), make('span', '', '·'), make('span', '', data.status === 'published' ? 'ОПУБЛИКОВАНО' : 'ЧЕРНОВИК'));
  const head = make('header', 'canvas-title-block'); head.append(make('div', '', '')); head.firstChild.append(make('small', '', 'ЗАГОЛОВОК МАНУАЛА'), make('h2', '', data.title || 'Название инструкции'), make('p', '', data.description || 'Краткое описание инструкции'));
  editorCanvas.append(meta, head);
  data.blocks.forEach((block, index) => {
    const card = make('article', `editor-block editor-block-${block.type}${block.type === 'note' ? ` note-${block.variant || 'warning'}` : ''}${selectedBlockId === block.id ? ' selected' : ''}`); card.dataset.blockId = block.id;
    const tools = make('div', 'editor-block-tools'); tools.append(make('span', 'editor-block-label', `${String(index + 1).padStart(2, '0')} · ${blockNames[block.type]}`));
    const spacingSelect = make('label', 'spacing-select-block'); const spacingCheckbox = document.createElement('input'); spacingCheckbox.type = 'checkbox'; spacingCheckbox.checked = selectedSpacingBlockIds.has(block.id); spacingCheckbox.dataset.spacingSelect = block.id; spacingCheckbox.setAttribute('aria-label', `Выбрать блок «${blockNames[block.type]}» для настройки отступа`); spacingSelect.append(spacingCheckbox, make('span', '', 'Отступ')); tools.append(spacingSelect);
    [['up','<path d="m6 14 6-6 6 6"/>'],['down','<path d="m6 10 6 6 6-6"/>'],['edit','<path d="m14 5 5 5M4 20l4.2-.9L19 8.3 15.7 5 4.9 15.8 4 20Z"/>'],['delete','<path d="M4 7h16M10 11v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3"/>']].forEach(([action, path]) => { const button = make('button', 'block-action', ''); button.type = 'button'; button.dataset.blockAction = action; button.title = ({up:'Переместить выше',down:'Переместить ниже',edit:'Редактировать',delete:'Удалить'})[action]; button.setAttribute('aria-label', button.title); button.innerHTML = `<svg class="icon" aria-hidden="true" viewBox="0 0 24 24">${path}</svg>`; button.disabled = (action === 'up' && index === 0) || (action === 'down' && index === data.blocks.length - 1); tools.append(button); });
    card.append(tools);
    if (block.type === 'heading') card.append(templateText(block.level === '3' ? 'h3' : 'h2', '', block.title || 'Заголовок'));
    if (block.type === 'text') card.append(templateText('p', '', block.text || 'Текстовый блок'));
    if (block.type === 'step') {
      normalizeStep(block);
      const number = make('span', 'step-number editor-step-number', block.number || String(index + 1).padStart(2, '0'));
      const stepContent = make('div', 'editor-step-content');
      const title = templateText('h3', 'inline-editable', block.title || `Шаг ${index + 1}`); title.contentEditable = 'true'; title.dataset.inlineField = 'title'; title.setAttribute('role', 'textbox'); title.setAttribute('aria-label', 'Название шага — нажмите, чтобы изменить'); title.title = 'Нажмите, чтобы изменить название шага';
      const text = templateText('p', 'inline-editable', block.text || 'Описание шага'); text.contentEditable = 'true'; text.dataset.inlineField = 'text'; text.setAttribute('role', 'textbox'); text.setAttribute('aria-label', 'Описание шага — нажмите, чтобы изменить'); text.title = 'Нажмите, чтобы изменить описание шага';
      if (block.showNumber !== false) card.append(number);
      if (block.showTitle !== false) stepContent.append(title);
      const items = block.items;
      items.forEach((item, itemIndex) => {
        const itemWrap = make('div', `step-item-editor${selectedBlockId === item.id ? ' selected' : ''}`); itemWrap.dataset.parentBlockId = block.id; itemWrap.dataset.stepItemId = item.id;
        const itemTools = make('div', 'step-item-tools'); itemTools.append(make('small', '', `${itemIndex + 1} · ${blockNames[item.type] || item.type}`));
        [['up','↑'],['down','↓'],['edit','✎'],['delete','×']].forEach(([action, label]) => { const button = make('button', 'block-action', label); button.type = 'button'; button.dataset.stepItemAction = action; button.title = action === 'up' ? 'Выше' : action === 'down' ? 'Ниже' : action === 'edit' ? 'Редактировать' : 'Удалить'; button.disabled = action === 'up' && itemIndex === 0 || action === 'down' && itemIndex === items.length - 1; itemTools.append(button); });
        itemWrap.append(itemTools, renderStepItem(item, { editor: true })); itemWrap.addEventListener('click', (event) => { if (!event.target.closest('button')) { selectedBlockId = block.id; renderBlockInspector(); } }); stepContent.append(itemWrap);
      });
      if (!items.length) stepContent.append(make('p', 'step-items-empty', 'Добавь внутрь шага текст, код, примечание, изображение или таблицу.'));
      card.append(stepContent);
    }
    if (block.type === 'accordion') card.append(createAccordionBlock(block, { editor: true }));
    if (block.type === 'tabs') card.append(createTabsBlock(block, { editor: true }));
    if (block.type === 'code') { card.append(make('small', 'code-language', block.language || 'TEXT')); const pre = make('pre'); pre.append(templateText('code', '', block.code || '', { rich: false })); card.append(pre); }
    if (block.type === 'note') card.append(renderStepItem(block, { editor: true }));
    if (block.type === 'data') card.append(createDataForm(block.fields || defaultDataFields(), { editor: true }));
    if (block.type === 'image') { if (validImageSource(block.src)) { const img = document.createElement('img'); img.src = block.src; img.alt = block.alt || ''; img.className = 'editor-image-preview'; card.append(img); } else card.append(make('div', 'image-placeholder', 'Вставь HTTPS-ссылку или путь /assets/*.svg в свойствах блока')); card.append(make('p', '', block.alt || 'Изображение')); }
    if (block.type === 'divider') card.append(make('hr'));
    if (block.type === 'table') card.append(renderTable(block));
    card.style.marginTop = index === 0 ? '0px' : `${normalizeBlockSpacing(data.blocks[index - 1].spacingAfter ?? data.blockSpacing)}px`;
    card.addEventListener('click', (event) => { if (event.target.closest('button,input,summary,[contenteditable="true"]')) return; selectedBlockId = block.id; renderBlockInspector(); refreshEditorCanvas(); });
    editorCanvas.append(card);
  });
  if (!data.blocks.length) { const empty = make('p', 'editor-no-blocks', 'Нажми на тип блока слева, чтобы начать собирать инструкцию.'); editorCanvas.append(empty); }
  const path = data.slug && data.category ? `/manual/${data.category}/${data.slug}` : 'URL появится после заполнения раздела и slug';
  document.querySelector('#editor-url').textContent = path.startsWith('/') ? `${location.origin}${path}` : path;
  editorCanvas.style.setProperty('--manual-block-gap', `${data.blockSpacing}px`);
  updateSpacingSelectionUI();
  document.querySelector('#delete-manual').hidden = !currentManual?.id;
  document.querySelector('#manual-picker').value = currentManual?.id || '';
}
function inputControl(labelText, key, value, { multiline = false, placeholder = '' } = {}) {
  const label = make('label', 'inspector-field', labelText); const field = document.createElement(multiline ? 'textarea' : 'input'); field.dataset.blockField = key; field.value = value || ''; field.placeholder = placeholder;
  if (!multiline) field.type = 'text'; label.append(field); return label;
}
function formatCode(value, language) {
  const source = String(value || '').replace(/\r\n?/g, '\n');
  if (/^jsonc?$/i.test(language.trim())) {
    try { return JSON.stringify(JSON.parse(source), null, 2); } catch { return null; }
  }
  if (/^(bash|sh|shell)$/i.test(language.trim())) {
    let depth = 0; let heredoc = '';
    return source.split('\n').map((raw) => {
      const line = raw.trim(); if (heredoc) { if (line === heredoc) heredoc = ''; return raw.trimEnd(); } if (!line) return '';
      if (/^(fi|done|esac|else|elif\b|;;)/.test(line)) depth = Math.max(0, depth - 1);
      const formatted = `${'  '.repeat(depth)}${line}`;
      if (/\b(?:then|do)\s*(?:#.*)?$/.test(line) || /^else\s*(?:#.*)?$/.test(line) || /^case\b.*\bin\s*$/.test(line) || /^(?:if|for|while|until|select|function)\b.*\{\s*$/.test(line)) depth += 1;
      if (/^(?:\*|[\w*?\[|.!+-]+)\)\s*(?:#.*)?$/.test(line)) depth += 1;
      if (/^\}\s*;?\s*$/.test(line)) depth = Math.max(0, depth - 1);
      const heredocMatch = line.match(/<<-?\s*(['"]?)([\w.-]+)\1/); if (heredocMatch) heredoc = heredocMatch[2];
      return formatted;
    }).join('\n');
  }
  if (/^(nginx|javascript|js|css|typescript|ts)$/i.test(language.trim())) {
    let depth = 0;
    return source.split('\n').map((raw) => {
      const line = raw.trim(); if (!line) return '';
      const structural = line.replace(/("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)/g, '');
      if (/^}/.test(structural)) depth = Math.max(0, depth - 1);
      const formatted = `${'  '.repeat(depth)}${line}`;
      const opens = (structural.match(/{/g) || []).length; const closes = (structural.match(/}/g) || []).length;
      depth = Math.max(0, depth + opens - closes + (/^}/.test(structural) ? 1 : 0));
      return formatted;
    }).join('\n');
  }
  return source.replace(/\t/g, '  ').split('\n').map((line) => line.trimEnd()).join('\n');
}
function addCodeEditorTools() {
  blockProperties.querySelectorAll('[data-block-field="code"],[data-step-item-field="code"],[data-block-field^="tab-code-"]').forEach((field) => {
    const group = field.closest('.step-item-properties,.tab-field-editor');
    const languageField = group?.querySelector('[data-step-item-field="language"], [data-block-field^="tab-language-"]') || blockProperties.querySelector('[data-block-field="language"]');
    const tools = make('div', 'code-editor-tools'); const format = make('button', 'add-data-field code-format-button', 'Форматировать код'); format.type = 'button'; format.title = 'JSON получит корректные отступы; для nginx/JS/CSS применяется отступ по фигурным скобкам.';
    format.addEventListener('click', () => { const result = formatCode(field.value, languageField?.value || 'text'); if (result === null) { setEditorMessage('Не удалось разобрать JSON. Проверьте синтаксис.', 'error'); return; } field.value = result; field.dispatchEvent(new Event('input', { bubbles: true })); setEditorMessage('Код отформатирован. Не забудьте сохранить мануал.'); });
    tools.append(format); field.parentElement.after(tools);
    field.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') { event.preventDefault(); field.setRangeText('  ', field.selectionStart, field.selectionEnd, 'end'); field.dispatchEvent(new Event('input', { bubbles: true })); }
      if (event.key === 'Enter') { const start = field.selectionStart; const lineStart = field.value.lastIndexOf('\n', start - 1) + 1; const indent = field.value.slice(lineStart, start).match(/^\s*/)?.[0] || ''; const extra = /\{\s*$/.test(field.value.slice(lineStart, start)) ? '  ' : ''; event.preventDefault(); field.setRangeText(`\n${indent}${extra}`, start, field.selectionEnd, 'end'); field.dispatchEvent(new Event('input', { bubbles: true })); }
    });
    field.addEventListener('paste', () => setTimeout(() => { const result = formatCode(field.value, languageField?.value || 'text'); if (result !== null && result !== field.value) { field.value = result; field.dispatchEvent(new Event('input', { bubbles: true })); } }, 0));
  });
}
function tableEditor(block) {
  if (!Array.isArray(block.headers) || !block.headers.length) Object.assign(block, defaultTable());
  block.rows ||= [];
  const section = make('section', 'table-editor'); section.append(make('strong', '', 'Заполни таблицу по ячейкам'));
  const grid = make('div', 'table-edit-grid');
  const headerRow = make('div', 'table-editor-row'); headerRow.style.setProperty('--table-columns', block.headers.length);
  block.headers.forEach((header, ci) => { const label = make('label', 'table-cell-editor', `Заголовок ${ci + 1}`); const input = document.createElement('input'); input.value = header; input.dataset.tableCell = 'header'; input.dataset.tableCol = String(ci); label.append(input); headerRow.append(label); }); headerRow.append(make('span', 'table-cell-spacer')); grid.append(headerRow);
  block.rows.forEach((row, ri) => { const dataRow = make('div', 'table-editor-row'); dataRow.style.setProperty('--table-columns', block.headers.length); block.headers.forEach((_, ci) => { const label = make('label', 'table-cell-editor', `Строка ${ri + 1} · ${block.headers[ci] || `столбец ${ci + 1}`}`); const input = document.createElement('input'); input.value = row[ci] || ''; input.dataset.tableCell = 'value'; input.dataset.tableRow = String(ri); input.dataset.tableCol = String(ci); label.append(input); dataRow.append(label); }); const remove = make('button', 'table-row-remove', '×'); remove.type = 'button'; remove.title = 'Удалить строку'; remove.dataset.tableAction = 'remove-row'; remove.dataset.tableIndex = String(ri); dataRow.append(remove); grid.append(dataRow); });
  section.append(grid);
  const controls = make('div', 'table-editor-actions');
  [['＋ Строка', 'add-row'], ['＋ Столбец', 'add-col']].forEach(([text, action]) => { const button = make('button', 'add-data-field', text); button.type = 'button'; button.dataset.tableAction = action; controls.append(button); });
  block.headers.forEach((header, ci) => { if (block.headers.length <= 1) return; const button = make('button', 'remove-data-field', `Удалить столбец «${header || ci + 1}»`); button.type = 'button'; button.dataset.tableAction = 'remove-col'; button.dataset.tableIndex = String(ci); controls.append(button); });
  section.append(controls); return section;
}
function renderBlockInspector() {
  blockProperties.replaceChildren(); const block = currentManual?.blocks.find((item) => item.id === selectedBlockId);
  if (!block) { blockProperties.hidden = true; document.querySelector('#page-properties').hidden = false; return; }
  blockProperties.hidden = false; document.querySelector('#page-properties').hidden = true;
  const heading = make('div', 'inspector-heading'); heading.append(make('span', 'block-icon heading-icon', '✦')); const titles = make('div'); titles.append(make('small', '', 'РЕДАКТИРОВАНИЕ БЛОКА'), make('strong', '', blockNames[block.type])); heading.append(titles); blockProperties.append(heading);
  if (block.type === 'step') normalizeStep(block);
  if (block.type === 'step') {
    blockProperties.append(inputControl('Номер шага (пустое поле включает автонумерацию)', 'number', block.number));
    for (const [key, label] of [['showNumber', 'Показывать номер шага'], ['showTitle', 'Показывать заголовок']]) { const wrapper = make('label', 'toggle-field'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = block[key] !== false; checkbox.dataset.blockField = key; wrapper.append(checkbox, make('span', '', label)); blockProperties.append(wrapper); }
  }
  if (block.type === 'heading' || block.type === 'step' || block.type === 'note' || block.type === 'accordion') blockProperties.append(inputControl(block.type === 'note' ? 'Заголовок примечания' : 'Заголовок', 'title', block.title));
  if (block.type === 'text' || block.type === 'note' || block.type === 'accordion') blockProperties.append(inputControl(block.type === 'accordion' ? 'Содержимое раздела' : 'Текст', 'text', block.text, { multiline: true, placeholder: 'Введите текст' }));
  if (block.type === 'step') {
    blockProperties.append(make('p', 'field-builder-help', 'Добавляй внутрь шага нужные элементы и меняй их порядок прямо в предпросмотре. Старый текст шага можно преобразовать в элемент перед добавлением.'));
    if (block.text && !block.items.length) { const migrate = make('button', 'add-data-field', 'Переместить описание в элемент шага'); migrate.type = 'button'; migrate.dataset.migrateStepText = ''; blockProperties.append(migrate); }
    const add = make('div', 'step-add-items');
    [['text','＋ Текст'],['code','＋ Код'],['note','＋ Примечание'],['image','＋ Изображение'],['table','＋ Таблица'],['divider','＋ Разделитель']].forEach(([type, label]) => { const button = make('button', 'add-data-field', label); button.type = 'button'; button.dataset.addStepItem = type; add.append(button); }); blockProperties.append(add);
    block.items.forEach((item, index) => {
      const group = make('section', 'step-item-properties'); group.dataset.stepItemId = item.id; group.append(make('strong', '', `${index + 1}. ${blockNames[item.type] || item.type}`));
      const addField = (label, key, value, multiline = false) => { const f = inputControl(label, key, value, { multiline }); const input = f.querySelector('[data-block-field]'); input.dataset.stepItemField = key; input.dataset.stepItemId = item.id; group.append(f); };
      if (item.type === 'text') addField('Текст', 'text', item.text, true);
      if (item.type === 'code') { addField('Язык', 'language', item.language || 'bash'); addField('Код', 'code', item.code, true); }
      if (item.type === 'note') { addField('Заголовок', 'title', item.title); addField('Текст', 'text', item.text, true); const selectLabel = make('label', 'inspector-field', 'Вид примечания'); const select = document.createElement('select'); select.dataset.stepItemField = 'variant'; select.dataset.stepItemId = item.id; [['warning','Важно'],['info','Информация'],['success','Успех']].forEach(([value,title]) => { const option = document.createElement('option'); option.value = value; option.textContent = title; select.append(option); }); select.value = item.variant || 'warning'; selectLabel.append(select); group.append(selectLabel); }
      if (item.type === 'image') { addField('HTTPS-ссылка или путь /assets/*.svg', 'src', item.src); addField('Подпись / alt-текст', 'alt', item.alt); }
      if (item.type === 'table') group.append(tableEditor(item, true));
      const remove = make('button', 'remove-data-field', 'Удалить элемент'); remove.type = 'button'; remove.dataset.stepItemRemove = item.id; group.append(remove); blockProperties.append(group);
    });
  }
  if (block.type === 'accordion') {
    blockProperties.append(inputControl('Номер на плашке', 'number', block.number));
    const iconLabel = make('label', 'inspector-field', 'Иконка раздела'); const iconSelect = document.createElement('select'); iconSelect.dataset.blockField = 'icon';
    iconChoices.filter(([id]) => ['book','network','cloud','shield','globe','terminal','spark','heading','text','list','code','alert','image','panel'].includes(id)).forEach(([id, title]) => { const option = document.createElement('option'); option.value = id; option.textContent = title; iconSelect.append(option); });
    iconSelect.value = block.icon || 'list'; iconLabel.append(iconSelect); blockProperties.append(iconLabel);
    const collapsible = make('label', 'toggle-field'); const checkbox = document.createElement('input'); checkbox.type = 'checkbox'; checkbox.checked = block.collapsible !== false; checkbox.dataset.blockField = 'collapsible'; collapsible.append(checkbox, make('span', '', 'Раздел можно сворачивать')); blockProperties.append(collapsible);
  }
  if (block.type === 'tabs') {
    block.tabs ||= [];
    blockProperties.append(inputControl('Заголовок блока', 'title', block.title));
    block.tabs.forEach((tab, index) => {
      const fieldset = make('section', 'tab-field-editor'); fieldset.append(make('strong', '', `Вкладка ${index + 1}`));
      fieldset.append(inputControl('Название вкладки', `tab-title-${index}`, tab.title));
      fieldset.append(inputControl('Короткое пояснение', `tab-text-${index}`, tab.text, { multiline: true }));
      fieldset.append(inputControl('Подпись кода', `tab-language-${index}`, tab.language, { placeholder: 'bash, nginx, json' }));
      fieldset.append(inputControl('Команда или конфигурация', `tab-code-${index}`, tab.code, { multiline: true })); blockProperties.append(fieldset);
    });
    if (block.tabs.length < 6) { const addTab = make('button', 'add-data-field', '＋ Добавить вкладку'); addTab.type = 'button'; addTab.dataset.addTab = ''; blockProperties.append(addTab); }
    if (block.tabs.length > 2) block.tabs.forEach((tab, index) => { const remove = make('button', 'remove-data-field', `Удалить вкладку ${index + 1}`); remove.type = 'button'; remove.dataset.removeTab = String(index); blockProperties.append(remove); });
  }
  if (block.type === 'heading') { const selectLabel = make('label', 'inspector-field', 'Уровень заголовка'); const select = document.createElement('select'); select.dataset.blockField = 'level'; [['2','H2'],['3','H3']].forEach(([value,label]) => { const opt = document.createElement('option'); opt.value = value; opt.textContent = label; select.append(opt); }); select.value = block.level || '2'; selectLabel.append(select); blockProperties.append(selectLabel); }
  if (block.type === 'code') { blockProperties.append(inputControl('Язык блока', 'language', block.language, { placeholder: 'bash' }), inputControl('Команды и код', 'code', block.code, { multiline: true })); }
  if (block.type === 'image') blockProperties.append(inputControl('HTTPS-ссылка или путь /assets/*.svg', 'src', block.src), inputControl('Alt-текст', 'alt', block.alt));
  addCodeEditorTools();
  if (block.type === 'table') blockProperties.append(tableEditor(block));
  if (block.type === 'note') { const label = make('label', 'inspector-field', 'Вид примечания'); const select = document.createElement('select'); select.dataset.blockField = 'variant'; [['warning','Важно'],['info','Информация'],['success','Успех']].forEach(([value,title]) => { const option = document.createElement('option'); option.value=value; option.textContent=title; select.append(option); }); select.value=block.variant||'warning'; label.append(select); blockProperties.append(label); }
  if (block.type === 'data') {
    block.fields ||= defaultDataFields();
    blockProperties.append(make('p', 'field-builder-help', 'Заполнители хранятся только в браузере посетителя. В тексте, шагах, примечаниях и коде используй токен {{ИМЯ_ПОЛЯ}}.'));
    block.fields.forEach((field, index) => {
      const card = make('div', 'data-field-editor'); card.append(make('div', 'data-field-editor-heading', `Поле ${index + 1}`));
      card.append(inputControl('Ключ переменной (латиница)', `field-key-${index}`, field.key, { placeholder: 'NODE_DOMAIN' }));
      card.append(inputControl('Подпись', `field-label-${index}`, field.label, { placeholder: 'Домен ноды' }));
      card.append(inputControl('Пример значения', `field-placeholder-${index}`, field.placeholder, { placeholder: 'node.example.com' }));
      card.append(inputControl('Подсказка под полем', `field-help-${index}`, field.help, { placeholder: 'Необязательно' }));
      const token = make('code', 'variable-token', `{{${field.key || 'FIELD'}}}`); card.append(token);
      if (block.fields.length > 1) { const remove = make('button', 'remove-data-field', 'Удалить поле'); remove.type = 'button'; remove.dataset.removeDataField = String(index); card.append(remove); }
      blockProperties.append(card);
    });
    const add = make('button', 'add-data-field', '＋ Добавить поле'); add.type = 'button'; add.dataset.addDataField = ''; add.disabled = block.fields.length >= 20; if (add.disabled) add.title = 'Максимум 20 полей'; blockProperties.append(add);
  }
  if (block.type !== 'data') {
    blockProperties.querySelectorAll('[data-block-field="title"],[data-block-field="text"]').forEach((target) => {
      const toolbar = make('div', 'format-toolbar'); toolbar.append(make('span', '', 'Формат текста'));
      [['bold','Жирный','**','**'],['italic','Курсив','*','*'],['green','Зелёный акцент','==','=='],['code','Моноширинный','`','`']].forEach(([name, title, open, close]) => {
        const button = make('button', `format-button format-${name}`, name === 'bold' ? 'B' : name === 'italic' ? 'I' : name === 'green' ? 'A' : '</>'); button.type = 'button'; button.title = title; button.setAttribute('aria-label', title);
        if (name === 'bold') button.style.fontWeight = '800'; if (name === 'italic') button.style.fontStyle = 'italic';
        button.addEventListener('click', () => { const start = target.selectionStart ?? target.value.length; const end = target.selectionEnd ?? start; const selection = target.value.slice(start, end) || 'текст'; target.focus(); target.setRangeText(`${open}${selection}${close}`, start, end, 'select'); target.dispatchEvent(new Event('input', { bubbles: true })); }); toolbar.append(button);
      });
      const linkButton = make('button', 'format-button format-link', '↗'); linkButton.type = 'button'; linkButton.title = 'Добавить гиперссылку'; linkButton.setAttribute('aria-label', linkButton.title);
      linkButton.addEventListener('mousedown', (event) => event.preventDefault());
      linkButton.addEventListener('click', () => { const start = target.selectionStart ?? 0; const end = target.selectionEnd ?? start; const selected = target.value.slice(start, end) || 'текст ссылки'; const href = window.prompt('Введите адрес ссылки (https://, mailto: или относительный путь):', 'https://'); if (!href) return; const url = safeLinkUrl(href); if (!url) { setEditorMessage('Поддерживаются только http(s), mailto: и адреса внутри сайта.', 'error'); return; } target.focus(); target.setRangeText(`[${selected}](${url})`, start, end, 'select'); target.dispatchEvent(new Event('input', { bubbles: true })); }); toolbar.append(linkButton);
      target.parentElement.after(toolbar, make('small', 'format-help', 'Выдели фрагмент и выбери оформление. Для ссылки нажми ↗ и введи адрес. Зелёный акцент: ==текст==.'));
    });
    const variables = currentManual?.blocks.find((item) => item.type === 'data')?.fields || [];
    if (variables.length) blockProperties.querySelectorAll('[data-block-field="text"],[data-block-field="code"],[data-block-field="title"]').forEach((target) => {
      const helper = make('div', 'variable-insert-helper'); helper.append(make('span', '', 'Вставить переменную:'));
      variables.forEach((variable) => { const insert = make('button', 'variable-insert', `{{${variable.key}}}`); insert.type = 'button'; insert.title = `Вставить поле «${variable.label}»`; insert.addEventListener('click', () => { const start = target.selectionStart ?? target.value.length; const end = target.selectionEnd ?? start; target.focus(); target.setRangeText(`{{${variable.key}}}`, start, end, 'end'); target.dispatchEvent(new Event('input', { bubbles: true })); }); helper.append(insert); });
      target.parentElement.after(helper);
    });
  }
  blockProperties.querySelectorAll('[data-block-field]').forEach((field) => { if (field.dataset.stepItemField || field.dataset.tableField || block.type === 'tabs' && /^tab-(title|text|language|code)-\d+$/.test(field.dataset.blockField)) return; const update = () => { const key = field.dataset.blockField; const match = key.match(/^field-(key|label|placeholder|help)-(\d+)$/); if (match) { const property = ({ key: 'key', label: 'label', placeholder: 'placeholder', help: 'help' })[match[1]]; const value = property === 'key' ? field.value.replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) : field.value; field.value = value; block.fields[Number(match[2])][property] = value; const token = field.closest('.data-field-editor')?.querySelector('.variable-token'); if (token) token.textContent = `{{${value || 'FIELD'}}}`; } else block[key] = field.type === 'checkbox' ? field.checked : field.value; refreshEditorCanvas(); }; field.addEventListener('input', update); field.addEventListener('change', update); });
  blockProperties.querySelectorAll('[data-step-item-field]').forEach((field) => { const update = () => { const item = block.items.find((entry) => entry.id === field.dataset.stepItemId); if (item) item[field.dataset.stepItemField] = field.value; refreshEditorCanvas(); }; field.addEventListener('input', update); field.addEventListener('change', update); });
  const tableTarget = (element) => { const parent = element.closest('.step-item-properties'); return parent?.dataset.stepItemId ? block.items.find((item) => item.id === parent.dataset.stepItemId) : block; };
  blockProperties.querySelectorAll('[data-table-cell]').forEach((field) => { const update = () => { const target = tableTarget(field); if (!target) return; const col = Number(field.dataset.tableCol); if (field.dataset.tableCell === 'header') { target.headers[col] = field.value; } else { const row = Number(field.dataset.tableRow); if (target.rows[row]) target.rows[row][col] = field.value; } refreshEditorCanvas(); }; field.addEventListener('input', update); });
  blockProperties.querySelectorAll('[data-table-action]').forEach((button) => button.addEventListener('click', () => { const target = tableTarget(button); const index = Number(button.dataset.tableIndex); if (button.dataset.tableAction === 'add-row' && target.rows.length < 40) target.rows.push(target.headers.map(() => '')); if (button.dataset.tableAction === 'remove-row') target.rows.splice(index, 1); if (button.dataset.tableAction === 'add-col' && target.headers.length < 8) { target.headers.push(`Столбец ${target.headers.length + 1}`); target.rows.forEach((row) => row.push('')); } if (button.dataset.tableAction === 'remove-col' && target.headers.length > 1) { target.headers.splice(index, 1); target.rows.forEach((row) => row.splice(index, 1)); } renderBlockInspector(); refreshEditorCanvas(); }));
  blockProperties.querySelectorAll('[data-add-step-item]').forEach((button) => button.addEventListener('click', () => { if (block.text && !block.items.length) { block.items.push({ id: crypto.randomUUID(), type: 'text', text: block.text }); block.text = ''; } const item = { id: crypto.randomUUID(), type: button.dataset.addStepItem }; if (item.type === 'text') item.text = 'Добавьте текст.'; if (item.type === 'code') Object.assign(item, { language: 'bash', code: '' }); if (item.type === 'note') Object.assign(item, { title: 'Важно', text: '', variant: 'warning' }); if (item.type === 'image') Object.assign(item, { src: '', alt: '' }); if (item.type === 'table') Object.assign(item, defaultTable()); block.items.push(item); renderBlockInspector(); refreshEditorCanvas(); }));
  blockProperties.querySelector('[data-migrate-step-text]')?.addEventListener('click', () => { block.items.push({ id: crypto.randomUUID(), type: 'text', text: block.text }); block.text = ''; renderBlockInspector(); refreshEditorCanvas(); });
  blockProperties.querySelectorAll('[data-step-item-remove]').forEach((button) => button.addEventListener('click', () => { block.items = block.items.filter((item) => item.id !== button.dataset.stepItemRemove); renderBlockInspector(); refreshEditorCanvas(); }));
  if (block.type === 'tabs') blockProperties.querySelectorAll('[data-block-field]').forEach((field) => { const match = field.dataset.blockField.match(/^tab-(title|text|language|code)-(\d+)$/); if (!match) return; const key = ({ title: 'title', text: 'text', language: 'language', code: 'code' })[match[1]]; const update = () => { block.tabs[Number(match[2])][key] = field.value; refreshEditorCanvas(); }; field.addEventListener('input', update); field.addEventListener('change', update); });
  blockProperties.querySelector('[data-add-data-field]')?.addEventListener('click', () => { block.fields.push({ key: `FIELD_${block.fields.length + 1}`, label: 'Новое поле', placeholder: '', help: '' }); renderBlockInspector(); refreshEditorCanvas(); });
  blockProperties.querySelectorAll('[data-remove-data-field]').forEach((button) => button.addEventListener('click', () => { block.fields.splice(Number(button.dataset.removeDataField), 1); renderBlockInspector(); refreshEditorCanvas(); }));
  blockProperties.querySelector('[data-add-tab]')?.addEventListener('click', () => { block.tabs.push({ title: `Вариант ${block.tabs.length + 1}`, language: 'bash', text: '', code: '' }); renderBlockInspector(); refreshEditorCanvas(); });
  blockProperties.querySelectorAll('[data-remove-tab]').forEach((button) => button.addEventListener('click', () => { block.tabs.splice(Number(button.dataset.removeTab), 1); renderBlockInspector(); refreshEditorCanvas(); }));
}
function resetEditor() {
  currentManual = null; selectedBlockId = null; selectedSpacingBlockIds.clear(); pageTitle.value = ''; pageCategory.value = navigationSections.some((item) => item.id === 'cdn') ? 'cdn' : navigationSections[0]?.id || ''; pageSlug.value = ''; pageSlug.dataset.edited = ''; pageDescription.value = ''; fillIconOptions(document.querySelector('#page-manual-icon'), 'book'); document.querySelector('#page-manual-icon-file').value = ''; document.querySelector('#manual-picker').value = ''; renderCategoryOptions(pageCategory.value); renderBlockInspector(); refreshEditorCanvas(); setEditorMessage('Новая страница. Заполни поля и добавь блоки.', '');
}
function setEditorMessage(message, kind = 'success') { editorMessage.textContent = message; editorMessage.dataset.kind = kind; }
function hydrateEditor(manual) {
  currentManual = structuredClone(manual); selectedBlockId = null; selectedSpacingBlockIds.clear(); pageTitle.value = manual.title; pageCategory.value = manual.category; pageSlug.value = manual.slug; pageSlug.dataset.edited = 'true'; pageDescription.value = manual.description || ''; fillIconOptions(document.querySelector('#page-manual-icon'), manual.icon || 'book'); document.querySelector('#page-manual-icon-file').value = ''; renderBlockInspector(); refreshEditorCanvas(); setEditorMessage(manual.status === 'published' ? 'Опубликовано. Сохранение обновит страницу на сайте.' : 'Черновик загружен.');
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
  if (typeof selected === 'string' && selected.startsWith('data:image/')) { const option = document.createElement('option'); option.value = selected; option.textContent = 'Загруженная иконка'; select.append(option); }
  select.value = selected;
}
async function readCustomIcon(file) {
  if (!file) return '';
  if (file.size > 48 * 1024) throw new Error('Размер иконки не должен превышать 48 КБ.');
  if (!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(file.type)) throw new Error('Поддерживаются PNG, JPEG, WebP и SVG.');
  if (file.type === 'image/svg+xml') {
    const source = await file.text();
    const parsed = new DOMParser().parseFromString(source, 'image/svg+xml');
    if (parsed.querySelector('parsererror') || parsed.documentElement.localName !== 'svg' || parsed.querySelector('script,foreignObject,iframe,object,embed,image')) throw new Error('SVG содержит неподдерживаемые или небезопасные элементы.');
    for (const element of parsed.querySelectorAll('*')) for (const attribute of element.attributes) {
      if (/^on/i.test(attribute.name) || /javascript:|url\s*\(/i.test(attribute.value) || /^(?:href|xlink:href)$/i.test(attribute.name) && !attribute.value.startsWith('#')) throw new Error('SVG может содержать только локальные векторные элементы.');
    }
    if (/<!DOCTYPE|<!ENTITY/i.test(source)) throw new Error('В SVG запрещены внешние сущности.');
  }
  return await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Не удалось прочитать файл иконки.')); reader.readAsDataURL(file); });
}
function renderCategoryOptions(selected = pageCategory.value) {
  pageCategory.replaceChildren();
  navigationGroups.forEach((group) => {
    const sections = navigationSections.filter((section) => section.groupId === group.id); if (!sections.length) return;
    const optgroup = document.createElement('optgroup'); optgroup.label = group.title;
    sections.forEach((section) => { const option = document.createElement('option'); option.value = section.id; option.textContent = section.title; optgroup.append(option); }); pageCategory.append(optgroup);
  });
  pageCategory.value = navigationSections.some((section) => section.id === selected) ? selected : navigationSections[0]?.id || '';
}
function renderSidebarManager() {
  const root = document.querySelector('#sidebar-manager-groups'); if (!root) return;
  root.replaceChildren();
  navigationGroups.forEach((group, groupIndex) => {
    const groupCard = make('section', 'manager-group'); groupCard.dataset.groupId = group.id;
    const groupHead = make('div', 'manager-section-heading'); groupHead.append(make('span', 'manager-order', String(groupIndex + 1).padStart(2, '0')), make('strong', '', group.title));
    [['↑','up'],['↓','down']].forEach(([label, direction]) => { const button = make('button', 'manager-move', label); button.type = 'button'; button.title = direction === 'up' ? 'Поднять группу' : 'Опустить группу'; button.dataset.moveGroup = direction; button.disabled = (direction === 'up' && groupIndex === 0) || (direction === 'down' && groupIndex === navigationGroups.length - 1); groupHead.append(button); });
    const delGroup = make('button', 'manager-remove', 'Удалить'); delGroup.type = 'button'; delGroup.dataset.deleteGroup = ''; delGroup.disabled = navigationGroups.length === 1 || navigationSections.some((section) => section.groupId === group.id); delGroup.title = delGroup.disabled ? 'Сначала перемести или удали подразделы' : 'Удалить пустую группу'; groupHead.append(delGroup); groupCard.append(groupHead);
    const groupFields = make('div', 'manager-section-fields manager-group-fields'); const groupNameLabel = make('label', 'inspector-field', 'Название группы'); const groupName = document.createElement('input'); groupName.maxLength = 40; groupName.value = group.title; groupName.dataset.groupTitle = ''; groupNameLabel.append(groupName);
    const groupIconLabel = make('label', 'inspector-field', 'Иконка'); const groupIconSelect = document.createElement('select'); groupIconSelect.dataset.groupIcon = ''; fillIconOptions(groupIconSelect, group.icon); groupIconLabel.append(groupIconSelect);
    const groupPreview = make('span', 'manager-icon-preview'); groupPreview.append(iconElement(group.icon)); groupFields.append(groupNameLabel, groupIconLabel, groupPreview); groupCard.append(groupFields);
    const sectionWrap = make('div', 'manager-subsections');
    const groupSections = navigationSections.filter((section) => section.groupId === group.id);
    groupSections.forEach((section, sectionIndex) => {
      const card = make('section', 'manager-section'); card.dataset.sectionId = section.id; card.dataset.groupId = group.id;
      const heading = make('div', 'manager-section-heading'); heading.append(make('span', 'manager-order', String(sectionIndex + 1).padStart(2, '0')), make('strong', '', section.title));
      [['↑','up'],['↓','down']].forEach(([label, direction]) => { const button = make('button', 'manager-move', label); button.type = 'button'; button.title = direction === 'up' ? 'Поднять подраздел' : 'Опустить подраздел'; button.dataset.moveSection = direction; button.disabled = (direction === 'up' && sectionIndex === 0) || (direction === 'down' && sectionIndex === groupSections.length - 1); heading.append(button); });
      const remove = make('button', 'manager-remove', 'Удалить'); remove.type = 'button'; remove.dataset.deleteSection = ''; remove.disabled = navigationSections.length === 1 || manuals.some((manual) => manual.category === section.id); remove.title = remove.disabled ? 'Оставь один подраздел и сначала перемести мануалы' : 'Удалить подраздел'; heading.append(remove); card.append(heading);
      const fields = make('div', 'manager-section-fields'); const nameLabel = make('label', 'inspector-field', 'Название подраздела'); const name = document.createElement('input'); name.maxLength = 40; name.value = section.title; name.dataset.sectionTitle = ''; nameLabel.append(name);
      const groupLabel = make('label', 'inspector-field', 'Группа'); const sectionGroup = document.createElement('select'); sectionGroup.dataset.sectionGroup = ''; navigationGroups.forEach((item) => { const option = document.createElement('option'); option.value = item.id; option.textContent = item.title; sectionGroup.append(option); }); sectionGroup.value = section.groupId; groupLabel.append(sectionGroup);
      const iconLabel = make('label', 'inspector-field', 'Иконка'); const iconSelect = document.createElement('select'); iconSelect.dataset.sectionIcon = ''; fillIconOptions(iconSelect, section.icon); iconLabel.append(iconSelect);
      const iconUploadLabel = make('label', 'inspector-field icon-upload-field', 'Загрузить свою иконку'); const iconUpload = document.createElement('input'); iconUpload.type = 'file'; iconUpload.accept = 'image/png,image/jpeg,image/webp,image/svg+xml'; iconUpload.dataset.sectionIconFile = ''; iconUploadLabel.append(iconUpload, make('small', '', 'До 48 КБ · PNG, JPEG, WebP, SVG'));
      const colorLabel = make('label', 'inspector-field color-field', 'Цвет подраздела'); const colorInput = document.createElement('input'); colorInput.type = 'color'; colorInput.value = sectionColor(section); colorInput.dataset.sectionColor = ''; colorLabel.append(colorInput);
      const preview = make('span', 'manager-icon-preview'); preview.style.color = sectionColor(section); preview.style.borderColor = sectionColor(section); preview.append(iconElement(section.icon)); fields.append(nameLabel, groupLabel, iconLabel, iconUploadLabel, colorLabel, preview); card.append(fields);
      const presetRow = make('div', 'color-preset-row'); presetRow.append(make('small', 'color-preset-caption', 'Быстрый выбор цвета'));
      const presetGrid = make('div', 'color-preset-grid');
      sectionColorPresets.forEach(([label, value]) => { const swatch = make('button', 'color-preset'); swatch.type = 'button'; swatch.dataset.colorPreset = value; swatch.title = `${label} · ${value}`; swatch.setAttribute('aria-label', `${label}, ${value}`); swatch.setAttribute('aria-pressed', String(sectionColor(section).toLowerCase() === value)); swatch.style.setProperty('--swatch', value); presetGrid.append(swatch); });
      presetRow.append(presetGrid); card.append(presetRow);
      const manualsList = make('div', 'manager-manuals'); manualsList.append(make('small', 'manager-list-title', `МАНУАЛЫ · ${manuals.filter((item) => item.category === section.id).length}`));
      const rows = sortedSectionManuals(section, { publishedOnly: false });
      if (!rows.length) manualsList.append(make('p', 'manager-empty', 'В подразделе пока нет мануалов.'));
      rows.forEach((manual, index) => { const row = make('div', 'manager-manual-row'); row.dataset.manualId = manual.id; row.append(make('span', '', manual.title), make('small', '', manual.status === 'published' ? 'опубликован' : 'черновик'));
        [['↑','up'],['↓','down']].forEach(([label, direction]) => { const button = make('button', 'manager-move', label); button.type = 'button'; button.dataset.moveManual = direction; button.disabled = (direction === 'up' && index === 0) || (direction === 'down' && index === rows.length - 1); button.title = `${direction === 'up' ? 'Переместить выше' : 'Переместить ниже'}`; row.append(button); }); manualsList.append(row); });
      card.append(manualsList); sectionWrap.append(card);
    });
    if (!groupSections.length) sectionWrap.append(make('p', 'manager-empty', 'Добавь подраздел в эту группу.'));
    groupCard.append(sectionWrap); root.append(groupCard);
  });
  const groupSelect = document.querySelector('#new-section-group'); groupSelect.replaceChildren(); navigationGroups.forEach((group) => { const option = document.createElement('option'); option.value = group.id; option.textContent = group.title; groupSelect.append(option); });
  fillIconOptions(document.querySelector('#new-group-icon')); fillIconOptions(document.querySelector('#new-section-icon'));
  renderCategoryOptions(pageCategory.value);
}
async function persistNavigation(message = 'Настройки меню сохранены на сервере.') {
  const indicator = document.querySelector('#navigation-message'); indicator.textContent = 'Сохраняю меню…'; indicator.dataset.kind = '';
  try { const saved = await api('/api/admin/navigation', { method: 'PUT', body: JSON.stringify({ groups: navigationGroups, sections: navigationSections }) }); navigationGroups = saved.groups; navigationSections = saved.sections; renderManualLinks(); indicator.textContent = message; }
  catch (error) { indicator.textContent = error.message; indicator.dataset.kind = 'error'; }
}
document.querySelector('#sidebar-manager-groups').addEventListener('click', async (event) => {
  const groupCard = event.target.closest('.manager-group');
  if (groupCard) {
    const groupIndex = navigationGroups.findIndex((group) => group.id === groupCard.dataset.groupId); const group = navigationGroups[groupIndex]; if (groupIndex < 0) return;
    const moveGroup = event.target.closest('[data-move-group]');
    if (moveGroup) { const nextIndex = groupIndex + (moveGroup.dataset.moveGroup === 'up' ? -1 : 1); if (nextIndex < 0 || nextIndex >= navigationGroups.length) return; [navigationGroups[groupIndex], navigationGroups[nextIndex]] = [navigationGroups[nextIndex], navigationGroups[groupIndex]]; await persistNavigation('Порядок групп обновлён.'); return; }
    const deleteGroup = event.target.closest('[data-delete-group]');
    if (deleteGroup && !deleteGroup.disabled) { navigationGroups.splice(groupIndex, 1); await persistNavigation('Пустая группа удалена.'); return; }
  }
  const card = event.target.closest('.manager-section'); if (!card) return;
  const sectionIndex = navigationSections.findIndex((section) => section.id === card.dataset.sectionId); if (sectionIndex < 0) return;
  const section = navigationSections[sectionIndex]; const sectionMove = event.target.closest('[data-move-section]');
  const colorPreset = event.target.closest('[data-color-preset]');
  if (colorPreset) { section.color = colorPreset.dataset.colorPreset; await persistNavigation('Цвет подраздела сохранён.'); return; }
  if (sectionMove) { const siblings = navigationSections.filter((item) => item.groupId === section.groupId); const siblingIndex = siblings.findIndex((item) => item.id === section.id); const targetIndex = siblingIndex + (sectionMove.dataset.moveSection === 'up' ? -1 : 1); if (targetIndex < 0 || targetIndex >= siblings.length) return; const from = navigationSections.indexOf(siblings[siblingIndex]); const to = navigationSections.indexOf(siblings[targetIndex]); [navigationSections[from], navigationSections[to]] = [navigationSections[to], navigationSections[from]]; await persistNavigation('Порядок подразделов обновлён.'); return; }
  const remove = event.target.closest('[data-delete-section]');
  if (remove && !remove.disabled) { navigationSections.splice(sectionIndex, 1); await persistNavigation('Пустой раздел удалён.'); return; }
  const manualMove = event.target.closest('[data-move-manual]'); if (!manualMove) return;
  const rows = sortedSectionManuals(section, { publishedOnly: false }); const index = rows.findIndex((manual) => manual.id === manualMove.closest('[data-manual-id]').dataset.manualId); const targetIndex = index + (manualMove.dataset.moveManual === 'up' ? -1 : 1);
  if (index < 0 || targetIndex < 0 || targetIndex >= rows.length) return;
  const ids = rows.map((manual) => manual.id); [ids[index], ids[targetIndex]] = [ids[targetIndex], ids[index]]; section.manualIds = ids; await persistNavigation('Порядок мануалов обновлён.');
});
document.querySelector('#sidebar-manager-groups').addEventListener('change', async (event) => {
  const groupCard = event.target.closest('.manager-group'); const group = groupCard && navigationGroups.find((item) => item.id === groupCard.dataset.groupId);
  if (group && event.target.matches('[data-group-title]')) { const title = event.target.value.trim(); if (!title || navigationGroups.some((item) => item.id !== group.id && item.title.toLocaleLowerCase('ru') === title.toLocaleLowerCase('ru'))) { event.target.value = group.title; document.querySelector('#navigation-message').textContent = 'Укажи уникальное название группы.'; return; } group.title = title; await persistNavigation('Группа обновлена.'); return; }
  if (group && event.target.matches('[data-group-icon]')) { group.icon = event.target.value; await persistNavigation('Иконка группы обновлена.'); return; }
  const card = event.target.closest('.manager-section'); if (!card) return; const section = navigationSections.find((item) => item.id === card.dataset.sectionId); if (!section) return;
  if (event.target.matches('[data-section-group]')) { const groupId = event.target.value; const nextGroup = navigationGroups.find((item) => item.id === groupId); if (!nextGroup || navigationSections.some((item) => item.id !== section.id && item.groupId === groupId && item.title.toLocaleLowerCase('ru') === section.title.toLocaleLowerCase('ru'))) { event.target.value = section.groupId; document.querySelector('#navigation-message').textContent = 'В этой группе уже есть подраздел с таким названием.'; return; } section.groupId = groupId; await persistNavigation('Подраздел перемещён в другую группу.'); return; }
  if (event.target.matches('[data-section-icon-file]')) { try { section.icon = await readCustomIcon(event.target.files?.[0]); await persistNavigation('Своя иконка раздела загружена.'); } catch (error) { document.querySelector('#navigation-message').textContent = error.message; } return; }
  if (event.target.matches('[data-section-title]')) { const title = event.target.value.trim(); if (!title || navigationSections.some((item) => item.id !== section.id && item.groupId === section.groupId && item.title.toLocaleLowerCase('ru') === title.toLocaleLowerCase('ru'))) { event.target.value = section.title; document.querySelector('#navigation-message').textContent = 'Укажи уникальное название подраздела в этой группе.'; return; } section.title = title; }
  if (event.target.matches('[data-section-icon]')) section.icon = event.target.value;
  if (event.target.matches('[data-section-color]')) section.color = event.target.value;
  await persistNavigation('Раздел обновлён.');
});
document.querySelector('#new-group-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const title = document.querySelector('#new-group-title').value.trim(); if (!title) return;
  if (navigationGroups.some((group) => group.title.toLocaleLowerCase('ru') === title.toLocaleLowerCase('ru'))) { document.querySelector('#navigation-message').textContent = 'Такая группа уже существует.'; return; }
  navigationGroups.push({ id: `group-${crypto.randomUUID().slice(0, 8)}`, title, icon: document.querySelector('#new-group-icon').value || 'book' });
  document.querySelector('#new-group-title').value = ''; await persistNavigation('Новая группа добавлена. Теперь создай для неё подразделы.');
});
document.querySelector('#new-section-form').addEventListener('submit', async (event) => {
  event.preventDefault(); const title = document.querySelector('#new-section-title').value.trim(); if (!title) return;
  const groupId = document.querySelector('#new-section-group').value; const groupSections = navigationSections.filter((section) => section.groupId === groupId);
  if (groupSections.some((section) => section.title.toLocaleLowerCase('ru') === title.toLocaleLowerCase('ru'))) { document.querySelector('#navigation-message').textContent = 'Такой подраздел уже есть в выбранной группе.'; return; }
  navigationSections.push({ id: `section-${crypto.randomUUID().slice(0, 8)}`, groupId, title, icon: document.querySelector('#new-section-icon').value || 'book', manualIds: [] });
  document.querySelector('#new-section-title').value = ''; await persistNavigation('Новый подраздел добавлен.');
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
document.querySelector('.exit-constructor').addEventListener('click', () => { document.querySelector('#search').value = ''; });
document.querySelector('#manual-picker').addEventListener('change', (event) => { if (!event.target.value) resetEditor(); else { const manual = manuals.find((item) => item.id === event.target.value); if (manual) hydrateEditor(manual); } });
document.querySelector('#page-properties').addEventListener('input', () => { const slug = pageSlug.value.trim().toLowerCase(); pageSlug.value = slug; refreshEditorCanvas(); });
pageTitle.addEventListener('input', () => { if (!pageSlug.dataset.edited) pageSlug.value = pageTitle.value.toLowerCase().replace(/[а-яё]/g, (char) => ({'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'yo','ж':'zh','з':'z','и':'i','й':'y','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'kh','ц':'ts','ч':'ch','ш':'sh','щ':'shch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'}[char])).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''); refreshEditorCanvas(); });
pageSlug.addEventListener('input', () => { pageSlug.dataset.edited = 'true'; });
document.querySelector('#page-category').addEventListener('change', refreshEditorCanvas);
document.querySelector('#page-manual-icon-file').addEventListener('change', async (event) => { try { const icon = await readCustomIcon(event.target.files?.[0]); if (!icon) return; fillIconOptions(document.querySelector('#page-manual-icon'), icon); refreshEditorCanvas(); setEditorMessage('Иконка мануала загружена. Сохраните мануал, чтобы применить её.'); } catch (error) { setEditorMessage(error.message, 'error'); } finally { event.target.value = ''; } });
document.querySelectorAll('[data-add-block]').forEach((button) => button.addEventListener('click', () => {
  if (!currentManual) currentManual = { id: null, title: pageTitle.value.trim(), category: pageCategory.value, slug: pageSlug.value.trim(), description: pageDescription.value.trim(), status: 'draft', blocks: [] };
  if (button.dataset.addBlock === 'data' && currentManual.blocks.some((block) => block.type === 'data')) return setEditorMessage('В одном мануале может быть одна форма «Твои данные».', 'error');
  const block = defaultBlock(button.dataset.addBlock); currentManual.blocks.push(block); selectedBlockId = block.id; renderBlockInspector(); refreshEditorCanvas(); setEditorMessage(`${blockNames[block.type]} добавлен. Не забудь сохранить.`);
}));
editorCanvas.addEventListener('click', (event) => {
  const nestedAction = event.target.closest('[data-step-item-action]');
  if (nestedAction && currentManual) { const itemWrap = nestedAction.closest('[data-step-item-id]'); const parent = currentManual.blocks.find((item) => item.id === itemWrap?.dataset.parentBlockId); const ix = parent?.items?.findIndex((item) => item.id === itemWrap.dataset.stepItemId); if (!parent || ix < 0) return; const action = nestedAction.dataset.stepItemAction; if (action === 'delete') parent.items.splice(ix, 1); else if (action === 'up' && ix > 0) [parent.items[ix - 1], parent.items[ix]] = [parent.items[ix], parent.items[ix - 1]]; else if (action === 'down' && ix < parent.items.length - 1) [parent.items[ix + 1], parent.items[ix]] = [parent.items[ix], parent.items[ix + 1]]; selectedBlockId = parent.id; renderBlockInspector(); refreshEditorCanvas(); return; }
  const actionButton = event.target.closest('[data-block-action]'); if (!actionButton || actionButton.disabled || !currentManual) return;
  const card = actionButton.closest('[data-block-id]'); const index = currentManual.blocks.findIndex((block) => block.id === card.dataset.blockId); if (index < 0) return;
  const action = actionButton.dataset.blockAction;
  if (action === 'delete') { currentManual.blocks.splice(index, 1); selectedBlockId = null; }
  else if (action === 'up' && index > 0) { const [block] = currentManual.blocks.splice(index, 1); currentManual.blocks.splice(index - 1, 0, block); selectedBlockId = block.id; }
  else if (action === 'down' && index < currentManual.blocks.length - 1) { const [block] = currentManual.blocks.splice(index, 1); currentManual.blocks.splice(index + 1, 0, block); selectedBlockId = block.id; }
  else { selectedBlockId = card.dataset.blockId; }
  renderBlockInspector(); refreshEditorCanvas();
});
editorCanvas.addEventListener('input', (event) => {
  const field = event.target.closest('[contenteditable="true"][data-inline-field]'); if (!field || !currentManual) return;
  const card = field.closest('[data-block-id]'); const block = currentManual.blocks.find((item) => item.id === card?.dataset.blockId); if (!block) return;
  const serialize = (node) => [...node.childNodes].map((child) => {
    if (child.nodeType === Node.TEXT_NODE) return child.nodeValue;
    const content = serialize(child);
    if (child.matches?.('.rich-green')) return `==${content}==`;
    if (child.matches?.('.rich-bold')) return `**${content}**`;
    if (child.matches?.('.rich-italic')) return `*${content}*`;
    if (child.matches?.('.rich-inline-code')) return `\`${content}\``;
    if (child.matches?.('a.rich-link')) return `[${content}](${child.getAttribute('href')})`;
    if (child.tagName === 'BR') return '\n';
    return content;
  }).join('');
  const serialized = serialize(field);
  block[field.dataset.inlineField] = serialized;
  const inspectorField = blockProperties.querySelector(`[data-block-field="${field.dataset.inlineField}"]`);
  if (inspectorField && inspectorField !== document.activeElement) inspectorField.value = serialized;
  setEditorMessage('Изменения внесены. Сохрани черновик или опубликуй мануал.');
});
editorCanvas.addEventListener('keydown', (event) => {
  if (event.target.matches('[contenteditable="true"][data-inline-field="title"]') && event.key === 'Enter') event.preventDefault();
});
async function saveManual(status) {
  const payload = currentPageData(); payload.status = status;
  if (!payload.title || !payload.slug) return setEditorMessage('Заполни название и URL-slug.', 'error');
  const dataBlocks = payload.blocks.filter((block) => block.type === 'data');
  if (dataBlocks.length > 1) return setEditorMessage('Добавь только одну форму «Твои данные» на мануал.', 'error');
  for (const form of dataBlocks) { const keys = form.fields.map((field) => field.key.trim().toLowerCase()); if (keys.some((key) => !/^[a-z][a-z0-9_]{0,39}$/.test(key)) || new Set(keys).size !== keys.length) return setEditorMessage('Проверь ключи полей: только латиница, цифры и _, без повторов.', 'error'); }
  try {
    const saved = await api('/api/admin/manuals', { method: 'PUT', body: JSON.stringify(payload) });
    const ix = manuals.findIndex((item) => item.id === saved.id); if (ix < 0) manuals.push(saved); else manuals[ix] = saved;
    hydrateEditor(saved); renderPicker(); renderManualLinks();
    setEditorMessage(status === 'published' ? 'Инструкция опубликована и доступна посетителям.' : 'Черновик сохранён на сервере.');
    if (status === 'published') { const select = document.querySelector('#manual-picker'); select.value = saved.id; }
  } catch (error) { setEditorMessage(error.message, 'error'); }
}
function updateSpacingSelectionUI() {
  const count = selectedSpacingBlockIds.size;
  const countLabel = document.querySelector('#spacing-selection-count');
  const gapInput = document.querySelector('#selected-block-gap');
  const applyButton = document.querySelector('#apply-selected-block-gap');
  if (countLabel) countLabel.textContent = `${count} выбрано`;
  if (applyButton) applyButton.disabled = count === 0;
  if (gapInput) {
    const blocks = currentManual?.blocks || [];
    const indexes = blocks.map((block, index) => selectedSpacingBlockIds.has(block.id) ? index : -1).filter((index) => index >= 0);
    const affected = indexes.length > 1 ? blocks.slice(indexes[0], indexes[indexes.length - 1]) : indexes.length ? [blocks[indexes[0]]] : [];
    const values = [...new Set(affected.map((block) => normalizeBlockSpacing(block.spacingAfter ?? currentManual?.blockSpacing)))];
    if (values.length === 1) gapInput.value = String(values[0]);
  }
}
document.querySelector('#apply-selected-block-gap')?.addEventListener('click', () => {
  const gap = normalizeBlockSpacing(document.querySelector('#selected-block-gap').value);
  if (!currentManual || !selectedSpacingBlockIds.size) return;
  const indexes = currentManual.blocks.map((block, index) => selectedSpacingBlockIds.has(block.id) ? index : -1).filter((index) => index >= 0);
  const first = indexes[0]; const last = indexes[indexes.length - 1];
  const end = indexes.length > 1 ? last : last + 1;
  currentManual.blocks.slice(first, end).forEach((block) => { block.spacingAfter = gap; });
  refreshEditorCanvas();
  setEditorMessage(`Отступ ${gap} px применён между отмеченными блоками. Сохрани черновик или опубликуй мануал.`);
});
editorCanvas.addEventListener('change', (event) => {
  const checkbox = event.target.closest('[data-spacing-select]');
  if (!checkbox) return;
  if (checkbox.checked) selectedSpacingBlockIds.add(checkbox.dataset.spacingSelect);
  else selectedSpacingBlockIds.delete(checkbox.dataset.spacingSelect);
  updateSpacingSelectionUI();
});
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
  document.querySelectorAll('.nav-group').forEach((group) => { group.hidden = Boolean(normalized) && ![...group.querySelectorAll('.nav-section')].some((section) => !section.hidden); });
}
searchInput.addEventListener('input', () => filterManuals(searchInput.value));
searchInput.addEventListener('focus', () => searchBox.classList.add('open'));
searchInput.addEventListener('blur', () => { if (!searchInput.value && window.innerWidth <= 680) searchBox.classList.remove('open'); });
document.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); searchBox.classList.add('open'); searchInput.focus(); } if (event.key === 'Escape') { searchInput.value = ''; filterManuals(''); searchInput.blur(); closeMobileSidebar(); } });

async function init() {
  try {
    const navigation = await api('/api/navigation'); navigationGroups = navigation.groups || structuredClone(defaultGroups); navigationSections = (navigation.sections || structuredClone(defaultSections)).map((section) => ({ ...section, groupId: section.groupId || navigationGroups[0].id })); categories = Object.fromEntries(navigationSections.map((section) => [section.id, section.title]));
    renderCategoryOptions(); fillIconOptions(document.querySelector('#new-group-icon')); fillIconOptions(document.querySelector('#new-section-icon'));
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

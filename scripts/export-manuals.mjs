import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSelfstealManual } from '../selfsteal-manual.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const docsDir = path.join(root, 'docs', 'manuals');
const bundled = JSON.parse(await readFile(path.join(root, 'content', 'manuals.json'), 'utf8'));
const manuals = [createSelfstealManual(), ...bundled];

function fence(language, source) {
  const longest = Math.max(0, ...[...String(source).matchAll(/`+/g)].map((match) => match[0].length));
  const marker = '`'.repeat(Math.max(3, longest + 1));
  return `${marker}${String(language || '').toLowerCase()}\n${source}\n${marker}`;
}

function table(headers, rows) {
  if (!Array.isArray(headers) || !Array.isArray(rows)) return '';
  const cell = (value) => String(value ?? '').replaceAll('|', '\\|').replaceAll('\n', '<br>');
  return [
    `| ${headers.map(cell).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(cell).join(' | ')} |`)
  ].join('\n');
}

function renderNode(block, { stepItem = false } = {}) {
  if (!block || typeof block !== 'object') return '';
  if (block.type === 'text') return block.text || '';
  if (block.type === 'code') return fence(block.language, block.code || '');
  if (block.type === 'note') {
    const title = block.title ? `**${block.title}**  \n` : '';
    return `> ${title}${String(block.text || '').replaceAll('\n', '\n> ')}`;
  }
  if (block.type === 'table') return table(block.headers, block.rows);
  if (block.type === 'image') return block.src ? `![${block.alt || ''}](${block.src})` : (block.alt || '');
  if (block.type === 'divider') return '---';
  if (block.type === 'step') {
    const heading = stepItem ? `**${block.title || 'Шаг'}**` : `## ${block.title || 'Шаг'}`;
    const body = [block.text, ...(block.items || []).map((item) => renderNode(item, { stepItem: true }))].filter(Boolean);
    return [heading, ...body].join('\n\n');
  }
  if (block.type === 'heading') return `${'#'.repeat(Math.min(4, Math.max(2, Number(block.level) || 2)))} ${block.title || ''}`;
  if (block.type === 'accordion') {
    const body = [block.text, ...(block.items || []).map((item) => renderNode(item, { stepItem: true }))].filter(Boolean).join('\n\n');
    return `<details>\n<summary>${block.title || 'Подробнее'}</summary>\n\n${body}\n\n</details>`;
  }
  if (block.type === 'tabs') {
    return (block.tabs || []).map((tab) => [`### ${tab.title || 'Вариант'}`, tab.text, tab.code ? fence(tab.language, tab.code) : ''].filter(Boolean).join('\n\n')).join('\n\n');
  }
  if (block.type === 'data') {
    const fields = block.fields || [];
    return [
      '## Твои данные',
      'Заполни поля в форме на сайте: их значения подставляются в примеры по всей инструкции. Примеры ниже показывают поля и подсказки.',
      table(['Переменная', 'Поле', 'Пример', 'Подсказка'], fields.map((field) => [field.key, field.label, field.placeholder, field.help]))
    ].join('\n\n');
  }
  return '';
}

await mkdir(docsDir, { recursive: true });
for (const manual of manuals) {
  const slug = manual.slug || manual.path.split('/').filter(Boolean).at(-1);
  const lines = [
    `# ${manual.title}`,
    '',
    `**Раздел:** ${manual.category}  `,
    `**Адрес:** ${manual.path}`,
    '',
    manual.description || '',
    '',
    ...(manual.blocks || []).map((block) => renderNode(block)).filter(Boolean)
  ];
  await writeFile(path.join(docsDir, `${slug}.md`), `${lines.join('\n\n').trim()}\n`, 'utf8');
}

// Block-based guide layouts: templates, schema validation / sanitizing, pure
// block operations (add / move / reorder / re-home) and markdown conversion.
// Everything here is pure so the page builder, the API and the public renderer
// share one definition and the logic is unit tested without a browser.

import { headingIdFactory } from './guideContent.mjs';

export const LAYOUT_VERSION = 1;
export const MAX_BLOCKS = 300;
export const MAX_LAYOUT_JSON = 500000;
export const MAX_TEXT = 30000;
export const MAX_GRID_IMAGES = 4;
export const MAX_TABLE_ROWS = 30;
export const MAX_TABLE_COLS = 8;

export const BLOCK_TYPES = ['heading', 'text', 'image', 'imagegrid', 'callout', 'divider', 'button', 'video', 'table'];

export const BLOCK_LABELS = {
  heading: 'Heading',
  text: 'Text',
  image: 'Image',
  imagegrid: 'Image grid',
  callout: 'Callout',
  divider: 'Divider',
  button: 'Button',
  video: 'Video',
  table: 'Table',
};

// role is used to re-home blocks when the template changes:
// top (intro/hero), main (primary reading column), side (sidebar), bottom (notes).
export const TEMPLATES = [
  {
    id: 'article',
    name: 'Article',
    description: 'A header area above one reading column.',
    areas: [
      { id: 'header', label: 'Header', role: 'top' },
      { id: 'main', label: 'Main column', role: 'main' },
    ],
  },
  {
    id: 'sidebar-right',
    name: 'Sidebar right',
    description: 'Main content with a narrow sidebar for tips and links.',
    areas: [
      { id: 'main', label: 'Main column', role: 'main' },
      { id: 'sidebar', label: 'Sidebar', role: 'side' },
    ],
  },
  {
    id: 'two-columns',
    name: 'Two columns',
    description: 'An intro, then two equal columns side by side.',
    areas: [
      { id: 'intro', label: 'Intro', role: 'top' },
      { id: 'left', label: 'Left column', role: 'main' },
      { id: 'right', label: 'Right column', role: 'side' },
    ],
  },
  {
    id: 'hero-steps',
    name: 'Hero + steps',
    description: 'A hero image and title area, numbered step sections and a callout column.',
    areas: [
      { id: 'hero', label: 'Hero', role: 'top' },
      { id: 'steps', label: 'Steps', role: 'main' },
      { id: 'callout', label: 'Callouts', role: 'side' },
    ],
  },
  {
    id: 'gallery',
    name: 'Gallery guide',
    description: 'An intro, a grid of images and notes underneath.',
    areas: [
      { id: 'intro', label: 'Intro', role: 'top' },
      { id: 'gallery', label: 'Image grid', role: 'main' },
      { id: 'notes', label: 'Notes', role: 'bottom' },
    ],
  },
];

export const DEFAULT_TEMPLATE = 'article';

export function getTemplate(id) {
  return TEMPLATES.find(t => t.id === id) || null;
}

export function areaIds(templateId) {
  return (getTemplate(templateId)?.areas || []).map(a => a.id);
}

export function emptyLayout(templateId = DEFAULT_TEMPLATE) {
  const template = getTemplate(templateId) || getTemplate(DEFAULT_TEMPLATE);
  return { version: LAYOUT_VERSION, template: template.id, areas: Object.fromEntries(template.areas.map(a => [a.id, []])) };
}

export function slugifyTitle(value) {
  return String(value || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

// ---------------------------------------------------------------- ids

export function newBlockId(rand = Math.random) {
  return `b${Math.floor(rand() * 36 ** 6).toString(36).padStart(6, '0')}${Date.now().toString(36).slice(-3)}`;
}

const ID_RE = /^[A-Za-z0-9_-]{1,40}$/;

// ---------------------------------------------------------------- sanitizers

const clip = (value, max) => (typeof value === 'string' ? value : '').slice(0, max);
const pick = (value, options, fallback) => (options.includes(value) ? value : fallback);

// Links: http(s), mailto, same-site paths and in-page anchors only.
export function sanitizeUrl(value, max = 2000) {
  const url = clip(value, max + 1).trim();
  if (!url || url.length > max) return '';
  if (/^(https?:\/\/|mailto:)/i.test(url)) return /[\s<>"']/.test(url) ? '' : url;
  if (/^(\/(?!\/)|#)/.test(url)) return /[\s<>"']/.test(url) ? '' : url;
  return '';
}

const DATA_IMAGE_RE = /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

// Images: our own upload route, https URLs, or legacy inline data URLs.
export function sanitizeImageSrc(value) {
  const raw = clip(value, 140001).trim();
  if (!raw) return '';
  if (raw.startsWith('data:')) return raw.length <= 140000 && DATA_IMAGE_RE.test(raw) ? raw : null;
  if (raw.length > 2000) return null;
  if (/^\/api\/guide-images\/[A-Za-z0-9._-]+$/.test(raw)) return raw;
  if (/^https:\/\/[^\s<>"']+$/i.test(raw)) return raw;
  return null;
}

// Markdown that is rendered later through rehype-sanitize; this is the
// save-time pass: raw HTML tags and script-like link targets are removed.
export function sanitizeMarkdown(value, max = MAX_TEXT) {
  let md = clip(value, max).replace(/\r\n?/g, '\n');
  md = md.replace(/<\/?(?!https?:|mailto:)[a-zA-Z][^>]*>/g, '');
  md = md.replace(/\]\(\s*(?:javascript|vbscript|data(?!:image\/(?:png|jpe?g|webp|gif);base64,)):/gi, '](#blocked:');
  return md;
}

const YT_HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com', 'youtu.be']);
const YT_ID = /^[\w-]{11}$/;

export function youtubeId(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return '';
    if (!YT_HOSTS.has(url.hostname)) return '';
    let id = '';
    if (url.hostname === 'youtu.be') id = url.pathname.slice(1).split('/')[0];
    else if (url.pathname === '/watch') id = url.searchParams.get('v') || '';
    else {
      const m = url.pathname.match(/^\/(?:embed|shorts|live|v)\/([\w-]{11})/);
      if (m) id = m[1];
    }
    return YT_ID.test(id) ? id : '';
  } catch {
    return '';
  }
}

export function youtubeWatchUrl(value) {
  const id = youtubeId(value);
  return id ? `https://www.youtube.com/watch?v=${id}` : '';
}

// ---------------------------------------------------------------- blocks

export function createBlock(type, rand = Math.random) {
  const id = newBlockId(rand);
  switch (type) {
    case 'heading': return { id, type, level: 2, text: 'New heading' };
    case 'text': return { id, type, md: 'Write something helpful here. Select the text to format it.' };
    case 'image': return { id, type, src: '', alt: '', decorative: false, caption: '', width: 'full', align: 'center' };
    case 'imagegrid': return { id, type, images: [] };
    case 'callout': return { id, type, tone: 'tip', title: 'Tip', md: 'Share a quick pointer or warning.' };
    case 'divider': return { id, type };
    case 'button': return { id, type, label: 'Read more', href: '', variant: 'primary', align: 'left' };
    case 'video': return { id, type, url: '', title: '' };
    case 'table': return { id, type, header: true, rows: [['Column A', 'Column B'], ['', ''], ['', '']] };
    default: return null;
  }
}

function sanitizeImageItem(raw) {
  const src = sanitizeImageSrc(raw?.src);
  if (src === null) return { error: 'An image address is not allowed. Upload the image instead.' };
  return { item: { src, alt: clip(raw?.alt, 300).trim(), decorative: raw?.decorative === true } };
}

// Returns { block } or { error }. Unknown types are rejected, not dropped.
export function sanitizeBlock(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Each block must be an object.' };
  const type = raw.type;
  if (!BLOCK_TYPES.includes(type)) return { error: `Unknown block type "${String(type).slice(0, 30)}".` };
  const block = { id: ID_RE.test(raw.id || '') ? raw.id : newBlockId(), type };
  switch (type) {
    case 'heading':
      block.level = raw.level === 3 ? 3 : 2;
      block.text = clip(raw.text, 200).replace(/\s+/g, ' ');
      break;
    case 'text':
      block.md = sanitizeMarkdown(raw.md);
      break;
    case 'image': {
      const { item, error } = sanitizeImageItem(raw);
      if (error) return { error };
      Object.assign(block, item);
      block.caption = clip(raw.caption, 300).trim();
      block.width = pick(raw.width, ['small', 'medium', 'full'], 'full');
      block.align = pick(raw.align, ['left', 'center', 'right'], 'center');
      break;
    }
    case 'imagegrid': {
      const list = Array.isArray(raw.images) ? raw.images : [];
      if (list.length > MAX_GRID_IMAGES) return { error: `An image grid holds at most ${MAX_GRID_IMAGES} images.` };
      block.images = [];
      for (const entry of list) {
        const { item, error } = sanitizeImageItem(entry);
        if (error) return { error };
        block.images.push(item);
      }
      break;
    }
    case 'callout':
      block.tone = pick(raw.tone, ['info', 'warn', 'tip'], 'info');
      block.title = clip(raw.title, 120).trim();
      block.md = sanitizeMarkdown(raw.md, 5000);
      break;
    case 'button':
      block.label = clip(raw.label, 80).trim();
      block.href = sanitizeUrl(raw.href);
      block.variant = pick(raw.variant, ['primary', 'secondary'], 'primary');
      block.align = pick(raw.align, ['left', 'center', 'right'], 'left');
      break;
    case 'video': {
      const url = clip(raw.url, 300).trim();
      if (url && !youtubeId(url)) return { error: 'Video blocks accept YouTube links only.' };
      block.url = url;
      block.title = clip(raw.title, 120).trim();
      break;
    }
    case 'table': {
      const rows = Array.isArray(raw.rows) ? raw.rows : [];
      if (rows.length > MAX_TABLE_ROWS) return { error: `A table holds at most ${MAX_TABLE_ROWS} rows.` };
      const cols = Math.max(0, ...rows.map(r => (Array.isArray(r) ? r.length : 0)));
      if (cols > MAX_TABLE_COLS) return { error: `A table holds at most ${MAX_TABLE_COLS} columns.` };
      block.header = raw.header !== false;
      block.rows = rows.map(r => Array.from({ length: cols }, (_, i) => clip(Array.isArray(r) ? r[i] : '', 300)));
      break;
    }
    default:
  }
  return { block };
}

// Validate an entire layout from an untrusted payload. Returns { layout } or
// { error }. With requireAlt, images need alt text (or decorative) - used when
// a guide is published.
export function validateLayout(raw, { requireAlt = false } = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { error: 'Layout must be an object.' };
  let size = 0;
  try { size = JSON.stringify(raw).length; } catch { return { error: 'Layout could not be read.' }; }
  if (size > MAX_LAYOUT_JSON) return { error: 'This guide layout is too large. Remove some content or inline images.' };
  if (raw.version !== LAYOUT_VERSION) return { error: 'Unsupported layout version.' };
  const template = getTemplate(raw.template);
  if (!template) return { error: 'Unknown page template.' };
  if (!raw.areas || typeof raw.areas !== 'object' || Array.isArray(raw.areas)) return { error: 'Layout areas are missing.' };
  const allowed = new Set(template.areas.map(a => a.id));
  for (const key of Object.keys(raw.areas)) {
    if (!allowed.has(key)) return { error: `Area "${key.slice(0, 30)}" does not belong to the ${template.name} template.` };
  }
  const areas = {};
  const seen = new Set();
  let count = 0;
  for (const area of template.areas) {
    const list = raw.areas[area.id] ?? [];
    if (!Array.isArray(list)) return { error: `Area "${area.id}" must be a list of blocks.` };
    areas[area.id] = [];
    for (const entry of list) {
      if (++count > MAX_BLOCKS) return { error: `A guide holds at most ${MAX_BLOCKS} blocks.` };
      const { block, error } = sanitizeBlock(entry);
      if (error) return { error };
      while (seen.has(block.id)) block.id = newBlockId();
      seen.add(block.id);
      areas[area.id].push(block);
    }
  }
  const layout = { version: LAYOUT_VERSION, template: template.id, areas };
  if (requireAlt) {
    const missing = imagesMissingAlt(layout);
    if (missing.length) return { error: `Add alt text (or mark as decorative) for ${missing.length} image${missing.length > 1 ? 's' : ''} before publishing.` };
  }
  return { layout };
}

// ---------------------------------------------------------------- queries

export function layoutBlocks(layout) {
  const template = getTemplate(layout?.template);
  if (!template) return [];
  return template.areas.flatMap(area => (layout.areas?.[area.id] || []).map(block => ({ block, areaId: area.id })));
}

export function findBlock(layout, id) {
  for (const area of areaIds(layout?.template)) {
    const index = (layout.areas?.[area] || []).findIndex(b => b.id === id);
    if (index >= 0) return { areaId: area, index, block: layout.areas[area][index] };
  }
  return null;
}

export function imagesMissingAlt(layout) {
  const missing = [];
  for (const { block } of layoutBlocks(layout)) {
    const items = block.type === 'image' ? [block] : block.type === 'imagegrid' ? block.images : [];
    for (const item of items) if (item.src && !item.decorative && !String(item.alt || '').trim()) missing.push(block.id);
  }
  return missing;
}

export function collectImages(layout) {
  const seen = new Set();
  for (const { block } of layoutBlocks(layout)) {
    const items = block.type === 'image' ? [block] : block.type === 'imagegrid' ? block.images : [];
    for (const item of items) if (item.src) seen.add(item.src);
  }
  return [...seen];
}

// Anchors for heading blocks in reading order (same factory as markdown headings).
export function layoutHeadings(layout) {
  const nextId = headingIdFactory();
  const headings = [];
  for (const { block } of layoutBlocks(layout)) {
    if (block.type !== 'heading' || !block.text.trim()) continue;
    headings.push({ blockId: block.id, level: block.level, text: block.text.trim(), id: nextId(block.text) });
  }
  return headings;
}

export function layoutIsEmpty(layout) {
  return layoutBlocks(layout).length === 0;
}

// ---------------------------------------------------------------- operations (immutable)

function cloneAreas(layout) {
  return Object.fromEntries(Object.entries(layout.areas).map(([k, v]) => [k, [...v]]));
}

export function addBlock(layout, areaId, block, index) {
  if (!areaIds(layout.template).includes(areaId)) return layout;
  const areas = cloneAreas(layout);
  const list = areas[areaId] || (areas[areaId] = []);
  const at = index == null ? list.length : Math.max(0, Math.min(index, list.length));
  list.splice(at, 0, block);
  return { ...layout, areas };
}

export function removeBlock(layout, id) {
  const found = findBlock(layout, id);
  if (!found) return layout;
  const areas = cloneAreas(layout);
  areas[found.areaId].splice(found.index, 1);
  return { ...layout, areas };
}

// toIndex is the final position inside the destination area.
export function moveBlock(layout, id, toAreaId, toIndex) {
  const found = findBlock(layout, id);
  if (!found || !areaIds(layout.template).includes(toAreaId)) return layout;
  const areas = cloneAreas(layout);
  areas[found.areaId].splice(found.index, 1);
  const dest = areas[toAreaId];
  const at = toIndex == null ? dest.length : Math.max(0, Math.min(toIndex, dest.length));
  if (found.areaId === toAreaId && at === found.index) return layout;
  dest.splice(at, 0, found.block);
  return { ...layout, areas };
}

// Keyboard-friendly nudge: moves one step inside the area, crossing into the
// neighbouring area at the edges (in template order) so nothing is unreachable.
export function nudgeBlock(layout, id, direction) {
  const found = findBlock(layout, id);
  if (!found) return layout;
  const order = areaIds(layout.template);
  const list = layout.areas[found.areaId];
  const target = found.index + direction;
  if (target >= 0 && target < list.length) return moveBlock(layout, id, found.areaId, target);
  const nextArea = order[order.indexOf(found.areaId) + direction];
  if (!nextArea) return layout;
  return moveBlock(layout, id, nextArea, direction > 0 ? 0 : layout.areas[nextArea].length);
}

export function updateBlock(layout, id, patch) {
  const found = findBlock(layout, id);
  if (!found) return layout;
  const areas = cloneAreas(layout);
  areas[found.areaId][found.index] = { ...found.block, ...patch, id: found.block.id, type: found.block.type };
  return { ...layout, areas };
}

export function duplicateBlock(layout, id, rand = Math.random) {
  const found = findBlock(layout, id);
  if (!found) return { layout, id: null };
  const copy = JSON.parse(JSON.stringify(found.block));
  copy.id = newBlockId(rand);
  return { layout: addBlock(layout, found.areaId, copy, found.index + 1), id: copy.id };
}

const ROLE_FALLBACK = {
  top: ['top', 'main'],
  main: ['main'],
  side: ['side', 'bottom', 'main'],
  bottom: ['bottom', 'side', 'main'],
};

// Switch templates without ever deleting content: each block lands in the
// nearest area (by role) of the new template, in reading order.
export function switchTemplate(layout, templateId) {
  const next = getTemplate(templateId);
  const current = getTemplate(layout?.template);
  if (!next || !current || next.id === current.id) return layout;
  const areas = Object.fromEntries(next.areas.map(a => [a.id, []]));
  const mainArea = next.areas.find(a => a.role === 'main') || next.areas[0];
  for (const area of current.areas) {
    const candidates = ROLE_FALLBACK[area.role] || ['main'];
    let target = null;
    for (const role of candidates) {
      target = next.areas.find(a => a.role === role);
      if (target) break;
    }
    // A same-id area keeps its own blocks when roles disagree.
    if (next.areas.some(a => a.id === area.id) && !target) target = next.areas.find(a => a.id === area.id);
    areas[(target || mainArea).id].push(...(layout.areas?.[area.id] || []));
  }
  return { ...layout, template: next.id, areas };
}

// ---------------------------------------------------------------- markdown <-> blocks

const IMAGE_LINE = /^!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/;
const HEADING_LINE = /^(#{1,3})\s+(.+?)\s*#*\s*$/;
const RULE_LINE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;

function flushText(buffer, blocks) {
  const md = buffer.join('\n').replace(/^\n+|\n+$/g, '');
  buffer.length = 0;
  if (md.trim()) blocks.push({ id: newBlockId(), type: 'text', md });
}

// Convert classic markdown into blocks: ## / ### headings, stand-alone images
// and rules become their own blocks; everything else stays as text blocks so no
// content is lost (lists, tables, quotes, code fences).
export function markdownToBlocks(markdown) {
  const blocks = [];
  const buffer = [];
  let fence = false;
  for (const line of String(markdown || '').replace(/\r\n?/g, '\n').split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; buffer.push(line); continue; }
    if (fence) { buffer.push(line); continue; }
    const heading = line.match(HEADING_LINE);
    const image = line.match(IMAGE_LINE);
    if (heading) {
      flushText(buffer, blocks);
      blocks.push({ id: newBlockId(), type: 'heading', level: heading[1].length >= 3 ? 3 : 2, text: heading[2].replace(/[*_`]/g, '').trim() });
    } else if (image && sanitizeImageSrc(image[2])) {
      flushText(buffer, blocks);
      const alt = image[1].trim();
      blocks.push({ id: newBlockId(), type: 'image', src: image[2], alt, decorative: !alt, caption: '', width: 'full', align: 'center' });
    } else if (RULE_LINE.test(line) && (buffer.length === 0 || buffer[buffer.length - 1].trim() === '')) {
      flushText(buffer, blocks);
      blocks.push({ id: newBlockId(), type: 'divider' });
    } else {
      buffer.push(line);
    }
  }
  flushText(buffer, blocks);
  return blocks;
}

export function markdownToLayout(markdown, templateId = DEFAULT_TEMPLATE) {
  const layout = emptyLayout(templateId);
  const template = getTemplate(layout.template);
  const target = (template.areas.find(a => a.role === 'main') || template.areas[0]).id;
  layout.areas[target] = markdownToBlocks(markdown);
  return layout;
}

function quote(md) {
  return md.split('\n').map(line => `> ${line}`.trimEnd()).join('\n');
}

export function blockToMarkdown(block) {
  switch (block.type) {
    case 'heading': return block.text.trim() ? `${'#'.repeat(block.level === 3 ? 3 : 2)} ${block.text.trim()}` : '';
    case 'text': return block.md.trim();
    case 'image': return block.src ? `![${block.alt.replace(/[[\]\\\n]/g, ' ')}](${block.src})${block.caption ? `\n\n*${block.caption.replace(/\n/g, ' ')}*` : ''}` : '';
    case 'imagegrid': return block.images.filter(i => i.src).map(i => `![${i.alt.replace(/[[\]\\\n]/g, ' ')}](${i.src})`).join('\n\n');
    case 'callout': return quote(`**${block.title || { info: 'Note', warn: 'Warning', tip: 'Tip' }[block.tone]}**${block.md.trim() ? `\n\n${block.md.trim()}` : ''}`);
    case 'divider': return '---';
    case 'button': return block.href && block.label ? `[${block.label}](${block.href})` : '';
    case 'video': return youtubeWatchUrl(block.url) ? `[${block.title || 'Watch on YouTube'}](${youtubeWatchUrl(block.url)})` : '';
    case 'table': {
      const rows = block.rows.filter(r => r.length);
      if (!rows.length) return '';
      const cell = c => String(c).replace(/\|/g, '\\|').replace(/\n/g, ' ');
      const head = block.header ? rows[0] : rows[0].map(() => '');
      const body = block.header ? rows.slice(1) : rows;
      return [`| ${head.map(cell).join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`, ...body.map(r => `| ${r.map(cell).join(' | ')} |`)].join('\n');
    }
    default: return '';
  }
}

// Plain markdown for search, descriptions and the legacy `body` field.
export function layoutToMarkdown(layout) {
  return layoutBlocks(layout).map(({ block }) => blockToMarkdown(block)).filter(Boolean).join('\n\n');
}

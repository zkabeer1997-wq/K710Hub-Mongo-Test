// Rich text for guide text blocks. The builder edits text in place with a
// contentEditable surface, but what is SAVED is still the same small markdown
// subset that the server sanitises and the public page renders through
// rehype-sanitize. Pure string code (no DOM) so it is unit tested and so pasted
// HTML is parsed by our own whitelist tokenizer, never inserted as-is.

import { sanitizeMarkdown, sanitizeUrl } from './guideLayout.mjs';

// ---------------------------------------------------------------- html tokenizer

const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'wbr', 'col']);
const DROP_CONTENT = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'embed', 'svg', 'math', 'head', 'title', 'textarea', 'select', 'button']);
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '-', mdash: '-', hellip: '...', rsquo: "'", lsquo: "'", rdquo: '"', ldquo: '"' };

export function decodeEntities(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return code > 0 && code < 0x10ffff && !(code >= 0xd800 && code < 0xe000) ? String.fromCodePoint(code) : '';
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*>|<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>"'])*)>|[^<]+|</g;

function attr(raw, name) {
  const m = new RegExp(`(?:^|\\s)${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s"'>]+))`, 'i').exec(raw || '');
  return m ? decodeEntities(m[1] ?? m[2] ?? m[3] ?? '') : '';
}

export function parseHtml(html) {
  const root = { tag: '#root', children: [] };
  const stack = [root];
  let skip = null; // tag name whose content is being dropped
  for (const m of String(html || '').matchAll(TOKEN)) {
    const [whole, closing, rawTag, rawAttrs] = m;
    if (rawTag) {
      const tag = rawTag.toLowerCase();
      if (skip) {
        if (closing && tag === skip) skip = null;
        continue;
      }
      if (closing) {
        for (let i = stack.length - 1; i > 0; i -= 1) {
          if (stack[i].tag === tag) { stack.length = i; break; }
        }
        continue;
      }
      if (DROP_CONTENT.has(tag)) { if (!/\/\s*$/.test(rawAttrs)) skip = tag; continue; }
      const node = { tag, href: tag === 'a' ? attr(rawAttrs, 'href') : '', children: [] };
      stack[stack.length - 1].children.push(node);
      if (!VOID.has(tag) && !/\/\s*$/.test(rawAttrs)) stack.push(node);
    } else if (!skip && !whole.startsWith('<!') && !whole.startsWith('<?') && whole !== '<') {
      stack[stack.length - 1].children.push({ tag: '#text', text: decodeEntities(whole) });
    } else if (!skip && whole === '<') {
      stack[stack.length - 1].children.push({ tag: '#text', text: '<' });
    }
  }
  return root;
}

// ---------------------------------------------------------------- html -> markdown

export function escapeMd(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/([*`[\]])|(?<![A-Za-z0-9])_|_(?![A-Za-z0-9])/g, m => `\\${m}`)
    .replace(/&(?=#?\w+;)/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function inline(node, out = []) {
  for (const child of node.children || []) {
    if (child.tag === '#text') { out.push(escapeMd(child.text.replace(/\s+/g, ' '))); continue; }
    const inner = inlineString(child);
    switch (child.tag) {
      case 'b': case 'strong': out.push(wrapMark(inner, '**')); break;
      case 'i': case 'em': case 'cite': out.push(wrapMark(inner, '*')); break;
      case 'code': out.push(inner.trim() ? `\`${child.children.map(c => c.text || '').join('').replace(/`/g, '')}\`` : ''); break;
      case 'br': out.push('\\\n'); break;
      case 'a': {
        const href = sanitizeUrl(child.href);
        out.push(href && inner.trim() ? `[${inner.replace(/\\\n/g, ' ')}](${href.replace(/[()]/g, c => (c === '(' ? '%28' : '%29'))})` : inner);
        break;
      }
      case 'span': case 'u': case 'font': case 'mark': case 'small': case 'sub': case 'sup': case 'abbr': case 'time': case 'label':
        out.push(inner); break;
      default: out.push(inner);
    }
  }
  return out;
}
function inlineString(node) { return inline(node).join(''); }

// "**a**" must have non-space edges; move surrounding whitespace outside.
function wrapMark(inner, mark) {
  if (!inner.trim()) return inner;
  const lead = inner.match(/^\s*/)[0];
  const trail = inner.match(/\s*$/)[0];
  return `${lead}${mark}${inner.trim()}${mark}${trail}`;
}

const BLOCK_TAGS = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav', 'figure', 'figcaption', 'blockquote', 'pre', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'form', 'address']);

// Walk block-level structure. Inline runs between blocks become paragraphs.
function blocks(node, out, listCtx = null) {
  let run = [];
  const flush = () => {
    const text = run.join('').replace(/^(\\\n)+|(\\\n)+$/g, '').replace(/[ \t]+\n/g, '\n').trim();
    run = [];
    if (text) out.push(listCtx ? { kind: 'p', text } : { kind: 'p', text: text.replace(/^(#{1,6}\s|[-+]\s|\d+\.\s|>)/, m => `\\${m}`) });
  };
  for (const child of node.children || []) {
    const tag = child.tag;
    if (tag === '#text') { run.push(escapeMd(child.text.replace(/\s+/g, ' '))); continue; }
    if (!BLOCK_TAGS.has(tag)) { run.push(...inline({ children: [child] })); continue; }
    flush();
    if (/^h[1-6]$/.test(tag)) {
      const text = inlineString(child).replace(/\\\n/g, ' ').replace(/\*\*/g, '').trim();
      if (text) out.push({ kind: 'h', level: tag === 'h1' || tag === 'h2' ? 2 : 3, text });
    } else if (tag === 'ul' || tag === 'ol') {
      const items = [];
      for (const li of child.children) {
        if (li.tag !== 'li') continue;
        const sub = [];
        blocks(li, sub, { ordered: tag === 'ol' });
        const text = sub.map(b => b.text).join(' ').trim();
        if (text) items.push(text.replace(/\\\n/g, ' '));
      }
      if (items.length) out.push({ kind: tag, items });
    } else if (tag === 'hr') {
      // dividers are their own block type; ignore pasted rules
    } else if (tag === 'tr' || tag === 'li' || tag === 'dt' || tag === 'dd' || tag === 'td' || tag === 'th' || tag === 'blockquote' || tag === 'pre' || tag === 'table' || tag === 'thead' || tag === 'tbody' || tag === 'tfoot') {
      blocks(child, out, listCtx);
    } else {
      blocks(child, out, listCtx);
    }
  }
  flush();
}

export function htmlToMarkdown(html) {
  const tree = parseHtml(html);
  const out = [];
  blocks(tree, out);
  const md = out.map(b => {
    if (b.kind === 'h') return `${'#'.repeat(b.level)} ${b.text}`;
    if (b.kind === 'ul') return b.items.map(t => `- ${t}`).join('\n');
    if (b.kind === 'ol') return b.items.map((t, i) => `${i + 1}. ${t}`).join('\n');
    return b.text;
  }).join('\n\n');
  return sanitizeMarkdown(md);
}

// ---------------------------------------------------------------- markdown -> editor html

const escHtml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const PUNCT = /[\\`*_{}[\]()#+\-.!<>&|~]/;

function inlineMdToHtml(src) {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '\\') {
      if (src[i + 1] === '\n') { out += '<br>'; i += 2; continue; }
      if (i + 1 < src.length && PUNCT.test(src[i + 1])) { out += escHtml(src[i + 1]); i += 2; continue; }
      out += '\\'; i += 1; continue;
    }
    if (ch === '&') {
      const m = /^&(amp|lt|gt|quot|#\d+|#x[0-9a-f]+);/i.exec(src.slice(i));
      if (m) { out += escHtml(decodeEntities(m[0])); i += m[0].length; continue; }
    }
    if (ch === '*' || (ch === '_' && !/[A-Za-z0-9]/.test(src[i - 1] || ''))) {
      const double = src[i + 1] === ch;
      const mark = double ? ch + ch : ch;
      const close = findClose(src, i + mark.length, mark);
      if (close > i + mark.length) {
        const inner = inlineMdToHtml(src.slice(i + mark.length, close));
        out += double ? `<strong>${inner}</strong>` : `<em>${inner}</em>`;
        i = close + mark.length;
        continue;
      }
    }
    if (ch === '`') {
      const end = src.indexOf('`', i + 1);
      if (end > i + 1) { out += `<code>${escHtml(src.slice(i + 1, end))}</code>`; i = end + 1; continue; }
    }
    if (ch === '[') {
      const m = /^\[((?:\\.|[^\]\\])*)\]\(([^)\s]+)\)/.exec(src.slice(i));
      if (m) {
        const href = sanitizeUrl(m[2].replace(/%28/g, '(').replace(/%29/g, ')'));
        if (href) { out += `<a href="${escHtml(href)}">${inlineMdToHtml(m[1])}</a>`; i += m[0].length; continue; }
      }
    }
    out += escHtml(ch);
    i += 1;
  }
  return out;
}

function findClose(src, from, mark) {
  for (let j = from; j < src.length; j += 1) {
    if (src[j] === '\\') { j += 1; continue; }
    if (src.startsWith(mark, j) && j > from && !/\s/.test(src[j - 1]) && (mark.length === 2 || src[j + 1] !== mark[0]) && !(mark[0] === '_' && /[A-Za-z0-9]/.test(src[j + mark.length] || ''))) return j;
    if (src[j] === '`') { const e = src.indexOf('`', j + 1); if (e > 0) j = e; }
  }
  return -1;
}

// True when the markdown only uses constructs the in-place editor can express
// and write back unchanged. Anything else (tables, code fences, quotes, nested
// lists, images, rules, raw html) keeps the plain markdown editor.
export function isEditableMarkdown(md) {
  const text = String(md || '').replace(/\r\n?/g, '\n');
  if (/<\/?[a-zA-Z]/.test(text)) return false;
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    if (/^\s{2,}\S/.test(line) || /^\t/.test(line)) return false;
    if (/^\s*(```|~~~|>|\||---+\s*$|\*\*\*+\s*$|___+\s*$|#{1}\s|#{4,}\s)/.test(line)) return false;
    if (/!\[[^\]]*\]\(/.test(line) || line.includes('|')) return false;
    if (/^\[[^\]]+\]:\s/.test(line)) return false;
    if (/(^|[^\\])~~/.test(line)) return false;
  }
  return true;
}

export function markdownToEditorHtml(md) {
  const text = String(md || '').replace(/\r\n?/g, '\n').trim();
  if (!text) return '<p><br></p>';
  const html = [];
  for (const chunk of text.split(/\n{2,}/)) {
    const lines = chunk.split('\n');
    if (lines.every(l => /^[-*]\s+/.test(l))) html.push(`<ul>${lines.map(l => `<li>${inlineMdToHtml(l.replace(/^[-*]\s+/, ''))}</li>`).join('')}</ul>`);
    else if (lines.every(l => /^\d+\.\s+/.test(l))) html.push(`<ol>${lines.map(l => `<li>${inlineMdToHtml(l.replace(/^\d+\.\s+/, ''))}</li>`).join('')}</ol>`);
    else if (lines.length === 1 && /^#{2,3}\s+/.test(lines[0])) {
      const level = lines[0].match(/^#+/)[0].length;
      html.push(`<h${level}>${inlineMdToHtml(lines[0].replace(/^#+\s+/, ''))}</h${level}>`);
    } else {
      // Lines inside one paragraph are soft breaks; keep them as a line break.
      html.push(`<p>${lines.map(l => inlineMdToHtml(l.replace(/ {2,}$/, '').replace(/(^|[^\\])\\$/, '$1'))).join('<br>')}</p>`);
    }
  }
  return html.join('');
}

// Serialize editor content back to markdown. Same whitelist path as paste.
export function editorHtmlToMarkdown(html) {
  return htmlToMarkdown(html);
}

// Plain text pasted into the editor: paragraphs and line breaks, no markdown.
export function plainTextToEditorHtml(text) {
  const paras = String(text || '').replace(/\r\n?/g, '\n').split(/\n{2,}/).map(p => p.trim()).filter(Boolean);
  return paras.map(p => `<p>${p.split('\n').map(l => escHtml(l.trim())).join('<br>')}</p>`).join('');
}

// Make a typed link address safe and complete ("example.com" -> https://...).
export function normalizeLinkAddress(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^(https?:\/\/|mailto:|\/|#)/i.test(text)) return sanitizeUrl(text);
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) return sanitizeUrl(`mailto:${text}`);
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) return sanitizeUrl(`https://${text}`);
  return '';
}

const bare = s => String(s).replace(/&(amp|lt|gt);/g, '').replace(/\d+\.(?=\s)/g, '').replace(/[\s*_\\#`\-<>&]/g, '');

// The in-place editor is used only when a round trip keeps every character of
// the text (formatting symbols aside); otherwise the markdown editor is shown
// so nothing can be silently lost.
export function canEditInPlace(md) {
  if (!isEditableMarkdown(md)) return false;
  return bare(editorHtmlToMarkdown(markdownToEditorHtml(md))) === bare(md);
}

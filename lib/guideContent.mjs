// Pure helpers that derive guide presentation from the stored content:
// reading time, table of contents, link labels, subtitle de-duplication and
// the visible updated date. Shared by the server routes and the article view.

const WORDS_PER_MINUTE = 200;
export const TOC_MIN_HEADINGS = 3;
export const TOC_MIN_WORDS = 600;

function stripMarkdown(markdown) {
  return String(markdown || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[#>*_`|~-]+/g, ' ');
}

export function countWords(markdown) {
  return stripMarkdown(markdown).split(/\s+/).filter(word => /[\p{L}\p{N}]/u.test(word)).length;
}

// A reader sees the shared body plus one tab, so count body + the longest tab.
export function guideWordCount(guide = {}) {
  const tabs = Math.max(countWords(guide.f2p_content), countWords(guide.spender_content));
  return countWords(guide.body) + tabs;
}

export function readingMinutes(guide = {}) {
  return Math.max(1, Math.round(guideWordCount(guide) / WORDS_PER_MINUTE));
}

export function slugifyHeading(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-') || 'section';
}

// Returns a function that hands out unique ids (-1, -2 ... on repeats).
export function headingIdFactory() {
  const used = new Map();
  return text => {
    const base = slugifyHeading(text);
    const count = used.get(base) || 0;
    used.set(base, count + 1);
    return count ? `${base}-${count}` : base;
  };
}

function inlineText(raw) {
  return raw
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .replace(/<[^>]+>/g, '')
    .trim();
}

// ATX headings (## and ###) outside code fences. ids match what the article
// renderer assigns because both use headingIdFactory in document order.
export function guideHeadings(markdown) {
  const nextId = headingIdFactory();
  const headings = [];
  let fence = false;
  for (const line of String(markdown || '').split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; continue; }
    if (fence) continue;
    const match = line.match(/^(#{1,3})\s+(.+?)\s*#*\s*$/);
    if (!match) continue;
    const text = inlineText(match[2]);
    if (!text) continue;
    const id = nextId(text);
    if (match[1].length >= 2) headings.push({ level: match[1].length, text, id });
  }
  return headings;
}

export function shouldShowToc(markdown, headings = guideHeadings(markdown)) {
  return headings.length >= TOC_MIN_HEADINGS && countWords(markdown) >= TOC_MIN_WORDS;
}

export function urlLabel(url) {
  try {
    const { hostname } = new URL(url);
    return hostname.replace(/^www\./, '') || url;
  } catch {
    return url;
  }
}

const LINK_PATTERN = /(!?\[[^\]]*\]\([^)]*\))|<(https?:\/\/[^>\s]+)>|(https?:\/\/[^\s<>()[\]]*[^\s<>()[\]\s.,;:!?'"*_])/g;

// Turn bare URLs (and links whose text is the URL itself) into labelled
// markdown links such as [youtube.com](https://...). Code is left alone.
export function linkifyBareUrls(markdown) {
  let fence = false;
  return String(markdown || '').split('\n').map(line => {
    if (/^\s*(```|~~~)/.test(line)) { fence = !fence; return line; }
    if (fence) return line;
    return line.split(/(`[^`]*`)/).map((part, index) => {
      if (index % 2) return part;
      return part.replace(LINK_PATTERN, (match, link, angled, bare) => {
        if (link) {
          const parts = link.match(/^\[([^\]]*)\]\(([^)\s]+)\)$/);
          if (parts && /^https?:\/\//.test(parts[1]) && parts[1] === parts[2]) return `[${urlLabel(parts[2])}](${parts[2]})`;
          return link;
        }
        const url = angled || bare;
        return `[${urlLabel(url)}](${url})`;
      });
    }).join('');
  }).join('\n');
}

const normalize = value => String(value || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// The subtitle is dropped when it only repeats the title (same text, or the
// title with at most two extra words).
export function guideSubtitle(title, description) {
  const t = normalize(title);
  const d = normalize(description);
  if (!d) return '';
  if (d === t) return '';
  const extra = (long, short) => long.startsWith(`${short} `) ? long.slice(short.length).trim().split(' ').length : Infinity;
  if (extra(d, t) <= 2 || extra(t, d) <= 2) return '';
  return String(description).trim();
}

export function guideUpdatedAt(guide = {}) {
  const value = guide.updated_at || guide.created_at;
  const time = value ? Date.parse(value) : NaN;
  return Number.isFinite(time) ? new Date(time) : null;
}

// Deterministic (UTC) so server and client render the same text.
export function formatGuideDate(date) {
  return date ? date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' }) : '';
}

export function guideMeta(guide = {}) {
  const updated = guideUpdatedAt(guide);
  const reviewedBy = typeof guide.reviewed_by === 'string' ? guide.reviewed_by.trim() : '';
  return {
    minutes: readingMinutes(guide),
    updatedLabel: updated ? formatGuideDate(updated) : '',
    updatedIso: updated ? updated.toISOString() : '',
    reviewedBy,
  };
}

// Editable page text. The code defaults below are the exact copy a page ships
// with; an admin can override any field in Admin > Content > Page text. Saved
// overrides live in Mongo `page_text` ({ page, values, updated_at, updated_by },
// one document per page). An empty or whitespace-only saved value means "use
// the default" (the admin screen's "Reset to default" deletes the override).
// Everything is plain text: React escapes it, blank lines make paragraph breaks.
// To register another page, add one entry to PAGE_TEXT_PAGES.

export const PAGE_TEXT_CACHE_MS = 30_000;
export const FAQ_MAX_ITEMS = 12;
export const FAQ_QUESTION_MAX = 140;
export const FAQ_ANSWER_MAX = 800;

export class PageTextError extends Error {
  constructor(message, status = 400, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const ABOUT_TEXT_DEFAULTS = Object.freeze({
  hero_eyebrow: 'About Kingdom 710',
  hero_title: 'Three alliances. One kingdom.',
  hero_lede: 'Kingdom 710 is a multilingual Kingshot kingdom made up of three alliances: 710, RED and SKY. We prepare for KvK together, run daily Bear Hunts, and share the same events, guides, forms and member tools.',
  hero_apply_label: 'Apply to join',
  hero_timeline_label: 'See the timeline',
  banner_big: '710',
  banner_small: '710 · RED · SKY',
  story_kicker: 'The kingdom',
  story_heading: 'How we run things',
  story_lead: 'We coordinate across three alliances so every player can find a Bear Hunt time that fits their day, and so KvK is fought as one kingdom.',
  story_second: 'Each alliance has its own Bear Hunt schedule, shown below in UTC and in your local time. Pick the one that works for you.',
  record_kicker: 'Proof on the field',
  record_heading: 'Our KvK record',
  record_intro: 'Kingdom vs Kingdom results and rankings, updated automatically from public Kingshot sites.',
  alliances_kicker: 'The alliances',
  alliances_heading: '710, RED and SKY',
  alliances_intro: 'Each alliance has its own Bear Hunt times, languages and recruiting status. Open one to see its schedule and leadership.',
  join_kicker: 'Join us',
  join_heading: 'How to join in three steps',
  step1_title: 'Send your application',
  step1_body: 'Fill in the transfer form with your battle report screenshots and the details it asks for.',
  step1_link: 'Open the form',
  step2_title: 'Get reviewed',
  step2_body: 'An officer checks your account, preferred event times and KvK plans, then tells you which alliance fits.',
  step3_title: 'Move in when a window opens',
  step3_body: 'Transfer when your intake window lands and get added to your alliance’s Bear Hunt schedule.',
  step3_link: 'Read the help guide',
  faq_heading: 'Common questions',
  faq: Object.freeze([
    Object.freeze({ q: 'How long does the transfer take?', a: 'Most transfers are reviewed within a day or two. New intake windows open regularly — apply now and we will confirm your place when the next window lands.' }),
    Object.freeze({ q: 'Do I need to leave my current alliance first?', a: 'No. Send your application first. Leadership will walk you through the timing so you do not lose progress or leave before there is a spot ready for you.' }),
    Object.freeze({ q: 'What happens after I apply?', a: 'Your application goes to our officers, who review your account, preferred event times, and KvK plans. You will be contacted about migration and which of the three alliances fits you best.' }),
    Object.freeze({ q: 'Who do I contact if I have questions?', a: 'The transfer form has a contact field, and our leadership monitors it daily. Ask anything there — no question is too small before you commit to moving.' }),
  ]),
  close_heading: 'Ready to move?',
  close_line: 'Our officers review every application.',
  close_button: 'Apply to join',
});

const f = (key, label, section, kind, maxLength, help) => ({ key, label, section, kind, maxLength, help, multiline: kind === 'paragraph' });

const ABOUT_SECTIONS = [
  { id: 'hero', label: 'Top of the page', help: 'The first thing visitors see.' },
  { id: 'story', label: 'How we run things', help: 'The intro text under the hero. Two more paragraphs here come from the home page text, not from this screen.' },
  { id: 'record', label: 'KvK record', help: 'The words around the live KvK results. The results themselves update automatically.' },
  { id: 'alliances', label: 'Alliances', help: 'Only the heading and intro. Alliance names, descriptions and times are edited in Admin > Events > Alliance events and the home page text.' },
  { id: 'join', label: 'How to join', help: 'The three steps. The buttons always go to the same pages.' },
  { id: 'faq', label: 'Common questions', help: 'Questions and answers visitors can open. Add up to 12.' },
  { id: 'close', label: 'Closing call to action', help: 'The last block at the bottom of the page.' },
];

const ABOUT_FIELDS = [
  f('hero_eyebrow', 'Small label above the title', 'hero', 'text', 60, 'Shown in small capitals above the page title.'),
  f('hero_title', 'Page title', 'hero', 'text', 80, 'The main heading of the About page. Keep it short.'),
  f('hero_lede', 'Intro under the title', 'hero', 'paragraph', 400, 'Shown at the top of the About page, under the title. Keep it to one short paragraph: line breaks are shown as spaces here.'),
  f('hero_apply_label', 'Main button label', 'hero', 'link-label', 30, 'The gold button. It opens the transfer form.'),
  f('hero_timeline_label', 'Second link label', 'hero', 'link-label', 30, 'The plain link next to the button. It opens the timeline.'),
  f('banner_big', 'Banner: big text', 'hero', 'text', 12, 'The large number on the banner picture.'),
  f('banner_small', 'Banner: small text', 'hero', 'text', 40, 'The line under the big number.'),
  f('story_kicker', 'Small label', 'story', 'text', 60, 'Above the heading.'),
  f('story_heading', 'Heading', 'story', 'text', 80, 'The heading of this block.'),
  f('story_lead', 'First paragraph (larger)', 'story', 'paragraph', 400, 'The larger opening paragraph.'),
  f('story_second', 'Second paragraph', 'story', 'paragraph', 400, 'Shown right after the opening paragraph.'),
  f('record_kicker', 'Small label', 'record', 'text', 60, 'Above the heading.'),
  f('record_heading', 'Heading', 'record', 'text', 80, 'Heading above the KvK results.'),
  f('record_intro', 'Intro line', 'record', 'paragraph', 300, 'One or two sentences under the heading.'),
  f('alliances_kicker', 'Small label', 'alliances', 'text', 60, 'Above the heading.'),
  f('alliances_heading', 'Heading', 'alliances', 'text', 80, 'Heading above the alliance list.'),
  f('alliances_intro', 'Intro line', 'alliances', 'paragraph', 300, 'One or two sentences under the heading.'),
  f('join_kicker', 'Small label', 'join', 'text', 60, 'Above the heading.'),
  f('join_heading', 'Heading', 'join', 'text', 80, 'Heading above the three steps.'),
  f('step1_title', 'Step 1: title', 'join', 'text', 80, 'Short name of the first step.'),
  f('step1_body', 'Step 1: details', 'join', 'paragraph', 300, 'What the visitor does.'),
  f('step1_link', 'Step 1: link label', 'join', 'link-label', 30, 'Opens the transfer form.'),
  f('step2_title', 'Step 2: title', 'join', 'text', 80, 'Short name of the second step.'),
  f('step2_body', 'Step 2: details', 'join', 'paragraph', 300, 'What happens next. This step has no link.'),
  f('step3_title', 'Step 3: title', 'join', 'text', 80, 'Short name of the third step.'),
  f('step3_body', 'Step 3: details', 'join', 'paragraph', 300, 'The last step.'),
  f('step3_link', 'Step 3: link label', 'join', 'link-label', 30, 'Opens the help guide.'),
  f('faq_heading', 'Heading', 'faq', 'text', 80, 'Heading above the questions.'),
  { key: 'faq', label: 'Questions and answers', section: 'faq', kind: 'list', maxLength: 0, help: 'Visitors tap a question to read the answer.', multiline: false },
  f('close_heading', 'Heading', 'close', 'text', 80, 'Heading of the last block.'),
  f('close_line', 'Line under the heading', 'close', 'paragraph', 200, 'One short sentence.'),
  f('close_button', 'Button label', 'close', 'link-label', 30, 'Opens the transfer form.'),
];

export const PAGE_TEXT_PAGES = {
  about: { id: 'about', label: 'About page', path: '/about', sections: ABOUT_SECTIONS, fields: ABOUT_FIELDS, defaults: ABOUT_TEXT_DEFAULTS },
};

export const pageList = () => Object.values(PAGE_TEXT_PAGES).map((p) => ({ id: p.id, label: p.label, path: p.path }));
export const getPageDef = (page) => (Object.prototype.hasOwnProperty.call(PAGE_TEXT_PAGES, page) ? PAGE_TEXT_PAGES[page] : null);

// ---- normalising / validating ---------------------------------------------

/** Normalise one text value: LF newlines, trimmed; single-line kinds lose line breaks; paragraph breaks capped at one blank line. */
export function normalizeText(value, kind) {
  let s = String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
  if (kind === 'paragraph') return s.split('\n').map((l) => l.trim()).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  return s.replace(/\s+/g, ' ').trim();
}

/** Plain-text paragraph breaks (blank lines) -> array of paragraphs; single line breaks stay as spaces. */
export function splitParagraphs(text) {
  return String(text ?? '').split(/\n\s*\n/).map((p) => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean);
}

export function normalizeFaq(list) {
  return (Array.isArray(list) ? list : []).map((item) => ({ q: normalizeText(item?.q, 'text'), a: normalizeText(item?.a, 'paragraph') }));
}

/**
 * Validate an admin update { key: value }. Returns { set: {key: value}, reset: [keys] }.
 * Empty text, a value equal to the default, or an empty FAQ list = reset (use the default).
 * Throws PageTextError(400) with `fields` {key: message} on any problem.
 */
export function validatePageUpdate(page, values) {
  const def = getPageDef(page);
  if (!def) throw new PageTextError('Unknown page.', 404);
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new PageTextError('Nothing to save.');
  const byKey = new Map(def.fields.map((fl) => [fl.key, fl]));
  const set = {};
  const reset = [];
  const errors = {};
  for (const [key, raw] of Object.entries(values)) {
    const field = byKey.get(key);
    if (!field) { errors[key] = 'This field does not exist.'; continue; }
    if (field.kind === 'list') {
      if (!Array.isArray(raw)) { errors[key] = 'Send the questions as a list.'; continue; }
      if (raw.some((item) => !item || typeof item !== 'object' || typeof item.q !== 'string' || typeof item.a !== 'string')) { errors[key] = 'Each question needs a question and an answer.'; continue; }
      const faq = normalizeFaq(raw);
      if (faq.length === 0) { reset.push(key); continue; }
      if (faq.length > FAQ_MAX_ITEMS) { errors[key] = `Use at most ${FAQ_MAX_ITEMS} questions.`; continue; }
      const bad = faq.findIndex((it) => !it.q || !it.a);
      if (bad >= 0) { errors[key] = `Question ${bad + 1} needs both a question and an answer. Fill it in or remove it.`; continue; }
      const long = faq.findIndex((it) => it.q.length > FAQ_QUESTION_MAX || it.a.length > FAQ_ANSWER_MAX);
      if (long >= 0) { errors[key] = `Question ${long + 1} is too long (questions up to ${FAQ_QUESTION_MAX} characters, answers up to ${FAQ_ANSWER_MAX}).`; continue; }
      if (JSON.stringify(faq) === JSON.stringify(def.defaults.faq)) reset.push(key); else set[key] = faq;
      continue;
    }
    if (typeof raw !== 'string') { errors[key] = 'Text only.'; continue; }
    const text = normalizeText(raw, field.kind);
    if (text.length > field.maxLength) { errors[key] = `Too long: ${text.length} of ${field.maxLength} characters. Shorten it.`; continue; }
    if (!text || text === def.defaults[key]) reset.push(key); else set[key] = text;
  }
  if (Object.keys(errors).length) throw new PageTextError('Some text could not be saved. Check the highlighted fields.', 400, errors);
  return { set, reset };
}

/** Defaults overlaid with saved overrides; anything missing, blank or malformed falls back to the default. */
export function mergePageText(page, saved) {
  const def = getPageDef(page);
  if (!def) return {};
  const out = { ...def.defaults };
  for (const field of def.fields) {
    const v = saved?.[field.key];
    if (field.kind === 'list') {
      const faq = normalizeFaq(v).filter((it) => it.q && it.a).slice(0, FAQ_MAX_ITEMS);
      if (Array.isArray(v) && faq.length) out[field.key] = faq;
    } else if (typeof v === 'string' && v.trim()) {
      out[field.key] = v.trim().slice(0, field.maxLength);
    }
  }
  return out;
}

// ---- store + cache ---------------------------------------------------------

export function createPageTextStore({ coll, now = () => new Date() }) {
  return {
    async getDoc(page) { return coll.findOne({ page }); },
    async save(page, { set, reset }, updatedBy = 'admin') {
      const existing = (await coll.findOne({ page }))?.values || {};
      const values = { ...existing, ...set };
      for (const k of reset) delete values[k];
      await coll.updateOne({ page }, { $set: { values, updated_at: now(), updated_by: String(updatedBy).slice(0, 80) } }, { upsert: true });
      return coll.findOne({ page });
    },
  };
}

/** ~30 s cache of merged values per page. Fails open to defaults (or the last good copy) if the load throws. */
export function createPageTextCache(load, { ttl = PAGE_TEXT_CACHE_MS, nowMs = () => Date.now() } = {}) {
  const entries = new Map();
  return {
    async get(page) {
      const hit = entries.get(page);
      if (hit && nowMs() - hit.at < ttl) return hit.values;
      try {
        const doc = await load(page);
        const values = mergePageText(page, doc?.values);
        entries.set(page, { at: nowMs(), values });
        return values;
      } catch {
        return hit?.values || mergePageText(page, null);
      }
    },
    invalidate(page) { if (page) entries.delete(page); else entries.clear(); },
  };
}

// ---- editor helpers (pure) -------------------------------------------------

export const valuesEqual = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Keys whose current value differs from the saved baseline. */
export function changedKeys(base, current) {
  return Object.keys(current).filter((k) => !valuesEqual(base?.[k], current[k]));
}
export const isDirty = (base, current) => changedKeys(base, current).length > 0;

export function faqAdd(list) { return list.length >= FAQ_MAX_ITEMS ? list : [...list, { q: '', a: '' }]; }
export function faqRemove(list, index) { return list.filter((_, i) => i !== index); }
export function faqMove(list, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}

// Editable page text. The code defaults below are the exact copy a page ships
// with; an admin can override any field in Admin > Content > Page text. Saved
// overrides live in Mongo `page_text` ({ page, values, updated_at, updated_by },
// one document per page). An empty or whitespace-only saved value means "use
// the default" (the admin screen's "Reset to default" deletes the override).
// Everything is plain text: React escapes it, blank lines make paragraph breaks.
// To register another page, add one entry to PAGE_TEXT_PAGES.

import { GLOSSARY_GROUPS } from './glossary.js';

export const PAGE_TEXT_CACHE_MS = 30_000;
export const FAQ_MAX_ITEMS = 12;
export const FAQ_QUESTION_MAX = 140;
export const FAQ_ANSWER_MAX = 800;
export const GLOSSARY_MAX_TERMS = 200;
export const GLOSSARY_TERM_MAX = 60;
export const GLOSSARY_DEFINITION_MAX = 600;
export const GLOSSARY_GROUP_MAX = 60;

export class PageTextError extends Error {
  constructor(message, status = 400, fields = {}) {
    super(message);
    this.status = status;
    this.fields = fields;
  }
}

export const ABOUT_TEXT_DEFAULTS = Object.freeze({
  hero_eyebrow: 'About Kingdom 710',
  hero_title: 'One kingdom. Many alliances.',
  hero_lede: 'Kingdom 710 is a multilingual Kingshot kingdom made up of coordinated alliances, each with its own Bear Hunt schedule. We prepare for KvK together, run daily Bear Hunts, and share the same events, guides, forms and member tools.',
  hero_apply_label: 'Apply to join',
  hero_timeline_label: 'See the timeline',
  banner_big: '710',
  banner_small: 'Kingshot kingdom',
  story_kicker: 'The kingdom',
  story_heading: 'How we run things',
  story_lead: 'We coordinate across our alliances so every player can find a Bear Hunt time that fits their day, and so KvK is fought as one kingdom.',
  story_second: 'Each alliance has its own Bear Hunt schedule, shown below in UTC and in your local time. Pick the one that works for you.',
  record_kicker: 'Proof on the field',
  record_heading: 'Our KvK record',
  record_intro: 'Kingdom vs Kingdom results and rankings, updated automatically from public Kingshot sites.',
  alliances_kicker: 'The alliances',
  alliances_heading: 'Our alliances',
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
    Object.freeze({ q: 'What happens after I apply?', a: 'Your application goes to our officers, who review your account, preferred event times, and KvK plans. You will be contacted about migration and which of our alliances fits you best.' }),
    Object.freeze({ q: 'Who do I contact if I have questions?', a: 'The transfer form has a contact field, and our leadership monitors it daily. Ask anything there — no question is too small before you commit to moving.' }),
  ]),
  close_heading: 'Ready to move?',
  close_line: 'Our officers review every application.',
  close_button: 'Apply to join',
});

const f = (key, label, section, kind, maxLength, help) => ({ key, label, section, kind, maxLength, help, multiline: kind === 'paragraph' });

const ABOUT_SECTIONS = [
  { id: 'hero', label: 'Top of the page', help: 'The first thing visitors see.' },
  { id: 'story', label: 'How we run things', help: 'The intro text under the hero. The two paragraphs that follow (and the R5 leader names in the alliance list) are shared with the Home page: edit them under Home > "How 710 works" and "Alliance schedules", and they change on both pages.' },
  { id: 'record', label: 'KvK record', help: 'The words around the live KvK results. The results themselves update automatically.' },
  { id: 'alliances', label: 'Alliances', help: 'Only the heading and intro. Alliance names, status and times are edited in Admin > Events > Alliance events; the R5 leader names are edited under Home > "Alliance schedules".' },
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
  { key: 'faq', label: 'Questions and answers', section: 'faq', kind: 'list', maxLength: 0, help: 'Visitors tap a question to read the answer.', multiline: false, itemLabel: 'Question', maxItems: FAQ_MAX_ITEMS,
    itemFields: [{ name: 'q', label: 'Question', kind: 'text', maxLength: FAQ_QUESTION_MAX }, { name: 'a', label: 'Answer', kind: 'paragraph', maxLength: FAQ_ANSWER_MAX }] },
  f('close_heading', 'Heading', 'close', 'text', 80, 'Heading of the last block.'),
  f('close_line', 'Line under the heading', 'close', 'paragraph', 200, 'One short sentence.'),
  f('close_button', 'Button label', 'close', 'link-label', 30, 'Opens the transfer form.'),
];

// ---- Home ---------------------------------------------------------------
export const HOME_TEXT_DEFAULTS = Object.freeze({
  hero_kicker: 'Kingshot · Kingdom 710',
  hero_title: 'Welcome to Kingdom 710.',
  hero_sub: 'We are a multilingual Kingshot kingdom with three alliances: 710, RED, and SKY. Use this site to check events, update your player profile, plan upgrades, or apply for a transfer.',
  hero_apply_label: 'Apply to transfer',
  hero_schedules_label: 'See alliance schedules',
  fact_alliances_label: 'Alliances',
  fact_record_label: 'KvK battle record',
  fact_rank_label: 'Optimizer rank',
  member_intro: 'Jump straight to the tools you use most.',
  why_head_kicker: 'About the kingdom',
  why_head_title: 'How 710 works',
  why_head_sub: 'We coordinate across three alliances. Players share event information, prepare together for KvK, and use the same member tools on this site.',
  why_1_title: 'Alliance Bear Hunt times',
  why_1_body: 'Check each alliance’s current schedule below to find the times that work for you.',
  why_2_title: 'Vetted for commitment, not just power',
  why_2_body: 'Our transfer review looks at T11 troop levels, Mystic Trial stages, and KvK-prep habits, because a kingdom that shows up beats a kingdom of quiet big accounts.',
  why_3_title: 'Real war-room tooling',
  why_3_body: 'Power profiles, KvK availability forms, event schedules, and upgrade calculators, all built for this kingdom instead of a shared spreadsheet.',
  story_link: 'Read about Kingdom 710',
  strip_1_label: 'TRANSFERS',
  strip_1_text: 'Read the requirements and send us your player information.',
  strip_2_label: 'MEMBER FORMS',
  strip_2_text: 'Update your profile and submit your KvK availability.',
  strip_3_label: 'CALCULATORS',
  strip_3_text: 'Plan charm, pet, event shop, and other upgrades.',
  deck_head_kicker: 'Member links',
  deck_head_title: 'What do you need?',
  deck_head_sub: 'Go directly to the most-used parts of the website.',
  cmd_1_title: 'Events',
  cmd_1_sub: 'Bear Hunts, KvK, and alliance events',
  cmd_2_title: 'Guides',
  cmd_2_sub: 'Kingdom guides and game information',
  cmd_3_title: 'Tools',
  cmd_3_sub: 'Upgrade and event calculators',
  cmd_4_title: 'Power Profile',
  cmd_4_sub: 'Update your gear, charms, heroes, and troops',
  wb_head_kicker: 'Alliance schedules',
  wb_head_title: 'Our alliances',
  wb_1_desc: 'Two Bear Hunts each day.\n\nR5: Yumin',
  wb_2_desc: 'Three Bear Hunts each day.\n\nR5: Woff',
  wb_3_desc: 'Two Bear Hunts each day.\n\nR5: Asriellexx',
  final_kicker: 'KINGDOM TRANSFERS',
  final_title: 'Interested in moving\nto Kingdom 710?',
  final_button: 'Open the transfer form',
});

const HOME_SECTIONS = [
  { id: 'hero', label: 'Top of the page', help: 'The first screen visitors see. The big forge and shield intro is not text. The numbers beside the labels (alliances, KvK record, rank) are live data and cannot be edited.' },
  { id: 'member', label: 'Signed-in members', help: 'The line members see under "Welcome back". Their name, forms and next Bear Hunt are live data.' },
  { id: 'story', label: 'How 710 works', help: 'The three short points next to the photo gallery. Points 2 and 3 are also shown on the About page, so editing them here changes both. The gallery pictures are edited in Admin > Content > Gallery.' },
  { id: 'strip', label: 'Three-point strip', help: 'The band of three short notes under the story.' },
  { id: 'deck', label: 'Quick links', help: 'The heading and the four link rows. The pages the rows open cannot be changed here.' },
  { id: 'alliances', label: 'Alliance schedules', help: 'The heading and one line per alliance. The "R5: Name" line is also used on the About page for the leader name. Bear Hunt times themselves are edited in Admin > Events > Alliance events.' },
  { id: 'final', label: 'Closing call to action', help: 'The dark band at the bottom of the page.' },
];

const HOME_FIELDS_DEF = [
  f('hero_kicker', 'Small label above the title', 'hero', 'text', 60, 'Shown in small capitals above the headline.'),
  f('hero_title', 'Headline', 'hero', 'text', 80, 'The main heading of the home page.'),
  f('hero_sub', 'Intro under the headline', 'hero', 'paragraph', 400, 'One short paragraph.'),
  f('hero_apply_label', 'Main button label', 'hero', 'link-label', 30, 'The gold button. It opens the transfer form.'),
  f('hero_schedules_label', 'Second button label', 'hero', 'link-label', 40, 'Scrolls down to the alliance schedules.'),
  f('fact_alliances_label', 'Facts: alliances label', 'hero', 'text', 30, 'Label for the number of alliances.'),
  f('fact_record_label', 'Facts: KvK record label', 'hero', 'text', 30, 'Label for the live win-loss record.'),
  f('fact_rank_label', 'Facts: rank label', 'hero', 'text', 30, 'Label for the live Optimizer rank.'),
  f('member_intro', 'Line under "Welcome back"', 'member', 'text', 120, 'Only signed-in members see this.'),
  f('why_head_kicker', 'Small label', 'story', 'text', 60, 'Above the heading.'),
  f('why_head_title', 'Heading', 'story', 'text', 80, 'Heading of this block.'),
  f('why_head_sub', 'Intro line', 'story', 'paragraph', 300, 'Under the heading.'),
  f('why_1_title', 'Point 1: title', 'story', 'text', 80, 'Short title of the first point.'),
  f('why_1_body', 'Point 1: details', 'story', 'paragraph', 300, 'About Bear Hunt times.'),
  f('why_2_title', 'Point 2: title', 'story', 'text', 80, 'Short title of the second point.'),
  f('why_2_body', 'Point 2: details', 'story', 'paragraph', 400, 'Shared: also shown as a paragraph on the About page.'),
  f('why_3_title', 'Point 3: title', 'story', 'text', 80, 'Short title of the third point.'),
  f('why_3_body', 'Point 3: details', 'story', 'paragraph', 400, 'Shared: also shown as a paragraph on the About page.'),
  f('story_link', 'Link label', 'story', 'link-label', 40, 'Opens the About page. An arrow is added automatically.'),
  f('strip_1_label', 'Note 1: label', 'strip', 'text', 30, 'Shown in capitals.'),
  f('strip_1_text', 'Note 1: text', 'strip', 'paragraph', 160, 'One short sentence.'),
  f('strip_2_label', 'Note 2: label', 'strip', 'text', 30, 'Shown in capitals.'),
  f('strip_2_text', 'Note 2: text', 'strip', 'paragraph', 160, 'One short sentence.'),
  f('strip_3_label', 'Note 3: label', 'strip', 'text', 30, 'Shown in capitals.'),
  f('strip_3_text', 'Note 3: text', 'strip', 'paragraph', 160, 'One short sentence.'),
  f('deck_head_kicker', 'Small label', 'deck', 'text', 60, 'Above the heading.'),
  f('deck_head_title', 'Heading', 'deck', 'text', 80, 'Heading of the quick links.'),
  f('deck_head_sub', 'Intro line', 'deck', 'paragraph', 200, 'Under the heading.'),
  f('cmd_1_title', 'Link 1: title', 'deck', 'text', 40, 'Opens Events.'),
  f('cmd_1_sub', 'Link 1: description', 'deck', 'text', 100, 'One short line.'),
  f('cmd_2_title', 'Link 2: title', 'deck', 'text', 40, 'Opens Guides.'),
  f('cmd_2_sub', 'Link 2: description', 'deck', 'text', 100, 'One short line.'),
  f('cmd_3_title', 'Link 3: title', 'deck', 'text', 40, 'Opens Tools.'),
  f('cmd_3_sub', 'Link 3: description', 'deck', 'text', 100, 'One short line.'),
  f('cmd_4_title', 'Link 4: title', 'deck', 'text', 40, 'Opens Power Profile.'),
  f('cmd_4_sub', 'Link 4: description', 'deck', 'text', 100, 'One short line.'),
  f('wb_head_kicker', 'Small label', 'alliances', 'text', 60, 'Above the heading.'),
  f('wb_head_title', 'Heading', 'alliances', 'text', 80, 'Heading above the alliance schedules.'),
  f('wb_1_desc', '710: note', 'alliances', 'paragraph', 300, 'Shown under the 710 schedule. Keep the line "R5: Name": the About page reads the leader name from it.'),
  f('wb_2_desc', 'RED: note', 'alliances', 'paragraph', 300, 'Shown under the RED schedule. Keep the line "R5: Name".'),
  f('wb_3_desc', 'SKY: note', 'alliances', 'paragraph', 300, 'Shown under the SKY schedule. Keep the line "R5: Name".'),
  f('final_kicker', 'Small label', 'final', 'text', 60, 'Above the heading.'),
  f('final_title', 'Heading', 'final', 'paragraph', 100, 'A line break (Enter) here shows as a line break on the page.'),
  f('final_button', 'Button label', 'final', 'link-label', 40, 'Opens the transfer form.'),
];

// ---- Glossary ------------------------------------------------------------
export const GLOSSARY_DEFAULT_TERMS = Object.freeze(
  GLOSSARY_GROUPS.flatMap((g) => g.terms.map((t) => Object.freeze({ group: g.heading, term: t.term, definition: t.definition }))),
);

export const GLOSSARY_TEXT_DEFAULTS = Object.freeze({
  hero_eyebrow: 'Kingdom 710',
  hero_title: 'Glossary',
  hero_lede: 'New to Kingshot or just not sure what a term means? Here is what the words on this site stand for, in plain language.',
  glossary_terms: GLOSSARY_DEFAULT_TERMS,
  footer_note: 'Missing one? Ask on the transfer form and we will add it.',
  footer_events_label: 'Events & schedule',
  footer_guides_label: 'Read the guides',
});

const GLOSSARY_SECTIONS = [
  { id: 'hero', label: 'Top of the page', help: 'The heading area.' },
  { id: 'terms', label: 'Terms', help: 'Every term on the page, grouped under headings. The same definitions appear in the small pop-ups on dotted words around the site. The order here is the order on the page; a group heading appears where its first term is. To rename a group, change the Group of each term in it.' },
  { id: 'footer', label: 'Bottom of the page', help: 'The note and links under the terms. The term count in front of the note is automatic.' },
];

const GLOSSARY_FIELDS = [
  f('hero_eyebrow', 'Small label above the title', 'hero', 'text', 60, 'Shown in small capitals above the page title.'),
  f('hero_title', 'Page title', 'hero', 'text', 80, 'The main heading of the Glossary page.'),
  f('hero_lede', 'Intro under the title', 'hero', 'paragraph', 400, 'One short paragraph.'),
  { key: 'glossary_terms', label: 'Terms and definitions', section: 'terms', kind: 'list', maxLength: 0, multiline: false, itemLabel: 'Term', maxItems: GLOSSARY_MAX_TERMS, uniqueBy: 'term', suggestFrom: 'group',
    help: `Up to ${GLOSSARY_MAX_TERMS} terms. Term up to ${GLOSSARY_TERM_MAX} characters, definition up to ${GLOSSARY_DEFINITION_MAX}. Two terms cannot share a name. Removing every term brings back the built-in list.`,
    itemFields: [
      { name: 'group', label: 'Group', kind: 'text', maxLength: GLOSSARY_GROUP_MAX },
      { name: 'term', label: 'Term', kind: 'text', maxLength: GLOSSARY_TERM_MAX },
      { name: 'definition', label: 'Definition', kind: 'paragraph', maxLength: GLOSSARY_DEFINITION_MAX },
    ] },
  f('footer_note', 'Note', 'footer', 'text', 160, 'Shown after the term count, for example "14 terms · Missing one? ..."'),
  f('footer_events_label', 'Link 1 label', 'footer', 'link-label', 40, 'Opens Events. An arrow is added automatically.'),
  f('footer_guides_label', 'Link 2 label', 'footer', 'link-label', 40, 'Opens Guides. An arrow is added automatically.'),
];

// ---- Guides (listing page only) ---------------------------------------
export const GUIDES_TEXT_DEFAULTS = Object.freeze({
  hero_eyebrow: 'Kingdom 710',
  hero_title: 'Guides',
  hero_lede: 'Read kingdom instructions, event strategies, and game information maintained by the K710 team.',
  hero_browse_label: 'Browse guides',
  hero_events_label: 'View events',
  summary_guides_label: 'Published guides',
  summary_categories_label: 'Categories',
  summary_latest_label: 'Latest revision',
  summary_latest_empty: 'No revisions yet',
  band_1_kicker: 'Browse',
  band_1_title: 'Pick a category',
  band_1_text: 'Use the category buttons to narrow the list, such as Event guide or Shop guide.',
  band_2_kicker: 'Events',
  band_2_title: 'Event guide',
  band_2_text: 'What to do before and during major events.',
  band_3_kicker: 'Search',
  band_3_title: 'Find a guide',
  band_3_text: 'Search by title or filter the list by category.',
  archive_eyebrow: 'All guides',
  archive_title: 'Find a guide',
  archive_lede: 'Search the published guides below or choose a category.',
  load_error: 'Guides could not be loaded. Please try again.',
  search_label: 'Search guides',
  search_placeholder: 'Search by title or description…',
  filter_label: 'Filter by category',
  filter_all: 'All',
  empty_search: 'No guides match your search.',
  empty_category: 'No published guides in this category yet.',
  badge_start: 'Start here',
  entry_read_suffix: 'min read',
  entry_updated_prefix: 'Updated',
  entry_open: 'Open guide',
});

const GUIDES_SECTIONS = [
  { id: 'hero', label: 'Top of the page', help: 'The heading area and the two links. The numbers beside "Published guides" and "Categories" are live counts.' },
  { id: 'summary', label: 'Summary labels', help: 'Labels beside the live numbers at the top right.' },
  { id: 'band', label: 'Three-note band', help: 'The tan band of three short notes under the heading.' },
  { id: 'archive', label: 'Guide list heading', help: 'The heading above the search box and guide list.' },
  { id: 'directory', label: 'Search, filters and list', help: 'Words on the search box, filter buttons, empty messages and each guide row. Guide titles, descriptions, categories, difficulty and pictures are never edited here.' },
];

const GUIDES_FIELDS = [
  f('hero_eyebrow', 'Small label above the title', 'hero', 'text', 60, 'Shown in small capitals above the page title.'),
  f('hero_title', 'Page title', 'hero', 'text', 80, 'The main heading of the Guides page.'),
  f('hero_lede', 'Intro under the title', 'hero', 'paragraph', 300, 'One short paragraph.'),
  f('hero_browse_label', 'Main button label', 'hero', 'link-label', 30, 'Scrolls down to the guide list.'),
  f('hero_events_label', 'Second link label', 'hero', 'link-label', 30, 'Opens Events.'),
  f('summary_guides_label', 'Published guides label', 'summary', 'text', 40, 'Beside the live number of guides.'),
  f('summary_categories_label', 'Categories label', 'summary', 'text', 40, 'Beside the live number of categories.'),
  f('summary_latest_label', 'Latest revision label', 'summary', 'text', 40, 'Beside the live date of the newest change.'),
  f('summary_latest_empty', 'Text when there is no date', 'summary', 'text', 40, 'Shown when no guide has been revised yet.'),
  f('band_1_kicker', 'Note 1: small label', 'band', 'text', 30, 'Small label.'),
  f('band_1_title', 'Note 1: title', 'band', 'text', 60, 'Short title.'),
  f('band_1_text', 'Note 1: text', 'band', 'paragraph', 200, 'One short sentence.'),
  f('band_2_kicker', 'Note 2: small label', 'band', 'text', 30, 'Small label.'),
  f('band_2_title', 'Note 2: title', 'band', 'text', 60, 'Short title.'),
  f('band_2_text', 'Note 2: text', 'band', 'paragraph', 200, 'One short sentence.'),
  f('band_3_kicker', 'Note 3: small label', 'band', 'text', 30, 'Small label.'),
  f('band_3_title', 'Note 3: title', 'band', 'text', 60, 'Short title.'),
  f('band_3_text', 'Note 3: text', 'band', 'paragraph', 200, 'One short sentence.'),
  f('archive_eyebrow', 'Small label', 'archive', 'text', 60, 'Above the heading.'),
  f('archive_title', 'Heading', 'archive', 'text', 80, 'Heading above the guide list.'),
  f('archive_lede', 'Intro line', 'archive', 'paragraph', 200, 'Under the heading.'),
  f('load_error', 'Message when guides cannot load', 'archive', 'text', 120, 'Shown instead of the list if loading fails.'),
  f('search_label', 'Search box label', 'directory', 'text', 40, 'Label above the search box.'),
  f('search_placeholder', 'Search box hint', 'directory', 'text', 80, 'Grey hint inside the empty search box.'),
  f('filter_label', 'Filter group name (screen readers)', 'directory', 'text', 60, 'Read aloud by screen readers; not visible.'),
  f('filter_all', 'Filter button: all guides', 'directory', 'link-label', 20, 'The button that shows every category.'),
  f('empty_search', 'Message: search finds nothing', 'directory', 'text', 120, 'Shown when a search has no results.'),
  f('empty_category', 'Message: category is empty', 'directory', 'text', 120, 'Shown when there are no guides to list.'),
  f('badge_start', 'Badge on the first guide', 'directory', 'text', 30, 'A star is added automatically.'),
  f('entry_read_suffix', 'Reading time word', 'directory', 'text', 20, 'Follows the minutes, for example "5 min read".'),
  f('entry_updated_prefix', 'Updated word', 'directory', 'text', 20, 'Comes before the date, for example "Updated Mar 3".'),
  f('entry_open', 'Open link label', 'directory', 'link-label', 30, 'Shown at the right of each guide row.'),
];

const nothing = (text, href, linkLabel) => ({ text, href, linkLabel });

export const PAGE_TEXT_PAGES = {
  home: {
    id: 'home', label: 'Home', path: '/', sections: HOME_SECTIONS, fields: HOME_FIELDS_DEF, defaults: HOME_TEXT_DEFAULTS, legacy: 'home-content-blocks',
    description: 'The headings, paragraphs and button labels on the home page, plus the three short "How 710 works" points that About also shows.',
    notEditable: [
      nothing('Alliance Bear Hunt times, names and recruiting status', '/admin/dashboard/alliance-events', 'Admin > Events > Alliance events'),
      nothing('Gallery pictures', '/admin/dashboard/gallery', 'Admin > Content > Gallery'),
      nothing('KvK record and rank numbers are live data from public sites.', null, null),
    ],
  },
  about: {
    id: 'about', label: 'About', path: '/about', sections: ABOUT_SECTIONS, fields: ABOUT_FIELDS, defaults: ABOUT_TEXT_DEFAULTS,
    description: 'The headings, paragraphs, steps and questions on the About page.',
    notEditable: [
      nothing('The two paragraphs after "How we run things" and the R5 leader names: edit them under Home.', null, null),
      nothing('Alliance names, status and times', '/admin/dashboard/alliance-events', 'Admin > Events > Alliance events'),
      nothing('KvK results are live data from public sites.', null, null),
    ],
  },
  glossary: {
    id: 'glossary', label: 'Glossary', path: '/glossary', sections: GLOSSARY_SECTIONS, fields: GLOSSARY_FIELDS, defaults: GLOSSARY_TEXT_DEFAULTS,
    description: 'The Glossary heading, every term with its definition and group, and the bottom links. Definitions also update the small pop-ups on dotted words around the site.',
    notEditable: [nothing('Where a pop-up appears on a page is fixed. Only the definition text comes from this list.', null, null)],
  },
  guides: {
    id: 'guides', label: 'Guides', path: '/guides', sections: GUIDES_SECTIONS, fields: GUIDES_FIELDS, defaults: GUIDES_TEXT_DEFAULTS,
    description: 'Only the Guides list page: heading, labels, search and filter words and empty messages.',
    notEditable: [
      nothing('The guides themselves: titles, text, categories, difficulty and pictures', '/admin/dashboard/guides', 'Admin > Content > Guides'),
      nothing('The pages that open when you read a guide (/guides/...) have their own content.', null, null),
    ],
  },
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

/** Normalise a list field's items: only the declared item fields are kept. */
export function normalizeList(field, list) {
  return (Array.isArray(list) ? list : []).map((item) => Object.fromEntries(field.itemFields.map((it) => [it.name, normalizeText(item?.[it.name], it.kind)])));
}

const sameList = (a, b) => JSON.stringify(a) === JSON.stringify(b);

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
      const noun = (field.itemLabel || 'Item').toLowerCase();
      if (!Array.isArray(raw)) { errors[key] = `Send the ${noun}s as a list.`; continue; }
      if (raw.some((item) => !item || typeof item !== 'object' || field.itemFields.some((it) => typeof item[it.name] !== 'string'))) { errors[key] = `Each ${noun} needs ${field.itemFields.map((it) => it.label.toLowerCase()).join(', ')}.`; continue; }
      const items = normalizeList(field, raw);
      if (items.length === 0) { reset.push(key); continue; }
      if (items.length > field.maxItems) { errors[key] = `Use at most ${field.maxItems} ${noun}s.`; continue; }
      const bad = items.findIndex((it) => field.itemFields.some((x) => !it[x.name]));
      if (bad >= 0) { errors[key] = `${field.itemLabel} ${bad + 1} needs ${field.itemFields.map((x) => x.label.toLowerCase()).join(', ')}. Fill it in or remove it.`; continue; }
      const long = items.findIndex((it) => field.itemFields.some((x) => it[x.name].length > x.maxLength));
      if (long >= 0) { errors[key] = `${field.itemLabel} ${long + 1} is too long (${field.itemFields.map((x) => `${x.label.toLowerCase()} up to ${x.maxLength} characters`).join(', ')}).`; continue; }
      if (field.uniqueBy) {
        const seen = new Map();
        let dup = null;
        items.forEach((it, i) => { const k = it[field.uniqueBy].toLowerCase(); if (seen.has(k) && !dup) dup = `${field.itemLabel} ${i + 1} repeats "${it[field.uniqueBy]}". Each ${field.uniqueBy} can appear once.`; seen.set(k, i); });
        if (dup) { errors[key] = dup; continue; }
      }
      if (sameList(items, def.defaults[key])) reset.push(key); else set[key] = items;
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
      const items = normalizeList(field, v).filter((it) => field.itemFields.every((x) => it[x.name]))
        .map((it) => Object.fromEntries(field.itemFields.map((x) => [x.name, it[x.name].slice(0, x.maxLength)]))).slice(0, field.maxItems);
      if (Array.isArray(v) && items.length) out[field.key] = items;
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
    /** One-time copy of legacy values into the page doc. Saved values win over imported ones. Returns the document. */
    async importLegacy(page, legacy) {
      const existing = await coll.findOne({ page });
      if (existing?.legacy_imported) return existing;
      const values = { ...legacy, ...(existing?.values || {}) };
      await coll.updateOne({ page }, { $set: { values, legacy_imported: true, legacy_imported_at: now() } }, { upsert: true });
      return coll.findOne({ page });
    },
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

export function listAdd(list, field) {
  return list.length >= field.maxItems ? list : [...list, Object.fromEntries(field.itemFields.map((it) => [it.name, '']))];
}
export function listRemove(list, index) { return list.filter((_, i) => i !== index); }
export function listMove(list, index, delta) {
  const to = index + delta;
  if (index < 0 || index >= list.length || to < 0 || to >= list.length) return list;
  const next = [...list];
  [next[index], next[to]] = [next[to], next[index]];
  return next;
}
// FAQ-named wrappers kept for the About page and older callers.
export function faqAdd(list) { return list.length >= FAQ_MAX_ITEMS ? list : [...list, { q: '', a: '' }]; }
export const faqRemove = listRemove;
export const faqMove = listMove;

// ---- glossary (pure) ---------------------------------------------------------

/** Flat [{group, term, definition}] -> [{heading, terms:[{term, definition}]}] in first-appearance order. */
export function groupGlossaryTerms(list) {
  const groups = [];
  const byHeading = new Map();
  for (const it of list || []) {
    let g = byHeading.get(it.group);
    if (!g) { g = { heading: it.group, terms: [] }; byHeading.set(it.group, g); groups.push(g); }
    g.terms.push({ term: it.term, definition: it.definition });
  }
  return groups;
}

/** Terms for the client tooltip lookup, or null when the built-in glossary is unchanged (nothing to send). */
export function glossaryOverrideForClient(terms) {
  if (!Array.isArray(terms) || sameList(terms, GLOSSARY_DEFAULT_TERMS)) return null;
  return terms.map((t) => ({ term: t.term, definition: t.definition }));
}

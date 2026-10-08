// The sections of the public Help page (app/help/page.js). Only the identity
// lives here (id + title) so the admin "Help images" screen and the page agree;
// the body copy stays in the page. Ids are anchors (#id) and database keys:
// never rename one without moving its image row.
export const HELP_SECTIONS = Object.freeze([
  { id: 'what', title: 'What is Kingdom 710?' },
  { id: 'join', title: 'How do I join?' },
  { id: 'signin', title: 'How do I sign in?' },
  { id: 'nocode', title: 'My code did not arrive' },
  { id: 'words', title: 'What do these words mean?' },
  { id: 'settings', title: 'Make the text bigger or change the language' },
  { id: 'mistake', title: 'I made a mistake' },
  { id: 'ask', title: 'Who do I ask?' },
  { id: 'safe', title: 'Is my information safe?' },
].map((s) => Object.freeze(s)));

export const HELP_SECTION_IDS = Object.freeze(HELP_SECTIONS.map((s) => s.id));
export const isHelpSectionId = (id) => typeof id === 'string' && HELP_SECTION_IDS.includes(id);

/** Splits a list into rows of `size` (the "Jump to" grid is 3 columns wide; short last rows are fine). */
export function chunkRows(list, size = 3) {
  const rows = [];
  for (let i = 0; i < list.length; i += size) rows.push(list.slice(i, i + size));
  return rows;
}

// Home page note under each alliance's Bear Hunt times.
// The three original alliances keep their admin-edited Home page text (wb_N_desc). Every
// other alliance, and any of the three whose text is empty, gets a note built from its own
// record: a short blurb plus its R5 line(s). Nothing here needs a code change for a new tag.

const MAX_BLURB = 110;

function shortBlurb(text) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (clean.length <= MAX_BLURB) return clean;
  const cut = clean.slice(0, MAX_BLURB);
  const atWord = cut.lastIndexOf(' ');
  return `${(atWord > 60 ? cut.slice(0, atWord) : cut).replace(/[\s,.;:-]+$/, '')}…`;
}

/** Note text generated from an alliance record ({ blurb, leaders }), or ''. */
export function generatedBearNote(alliance, stripBlurb = (s) => s) {
  const blurb = shortBlurb(stripBlurb(alliance?.blurb || ''));
  const r5 = (alliance?.leaders || []).filter((l) => l.role === 'R5').map((l) => l.name);
  return [blurb, r5.length ? `R5: ${r5.join(', ')}` : ''].filter(Boolean).join('\n');
}

/**
 * @param {object[]} alliances    active alliances in display order (at least { tag })
 * @param {object}   textNotes    { TAG: text } from the Home page text (stock copy already stripped)
 * @param {object}   details      { TAG: { blurb, leaders } } from the alliance records
 * @param {function} stripBlurb   removes the old stock Bear Hunt sentences from a blurb
 */
export function buildBearNotes({ alliances = [], textNotes = {}, details = {}, stripBlurb } = {}) {
  const out = {};
  for (const alliance of alliances) {
    const tag = alliance.tag;
    const text = String(textNotes[tag] || '').trim();
    out[tag] = text || generatedBearNote(details[tag], stripBlurb);
  }
  return out;
}

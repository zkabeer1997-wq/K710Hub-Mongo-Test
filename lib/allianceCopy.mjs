// Home page copy used to say "three alliances: 710, RED, and SKY". These helpers keep that
// sentence true as alliances are added, including text an admin already saved in Page text.
const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];

export function countWord(n) {
  return WORDS[n] || String(n);
}

export function joinTags(tags) {
  const list = tags.filter(Boolean);
  if (list.length <= 1) return list.join('');
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return `${list.slice(0, -1).join(', ')}, and ${list[list.length - 1]}`;
}

export function liveAllianceCopy(text, tags) {
  const list = (tags || []).map((tag) => String(tag).trim()).filter(Boolean);
  if (!text || list.length === 0) return text;
  const count = countWord(list.length);
  return String(text)
    .replace(/\b(three) alliances\b/gi, (m, w) => `${w[0] === 'T' ? count[0].toUpperCase() + count.slice(1) : count} alliances`)
    .replace(/\b710, RED, and SKY\b/g, joinTags(list));
}

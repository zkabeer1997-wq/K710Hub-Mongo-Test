// Remove only the site's old stock schedule descriptions, preserving
// leadership notes and other admin-written text after those paragraphs.
export function stripLegacyBearCopy(text = '') {
  const stock = [
    'Two Bear Hunts each day.',
    'Three Bear Hunts each day.',
    'Two hunts a day, anchoring the early and midday windows.',
    'Three hunts, running from EU evening through NA late night.',
    'Two hunts anchoring the SEA / AU daytime window.',
  ];
  text = String(text || '');
  for (const sentence of stock) text = text.replace(sentence, '');
  // Lines such as "Bear: 01:00, 13:00 UTC" repeat the schedule that the Bear
  // Hunt windows section already shows, so drop them from the intro text.
  text = text.split(/\r?\n/).filter(line => !/^\s*bear(\s+hunts?)?(\s+times?)?\s*[:\u2013\u2014-]/i.test(line)).join('\n');
  return text.trim();
}


// Older Home copy that may still be stored in content_blocks (page 'home'). Pure helpers:
// resolveHomeLegacy() turns those rows into the values the Home page used to show, so the
// Page text engine can import anything already stored without losing it.

// Replace only the older promotional copy. If an admin wrote something new,
// their version wins because it no longer matches these strings.
export const COPY_REWRITES = {
  'hero-kicker': {
    from: ['KINGDOM 710 · KINGSHOT'],
    to: 'Kingshot · Kingdom 710',
  },
  'hero-title': {
    from: ['Rebuild the realm. Rule the server.', 'Welcome to the Hub of Kingdom 710!', 'Play hard. Stay for the people.'],
    to: 'Welcome to Kingdom 710.',
  },
  'hero-sub': {
    from: [
      "710 is a KvK-first kingdom run across three coordinated alliances, with Bear Hunt coverage spanning every timezone and war-room tooling most kingdoms never bother building. If you're shopping for your next server, start here.",
      "710 is a KvK-first kingdom run across three coordinated alliances, with Bear Hunt coverage spanning every timezone and war-room tooling most kingdoms never bother building. If you're looking for your next server, start here.",
      '710 is home to three alliances and players across every time zone. We show up for KvK, help each other grow, and keep the game fun.',
    ],
    to: 'We are a multilingual Kingshot kingdom with three alliances: 710, RED, and SKY. Use this site to check events, update your player profile, plan upgrades, or apply for a transfer.',
  },
  'deck-head-kicker': {
    from: ['ALREADY IN 710?'],
    to: 'Member links',
  },
  'deck-head-title': {
    from: ['Command deck', 'Rally Joiners and Leads', 'Everything 710 uses'],
    to: 'What do you need?',
  },
  'deck-head-sub': {
    from: ['Quick access to the tools your alliance uses every KvK cycle.', 'Open your profile, event schedule, guides, and upgrade tools.'],
    to: 'Go directly to the most-used parts of the website.',
  },
  'why-head-kicker': {
    from: ['WHY GOVERN WITH US'],
    to: 'About the kingdom',
  },
  'why-head-title': {
    from: ['Built for players who take KvK seriously', 'Built for players who take Kingshot seriously (mostly)', 'Competitive when it matters. Relaxed the rest of the time.'],
    to: 'How 710 works',
  },
  'why-head-sub': {
    from: [
      "Not another spreadsheet-and-hope operation. Here's what's actually different about how 710 runs.",
      "Not another spreadsheet-and-hope kingdom. Here's what's actually different about how 710 runs.",
      'We want active players, good teammates, and a kingdom people actually enjoy logging into.',
    ],
    to: 'We coordinate across three alliances. Players share event information, prepare together for KvK, and use the same member tools on this site.',
  },
  'why-1-title': {
    from: ['Coverage in every timezone', 'Someone is always online'],
    to: 'Seven Bear Hunt times',
  },
  'why-1-body': {
    from: [
      'Three alliances, seven Bear Hunt windows spread across the clock. Whenever you log in, somebody in 710 is already rallying.',
      'Three Alliances, seven Bear Hunt times spread across the world. Whenever you log in, somebody in 710 is already rallying.',
      'Seven Bear Hunt times across 710, RED, and SKY make it easier to find a schedule that works for you.',
    ],
    to: 'The schedules are spread across different time zones. Check the Events page to find the alliance and hunt time that work for you.',
  },
  'why-2-title': {
    from: ['Activity matters more than a power number', 'Transfers are reviewed'],
    to: 'Vetted for commitment, not just power',
  },
  'why-2-body': {
    from: [
      'Our transfer review looks at T11 troop levels, Mystic Trial stages, and KvK-prep habits — because a kingdom of quiet whales loses to a kingdom that shows up.',
      'We look for players who join events, prepare for KvK, and help their alliance. Big accounts are useful; reliable teammates are better.',
      'We review your account, preferred event times, and KvK participation before confirming a place. The transfer form explains what information is required.',
    ],
    to: 'Our transfer review looks at T11 troop levels, Mystic Trial stages, and KvK-prep habits, because a kingdom that shows up beats a kingdom of quiet big accounts.',
  },
  'why-3-title': {
    from: ['Useful tools for members', 'One website for member tasks'],
    to: 'Real war-room tooling',
  },
  'why-3-body': {
    from: [
      'Rally roster tracking, King Skill scheduling, and live power profiles — purpose-built for this kingdom, not a shared Google Sheet from three seasons ago.',
      'Update your power profile, plan upgrades, check event times, and complete KvK forms without digging through old messages.',
      'Members can update their power profile, submit KvK availability, check events, read guides, and use the upgrade calculators here.',
    ],
    to: 'Power profiles, KvK availability forms, event schedules, and upgrade calculators, all built for this kingdom instead of a shared spreadsheet.',
  },
  'wb-head-kicker': {
    from: ['THE THREE ALLIANCES'],
    to: 'Alliance schedules',
  },
  'wb-head-title': {
    from: ['Pick your alliance, know your hunt times', 'Pick your alliance, find your hunt times', 'Seven Bear Hunts. Three homes.'],
    to: '710, RED, and SKY',
  },
  'wb-head-sub': {
    from: [
      "Every alliance runs its own Bear Hunt schedule. Migration preference is part of the application — here's what each one covers.",
      'Choose the alliance whose schedule and community fit you best. You can review every hunt time before you apply.',
    ],
    to: 'Each alliance has different Bear Hunt times. Open an alliance page to see its current schedule and leadership.',
  },
  'wb-1-desc': {
    from: [
      'Two hunts a day, anchoring the early and midday windows.',
      'Two hunts a day, anchoring the early and midday windows.\n\nR5: Yumin',
    ],
    to: 'Two Bear Hunts each day.\n\nR5: Yumin',
  },
  'wb-2-desc': {
    from: [
      'Three hunts, running from EU evening through NA late night.',
      'Three hunts, running from EU evening through NA late night.\n\nR5: Woff',
    ],
    to: 'Three Bear Hunts each day.\n\nR5: Woff',
  },
  'wb-3-desc': {
    from: [
      'Two hunts anchoring the SEA / AU daytime window.',
      'Two hunts anchoring the SEA / AU daytime window.\n\nR5: Asriellexx',
    ],
    to: 'Two Bear Hunts each day.\n\nR5: Asriellexx',
  },
};

// Strings from the oldest seeds: treated as "never edited" (use the default).
export const LEGACY_HOME_COPY = {
  'hero-kicker': 'KINGDOM 710 · KINGSHOT',
  'hero-title': 'Kingdom 710',
  'hero-sub': 'A competitive kingdom built on discipline, coordination, and shared standards.',
};

/**
 * rows: content_blocks docs for page 'home' ({ content: { key, text } }).
 * defaults: the Page text defaults for 'home' (keys use underscores).
 * Returns { page_text_key: text } only for values that differ from the default.
 */
export function resolveHomeLegacy(rows, defaults) {
  const stored = {};
  for (const row of rows || []) {
    const key = row?.content?.key;
    if (key && !(key in stored)) stored[key] = row.content.text;
  }
  const out = {};
  for (const ptKey of Object.keys(defaults)) {
    if (typeof defaults[ptKey] !== 'string') continue;
    const key = ptKey.replace(/_/g, '-');
    // why-1 is fixed in code (not read from content_blocks), so nothing to import.
    if (key === 'why-1-title' || key === 'why-1-body') continue;
    if (!(key in stored) || typeof stored[key] !== 'string') continue;
    let text = stored[key];
    if (LEGACY_HOME_COPY[key] && text.trim() === LEGACY_HOME_COPY[key]) continue;
    const rewrite = COPY_REWRITES[key];
    if (rewrite && (!text.trim() || rewrite.from.includes(text.trim()))) text = rewrite.to;
    if (!text.trim()) continue;
    if (text.trim() !== defaults[ptKey]) out[ptKey] = text.trim();
  }
  return out;
}

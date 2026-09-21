// Plain-language definitions for the game and site jargon that appears across
// K710 Hub. A newer member — or a member's spouse checking the site — should
// be able to look up any unfamiliar term in one place. Linked from the footer
// and rendered by app/glossary/page.js. Grouped for scanning, not alphabetized.

export const GLOSSARY_GROUPS = [
  {
    heading: 'Events & war',
    terms: [
      {
        term: 'Bear Hunt',
        definition:
          'A daily alliance event where members rally together to attack a giant bear for rewards. Each alliance runs its own daily times — see the schedule to find one that fits your day.',
      },
      {
        term: 'KvK (Kingdom vs Kingdom)',
        definition:
          'A war season where kingdoms compete against each other. K710 is “KvK-first”, meaning we organize and prepare specifically to do well in these seasons.',
      },
      {
        term: 'Flamedragon Tyrant',
        definition:
          'A limited-time boss event. Members coordinate rally times and advisor slots to take it down together for shared rewards.',
      },
      {
        term: 'Prep Phase Backpack',
        definition:
          'The resources and speedups you set aside during a KvK preparation phase. The KvK form tracks what you plan to bring so leadership can plan the season.',
      },
      {
        term: 'Noble Advisor',
        definition:
          'A scheduling system for advisor slots during Flamedragon Tyrant. The Noble Advisor form is where you sign up for a time.',
      },
    ],
  },
  {
    heading: 'Power & progression',
    terms: [
      {
        term: 'Power',
        definition:
          'A single number summarizing your account’s overall strength. It rises as you upgrade gear, troops, heroes, and buildings.',
      },
      {
        term: 'Governor Gear',
        definition:
          'The six pieces of equipment your governor wears. Upgrading and refining them is one of the biggest sources of power.',
      },
      {
        term: 'Charms',
        definition:
          'Slottable upgrades for your three troop types — Infantry, Cavalry, and Archer. There are 18 charm slots in total.',
      },
      {
        term: 'Masters',
        definition:
          'A progression system for leveling special “master” units and their skills using dedicated materials.',
      },
      {
        term: 'Mystic Trial',
        definition:
          'A progression track shown on your profile that contributes to your overall power.',
      },
      {
        term: 'TrueGold',
        definition:
          'A high-tier upgrade material and building tier (TG1–TG10). Reaching TrueGold tiers is a late-game power milestone.',
      },
    ],
  },
  {
    heading: 'On this site',
    terms: [
      {
        term: 'Power Profile',
        definition:
          'Your saved record of gear, charms, heroes, and troops here on K710 Hub. Keeping it current gives leadership accurate power data for every event.',
      },
      {
        term: 'Profiles (in tools)',
        definition:
          'A saved set of inputs inside a calculator so you can switch between different setups — for example a current build and a goal build — without re-typing everything.',
      },
      {
        term: 'Optimizer Ranking / Kingshot Optimizer',
        definition:
          'An external data source that powers the release timeline and several of the upgrade calculators on this site.',
      },
    ],
  },
];

// Flat list, handy for counts, search, or future tooltip lookups.
export const GLOSSARY_TERMS = GLOSSARY_GROUPS.flatMap((group) => group.terms);

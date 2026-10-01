/**
 * Kingdom 710 external ranking / timeline data.
 * Sourced from public Kingshot Optimizer & KS Atlas pages.
 * Values are snapshots for SSR; links always point at live sources.
 *
 * Optimizer kingdom page: https://kingshotoptimizer.com/kvk-rankings/kingdom/710
 * Optimizer rankings:     https://kingshotoptimizer.com/kvk-rankings
 * Atlas kingdom page:     https://ks-atlas.com/kingdom/710
 * Optimizer timeline:     https://kingshotoptimizer.com/kingdom-timeline/710
 */

export const OPTIMIZER_KINGDOM_URL = 'https://kingshotoptimizer.com/kvk-rankings/kingdom/710';
export const OPTIMIZER_RANKINGS_URL = 'https://kingshotoptimizer.com/kvk-rankings';
export const ATLAS_KINGDOM_URL = 'https://ks-atlas.com/kingdom/710';
export const OPTIMIZER_TIMELINE_URL = 'https://kingshotoptimizer.com/kingdom-timeline/710';

/** Date (YYYY-MM-DD) the snapshot values below were last refreshed. Update with them. */
export const KINGDOM_DATA_AS_OF = '2026-09-15';

/** Competitive summary + ranking snapshot from Optimizer (Full Record header). */
export const OPTIMIZER_RECORD = {
  kingdom: 710,
  kvksParticipated: 12,
  prep: { wins: 5, losses: 7 },
  battle: { wins: 11, losses: 1 },
  rating: 1.907,
  rank: 126,
  latestMatchup: {
    opponent: 308,
    opponentRank: 384,
    kvk: 17,
    matchQuality: 3.32,
    prep: 'win',
    battle: 'win',
  },
  toughestMatchup: {
    opponent: 685,
    opponentRank: 9,
    kvk: 13,
    matchQuality: 5.02,
    prep: 'loss',
    battle: 'loss',
  },
  sourceUrl: OPTIMIZER_KINGDOM_URL,
};

/** Atlas blue-box summary for kingdom 710. */
export const ATLAS_RANKING = {
  atlasScore: 57.59,
  rank: 107,
  topPercent: '5.0%',
  tier: 'S-Tier',
  sourceUrl: ATLAS_KINGDOM_URL,
};

/**
 * Kingdom timeline milestones from Kingshot Optimizer.
 * Order is chronological (early → late). Categories match Optimizer labels.
 */
export const TIMELINE_MILESTONES = [
  { title: 'Generation 1 Heroes', category: 'Heroes' },
  { title: 'First Hall of Governors (HoG)', category: 'New Feature' },
  { title: 'First Sanctuary Competition', category: 'PvP' },
  { title: 'Plains Fog Cleared', category: 'New Feature' },
  { title: 'Mystic Trial Unlocked', category: 'New Feature' },
  { title: 'First Fortress Competition', category: 'PvP' },
  { title: 'Hero Gear Reforge Unlocked', category: 'New Feature' },
  { title: 'Fertile Land Fog Cleared', category: 'New Feature' },
  {
    title: 'Generation 2 Heroes',
    category: 'Heroes',
    notes: 'Zoe (Infantry, Roulette), Hilde (Cavalry), Marlin (Archer)',
  },
  { title: 'Alliance Resource Exchange Unlocks', category: 'New Feature' },
  { title: 'First Castle Competition', category: 'PvP' },
  {
    title: 'Generation 1 Pets',
    category: 'Pets',
    notes: 'Grey Wolf, Lynx, and Bison',
  },
  { title: 'Age of Truegold', category: 'Truegold', notes: 'Unlocks TG levels 1–3' },
  {
    title: 'Generation 2 Pets',
    category: 'Pets',
    notes: 'Cheetah and Moose',
  },
  { title: 'First KvK Prep Starts', category: 'PvP' },
  { title: 'First KvK Castle Competition', category: 'PvP' },
  { title: 'First Alliance Brawl', category: 'PvP' },
  {
    title: 'Generation 3 Heroes',
    category: 'Heroes',
    notes: 'Eric (Infantry), Petra (Cavalry, Roulette), Jaeger (Archer)',
  },
  {
    title: 'Generation 3 Pets',
    category: 'Pets',
    notes: 'Lion and Grizzly Bear',
  },
  {
    title: 'Gov Gear Material Exchange Unlocks',
    category: 'New Feature',
    notes: 'Satin, Gilded Threads, Artisan\'s Vision',
  },
  {
    title: 'Masters Unlocked',
    category: 'New Feature',
    notes: 'Requires TC 25. Valora, Pan, and Roman',
  },
  {
    title: 'Truegold 5',
    category: 'Truegold',
    notes: 'Truegold Crucible; Transfer Window eligibility begins',
  },
  {
    title: 'Gov Charm Material Exchange Unlocked',
    category: 'New Feature',
    notes: 'Charm Guide and Charm Design',
  },
  { title: '4th Master Unlocked', category: 'New Feature', notes: 'Cassia' },
  {
    title: 'Governor Charm Cap Raised',
    category: 'New Feature',
    notes: 'Charms level 12+ available',
  },
  {
    title: 'Generation 4 Heroes',
    category: 'Heroes',
    notes: 'Alcar, Margot, Rosa (Roulette); Desert Trial → Champions Way',
  },
  {
    title: 'Generation 4 Pets',
    category: 'Pets',
    notes: 'Giant Rhino and Mighty Bison',
  },
  {
    title: '5th and 6th Masters Unlocked',
    category: 'New Feature',
    notes: 'Guinevere and Wilson',
  },
  {
    title: 'War Academy Unlocked',
    category: 'New Feature',
    notes: 'Truegold Dust and T11 troops',
  },
  {
    title: 'Generation 5 Heroes',
    category: 'Heroes',
    notes: 'Long Fei (Roulette), Thrud, Vivian',
  },
  {
    title: 'Generation 5 Pets',
    category: 'Pets',
    notes: 'Great Moose and Alpha Black Panther',
  },
  {
    title: 'Truegold 8',
    category: 'Truegold',
    notes: 'Tempered Truegold; Governor gear chests in Mystic Trial store',
  },
  {
    title: 'Generation 6 Heroes',
    category: 'Heroes',
    notes: 'Triton, Sophia (Roulette), Yang',
  },
  {
    title: 'Generation 6 Pets',
    category: 'Pets',
    notes: 'Regal White Lion and Ironclad War Elephant',
  },
  { title: 'First Flamedragon Tyrant Competition', category: 'PvP' },
  {
    title: 'Generation 7 Heroes',
    category: 'Heroes',
    notes: 'Charles, Ava, Wee & Woo (Roulette)',
  },
  {
    title: 'Generation 7 Pets',
    category: 'Pets',
    notes: 'Ironclad War Bear',
  },
  {
    title: 'Advanced Truegold Research',
    category: 'Truegold',
    notes: 'Available in the War Academy',
  },
  { title: 'Generation 8 Heroes', category: 'Heroes', notes: 'Gen 6 enter gold key pool' },
  { title: 'Generation 9 Heroes', category: 'Heroes', notes: 'Gen 7 enter gold key pool' },
  {
    title: 'Truegold 10',
    category: 'Truegold',
    notes: 'Truegold levels 9 and 10',
  },
];

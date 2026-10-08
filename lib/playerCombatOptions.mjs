// KvK Availability roster. Removed from the list on purpose: Yeonwoo, Amadeus, Vivian, Margot, Alcar,
// Long Fei, Sophia, Zoe, Jaeger, Rosa (new saves reject them; old saved values are dropped on load).
export const HEROES = [
  'Chenko', 'Amane', 'Thrud', 'Saul', 'Hilde', 'Gordon', 'Eric', 'Fahd', 'Triton', 'Petra',
];

export const TROOP_TIERS = ['T11', 'T10'];
export const TROOP_TGS = ['TG8', 'TG7', 'TG6', 'TG5', 'Below TG5'];

export const PROFILE_UNIT_FIELDS = [
  { key: 'infantry', label: 'Infantry', tier: 'infantry_tier', tg: 'infantry_tg' },
  { key: 'cavalry', label: 'Cavalry', tier: 'cavalry_tier', tg: 'cavalry_tg' },
  { key: 'archer', label: 'Archer', tier: 'archer_tier', tg: 'archer_tg' },
];

// Same options offered on the KvK Availability form (app/dashboard/PlayerRecordForm.js).
export const KVK_AVAILABILITY_OPTIONS = [
  'First half (12-14:30 UTC)',
  'Second half (14:30-17 UTC)',
  'Full battle (12-17 UTC)',
  'Not Available',
];

// Same alliances offered on the KvK Availability form.
export const KVK_ALLIANCES = ['710', 'RED', 'SKY'];

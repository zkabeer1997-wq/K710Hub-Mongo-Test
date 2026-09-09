export const TTG_TIERS = Object.freeze(
  [
    {
      tier: 1,
      from: 1,
      to: 20,
      cost: 20,
      outcomes: [
        [1, 0.65],
        [2, 0.25],
        [3, 0.1],
      ],
    },
    {
      tier: 2,
      from: 21,
      to: 40,
      cost: 50,
      outcomes: [
        [2, 0.85],
        [3, 0.15],
      ],
    },
    {
      tier: 3,
      from: 41,
      to: 60,
      cost: 100,
      outcomes: [
        [3, 0.85],
        [4, 0.125],
        [5, 0.02],
        [6, 0.005],
      ],
    },
    {
      tier: 4,
      from: 61,
      to: 80,
      cost: 130,
      outcomes: [
        [3, 0.75],
        [4, 0.15],
        [5, 0.05],
        [6, 0.03],
        [7, 0.01],
        [8, 0.005],
        [9, 0.005],
      ],
    },
    {
      tier: 5,
      from: 81,
      to: 100,
      cost: 160,
      outcomes: [
        [3, 0.7],
        [4, 0.12],
        [5, 0.09],
        [6, 0.04],
        [7, 0.015],
        [8, 0.01],
        [9, 0.01],
        [10, 0.005],
        [11, 0.005],
        [12, 0.005],
      ],
    },
  ].map((row) => ({
    ...row,
    expected: row.outcomes.reduce(
      (sum, [value, chance]) => sum + value * chance,
      0,
    ),
    min: row.outcomes[0][0],
    max: row.outcomes.at(-1)[0],
  })),
);

export const CHARM_LEVELS = Object.freeze(
  [
    null,
    [5, 5, 9, 205700],
    [40, 15, 3, 82300],
    [60, 40, 4, 82000],
    [80, 100, 3, 82000],
    [100, 200, 6, 124000],
    [120, 300, 5, 124000],
    [140, 400, 5, 124000],
    [200, 400, 5, 124000],
    [300, 400, 5, 124000],
    [420, 420, 5, 124000],
    [560, 420, 5, 124000],
    [580, 600, 4, 96000],
    [610, 780, 4, 96000],
    [645, 960, 4, 96000],
    [685, 1140, 4, 96000],
    [730, 1320, 4, 96000],
    [780, 1500, 4, 96000],
    [835, 1680, 4, 96000],
    [895, 1860, 4, 96000],
    [960, 2040, 4, 96000],
    [1030, 2220, 4, 96000],
    [1105, 2400, 4, 96000],
  ].map(
    (row, level) =>
      row && {
        level,
        guides: row[0],
        designs: row[1],
        health: row[2],
        lethality: row[2],
        power: row[3],
      },
  ),
);

// KvK Preparation points are awarded for completing the target charm level,
// not for consuming Guides or Designs. Levels 1-11 are player-verified;
// 12-21 follow the supplied table's established progression and 22 is an
// explicitly labelled extrapolation until an in-game capture is available.
export const CHARM_KVK_POINTS = Object.freeze([
  0, 43750, 87500, 218750, 612500, 787500, 875000, 875000, 910000,
  980000, 1050000, 1120000, 1260000, 1470000, 1680000, 1890000,
  2100000, 2310000, 2520000, 2730000, 2940000, 3150000, 3360000,
]);

export function charmKvkProvenance(level) {
  if (level <= 11) return "verified";
  if (level <= 21) return "derived";
  return "extrapolated";
}

export const PETS = Object.freeze(
  [
    ["Gray Wolf", 1, 50, 0.3],
    ["Bison", 1, 60, 0.4],
    ["Lynx", 1, 60, 0.4],
    ["Moose", 2, 70, 0.6],
    ["Cheetah", 2, 70, 0.6],
    ["Lion", 3, 80, 0.8],
    ["Grizzly Bear", 3, 80, 0.8],
    ["Mighty Bison", 4, 100, 1],
    ["Giant Rhino", 4, 100, 1],
    ["Great Moose", 5, 100, 1],
    ["Alpha Black Panther", 5, 100, 1],
    ["Ironclad War Elephant", 6, 100, 1],
    ["Regal White Lion", 6, 100, 1],
    ["Ironclad War Bear", 7, 100, 1],
  ].map(([name, generation, maxLevel, costScale]) => ({
    name,
    generation,
    maxLevel,
    costScale,
  })),
);

// Exact Pet Food costs for each completed level, indexed by max-level rarity
// group. Array index 0 is the cost for level 1 -> 2. These values come from
// the supplied per-level workbook; they must not be reconstructed with a
// rarity multiplier because the in-game curves round and diverge by group.
export const PET_FOOD_COSTS = Object.freeze({
  50: Object.freeze([150,161,171,182,193,203,214,224,235,250,266,281,297,312,328,343,359,374,390,410,431,452,473,494,516,537,558,579,600,630,661,692,723,754,786,817,848,879,910,950,991,1032,1073,1114,1156,1197,1238,1279,1320]),
  60: Object.freeze([200,221,243,264,285,306,328,349,370,400,431,462,493,524,556,587,618,649,680,720,762,804,847,889,931,973,1016,1058,1100,1160,1222,1284,1347,1409,1471,1533,1596,1658,1720,1800,1882,1964,2047,2129,2211,2293,2376,2458,2540,2640,2742,2844,2947,3049,3151,3253,3356,3458,3560]),
  70: Object.freeze([300,332,364,396,428,459,491,523,555,600,647,693,740,787,833,880,927,973,1020,1080,1143,1207,1270,1333,1397,1460,1523,1587,1650,1740,1833,1927,2020,2113,2207,2300,2393,2487,2580,2700,2823,2947,3070,3193,3317,3440,3563,3687,3810,3960,4113,4267,4420,4573,4727,4880,5033,5187,5340,5520,5700,5880,6060,6240,6420,6600,6780,6960,7140]),
  80: Object.freeze([400,443,485,528,570,613,655,698,740,800,862,924,987,1049,1111,1173,1236,1298,1360,1440,1524,1609,1693,1778,1862,1947,2031,2116,2200,2320,2444,2569,2693,2818,2942,3067,3191,3316,3440,3600,3764,3929,4093,4258,4422,4587,4751,4916,5080,5280,5484,5689,5893,6098,6302,6507,6711,6916,7120,7360,7600,7840,8080,8320,8560,8800,9040,9280,9520,9760,10009,10258,10507,10756,11004,11253,11502,11751,12000]),
  100: Object.freeze([500,553,606,659,713,766,819,872,925,1000,1078,1156,1233,1311,1389,1467,1544,1622,1700,1800,1906,2011,2117,2222,2328,2433,2539,2644,2750,2900,3056,3211,3367,3522,3678,3833,3989,4144,4300,4500,4706,4911,5117,5322,5528,5733,5939,6144,6350,6600,6856,7111,7367,7622,7878,8133,8389,8644,8900,9200,9500,9800,10100,10400,10700,11000,11300,11600,11900,12200,12550,12900,13250,13600,13950,14300,14650,15000,15350,15750,16150,16550,16950,17350,17750,18150,18550,18950,19350,19800,20250,20700,21150,21600,22050,22500,22950,23400,23100]),
});

export const PET_ADVANCEMENT = Object.freeze({
  50: {
    10: [15, 0, 0],
    20: [30, 0, 0],
    30: [45, 10, 0],
    40: [60, 20, 0],
    50: [90, 30, 10],
  },
  60: {
    10: [20, 0, 0],
    20: [40, 0, 0],
    30: [60, 10, 0],
    40: [90, 20, 0],
    50: [130, 30, 10],
    60: [175, 50, 20],
  },
  70: {
    10: [25, 0, 0],
    20: [50, 0, 0],
    30: [75, 10, 0],
    40: [100, 20, 0],
    50: [155, 30, 10],
    60: [200, 50, 20],
    70: [255, 80, 40],
  },
  80: {
    10: [30, 0, 0],
    20: [60, 0, 0],
    30: [95, 10, 0],
    40: [125, 20, 0],
    50: [190, 30, 10],
    60: [250, 50, 20],
    70: [310, 80, 40],
    80: [380, 100, 60],
  },
  100: {
    10: [35, 0, 0],
    20: [70, 0, 0],
    30: [110, 15, 0],
    40: [145, 35, 0],
    50: [220, 50, 10],
    60: [290, 65, 20],
    70: [365, 85, 40],
    80: [440, 100, 60],
    90: [585, 115, 80],
    100: [730, 135, 100],
  },
});

// One Advanced Pet Chest can be redeemed for exactly one of these yields.
export const ADVANCED_CHEST_CONTENTS = Object.freeze({
  manuals: 7,
  potions: 2,
  medallions: 1,
});

export const HERO_XP_MILESTONES = Object.freeze([
  { level: 20, xp: 52650, mithril: 10, mythic: 5 },
  { level: 40, xp: 75050, mithril: 20, mythic: 5 },
  { level: 60, xp: 93100, mithril: 30, mythic: 5 },
  { level: 80, xp: 121600, mithril: 40, mythic: 10 },
  { level: 100, xp: 159600, mithril: 50, mythic: 10 },
]);
export const HERO_MASTERY_COSTS = Object.freeze(
  Array.from({ length: 20 }, (_, i) => ({
    level: i + 1,
    forgehammers: (i + 1) * 10,
    // Mastery 11-20 also consumes Mythic Gear. Mastery reforging returns 50%
    // of Forgehammers but never returns these Mythic Gear pieces.
    mythicPieces: Math.max(0, i + 1 - 10),
  })),
);
export const HERO_XP_ITEMS = Object.freeze({
  common: 10,
  uncommon: 30,
  rare: 60,
  epic: 150,
});
export const HERO_SLOT_STAT = Object.freeze({
  Helmet: "Lethality",
  Boots: "Lethality",
  Chest: "Health",
  Gloves: "Health",
});

const governorRaw = [
  ["Green", 1500, 15, 0, 224400, 9.35, 2],
  ["Green II", 3800, 40, 0, 306000, 3.4, 2.5],
  ["Blue", 7000, 70, 0, 408000, 4.25, 3],
  ["Blue II", 9700, 95, 0, 510000, 4.25, 3.5],
  ["Blue III", 1000, 10, 45, 612000, 4.25, 4],
  ["Blue IV", 1000, 10, 50, 714000, 4.25, 4.5],
  ["Purple", 1500, 15, 60, 816000, 4.25, 5],
  ["Purple +1", 1500, 15, 70, 885360, 2.89, 5],
  ["Purple +2", 6500, 65, 40, 954720, 2.89, 5],
  ["Purple +3", 8000, 80, 50, 1024080, 2.89, 5],
  ["Purple T1", 10000, 95, 60, 1093440, 2.89, 6],
  ["Purple T1 +1", 11000, 110, 70, 1162800, 2.89, 6],
  ["Purple T1 +2", 13000, 130, 85, 1232160, 2.89, 6],
  ["Purple T1 +3", 15000, 160, 100, 1301520, 2.89, 6],
  ["Gold", 22000, 220, 40, 1362720, 2.55, 7],
  ["Gold +1", 23000, 230, 40, 1423920, 2.55, 7],
  ["Gold +2", 25000, 250, 45, 1485120, 2.55, 7],
  ["Gold +3", 26000, 260, 45, 1546320, 2.55, 7],
  ["Gold T1", 28000, 280, 45, 1607520, 2.55, 8],
  ["Gold T1 +1", 30000, 300, 55, 1668720, 2.55, 8],
  ["Gold T1 +2", 32000, 320, 55, 1729920, 2.55, 8],
  ["Gold T1 +3", 35000, 340, 55, 1791120, 2.55, 8],
  ["Gold T2", 38000, 390, 55, 1852320, 2.55, 9],
  ["Gold T2 +1", 43000, 430, 75, 1913520, 2.55, 9],
  ["Gold T2 +2", 45000, 460, 80, 1974720, 2.55, 9],
  ["Gold T2 +3", 48000, 500, 85, 2040000, 2.55, 9],
  ["Gold T3", 60000, 600, 120, 2097120, 2.55, 10],
  ["Gold T3 +1", 70000, 700, 140, 2158320, 2.55, 10],
  ["Gold T3 +2", 80000, 800, 160, 2219520, 2.55, 10],
  ["Gold T3 +3", 90000, 900, 180, 2280000, 2.52, 10],
  ["Red", 108000, 1080, 220, 2340000, 2.5, 12],
  ["Red +1", 114000, 1140, 230, 2400000, 2.5, 12],
  ["Red +2", 121000, 1210, 240, 2460000, 2.5, 12],
  ["Red +3", 128000, 1280, 250, 2520000, 2.5, 12],
  ["Red T1", 154000, 1540, 300, 2580000, 2.5, 14],
  ["Red T1 +1", 163000, 1630, 320, 2640000, 2.5, 14],
  ["Red T1 +2", 173000, 1730, 340, 2700000, 2.5, 14],
  ["Red T1 +3", 183000, 1830, 360, 2760000, 2.5, 14],
  ["Red T2", 220000, 2200, 430, 2820000, 2.5, 16.5],
  ["Red T2 +1", 233000, 2330, 460, 2880000, 2.5, 16.5],
  ["Red T2 +2", 247000, 2470, 490, 2940000, 2.5, 16.5],
  ["Red T2 +3", 264000, 2640, 520, 3000000, 2.5, 16.5],
  ["Red T3", 288000, 2880, 570, 3066000, 2.75, 19.5],
  ["Red T3 +1", 302000, 3020, 600, 3132000, 2.75, 19.5],
  ["Red T3 +2", 317000, 3170, 630, 3198000, 2.75, 19.5],
  ["Red T3 +3", 333000, 3330, 660, 3264000, 2.75, 19.5],
  ["Red T4", 358000, 3580, 720, 3330000, 2.75, 23],
  ["Red T4 +1", 384000, 3840, 770, 3396000, 2.75, 23],
  ["Red T4 +2", 403000, 4030, 810, 3462000, 2.75, 23],
  ["Red T4 +3", 423000, 4230, 850, 3528000, 2.75, 23],
  ["Red T5", 451000, 4510, 910, 3600000, 3, 26.5],
  ["Red T5 +1", 479000, 4790, 970, 3672000, 3, 26.5],
  ["Red T5 +2", 507000, 5070, 1030, 3744000, 3, 26.5],
  ["Red T5 +3", 535000, 5350, 1090, 3816000, 3, 26.5],
  ["Red T6", 548000, 5480, 1110, 3888000, 3, 30],
  ["Red T6 +1", 565000, 5650, 1140, 3960000, 3, 30],
  ["Red T6 +2", 582000, 5820, 1170, 4032000, 3, 30],
  ["Red T6 +3", 599000, 5990, 1210, 4104000, 3, 30],
];
export const GOVERNOR_GEAR_LEVELS = Object.freeze(
  governorRaw.map(
    ([tier, satin, threads, visions, power, statGain, setBonus], index) => ({
      index,
      tier,
      satin,
      threads,
      visions,
      power,
      statGain,
      setBonus,
    }),
  ),
);

// KvK Preparation points are tied to the completed gear upgrade. Values
// through Gold T2 +3 come from the supplied workbook; later rows are clearly
// marked so the UI/export never presents an extrapolation as verified data.
const governorKvkByTier = Object.freeze({
  Green: 40500, "Green II": 67500,
  Blue: 108000, "Blue II": 162000, "Blue III": 183600, "Blue IV": 194400,
  Purple: 116280, "Purple +1": 116280, "Purple +2": 116100, "Purple +3": 116100,
  "Purple T1": 123840, "Purple T1 +1": 123840, "Purple T1 +2": 147060, "Purple T1 +3": 147060,
  Gold: 225000, "Gold +1": 225000, "Gold +2": 225000, "Gold +3": 225000,
  "Gold T1": 225000, "Gold T1 +1": 225000, "Gold T1 +2": 225000, "Gold T1 +3": 225000,
  "Gold T2": 225000, "Gold T2 +1": 225000, "Gold T2 +2": 225000, "Gold T2 +3": 225000,
  "Gold T3": 324000, "Gold T3 +1": 324000, "Gold T3 +2": 324000, "Gold T3 +3": 324000,
  Red: 432000, "Red +1": 432000, "Red +2": 432000, "Red +3": 432000,
  "Red T1": 540000, "Red T1 +1": 540000, "Red T1 +2": 540000, "Red T1 +3": 540000,
  "Red T2": 720000, "Red T2 +1": 720000, "Red T2 +2": 720000, "Red T2 +3": 720000,
  "Red T3": 900000, "Red T3 +1": 900000, "Red T3 +2": 900000, "Red T3 +3": 900000,
  "Red T4": 1080000, "Red T4 +1": 1080000, "Red T4 +2": 1080000, "Red T4 +3": 1080000,
  "Red T5": 1260000, "Red T5 +1": 1260000, "Red T5 +2": 1260000, "Red T5 +3": 1260000,
  "Red T6": 1440000, "Red T6 +1": 1440000, "Red T6 +2": 1440000, "Red T6 +3": 1440000,
});

export const GOVERNOR_GEAR_KVK_POINTS = Object.freeze(
  Object.fromEntries(GOVERNOR_GEAR_LEVELS.map((row) => [row.tier, governorKvkByTier[row.tier] || 0])),
);

export function governorKvkProvenance(tier) {
  const index = GOVERNOR_GEAR_LEVELS.findIndex((row) => row.tier === tier);
  if (index <= 25) return "verified";
  if (index <= 45) return "player-provided";
  return "extrapolated";
}

export const MASTERS = Object.freeze([
  "Valora",
  "Pan",
  "Roman",
  "Cassia",
  "Guinevere",
  "Wilson",
]);
export const MASTER_RELATIONSHIPS = Object.freeze([
  { level: 0, affinity: 1000, emblems: 0, buff: 0 },
  { level: 10, affinity: 340, emblems: 5, buff: 2.85 },
  { level: 20, affinity: 540, emblems: 10, buff: 4.2 },
  { level: 30, affinity: 760, emblems: 15, buff: 5.55 },
  { level: 40, affinity: 1080, emblems: 20, buff: 6.9 },
  { level: 50, affinity: 1500, emblems: 25, buff: 8.25 },
  { level: 60, affinity: 2000, emblems: 30, buff: 9.6 },
  { level: 70, affinity: 2500, emblems: 35, buff: 10.95 },
  { level: 80, affinity: 3000, emblems: 40, buff: 12.3 },
  { level: 90, affinity: 3500, emblems: 45, buff: 13.65 },
  { level: 100, affinity: 3950, emblems: 50, buff: 15 },
]);

const relationship = (label, rows) => ({
  label,
  rows: rows.map(([level, affinity, emblems, buff]) => ({
    level,
    affinity,
    emblems,
    buff,
  })),
});
export const MASTER_DATA = Object.freeze({
  Valora: {
    title: "Bear Hunter",
    ...relationship("Squads' Attack", [
      [0, 1000, 0, 0],
      [10, 340, 5, 2.85],
      [20, 540, 10, 4.2],
      [30, 760, 15, 5.55],
      [40, 1080, 20, 6.9],
      [50, 1500, 25, 8.25],
      [60, 2000, 30, 9.6],
      [70, 2500, 35, 10.95],
      [80, 3000, 40, 12.3],
      [90, 3500, 45, 13.65],
      [100, 3950, 50, 15],
    ]),
    skills: [
      "Dance of the Hunt",
      "Leader by Example",
      "Weapon Obsession",
      "Savage Advantage",
    ],
  },
  Pan: {
    title: "Palace Administrator",
    ...relationship("Squads' Defense", [
      [1, 240, 0, 1.58],
      [10, 410, 5, 2.85],
      [20, 650, 10, 4.2],
      [30, 920, 15, 5.55],
      [40, 1300, 20, 6.9],
      [50, 1800, 25, 8.25],
      [60, 2400, 30, 9.6],
      [70, 3000, 35, 10.95],
      [80, 3600, 40, 12.3],
      [90, 4200, 45, 13.65],
      [100, 4740, 50, 15],
    ]),
    skills: ["Falconer", "Good Steward", "Master Architect", "Ways and Means"],
  },
  Roman: {
    title: "Arena Champion",
    ...relationship("Squads' Attack & Defense", [
      [1, 1000, 0, 1.58],
      [10, 960, 8, 2.85],
      [20, 1560, 16, 4.2],
      [30, 2190, 24, 5.55],
      [40, 3120, 32, 6.9],
      [50, 4350, 40, 8.25],
      [60, 5850, 48, 9.6],
      [70, 7350, 56, 10.95],
      [80, 8850, 64, 12.3],
      [90, 10350, 72, 13.65],
      [100, 11850, 80, 15],
    ]),
    skills: [
      "Teacher of Champions",
      "Winner Take All",
      "Crowd Favorite",
      "One Desire",
    ],
  },
  Cassia: {
    title: "Battle Commander",
    ...relationship("Squads' Lethality & Health", [
      [1, 1100, 0, 2.1],
      [10, 1870, 20, 3.8],
      [20, 2970, 40, 5.6],
      [30, 4180, 80, 7.4],
      [40, 5940, 120, 9.2],
      [50, 8250, 160, 11],
      [60, 11000, 200, 12.8],
      [70, 13750, 240, 14.6],
      [80, 16500, 280, 16.4],
      [90, 19250, 320, 18.2],
      [100, 0, 360, 20],
    ]),
    skills: [
      "Recruiter in Chief",
      "Firepower to Win",
      "Commando",
      "Inspiring Mobilization",
    ],
  },
  Guinevere: {
    title: "Queen of Holy Sword",
    ...relationship("Squad Lethality & HP", [
      [1, 1000, 12, 1.58],
      [10, 1600, 12, 2.25],
      [20, 2600, 24, 3.6],
      [30, 3650, 36, 4.95],
      [40, 5200, 48, 6.3],
      [50, 7250, 60, 7.65],
      [60, 9750, 72, 9],
      [70, 12250, 84, 10.35],
      [80, 14750, 96, 11.7],
      [90, 17250, 108, 13.05],
      [100, 19750, 120, 15],
    ]),
    skills: [
      "Max Efficiency",
      "Merciful Heart",
      "Royal Guidance",
      "Call of Round Table",
    ],
  },
  Wilson: {
    title: "Royal Herald",
    ...relationship("Squad Attack & Defense", [
      [1, 400, 6, 1.05],
      [10, 640, 6, 1.5],
      [20, 1040, 12, 2.4],
      [30, 1460, 18, 3.3],
      [40, 2080, 24, 4.2],
      [50, 2900, 30, 5.1],
      [60, 3900, 36, 6],
      [70, 4900, 42, 6.9],
      [80, 5900, 48, 7.8],
      [90, 6900, 54, 8.7],
      [100, 7900, 60, 10],
    ]),
    skills: [
      "Mobilization Master",
      "Championship Publicity",
      "Viking Bounty",
      "Duel Sponsorship",
    ],
  },
});

export const MASTER_SKILL_COSTS = Object.freeze({
  5: [
    [0, 0],
    [27600, 400],
    [55200, 800],
    [110400, 1600],
    [220800, 3200],
  ],
  10: [
    [0, 0],
    [25800, 300],
    [77400, 600],
    [154800, 900],
    [258000, 1200],
    [387600, 1500],
    [543000, 1800],
    [724200, 2100],
    [931200, 2400],
    [1164000, 2700],
  ],
  20: [
    [0, 0],
    [86400, 500],
    [172800, 1000],
    [259200, 1500],
    [345600, 2000],
    [432000, 2500],
    [518400, 3000],
    [604800, 3500],
    [691200, 4000],
    [777600, 4500],
    [864000, 5000],
    [950400, 5500],
    [1036800, 6000],
    [1209600, 7000],
    [1382400, 8000],
    [1382400, 8000],
    [1555200, 9000],
    [1555200, 9000],
    [1728000, 10000],
    [1728000, 10000],
  ],
});

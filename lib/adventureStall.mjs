export const SHOP_ITEMS = [
  {
    key: "true-gold-limited",
    name: "True Gold",
    shells: 30,
    reward: 58,
    unit: "pieces",
    max: 2,
  },
  {
    key: "hero-shards",
    name: "Hero Shards",
    shells: 50,
    reward: 12,
    unit: "shards",
    max: 2,
  },
  {
    key: "forgehammers-limited",
    name: "Forgehammers",
    shells: 100,
    reward: 75,
    unit: "hammers",
    max: 2,
  },
  {
    key: "mithril",
    name: "Mithril",
    shells: 40,
    reward: 1,
    unit: "Mithril",
    max: 25,
  },
  {
    key: "mythic-hero-gear",
    name: "Mythic Hero Gear Chest",
    shells: 120,
    reward: 1,
    unit: "chest",
    max: 9,
  },
  {
    key: "island-pieces",
    name: "Island Pieces",
    shells: 10,
    reward: 1,
    unit: "piece",
    max: 300,
  },
  {
    key: "hero-gear-chests",
    name: "Hero Gear Regular Chest",
    shells: 50,
    reward: 30,
    unit: "chests",
    max: 30,
  },
  {
    key: "forgehammers-regular",
    name: "Regular Forgehammers",
    shells: 50,
    reward: 30,
    unit: "hammers",
    max: 30,
  },
  {
    key: "true-gold-regular",
    name: "Regular True Gold",
    shells: 10,
    reward: 15,
    unit: "pieces",
    max: 50,
  },
  {
    key: "visions",
    name: "Artisan's Visions",
    shells: 20,
    reward: 28,
    unit: "visions",
    max: 100,
  },
  {
    key: "threads",
    name: "Threads",
    shells: 20,
    reward: 140,
    unit: "threads",
    max: 100,
  },
  {
    key: "satin",
    name: "Satin",
    shells: 20,
    reward: 14000,
    unit: "Satin",
    max: 100,
  },
  {
    key: "charm-designs",
    name: "Charm Designs",
    shells: 20,
    reward: 24,
    unit: "designs",
    max: 100,
  },
  {
    key: "charm-guides",
    name: "Charm Guides",
    shells: 20,
    reward: 24,
    unit: "guides",
    max: 100,
  },
  {
    key: "pet-food",
    name: "Pet Food",
    shells: 20,
    reward: 4800,
    unit: "food",
    max: 50,
  },
  {
    key: "pet-chests",
    name: "Pet Chests",
    shells: 25,
    reward: 7,
    unit: "chests",
    max: 50,
  },
  {
    key: "pet-refinement",
    name: "Advanced Pet Refinement",
    shells: 100,
    reward: 10,
    unit: "refinements",
    max: 50,
  },
];

export const PACKS = [
  { key: "20", name: "20 Shell Pack", shells: 20, cents: 99, perDay: 1 },
  { key: "40", name: "40 Shell Pack", shells: 40, cents: 199, perDay: 1 },
  { key: "80", name: "80 Shell Pack", shells: 80, cents: 499, perDay: 1 },
  { key: "120", name: "120 Shell Pack", shells: 120, cents: 999, perDay: 1 },
  { key: "200", name: "200 Shell Pack", shells: 200, cents: 1999, perDay: 1 },
  { key: "500", name: "500 Shell Pack", shells: 500, cents: 4999, perDay: 1 },
  {
    key: "1000",
    name: "1,000 Shell Pack",
    shells: 1000,
    cents: 9999,
    perDay: 3,
  },
];

export function packLimits(daysRemaining, packs = PACKS) {
  const days = Math.min(
    30,
    Math.max(0, Math.floor(Number(daysRemaining) || 0)),
  );
  return Object.fromEntries(
    packs.map((pack) => [pack.key, pack.perDay * days]),
  );
}

export function optimizeShellPacks(
  requiredShells,
  daysRemaining,
  packs = PACKS,
) {
  const target = Math.max(0, Math.ceil(Number(requiredShells) || 0));
  const quantities = Object.fromEntries(packs.map((pack) => [pack.key, 0]));
  if (target === 0)
    return { costCents: 0, shells: 0, overage: 0, count: 0, quantities };

  const limits = packLimits(daysRemaining, packs);
  const unit = 5;
  const targetUnits = Math.ceil(target / unit);
  const maxUnits = packs.reduce(
    (sum, pack) => sum + (pack.shells / unit) * limits[pack.key],
    0,
  );
  if (targetUnits > maxUnits) return null;

  const bundles = [];
  packs.forEach((pack, packIndex) => {
    for (let index = 0; index < limits[pack.key]; index += 1)
      bundles.push({ pack, packIndex });
  });
  let states = new Map([
    [0, { costCents: 0, count: 0, quantities: Array(packs.length).fill(0) }],
  ]);
  bundles.forEach(({ pack, packIndex }) => {
    const next = new Map(states);
    const packUnits = pack.shells / unit;
    for (const [currentUnits, state] of states) {
      const amountUnits = currentUnits + packUnits;
      const candidate = {
        costCents: state.costCents + pack.cents,
        count: state.count + 1,
        quantities: state.quantities.map((value, index) =>
          index === packIndex ? value + 1 : value,
        ),
      };
      const existing = next.get(amountUnits);
      if (
        !existing ||
        candidate.costCents < existing.costCents ||
        (candidate.costCents === existing.costCents &&
          candidate.count < existing.count)
      )
        next.set(amountUnits, candidate);
    }
    states = next;
  });

  let best = null;
  for (const [amountUnits, state] of states) {
    if (amountUnits < targetUnits) continue;
    const candidate = { ...state, amountUnits };
    if (
      !best ||
      candidate.costCents < best.costCents ||
      (candidate.costCents === best.costCents &&
        candidate.amountUnits < best.amountUnits) ||
      (candidate.costCents === best.costCents &&
        candidate.amountUnits === best.amountUnits &&
        candidate.count < best.count)
    )
      best = candidate;
  }
  if (!best) return null;
  const shells = best.amountUnits * unit;
  return {
    costCents: best.costCents,
    shells,
    overage: shells - target,
    count: best.count,
    quantities: Object.fromEntries(
      packs.map((pack, index) => [pack.key, best.quantities[index]]),
    ),
  };
}

export function shellPackSchedule(plan, daysRemaining, packs = PACKS) {
  if (!plan) return [];
  const days = Math.max(0, Math.floor(Number(daysRemaining) || 0));
  return Array.from({ length: days }, (_, index) => ({
    day: index + 1,
    purchases: packs
      .map((pack) => ({
        pack,
        quantity: Math.min(
          pack.perDay,
          Math.max(0, (plan.quantities[pack.key] || 0) - index * pack.perDay),
        ),
      }))
      .filter((entry) => entry.quantity > 0),
  })).filter((entry) => entry.purchases.length > 0);
}

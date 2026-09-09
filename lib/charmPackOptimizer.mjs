const GUIDE_UNIT = 20;
const DESIGN_UNIT = 22;

const whole = (value) => Math.max(0, Math.trunc(Number(value) || 0));

function normalizedPacks(packs) {
  return packs.map((pack, index) => ({
    ...pack,
    index,
    priceCents: Math.max(0, Math.round(Number(pack.priceCents ?? Number(pack.price) * 100) || 0)),
    g: whole(pack.g),
    d: whole(pack.d),
    choices: whole(pack.choices),
    max: whole(pack.max),
  }));
}

function allocationStates(packs, quantities, high) {
  let states = new Map([[0, []]]);
  for (let index = 0; index < packs.length; index += 1) {
    const unit = packs[index].g / GUIDE_UNIT;
    const maxSlots = quantities[index] * packs[index].choices;
    const next = new Map();
    for (const [sum, used] of states) {
      for (let guideSlots = 0; guideSlots <= maxSlots; guideSlots += 1) {
        const value = sum + guideSlots * unit;
        if (value > high) break;
        if (!next.has(value)) next.set(value, [...used, guideSlots]);
      }
    }
    states = next;
  }
  return states;
}

function allocationFor(packs, quantities, low, high) {
  for (const [sum, used] of allocationStates(packs, quantities, high)) {
    if (sum >= low) return { sum, used };
  }
  return null;
}

function planAtHorizon(packs, weeks, shortfall) {
  const guideUnits = Math.ceil(shortfall.g / GUIDE_UNIT);
  const designUnits = Math.ceil(shortfall.d / DESIGN_UNIT);
  let states = new Map([[0, { costCents: 0, quantities: [] }]]);
  for (let index = 0; index < packs.length; index += 1) {
    const pack = packs[index];
    const limit = pack.max * weeks;
    const capacity = pack.choices * (pack.g / GUIDE_UNIT);
    const next = new Map();
    for (const [total, state] of states) {
      for (let quantity = 0; quantity <= limit; quantity += 1) {
        const delivered = total + quantity * capacity;
        const costCents = state.costCents + quantity * pack.priceCents;
        const previous = next.get(delivered);
        if (!previous || costCents < previous.costCents) {
          next.set(delivered, { costCents, quantities: [...state.quantities, quantity] });
        }
      }
    }
    states = next;
  }

  const candidates = [...states.entries()]
    .filter(([capacity]) => capacity >= guideUnits + designUnits)
    .sort((a, b) => a[1].costCents - b[1].costCents || a[0] - b[0]);
  for (const [capacity, state] of candidates) {
    const allocation = allocationFor(packs, state.quantities, guideUnits, capacity - designUnits);
    if (!allocation) continue;
    const picks = state.quantities.map((quantity, index) => {
      const guideSlots = allocation.used[index];
      const slots = quantity * packs[index].choices;
      const designSlots = slots - guideSlots;
      return {
        index: packs[index].index,
        quantity,
        guideSlots,
        designSlots,
        guides: guideSlots * packs[index].g,
        designs: designSlots * packs[index].d,
        costCents: quantity * packs[index].priceCents,
      };
    });
    return { costCents: state.costCents, picks };
  }
  return null;
}

function scheduleFor(picks, packs, weeks) {
  const schedule = Array.from({ length: weeks }, (_, index) => ({ week: index + 1, purchases: [] }));
  for (const pick of picks.filter((item) => item.quantity > 0)) {
    const pack = packs.find((item) => item.index === pick.index);
    let quantity = pick.quantity;
    let guideSlots = pick.guideSlots;
    for (let week = 0; week < weeks && quantity > 0; week += 1) {
      const purchases = Math.min(pack.max, quantity);
      const slots = purchases * pack.choices;
      const guides = Math.min(slots, guideSlots);
      schedule[week].purchases.push({
        ...pick,
        quantity: purchases,
        guideSlots: guides,
        designSlots: slots - guides,
        guides: guides * pack.g,
        designs: (slots - guides) * pack.d,
        costCents: purchases * pack.priceCents,
      });
      quantity -= purchases;
      guideSlots -= guides;
    }
  }
  return schedule;
}

export function optimizeCharmPacks({ packs = [], required = {}, owned = {}, maxWeeks = 52, objective = "lowest-cost" } = {}) {
  const normalized = normalizedPacks(packs);
  const safeWeeks = Math.max(1, Math.min(52, whole(maxWeeks) || 1));
  const need = { g: whole(required.g), d: whole(required.d) };
  const inventory = { g: whole(owned.g), d: whole(owned.d) };
  const shortfall = { g: Math.max(0, need.g - inventory.g), d: Math.max(0, need.d - inventory.d) };
  if (shortfall.g === 0 && shortfall.d === 0) {
    return { covered: true, weeks: 0, costCents: 0, cost: 0, shortfall, purchased: { g: 0, d: 0 }, remaining: { g: inventory.g - need.g, d: inventory.d - need.d }, picks: [], schedule: [] };
  }
  const invalid = normalized.some((pack) => pack.priceCents < 0 || pack.choices < 1 || pack.max < 1 || pack.g < 1 || pack.d < 1 || pack.g % GUIDE_UNIT !== 0 || pack.d % DESIGN_UNIT !== 0 || pack.g / GUIDE_UNIT !== pack.d / DESIGN_UNIT);
  if (invalid) return { invalid: true, shortfall };

  let found = null;
  if (objective === "fastest") {
    for (let weeks = 1; weeks <= safeWeeks && !found; weeks += 1) {
      const plan = planAtHorizon(normalized, weeks, shortfall);
      if (plan) found = { ...plan, weeks };
    }
  } else {
    const plan = planAtHorizon(normalized, safeWeeks, shortfall);
    if (plan) {
      const weeks = Math.max(1, ...plan.picks.map((pick) => {
        const pack = normalized.find((item) => item.index === pick.index);
        return pick.quantity ? Math.ceil(pick.quantity / pack.max) : 0;
      }));
      found = { ...plan, weeks };
    }
  }
  if (!found) return { infeasible: true, shortfall };

  const purchased = found.picks.reduce((sum, pick) => ({ g: sum.g + pick.guides, d: sum.d + pick.designs }), { g: 0, d: 0 });
  return {
    ...found,
    cost: found.costCents / 100,
    shortfall,
    purchased,
    remaining: { g: inventory.g + purchased.g - need.g, d: inventory.d + purchased.d - need.d },
    schedule: scheduleFor(found.picks, normalized, found.weeks),
  };
}

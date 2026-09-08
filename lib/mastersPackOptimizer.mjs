export const MASTER_PACK_TIERS = Object.freeze([
  { name: "Common", price: 4.99, multiplier: 1 },
  { name: "Uncommon", price: 9.99, multiplier: 2 },
  { name: "Rare", price: 19.99, multiplier: 4 },
  { name: "Epic", price: 49.99, multiplier: 10 },
  { name: "Legendary", price: 99.99, multiplier: 20 },
]);

export const MASTER_PACK_RESOURCES = Object.freeze({
  supply: { label: "Adventure Supply", regularBase: 15, acuityBase: 30 },
  emblems: { label: "Master Emblems", regularBase: 8, acuityBase: 16 },
  affinity: { label: "Affinity", regularBase: 8800, acuityBase: 16000 },
  manuscripts: { label: "Master's Manuscripts", regularBase: 500, acuityBase: 1000 },
});

const RESOURCE_KEYS = Object.keys(MASTER_PACK_RESOURCES);
const DEFAULT_BUDGET_MS = 7000;
class OptimizationTimeout extends Error {}

function checkDeadline(deadline, operations) {
  if ((operations & 0x7ff) === 0 && Date.now() > deadline) throw new OptimizationTimeout();
}

function regularPlanGetter(need, base, weeks) {
  const cap = Math.ceil(Math.max(0, need) / base);
  let states = new Map([[0, { cost: 0, picks: Array(5).fill(0) }]]);
  MASTER_PACK_TIERS.forEach((tier, tierIndex) => {
    const next = new Map();
    for (const [units, plan] of states) {
      for (let quantity = 0; quantity <= weeks; quantity++) {
        const delivered = Math.min(cap, units + quantity * tier.multiplier);
        const cost = plan.cost + quantity * tier.price;
        const previous = next.get(delivered);
        if (!previous || cost < previous.cost - 1e-7) {
          const picks = [...plan.picks];
          picks[tierIndex] = quantity;
          next.set(delivered, { cost, picks });
        }
      }
    }
    states = next;
  });
  return remaining => {
    if (remaining <= 0) return { cost: 0, amount: 0, picks: Array(5).fill(0) };
    const units = Math.ceil(remaining / base);
    const plan = states.get(Math.min(cap, units));
    return plan ? { ...plan, amount: units * base } : null;
  };
}

function allocations(limit) {
  const result = [];
  for (let supply = 0; supply <= limit; supply++) {
    for (let emblems = 0; emblems <= limit - supply; emblems++) {
      for (let affinity = 0; affinity <= limit - supply - emblems; affinity++) {
        for (let manuscripts = 0; manuscripts <= limit - supply - emblems - affinity; manuscripts++) {
          result.push({ supply, emblems, affinity, manuscripts });
        }
      }
    }
  }
  return result;
}

function acuityPlans(shortfall, months, deadline) {
  const caps = Object.fromEntries(RESOURCE_KEYS.map(key => [key, Math.ceil(shortfall[key] / MASTER_PACK_RESOURCES[key].acuityBase)]));
  let states = new Map([["0:0:0:0", { delivered: { supply: 0, emblems: 0, affinity: 0, manuscripts: 0 }, cost: 0, picks: Array(5).fill(null) }]]);
  const choices = allocations(months);
  let operations = 0;
  MASTER_PACK_TIERS.forEach((tier, tierIndex) => {
    const next = new Map();
    for (const plan of states.values()) {
      for (const choice of choices) {
        checkDeadline(deadline, ++operations);
        const delivered = {};
        for (const key of RESOURCE_KEYS) delivered[key] = Math.min(caps[key], plan.delivered[key] + choice[key] * tier.multiplier);
        const key = RESOURCE_KEYS.map(resource => delivered[resource]).join(":");
        const quantity = RESOURCE_KEYS.reduce((sum, resource) => sum + choice[resource], 0);
        const cost = plan.cost + quantity * tier.price;
        const previous = next.get(key);
        if (!previous || cost < previous.cost - 1e-7) {
          const picks = [...plan.picks];
          picks[tierIndex] = { ...choice };
          next.set(key, { delivered, cost, picks });
        }
      }
    }
    states = next;
  });
  return states.values();
}

function buildSchedule(plan) {
  const totalWeeks = plan.months * 4;
  const weeks = Array.from({ length: totalWeeks }, (_, index) => ({ week: index + 1, month: Math.floor(index / 4) + 1, acuity: [], regular: [] }));
  plan.acuity.picks.forEach((choice, tierIndex) => {
    let monthCursor = 0;
    for (const resource of RESOURCE_KEYS) {
      for (let count = 0; count < choice[resource]; count++) {
        const weekIndex = monthCursor * 4;
        weeks[weekIndex].acuity.push({ tier: MASTER_PACK_TIERS[tierIndex].name, price: MASTER_PACK_TIERS[tierIndex].price, resource, amount: MASTER_PACK_RESOURCES[resource].acuityBase * MASTER_PACK_TIERS[tierIndex].multiplier });
        monthCursor++;
      }
    }
  });
  for (const [resource, resourcePlan] of Object.entries(plan.regular)) {
    resourcePlan.picks.forEach((quantity, tierIndex) => {
      for (let count = 0; count < quantity; count++) {
        weeks[count].regular.push({ tier: MASTER_PACK_TIERS[tierIndex].name, price: MASTER_PACK_TIERS[tierIndex].price, resource, amount: MASTER_PACK_RESOURCES[resource].regularBase * MASTER_PACK_TIERS[tierIndex].multiplier });
      }
    });
  }
  return weeks;
}

export function optimizeMastersPacks({ need = {}, have = {}, maxMonths = 3, timeBudgetMs = DEFAULT_BUDGET_MS } = {}) {
  const shortfall = Object.fromEntries(RESOURCE_KEYS.map(key => [key, Math.max(0, Number(need[key] || 0) - Number(have[key] || 0))]));
  if (RESOURCE_KEYS.every(key => shortfall[key] === 0)) return { covered: true, cost: 0, months: 0, weeks: 0, shortfall, schedule: [] };
  const horizon = Math.max(1, Math.min(6, Math.floor(maxMonths || 1)));
  const deadline = Date.now() + Math.max(1000, Number(timeBudgetMs) || DEFAULT_BUDGET_MS);
  let best = null;
  try {
    for (let months = 1; months <= horizon; months++) {
      const weeks = months * 4;
      const regularGetters = Object.fromEntries(RESOURCE_KEYS.map(key => [key, regularPlanGetter(shortfall[key], MASTER_PACK_RESOURCES[key].regularBase, weeks)]));
      for (const acuity of acuityPlans(shortfall, months, deadline)) {
        const regular = {};
        let regularCost = 0;
        let feasible = true;
        for (const key of RESOURCE_KEYS) {
          const acuityAmount = acuity.delivered[key] * MASTER_PACK_RESOURCES[key].acuityBase;
          regular[key] = regularGetters[key](shortfall[key] - acuityAmount);
          if (!regular[key]) { feasible = false; break; }
          regularCost += regular[key].cost;
        }
        if (!feasible) continue;
        const cost = acuity.cost + regularCost;
        if (!best || cost < best.cost - 1e-7 || (Math.abs(cost - best.cost) < 1e-7 && months < best.months)) {
          best = { months, weeks, cost, shortfall, acuity, regular };
        }
      }
    }
  } catch (error) {
    if (!(error instanceof OptimizationTimeout)) throw error;
    if (!best) return { timedOut: true, shortfall };
    best.partialSearch = true;
  }
  if (!best) return { infeasible: true, shortfall };
  best.schedule = buildSchedule(best);
  return best;
}

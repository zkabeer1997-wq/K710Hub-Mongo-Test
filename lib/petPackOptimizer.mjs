export const PET_PACK_TIERS = [
  { name: "Common", price: 4.99, multiplier: 1 },
  { name: "Uncommon", price: 9.99, multiplier: 2 },
  { name: "Rare", price: 19.99, multiplier: 4 },
  { name: "Epic", price: 49.99, multiplier: 10 },
  { name: "Legendary", price: 99.99, multiplier: 20 },
];

export const PET_RESOURCES = {
  food: { label: "Pet Food", singleBase: 9000 },
  manual: { label: "Growth Manuals", singleBase: 55, chestYield: 7 },
  potion: { label: "Nutrient Potions", singleBase: 16, chestYield: 2 },
  medal: { label: "Promotion Medallions", singleBase: 8, chestYield: 1 },
};

const DEFAULT_TIME_BUDGET_MS = 8000;

class OptimizationTimeout extends Error {}

function checkDeadline(deadline, opCount) {
  if (deadline && (opCount & 0x3ff) === 0 && Date.now() > deadline)
    throw new OptimizationTimeout();
}

export function createPetPackOptimizer({
  resources = PET_RESOURCES,
  customFood = 5000,
  customChests = 6,
} = {}) {
  const PET_RESOURCES = resources;
  const CUSTOM_FOOD_BASE = customFood;
  const CUSTOM_CHEST_BASE = customChests;

  function singlePlans(need, base, weeks) {
    const cap = Math.ceil(Math.max(0, need) / base);
    let states = new Map([[0, { cost: 0, picks: Array(5).fill(0) }]]);
    PET_PACK_TIERS.forEach((tier, index) => {
      const next = new Map();
      for (const [units, plan] of states) {
        for (let q = 0; q <= weeks; q++) {
          const total = Math.min(cap, units + q * tier.multiplier);
          const cost = plan.cost + q * tier.price;
          const old = next.get(total);
          if (!old || cost < old.cost - 1e-7) {
            const picks = [...plan.picks];
            picks[index] = q;
            next.set(total, { cost, picks });
          }
        }
      }
      states = next;
    });
    const exact = [...states.entries()].sort((a, b) => a[0] - b[0]);
    return (remaining) => {
      if (remaining <= 0)
        return { cost: 0, amount: 0, picks: Array(5).fill(0) };
      const required = Math.ceil(remaining / base);
      const match = exact.find(([units]) => units >= required);
      return match ? { ...match[1], amount: match[0] * base } : null;
    };
  }

  function customPlans(foodNeed, chestNeed, weeks, deadline) {
    const foodCap = Math.ceil(Math.max(0, foodNeed) / CUSTOM_FOOD_BASE);
    const chestCap = Math.ceil(Math.max(0, chestNeed) / CUSTOM_CHEST_BASE);
    let states = new Map([
      [
        "0:0",
        {
          foodUnits: 0,
          chestUnits: 0,
          cost: 0,
          picks: Array(5)
            .fill(null)
            .map(() => ({ packs: 0, foodSlots: 0, chestSlots: 0 })),
        },
      ],
    ]);
    let opCount = 0;
    PET_PACK_TIERS.forEach((tier, index) => {
      const next = new Map();
      for (const plan of states.values()) {
        for (let packs = 0; packs <= weeks; packs++) {
          const slots = packs * 3;
          for (let foodSlots = 0; foodSlots <= slots; foodSlots++) {
            checkDeadline(deadline, ++opCount);
            const chestSlots = slots - foodSlots;
            const foodUnits = Math.min(
              foodCap,
              plan.foodUnits + foodSlots * tier.multiplier,
            );
            const chestUnits = Math.min(
              chestCap,
              plan.chestUnits + chestSlots * tier.multiplier,
            );
            const cost = plan.cost + packs * tier.price;
            const key = `${foodUnits}:${chestUnits}`;
            const old = next.get(key);
            if (!old || cost < old.cost - 1e-7) {
              const picks = plan.picks.map((item) => ({ ...item }));
              picks[index] = { packs, foodSlots, chestSlots };
              next.set(key, { foodUnits, chestUnits, cost, picks });
            }
          }
        }
      }
      states = next;
    });
    return [...states.values()];
  }

  function resourcePlanForChests(
    shortfall,
    ownedChests,
    boughtChests,
    weeks,
    deadline,
  ) {
    const available = ownedChests + boughtChests;
    const getters = {
      manual: singlePlans(
        shortfall.manual,
        PET_RESOURCES.manual.singleBase,
        weeks,
      ),
      potion: singlePlans(
        shortfall.potion,
        PET_RESOURCES.potion.singleBase,
        weeks,
      ),
      medal: singlePlans(
        shortfall.medal,
        PET_RESOURCES.medal.singleBase,
        weeks,
      ),
    };
    const costs = {};
    for (const key of ["manual", "potion", "medal"]) {
      costs[key] = Array.from({ length: available + 1 }, (_, chests) =>
        getters[key](shortfall[key] - chests * PET_RESOURCES[key].chestYield),
      );
    }
    let best = null;
    let opCount = 0;
    for (let manualChests = 0; manualChests <= available; manualChests++) {
      for (
        let potionChests = 0;
        potionChests <= available - manualChests;
        potionChests++
      ) {
        checkDeadline(deadline, ++opCount);
        const medalChests = available - manualChests - potionChests;
        const plans = {
          manual: costs.manual[manualChests],
          potion: costs.potion[potionChests],
          medal: costs.medal[medalChests],
        };
        if (!plans.manual || !plans.potion || !plans.medal) continue;
        const cost = plans.manual.cost + plans.potion.cost + plans.medal.cost;
        if (!best || cost < best.cost - 1e-7)
          best = {
            cost,
            allocations: {
              manual: manualChests,
              potion: potionChests,
              medal: medalChests,
            },
            plans,
          };
      }
    }
    return best;
  }

  function optimizePetPacks({
    need,
    have,
    ownedChests = 0,
    maxWeeks = 12,
    timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
    budgetCap = 0,
    maxWeeklySpend = 0,
  }) {
    const shortfall = Object.fromEntries(
      Object.keys(PET_RESOURCES).map((key) => [
        key,
        Math.max(0, Number(need[key] || 0) - Number(have[key] || 0)),
      ]),
    );
    if (Object.values(shortfall).every((value) => value === 0))
      return { weeks: 0, cost: 0, shortfall, covered: true, schedule: [] };
    const safeWeeks = Math.max(1, Math.min(26, Math.floor(maxWeeks || 1)));
    const deadline =
      Date.now() + Math.max(1000, timeBudgetMs || DEFAULT_TIME_BUDGET_MS);
    let best = null;
    let timedOut = false;
    try {
      for (let weeks = 1; weeks <= safeWeeks; weeks++) {
        const maxChestsNeeded = ["manual", "potion", "medal"].reduce(
          (sum, key) =>
            sum + Math.ceil(shortfall[key] / PET_RESOURCES[key].chestYield),
          0,
        );
        const foodSingles = singlePlans(
          shortfall.food,
          PET_RESOURCES.food.singleBase,
          weeks,
        );
        // resourcePlanForChests only depends on boughtChests (not on the food split), so
        // many customPlans() entries share the same boughtChests value — cache by it.
        const resourcePlanCache = new Map();
        for (const custom of customPlans(
          shortfall.food,
          maxChestsNeeded,
          weeks,
          deadline,
        )) {
          const customFood = custom.foodUnits * CUSTOM_FOOD_BASE;
          const boughtChests = custom.chestUnits * CUSTOM_CHEST_BASE;
          const foodPlan = foodSingles(shortfall.food - customFood);
          if (!foodPlan) continue;
          let resourcePlan = resourcePlanCache.get(boughtChests);
          if (resourcePlan === undefined) {
            resourcePlan = resourcePlanForChests(
              shortfall,
              ownedChests,
              boughtChests,
              weeks,
              deadline,
            );
            resourcePlanCache.set(boughtChests, resourcePlan);
          }
          if (!resourcePlan) continue;
          const cost = custom.cost + foodPlan.cost + resourcePlan.cost;
          if (budgetCap > 0 && cost > budgetCap + 1e-7) continue;
          const candidate = {
            weeks,
            cost,
            shortfall,
            custom,
            customFood,
            boughtChests,
            foodPlan,
            resourcePlan,
          };
          candidate.schedule = buildSchedule(candidate);
          candidate.packCount = candidate.schedule.reduce(
            (sum, week) => sum + week.custom.length + week.singles.length,
            0,
          );
          candidate.maxWeekCost = candidate.schedule.reduce(
            (highest, week) =>
              Math.max(
                highest,
                [...week.custom, ...week.singles].reduce(
                  (sum, item) => sum + item.price,
                  0,
                ),
              ),
            0,
          );
          if (
            maxWeeklySpend > 0 &&
            candidate.maxWeekCost > maxWeeklySpend + 1e-7
          )
            continue;
          const supplied = {
            food: candidate.customFood + candidate.foodPlan.amount,
          };
          for (const key of ["manual", "potion", "medal"])
            supplied[key] =
              candidate.resourcePlan.plans[key].amount +
              candidate.resourcePlan.allocations[key] *
                PET_RESOURCES[key].chestYield;
          candidate.waste = Object.keys(PET_RESOURCES).reduce(
            (sum, key) => sum + Math.max(0, supplied[key] - shortfall[key]),
            0,
          );
          if (
            !best ||
            cost < best.cost - 1e-7 ||
            (Math.abs(cost - best.cost) < 1e-7 &&
              (weeks < best.weeks ||
                (weeks === best.weeks &&
                  (candidate.waste < best.waste ||
                    (candidate.waste === best.waste &&
                      candidate.packCount < best.packCount)))))
          ) {
            best = candidate;
          }
        }
      }
    } catch (error) {
      if (error instanceof OptimizationTimeout) timedOut = true;
      else throw error;
    }
    if (!best)
      return timedOut
        ? { timedOut: true, optimal: false, shortfall }
        : { infeasible: true, optimal: true, shortfall };
    best.schedule ||= buildSchedule(best);
    best.optimal = !timedOut;
    best.timedOut = timedOut;
    const supplied = { food: best.customFood + best.foodPlan.amount };
    for (const key of ["manual", "potion", "medal"])
      supplied[key] =
        best.resourcePlan.plans[key].amount +
        best.resourcePlan.allocations[key] * PET_RESOURCES[key].chestYield;
    best.surplus = Object.fromEntries(
      Object.keys(PET_RESOURCES).map((key) => [
        key,
        Math.max(0, supplied[key] - shortfall[key]),
      ]),
    );
    return best;
  }

  function buildSchedule(plan) {
    const weeks = Array.from({ length: plan.weeks }, (_, index) => ({
      week: index + 1,
      custom: [],
      singles: [],
    }));
    const place = (count, make, bucket) => {
      for (let i = 0; i < count; i++) bucket[i % weeks.length].push(make());
    };
    plan.custom.picks.forEach((pick, tierIndex) => {
      if (!pick.packs) return;
      let foodSlots = pick.foodSlots;
      place(
        pick.packs,
        () => {
          const slots = Math.min(3, foodSlots);
          foodSlots -= slots;
          return {
            tier: PET_PACK_TIERS[tierIndex].name,
            price: PET_PACK_TIERS[tierIndex].price,
            foodSlots: slots,
            chestSlots: 3 - slots,
          };
        },
        weeks.map((w) => w.custom),
      );
    });
    const singleSets = { food: plan.foodPlan, ...plan.resourcePlan.plans };
    Object.entries(singleSets).forEach(([resource, single]) =>
      single.picks.forEach((count, tierIndex) => {
        place(
          count,
          () => ({
            resource,
            tier: PET_PACK_TIERS[tierIndex].name,
            price: PET_PACK_TIERS[tierIndex].price,
            amount:
              PET_RESOURCES[resource].singleBase *
              PET_PACK_TIERS[tierIndex].multiplier,
          }),
          weeks.map((w) => w.singles),
        );
      }),
    );
    return weeks;
  }

  return optimizePetPacks;
}
export const optimizePetPacks = createPetPackOptimizer();

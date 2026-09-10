import {
  ADVANCED_CHEST_CONTENTS,
  CHARM_LEVELS,
  CHARM_KVK_POINTS,
  charmKvkProvenance,
  GOVERNOR_GEAR_LEVELS,
  GOVERNOR_GEAR_KVK_POINTS,
  governorKvkProvenance,
  HERO_MASTERY_COSTS,
  HERO_SLOT_STAT,
  MASTER_DATA,
  MASTER_SKILL_COSTS,
  PET_ADVANCEMENT,
  PET_FOOD_COSTS,
  PETS,
  TTG_TIERS,
} from "./phase2Data.mjs";

export const PHASE2_DATASETS = Object.freeze({
  ttg: {
    key: "ttg-refinement",
    available: true,
    expectedShape:
      "array of { state, refinementNumber, inputTrueGold, outputMin, outputExpected, outputMax, dailyLimit }",
  },
  pets: {
    key: "pet-progression",
    available: true,
    expectedShape:
      "array of { pet, generation, fromLevel, toLevel, food, manuals, potions, medallions }",
  },
  charmStats: {
    key: "charm-stats",
    available: true,
    expectedShape:
      "array of { troopType, charmNumber, level, health, lethality }",
  },
  heroGear: {
    key: "hero-gear",
    available: true,
    expectedShape:
      "array of { slot, rarity, enhancement, mastery, ascension, imbuement, costs, stats }",
  },
  governorGear: {
    key: "governor-gear",
    available: true,
    expectedShape:
      "array of { piece, tier, satin, threads, visions, stats, setBonus }",
  },
  masters: {
    key: "masters",
    available: true,
    expectedShape:
      "array of { master, expertLevel, relationship, talent, skills, costs, learningSeconds, power, buffs }",
  },
});

export function planTtgProduction(input, recipes = TTG_TIERS) {
  if (!Array.isArray(recipes) || recipes.length === 0)
    return { status: "missing-data", schedule: [] };
  const days = Math.max(1, Math.trunc(input.horizonDays || 1));
  let tg = Math.max(0, Number(input.trueGold) || 0);
  let ttg = Math.max(0, Number(input.temperedTrueGold) || 0);
  const reserve =
    Math.max(0, Number(input.reserve) || 0) +
    Math.max(0, Number(input.requiredTrueGold) || 0);
  const income = Math.max(0, Number(input.dailyIncome) || 0);
  const target = Math.max(0, Number(input.requiredTempered) || 0);
  const schedule = [];
  let distribution = new Map([[ttg, 1]]);
  let attempt = Math.max(
    1,
    Math.min(100, Math.trunc(input.refinementState || 1)),
  );
  const perDay = Math.max(1, Math.trunc(input.refinementsPerDay || 1));
  const startWeekday = Math.max(
    0,
    Math.min(6, Math.trunc(input.startWeekday || 0)),
  );
  for (let day = 1; day <= days; day += 1) {
    tg += income;
    // JavaScript weekday 1 is Monday. The weekly attempt ladder resets at the
    // beginning of each Monday in the planning horizon.
    if (day > 1 && (startWeekday + day - 1) % 7 === 1) attempt = 1;
    const completed =
      day === 1 ? Math.max(0, Math.trunc(input.completedToday || 0)) : 0;
    let runs = 0,
      spent = 0,
      min = 0,
      expected = 0,
      max = 0;
    for (let dailyRun = completed; dailyRun < perDay; dailyRun += 1) {
      const projectedSoFar = input.riskMode === "guaranteed"
        ? min
        : input.riskMode === "expected"
          ? expected
          : (min + expected) / 2;
      if (input.stopAtTarget && target <= ttg + projectedSoFar) break;
      if (attempt > 100) break;
      const recipe =
        recipes.find(
          (item) =>
            attempt >= (item.from ?? item.state) &&
            attempt <= (item.to ?? item.state),
        ) || recipes[0];
      const cost =
        (recipe.cost ?? recipe.inputTrueGold) * (dailyRun === 0 ? 0.5 : 1);
      if (tg - cost < reserve) break;
      tg -= cost;
      spent += cost;
      runs += 1;
      min += recipe.min ?? recipe.outputMin;
      expected += recipe.expected ?? recipe.outputExpected;
      max += recipe.max ?? recipe.outputExpected;
      const next = new Map();
      for (const [total, probability] of distribution) {
        for (const [output, chance] of recipe.outcomes || [
          [recipe.outputExpected, 1],
        ]) {
          next.set(
            total + output,
            (next.get(total + output) || 0) + probability * chance,
          );
        }
      }
      distribution = next;
      attempt += 1;
    }
    const projected =
      input.riskMode === "guaranteed"
        ? min
        : input.riskMode === "expected"
          ? expected
          : (min + expected) / 2;
    ttg += projected;
    schedule.push({
      day,
      runs,
      attemptAfter: attempt,
      trueGoldSpent: spent,
      temperedProduced: projected,
      range: { min, expected, max },
      trueGoldRemaining: tg,
      temperedTotal: ttg,
    });
  }
  const reached = schedule.find((row) => row.temperedTotal >= target);
  const startDate = input.startDate
    ? new Date(`${input.startDate}T00:00:00Z`)
    : new Date();
  const earliestDate = reached
    ? new Date(
        Date.UTC(
          startDate.getUTCFullYear(),
          startDate.getUTCMonth(),
          startDate.getUTCDate() + reached.day - 1,
        ),
      )
        .toISOString()
        .slice(0, 10)
    : null;
  return {
    status: reached ? "achievable" : "shortfall",
    earliestDay: reached?.day || null,
    earliestDate,
    targetDateMet: input.targetDate
      ? Boolean(earliestDate && earliestDate <= input.targetDate)
      : null,
    schedule,
    finalTrueGold: tg,
    finalTempered: ttg,
    protectedTrueGold: reserve,
    confidence: summarizeDistribution(distribution),
  };
}

function summarizeDistribution(distribution) {
  const rows = [...distribution].sort((a, b) => a[0] - b[0]);
  let cumulative = 0,
    p10 = rows[0]?.[0] || 0,
    p90 = rows.at(-1)?.[0] || 0;
  for (const [value, probability] of rows) {
    cumulative += probability;
    if (cumulative >= 0.1 && p10 === rows[0]?.[0]) p10 = value;
    if (cumulative >= 0.9) {
      p90 = value;
      break;
    }
  }
  return {
    minimum: rows[0]?.[0] || 0,
    p10,
    p90,
    maximum: rows.at(-1)?.[0] || 0,
  };
}

export function buildPetRows(petName) {
  const pet = PETS.find((item) => item.name === petName) || PETS[0];
  const foodCosts = PET_FOOD_COSTS[pet.maxLevel] || [];
  const rows = [];
  for (let level = 1; level < pet.maxLevel; level += 1) {
    const next = level + 1;
    const advancement = PET_ADVANCEMENT[pet.maxLevel]?.[next] || [0, 0, 0];
    rows.push({
      pet: pet.name,
      generation: pet.generation,
      fromLevel: level,
      toLevel: next,
      food: foodCosts[next - 2] || 0,
      manuals: advancement[0],
      potions: advancement[1],
      medallions: advancement[2],
    });
  }
  return rows;
}

export function calculatePetProgression(input, rows = buildPetRows(input.pet)) {
  if (!Array.isArray(rows) || rows.length === 0)
    return { status: "missing-data", steps: [], totals: {} };
  const selected = input.locked ? [] : rows.filter(
    (row) =>
      row.pet === input.pet &&
      row.generation === input.generation &&
      row.fromLevel >= input.currentLevel &&
      row.toLevel <= input.targetLevel,
  );
  const keys = ["food", "manuals", "potions", "medallions"];
  const totals = Object.fromEntries(
    keys.map((key) => [
      key,
      selected.reduce((sum, row) => sum + (Number(row[key]) || 0), 0),
    ]),
  );
  const shortfall = Object.fromEntries(
    keys.map((key) => [
      key,
      Math.max(0, totals[key] - (Number(input.inventory?.[key]) || 0)),
    ]),
  );
  const available = { ...input.inventory };
  let reachable = Number(input.currentLevel) || 1;
  for (const step of selected) {
    if (keys.every((key) => (available[key] || 0) >= (step[key] || 0))) {
      for (const key of keys) available[key] -= step[key] || 0;
      reachable = step.toLevel;
    } else break;
  }
  const advancedChestAllocation = Object.fromEntries(
    ["manuals", "potions", "medallions"].map((key) => [
      key,
      Math.ceil(shortfall[key] / ADVANCED_CHEST_CONTENTS[key]),
    ]),
  );
  const advancedChestEquivalents = Object.values(
    advancedChestAllocation,
  ).reduce((sum, value) => sum + value, 0);
  return {
    status: selected.length ? "complete" : "missing-range",
    steps: selected,
    totals,
    shortfall,
    reachableLevel: reachable,
    advancedChestEquivalents,
    advancedChestAllocation,
  };
}

export function rankCharmUpgrades(
  charms,
  costs,
  inventory,
  weights,
  focus = {},
) {
  let guides = Math.max(0, Number(inventory.guides) || 0),
    designs = Math.max(0, Number(inventory.designs) || 0);
  const achieved = Object.fromEntries(
    charms.map((charm) => [charm.id, Number(charm.current) || 0]),
  );
  const upgrades = [];
  const profile = amplifyTroopWeights(
    weights.troops || {},
    Number(weights.amplification) || 1,
  );
  const targetFor = (charm) =>
    charm.locked
      ? Number(charm.current) || 0
      : Math.max(charm.current, Number(charm.target ?? 22) || 0);
  let nextCandidates = [];
  while (true) {
    const lowestLevel = Math.min(
      ...charms
        .filter((charm) => achieved[charm.id] < targetFor(charm))
        .map((charm) => achieved[charm.id]),
    );
    nextCandidates = charms
      .filter((charm) => achieved[charm.id] < targetFor(charm))
      .map((charm) => {
        const level = achieved[charm.id] + 1;
        const cost = costs[level];
        const stats = CHARM_LEVELS[level];
        if (!cost || !stats) return null;
        const troopWeight = balancedTroopWeight(profile, charm.type);
        const statValue =
          stats.health * (weights.stats?.Health ?? 1) +
          stats.lethality * (weights.stats?.Lethality ?? 1);
        const eventPoints = CHARM_KVK_POINTS[level] || 0;
        const value = weights.mode === "events" ? eventPoints : statValue;
        return {
          ...charm,
          level,
          guides: cost[0],
          designs: cost[1],
          health: stats.health,
          lethality: stats.lethality,
          power: stats.power,
          eventPoints,
          eventPointsProvenance: charmKvkProvenance(level),
          balancePriority:
            achieved[charm.id] === lowestLevel ||
            achieved[charm.id] < (Number(focus.minimumBalance) || 0)
              ? 1
              : 0,
          score:
            (value * troopWeight) /
            bottleneckCost(
              { guides: cost[0], designs: cost[1] },
              { guides, designs },
            ),
        };
      })
      .filter(Boolean)
      .sort(compareOptimizerCandidates);
    const selected = nextCandidates.find(
      (item) => item.guides <= guides && item.designs <= designs,
    );
    if (!selected) break;
    guides -= selected.guides;
    designs -= selected.designs;
    achieved[selected.id] = selected.level;
    upgrades.push(selected);
  }
  return {
    upgrades,
    remaining: { guides, designs },
    totals: upgrades.reduce(
      (sum, item) => ({
        health: sum.health + item.health,
        lethality: sum.lethality + item.lethality,
        power: sum.power + item.power,
        eventPoints: sum.eventPoints + item.eventPoints,
        guides: sum.guides + item.guides,
        designs: sum.designs + item.designs,
        weightedValue: sum.weightedValue + item.score,
      }),
      {
        health: 0,
        lethality: 0,
        power: 0,
        eventPoints: 0,
        guides: 0,
        designs: 0,
        weightedValue: 0,
      },
    ),
    next: nextCandidates[0] || null,
    nearMisses: nextCandidates.slice(0, 3),
  };
}

function bottleneckCost(costs, remaining) {
  const entries = Object.entries(costs).filter(([, cost]) => cost > 0);
  if (!entries.length) return 1;
  return entries.reduce((sum, [resource, cost]) => {
    const available = Math.max(1, Number(remaining[resource]) || 0);
    return sum + (cost / available) ** 2;
  }, 0);
}

function compareOptimizerCandidates(a, b) {
  return (
    b.balancePriority - a.balancePriority ||
    b.score - a.score ||
    a.guides + a.designs - (b.guides + b.designs) ||
    String(a.id).localeCompare(String(b.id))
  );
}

export function amplifyTroopWeights(raw, factor = 1) {
  const values = Object.values(raw)
    .map(Number)
    .sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)] ?? 1;
  return Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      value > median ? value * factor : value < median ? value / factor : value,
    ]),
  );
}

function balancedTroopWeight(profile, troop) {
  return Math.max(0, Number(profile[troop]) || 1);
}

export function calculateHeroGearPlan(rows, inventory) {
  rows = rows.map((row) => ({ ...row, include: row.locked ? false : row.include }));
  if (inventory.safeXpReforging !== false) {
    return calculateHeroGearWithReforging(rows, inventory);
  }
  return calculateHeroGearPlanCore(rows, inventory);
}

function calculateHeroGearPlanCore(rows, inventory) {
  const initialLevels = Object.fromEntries(
    rows.map((row) => [
      row.id || row.label,
      Math.max(
        heroGearMinLevel(row),
        Math.min(heroGearMaxLevel(row), Number(row.enhancement) || 0),
      ),
    ]),
  );
  const initialMasteries = Object.fromEntries(
    rows.map((row) => [
      row.id || row.label,
      Math.max(0, Math.min(20, Number(row.mastery) || 0)),
    ]),
  );
  let xpPlan = allocateHeroXp(rows, initialLevels, initialMasteries, inventory);
  let masteryPlan = allocateHeroMastery(
    rows,
    xpPlan.levels,
    initialMasteries,
    inventory,
  );
  for (let pass = 0; pass < 6; pass += 1) {
    const nextXpPlan = allocateHeroXp(
      rows,
      initialLevels,
      masteryPlan.masteries,
      inventory,
    );
    const nextMasteryPlan = allocateHeroMastery(
      rows,
      nextXpPlan.levels,
      initialMasteries,
      inventory,
    );
    xpPlan = nextXpPlan;
    const unchanged = rows.every((row) => {
      const id = row.id || row.label;
      return masteryPlan.masteries[id] === nextMasteryPlan.masteries[id];
    });
    masteryPlan = nextMasteryPlan;
    if (unchanged) break;
  }
  const { levels, actions } = xpPlan;
  let xp = xpPlan.remaining;
  let {
    masteries,
    remainingForgehammers: forgehammers,
    remainingMythicPieces: mythicPieces,
    actions: masteryActions,
  } = masteryPlan;
  const redPlan = allocateHeroRedProgress(rows, levels, masteries, {
    xp,
    forgehammers,
    mythicPieces,
    mithril: Math.max(0, Number(inventory.mithril) || 0),
  }, inventory);
  xp = redPlan.remaining.xp;
  forgehammers = redPlan.remaining.forgehammers;
  mythicPieces = redPlan.remaining.mythicPieces;
  const mithril = redPlan.remaining.mithril;
  const candidates = rows.map((row) => {
    const id = row.id || row.label;
    const rowActions = actions.filter((item) => item.id === id);
    const rowRedActions = redPlan.actions.filter((item) => item.id === id);
    const stat = HERO_SLOT_STAT[row.label.split(" ").at(-1)] || "Health";
    const targetLevel = levels[id];
    return {
      ...row,
      id,
      stat,
      targetLevel,
      targetMastery: masteries[id],
      xp: [...rowActions, ...rowRedActions].reduce(
        (sum, item) => sum + item.xp,
        0,
      ),
      statGain:
        [...rowActions, ...rowRedActions].reduce(
          (sum, item) => sum + item.statGain,
          0,
        ) +
        masteryActions
          .filter((item) => item.id === id)
          .reduce((sum, item) => sum + item.statGain, 0),
      mithril: redPlan.actions
        .filter((item) => item.id === id)
        .reduce((sum, item) => sum + item.mithril, 0),
      mythic: masteryActions
        .filter((item) => item.id === id)
        .reduce((sum, item) => sum + item.mythic, 0) +
        rowRedActions.reduce((sum, item) => sum + item.mythic, 0),
      forgehammers: masteryActions
        .filter((item) => item.id === id)
        .reduce((sum, item) => sum + item.forgehammers, 0),
    };
  });
  const orderedActions = [...actions, ...masteryActions, ...redPlan.actions];
  const firstAction = inventory.optimizationGoal === "events"
    ? orderedActions.find((item) => item.eventPoints > 0) || orderedActions[0] || null
    : orderedActions[0] || null;
  const first = firstAction
    ? candidates.find((item) => item.id === firstAction.id) || null
    : null;
  const used = {
    xp: Math.max(0, Number(inventory.xp) || 0) - xp,
    mithril: Math.max(0, Number(inventory.mithril) || 0) - mithril,
    mythicPieces:
      Math.max(0, Number(inventory.mythicPieces) || 0) - mythicPieces,
    forgehammers:
      Math.max(0, Number(inventory.forgehammers) || 0) - forgehammers,
  };
  const remaining = Object.fromEntries(
    ["xp", "mithril", "mythicPieces", "forgehammers"].map((key) => [
      key,
      Math.max(0, (inventory[key] || 0) - (used[key] || 0)),
    ]),
  );
  const packCandidates = buildHeroPackCandidates(rows, levels, masteries, inventory);
  const totalStatGain = orderedActions.reduce((sum, item) => sum + (item.statGain || 0), 0);
  const eventPoints = used.forgehammers * 4000 + used.mithril * 40000;
  return {
    recommendation: first,
    candidates,
    used,
    remaining,
    nextAction: firstAction,
    actions: orderedActions,
    totals: {
      statGain: totalStatGain,
      eventPoints,
      eventPointsProvenance: "verified",
    },
    bottleneck:
      xp === 0 && candidates.some((item) => item.targetLevel < 100)
        ? "xp"
        : masteryActions.length
          ? "forgehammers"
          : null,
    nearMisses: packCandidates.slice(0, 3),
    reforging: {
      xpRecovery: first?.tier?.toLowerCase() === "red" ? 0 : 1,
      forgehammerRecovery: 0.5,
    },
  };
}

function buildHeroPackCandidates(rows, levels, masteries, inventory) {
  return rows
    .filter((row) => row.include !== false)
    .flatMap((row) => {
      const id = row.id || row.label;
      const level = levels[id];
      const mastery = masteries[id];
      const candidates = [];
      if (level < heroGearMaxLevel(row)) {
        const nextLevel = level + 1;
        const milestone = HERO_RED_MILESTONES[nextLevel];
        const isRed = String(row.tier).toLowerCase().startsWith("red") || Number(row.ascension) > 0 || level > 100;
        if (!milestone || mastery >= milestone.mastery) {
          candidates.push({
            ...row,
            id,
            actionType: nextLevel > 100 ? "red-enhancement" : "enhancement",
            targetLevel: nextLevel,
            targetMastery: mastery,
            costs: {
              xp: heroXpLevelCost(nextLevel),
              forgehammers: 0,
              mythicPieces: (isRed ? 0 : nextLevel > 100 ? 2 : 0) + (milestone?.mythic || 0),
              mithril: milestone?.mithril || 0,
            },
          });
        }
      }
      if (mastery < 20) {
        const nextMastery = mastery + 1;
        const masteryCost = HERO_MASTERY_COSTS[nextMastery - 1];
        candidates.push({
          ...row,
          id,
          actionType: "mastery",
          targetLevel: level,
          targetMastery: nextMastery,
          costs: {
            xp: 0,
            forgehammers: masteryCost.forgehammers,
            mythicPieces: masteryCost.mythicPieces,
            mithril: 0,
          },
        });
      }
      return candidates;
    })
    .sort((a, b) =>
      bottleneckCost(a.costs, inventory) - bottleneckCost(b.costs, inventory) ||
      heroSlotPriority(a.label) - heroSlotPriority(b.label),
    );
}

function calculateHeroGearWithReforging(rows, inventory) {
  let workingRows = rows.map((row) => ({ ...row }));
  let recoveredXp = 0;
  const reforgeActions = [];
  let best = calculateHeroGearPlanCore(workingRows, {
    ...inventory,
    safeXpReforging: false,
  });
  let bestValue = heroPlanValue(best, inventory);
  for (let pass = 0; pass < rows.length; pass += 1) {
    let selected = null;
    for (let index = 0; index < workingRows.length; index += 1) {
      const row = workingRows[index];
      const current = Math.min(100, Math.max(0, Number(row.enhancement) || 0));
      if (
        row.include === false ||
        current <= 0 ||
        String(row.tier).toLowerCase().startsWith("red")
      )
        continue;
      const targets = [0, 20, 40, 60, 80].filter((level) => level < current);
      for (const targetLevel of targets) {
        const recovery = xpBetweenLevels(targetLevel, current);
        const trialRows = workingRows.map((item, rowIndex) =>
          rowIndex === index ? { ...item, enhancement: targetLevel } : item,
        );
        const trial = calculateHeroGearPlanCore(trialRows, {
          ...inventory,
          xp: Math.max(0, Number(inventory.xp) || 0) + recoveredXp + recovery,
          safeXpReforging: false,
        });
        const value = heroPlanValue(trial, inventory);
        if (
          value > bestValue + 1e-9 &&
          (!selected ||
            value > selected.value + 1e-9 ||
            (Math.abs(value - selected.value) < 1e-9 &&
              recovery < selected.recovery))
        ) {
          selected = {
            index,
            targetLevel,
            recovery,
            trialRows,
            trial,
            value,
          };
        }
      }
    }
    if (!selected) break;
    const source = workingRows[selected.index];
    reforgeActions.push({
      type: "xp-reforge",
      id: source.id || source.label,
      label: source.label,
      fromLevel: Number(source.enhancement) || 0,
      targetLevel: selected.targetLevel,
      xp: -selected.recovery,
      recoveredXp: selected.recovery,
    });
    workingRows = selected.trialRows;
    recoveredXp += selected.recovery;
    best = selected.trial;
    bestValue = selected.value;
  }
  if (!reforgeActions.length) return best;
  const appliedReforges = reforgeActions.map((action) => ({
    ...action,
    targetLevel:
      best.candidates.find((item) => item.id === action.id)?.targetLevel ??
      action.targetLevel,
  }));
  return {
    ...best,
    actions: [...appliedReforges, ...best.actions],
    reforging: {
      ...best.reforging,
      xpRecovered: recoveredXp,
      actions: appliedReforges,
    },
  };
}

function xpBetweenLevels(fromLevel, toLevel) {
  let total = 0;
  for (let level = fromLevel + 1; level <= toLevel; level += 1) {
    total += heroXpLevelCost(level);
  }
  return total;
}

function heroPlanValue(plan, inventory) {
  return plan.candidates.reduce((total, item) => {
    const weight =
      inventory.gearWeights?.[`${item.troop}.${item.stat}`] ??
      (inventory.troopWeights?.[item.troop] ?? 1) *
        (inventory.statWeights?.[item.stat] ?? 1);
    const levelStat = heroEnhancementValue(item, item.targetLevel);
    return total + levelStat * (1 + 0.1 * item.targetMastery) * weight;
  }, 0);
}

export function heroXpLevelCost(level) {
  if (level <= 0 || level > 200) return 0;
  if ([101, 120, 140, 160, 180, 200].includes(level)) return 0;
  if (level <= 29) return 5 * (level + 1);
  if (level <= 39) return 10 * level - 140;
  if (level <= 59) return 20 * level - 530;
  if (level <= 69) return 30 * level - 1120;
  if (level <= 79) return 40 * level - 1810;
  if (level <= 119) return 50 * level - 2600;
  if (level <= 159) return 50 * level - 2600;
  return 100 * level - 10600;
}

const HERO_RED_MILESTONES = Object.freeze({
  101: { mastery: 10, mithril: 0, mythic: 0, bonus: 0 },
  120: { mastery: 11, mithril: 10, mythic: 3, bonus: 20 },
  140: { mastery: 12, mithril: 20, mythic: 5, bonus: 7.5 },
  160: { mastery: 13, mithril: 30, mythic: 5, bonus: 30 },
  180: { mastery: 14, mithril: 40, mythic: 10, bonus: 15 },
  200: { mastery: 15, mithril: 50, mythic: 10, bonus: 50 },
});

function allocateHeroRedProgress(rows, levels, masteries, resources, inventory) {
  const remaining = { ...resources };
  const red = Object.fromEntries(
    rows.map((row) => [
      row.id || row.label,
      String(row.tier).toLowerCase().startsWith("red") ||
        Number(row.ascension) > 0,
    ]),
  );
  const actions = [];
  while (true) {
    const candidates = rows
      .filter((row) => {
        const id = row.id || row.label;
        return row.include !== false && levels[id] >= 100 && levels[id] < 200;
      })
      .map((row) => {
        const id = row.id || row.label;
        const level = levels[id] + 1;
        const milestone = HERO_RED_MILESTONES[level];
        const ascensionMythic = red[id] ? 0 : 2;
        const mythic = ascensionMythic + (milestone?.mythic || 0);
        const mithril = milestone?.mithril || 0;
        const xpCost = heroXpLevelCost(level);
        const stat = HERO_SLOT_STAT[row.label.split(" ").at(-1)] || "Health";
        const troop = row.troop || row.label.split(" ")[0];
        const pieceWeight =
          inventory.gearWeights?.[`${troop}.${stat}`] ??
          (inventory.troopWeights?.[troop] ?? 1) *
            (inventory.statWeights?.[stat] ?? 1);
        const statGain =
          (heroEnhancementValue(row, level) - heroEnhancementValue(row, level - 1)) *
            (1 + 0.1 * (Number(masteries[id]) || 0)) +
          (milestone?.bonus || 0);
        const eventPoints = mithril * 40000;
        return {
          ...row,
          id,
          stat,
          troop,
          level,
          xp: xpCost,
          mythic,
          mithril,
          ascension: ascensionMythic > 0,
          milestone: milestone || null,
          statGain,
          eventPoints,
          eventPointsProvenance: "verified",
          score:
            ((inventory.optimizationGoal === "events" ? eventPoints : statGain * pieceWeight)) /
            bottleneckCost(
              { xp: xpCost, mythicPieces: mythic, mithril },
              remaining,
            ),
        };
      })
      .filter(
        (item) =>
          (!item.milestone || masteries[item.id] >= item.milestone.mastery) &&
          item.xp <= remaining.xp &&
          item.mythic <= remaining.mythicPieces &&
          item.mithril <= remaining.mithril,
      )
      .sort(
        (a, b) =>
          b.score - a.score ||
          heroSlotPriority(a.label) - heroSlotPriority(b.label),
      );
    const selected = candidates[0];
    if (!selected) break;
    remaining.xp -= selected.xp;
    remaining.mythicPieces -= selected.mythic;
    remaining.mithril -= selected.mithril;
    levels[selected.id] = selected.level;
    red[selected.id] = true;
    actions.push(selected);
  }
  return { remaining, actions };
}

function allocateHeroMastery(rows, levels, initialMasteries, inventory) {
  const masteries = { ...initialMasteries };
  let remainingForgehammers = Math.max(0, Number(inventory.forgehammers) || 0);
  let remainingMythicPieces = Math.max(0, Number(inventory.mythicPieces) || 0);
  const actions = [];
  while (true) {
    const candidates = rows
      .filter((row) => {
        const id = row.id || row.label;
        // Mastery is independent of Enhancement level. Red milestone gates
        // are enforced by the Red progression allocator instead.
        return row.include !== false && masteries[id] < 20;
      })
      .map((row) => {
        const id = row.id || row.label;
        const mastery = masteries[id] + 1;
        const forgehammers = mastery * 10;
        const mythic = HERO_MASTERY_COSTS[mastery - 1]?.mythicPieces || 0;
        const stat = HERO_SLOT_STAT[row.label.split(" ").at(-1)] || "Health";
        const troop = row.troop || row.label.split(" ")[0];
        const pieceWeight =
          inventory.gearWeights?.[`${troop}.${stat}`] ??
          (inventory.troopWeights?.[troop] ?? 1) *
            (inventory.statWeights?.[stat] ?? 1);
        const statGain = heroEnhancementValue(row, levels[id]) * 0.1;
        const eventPoints = forgehammers * 4000;
        return {
          ...row,
          id,
          stat,
          troop,
          mastery,
          forgehammers,
          mythic,
          statGain,
          eventPoints,
          eventPointsProvenance: "verified",
          score:
            ((inventory.optimizationGoal === "events" ? eventPoints : statGain * pieceWeight)) /
            bottleneckCost(
              { forgehammers, mythicPieces: mythic },
              {
                forgehammers: remainingForgehammers,
                mythicPieces: remainingMythicPieces,
              },
            ),
        };
      })
      .sort((a, b) => b.score - a.score);
    const selected = candidates.find(
      (item) =>
        item.forgehammers <= remainingForgehammers &&
        item.mythic <= remainingMythicPieces,
    );
    if (!selected) break;
    remainingForgehammers -= selected.forgehammers;
    remainingMythicPieces -= selected.mythic;
    masteries[selected.id] = selected.mastery;
    actions.push(selected);
  }
  return {
    masteries,
    remainingForgehammers,
    remainingMythicPieces,
    actions,
  };
}

function allocateHeroXp(rows, initialLevels, masteries, inventory) {
  const levels = { ...initialLevels };
  let remaining = Math.max(0, Number(inventory.xp) || 0);
  const actions = [];
  while (true) {
    const candidates = rows
      .filter(
        (row) =>
          row.include !== false &&
          levels[row.id || row.label] < Math.min(100, heroGearMaxLevel(row)),
      )
      .map((row) => {
        const id = row.id || row.label;
        const fromLevel = levels[id];
        const level = fromLevel + 1;
        const cost = heroXpLevelCost(level);
        const stat = HERO_SLOT_STAT[row.label.split(" ").at(-1)] || "Health";
        const troop = row.troop || row.label.split(" ")[0];
        const masteryMultiplier = 1 + 0.1 * (Number(masteries[id]) || 0);
        const pieceWeight =
          inventory.gearWeights?.[`${troop}.${stat}`] ??
          (inventory.troopWeights?.[troop] ?? 1) *
            (inventory.statWeights?.[stat] ?? 1);
        return {
          ...row,
          id,
          stat,
          troop,
          fromLevel,
          level,
          xp: cost,
          statGain:
            (heroEnhancementValue(row, level) - heroEnhancementValue(row, fromLevel)) *
            masteryMultiplier,
          eventPoints: 0,
          eventPointsProvenance: "verified",
          score: inventory.optimizationGoal === "events"
            ? 0
            : ((heroEnhancementValue(row, level) - heroEnhancementValue(row, fromLevel)) * masteryMultiplier * pieceWeight) / Math.max(1, cost),
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          heroSlotPriority(a.label) - heroSlotPriority(b.label),
      );
    const selected = candidates.find((item) => item.xp <= remaining);
    if (!selected) break;
    remaining -= selected.xp;
    levels[selected.id] = selected.level;
    actions.push(selected);
  }
  return { levels, remaining, actions };
}

function heroGearMaxLevel(row) {
  const tier = String(row.tier).toLowerCase();
  if (tier.startsWith("epic")) return 80;
  return tier.startsWith("red") ? 200 : 100;
}

function heroGearMinLevel(row) {
  return String(row.tier).toLowerCase().startsWith("red") ? 100 : 0;
}

// Percentage-point value before Mastery. Source formulas use decimals
// (0.15 = 15%); planner results use percentage points.
function heroEnhancementValue(row, level) {
  const tier = String(row.tier).toLowerCase();
  if (tier.startsWith("epic")) return 9 + Math.min(80, level) * 0.21;
  if (tier.startsWith("red")) return 50 + (Math.max(100, level) - 100) * 0.5;
  return 15 + Math.min(100, level) * 0.35;
}

function heroSlotPriority(label) {
  const parts = String(label).split(" ");
  const slot = parts.at(-1);
  const order =
    parts[0] === "Infantry"
      ? ["Helmet", "Helm", "Gloves", "Chest", "Boots"]
      : ["Helmet", "Helm", "Chest", "Gloves", "Boots"];
  return order.indexOf(slot);
}

export function calculateGovernorGearPlan(rows, inventory) {
  rows = rows.filter((row) => !row.locked);
  if (inventory.mode === "inventory") {
    return optimizeGovernorGear(rows, inventory);
  }
  const totals = {
    satin: 0,
    threads: 0,
    visions: 0,
    statGain: 0,
    powerGain: 0,
  };
  const steps = [];
  for (const row of rows) {
    const current = Math.max(
      -1,
      GOVERNOR_GEAR_LEVELS.findIndex((item) => item.tier === row.tier),
    );
    const target = GOVERNOR_GEAR_LEVELS.findIndex(
      (item) => item.tier === row.targetTier,
    );
    if (target < 0 || target <= current) continue;
    for (let index = current + 1; index <= target; index += 1) {
      const item = GOVERNOR_GEAR_LEVELS[index];
      totals.satin += item.satin;
      totals.threads += item.threads;
      totals.visions += item.visions;
      totals.statGain += item.statGain;
      steps.push({ piece: row.label, ...item });
    }
    totals.powerGain +=
      GOVERNOR_GEAR_LEVELS[target].power -
      (current >= 0 ? GOVERNOR_GEAR_LEVELS[current].power : 0);
  }
  return {
    steps,
    totals,
    shortfall: {
      satin: Math.max(0, totals.satin - (inventory.satin || 0)),
      threads: Math.max(0, totals.threads - (inventory.threads || 0)),
      visions: Math.max(0, totals.visions - (inventory.visions || 0)),
    },
  };
}

function optimizeGovernorGear(rows, inventory) {
  const remaining = {
    satin: Math.max(0, Number(inventory.satin) || 0),
    threads: Math.max(0, Number(inventory.threads) || 0),
    visions: Math.max(0, Number(inventory.visions) || 0),
  };
  const indexes = Object.fromEntries(
    rows.map((row) => [
      row.id,
      Math.max(
        -1,
        GOVERNOR_GEAR_LEVELS.findIndex((item) => item.tier === row.tier),
      ),
    ]),
  );
  const profile = amplifyTroopWeights(
    inventory.troopWeights || {},
    Number(inventory.amplification) || 1,
  );
  const steps = [];
  let blocked = [];
  while (true) {
    const buildingFoundation = Object.values(indexes).some(
      (index) => index < 2,
    );
    blocked = rows
      .map((row) => {
        const item = GOVERNOR_GEAR_LEVELS[indexes[row.id] + 1];
        if (!item) return null;
        const troop = row.troop || String(row.label).split(" ")[0];
        const eventPoints = GOVERNOR_GEAR_KVK_POINTS[item.tier] || 0;
        const previousPower = indexes[row.id] >= 0 ? GOVERNOR_GEAR_LEVELS[indexes[row.id]].power : 0;
        const beforeDefense = unlockedGovernorSetBonus(indexes, 3);
        const beforeAttack = unlockedGovernorSetBonus(indexes, 6);
        const trialIndexes = { ...indexes, [row.id]: indexes[row.id] + 1 };
        const defenseBonusGain = Math.max(0, unlockedGovernorSetBonus(trialIndexes, 3) - beforeDefense);
        const attackBonusGain = Math.max(0, unlockedGovernorSetBonus(trialIndexes, 6) - beforeAttack);
        const setBonusGain = defenseBonusGain + attackBonusGain;
        const value =
          inventory.optimizationGoal === "events" ? eventPoints : item.statGain + setBonusGain;
        return {
          piece: row.label,
          id: row.id,
          troop,
          ...item,
          powerGain: item.power - previousPower,
          eventPoints,
          eventPointsProvenance: governorKvkProvenance(item.tier),
          defenseBonusGain,
          attackBonusGain,
          setBonusGain,
          balancePriority:
            (buildingFoundation &&
              indexes[row.id] === Math.min(...Object.values(indexes))) ||
            indexes[row.id] + 1 < (Number(inventory.balance) || 0)
              ? 1
              : 0,
          score:
            (value * balancedTroopWeight(profile, troop)) /
            bottleneckCost(
              {
                satin: item.satin,
                threads: item.threads,
                visions: item.visions,
              },
              remaining,
            ),
        };
      })
      .filter(Boolean)
      .sort(
        (a, b) =>
          b.balancePriority - a.balancePriority ||
          b.score - a.score ||
          String(a.id).localeCompare(String(b.id)),
      );
    const selected = blocked.find(
      (item) =>
        item.satin <= remaining.satin &&
        item.threads <= remaining.threads &&
        item.visions <= remaining.visions,
    );
    if (!selected) break;
    remaining.satin -= selected.satin;
    remaining.threads -= selected.threads;
    remaining.visions -= selected.visions;
    indexes[selected.id] += 1;
    steps.push(selected);
  }
  const totals = steps.reduce(
    (sum, item) => ({
      satin: sum.satin + item.satin,
      threads: sum.threads + item.threads,
      visions: sum.visions + item.visions,
      statGain: sum.statGain + item.statGain,
      powerGain: sum.powerGain + item.powerGain,
      eventPoints: sum.eventPoints + item.eventPoints,
    }),
    { satin: 0, threads: 0, visions: 0, statGain: 0, powerGain: 0, eventPoints: 0 },
  );
  return {
    steps,
    totals,
    remaining,
    shortfall: { satin: 0, threads: 0, visions: 0 },
    next: blocked[0] || null,
    nearMisses: blocked.slice(0, 3),
  };
}

// A set bonus is unlocked by the third-highest (Defense) or sixth-highest
// (Attack) piece. This naturally preserves a previously unlocked bonus while
// one/two or four/five pieces move ahead, and only advances the bonus when the
// matching threshold is reached again.
function unlockedGovernorSetBonus(indexes, pieceCount) {
  const ordered = Object.values(indexes).sort((a, b) => b - a);
  const threshold = ordered[pieceCount - 1] ?? -1;
  return threshold >= 0 ? GOVERNOR_GEAR_LEVELS[threshold]?.setBonus || 0 : 0;
}

export function calculateMasterPlan(input) {
  const current = Number(input.relationshipProgress) || 0;
  const master = MASTER_DATA[input.master] || MASTER_DATA.Valora;
  const targetLevel = input.locked ? current : Math.max(
    current,
    Math.min(
      100,
      Number(input.targetRelationship) ||
        master.rows.find((row) => row.level > current)?.level ||
        100,
    ),
  );
  const needed = master.rows.filter(
    (row) => row.level > current && row.level <= targetLevel,
  );
  const target = needed.at(-1) || master.rows.at(-1);
  const affinity = needed.reduce((sum, row) => sum + row.affinity, 0),
    emblems = needed.reduce((sum, row) => sum + row.emblems, 0);
  const skillRoadmap = (input.skills || []).flatMap((skill, index) => {
    const name = master.skills[index] || skill.name;
    const currentLevel = Math.max(0, Number(skill.level) || 0);
    const max = Math.max(currentLevel, Number(skill.targetLevel) || 0);
    if (max <= currentLevel) return [];
    const curve = MASTER_SKILL_COSTS[max > 10 ? 20 : max > 5 ? 10 : 5];
    const levels = curve.slice(currentLevel, max);
    return [{
      name,
      from: currentLevel,
      to: max,
      xp: Math.max(
        0,
        levels.reduce((s, x) => s + x[0], 0) - (skill.partialXp || 0),
      ),
      manuscripts: levels.reduce((s, x) => s + x[1], 0),
    }];
  });
  const xp = skillRoadmap.reduce((s, x) => s + x.xp, 0),
    manuscripts = skillRoadmap.reduce((s, x) => s + x.manuscripts, 0);
  return {
    master: input.master || "Valora",
    title: master.title,
    label: master.label,
    target,
    affinity,
    emblems,
    xp,
    manuscripts,
    skillRoadmap,
    shortfall: {
      affinity: Math.max(0, affinity - (input.affinity || 0)),
      emblems: Math.max(0, emblems - (input.emblems || 0)),
      manuscripts: Math.max(0, manuscripts - (input.manuscripts || 0)),
    },
  };
}

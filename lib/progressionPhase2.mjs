import {
  ADVANCED_CHEST_CONTENTS,
  CHARM_LEVELS,
  GOVERNOR_GEAR_LEVELS,
  HERO_MASTERY_COSTS,
  HERO_SLOT_STAT,
  HERO_XP_MILESTONES,
  MASTER_DATA,
  MASTER_SKILL_COSTS,
  PET_ADVANCEMENT,
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
    if (day > 1 && (startWeekday + day - 1) % 7 === 0) attempt = 1;
    const completed =
      day === 1 ? Math.max(0, Math.trunc(input.completedToday || 0)) : 0;
    let runs = 0,
      spent = 0,
      min = 0,
      expected = 0,
      max = 0;
    for (let dailyRun = completed; dailyRun < perDay; dailyRun += 1) {
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
  const rows = [];
  for (let level = 1; level < pet.maxLevel; level += 1) {
    const next = level + 1;
    let base;
    if (next <= 9) base = 500 + (next - 2) * 50;
    else if (next === 10) base = 925;
    else if (next <= 19) base = 1000 + (next - 11) * 75;
    else if (next === 20) base = 1700;
    else if (next <= 29) base = 1800 + (next - 21) * 100;
    else if (next === 30) base = 2750;
    else if (next <= 39) base = 2900 + (next - 31) * 150;
    else if (next === 40) base = 4300;
    else if (next <= 49) base = 4500 + (next - 41) * 200;
    else if (next === 50) base = 6350;
    else if (next <= 59) base = 6600 + (next - 51) * 250;
    else if (next === 60) base = 8900;
    else if (next <= 69) base = 9200 + (next - 61) * 300;
    else if (next === 70) base = 11900;
    else if (next <= 79) base = 12200 + (next - 71) * 300;
    else if (next === 80) base = 15000;
    else if (next <= 89) base = 15400 + (next - 81) * 400;
    else if (next === 90) base = 19000;
    else if (next <= 99) base = 19400 + (next - 91) * 400;
    else base = 23100;
    const advancement = PET_ADVANCEMENT[pet.maxLevel]?.[next] || [0, 0, 0];
    rows.push({
      pet: pet.name,
      generation: pet.generation,
      fromLevel: level,
      toLevel: next,
      food: Math.round(base * pet.costScale),
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
  const selected = rows.filter(
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
    Math.max(charm.current, Number(charm.target ?? 22) || 0);
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
        const value = weights.mode === "events" ? stats.power : statValue;
        return {
          ...charm,
          level,
          guides: cost[0],
          designs: cost[1],
          health: stats.health,
          lethality: stats.lethality,
          power: stats.power,
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
        guides: sum.guides + item.guides,
        designs: sum.designs + item.designs,
        weightedValue: sum.weightedValue + item.score,
      }),
      {
        health: 0,
        lethality: 0,
        power: 0,
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
  const values = Object.values(profile).map(Number);
  const average =
    values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
  const normalized = (profile[troop] ?? average ?? 1) / (average || 1);
  return 1 + (normalized - 1) * 0.25;
}

export function calculateHeroGearPlan(rows, inventory) {
  const levels = Object.fromEntries(
    rows.map((row) => [
      row.id || row.label,
      Math.max(0, Math.min(100, Number(row.enhancement) || 0)),
    ]),
  );
  let xp = Math.max(0, Number(inventory.xp) || 0);
  let forgehammers = Math.max(0, Number(inventory.forgehammers) || 0);
  let mythicPieces = Math.max(0, Number(inventory.mythicPieces) || 0);
  const actions = [];
  while (true) {
    const candidates = rows
      .filter(
        (row) => row.include !== false && levels[row.id || row.label] < 100,
      )
      .map((row) => {
        const id = row.id || row.label;
        const fromLevel = levels[id];
        const level = fromLevel + 1;
        const cost = heroXpLevelCost(level);
        const stat = HERO_SLOT_STAT[row.label.split(" ").at(-1)] || "Health";
        const troop = row.troop || row.label.split(" ")[0];
        const masteryMultiplier = 1 + 0.1 * (Number(row.mastery) || 0);
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
          statGain: 0.35 * masteryMultiplier,
          score: (0.35 * masteryMultiplier * pieceWeight) / cost,
        };
      })
      .sort(
        (a, b) =>
          b.score - a.score ||
          heroSlotPriority(a.label) - heroSlotPriority(b.label),
      );
    const selected = candidates.find((item) => item.xp <= xp);
    if (!selected) break;
    xp -= selected.xp;
    levels[selected.id] = selected.level;
    actions.push(selected);
  }
  const masteries = Object.fromEntries(
    rows.map((row) => [
      row.id || row.label,
      Math.max(0, Math.min(20, Number(row.mastery) || 0)),
    ]),
  );
  const masteryActions = [];
  while (true) {
    const masteryCandidates = rows
      .filter((row) => {
        const id = row.id || row.label;
        return row.include !== false && levels[id] >= 20 && masteries[id] < 20;
      })
      .map((row) => {
        const id = row.id || row.label;
        const mastery = masteries[id] + 1;
        const hammers = mastery * 10;
        const mythic = Math.max(0, mastery - 10);
        const stat = HERO_SLOT_STAT[row.label.split(" ").at(-1)] || "Health";
        const troop = row.troop || row.label.split(" ")[0];
        const pieceWeight =
          inventory.gearWeights?.[`${troop}.${stat}`] ??
          (inventory.troopWeights?.[troop] ?? 1) *
            (inventory.statWeights?.[stat] ?? 1);
        const statGain = (15 + levels[id] * 0.35) * 0.1;
        return {
          ...row,
          id,
          stat,
          troop,
          mastery,
          forgehammers: hammers,
          mythic,
          statGain,
          score:
            (statGain * pieceWeight) /
            bottleneckCost(
              { forgehammers: hammers, mythicPieces: mythic },
              { forgehammers, mythicPieces },
            ),
        };
      })
      .sort((a, b) => b.score - a.score);
    const selected = masteryCandidates.find(
      (item) =>
        item.forgehammers <= forgehammers && item.mythic <= mythicPieces,
    );
    if (!selected) break;
    forgehammers -= selected.forgehammers;
    mythicPieces -= selected.mythic;
    masteries[selected.id] = selected.mastery;
    masteryActions.push(selected);
  }
  const candidates = rows.map((row) => {
    const id = row.id || row.label;
    const rowActions = actions.filter((item) => item.id === id);
    const stat = HERO_SLOT_STAT[row.label.split(" ").at(-1)] || "Health";
    const targetLevel = levels[id];
    return {
      ...row,
      id,
      stat,
      targetLevel,
      targetMastery: masteries[id],
      xp: rowActions.reduce((sum, item) => sum + item.xp, 0),
      statGain:
        rowActions.reduce((sum, item) => sum + item.statGain, 0) +
        masteryActions
          .filter((item) => item.id === id)
          .reduce((sum, item) => sum + item.statGain, 0),
      mithril: 0,
      mythic: masteryActions
        .filter((item) => item.id === id)
        .reduce((sum, item) => sum + item.mythic, 0),
      forgehammers: masteryActions
        .filter((item) => item.id === id)
        .reduce((sum, item) => sum + item.forgehammers, 0),
    };
  });
  const firstAction = actions[0] || null;
  const first = firstAction
    ? candidates.find((item) => item.id === firstAction.id) || null
    : null;
  const used = {
    xp: Math.max(0, Number(inventory.xp) || 0) - xp,
    mithril: 0,
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
  return {
    recommendation: first,
    candidates,
    used,
    remaining,
    actions: [...actions, ...masteryActions],
    bottleneck:
      xp === 0 && candidates.some((item) => item.targetLevel < 100)
        ? "xp"
        : masteryActions.length
          ? "forgehammers"
          : null,
    nearMisses: candidates
      .filter((item) => item.targetLevel < 100)
      .sort(
        (a, b) =>
          heroXpLevelCost(a.targetLevel + 1) -
          heroXpLevelCost(b.targetLevel + 1),
      )
      .slice(0, 3),
    reforging: {
      xpRecovery: first?.tier?.toLowerCase() === "red" ? 0 : 1,
      forgehammerRecovery: 0.5,
    },
  };
}

export function heroXpLevelCost(level) {
  return level > 0 && level <= 100 ? 5 * (level + 1) : 0;
}

function heroSlotPriority(label) {
  const slot = String(label).split(" ").at(-1);
  return ["Helmet", "Helm", "Chest", "Gloves", "Boots"].indexOf(slot);
}

export function calculateGovernorGearPlan(rows, inventory) {
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
        const value =
          inventory.optimizationGoal === "events" ? item.power : item.statGain;
        return {
          piece: row.label,
          id: row.id,
          troop,
          ...item,
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
      powerGain: sum.powerGain + item.power,
    }),
    { satin: 0, threads: 0, visions: 0, statGain: 0, powerGain: 0 },
  );
  return {
    steps,
    totals,
    remaining,
    shortfall: { satin: 0, threads: 0, visions: 0 },
    next: blocked[0] || null,
  };
}

export function calculateMasterPlan(input) {
  const current = Number(input.relationshipProgress) || 0;
  const master = MASTER_DATA[input.master] || MASTER_DATA.Valora;
  const targetLevel = Math.max(
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
  const skillRoadmap = (input.skills || []).map((skill, index) => {
    const name = master.skills[index] || skill.name;
    const max = skill.targetLevel || skill.level || 1;
    const curve = MASTER_SKILL_COSTS[max > 10 ? 20 : max > 5 ? 10 : 5];
    const levels = curve.slice(Math.max(0, skill.level), max);
    return {
      name,
      from: skill.level,
      to: max,
      xp: Math.max(
        0,
        levels.reduce((s, x) => s + x[0], 0) - (skill.partialXp || 0),
      ),
      manuscripts: levels.reduce((s, x) => s + x[1], 0),
    };
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

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
  const candidates = [];
  for (const charm of charms) {
    for (let level = charm.current + 1; level <= charm.target; level += 1) {
      const cost = costs[level];
      if (!cost) continue;
      const stats = CHARM_LEVELS[level];
      candidates.push({
        ...charm,
        level,
        guides: cost[0],
        designs: cost[1],
        health: stats?.health || 0,
        lethality: stats?.lethality || 0,
        power: stats?.power || 0,
        balancePriority:
          charm.current < (Number(focus.minimumBalance) || 0) ? 1 : 0,
        score:
          ((weights.troops?.[charm.type] || 0) *
            ((stats?.health || 0) * (weights.stats?.Health || 1) +
              (stats?.lethality || 0) * (weights.stats?.Lethality || 1))) /
          Math.max(1, cost[0] + cost[1]),
      });
    }
  }
  candidates.sort(
    (a, b) =>
      b.balancePriority - a.balancePriority ||
      b.score - a.score ||
      a.guides + a.designs - b.guides - b.designs ||
      a.id.localeCompare(b.id) ||
      a.level - b.level,
  );
  const upgrades = [],
    achieved = {};
  let moved = true;
  while (moved) {
    moved = false;
    for (let index = 0; index < candidates.length; index += 1) {
      const item = candidates[index];
      if (
        item.level !== (achieved[item.id] ?? item.current) + 1 ||
        item.guides > guides ||
        item.designs > designs
      )
        continue;
      guides -= item.guides;
      designs -= item.designs;
      achieved[item.id] = item.level;
      upgrades.push(item);
      candidates.splice(index, 1);
      moved = true;
      break;
    }
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
    next:
      candidates.find(
        (item) => item.level === (achieved[item.id] ?? item.current) + 1,
      ) || null,
    nearMisses: candidates
      .filter((item) => item.level === (achieved[item.id] ?? item.current) + 1)
      .slice(0, 3),
  };
}

export function calculateHeroGearPlan(rows, inventory) {
  const candidates = rows
    .map((row) => {
      const level = Math.max(0, Math.min(99, Number(row.enhancement) || 0));
      const milestone =
        HERO_XP_MILESTONES.find((item) => item.level > level) ||
        HERO_XP_MILESTONES.at(-1);
      const masteryTarget = Math.min(
        20,
        Math.max(
          Number(row.mastery) || 0,
          Number(row.targetMastery) || Number(row.mastery) || 0,
        ),
      );
      const masterySteps = HERO_MASTERY_COSTS.filter(
        (item) =>
          item.level > (Number(row.mastery) || 0) &&
          item.level <= masteryTarget,
      );
      return {
        ...row,
        stat: HERO_SLOT_STAT[row.label.split(" ").at(-1)] || "Health",
        targetLevel: milestone.level,
        xp: milestone.xp,
        mithril: milestone.mithril,
        mythic:
          milestone.mythic +
          masterySteps.reduce((s, x) => s + x.mythicPieces, 0),
        forgehammers: masterySteps.reduce((s, x) => s + x.forgehammers, 0),
      };
    })
    .sort(
      (a, b) => a.enhancement - b.enhancement || a.label.localeCompare(b.label),
    );
  const first =
    candidates.find(
      (row) =>
        row.xp <= (inventory.xp || 0) &&
        row.mithril <= (inventory.mithril || 0) &&
        row.mythic <= (inventory.mythicPieces || 0) &&
        row.forgehammers <= (inventory.forgehammers || 0),
    ) || candidates[0];
  const used = first
    ? {
        xp: first.xp,
        mithril: first.mithril,
        mythicPieces: first.mythic,
        forgehammers: first.forgehammers,
      }
    : {};
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
    bottleneck: first
      ? Object.entries({
          xp: first.xp - (inventory.xp || 0),
          mithril: first.mithril - (inventory.mithril || 0),
          mythicPieces: first.mythic - (inventory.mythicPieces || 0),
          forgehammers: first.forgehammers - (inventory.forgehammers || 0),
        }).sort((a, b) => b[1] - a[1])[0][0]
      : null,
    nearMisses: candidates.slice(1, 4),
    reforging: {
      xpRecovery: first?.tier?.toLowerCase() === "red" ? 0 : 1,
      forgehammerRecovery: 0.5,
    },
  };
}

export function calculateGovernorGearPlan(rows, inventory) {
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

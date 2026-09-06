import { CHARM_LEVELS, GOVERNOR_GEAR_LEVELS, HERO_SLOT_STAT, HERO_XP_MILESTONES, MASTER_RELATIONSHIPS, PET_ADVANCEMENT, PETS, TTG_TIERS } from "./phase2Data.mjs";

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
  const reserve = Math.max(0, Number(input.reserve) || 0);
  const income = Math.max(0, Number(input.dailyIncome) || 0);
  const target = Math.max(0, Number(input.requiredTempered) || 0);
  const schedule = [];
  for (let day = 1; day <= days; day += 1) {
    tg += income;
    const completed = day === 1 ? Math.max(0, Math.trunc(input.completedToday || 0)) : 0;
    const weeklyAttempt = ((Math.max(1, Math.trunc(input.refinementState || 1)) - 1 + completed + day - 1) % 100) + 1;
    const recipe = recipes.find((item) => weeklyAttempt >= (item.from ?? item.state) && weeklyAttempt <= (item.to ?? item.state)) || recipes[0];
    const baseCost = recipe.cost ?? recipe.inputTrueGold;
    const discountedCost = completed === 0 ? baseCost / 2 : baseCost;
    const affordable = tg - discountedCost >= reserve;
    const runs = affordable ? 1 : 0;
    tg -= runs * discountedCost;
    const rate =
      input.riskMode === "guaranteed"
        ? (recipe.min ?? recipe.outputMin)
        : input.riskMode === "expected"
          ? (recipe.expected ?? recipe.outputExpected)
          : ((recipe.min ?? recipe.outputMin) + (recipe.expected ?? recipe.outputExpected)) / 2;
    ttg += runs * rate;
    schedule.push({
      day,
      runs,
      tier: recipe.tier ?? recipe.state,
      attempt: weeklyAttempt,
      trueGoldSpent: runs * discountedCost,
      temperedProduced: runs * rate,
      trueGoldRemaining: tg,
      temperedTotal: ttg,
    });
  }
  const reached = schedule.find((row) => row.temperedTotal >= target);
  return {
    status: reached ? "achievable" : "shortfall",
    earliestDay: reached?.day || null,
    schedule,
    finalTrueGold: tg,
    finalTempered: ttg,
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
    const advancement = PET_ADVANCEMENT[level] || [0,0,0];
    rows.push({ pet: pet.name, generation: pet.generation, fromLevel: level, toLevel: next, food: Math.round(base * pet.costScale), manuals: Math.round(advancement[0] * pet.costScale), potions: Math.round(advancement[1] * pet.costScale), medallions: Math.round(advancement[2] * pet.costScale) });
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
  return {
    status: selected.length ? "complete" : "missing-range",
    steps: selected,
    totals,
    shortfall,
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
        score: (weights.troops?.[charm.type] || 0) * (((stats?.health || 0) * (weights.stats?.Health || 1)) + ((stats?.lethality || 0) * (weights.stats?.Lethality || 1))) / Math.max(1, cost[0] + cost[1]),
      });
    }
  }
  candidates.sort(
    (a, b) =>
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
    next:
      candidates.find(
        (item) => item.level === (achieved[item.id] ?? item.current) + 1,
      ) || null,
  };
}

export function calculateHeroGearPlan(rows, inventory) {
  const candidates = rows.map((row) => {
    const level = Math.max(0, Math.min(99, Number(row.enhancement) || 0));
    const milestone = HERO_XP_MILESTONES.find((item) => item.level > level) || HERO_XP_MILESTONES.at(-1);
    return { ...row, stat: HERO_SLOT_STAT[row.label.split(" ").at(-1)] || "Health", targetLevel: milestone.level, xp: milestone.xp, mithril: milestone.mithril, mythic: milestone.mythic };
  }).sort((a,b) => a.enhancement - b.enhancement || a.label.localeCompare(b.label));
  const first = candidates.find((row) => row.xp <= (inventory.xp || 0) && row.mithril <= (inventory.mithril || 0) && row.mythic <= (inventory.mythicPieces || 0)) || candidates[0];
  return { recommendation:first, candidates, reforging:{ xpRecovery:first?.tier?.toLowerCase() === "red" ? 0 : 1, forgehammerRecovery:.5 } };
}

export function calculateGovernorGearPlan(rows, inventory) {
  const totals = { satin:0, threads:0, visions:0, statGain:0, powerGain:0 };
  const steps=[];
  for (const row of rows) {
    const current = Math.max(-1, GOVERNOR_GEAR_LEVELS.findIndex((item) => item.tier === row.tier));
    const target = GOVERNOR_GEAR_LEVELS.findIndex((item) => item.tier === row.targetTier);
    if (target < 0 || target <= current) continue;
    for (let index=current+1; index<=target; index+=1) { const item=GOVERNOR_GEAR_LEVELS[index]; totals.satin+=item.satin; totals.threads+=item.threads; totals.visions+=item.visions; totals.statGain+=item.statGain; steps.push({piece:row.label,...item}); }
    totals.powerGain += GOVERNOR_GEAR_LEVELS[target].power - (current >= 0 ? GOVERNOR_GEAR_LEVELS[current].power : 0);
  }
  return { steps, totals, shortfall:{ satin:Math.max(0,totals.satin-(inventory.satin||0)), threads:Math.max(0,totals.threads-(inventory.threads||0)), visions:Math.max(0,totals.visions-(inventory.visions||0)) } };
}

export function calculateMasterPlan(input) {
  const current = Number(input.relationshipProgress)||0;
  const target = MASTER_RELATIONSHIPS.find((row)=>row.level>current) || MASTER_RELATIONSHIPS.at(-1);
  const needed = MASTER_RELATIONSHIPS.filter((row)=>row.level>current && row.level<=target.level);
  const affinity=needed.reduce((sum,row)=>sum+row.affinity,0), emblems=needed.reduce((sum,row)=>sum+row.emblems,0);
  return { target, affinity, emblems, shortfall:{ affinity:Math.max(0,affinity-(input.affinity||0)), emblems:Math.max(0,emblems-(input.emblems||0)) } };
}

/**
 * Hero Gear Planner optimization engine.
 *
 * PROBLEM SHAPE
 * Every (troopType, slot, upgradeType) is an ordered chain of steps that
 * must be taken as a prefix (you can't buy level 5 without 1-4). Choosing
 * how far up a chain to go is a "multiple-choice knapsack" item: each chain
 * offers a menu of mutually exclusive stopping points (including "go no
 * further"), each with a resource cost and a stat gain. Across chains, the
 * shared resource budget makes this a knapsack: pick one option per chain
 * to maximize weighted stat gain without exceeding the budget.
 *
 * WHY THIS DOESN'T NEED A 4-DIMENSIONAL DP
 * The naive framing has 4 resource dimensions (xp, forgehammers, mythicGear,
 * mithril), and a DP over 4 continuous dimensions blows up in memory fast.
 * But look at the data schema: Enhancement steps only ever cost `xp`,
 * Mastery steps only ever cost `forgehammers`/`mythicGear`, and Red
 * Imbuement steps only ever cost `mithril`. No step spends across more than
 * one of these three pools, and the objective (weighted stat gain) is
 * additively separable across chains regardless of which pool they draw
 * from. That means the 4D problem is exactly equivalent to THREE
 * INDEPENDENT knapsacks solved separately and summed:
 *   - Enhancement: a 1D knapsack over `xp`
 *   - Mastery: a 2D knapsack over (`forgehammers`, `mythicGear`)
 *   - Red Imbuement: a 1D knapsack over `mithril`
 * This isn't an approximation - it's the same optimum the full 4D DP would
 * find, because there is no step that trades one pool for another to reach
 * a shared constraint. If the real data ever adds a step with mixed costs,
 * this decomposition would need revisiting.
 *
 * Even so, DP over a continuous resource axis needs discretization. xp and
 * mithril are bucketed to a fixed resolution (rounding cost UP to the next
 * bucket, so a chosen plan never reports spending more than the real
 * resource pool allows); forgehammers/mythicGear are small integers in
 * practice and could in principle be enumerated directly, but are bucketed
 * the same way here for a uniform implementation and a bounded 2D table
 * size regardless of how large a user's numbers get.
 */

import {
  getTroopTypes,
  getGearSlots,
  getSlotConfig,
  getEnhancementChain,
  getMasteryChain,
  getRedImbuementChain,
  getBuildProfiles,
  getReforgeConfig,
} from './data.js';

const DEFAULT_TIME_BUDGET_MS = 8000;
const XP_BUCKETS = 800;
const MITHRIL_BUCKETS = 800;
const FORGEHAMMER_BUCKETS = 80;
const MYTHIC_GEAR_BUCKETS = 80;
const NEAR_MISS_BUDGET_MULTIPLIER = 1.1;

class OptimizationTimeout extends Error {}

function checkDeadline(deadline, opCount) {
  if (deadline && (opCount & 0x3ff) === 0 && Date.now() > deadline) throw new OptimizationTimeout();
}

export function weightKey(troopType, statType) {
  return `${troopType}${statType.charAt(0).toUpperCase()}${statType.slice(1)}`;
}

function resolveWeights(buildProfileId, customWeights) {
  if (buildProfileId === 'custom') return customWeights || {};
  const profiles = getBuildProfiles();
  return profiles[buildProfileId]?.weights || profiles.unweighted.weights;
}

function unweightedWeights() {
  return getBuildProfiles().unweighted.weights;
}

/**
 * Turns one chain's ordered steps into a menu of "target level" options
 * relative to the slot's CURRENT level - the resource cost and stat gain of
 * every option are deltas from where the user already is, not from zero,
 * since levels already reached don't need to be paid for again.
 *
 * @param {Array} chain - ordered steps (level, cost, cumulativeStatBonus, ...)
 * @param {number} currentLevel
 * @param {{tcCap: number|null, milestoneKey: string|null, costFields: string[]}} opts
 * @returns {{targetLevel: number, deltaCost: Record<string, number>, deltaGain: number}[]}
 *   Always includes a "stay at currentLevel" option (zero cost, zero gain)
 *   first, so a chain can always be legally skipped by the knapsack.
 */
/**
 * Cumulative (cost, stat) totals through `level` steps of a chain, ignoring
 * milestone eligibility entirely - used where we need "what has actually
 * been spent/gained so far" (recoverable XP, Current Stat % display), never
 * "what's a legal place to stop going forward" (that's buildLevelOptions).
 */
function cumulativeAtLevel(chain, level, costFields) {
  const zeroCost = Object.fromEntries(costFields.map((key) => [key, 0]));
  let cost = zeroCost;
  let gain = 0;
  const clamped = Math.min(Math.max(Math.floor(level) || 0, 0), chain.length);
  for (let i = 0; i < clamped; i += 1) {
    const step = chain[i];
    cost = Object.fromEntries(costFields.map((key) => [key, cost[key] + Number(step.cost?.[key] || 0)]));
    gain = step.cumulativeStatBonus;
  }
  return { cost, gain };
}

function buildLevelOptions(chain, currentLevel, { tcCap = null, milestoneKey = null, costFields }) {
  const zeroCost = Object.fromEntries(costFields.map((key) => [key, 0]));
  const cumulativeCost = [zeroCost];
  const cumulativeGain = [0];
  let eligibleLength = 0;

  for (const step of chain) {
    if (tcCap != null && Number.isFinite(step.requiredTownCenterLevel) && step.requiredTownCenterLevel > tcCap) break;
    const previous = cumulativeCost[cumulativeCost.length - 1];
    const next = Object.fromEntries(costFields.map((key) => [key, previous[key] + Number(step.cost?.[key] || 0)]));
    cumulativeCost.push(next);
    cumulativeGain.push(step.cumulativeStatBonus);
    eligibleLength += 1;
  }

  const clampedCurrent = Math.min(Math.max(Math.floor(currentLevel) || 0, 0), eligibleLength);
  const baseCost = cumulativeCost[clampedCurrent];
  const baseGain = cumulativeGain[clampedCurrent];
  const options = [{ targetLevel: clampedCurrent, deltaCost: zeroCost, deltaGain: 0 }];

  for (let level = clampedCurrent + 1; level <= eligibleLength; level += 1) {
    const step = chain[level - 1];
    if (milestoneKey && !step.milestoneFlags?.[milestoneKey]) continue;
    const deltaCost = Object.fromEntries(costFields.map((key) => [key, cumulativeCost[level][key] - baseCost[key]]));
    options.push({ targetLevel: level, deltaCost, deltaGain: cumulativeGain[level] - baseGain });
  }
  return options;
}

/**
 * Pre-solve step for "Include XP reforge": treats a fraction of the XP
 * already sunk into each included slot's CURRENT Enhancement level as a
 * pool of extra, zero-marginal-cost XP the solver can spend anywhere.
 *
 * Simplification, called out per the spec: this does NOT actually reset any
 * slot's current level (that would require modeling reforge as a per-slot
 * "reset and recover" choice inside the knapsack itself, which the request
 * describes as a flat pool add, not a per-slot decision). The recovery rate
 * is a placeholder in /data/hero-gear/reforge-config.json pending real
 * numbers.
 */
function computeRecoverableXp(gear) {
  const { recoveryRate } = getReforgeConfig();
  let total = 0;
  for (const troopType of getTroopTypes()) {
    const troopState = gear[troopType];
    if (!troopState?.included) continue;
    for (const slot of getGearSlots()) {
      const slotState = troopState.slots?.[slot];
      if (!slotState) continue;
      const chain = getEnhancementChain(troopType, slot);
      const { cost } = cumulativeAtLevel(chain, slotState.currentEnhancementLevel || 0, ['xp']);
      total += cost.xp * recoveryRate;
    }
  }
  return total;
}

/**
 * 1D multiple-choice knapsack via bucketed DP. `groups` is a list of
 * mutually-exclusive option menus (one per chain); exactly one option per
 * group is chosen (the zero-cost "stay" option always makes skipping a
 * chain free). Resource cost is rounded UP to the enclosing bucket so a
 * selected plan never reports spending more than the real budget allows -
 * the cost of that safety margin is that a plan may look up to one
 * bucket-width more conservative than the true optimum.
 */
function solveKnapsack1D(groups, budget, buckets, deadline) {
  const safeBudget = Math.max(0, budget);
  const bucketSize = safeBudget > 0 ? safeBudget / buckets : 0;
  const bucketCost = (amount) => {
    if (amount <= 0) return 0;
    if (bucketSize <= 0) return buckets + 1;
    return Math.min(buckets + 1, Math.ceil(amount / bucketSize));
  };

  let dp = new Array(buckets + 1).fill(0);
  const choiceTables = [];
  const usedTables = [];
  let opCount = 0;

  for (const group of groups) {
    const nextDp = new Array(buckets + 1).fill(-Infinity);
    const choiceAt = new Array(buckets + 1).fill(0);
    const usedAt = new Array(buckets + 1).fill(0);
    for (let c = 0; c <= buckets; c += 1) {
      checkDeadline(deadline, ++opCount);
      for (let oi = 0; oi < group.options.length; oi += 1) {
        const bc = bucketCost(group.options[oi].costScalar);
        if (bc > c) continue;
        const candidate = dp[c - bc] + group.options[oi].value;
        if (candidate > nextDp[c]) {
          nextDp[c] = candidate;
          choiceAt[c] = oi;
          usedAt[c] = bc;
        }
      }
      if (c > 0 && nextDp[c] < nextDp[c - 1]) {
        nextDp[c] = nextDp[c - 1];
        choiceAt[c] = choiceAt[c - 1];
        usedAt[c] = usedAt[c - 1];
      }
    }
    dp = nextDp;
    choiceTables.push(choiceAt);
    usedTables.push(usedAt);
  }

  let capacity = buckets;
  const picks = new Array(groups.length);
  for (let g = groups.length - 1; g >= 0; g -= 1) {
    const oi = choiceTables[g][capacity];
    picks[g] = oi;
    capacity = Math.max(0, capacity - usedTables[g][capacity]);
  }
  return { score: dp[buckets], picks };
}

/**
 * 2D multiple-choice knapsack (Mastery: forgehammers x mythicGear), same
 * bucketed-DP shape as the 1D solver but over a flattened 2D table. Table
 * size is bounded by FORGEHAMMER_BUCKETS x MYTHIC_GEAR_BUCKETS regardless
 * of the user's actual numbers, which is the memory/precision tradeoff the
 * bucket counts at the top of this file are tuning.
 */
function solveKnapsack2D(groups, budgetA, budgetB, bucketsA, bucketsB, deadline) {
  const safeA = Math.max(0, budgetA);
  const safeB = Math.max(0, budgetB);
  const sizeA = bucketsA + 1;
  const sizeB = bucketsB + 1;
  const bucketSizeA = safeA > 0 ? safeA / bucketsA : 0;
  const bucketSizeB = safeB > 0 ? safeB / bucketsB : 0;
  const bucketCost = (amount, size, count) => {
    if (amount <= 0) return 0;
    if (size <= 0) return count + 1;
    return Math.min(count + 1, Math.ceil(amount / size));
  };
  const idx = (a, b) => a * sizeB + b;

  let dp = new Array(sizeA * sizeB).fill(0);
  const choiceTables = [];
  const usedATables = [];
  const usedBTables = [];
  let opCount = 0;

  for (const group of groups) {
    const nextDp = new Array(sizeA * sizeB).fill(-Infinity);
    const choiceAt = new Array(sizeA * sizeB).fill(0);
    const usedAAt = new Array(sizeA * sizeB).fill(0);
    const usedBAt = new Array(sizeA * sizeB).fill(0);

    for (let a = 0; a < sizeA; a += 1) {
      for (let b = 0; b < sizeB; b += 1) {
        checkDeadline(deadline, ++opCount);
        const here = idx(a, b);
        for (let oi = 0; oi < group.options.length; oi += 1) {
          const opt = group.options[oi];
          const bcA = bucketCost(opt.costScalarA, bucketSizeA, bucketsA);
          const bcB = bucketCost(opt.costScalarB, bucketSizeB, bucketsB);
          if (bcA > a || bcB > b) continue;
          const candidate = dp[idx(a - bcA, b - bcB)] + opt.value;
          if (candidate > nextDp[here]) {
            nextDp[here] = candidate;
            choiceAt[here] = oi;
            usedAAt[here] = bcA;
            usedBAt[here] = bcB;
          }
        }
        const leftIdx = a > 0 ? idx(a - 1, b) : -1;
        const upIdx = b > 0 ? idx(a, b - 1) : -1;
        const bestNeighbor = Math.max(leftIdx >= 0 ? nextDp[leftIdx] : -Infinity, upIdx >= 0 ? nextDp[upIdx] : -Infinity);
        if (bestNeighbor > nextDp[here]) {
          const from = (leftIdx >= 0 && nextDp[leftIdx] >= (upIdx >= 0 ? nextDp[upIdx] : -Infinity)) ? leftIdx : upIdx;
          nextDp[here] = nextDp[from];
          choiceAt[here] = choiceAt[from];
          usedAAt[here] = usedAAt[from];
          usedBAt[here] = usedBAt[from];
        }
      }
    }
    dp = nextDp;
    choiceTables.push(choiceAt);
    usedATables.push(usedAAt);
    usedBTables.push(usedBAt);
  }

  let a = bucketsA;
  let b = bucketsB;
  const picks = new Array(groups.length);
  for (let g = groups.length - 1; g >= 0; g -= 1) {
    const here = idx(a, b);
    const oi = choiceTables[g][here];
    picks[g] = oi;
    a = Math.max(0, a - usedATables[g][here]);
    b = Math.max(0, b - usedBTables[g][here]);
  }
  return { score: dp[idx(bucketsA, bucketsB)], picks };
}

function buildGroups({ gear, weights, tcCap, redGearStrategyId, chainType }) {
  const groups = [];
  for (const troopType of getTroopTypes()) {
    const troopState = gear[troopType];
    if (!troopState?.included) continue;
    for (const slot of getGearSlots()) {
      const slotConfig = getSlotConfig(troopType, slot);
      const slotState = troopState.slots?.[slot];
      if (!slotConfig || !slotState) continue;
      const weight = weights[weightKey(troopType, slotConfig.statType)] || 0;

      let chain;
      let currentLevel;
      let costFields;
      let milestoneKey = null;
      if (chainType === 'enhancement') {
        chain = getEnhancementChain(troopType, slot);
        currentLevel = slotState.currentEnhancementLevel;
        costFields = ['xp'];
        milestoneKey = redGearStrategyId;
      } else if (chainType === 'mastery') {
        chain = getMasteryChain(troopType, slot);
        currentLevel = slotState.currentMasteryLevel;
        costFields = ['forgehammers', 'mythicGear'];
      } else {
        chain = getRedImbuementChain(troopType, slot);
        currentLevel = slotState.currentRedImbuementLevel;
        costFields = ['mithril'];
      }

      const options = buildLevelOptions(chain, currentLevel, { tcCap, milestoneKey, costFields });
      groups.push({
        troopType,
        slot,
        statType: slotConfig.statType,
        chainType,
        options: options.map((o) => ({
          ...o,
          value: weight * o.deltaGain,
          costScalar: costFields.length === 1 ? o.deltaCost[costFields[0]] : undefined,
          costScalarA: costFields.length === 2 ? o.deltaCost[costFields[0]] : undefined,
          costScalarB: costFields.length === 2 ? o.deltaCost[costFields[1]] : undefined,
        })),
      });
    }
  }
  return groups;
}

function pickSelections(groups, picks) {
  return groups.map((group, i) => ({
    troopType: group.troopType,
    slot: group.slot,
    statType: group.statType,
    chainType: group.chainType,
    ...group.options[picks[i]],
  }));
}

/**
 * Runs all three independent knapsacks (see file header) for one set of
 * resource budgets and returns the flat list of chosen per-chain
 * selections plus the weighted score the solver optimized for.
 */
function solveForBudgets({ gear, weights, tcCap, redGearStrategyId, budgets, deadline }) {
  const enhancementGroups = buildGroups({ gear, weights, tcCap, redGearStrategyId, chainType: 'enhancement' });
  const masteryGroups = buildGroups({ gear, weights, tcCap, redGearStrategyId, chainType: 'mastery' });
  const redGroups = buildGroups({ gear, weights, tcCap, redGearStrategyId, chainType: 'redImbuement' });

  const enhancementResult = solveKnapsack1D(enhancementGroups, budgets.xp, XP_BUCKETS, deadline);
  const masteryResult = solveKnapsack2D(masteryGroups, budgets.forgehammers, budgets.mythicGear, FORGEHAMMER_BUCKETS, MYTHIC_GEAR_BUCKETS, deadline);
  const redResult = solveKnapsack1D(redGroups, budgets.mithril, MITHRIL_BUCKETS, deadline);

  const selections = [
    ...pickSelections(enhancementGroups, enhancementResult.picks),
    ...pickSelections(masteryGroups, masteryResult.picks),
    ...pickSelections(redGroups, redResult.picks),
  ];

  const resourcesConsumed = selections.reduce(
    (totals, sel) => ({
      xp: totals.xp + (sel.deltaCost.xp || 0),
      forgehammers: totals.forgehammers + (sel.deltaCost.forgehammers || 0),
      mythicGear: totals.mythicGear + (sel.deltaCost.mythicGear || 0),
      mithril: totals.mithril + (sel.deltaCost.mithril || 0),
    }),
    { xp: 0, forgehammers: 0, mythicGear: 0, mithril: 0 },
  );

  return {
    selections,
    weightedScore: enhancementResult.score + masteryResult.score + redResult.score,
    resourcesConsumed,
  };
}

function scoreSelectionsWith(selections, weights) {
  return selections.reduce((sum, sel) => sum + (weights[weightKey(sel.troopType, sel.statType)] || 0) * sel.deltaGain, 0);
}

function levelFor(selections, troopType, slot, chainType, fallback) {
  const match = selections.find((s) => s.troopType === troopType && s.slot === slot && s.chainType === chainType);
  return match ? match.targetLevel : fallback;
}

/**
 * Live "Current Stat %" for a slot, additive across the three chains with
 * no base offset (confirmed with the product owner - see PR discussion):
 * currentStatPercent = enhancementBonus + masteryBonus + redImbuementBonus.
 * Exported for the UI to render slot cards without re-running the solver.
 */
export function computeCurrentStatPercent(troopType, slot, gearSlotState) {
  const enhancement = cumulativeAtLevel(getEnhancementChain(troopType, slot), gearSlotState.currentEnhancementLevel || 0, ['xp']);
  const mastery = cumulativeAtLevel(getMasteryChain(troopType, slot), gearSlotState.currentMasteryLevel || 0, ['forgehammers', 'mythicGear']);
  const red = cumulativeAtLevel(getRedImbuementChain(troopType, slot), gearSlotState.currentRedImbuementLevel || 0, ['mithril']);
  return enhancement.gain + mastery.gain + red.gain;
}

/**
 * @param {object} input
 * @param {object} input.gear - { [troopType]: { included, slots: { [slot]: { currentEnhancementLevel, currentMasteryLevel, currentRedImbuementLevel } } } }
 * @param {{xp:number, forgehammers:number, mythicGear:number, mithril:number}} input.resources - available budgets
 * @param {string} input.buildProfileId
 * @param {Record<string, number>} [input.customWeights]
 * @param {number|null} [input.townCenterLevelCap] - null/undefined = no filtering
 * @param {'conservative'|'progressive'} input.redGearStrategyId
 * @param {boolean} input.includeXpReforge
 * @param {boolean} input.includeNearMissAnalysis
 * @param {number} [input.timeBudgetMs]
 */
export async function optimizeHeroGearPlan(input) {
  const {
    gear,
    resources,
    buildProfileId,
    customWeights,
    townCenterLevelCap = null,
    redGearStrategyId,
    includeXpReforge = false,
    includeNearMissAnalysis = false,
    timeBudgetMs = DEFAULT_TIME_BUDGET_MS,
  } = input;

  const weights = resolveWeights(buildProfileId, customWeights);
  const deadline = Date.now() + Math.max(500, timeBudgetMs);

  const recoverableXp = includeXpReforge ? computeRecoverableXp(gear) : 0;
  const budgets = {
    xp: Number(resources.xp || 0) + recoverableXp,
    forgehammers: Number(resources.forgehammers || 0),
    mythicGear: Number(resources.mythicGear || 0),
    mithril: Number(resources.mithril || 0),
  };

  let timedOut = false;
  let baseline;
  try {
    baseline = solveForBudgets({ gear, weights, tcCap: townCenterLevelCap, redGearStrategyId, budgets, deadline });
  } catch (error) {
    if (error instanceof OptimizationTimeout) {
      timedOut = true;
      baseline = { selections: [], weightedScore: 0, resourcesConsumed: { xp: 0, forgehammers: 0, mythicGear: 0, mithril: 0 } };
    } else {
      throw error;
    }
  }

  let nearMisses = [];
  if (includeNearMissAnalysis && !timedOut) {
    try {
      const scaledBudgets = {
        xp: budgets.xp * NEAR_MISS_BUDGET_MULTIPLIER,
        forgehammers: budgets.forgehammers * NEAR_MISS_BUDGET_MULTIPLIER,
        mythicGear: budgets.mythicGear * NEAR_MISS_BUDGET_MULTIPLIER,
        mithril: budgets.mithril * NEAR_MISS_BUDGET_MULTIPLIER,
      };
      const scaled = solveForBudgets({ gear, weights, tcCap: townCenterLevelCap, redGearStrategyId, budgets: scaledBudgets, deadline });
      nearMisses = scaled.selections
        .filter((sel) => {
          const baselineLevel = levelFor(baseline.selections, sel.troopType, sel.slot, sel.chainType, 0);
          return sel.targetLevel > baselineLevel;
        })
        .map((sel) => ({
          troopType: sel.troopType,
          slot: sel.slot,
          chainType: sel.chainType,
          fromLevel: levelFor(baseline.selections, sel.troopType, sel.slot, sel.chainType, 0),
          toLevel: sel.targetLevel,
          extraResourcePercent: 10,
        }));
    } catch (error) {
      if (!(error instanceof OptimizationTimeout)) throw error;
      // Near-miss is a nice-to-have; a timeout on the scaled re-solve just
      // means we skip it rather than failing the whole optimize call.
    }
  }

  const slots = [];
  for (const troopType of getTroopTypes()) {
    const troopState = gear[troopType];
    if (!troopState?.included) continue;
    for (const slot of getGearSlots()) {
      const slotConfig = getSlotConfig(troopType, slot);
      const slotState = troopState.slots?.[slot];
      if (!slotConfig || !slotState) continue;

      const newEnhancementLevel = levelFor(baseline.selections, troopType, slot, 'enhancement', slotState.currentEnhancementLevel || 0);
      const newMasteryLevel = levelFor(baseline.selections, troopType, slot, 'mastery', slotState.currentMasteryLevel || 0);
      const newRedImbuementLevel = levelFor(baseline.selections, troopType, slot, 'redImbuement', slotState.currentRedImbuementLevel || 0);

      slots.push({
        troopType,
        slot,
        statType: slotConfig.statType,
        currentEnhancementLevel: slotState.currentEnhancementLevel || 0,
        currentMasteryLevel: slotState.currentMasteryLevel || 0,
        currentRedImbuementLevel: slotState.currentRedImbuementLevel || 0,
        newEnhancementLevel,
        newMasteryLevel,
        newRedImbuementLevel,
        currentStatPercent: computeCurrentStatPercent(troopType, slot, slotState),
        newStatPercent: computeCurrentStatPercent(troopType, slot, {
          currentEnhancementLevel: newEnhancementLevel,
          currentMasteryLevel: newMasteryLevel,
          currentRedImbuementLevel: newRedImbuementLevel,
        }),
        steps: baseline.selections.filter((s) => s.troopType === troopType && s.slot === slot && s.targetLevel !== (
          s.chainType === 'enhancement' ? slotState.currentEnhancementLevel || 0
            : s.chainType === 'mastery' ? slotState.currentMasteryLevel || 0
              : slotState.currentRedImbuementLevel || 0
        )),
      });
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    timedOut,
    slots,
    resourcesAvailable: budgets,
    resourcesConsumed: baseline.resourcesConsumed,
    recoverableXp,
    weightedScore: baseline.weightedScore,
    unweightedScore: scoreSelectionsWith(baseline.selections, unweightedWeights()),
    nearMisses,
  };
}

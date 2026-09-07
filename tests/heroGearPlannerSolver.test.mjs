import test from 'node:test';
import assert from 'node:assert/strict';
import { optimizeHeroGearPlan } from '../lib/heroGearPlanner/solver.mjs';

// All hand-checked against the placeholder chains actually shipped in
// /data/hero-gear/*.json (infantry:helm and cavalry:chest only). If those
// placeholder numbers are ever replaced with real data, these expected
// values will need recomputing by hand against the new numbers - that's
// the point: this file verifies the ALGORITHM, not any particular table.
//
// infantry:helm enhancement: L1 xp500->1.0, L2 xp1200->2.1(total1700),
//   L3 xp2000->3.4(total3700), L4 xp3200->4.8(total6900)
//   milestoneFlags: L1 c:true p:true, L2 c:false p:true, L3 c:true p:true, L4 c:false p:true
// cavalry:chest enhancement: L1 xp550->0.9, L2 xp1300->1.9(total1850),
//   L3 xp2100->3.1(total3950), L4 xp3400->4.4(total7350)

function emptySlot() {
  return { currentEnhancementLevel: 0, currentMasteryLevel: 0, currentRedImbuementLevel: 0 };
}

function baseGear({ infantryIncluded = true, cavalryIncluded = true, archerIncluded = false } = {}) {
  return {
    infantry: { included: infantryIncluded, slots: { helm: emptySlot(), gloves: emptySlot(), chest: emptySlot(), boots: emptySlot() } },
    cavalry: { included: cavalryIncluded, slots: { helm: emptySlot(), gloves: emptySlot(), chest: emptySlot(), boots: emptySlot() } },
    archer: { included: archerIncluded, slots: { helm: emptySlot(), gloves: emptySlot(), chest: emptySlot(), boots: emptySlot() } },
  };
}

const EQUAL_WEIGHTS = {
  infantryHealth: 1, infantryLethality: 0,
  cavalryHealth: 0, cavalryLethality: 1,
  archerHealth: 0, archerLethality: 0,
};

function findSlot(result, troopType, slot) {
  return result.slots.find((s) => s.troopType === troopType && s.slot === slot);
}

test('1D enhancement knapsack finds the hand-computed optimum, not just the greedy single-chain pick', async () => {
  const result = await optimizeHeroGearPlan({
    gear: baseGear(),
    resources: { xp: 3700, forgehammers: 0, mythicGear: 0, mithril: 0 },
    buildProfileId: 'custom',
    customWeights: EQUAL_WEIGHTS,
    townCenterLevelCap: null,
    redGearStrategyId: 'progressive',
    includeXpReforge: false,
    includeNearMissAnalysis: false,
  });

  // Optimal split is infantry:helm -> L2 (cost 1700, gain 2.1) + cavalry:chest
  // -> L2 (cost 1850, gain 1.9) = cost 3550, gain 4.0. Spending the whole
  // budget on infantry:helm alone (L3, cost 3700, gain 3.4) looks
  // appealing greedily but scores lower - this is exactly the case a
  // single-chain greedy allocator gets wrong and a knapsack gets right.
  const helm = findSlot(result, 'infantry', 'helm');
  const chest = findSlot(result, 'cavalry', 'chest');
  assert.equal(helm.newEnhancementLevel, 2);
  assert.equal(chest.newEnhancementLevel, 2);
  assert.equal(result.resourcesConsumed.xp, 3550);
  assert.ok(Math.abs(result.weightedScore - 4.0) < 1e-6, `expected weightedScore ~4.0, got ${result.weightedScore}`);
});

test('Town Center cap truncates a chain even when resources would allow further levels', async () => {
  const result = await optimizeHeroGearPlan({
    gear: baseGear({ cavalryIncluded: false }),
    resources: { xp: 1_000_000, forgehammers: 0, mythicGear: 0, mithril: 0 },
    buildProfileId: 'custom',
    customWeights: EQUAL_WEIGHTS,
    townCenterLevelCap: 22, // L1 requires TC20 (ok), L2 requires TC22 (ok), L3 requires TC24 (blocked)
    redGearStrategyId: 'progressive',
    includeXpReforge: false,
    includeNearMissAnalysis: false,
  });
  const helm = findSlot(result, 'infantry', 'helm');
  assert.equal(helm.newEnhancementLevel, 2, 'should never reach L3+ once TC cap excludes it, regardless of budget');
});

test('Conservative Red Gear Strategy only allows stopping at milestone-flagged levels', async () => {
  const result = await optimizeHeroGearPlan({
    gear: baseGear({ cavalryIncluded: false }),
    resources: { xp: 1_000_000, forgehammers: 0, mythicGear: 0, mithril: 0 },
    buildProfileId: 'custom',
    customWeights: EQUAL_WEIGHTS,
    townCenterLevelCap: null,
    redGearStrategyId: 'conservative', // L2 and L4 are not conservative-flagged stopping points
    includeXpReforge: false,
    includeNearMissAnalysis: false,
  });
  const helm = findSlot(result, 'infantry', 'helm');
  assert.equal(helm.newEnhancementLevel, 3, 'L4 is unreachable as a *stop* under conservative even with unlimited budget');
});

test('Progressive Red Gear Strategy can reach the top of the chain with enough budget', async () => {
  const result = await optimizeHeroGearPlan({
    gear: baseGear({ cavalryIncluded: false }),
    resources: { xp: 1_000_000, forgehammers: 0, mythicGear: 0, mithril: 0 },
    buildProfileId: 'custom',
    customWeights: EQUAL_WEIGHTS,
    townCenterLevelCap: null,
    redGearStrategyId: 'progressive',
    includeXpReforge: false,
    includeNearMissAnalysis: false,
  });
  const helm = findSlot(result, 'infantry', 'helm');
  assert.equal(helm.newEnhancementLevel, 4);
});

test('XP reforge pre-solve step recovers half the XP already sunk into current levels', async () => {
  const gear = baseGear({ cavalryIncluded: false });
  gear.infantry.slots.helm.currentEnhancementLevel = 2; // sunk cost 500 + 1200 = 1700 xp
  const result = await optimizeHeroGearPlan({
    gear,
    resources: { xp: 0, forgehammers: 0, mythicGear: 0, mithril: 0 },
    buildProfileId: 'custom',
    customWeights: EQUAL_WEIGHTS,
    townCenterLevelCap: null,
    redGearStrategyId: 'progressive',
    includeXpReforge: true,
    includeNearMissAnalysis: false,
  });
  assert.ok(Math.abs(result.recoverableXp - 850) < 1e-6, `expected 850 recoverable xp (0.5 * 1700), got ${result.recoverableXp}`);
  assert.equal(result.resourcesAvailable.xp, 850);
});

test('Near-miss analysis surfaces a step only reachable with 10% more budget, without spending it', async () => {
  const result = await optimizeHeroGearPlan({
    gear: baseGear({ cavalryIncluded: false }),
    // 1700 reaches L2 (cumulative 1700) exactly; +10% = 1870, which clears
    // L2's cost with room to spare but still can't reach L3 (3700).
    resources: { xp: 1700, forgehammers: 0, mythicGear: 0, mithril: 0 },
    buildProfileId: 'custom',
    customWeights: EQUAL_WEIGHTS,
    townCenterLevelCap: null,
    redGearStrategyId: 'progressive',
    includeXpReforge: false,
    includeNearMissAnalysis: true,
  });
  const helm = findSlot(result, 'infantry', 'helm');
  assert.equal(helm.newEnhancementLevel, 2, 'baseline plan should not change because of near-miss analysis');
  assert.equal(result.resourcesConsumed.xp, 1700, 'near-miss must not actually spend the extra 10%');
  assert.equal(result.nearMisses.length, 0, 'L2 is already the baseline pick, +10% of 1700 is not enough for L3 (3700)');
});

test('Near-miss analysis does surface a genuinely reachable-with-more-budget step', async () => {
  const result = await optimizeHeroGearPlan({
    gear: baseGear({ cavalryIncluded: false }),
    // 3400 xp: L3 costs 3700 (just out of reach); +10% = 3740, which clears it.
    resources: { xp: 3400, forgehammers: 0, mythicGear: 0, mithril: 0 },
    buildProfileId: 'custom',
    customWeights: EQUAL_WEIGHTS,
    townCenterLevelCap: null,
    redGearStrategyId: 'progressive',
    includeXpReforge: false,
    includeNearMissAnalysis: true,
  });
  const helm = findSlot(result, 'infantry', 'helm');
  assert.equal(helm.newEnhancementLevel, 2, 'baseline cannot afford L3 at 3400 xp');
  assert.equal(result.resourcesConsumed.xp, 1700, 'baseline spend must not include the near-miss step');
  const nearMiss = result.nearMisses.find((m) => m.troopType === 'infantry' && m.slot === 'helm' && m.chainType === 'enhancement');
  assert.ok(nearMiss, 'expected a near-miss entry for infantry:helm enhancement');
  assert.equal(nearMiss.toLevel, 3);
});

test('Current Stat % composes additively across Enhancement, Mastery, and Red Imbuement with no base offset', async () => {
  const gear = baseGear({ cavalryIncluded: false });
  gear.infantry.slots.helm.currentEnhancementLevel = 2; // cumulativeStatBonus 2.1
  gear.infantry.slots.helm.currentMasteryLevel = 1; // cumulativeStatBonus 1.5
  gear.infantry.slots.helm.currentRedImbuementLevel = 1; // cumulativeStatBonus 2.0
  const result = await optimizeHeroGearPlan({
    gear,
    resources: { xp: 0, forgehammers: 0, mythicGear: 0, mithril: 0 },
    buildProfileId: 'unweighted',
    townCenterLevelCap: null,
    redGearStrategyId: 'progressive',
    includeXpReforge: false,
    includeNearMissAnalysis: false,
  });
  const helm = findSlot(result, 'infantry', 'helm');
  assert.ok(Math.abs(helm.currentStatPercent - 5.6) < 1e-6, `expected 2.1+1.5+2.0=5.6, got ${helm.currentStatPercent}`);
});

test('Excluded troop types contribute zero steps and consume no resources', async () => {
  const result = await optimizeHeroGearPlan({
    gear: baseGear({ infantryIncluded: false, cavalryIncluded: false }),
    resources: { xp: 1_000_000, forgehammers: 1_000_000, mythicGear: 1_000_000, mithril: 1_000_000 },
    buildProfileId: 'unweighted',
    townCenterLevelCap: null,
    redGearStrategyId: 'progressive',
    includeXpReforge: false,
    includeNearMissAnalysis: false,
  });
  assert.equal(result.slots.length, 0);
  assert.deepEqual(result.resourcesConsumed, { xp: 0, forgehammers: 0, mythicGear: 0, mithril: 0 });
});

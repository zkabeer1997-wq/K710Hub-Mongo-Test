import {
  GEAR_SLOTS,
  SLOT_CONFIG,
  TROOP_TYPES,
  computeCurrentStatPercent,
} from './data/heroGearPlannerData.mjs';

/**
 * Runs the Hero Gear Planner optimizer.
 *
 * This is a stub: it returns a realistic-shaped recommendation without
 * reverse-engineering Kingshot's real enhancement/mastery cost curves. Swap
 * the body out for the real scoring pass later - callers only depend on the
 * shape returned below.
 *
 * @param {object} input
 * @param {object} input.gear - per-troop slot state, see createDefaultGearState()
 * @param {object} input.resources - { enhancementXp, forgehammers, mythicGear, mithril }
 * @param {string} input.buildProfileId
 * @param {object} [input.customWeights]
 * @param {string} input.redGearStrategyId
 * @param {boolean} input.includeXpReforge
 * @param {boolean} input.includeNearMissAnalysis
 */
export async function optimizeHeroGearPlan(input) {
  // Simulated latency so the UI's pending state has something real to show.
  await new Promise((resolve) => setTimeout(resolve, 650));

  const { gear = {}, resources = {}, includeNearMissAnalysis = false } = input || {};

  const steps = [];
  let stepId = 0;

  for (const troop of TROOP_TYPES) {
    const troopState = gear[troop.id];
    if (!troopState?.included) continue;

    for (const slot of GEAR_SLOTS) {
      const slotState = troopState.slots?.[slot.id];
      if (!slotState) continue;
      const config = SLOT_CONFIG[troop.id][slot.id];
      const before = computeCurrentStatPercent(slotState);
      const projectedEnhancement = Math.min(slotState.enhancementLevel + 3, 20);
      const projectedMastery = Math.min(slotState.masteryLevel + 2, 20);
      const after = computeCurrentStatPercent({
        enhancementLevel: projectedEnhancement,
        masteryLevel: projectedMastery,
      });

      stepId += 1;
      steps.push({
        id: `step-${stepId}`,
        troopId: troop.id,
        slotId: slot.id,
        stat: config.stat,
        beforePercent: before,
        afterPercent: after,
        gainPercent: Math.round((after - before) * 100) / 100,
        forgehammers: 420 * (projectedMastery - slotState.masteryLevel),
        enhancementXp: 1800 * (projectedEnhancement - slotState.enhancementLevel),
        projectedEnhancementLevel: projectedEnhancement,
        projectedMasteryLevel: projectedMastery,
      });
    }
  }

  steps.sort((a, b) => b.gainPercent - a.gainPercent);

  const resourcesUsed = steps.reduce(
    (totals, step) => ({
      forgehammers: totals.forgehammers + step.forgehammers,
      enhancementXp: totals.enhancementXp + step.enhancementXp,
      mythicGear: totals.mythicGear,
      mithril: totals.mithril,
    }),
    { forgehammers: 0, enhancementXp: 0, mythicGear: 0, mithril: 0 },
  );

  const totalGain = Math.round(steps.reduce((sum, step) => sum + step.gainPercent, 0) * 100) / 100;

  return {
    generatedAt: new Date().toISOString(),
    steps,
    totalStatGainPercent: totalGain,
    resourcesUsed,
    resourcesAvailable: {
      enhancementXp: Number(resources.enhancementXp) || 0,
      forgehammers: Number(resources.forgehammers) || 0,
      mythicGear: Number(resources.mythicGear) || 0,
      mithril: Number(resources.mithril) || 0,
    },
    nearMisses: includeNearMissAnalysis
      ? steps.slice(0, 3).map((step) => ({
          ...step,
          extraResourcePercent: 10,
          note: 'Within 10% more resources of unlocking the next Mastery breakpoint.',
        }))
      : [],
  };
}

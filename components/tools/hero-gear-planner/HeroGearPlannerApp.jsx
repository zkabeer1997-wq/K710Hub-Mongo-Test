'use client';

import { useCallback, useMemo, useState } from 'react';
import { Tabs, Panel } from '../../ui';
import { useToolPersistence } from '../../../lib/useToolPersistence';
import { getTroopTypes, getGearSlots, getBuildProfiles } from '../../../lib/heroGearPlanner/data.js';
import { optimizeHeroGearPlan, weightKey } from '../../../lib/heroGearPlanner/solver.mjs';
import IntroCard from './IntroCard';
import PresetBar from './PresetBar';
import InputsCard, { computeTotalXpAvailable } from './InputsCard';
import TroopGearCard from './TroopGearCard';
import OptimizerPanel from './OptimizerPanel';
import PlanResults from './PlanResults';
import FaqAccordion from './FaqAccordion';
import styles from './HeroGearPlanner.module.css';

const TOOL_KEY = 'hero-gear-planner';
const SCHEMA_VERSION = 2; // v2: solver-driven schema (per-chain current levels, flat weight keys)

const TROOP_LABELS = { infantry: 'Infantry', cavalry: 'Cavalry', archer: 'Archer' };
const STAT_TYPES = ['health', 'lethality'];

const DEFAULT_RESOURCES = {
  greenParts: 0,
  purpleParts: 0,
  bankedXp: 0,
  gearToConsume: 0,
  forgehammers: 0,
  mythicGear: 0,
  mithril: 0,
};

function troopLabel(troopType) {
  return TROOP_LABELS[troopType] || troopType;
}

function defaultCustomWeights() {
  const weights = {};
  for (const troopType of getTroopTypes()) {
    for (const stat of STAT_TYPES) weights[weightKey(troopType, stat)] = 1 / 6;
  }
  return weights;
}

function createEmptySlotState() {
  return { currentEnhancementLevel: 0, currentMasteryLevel: 0, currentRedImbuementLevel: 0 };
}

function createDefaultGearState() {
  return Object.fromEntries(
    getTroopTypes().map((troopType) => [
      troopType,
      { included: true, slots: Object.fromEntries(getGearSlots().map((slot) => [slot, createEmptySlotState()])) },
    ]),
  );
}

function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function firstBuildProfileId() {
  const ids = Object.keys(getBuildProfiles()).filter((id) => id !== 'custom' && id !== 'unweighted');
  return ids[0] || 'unweighted';
}

function defaultState() {
  return {
    gear: createDefaultGearState(),
    resources: { ...DEFAULT_RESOURCES },
    buildProfileId: firstBuildProfileId(),
    customWeights: defaultCustomWeights(),
    townCenterLevelCap: null, // null = no filtering, per spec default
    redGearStrategyId: 'conservative',
    includeXpReforge: true,
    includeNearMissAnalysis: false,
    presets: [],
    activePresetId: null,
  };
}

export default function HeroGearPlannerApp() {
  const [state, setState] = useState(defaultState);
  const [activeTab, setActiveTab] = useState('optimize');
  const [optimizing, setOptimizing] = useState(false);
  const [optimizeResult, setOptimizeResult] = useState(null);
  const [planApplied, setPlanApplied] = useState(false);

  const restore = useCallback((saved) => {
    setState((prev) => ({ ...prev, ...saved }));
    if (saved.lastResult) setOptimizeResult(saved.lastResult);
  }, []);

  const persistedInputs = useMemo(() => ({ ...state, lastResult: optimizeResult }), [state, optimizeResult]);

  const persistence = useToolPersistence({
    toolKey: TOOL_KEY,
    schemaVersion: SCHEMA_VERSION,
    inputs: persistedInputs,
    restore,
    migrate: () => null, // v1 (pre-solver) shape isn't compatible - start fresh rather than guess-convert it
    autoDetect: true,
  });

  function updateResource(field, value) {
    setState((prev) => ({ ...prev, resources: { ...prev.resources, [field]: value } }));
  }

  function resetResources() {
    setState((prev) => ({ ...prev, resources: { ...DEFAULT_RESOURCES } }));
  }

  function toggleTroopIncluded(troopType) {
    setState((prev) => ({
      ...prev,
      gear: {
        ...prev.gear,
        [troopType]: { ...prev.gear[troopType], included: !prev.gear[troopType].included },
      },
    }));
  }

  function updateSlot(troopType, slot, field, value) {
    setState((prev) => ({
      ...prev,
      gear: {
        ...prev.gear,
        [troopType]: {
          ...prev.gear[troopType],
          slots: {
            ...prev.gear[troopType].slots,
            [slot]: {
              ...prev.gear[troopType].slots[slot],
              [field]: Number(value) || 0,
            },
          },
        },
      },
    }));
  }

  function updateCustomWeight(troopType, statType, value) {
    setState((prev) => ({
      ...prev,
      customWeights: { ...prev.customWeights, [weightKey(troopType, statType)]: Number(value) || 0 },
    }));
  }

  const presetSnapshot = useCallback(
    () => ({
      gear: state.gear,
      resources: state.resources,
      buildProfileId: state.buildProfileId,
      customWeights: state.customWeights,
      townCenterLevelCap: state.townCenterLevelCap,
      redGearStrategyId: state.redGearStrategyId,
      includeXpReforge: state.includeXpReforge,
      includeNearMissAnalysis: state.includeNearMissAnalysis,
      lastResult: optimizeResult,
    }),
    [state, optimizeResult],
  );

  function createPreset(name) {
    const id = makeId();
    setState((prev) => ({
      ...prev,
      activePresetId: id,
      presets: [...prev.presets, { id, name, data: presetSnapshot(), updatedAt: new Date().toISOString() }],
    }));
  }

  function loadPreset(id) {
    if (!id) {
      setState((prev) => ({ ...prev, activePresetId: null }));
      return;
    }
    setState((prev) => {
      const preset = prev.presets.find((p) => p.id === id);
      if (!preset) return prev;
      const { lastResult, ...rest } = preset.data;
      setOptimizeResult(lastResult || null);
      setPlanApplied(false);
      return { ...prev, ...rest, activePresetId: id, presets: prev.presets };
    });
  }

  function deletePreset(id) {
    setState((prev) => ({
      ...prev,
      presets: prev.presets.filter((p) => p.id !== id),
      activePresetId: prev.activePresetId === id ? null : prev.activePresetId,
    }));
  }

  async function sharePreset(id) {
    if (!id || typeof navigator === 'undefined' || !navigator.clipboard) return;
    const url = new URL(window.location.href);
    url.searchParams.set('build', id);
    try {
      await navigator.clipboard.writeText(url.toString());
    } catch {
      /* clipboard permissions denied - nothing to fall back to here */
    }
  }

  const resourcesSummary = useMemo(
    () => ({
      xp: computeTotalXpAvailable(state.resources),
      forgehammers: Number(state.resources.forgehammers) || 0,
      mythicGear: Number(state.resources.mythicGear) || 0,
      mithril: Number(state.resources.mithril) || 0,
    }),
    [state.resources],
  );

  const canOptimize = useMemo(() => {
    const hasIncludedTroop = getTroopTypes().some((t) => state.gear[t]?.included);
    const hasResources = Object.values(resourcesSummary).some((v) => v > 0);
    return hasIncludedTroop && hasResources;
  }, [state.gear, resourcesSummary]);

  async function runOptimizer() {
    setOptimizing(true);
    setPlanApplied(false);
    try {
      const result = await optimizeHeroGearPlan({
        gear: state.gear,
        resources: resourcesSummary,
        buildProfileId: state.buildProfileId,
        customWeights: state.customWeights,
        townCenterLevelCap: state.townCenterLevelCap,
        redGearStrategyId: state.redGearStrategyId,
        includeXpReforge: state.includeXpReforge,
        includeNearMissAnalysis: state.includeNearMissAnalysis,
      });
      setOptimizeResult(result);
      setActiveTab('plan');
    } finally {
      setOptimizing(false);
    }
  }

  function applyPlan() {
    if (!optimizeResult) return;
    setState((prev) => {
      const gear = { ...prev.gear };
      for (const slotResult of optimizeResult.slots) {
        gear[slotResult.troopType] = {
          ...gear[slotResult.troopType],
          slots: {
            ...gear[slotResult.troopType].slots,
            [slotResult.slot]: {
              currentEnhancementLevel: slotResult.newEnhancementLevel,
              currentMasteryLevel: slotResult.newMasteryLevel,
              currentRedImbuementLevel: slotResult.newRedImbuementLevel,
            },
          },
        };
      }
      return { ...prev, gear };
    });
    setPlanApplied(true);
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1>Hero Gear Planner</h1>
          <p>
            Model Enhancement, Mastery, and Red Imbuement investment across Infantry, Cavalry, and Archer hero gear,
            then let the optimizer rank the upgrades worth your resources first.
          </p>
        </div>
        <Tabs
          tabs={[
            { id: 'optimize', label: 'Optimize' },
            { id: 'plan', label: 'Plan' },
          ]}
          activeId={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {persistence.status === 'signed-out' && (
        <Panel variant="surface" title="Sign in to save your builds">
          <p style={{ margin: 0, color: 'var(--color-ink-muted)' }}>
            You can still use the optimizer, but your inputs and saved builds won&rsquo;t persist between visits until
            you sign in as a member.
          </p>
        </Panel>
      )}

      <IntroCard />

      <PresetBar
        presets={state.presets}
        activePresetId={state.activePresetId}
        onSelect={loadPreset}
        onCreate={createPreset}
        onShare={sharePreset}
        onDelete={deletePreset}
      />

      <InputsCard resources={state.resources} onChange={updateResource} onReset={resetResources} />

      {activeTab === 'optimize' ? (
        <div className={styles.layout}>
          <div className={styles.troopGrid}>
            {getTroopTypes().map((troopType) => (
              <TroopGearCard
                key={troopType}
                troop={{ id: troopType, label: troopLabel(troopType) }}
                troopState={state.gear[troopType]}
                onToggleIncluded={() => toggleTroopIncluded(troopType)}
                onSlotChange={(slot, field, value) => updateSlot(troopType, slot, field, value)}
              />
            ))}
          </div>
          <OptimizerPanel
            buildProfileId={state.buildProfileId}
            customWeights={state.customWeights}
            onBuildProfileChange={(id) => setState((prev) => ({ ...prev, buildProfileId: id }))}
            onCustomWeightChange={updateCustomWeight}
            presets={state.presets}
            activePresetId={state.activePresetId}
            onLoadPreset={loadPreset}
            onDeletePreset={deletePreset}
            townCenterLevelCap={state.townCenterLevelCap}
            onTownCenterChange={(v) => setState((prev) => ({ ...prev, townCenterLevelCap: v === '' ? null : Number(v) }))}
            redGearStrategyId={state.redGearStrategyId}
            onRedGearStrategyChange={(id) => setState((prev) => ({ ...prev, redGearStrategyId: id }))}
            includeXpReforge={state.includeXpReforge}
            includeNearMissAnalysis={state.includeNearMissAnalysis}
            onToggleReforge={(v) => setState((prev) => ({ ...prev, includeXpReforge: v }))}
            onToggleNearMiss={(v) => setState((prev) => ({ ...prev, includeNearMissAnalysis: v }))}
            resourcesSummary={optimizeResult ? optimizeResult.resourcesConsumed : resourcesSummary}
            resourcesSummaryLabel={optimizeResult ? "Resources You'll Use (from last plan)" : "Resources You'll Use"}
            onOptimize={runOptimizer}
            optimizing={optimizing}
            canOptimize={canOptimize}
          />
        </div>
      ) : (
        <PlanResults result={optimizeResult} onApply={applyPlan} applied={planApplied} />
      )}

      <FaqAccordion />
    </div>
  );
}

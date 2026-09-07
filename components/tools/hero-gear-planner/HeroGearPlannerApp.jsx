'use client';

import { useCallback, useMemo, useState } from 'react';
import { Tabs, Panel } from '../../ui';
import { useToolPersistence } from '../../../lib/useToolPersistence';
import {
  TROOP_TYPES,
  BUILD_PROFILES,
  RED_GEAR_STRATEGIES,
  createDefaultGearState,
} from '../../../lib/data/heroGearPlannerData.mjs';
import { optimizeHeroGearPlan } from '../../../lib/heroGearPlannerCompute.mjs';
import IntroCard from './IntroCard';
import PresetBar from './PresetBar';
import InputsCard, { computeTotalXpAvailable } from './InputsCard';
import TroopGearCard from './TroopGearCard';
import OptimizerPanel from './OptimizerPanel';
import PlanResults from './PlanResults';
import FaqAccordion from './FaqAccordion';
import styles from './HeroGearPlanner.module.css';

const TOOL_KEY = 'hero-gear-planner';
const SCHEMA_VERSION = 1;

const DEFAULT_RESOURCES = {
  greenParts: 0,
  purpleParts: 0,
  bankedXp: 0,
  gearToConsume: 0,
  forgehammers: 0,
  mythicGear: 0,
  mithril: 0,
};

function defaultCustomWeights() {
  return Object.fromEntries(TROOP_TYPES.map((t) => [t.id, { lethality: 1 / 6, health: 1 / 6 }]));
}

function makeId() {
  return typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : `build-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function defaultState() {
  return {
    gear: createDefaultGearState(),
    resources: { ...DEFAULT_RESOURCES },
    buildProfileId: BUILD_PROFILES[0].id,
    customWeights: defaultCustomWeights(),
    townCenterLevel: '30',
    redGearStrategyId: RED_GEAR_STRATEGIES[0].id,
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
  }, []);

  const persistence = useToolPersistence({
    toolKey: TOOL_KEY,
    schemaVersion: SCHEMA_VERSION,
    inputs: state,
    restore,
    migrate: (inputs) => inputs,
    autoDetect: true,
  });

  function updateResource(field, value) {
    setState((prev) => ({ ...prev, resources: { ...prev.resources, [field]: value } }));
  }

  function resetResources() {
    setState((prev) => ({ ...prev, resources: { ...DEFAULT_RESOURCES } }));
  }

  function toggleTroopIncluded(troopId) {
    setState((prev) => ({
      ...prev,
      gear: {
        ...prev.gear,
        [troopId]: { ...prev.gear[troopId], included: !prev.gear[troopId].included },
      },
    }));
  }

  function updateSlot(troopId, slotId, field, value) {
    setState((prev) => ({
      ...prev,
      gear: {
        ...prev.gear,
        [troopId]: {
          ...prev.gear[troopId],
          slots: {
            ...prev.gear[troopId].slots,
            [slotId]: {
              ...prev.gear[troopId].slots[slotId],
              [field]: field === 'tier' ? value : Number(value) || 0,
            },
          },
        },
      },
    }));
  }

  function updateCustomWeight(troopId, statId, value) {
    setState((prev) => ({
      ...prev,
      customWeights: {
        ...prev.customWeights,
        [troopId]: { ...prev.customWeights[troopId], [statId]: Number(value) || 0 },
      },
    }));
  }

  const presetSnapshot = useCallback(
    () => ({
      gear: state.gear,
      resources: state.resources,
      buildProfileId: state.buildProfileId,
      customWeights: state.customWeights,
      townCenterLevel: state.townCenterLevel,
      redGearStrategyId: state.redGearStrategyId,
      includeXpReforge: state.includeXpReforge,
      includeNearMissAnalysis: state.includeNearMissAnalysis,
    }),
    [state],
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
      return { ...prev, ...preset.data, activePresetId: id, presets: prev.presets };
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
      enhancementXp: computeTotalXpAvailable(state.resources),
      forgehammers: Number(state.resources.forgehammers) || 0,
      mythicGear: Number(state.resources.mythicGear) || 0,
      mithril: Number(state.resources.mithril) || 0,
    }),
    [state.resources],
  );

  const canOptimize = useMemo(() => {
    const hasIncludedTroop = TROOP_TYPES.some((t) => state.gear[t.id].included);
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
      for (const step of optimizeResult.steps) {
        gear[step.troopId] = {
          ...gear[step.troopId],
          slots: {
            ...gear[step.troopId].slots,
            [step.slotId]: {
              ...gear[step.troopId].slots[step.slotId],
              enhancementLevel: step.projectedEnhancementLevel,
              masteryLevel: step.projectedMasteryLevel,
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
            Model Enhancement and Mastery investment across Infantry, Cavalry, and Archer hero gear, then let the
            optimizer rank the upgrades worth your resources first.
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
            {TROOP_TYPES.map((troop) => (
              <TroopGearCard
                key={troop.id}
                troop={troop}
                troopState={state.gear[troop.id]}
                onToggleIncluded={() => toggleTroopIncluded(troop.id)}
                onSlotChange={(slotId, field, value) => updateSlot(troop.id, slotId, field, value)}
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
            townCenterLevel={state.townCenterLevel}
            onTownCenterChange={(v) => setState((prev) => ({ ...prev, townCenterLevel: v }))}
            redGearStrategyId={state.redGearStrategyId}
            onRedGearStrategyChange={(id) => setState((prev) => ({ ...prev, redGearStrategyId: id }))}
            includeXpReforge={state.includeXpReforge}
            includeNearMissAnalysis={state.includeNearMissAnalysis}
            onToggleReforge={(v) => setState((prev) => ({ ...prev, includeXpReforge: v }))}
            onToggleNearMiss={(v) => setState((prev) => ({ ...prev, includeNearMissAnalysis: v }))}
            resourcesSummary={resourcesSummary}
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

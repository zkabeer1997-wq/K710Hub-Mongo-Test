import { Panel, Field, Select, Toggle, Button } from '../../ui';
import {
  BUILD_PROFILES,
  RED_GEAR_STRATEGIES,
  TOWN_CENTER_LEVEL_OPTIONS,
  TROOP_TYPES,
  STAT_TYPES,
} from '../../../lib/data/heroGearPlannerData.mjs';
import styles from './HeroGearPlanner.module.css';

function WeightBreakdown({ weights, editable, onChange }) {
  return (
    <div className={styles.weightBreakdown}>
      {TROOP_TYPES.map((troop) => (
        <div key={troop.id} className={styles.summaryRow}>
          <span>{troop.label}</span>
          <span>
            {Object.values(STAT_TYPES).map((stat) => (
              <span key={stat.id} style={{ marginLeft: 10 }}>
                {stat.label[0]}:{' '}
                {editable ? (
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="1"
                    value={weights[troop.id][stat.id]}
                    onChange={(e) => onChange(troop.id, stat.id, e.target.value)}
                    style={{ width: 52, background: 'transparent', border: '1px solid var(--color-border)', color: 'inherit', borderRadius: 4 }}
                  />
                ) : (
                  weights[troop.id][stat.id].toFixed(2)
                )}
              </span>
            ))}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function OptimizerPanel({
  buildProfileId,
  customWeights,
  onBuildProfileChange,
  onCustomWeightChange,
  presets,
  activePresetId,
  onLoadPreset,
  onDeletePreset,
  townCenterLevel,
  onTownCenterChange,
  redGearStrategyId,
  onRedGearStrategyChange,
  includeXpReforge,
  includeNearMissAnalysis,
  onToggleReforge,
  onToggleNearMiss,
  resourcesSummary,
  onOptimize,
  optimizing,
  canOptimize,
}) {
  const activeProfile = BUILD_PROFILES.find((p) => p.id === buildProfileId) || BUILD_PROFILES[0];
  const isCustom = activeProfile.id === 'custom';
  const activeStrategy = RED_GEAR_STRATEGIES.find((s) => s.id === redGearStrategyId) || RED_GEAR_STRATEGIES[0];

  return (
    <div className={styles.rail}>
      <Panel eyebrow="Optimizer" title="Build Profile">
        <Field label="Profile">
          <Select value={buildProfileId} onChange={(e) => onBuildProfileChange(e.target.value)}>
            {BUILD_PROFILES.map((profile) => (
              <option key={profile.id} value={profile.id}>{profile.label}</option>
            ))}
          </Select>
        </Field>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>{activeProfile.description}</p>
        <WeightBreakdown weights={isCustom ? customWeights : activeProfile.weights} editable={isCustom} onChange={onCustomWeightChange} />
      </Panel>

      <Panel eyebrow="Saved" title="Your Builds">
        {presets.length === 0 ? (
          <p style={{ fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>
            No saved builds yet. Use the + button above to save your current inputs as a named build.
          </p>
        ) : (
          <div className={styles.buildsList}>
            {presets.map((preset) => (
              <div key={preset.id} className={styles.buildRow}>
                <span>{preset.name}{preset.id === activePresetId ? ' •' : ''}</span>
                <div className={styles.buildRowActions}>
                  <button type="button" className="ui-btn ui-btn-quiet" onClick={() => onLoadPreset(preset.id)}>Load</button>
                  <button type="button" className="ui-btn ui-btn-quiet" onClick={() => onDeletePreset(preset.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel eyebrow="Constraints" title="Progress caps">
        <Field label="Town Center Level cap">
          <Select value={townCenterLevel} onChange={(e) => onTownCenterChange(e.target.value)}>
            {TOWN_CENTER_LEVEL_OPTIONS.map((opt) => (
              <option key={opt.id} value={opt.id}>{opt.label}</option>
            ))}
          </Select>
        </Field>
        <Field label="Red Gear Strategy">
          <Select value={redGearStrategyId} onChange={(e) => onRedGearStrategyChange(e.target.value)}>
            {RED_GEAR_STRATEGIES.map((strategy) => (
              <option key={strategy.id} value={strategy.id}>{strategy.label}</option>
            ))}
          </Select>
        </Field>
        <p style={{ fontSize: 'var(--text-xs)', color: 'var(--color-ink-muted)' }}>{activeStrategy.description}</p>

        <div className={styles.checkboxRow} style={{ marginTop: 'var(--space-3)' }}>
          <Toggle
            id="include-xp-reforge"
            label="Include XP reforge (recommended)"
            checked={includeXpReforge}
            onChange={onToggleReforge}
          />
          <Toggle
            id="include-near-miss"
            label="Include near-miss analysis (+10% resources)"
            checked={includeNearMissAnalysis}
            onChange={onToggleNearMiss}
          />
        </div>
      </Panel>

      <Panel eyebrow="Preview" title="Resources You'll Use">
        <div className={styles.summaryBox}>
          <div className={styles.summaryRow}><span>Enhancement XP</span><span>{resourcesSummary.enhancementXp.toLocaleString()}</span></div>
          <div className={styles.summaryRow}><span>Forgehammers</span><span>{resourcesSummary.forgehammers.toLocaleString()}</span></div>
          <div className={styles.summaryRow}><span>Mythic Gear</span><span>{resourcesSummary.mythicGear.toLocaleString()}</span></div>
          <div className={styles.summaryRow}><span>Mithril</span><span>{resourcesSummary.mithril.toLocaleString()}</span></div>
        </div>
      </Panel>

      <Button variant="solid" disabled={!canOptimize || optimizing} onClick={onOptimize} style={{ width: '100%' }}>
        {optimizing ? 'Optimizing…' : 'Optimize'}
      </Button>
    </div>
  );
}

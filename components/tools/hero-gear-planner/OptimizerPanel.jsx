import { Panel, Field, Select, Toggle, Button } from '../../ui';
import { getTroopTypes, getBuildProfiles, getRedGearStrategies } from '../../../lib/heroGearPlanner/data.js';
import { weightKey } from '../../../lib/heroGearPlanner/solver.mjs';
import styles from './HeroGearPlanner.module.css';

const TROOP_LABELS = { infantry: 'Infantry', cavalry: 'Cavalry', archer: 'Archer' };
const STAT_TYPES = [
  { id: 'health', label: 'H' },
  { id: 'lethality', label: 'L' },
];

const TOWN_CENTER_LEVEL_OPTIONS = Array.from({ length: 12 }, (_, i) => 30 - i);

function WeightBreakdown({ weights, editable, onChange }) {
  return (
    <div className={styles.weightBreakdown}>
      {getTroopTypes().map((troopType) => (
        <div key={troopType} className={styles.summaryRow}>
          <span>{TROOP_LABELS[troopType] || troopType}</span>
          <span>
            {STAT_TYPES.map((stat) => {
              const key = weightKey(troopType, stat.id);
              return (
                <span key={key} style={{ marginLeft: 10 }}>
                  {stat.label}:{' '}
                  {editable ? (
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      max="1"
                      value={weights[key] ?? 0}
                      onChange={(e) => onChange(troopType, stat.id, e.target.value)}
                      style={{ width: 52, background: 'transparent', border: '1px solid var(--color-border)', color: 'inherit', borderRadius: 4 }}
                    />
                  ) : (
                    (weights[key] ?? 0).toFixed(2)
                  )}
                </span>
              );
            })}
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
  townCenterLevelCap,
  onTownCenterChange,
  redGearStrategyId,
  onRedGearStrategyChange,
  includeXpReforge,
  includeNearMissAnalysis,
  onToggleReforge,
  onToggleNearMiss,
  resourcesSummary,
  resourcesSummaryLabel = "Resources You'll Use",
  onOptimize,
  optimizing,
  canOptimize,
}) {
  const profiles = getBuildProfiles();
  const activeProfile = profiles[buildProfileId] || profiles.unweighted;
  const isCustom = buildProfileId === 'custom';
  const strategies = getRedGearStrategies();
  const activeStrategy = strategies[redGearStrategyId] || strategies.conservative;

  return (
    <div className={styles.rail}>
      <Panel eyebrow="Optimizer" title="Build Profile">
        <Field label="Profile">
          <Select value={buildProfileId} onChange={(e) => onBuildProfileChange(e.target.value)}>
            {Object.entries(profiles).map(([id, profile]) => (
              <option key={id} value={id}>{profile.label}</option>
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
        <Field label="Town Center Level cap" hint="Leave blank for no cap">
          <Select value={townCenterLevelCap ?? ''} onChange={(e) => onTownCenterChange(e.target.value)}>
            <option value="">No cap</option>
            {TOWN_CENTER_LEVEL_OPTIONS.map((level) => (
              <option key={level} value={level}>{`TC ${level}`}</option>
            ))}
          </Select>
        </Field>
        <Field label="Red Gear Strategy">
          <Select value={redGearStrategyId} onChange={(e) => onRedGearStrategyChange(e.target.value)}>
            {Object.entries(strategies).map(([id, strategy]) => (
              <option key={id} value={id}>{strategy.label}</option>
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

      <Panel eyebrow="Preview" title={resourcesSummaryLabel}>
        <div className={styles.summaryBox}>
          <div className={styles.summaryRow}><span>Enhancement XP</span><span>{Math.round(resourcesSummary.xp).toLocaleString()}</span></div>
          <div className={styles.summaryRow}><span>Forgehammers</span><span>{Math.round(resourcesSummary.forgehammers).toLocaleString()}</span></div>
          <div className={styles.summaryRow}><span>Mythic Gear</span><span>{Math.round(resourcesSummary.mythicGear).toLocaleString()}</span></div>
          <div className={styles.summaryRow}><span>Mithril</span><span>{Math.round(resourcesSummary.mithril).toLocaleString()}</span></div>
        </div>
      </Panel>

      <Button variant="solid" disabled={!canOptimize || optimizing} onClick={onOptimize} style={{ width: '100%' }}>
        {optimizing ? 'Optimizing…' : 'Optimize'}
      </Button>
    </div>
  );
}

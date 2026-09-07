import { Panel, Toggle, Tag, Input, Field } from '../../ui';
import { getGearSlots, getSlotConfig } from '../../../lib/heroGearPlanner/data.js';
import { computeCurrentStatPercent } from '../../../lib/heroGearPlanner/solver.mjs';
import styles from './HeroGearPlanner.module.css';

const SLOT_LABELS = { helm: 'Helm', gloves: 'Gloves', chest: 'Chest', boots: 'Boots' };
const STAT_LABELS = { health: 'Health', lethality: 'Lethality' };

function GearSlot({ troopType, slot, state, onSlotChange }) {
  const config = getSlotConfig(troopType, slot);
  if (!config) return null;
  const currentStat = computeCurrentStatPercent(troopType, slot, state);

  return (
    <div className={styles.slotCard}>
      <div className={styles.slotHead}>
        <span className={styles.slotName}>{SLOT_LABELS[slot] || slot}</span>
        <div className={styles.slotBadges}>
          <Tag tone={config.statType === 'lethality' ? 'danger' : 'success'}>{STAT_LABELS[config.statType] || config.statType}</Tag>
          <Tag tone="accent">{config.multiplier}x</Tag>
        </div>
      </div>

      <div className={styles.slotControls}>
        <Field label="Enhancement Lv.">
          <Input
            type="number"
            min="0"
            value={state.currentEnhancementLevel}
            onChange={(e) => onSlotChange(slot, 'currentEnhancementLevel', e.target.value)}
          />
        </Field>
        <Field label="Mastery Lv.">
          <Input
            type="number"
            min="0"
            value={state.currentMasteryLevel}
            onChange={(e) => onSlotChange(slot, 'currentMasteryLevel', e.target.value)}
          />
        </Field>
      </div>
      <Field label="Red Imbuement Lv.">
        <Input
          type="number"
          min="0"
          value={state.currentRedImbuementLevel}
          onChange={(e) => onSlotChange(slot, 'currentRedImbuementLevel', e.target.value)}
        />
      </Field>

      <div className={styles.slotStat}>
        <span>Current Stat</span>
        <span>{currentStat.toFixed(2)}%</span>
      </div>
    </div>
  );
}

export default function TroopGearCard({ troop, troopState, onToggleIncluded, onSlotChange }) {
  return (
    <Panel
      title={troop.label}
      actions={
        <Toggle
          id={`include-${troop.id}`}
          label="Include"
          checked={troopState.included}
          onChange={onToggleIncluded}
        />
      }
    >
      <div className={styles.slotGrid} style={{ opacity: troopState.included ? 1 : 0.5 }}>
        {getGearSlots().map((slot) => (
          <GearSlot
            key={slot}
            troopType={troop.id}
            slot={slot}
            state={troopState.slots[slot]}
            onSlotChange={(...args) => troopState.included && onSlotChange(...args)}
          />
        ))}
      </div>
    </Panel>
  );
}

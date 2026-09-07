import { Panel, Toggle, Tag, Select, Input, Field } from '../../ui';
import {
  GEAR_SLOTS,
  GEAR_TIERS,
  SLOT_CONFIG,
  STAT_TYPES,
  ENHANCEMENT_LEVEL_MAX,
  MASTERY_LEVEL_MAX,
  computeCurrentStatPercent,
} from '../../../lib/data/heroGearPlannerData.mjs';
import styles from './HeroGearPlanner.module.css';

function GearSlot({ troopId, slot, state, onSlotChange }) {
  const config = SLOT_CONFIG[troopId][slot.id];
  const stat = STAT_TYPES[config.stat];
  const currentStat = computeCurrentStatPercent(state);

  return (
    <div className={styles.slotCard}>
      <div className={styles.slotHead}>
        <span className={styles.slotName}>{slot.label}</span>
        <div className={styles.slotBadges}>
          <Tag tone={config.stat === 'lethality' ? 'danger' : 'success'}>{stat.label}</Tag>
          <Tag tone="accent">{config.multiplier}x</Tag>
        </div>
      </div>

      <Field label="Tier">
        <Select value={state.tier} onChange={(e) => onSlotChange(slot.id, 'tier', e.target.value)}>
          {GEAR_TIERS.map((tier) => (
            <option key={tier.id} value={tier.id}>{tier.label}</option>
          ))}
        </Select>
      </Field>

      <div className={styles.slotControls}>
        <Field label="Enhancement Lv.">
          <Input
            type="number"
            min="0"
            max={ENHANCEMENT_LEVEL_MAX}
            value={state.enhancementLevel}
            onChange={(e) => onSlotChange(slot.id, 'enhancementLevel', e.target.value)}
          />
        </Field>
        <Field label="Mastery Lv.">
          <Input
            type="number"
            min="0"
            max={MASTERY_LEVEL_MAX}
            value={state.masteryLevel}
            onChange={(e) => onSlotChange(slot.id, 'masteryLevel', e.target.value)}
          />
        </Field>
      </div>

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
        {GEAR_SLOTS.map((slot) => (
          <GearSlot
            key={slot.id}
            troopId={troop.id}
            slot={slot}
            state={troopState.slots[slot.id]}
            onSlotChange={(...args) => troopState.included && onSlotChange(...args)}
          />
        ))}
      </div>
    </Panel>
  );
}

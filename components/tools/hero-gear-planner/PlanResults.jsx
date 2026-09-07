import { Panel, Tag, Button, EmptyState, Stat } from '../../ui';
import styles from './HeroGearPlanner.module.css';

const TROOP_LABELS = { infantry: 'Infantry', cavalry: 'Cavalry', archer: 'Archer' };
const SLOT_LABELS = { helm: 'Helm', gloves: 'Gloves', chest: 'Chest', boots: 'Boots' };
const CHAIN_LABELS = { enhancement: 'Enhancement', mastery: 'Mastery', redImbuement: 'Red Imbuement' };

function label(map, id) {
  return map[id] || id;
}

export default function PlanResults({ result, onApply, applied }) {
  if (!result) {
    return (
      <Panel title="Recommended order">
        <EmptyState
          icon="⚙️"
          title="No plan yet"
          description="Run the optimizer to see a ranked list of the highest-value upgrades for your current inputs."
        />
      </Panel>
    );
  }

  const changedSlots = result.slots.filter((s) => s.newStatPercent > s.currentStatPercent);

  return (
    <Panel
      title="Recommended order"
      description={
        result.timedOut
          ? 'The optimizer ran out of time and returned a partial result - try a smaller Town Center cap or fewer included troop types.'
          : `Projected total gain: +${(result.weightedScore).toFixed(3)} weighted score across ${changedSlots.length} slot${changedSlots.length === 1 ? '' : 's'}.`
      }
      actions={
        <Button variant="solid" onClick={onApply} disabled={applied || changedSlots.length === 0}>
          {applied ? 'Applied to your gear' : 'Apply plan to gear'}
        </Button>
      }
    >
      <div className={styles.resourceGrid} style={{ marginBottom: 'var(--space-4)' }}>
        <Stat label="Weighted score" value={result.weightedScore.toFixed(3)} />
        <Stat label="Unweighted score" value={result.unweightedScore.toFixed(3)} />
        <Stat label="Recoverable XP used" value={Math.round(result.recoverableXp).toLocaleString()} />
      </div>

      {changedSlots.length === 0 ? (
        <EmptyState
          icon="🧭"
          title="Nothing affordable yet"
          description="Your current resources aren't enough to move any included slot forward under these settings."
        />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className={`ui-table ${styles.stepsTable}`}>
            <thead>
              <tr>
                <th>Troop</th>
                <th>Slot</th>
                <th>Chain</th>
                <th>From</th>
                <th>To</th>
                <th>Current Stat</th>
                <th>New Stat</th>
              </tr>
            </thead>
            <tbody>
              {changedSlots.flatMap((slot) =>
                slot.steps.map((step) => (
                  <tr key={`${slot.troopType}-${slot.slot}-${step.chainType}`}>
                    <td>{label(TROOP_LABELS, slot.troopType)}</td>
                    <td>{label(SLOT_LABELS, slot.slot)}</td>
                    <td><Tag tone={step.chainType === 'redImbuement' ? 'danger' : 'accent'}>{label(CHAIN_LABELS, step.chainType)}</Tag></td>
                    <td>
                      {step.chainType === 'enhancement' && slot.currentEnhancementLevel}
                      {step.chainType === 'mastery' && slot.currentMasteryLevel}
                      {step.chainType === 'redImbuement' && slot.currentRedImbuementLevel}
                    </td>
                    <td>{step.targetLevel}</td>
                    <td>{slot.currentStatPercent.toFixed(2)}%</td>
                    <td>{slot.newStatPercent.toFixed(2)}%</td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}

      {result.nearMisses.length > 0 && (
        <Panel eyebrow="Near-miss analysis" title="Just out of reach (+10% resources)" className={styles.section}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>
            {result.nearMisses.map((miss) => (
              <li key={`${miss.troopType}-${miss.slot}-${miss.chainType}`}>
                {label(TROOP_LABELS, miss.troopType)} {label(SLOT_LABELS, miss.slot)} ({label(CHAIN_LABELS, miss.chainType)}) —
                level {miss.fromLevel} → {miss.toLevel} with 10% more resources
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </Panel>
  );
}

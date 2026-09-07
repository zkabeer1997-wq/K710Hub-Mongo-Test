import { Panel, Tag, Button, EmptyState } from '../../ui';
import { GEAR_SLOTS, TROOP_TYPES } from '../../../lib/data/heroGearPlannerData.mjs';
import styles from './HeroGearPlanner.module.css';

function label(list, id) {
  return list.find((item) => item.id === id)?.label || id;
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

  return (
    <Panel
      title="Recommended order"
      description={`Projected total gain: +${result.totalStatGainPercent.toFixed(2)}% across ${result.steps.length} pieces.`}
      actions={
        <Button variant="solid" onClick={onApply} disabled={applied}>
          {applied ? 'Applied to your gear' : 'Apply plan to gear'}
        </Button>
      }
    >
      <div style={{ overflowX: 'auto' }}>
        <table className={`ui-table ${styles.stepsTable}`}>
          <thead>
            <tr>
              <th>Troop</th>
              <th>Slot</th>
              <th>Stat</th>
              <th>Before</th>
              <th>After</th>
              <th>Gain</th>
            </tr>
          </thead>
          <tbody>
            {result.steps.map((step) => (
              <tr key={step.id}>
                <td>{label(TROOP_TYPES, step.troopId)}</td>
                <td>{label(GEAR_SLOTS, step.slotId)}</td>
                <td><Tag tone={step.stat === 'lethality' ? 'danger' : 'success'}>{step.stat === 'lethality' ? 'Lethality' : 'Health'}</Tag></td>
                <td>{step.beforePercent.toFixed(2)}%</td>
                <td>{step.afterPercent.toFixed(2)}%</td>
                <td>+{step.gainPercent.toFixed(2)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {result.nearMisses.length > 0 && (
        <Panel eyebrow="Near-miss analysis" title="Just out of reach" className={styles.section}>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 'var(--text-sm)', color: 'var(--color-ink-muted)' }}>
            {result.nearMisses.map((miss) => (
              <li key={`${miss.id}-near-miss`}>
                {label(TROOP_TYPES, miss.troopId)} {label(GEAR_SLOTS, miss.slotId)} — {miss.note}
              </li>
            ))}
          </ul>
        </Panel>
      )}
    </Panel>
  );
}

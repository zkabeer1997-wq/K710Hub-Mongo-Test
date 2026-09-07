import { Panel, Field, Input } from '../../ui';
import styles from './HeroGearPlanner.module.css';

const GREEN_PART_XP = 500;
const PURPLE_PART_XP = 2500;
const GEAR_CONSUME_XP = 3000;

export function computeTotalXpAvailable(resources) {
  const green = Number(resources.greenParts) || 0;
  const purple = Number(resources.purpleParts) || 0;
  const banked = Number(resources.bankedXp) || 0;
  const gearToConsume = Number(resources.gearToConsume) || 0;
  return green * GREEN_PART_XP + purple * PURPLE_PART_XP + banked + gearToConsume * GEAR_CONSUME_XP;
}

function recapLine(resources) {
  const totalXp = computeTotalXpAvailable(resources).toLocaleString();
  const forgehammers = Number(resources.forgehammers || 0).toLocaleString();
  const mithril = Number(resources.mithril || 0).toLocaleString();
  return `${totalXp} Enhancement XP · ${forgehammers} Forgehammers · ${mithril} Mithril`;
}

export default function InputsCard({ resources, onChange, onReset }) {
  return (
    <details className="ui-accordion-item" open>
      <summary className="ui-accordion-trigger">
        <strong>Your Inputs</strong>
      </summary>
      <div className="ui-accordion-body">
        <div className={styles.inputsRecap}>
          <p>{recapLine(resources)}</p>
          <button type="button" className="ui-btn ui-btn-quiet" onClick={onReset}>Reset All</button>
        </div>

        <Panel eyebrow="Enhancement XP" title="XP parts & banked XP" className={styles.section}>
          <div className={styles.resourceGrid}>
            <Field label="Green XP Parts" hint={`${GREEN_PART_XP} XP each`}>
              <Input
                type="number"
                min="0"
                value={resources.greenParts}
                onChange={(e) => onChange('greenParts', e.target.value)}
              />
            </Field>
            <Field label="Purple XP Parts" hint={`${PURPLE_PART_XP} XP each`}>
              <Input
                type="number"
                min="0"
                value={resources.purpleParts}
                onChange={(e) => onChange('purpleParts', e.target.value)}
              />
            </Field>
            <Field label="Banked XP" hint="Already-converted XP sitting unused">
              <Input
                type="number"
                min="0"
                value={resources.bankedXp}
                onChange={(e) => onChange('bankedXp', e.target.value)}
              />
            </Field>
          </div>

          <details style={{ marginTop: 'var(--space-3)' }}>
            <summary className="ui-accordion-trigger" style={{ padding: 0, fontSize: 'var(--text-sm)' }}>
              Gear to consume
            </summary>
            <div style={{ paddingTop: 'var(--space-3)' }}>
              <Field
                label="Extra gear pieces to feed for XP"
                hint={`Old/duplicate pieces you plan to consume, ~${GEAR_CONSUME_XP} XP each`}
              >
                <Input
                  type="number"
                  min="0"
                  value={resources.gearToConsume}
                  onChange={(e) => onChange('gearToConsume', e.target.value)}
                />
              </Field>
            </div>
          </details>

          <div className={styles.xpTotal}>
            <span>Total XP Available</span>
            <strong>{computeTotalXpAvailable(resources).toLocaleString()}</strong>
          </div>
        </Panel>

        <Panel eyebrow="Other resources" title="Forgehammers, Mythic Gear, Mithril" className={styles.section}>
          <div className={styles.resourceGrid}>
            <Field label="Forgehammers" hint="Spent on Mastery levels 1-10">
              <Input
                type="number"
                min="0"
                value={resources.forgehammers}
                onChange={(e) => onChange('forgehammers', e.target.value)}
              />
            </Field>
            <Field label="Mythic Gear / Gold" hint="Spent on Mastery 11-20, ascension, imbuements">
              <Input
                type="number"
                min="0"
                value={resources.mythicGear}
                onChange={(e) => onChange('mythicGear', e.target.value)}
              />
            </Field>
            <Field label="Mithril" hint="Spent exclusively on Red Gear imbuements">
              <Input
                type="number"
                min="0"
                value={resources.mithril}
                onChange={(e) => onChange('mithril', e.target.value)}
              />
            </Field>
          </div>
        </Panel>
      </div>
    </details>
  );
}

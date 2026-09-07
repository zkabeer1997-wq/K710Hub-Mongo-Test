import { Panel } from '../../ui';
import styles from './HeroGearPlanner.module.css';

const STEPS = [
  { title: 'Enter your resources', body: 'Log your Enhancement XP parts, Forgehammers, Mythic Gear, and Mithril in Your Inputs below.' },
  { title: 'Run the optimizer', body: 'Pick a Build Profile and Red Gear Strategy, then let the optimizer rank the highest-value upgrades.' },
  { title: 'Apply & save', body: 'Review the recommended order, apply it to your gear, and save the build so you can pick up where you left off.' },
];

export default function IntroCard({ onOpenHowItWorks }) {
  return (
    <details className="ui-accordion-item" open>
      <summary className="ui-accordion-trigger">
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span aria-hidden="true">⚒️</span>
          <strong>How the Hero Gear Planner works</strong>
        </span>
      </summary>
      <div className="ui-accordion-body">
        <Panel
          variant="surface"
          description="Three steps take you from raw resources to a saved gear build."
          actions={
            onOpenHowItWorks && (
              <button type="button" className="ui-btn ui-btn-quiet" onClick={onOpenHowItWorks}>
                How it works
              </button>
            )
          }
        >
          <ol className={styles.introSteps} style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {STEPS.map((step, index) => (
              <li key={step.title} className={styles.introStep}>
                <span className={styles.introStepNumber}>{index + 1}</span>
                <span className={styles.introStepText}>
                  <strong>{step.title}</strong>
                  <p>{step.body}</p>
                </span>
              </li>
            ))}
          </ol>
        </Panel>
      </div>
    </details>
  );
}

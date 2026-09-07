import { Accordion, AccordionItem, Panel } from '../../ui';
import { HERO_GEAR_FAQ } from './faqData.mjs';
import styles from './HeroGearPlanner.module.css';

// Generic enough to reuse for another tool's FAQ: pass a different `items`
// list (same {q, a} shape) and title/description.
export default function FaqAccordion({ items = HERO_GEAR_FAQ, title = 'Frequently asked questions', description }) {
  return (
    <Panel title={title} description={description}>
      <Accordion>
        {items.map((item) => (
          <AccordionItem key={item.q} title={item.q}>
            <p className={styles.faqIntro} style={{ marginBottom: 0 }}>{item.a}</p>
          </AccordionItem>
        ))}
      </Accordion>
    </Panel>
  );
}

import { getTemplate } from '../../lib/guideLayout.mjs';
import styles from './guideLayout.module.css';

// The responsive template grid. `renderArea(area)` supplies each area's
// content: static blocks on the public page, sortable blocks in the builder.
// Areas keep template order in the DOM, which is also the mobile reading order.
export default function GuideFrame({ templateId, renderArea, editing = false }) {
  const template = getTemplate(templateId);
  if (!template) return null;
  return (
    <div className={styles.frame} data-template={template.id} data-editing={editing ? 'true' : undefined}>
      {template.areas.map(area => (
        <div key={area.id} className={styles.area} data-area={area.id}>
          {renderArea(area)}
        </div>
      ))}
    </div>
  );
}

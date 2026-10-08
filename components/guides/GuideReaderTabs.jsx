'use client';

import { useId, useState } from 'react';
import GuideMarkdown from './GuideMarkdown';
import styles from './guideLayout.module.css';

// F2P / Spender variants that sit under a block layout. Only rendered when the
// guide has tab content, matching the classic guide page.
export default function GuideReaderTabs({ f2p = '', spender = '' }) {
  const [tab, setTab] = useState('f2p');
  const id = useId();
  if (!f2p && !spender) return null;
  const content = tab === 'spenders' ? spender || f2p : f2p || spender;
  return (
    <section aria-label="Guide variants">
      <div className={styles.tabs} role="tablist" aria-label="Guide content">
        <button type="button" role="tab" id={`${id}-f2p`} aria-controls={`${id}-panel`} aria-selected={tab === 'f2p'} onClick={() => setTab('f2p')}>F2P</button>
        <button type="button" role="tab" id={`${id}-sp`} aria-controls={`${id}-panel`} aria-selected={tab === 'spenders'} onClick={() => setTab('spenders')}>Spenders</button>
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${tab === 'f2p' ? 'f2p' : 'sp'}`} className={styles.prose}>
        <GuideMarkdown>{content}</GuideMarkdown>
      </div>
    </section>
  );
}

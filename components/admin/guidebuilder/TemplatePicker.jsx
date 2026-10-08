'use client';

import { useEffect, useRef } from 'react';
import { TEMPLATES } from '../../../lib/guideLayout.mjs';
import styles from './builder.module.css';

// Little CSS-drawn page thumbnails; each box is a template area.
function Thumb({ id }) {
  const bar = (cls = '') => <i className={`${styles.thumbBar} ${cls}`} />;
  const boxes = {
    article: <><b className={styles.thumbBox} style={{ gridColumn: '1 / -1', height: 22 }}>{bar()}{bar(styles.short)}</b><b className={styles.thumbBox} style={{ gridColumn: '1 / -1', height: 64 }}>{bar()}{bar()}{bar(styles.short)}</b></>,
    'sidebar-right': <><b className={styles.thumbBox} style={{ gridColumn: '1 / 3', height: 92 }}>{bar()}{bar()}{bar(styles.short)}</b><b className={`${styles.thumbBox} ${styles.thumbSide}`} style={{ height: 60 }}>{bar()}{bar(styles.short)}</b></>,
    'two-columns': <><b className={styles.thumbBox} style={{ gridColumn: '1 / -1', height: 22 }}>{bar()}</b><b className={styles.thumbBox} style={{ gridColumn: '1 / 3', height: 64 }}>{bar()}{bar(styles.short)}</b><b className={styles.thumbBox} style={{ gridColumn: '3 / 5', height: 64 }}>{bar()}{bar(styles.short)}</b></>,
    'hero-steps': <><b className={`${styles.thumbBox} ${styles.thumbImg}`} style={{ gridColumn: '1 / -1', height: 34 }} /><b className={styles.thumbBox} style={{ gridColumn: '1 / 4', height: 56 }}><span className={styles.thumbNum}>1</span>{bar()}<span className={styles.thumbNum}>2</span>{bar(styles.short)}</b><b className={`${styles.thumbBox} ${styles.thumbSide}`} style={{ gridColumn: '4 / 5', height: 56 }}>{bar()}</b></>,
    gallery: <><b className={styles.thumbBox} style={{ gridColumn: '1 / -1', height: 18 }}>{bar()}</b>{[0, 1, 2, 3].map(i => <b key={i} className={`${styles.thumbBox} ${styles.thumbImg}`} style={{ height: 32 }} />)}<b className={styles.thumbBox} style={{ gridColumn: '1 / -1', height: 18 }}>{bar()}</b></>,
  };
  return <span className={styles.thumb} aria-hidden="true">{boxes[id]}</span>;
}

export default function TemplatePicker({ current = null, first = false, onPick, onClose }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    el?.querySelector('button')?.focus();
    const onKey = event => { if (event.key === 'Escape' && onClose) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className={styles.modalBack} role="presentation">
      <div className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="tpl-title" ref={ref}>
        <h2 id="tpl-title">{first ? 'Choose a page template' : 'Switch page template'}</h2>
        <p className={styles.modalLead}>
          {first ? 'A template sets the areas of your page. You can drag blocks between areas and change the template later.' : 'Your blocks move to the nearest area in the new template. Nothing is deleted.'}
        </p>
        <div className={styles.tplGrid}>
          {TEMPLATES.map(t => (
            <button key={t.id} type="button" className={styles.tplCard} aria-pressed={current === t.id} onClick={() => onPick(t.id)}>
              <Thumb id={t.id} />
              <strong>{t.name}</strong>
              <small>{t.description}</small>
              {current === t.id ? <em className={styles.tplCurrent}>Current</em> : null}
            </button>
          ))}
        </div>
        {onClose ? <div className={styles.modalActions}><button type="button" className={styles.btn} onClick={onClose}>Cancel</button></div> : null}
      </div>
    </div>
  );
}

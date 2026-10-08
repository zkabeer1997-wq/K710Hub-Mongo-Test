'use client';

import { MAX_GRID_IMAGES } from '../../../lib/guideLayout.mjs';
import { AltField, Row, Segmented } from './fields';
import { useBuilder } from './BuilderContext';
import GuideAddImage from './GuideAddImage';
import styles from './builder.module.css';

// Shown right under a selected picture: replace it, describe it, caption it.
export function ImageTextFields({ block, idPrefix }) {
  const { update, focusAlt } = useBuilder();
  const set = (patch, key) => update(block.id, patch, key);
  return (
    <div className={styles.imageTools} onClick={e => e.stopPropagation()}>
      <GuideAddImage blockId={block.id} index={null} library tone="dark" />
      <AltField item={block} idPrefix={idPrefix} autoFocus={focusAlt === block.id} onChange={patch => set(patch, `img:${block.id}`)} />
      <Row label="Caption (optional)" htmlFor={`${idPrefix}-cap`}>
        <input id={`${idPrefix}-cap`} value={block.caption} maxLength={300} onChange={e => set({ caption: e.target.value }, `cap:${block.id}`)} />
      </Row>
    </div>
  );
}

// Side panel: how big the picture is and where it sits.
export function ImageLayoutFields({ block }) {
  const { update } = useBuilder();
  const set = patch => update(block.id, patch);
  return (
    <>
      <Segmented label="Size" value={block.width} options={[['small', 'Small'], ['medium', 'Medium'], ['full', 'Full width']]} onChange={v => set({ width: v })} />
      <Segmented label="Position" value={block.align} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} onChange={v => set({ align: v })} />
      <p className={styles.hintLine}>Describe and caption the picture in the box under it on the page.</p>
    </>
  );
}

// Thumbnails for an image grid: reorder, remove and describe each picture.
export function GridManager({ block }) {
  const { update, focusAlt } = useBuilder();
  const images = block.images;
  const setImages = (next, key) => update(block.id, { images: next }, key);
  const move = (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[i], next[j]] = [next[j], next[i]];
    setImages(next);
  };
  return (
    <div className={styles.gridManager} onClick={e => e.stopPropagation()}>
      <p className={styles.hintLine}>{images.length} of {MAX_GRID_IMAGES} pictures. Use the arrows to change their order.</p>
      <ul className={styles.gridList}>
        {images.map((item, i) => (
          <li key={`${item.src}-${i}`} className={styles.gridItemRow}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.src} alt="" className={styles.gridThumb} />
            <div className={styles.gridItemBody}>
              <label className={styles.srOnly} htmlFor={`${block.id}-g${i}`}>Description of picture {i + 1}</label>
              <input id={`${block.id}-g${i}`} value={item.alt} disabled={item.decorative} placeholder="Describe this picture (alt text)" maxLength={300}
                aria-invalid={!item.decorative && !item.alt.trim() ? 'true' : undefined} className={!item.decorative && !item.alt.trim() ? styles.invalid : undefined}
                ref={el => { if (el && focusAlt === block.id && i === images.length - 1 && !item.alt && !el.dataset.f) { el.dataset.f = '1'; el.focus(); } }}
                onChange={e => setImages(images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)), `gi:${block.id}:${i}`)} />
              <label className={styles.check}>
                <input type="checkbox" checked={item.decorative} onChange={e => setImages(images.map((x, j) => (j === i ? { ...x, decorative: e.target.checked, alt: e.target.checked ? '' : x.alt } : x)))} />
                Decoration only
              </label>
            </div>
            <div className={styles.gridBtns}>
              <button type="button" className={styles.barBtn} aria-label={`Move picture ${i + 1} earlier`} disabled={i === 0} onClick={() => move(i, -1)}>←</button>
              <button type="button" className={styles.barBtn} aria-label={`Move picture ${i + 1} later`} disabled={i === images.length - 1} onClick={() => move(i, 1)}>→</button>
              <button type="button" className={`${styles.barBtn} ${styles.barDanger}`} aria-label={`Remove picture ${i + 1}`} onClick={() => setImages(images.filter((_, j) => j !== i))}>✕</button>
            </div>
          </li>
        ))}
      </ul>
      {images.length < MAX_GRID_IMAGES ? (
        <GuideAddImage blockId={block.id} index={images.length} library tone="dark" />
      ) : <p className={styles.hintLine}>This grid is full (4 pictures).</p>}
    </div>
  );
}

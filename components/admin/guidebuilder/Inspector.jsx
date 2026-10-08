'use client';

import { useEffect, useRef } from 'react';
import { BLOCK_LABELS, MAX_GRID_IMAGES, MAX_TABLE_COLS, MAX_TABLE_ROWS, youtubeId } from '../../../lib/guideLayout.mjs';
import { useBuilder } from './BuilderContext';
import styles from './builder.module.css';

function Row({ label, htmlFor, children, hint }) {
  return (
    <div className={styles.inspRow}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {hint ? <small>{hint}</small> : null}
    </div>
  );
}

function Segmented({ label, value, options, onChange }) {
  return (
    <div className={styles.inspRow}>
      <span id={`seg-${label}`}>{label}</span>
      <div className={styles.segmented} role="group" aria-labelledby={`seg-${label}`}>
        {options.map(([v, text]) => <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}>{text}</button>)}
      </div>
    </div>
  );
}

function AltField({ item, onChange, autoFocus, idPrefix }) {
  const ref = useRef(null);
  useEffect(() => { if (autoFocus) ref.current?.focus(); }, [autoFocus]);
  const missing = item.src && !item.decorative && !item.alt.trim();
  return (
    <>
      <Row label="Alt text (required)" htmlFor={`${idPrefix}-alt`} hint="Describe what the image shows for readers who can't see it.">
        <textarea ref={ref} id={`${idPrefix}-alt`} rows={2} value={item.alt} maxLength={300} disabled={item.decorative} aria-invalid={missing ? 'true' : undefined} className={missing ? styles.invalid : undefined}
          onChange={e => onChange({ alt: e.target.value })} />
      </Row>
      <label className={styles.check}>
        <input type="checkbox" checked={item.decorative} onChange={e => onChange({ decorative: e.target.checked, alt: e.target.checked ? '' : item.alt })} />
        Decorative image (no alt text needed)
      </label>
    </>
  );
}

export default function Inspector({ block, areaId }) {
  const { update, actions, areas, requestUpload, openLibrary, focusAlt, template } = useBuilder();
  if (!block) {
    return (
      <div className={styles.inspEmpty}>
        <h2>Page</h2>
        <p>Select a block on the page to change its settings.</p>
        <p>Template: <strong>{template.name}</strong></p>
        <button type="button" className={styles.btn} onClick={actions.openTemplates}>Change template</button>
        <p className={styles.hintLine}>Tips: drag the ⠿ handle to move a block, or use the arrow buttons. Alt+↑ / Alt+↓ moves the focused block. Ctrl/Cmd+Z undoes.</p>
      </div>
    );
  }
  const set = (patch, key) => update(block.id, patch, key);
  const id = `insp-${block.id}`;
  return (
    <div className={styles.insp}>
      <h2>{BLOCK_LABELS[block.type]} settings</h2>

      {block.type === 'heading' ? (
        <Segmented label="Level" value={String(block.level)} options={[['2', 'Section (H2)'], ['3', 'Sub-section (H3)']]} onChange={v => set({ level: Number(v) })} />
      ) : null}

      {block.type === 'image' ? (
        <>
          <div className={styles.inspRow}>
            <span>Image</span>
            <div className={styles.inline}>
              <button type="button" className={styles.btn} onClick={() => requestUpload(block.id, null)}>{block.src ? 'Replace…' : 'Upload…'}</button>
              <button type="button" className={styles.btn} onClick={() => openLibrary(block.id, null)}>Library</button>
            </div>
          </div>
          {block.src ? <AltField item={block} idPrefix={id} autoFocus={focusAlt === block.id} onChange={patch => set(patch, `img:${block.id}`)} /> : null}
          <Row label="Caption" htmlFor={`${id}-cap`}>
            <input id={`${id}-cap`} value={block.caption} maxLength={300} onChange={e => set({ caption: e.target.value }, `cap:${block.id}`)} />
          </Row>
          <Segmented label="Width" value={block.width} options={[['small', 'Small'], ['medium', 'Medium'], ['full', 'Full']]} onChange={v => set({ width: v })} />
          <Segmented label="Alignment" value={block.align} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} onChange={v => set({ align: v })} />
        </>
      ) : null}

      {block.type === 'imagegrid' ? (
        <>
          <p className={styles.hintLine}>{block.images.length} of {MAX_GRID_IMAGES} images</p>
          {block.images.map((item, i) => (
            <fieldset key={i} className={styles.gridItem}>
              <legend>Image {i + 1}</legend>
              {item.src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.src} alt="" className={styles.thumbMini} />
              ) : null}
              <AltField item={item} idPrefix={`${id}-${i}`} autoFocus={focusAlt === block.id && i === block.images.length - 1} onChange={patch => set({ images: block.images.map((x, j) => (j === i ? { ...x, ...patch } : x)) }, `gi:${block.id}`)} />
              <button type="button" className={styles.btn} onClick={() => set({ images: block.images.filter((_, j) => j !== i) })}>Remove image {i + 1}</button>
            </fieldset>
          ))}
          {block.images.length < MAX_GRID_IMAGES ? (
            <div className={styles.inline}>
              <button type="button" className={styles.btn} onClick={() => requestUpload(block.id, block.images.length)}>Upload image</button>
              <button type="button" className={styles.btn} onClick={() => openLibrary(block.id, block.images.length)}>From library</button>
            </div>
          ) : null}
        </>
      ) : null}

      {block.type === 'callout' ? (
        <Segmented label="Style" value={block.tone} options={[['tip', 'Tip'], ['info', 'Info'], ['warn', 'Warning']]} onChange={v => set({ tone: v, title: block.title === { tip: 'Tip', info: 'Note', warn: 'Warning' }[block.tone] ? { tip: 'Tip', info: 'Note', warn: 'Warning' }[v] : block.title })} />
      ) : null}

      {block.type === 'button' ? (
        <>
          <Row label="Label" htmlFor={`${id}-l`}><input id={`${id}-l`} value={block.label} maxLength={80} onChange={e => set({ label: e.target.value }, `bl:${block.id}`)} /></Row>
          <Row label="Link address" htmlFor={`${id}-h`} hint="https://…, a /page on this site, or mailto:">
            <input id={`${id}-h`} value={block.href} maxLength={2000} onChange={e => set({ href: e.target.value }, `bh:${block.id}`)} />
          </Row>
          <Segmented label="Style" value={block.variant} options={[['primary', 'Solid'], ['secondary', 'Outline']]} onChange={v => set({ variant: v })} />
          <Segmented label="Alignment" value={block.align} options={[['left', 'Left'], ['center', 'Center'], ['right', 'Right']]} onChange={v => set({ align: v })} />
        </>
      ) : null}

      {block.type === 'video' ? (
        <>
          <Row label="YouTube link" htmlFor={`${id}-u`} hint="Only YouTube links are accepted. Shown as a link card.">
            <input id={`${id}-u`} value={block.url} maxLength={300} placeholder="https://www.youtube.com/watch?v=…" aria-invalid={block.url && !youtubeId(block.url) ? 'true' : undefined} onChange={e => set({ url: e.target.value }, `vu:${block.id}`)} />
          </Row>
          {block.url && !youtubeId(block.url) ? <p className={styles.errorText} role="alert">That is not a YouTube link. It will not be saved.</p> : null}
          <Row label="Card title" htmlFor={`${id}-t`}><input id={`${id}-t`} value={block.title} maxLength={120} onChange={e => set({ title: e.target.value }, `vt:${block.id}`)} /></Row>
        </>
      ) : null}

      {block.type === 'table' ? (
        <>
          <label className={styles.check}>
            <input type="checkbox" checked={block.header} onChange={e => set({ header: e.target.checked })} /> First row is a header
          </label>
          <div className={styles.inline}>
            <button type="button" className={styles.btn} disabled={block.rows.length >= MAX_TABLE_ROWS} onClick={() => set({ rows: [...block.rows, Array.from({ length: block.rows[0]?.length || 2 }, () => '')] })}>Add row</button>
            <button type="button" className={styles.btn} disabled={block.rows.length <= 1} onClick={() => set({ rows: block.rows.slice(0, -1) })}>Remove row</button>
          </div>
          <div className={styles.inline}>
            <button type="button" className={styles.btn} disabled={(block.rows[0]?.length || 0) >= MAX_TABLE_COLS} onClick={() => set({ rows: block.rows.map(r => [...r, '']) })}>Add column</button>
            <button type="button" className={styles.btn} disabled={(block.rows[0]?.length || 0) <= 1} onClick={() => set({ rows: block.rows.map(r => r.slice(0, -1)) })}>Remove column</button>
          </div>
          <p className={styles.hintLine}>Click the table to edit its cells.</p>
        </>
      ) : null}

      <div className={styles.inspDivider} />
      <h3>Position</h3>
      {areas.length > 1 ? (
        <Row label="Area" htmlFor={`${id}-area`}>
          <select id={`${id}-area`} value={areaId} onChange={e => actions.moveToArea(block.id, e.target.value)}>
            {areas.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </Row>
      ) : null}
      <div className={styles.inline}>
        <button type="button" className={styles.btn} onClick={() => actions.nudge(block.id, -1)}>Move up</button>
        <button type="button" className={styles.btn} onClick={() => actions.nudge(block.id, 1)}>Move down</button>
      </div>
      <div className={styles.inline}>
        <button type="button" className={styles.btn} onClick={() => actions.duplicate(block.id)}>Duplicate</button>
        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => actions.remove(block.id)}>Delete block</button>
      </div>
    </div>
  );
}

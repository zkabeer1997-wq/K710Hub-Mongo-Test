'use client';

import { BLOCK_LABELS, MAX_GRID_IMAGES, MAX_TABLE_COLS, MAX_TABLE_ROWS } from '../../../lib/guideLayout.mjs';
import { Row, Segmented, VideoLinkField } from './fields';
import { ImageLayoutFields } from './ImageTools';
import { useBuilder } from './BuilderContext';
import styles from './builder.module.css';

export default function Inspector({ block, areaId }) {
  const { update, actions, areas, requestUpload, openLibrary, template } = useBuilder();
  if (!block) {
    return (
      <div className={styles.inspEmpty}>
        <h2>Page</h2>
        <p>Click any block on the page to edit it. Its settings appear here.</p>
        <p>Template: <strong>{template.name}</strong></p>
        <button type="button" className={styles.btn} onClick={actions.openTemplates}>Change template</button>
        <h3>Shortcuts</h3>
        <ul className={styles.shortcutList}>
          <li><kbd>Alt</kbd>+<kbd>↑</kbd>/<kbd>↓</kbd> move the selected block</li>
          <li><kbd>Ctrl/Cmd</kbd>+<kbd>D</kbd> duplicate it</li>
          <li><kbd>Delete</kbd> remove it (you can undo)</li>
          <li><kbd>Ctrl/Cmd</kbd>+<kbd>Z</kbd> undo, <kbd>Shift</kbd>+<kbd>Z</kbd> redo</li>
          <li><kbd>Ctrl/Cmd</kbd>+<kbd>B</kbd>, <kbd>I</kbd>, <kbd>K</kbd> bold, italic, link</li>
          <li><kbd>Ctrl/Cmd</kbd>+<kbd>S</kbd> save</li>
        </ul>
        <button type="button" className={styles.btn} onClick={actions.showTips}>Show the tips again</button>
      </div>
    );
  }
  const set = (patch, key) => update(block.id, patch, key);
  const id = `insp-${block.id}`;
  return (
    <div className={styles.insp}>
      <h2>{BLOCK_LABELS[block.type]} settings</h2>

      {block.type === 'heading' ? (
        <Segmented label="Level" value={String(block.level)} options={[['2', 'Large heading'], ['3', 'Small heading']]} onChange={v => set({ level: Number(v) })} />
      ) : null}

      {block.type === 'image' ? (block.src ? <ImageLayoutFields block={block} /> : (
        <div className={styles.inline}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => requestUpload(block.id, null)}>Upload image</button>
          <button type="button" className={styles.btn} onClick={() => openLibrary(block.id, null)}>Choose from library</button>
        </div>
      )) : null}

      {block.type === 'imagegrid' ? (
        <>
          <p className={styles.hintLine}>{block.images.length} of {MAX_GRID_IMAGES} pictures. Reorder, describe or remove them in the box under the grid on the page.</p>
          {block.images.length < MAX_GRID_IMAGES ? (
            <div className={styles.inline}>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => requestUpload(block.id, block.images.length)}>Add picture</button>
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
          <VideoLinkField block={block} idPrefix={id} preview onChange={patch => set(patch, `v:${block.id}`)} />
          <Row label="Title shown on the play card" htmlFor={`${id}-t`}><input id={`${id}-t`} value={block.title} maxLength={120} onChange={e => set({ title: e.target.value }, `vt:${block.id}`)} /></Row>
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
          <p className={styles.hintLine}>Click a cell on the page to type in it.</p>
        </>
      ) : null}

      <div className={styles.inspDivider} />
      <h3>Position</h3>
      {areas.length > 1 ? (
        <Row label="Part of the page" htmlFor={`${id}-area`}>
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
        <button type="button" className={`${styles.btn} ${styles.btnDanger}`} onClick={() => actions.requestRemove(block.id)}>Delete block</button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BlockView } from '../../guides/GuideBlocks';
import guideStyles from '../../guides/guideLayout.module.css';
import { BLOCK_LABELS, MAX_TABLE_COLS, MAX_TABLE_ROWS } from '../../../lib/guideLayout.mjs';
import { VideoLinkField } from './fields';
import { GridManager, ImageTextFields } from './ImageTools';
import RichTextEditor from './RichTextEditor';
import { useBuilder } from './BuilderContext';
import styles from './builder.module.css';

function AutoTextarea({ value, onChange, className, label, ...rest }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (el) { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; }
  }, [value]);
  return <textarea ref={ref} rows={1} value={value} onChange={onChange} className={className} aria-label={label} {...rest} />;
}

function ImagePlaceholder({ block, index = null }) {
  const { requestUpload, openLibrary, uploads } = useBuilder();
  const up = uploads[block.id];
  return (
    <div className={styles.dropZone} data-busy={up && !up.error ? 'true' : undefined}>
      {up && !up.error ? (
        <div className={styles.progressWrap} role="status">
          <span>Uploading {up.name}…</span>
          <progress value={Math.round(up.progress * 100)} max="100" aria-label="Upload progress" />
        </div>
      ) : (
        <>
          <strong>Drop a picture here</strong>
          <span>or choose one. JPG, PNG, WebP or GIF, up to 3 MB.</span>
          <span className={styles.dropButtons}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={e => { e.stopPropagation(); requestUpload(block.id, index); }}>Upload image</button>
            <button type="button" className={styles.btn} onClick={e => { e.stopPropagation(); openLibrary(block.id, index); }}>Choose from library</button>
          </span>
        </>
      )}
      {up?.error ? <p className={styles.errorText} role="alert">{up.error}</p> : null}
    </div>
  );
}

function needsAlt(item) { return item.src && !item.decorative && !String(item.alt || '').trim(); }

function TableEditor({ block }) {
  const { update } = useBuilder();
  const rows = block.rows;
  const cols = rows[0]?.length || 0;
  const set = next => update(block.id, { rows: next });
  return (
    <div className={styles.tableEdit} onClick={e => e.stopPropagation()}>
      <div className={guideStyles.tableWrap}>
        <table className={guideStyles.table}>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri} data-header={block.header && ri === 0 ? 'true' : undefined}>
                {row.map((cell, ci) => (
                  <td key={ci}>
                    <input className={styles.cellInput} aria-label={`Row ${ri + 1}, column ${ci + 1}${block.header && ri === 0 ? ' (header)' : ''}`} value={cell} maxLength={300}
                      style={block.header && ri === 0 ? { fontWeight: 700 } : undefined}
                      onChange={e => update(block.id, { rows: rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? e.target.value : c)) : r)) }, `cell:${block.id}`)} />
                  </td>
                ))}
                <td className={styles.rowTool}>
                  <button type="button" className={`${styles.barBtn} ${styles.barDanger}`} disabled={rows.length <= 1} aria-label={`Remove row ${ri + 1}`} title="Remove this row" onClick={() => set(rows.filter((_, i) => i !== ri))}>✕</button>
                </td>
              </tr>
            ))}
            <tr className={styles.colTools}>
              {Array.from({ length: cols }, (_, ci) => (
                <td key={ci}><button type="button" className={`${styles.barBtn} ${styles.barDanger}`} disabled={cols <= 1} aria-label={`Remove column ${ci + 1}`} title="Remove this column" onClick={() => set(rows.map(r => r.filter((_, j) => j !== ci)))}>✕ column</button></td>
              ))}
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <div className={styles.inline}>
        <button type="button" className={styles.btn} disabled={rows.length >= MAX_TABLE_ROWS} onClick={() => set([...rows, Array.from({ length: cols || 2 }, () => '')])}>+ Row</button>
        <button type="button" className={styles.btn} disabled={cols >= MAX_TABLE_COLS} onClick={() => set(rows.map(r => [...r, '']))}>+ Column</button>
        <label className={styles.check} style={{ margin: 0 }}>
          <input type="checkbox" checked={block.header} onChange={e => update(block.id, { header: e.target.checked })} /> First row is a header
        </label>
      </div>
      <p className={styles.hintLine}>Click a cell and type. Tab moves to the next cell.</p>
    </div>
  );
}

function BlockBody({ block, selected }) {
  const { update, uploads, actions } = useBuilder();
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 3 ? 'h3' : 'h2';
      return (
        <Tag className={`${guideStyles.heading} ${styles.headingEdit}`} data-level={block.level}>
          <AutoTextarea className={styles.headingInput} label={`Heading text (level ${block.level})`} value={block.text} maxLength={200} placeholder="Type a heading" onChange={e => update(block.id, { text: e.target.value.replace(/\n/g, ' ') }, `h:${block.id}`)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); actions.addAt('text', actions.areaOf(block.id), actions.indexOf(block.id) + 1); } }} />
        </Tag>
      );
    }
    case 'text': return <RichTextEditor block={block} selected={selected} />;
    case 'image':
      if (!block.src) return <ImagePlaceholder block={block} />;
      return (
        <div className={styles.imgWrap}>
          <BlockView block={block} />
          {uploads[block.id] && !uploads[block.id].error ? <div className={styles.imgBusy}>Uploading…</div> : null}
          {uploads[block.id]?.error ? <p className={styles.errorText} role="alert">{uploads[block.id].error}</p> : null}
          {needsAlt(block) && !selected ? <p className={styles.altWarn}>This picture needs a description for readers who cannot see it. Click the block to add one.</p> : null}
          {selected ? <ImageTextFields block={block} idPrefix={`cv-${block.id}`} /> : null}
        </div>
      );
    case 'imagegrid': {
      const empty = !block.images.some(i => i.src);
      return (
        <div>
          {empty ? <ImagePlaceholder block={block} index={0} /> : <BlockView block={block} />}
          {uploads[block.id]?.error && !empty ? <p className={styles.errorText} role="alert">{uploads[block.id].error}</p> : null}
          {!selected && block.images.some(needsAlt) ? <p className={styles.altWarn}>Some pictures need a description. Click the block to add them.</p> : null}
          {selected && !empty ? <GridManager block={block} /> : null}
          {selected && empty ? null : null}
        </div>
      );
    }
    case 'callout':
      if (!selected) return <BlockView block={block} />;
      return (
        <div className={styles.calloutEdit} data-tone={block.tone}>
          <input className={styles.calloutTitleInput} aria-label="Callout title" value={block.title} maxLength={120} placeholder="Title" onChange={e => update(block.id, { title: e.target.value }, `ct:${block.id}`)} />
          <RichTextEditor block={block} selected field="md" label="Callout text" />
        </div>
      );
    case 'divider': return <BlockView block={block} />;
    case 'button':
      if (!block.href || !block.label) return <p className={styles.placeholder}>Button: type its label and link in the panel on the right.</p>;
      return <BlockView block={block} />;
    case 'video':
      return (
        <div>
          {block.provider ? <BlockView block={block} /> : <p className={styles.placeholder}>Video: paste a YouTube or Google Drive link below.</p>}
          {selected ? <div className={styles.videoCanvasField} onClick={e => e.stopPropagation()}><VideoLinkField block={block} help={false} idPrefix={`cv-${block.id}`} onChange={patch => update(block.id, patch, `v:${block.id}`)} /></div> : null}
        </div>
      );
    case 'table':
      if (!selected) return block.rows.length ? <BlockView block={block} /> : <p className={styles.placeholder}>Empty table.</p>;
      return <TableEditor block={block} />;
    default: return null;
  }
}

export default function SortableBlock({ block, index, areaId }) {
  const { selectedId, select, actions, areas } = useBuilder();
  const selected = selectedId === block.id;
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: block.id, data: { kind: 'block', areaId } });
  const label = BLOCK_LABELS[block.type];
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`${guideStyles.block} ${styles.blockShell}`}
      data-selected={selected ? 'true' : undefined}
      data-dragging={isDragging ? 'true' : undefined}
      data-block-id={block.id}
      data-block-type={block.type}
      role="group"
      aria-label={`${label} block`}
      tabIndex={0}
      onClick={() => select(block.id)}
      onClickCapture={e => { if (e.target.closest('a') && !e.target.closest('[data-allow-link]')) e.preventDefault(); }}
      onFocus={e => { if (e.target === e.currentTarget) select(block.id); }}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        const mod = e.metaKey || e.ctrlKey;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actions.requestRemove(block.id); }
        else if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); actions.nudge(block.id, -1); }
        else if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); actions.nudge(block.id, 1); }
        else if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); actions.duplicate(block.id); }
        else if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.querySelector('[contenteditable], input, textarea')?.focus(); }
        else if (e.key === 'Escape') { select(null); }
      }}
    >
      <div className={styles.blockBar}>
        <button type="button" ref={setActivatorNodeRef} className={styles.handle} aria-label={`Drag to move this ${label.toLowerCase()} block. Or focus it and press Space, then the arrow keys.`} title={`Drag to move this ${label.toLowerCase()} block`} {...attributes} {...listeners}>⠿</button>
        <button type="button" className={styles.barBtn} aria-label={`Move ${label.toLowerCase()} block up`} title="Move up (Alt+↑)" onClick={e => { e.stopPropagation(); actions.nudge(block.id, -1); }}>↑</button>
        <button type="button" className={styles.barBtn} aria-label={`Move ${label.toLowerCase()} block down`} title="Move down (Alt+↓)" onClick={e => { e.stopPropagation(); actions.nudge(block.id, 1); }}>↓</button>
        {areas.length > 1 ? (
          <select className={styles.barSelect} aria-label={`Move ${label.toLowerCase()} block to another part of the page`} title="Move to another part of the page" value={areaId} onClick={e => e.stopPropagation()} onChange={e => actions.moveToArea(block.id, e.target.value)}>
            {areas.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        ) : null}
        <button type="button" className={styles.barBtn} aria-label={`Duplicate ${label.toLowerCase()} block`} title="Duplicate (Ctrl/Cmd+D)" onClick={e => { e.stopPropagation(); actions.duplicate(block.id); }}>⧉</button>
        <button type="button" className={`${styles.barBtn} ${styles.settingsOnly}`} aria-label={`Open ${label.toLowerCase()} settings`} title="Settings" onClick={e => { e.stopPropagation(); actions.openSettings(); }}>⚙</button>
        <button type="button" className={`${styles.barBtn} ${styles.barDanger}`} aria-label={`Delete ${label.toLowerCase()} block`} title="Delete (Delete key)" onClick={e => { e.stopPropagation(); actions.requestRemove(block.id); }}>✕</button>
      </div>
      <div className={styles.blockContent} data-index={index}>
        <BlockBody block={block} selected={selected} />
      </div>
    </div>
  );
}

export { BlockBody };

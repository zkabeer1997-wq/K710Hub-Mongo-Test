'use client';

import { useEffect, useRef } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { BlockView } from '../../guides/GuideBlocks';
import GuideMarkdown from '../../guides/GuideMarkdown';
import guideStyles from '../../guides/guideLayout.module.css';
import { BLOCK_LABELS, youtubeId } from '../../../lib/guideLayout.mjs';
import { makeLink, toggleList, wrapSelection } from '../../../lib/guideTextFormat.mjs';
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

function Toolbar({ taRef, block }) {
  const { update } = useBuilder();
  const apply = fn => {
    const el = taRef.current;
    if (!el) return;
    const out = fn(el.value, el.selectionStart, el.selectionEnd);
    update(block.id, { md: out.value }, `fmt:${block.id}`);
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(out.start, out.end); });
  };
  const link = () => {
    const url = window.prompt('Link address (https://…)', 'https://');
    if (url && /^(https?:\/\/|mailto:|\/)/i.test(url.trim())) apply((v, s, e) => makeLink(v, s, e, url.trim()));
  };
  return (
    <div className={styles.rtToolbar} role="toolbar" aria-label="Text formatting">
      <button type="button" aria-label="Bold" title="Bold" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '**'))}><b>B</b></button>
      <button type="button" aria-label="Italic" title="Italic" onClick={() => apply((v, s, e) => wrapSelection(v, s, e, '*'))}><i>I</i></button>
      <button type="button" aria-label="Add link" title="Link" onClick={link}>Link</button>
      <button type="button" aria-label="Bulleted list" title="Bulleted list" onClick={() => apply((v, s, e) => toggleList(v, s, e, false))}>• List</button>
      <button type="button" aria-label="Numbered list" title="Numbered list" onClick={() => apply((v, s, e) => toggleList(v, s, e, true))}>1. List</button>
    </div>
  );
}

function RichText({ block, selected, field = 'md', label = 'Text' }) {
  const { update } = useBuilder();
  const ref = useRef(null);
  const value = block[field];
  if (!selected) {
    return value.trim() ? <div className={guideStyles.prose}><GuideMarkdown>{value}</GuideMarkdown></div> : <p className={styles.placeholder}>Empty {label.toLowerCase()} - click to write.</p>;
  }
  return (
    <div className={styles.rtWrap}>
      <Toolbar taRef={ref} block={block} />
      <textarea
        ref={ref}
        className={styles.rtArea}
        aria-label={`${label} (supports **bold**, *italic*, links and lists)`}
        value={value}
        rows={5}
        maxLength={30000}
        onChange={e => update(block.id, { [field]: e.target.value }, `md:${block.id}`)}
      />
      {value.trim() ? <div className={styles.rtPreviewLabel}>Preview</div> : null}
      {value.trim() ? <div className={`${guideStyles.prose} ${styles.rtPreview}`}><GuideMarkdown>{value}</GuideMarkdown></div> : null}
    </div>
  );
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
          <strong>Drop an image here</strong>
          <span>JPG, PNG, WebP or GIF up to 3 MB</span>
          <span className={styles.dropButtons}>
            <button type="button" className={styles.btn} onClick={() => requestUpload(block.id, index)}>Upload image</button>
            <button type="button" className={styles.btn} onClick={() => openLibrary(block.id, index)}>Choose from library</button>
          </span>
        </>
      )}
      {up?.error ? <p className={styles.errorText} role="alert">{up.error}</p> : null}
    </div>
  );
}

function needsAlt(item) { return item.src && !item.decorative && !String(item.alt || '').trim(); }

function BlockBody({ block, selected }) {
  const { update, uploads } = useBuilder();
  switch (block.type) {
    case 'heading': {
      const Tag = block.level === 3 ? 'h3' : 'h2';
      return (
        <Tag className={`${guideStyles.heading} ${styles.headingEdit}`} data-level={block.level}>
          <AutoTextarea className={styles.headingInput} label={`Heading text (level ${block.level})`} value={block.text} maxLength={200} placeholder="Heading" onChange={e => update(block.id, { text: e.target.value.replace(/\n/g, ' ') }, `h:${block.id}`)} />
        </Tag>
      );
    }
    case 'text': return <RichText block={block} selected={selected} />;
    case 'image':
      if (!block.src) return <ImagePlaceholder block={block} />;
      return (
        <div className={styles.imgWrap}>
          <BlockView block={block} />
          {uploads[block.id] && !uploads[block.id].error ? <div className={styles.imgBusy}>Uploading…</div> : null}
          {needsAlt(block) ? <p className={styles.altWarn}>Add alt text so readers who can&apos;t see this image know what it shows.</p> : null}
        </div>
      );
    case 'imagegrid': {
      const empty = !block.images.some(i => i.src);
      return (
        <div>
          {empty ? <ImagePlaceholder block={block} index={0} /> : <BlockView block={block} />}
          {block.images.some(needsAlt) ? <p className={styles.altWarn}>Some grid images need alt text. Select the block to add it.</p> : null}
          {!empty && block.images.length < 4 ? <p className={styles.hintLine}>Select this block to add more images (up to 4).</p> : null}
        </div>
      );
    }
    case 'callout':
      if (!selected) return <BlockView block={block} />;
      return (
        <div className={styles.calloutEdit} data-tone={block.tone}>
          <input className={styles.calloutTitleInput} aria-label="Callout title" value={block.title} maxLength={120} placeholder="Title" onChange={e => update(block.id, { title: e.target.value }, `ct:${block.id}`)} />
          <RichText block={block} selected field="md" label="Callout text" />
        </div>
      );
    case 'divider': return <BlockView block={block} />;
    case 'button':
      if (!block.href || !block.label) return <p className={styles.placeholder}>Button - set the label and link in the panel on the right.</p>;
      return <BlockView block={block} />;
    case 'video':
      if (!youtubeId(block.url)) return <p className={styles.placeholder}>Video - paste a YouTube link in the panel on the right. It appears as a link card (embedding is blocked by the site security policy).</p>;
      return <BlockView block={block} />;
    case 'table':
      if (!selected) return block.rows.length ? <BlockView block={block} /> : <p className={styles.placeholder}>Empty table.</p>;
      return (
        <div className={guideStyles.tableWrap}>
          <table className={guideStyles.table}>
            <tbody>
              {block.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci}>
                      <input className={styles.cellInput} aria-label={`Row ${ri + 1}, column ${ci + 1}${block.header && ri === 0 ? ' (header)' : ''}`} value={cell} maxLength={300}
                        onChange={e => update(block.id, { rows: block.rows.map((r, i) => (i === ri ? r.map((c, j) => (j === ci ? e.target.value : c)) : r)) }, `cell:${block.id}`)} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
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
      onClickCapture={e => { if (e.target.closest('a')) e.preventDefault(); }}
      onFocus={e => { if (e.target === e.currentTarget) select(block.id); }}
      onKeyDown={e => {
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); actions.remove(block.id); }
        if (e.altKey && e.key === 'ArrowUp') { e.preventDefault(); actions.nudge(block.id, -1); }
        if (e.altKey && e.key === 'ArrowDown') { e.preventDefault(); actions.nudge(block.id, 1); }
      }}
    >
      <div className={styles.blockBar}>
        <button type="button" ref={setActivatorNodeRef} className={`${styles.handle}`} aria-label={`Drag to move this ${label.toLowerCase()} block. Or use the arrow buttons.`} title="Drag to move" {...attributes} {...listeners}>⠿</button>
        <span className={styles.blockName}>{label}</span>
        <button type="button" className={styles.barBtn} aria-label={`Move ${label.toLowerCase()} block up`} title="Move up (Alt+↑)" onClick={e => { e.stopPropagation(); actions.nudge(block.id, -1); }}>↑</button>
        <button type="button" className={styles.barBtn} aria-label={`Move ${label.toLowerCase()} block down`} title="Move down (Alt+↓)" onClick={e => { e.stopPropagation(); actions.nudge(block.id, 1); }}>↓</button>
        {areas.length > 1 ? (
          <select className={styles.barSelect} aria-label={`Move ${label.toLowerCase()} block to area`} value={areaId} onClick={e => e.stopPropagation()} onChange={e => actions.moveToArea(block.id, e.target.value)}>
            {areas.map(a => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        ) : null}
        <button type="button" className={styles.barBtn} aria-label={`Duplicate ${label.toLowerCase()} block`} title="Duplicate" onClick={e => { e.stopPropagation(); actions.duplicate(block.id); }}>⧉</button>
        <button type="button" className={`${styles.barBtn} ${styles.barDanger}`} aria-label={`Delete ${label.toLowerCase()} block`} title="Delete" onClick={e => { e.stopPropagation(); actions.remove(block.id); }}>✕</button>
      </div>
      <div className={styles.blockContent} data-index={index}>
        <BlockBody block={block} selected={selected} />
      </div>
    </div>
  );
}

export { BlockBody };

'use client';

import { useState } from 'react';
import { useDraggable } from '@dnd-kit/core';
import { BLOCK_LABELS, BLOCK_TYPES } from '../../../lib/guideLayout.mjs';
import { useBuilder } from './BuilderContext';
import styles from './builder.module.css';

const HINTS = {
  heading: 'Section title (H2 / H3)',
  text: 'Paragraphs, bold, links, lists',
  image: 'One picture with caption',
  imagegrid: '2 to 4 pictures side by side',
  callout: 'Tip, info or warning box',
  divider: 'A thin separator line',
  button: 'A link styled as a button',
  video: 'YouTube link card',
  table: 'Simple rows and columns',
};

function PaletteItem({ type }) {
  const { actions } = useBuilder();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `palette:${type}`, data: { kind: 'palette', type } });
  // Keyboard users add blocks with Enter/Space (click); drag is pointer-only here.
  const { onKeyDown: _ignored, ...pointerListeners } = listeners || {};
  return (
    <button
      type="button"
      ref={setNodeRef}
      className={styles.palItem}
      data-dragging={isDragging ? 'true' : undefined}
      aria-label={`Add ${BLOCK_LABELS[type]} block. Click to add, or drag onto the page.`}
      onClick={() => actions.addFromPalette(type)}
      {...attributes}
      {...pointerListeners}
    >
      <strong>{BLOCK_LABELS[type]}</strong>
      <small>{HINTS[type]}</small>
    </button>
  );
}

function LibraryItem({ item }) {
  const { actions } = useBuilder();
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lib:${item.src}`, data: { kind: 'image', src: item.src } });
  const { onKeyDown: _ignored, ...pointerListeners } = listeners || {};
  return (
    <button type="button" ref={setNodeRef} className={styles.libItem} data-dragging={isDragging ? 'true' : undefined} aria-label="Add this image to the page. Click to add, or drag onto the page." onClick={() => actions.addImage(item.src)} {...attributes} {...pointerListeners}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={item.src} alt="" loading="lazy" draggable={false} />
    </button>
  );
}

export default function Palette({ library, uploads, tab, setTab }) {
  const { requestUpload, libraryError } = useBuilder();
  const [dragOver, setDragOver] = useState(false);
  const busy = Object.values(uploads).filter(u => !u.error);
  return (
    <div className={styles.palette}>
      <div className={styles.palTabs} role="tablist" aria-label="Palette">
        <button type="button" role="tab" id="pal-tab-blocks" aria-controls="pal-panel" aria-selected={tab === 'blocks'} onClick={() => setTab('blocks')}>Blocks</button>
        <button type="button" role="tab" id="pal-tab-images" aria-controls="pal-panel" aria-selected={tab === 'images'} onClick={() => setTab('images')}>Images{library.length ? ` (${library.length})` : ''}</button>
      </div>
      <div id="pal-panel" role="tabpanel" aria-labelledby={`pal-tab-${tab}`} className={styles.palPanel}>
        {tab === 'blocks' ? (
          <>
            <p className={styles.hintLine}>Click a block to add it, or drag it onto an area of the page.</p>
            <div className={styles.palList}>{BLOCK_TYPES.map(type => <PaletteItem key={type} type={type} />)}</div>
          </>
        ) : (
          <>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => requestUpload(null, null)}>Upload images…</button>
            <div
              className={styles.libDrop}
              data-over={dragOver ? 'true' : undefined}
              onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setDragOver(true); } }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { setDragOver(false); if (e.dataTransfer.files?.length) { e.preventDefault(); e.stopPropagation(); requestUpload(null, null, [...e.dataTransfer.files]); } }}
            >
              Drop image files here to upload. JPG, PNG, WebP, GIF - up to 3 MB.
            </div>
            {busy.map((u, i) => <div key={i} className={styles.progressWrap} role="status"><span>Uploading {u.name}…</span><progress value={Math.round(u.progress * 100)} max="100" /></div>)}
            {libraryError ? <p className={styles.errorText} role="alert">{libraryError}</p> : null}
            {library.length ? (
              <div className={styles.libGrid}>{library.map(item => <LibraryItem key={item.src} item={item} />)}</div>
            ) : <p className={styles.hintLine}>No images yet. Uploaded and used images appear here.</p>}
          </>
        )}
      </div>
    </div>
  );
}

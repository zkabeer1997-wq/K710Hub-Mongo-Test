'use client';

import { useEffect, useRef, useState } from 'react';
import { useDroppable } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { BLOCK_LABELS, BLOCK_TYPES } from '../../../lib/guideLayout.mjs';
import { BLOCK_HINTS } from './blockHints';
import SortableBlock from './BlockEditors';
import { useBuilder } from './BuilderContext';
import styles from './builder.module.css';

export const areaDropId = id => `area:${id}`;

// Small popover listing every block type in plain words.
export function BlockMenu({ onPick, onClose, label = 'Add a block' }) {
  const ref = useRef(null);
  useEffect(() => {
    ref.current?.querySelector('button')?.focus();
    const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('pointerdown', onDown, true);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); };
  }, [onClose]);
  return (
    <div className={styles.blockMenu} ref={ref} role="menu" aria-label={label}>
      {BLOCK_TYPES.map(type => (
        <button key={type} type="button" role="menuitem" className={styles.blockMenuItem} onClick={() => { onPick(type); onClose(); }}>
          <strong>{BLOCK_LABELS[type]}</strong>
          <small>{BLOCK_HINTS[type]}</small>
        </button>
      ))}
    </div>
  );
}

// The "+" between blocks (shown on hover or keyboard focus).
function InsertSlot({ areaId, index, last }) {
  const { actions } = useBuilder();
  const [open, setOpen] = useState(false);
  return (
    <div className={styles.slot} data-open={open ? 'true' : undefined} data-last={last ? 'true' : undefined}>
      <button type="button" className={styles.slotBtn} aria-label={`Add a block ${last ? 'at the end' : 'here'}`} aria-haspopup="menu" aria-expanded={open} title="Add a block here" onClick={() => setOpen(o => !o)}>+</button>
      {open ? <BlockMenu onClose={() => setOpen(false)} onPick={type => actions.addAt(type, areaId, index)} /> : null}
    </div>
  );
}

export default function AreaDrop({ area, blocks, activeKind }) {
  const { actions } = useBuilder();
  const [menu, setMenu] = useState(false);
  const { setNodeRef, isOver } = useDroppable({ id: areaDropId(area.id), data: { kind: 'area', areaId: area.id } });
  return (
    <section
      ref={setNodeRef}
      className={styles.areaShell}
      data-area-drop={area.id}
      data-over={isOver ? 'true' : undefined}
      data-armed={activeKind ? 'true' : undefined}
      aria-label={`${area.label} area`}
    >
      <span className={styles.areaLabel}>{area.label}</span>
      <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
        {blocks.map((block, index) => (
          <div key={block.id}>
            {index > 0 ? <InsertSlot areaId={area.id} index={index} /> : null}
            <SortableBlock block={block} index={index} areaId={area.id} />
          </div>
        ))}
      </SortableContext>
      {blocks.length === 0 ? (
        <div className={styles.areaEmpty} data-testid="empty-area">
          <strong>Drop a block here</strong>
          <span>Drag a block here, or add one now.</span>
          <span className={styles.menuAnchor}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} aria-haspopup="menu" aria-expanded={menu} onClick={() => setMenu(m => !m)}>Add block</button>
            {menu ? <BlockMenu onClose={() => setMenu(false)} onPick={type => actions.addAt(type, area.id, 0)} /> : null}
          </span>
        </div>
      ) : <InsertSlot areaId={area.id} index={blocks.length} last />}
    </section>
  );
}

'use client';

import { useEffect } from 'react';

// Phone layout helper for tables marked `stack-table`. The CSS (admin-panel.css for
// admin, comfort.css "stack tables" for member pages) turns each row into a stacked card
// and prints `data-label` before every cell. This component only copies the column
// header text onto each <td> as data-label, so the pages keep rendering plain tables
// with no per-cell changes. It watches the DOM so sorted / filtered / reloaded rows
// are labelled too. Renders nothing.
function headerLabels(table) {
  const head = table.tHead?.rows?.[0];
  if (!head) return [];
  const labels = [];
  for (const cell of head.cells) {
    const text = (cell.getAttribute('data-stack-label') ?? cell.textContent ?? '').replace(/[↑↓▲▼]/g, '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < (cell.colSpan || 1); i += 1) labels.push(text);
  }
  return labels;
}

function labelTables(root) {
  root.querySelectorAll('table.stack-table').forEach((table) => {
    const labels = headerLabels(table);
    if (!labels.length) return;
    for (const body of table.tBodies) {
      for (const row of body.rows) {
        let col = 0;
        for (const cell of row.cells) {
          if ((cell.colSpan || 1) > 1) { cell.removeAttribute('data-label'); col += cell.colSpan; continue; }
          const label = labels[col] || '';
          if (label) { if (cell.getAttribute('data-label') !== label) cell.setAttribute('data-label', label); } else cell.removeAttribute('data-label');
          col += 1;
        }
      }
    }
  });
}

export default function StackTableLabels() {
  useEffect(() => {
    let frame = 0;
    const run = () => { frame = 0; labelTables(document); };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(run); };
    run();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, []);
  return null;
}

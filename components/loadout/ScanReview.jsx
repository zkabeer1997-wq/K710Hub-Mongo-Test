'use client';

import { useEffect, useRef, useState } from 'react';
import LoadoutArt from './LoadoutArt';
import { CharmGem } from './LoadoutIcons';
import { CharmLevelSelect, QualitySelect, StarsSelect, TierSelect } from './LoadoutFields';
import { charmImageFor, gearCaption, gearImageFor, LOADOUT_PIECES } from '../../lib/loadout.mjs';
import { applyReview, currentValue, pendingRows, summarize } from '../../lib/scan/review.mjs';

const PIECES = new Map(LOADOUT_PIECES.map((p) => [p.id, p]));

function RowArt({ row, value }) {
  const piece = PIECES.get(row.pieceId);
  if (row.kind === 'gear') {
    const src = gearImageFor(row.boardKey, value);
    return (
      <span className="lo-rv-art" data-kind="gear">
        <LoadoutArt src={src} alt="" className="lo-rv-img" fallback={<span className="lo-rv-blank" aria-hidden="true">{value ? '' : 'None'}</span>} />
      </span>
    );
  }
  const level = value.replace(/^Level\s*/, '');
  return (
    <span className="lo-rv-art" data-kind="charm">
      <LoadoutArt src={charmImageFor(piece.troop, level)} alt="" className="lo-rv-img" fallback={<CharmGem level={level} />} />
    </span>
  );
}

function ReviewRow({ row, value, confirmed, edited, onEdit, onConfirm }) {
  const [open, setOpen] = useState(row.needsCheck);
  const blocked = row.needsCheck && !confirmed && !edited;
  const label = row.kind === 'gear' ? gearCaption(value) || 'No gear' : value || 'Not set';
  const fieldId = (f) => `lo-rv-${row.id.replace(':', '-')}-${f}`;
  return (
    <li className="lo-rv-row" data-check={blocked ? 'true' : undefined}>
      <RowArt row={row} value={value} />
      <div className="lo-rv-main">
        <p className="lo-rv-title">{row.title}</p>
        <p className="lo-rv-value">{label}</p>
        {row.needsCheck ? (
          <span className="lo-rv-badge" data-state={blocked ? 'check' : 'done'}>{blocked ? 'Check this' : edited ? 'Fixed by you' : 'Confirmed'}</span>
        ) : null}
        {row.readValue === '' && !edited ? <p className="lo-rv-hint">We could not read this one.</p> : null}
      </div>
      {open ? (
        <div className="lo-rv-edit">
          {row.alternatives.length > 0 ? (
            <div className="lo-rv-alts">
              <span>Could also be:</span>
              {row.alternatives.map((alt) => (
                <button key={alt} type="button" className="lo-btn lo-btn-secondary" onClick={() => onEdit(row, alt)}>
                  {row.kind === 'gear' ? gearCaption(alt) : alt}
                </button>
              ))}
            </div>
          ) : null}
          {row.kind === 'gear' ? (
            <div className="lo-rv-fields">
              <label htmlFor={fieldId('q')}>Quality</label>
              <QualitySelect id={fieldId('q')} piece={PIECES.get(row.pieceId)} value={value} onChange={(v) => onEdit(row, v)} />
              <label htmlFor={fieldId('t')}>Tier</label>
              <TierSelect id={fieldId('t')} piece={PIECES.get(row.pieceId)} value={value} onChange={(v) => onEdit(row, v)} />
              <label htmlFor={fieldId('s')}>Stars</label>
              <StarsSelect id={fieldId('s')} piece={PIECES.get(row.pieceId)} value={value} onChange={(v) => onEdit(row, v)} />
            </div>
          ) : (
            <div className="lo-rv-fields">
              <label htmlFor={fieldId('l')}>Level</label>
              <CharmLevelSelect id={fieldId('l')} value={value} onChange={(v) => onEdit(row, v)} />
            </div>
          )}
          {blocked ? (
            <button type="button" className="lo-btn lo-btn-secondary" onClick={() => onConfirm(row)}>
              {value ? 'This is right' : 'Leave it empty'}
            </button>
          ) : null}
        </div>
      ) : (
        <button type="button" className="lo-btn lo-btn-text" aria-label={`Change ${row.title}`} onClick={() => setOpen(true)}>Change</button>
      )}
    </li>
  );
}

/**
 * Review of a scan: every value read, the unsure ones marked "Check this". "Use these values" stays off until each one is
 * corrected or confirmed. onUse({ gear, charms, corrections }) receives the board maps (stored strings) and the in-memory corrections.
 */
export default function ScanReview({ review, onUse, onCancel }) {
  const heading = useRef(null);
  const [edits, setEdits] = useState({});
  const [confirmed, setConfirmed] = useState({});
  const state = { edits, confirmed };
  const pending = pendingRows(review.rows, state);
  const summary = summarize(review.rows);
  const toCheck = review.rows.filter((r) => r.needsCheck);
  const fine = review.rows.filter((r) => !r.needsCheck);

  useEffect(() => { heading.current?.focus(); }, []);

  function edit(row, value) { setEdits((cur) => ({ ...cur, [row.id]: value })); }
  function confirm(row) { setConfirmed((cur) => ({ ...cur, [row.id]: true })); }
  function use() {
    const out = applyReview(review.rows, state);
    if (out.ok) onUse(out);
  }
  const renderRow = (row) => (
    <ReviewRow
      key={row.id}
      row={row}
      value={currentValue(row, edits)}
      edited={row.id in edits}
      confirmed={Boolean(confirmed[row.id])}
      onEdit={edit}
      onConfirm={confirm}
    />
  );

  return (
    <section className="lo-rv" aria-labelledby="lo-rv-title">
      <h3 id="lo-rv-title" ref={heading} tabIndex={-1} className="lo-rv-heading">Check what we read</h3>
      <p className="lo-count" id="lo-rv-summary">{summary.text}</p>
      {toCheck.length > 0 ? (
        <>
          <h4 className="lo-rv-group">To check ({toCheck.length})</h4>
          <ul className="lo-rv-list">{toCheck.map(renderRow)}</ul>
        </>
      ) : null}
      {fine.length > 0 ? (
        <>
          <h4 className="lo-rv-group">Read confidently ({fine.length})</h4>
          <ul className="lo-rv-list">{fine.map(renderRow)}</ul>
        </>
      ) : null}
      <div className="lo-rv-actions">
        <p id="lo-rv-pending" className="lo-note" role="status" aria-live="polite">
          {pending.length > 0 ? `Check ${pending.length} more ${pending.length === 1 ? 'value' : 'values'} to continue.` : 'All checked. Nothing changes on your board until you press the button.'}
        </p>
        <button type="button" className="lo-btn lo-btn-primary" disabled={pending.length > 0} aria-describedby="lo-rv-pending" onClick={use}>Use these values</button>
        <button type="button" className="lo-btn lo-btn-text" onClick={onCancel}>Cancel</button>
      </div>
    </section>
  );
}

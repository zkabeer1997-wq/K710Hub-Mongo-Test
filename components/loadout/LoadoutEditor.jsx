'use client';

import { useRef, useState } from 'react';
import LoadoutBoard from './LoadoutBoard';
import ScanLauncher from './ScanLauncher';
import ScanReview from './ScanReview';
import { charmAnnouncement, completionText, gearAnnouncement, loadoutSummaryLines } from '../../lib/loadout.mjs';
import './loadout.css';

/**
 * Governor Gear and Charms: the board (popovers are the only editors) over ONE state (the form's gear / charms maps).
 * onGearChange(key, storedValue) / onCharmChange(key, storedValue) / onClear() are owned by the form,
 * which serialises them with the existing lib/powerProfiles.mjs helpers.
 * A screenshot scan is reviewed first; "Use these values" goes through the SAME setters. onScanApplied(corrections) is optional
 * and receives the owner's corrections (kept in memory only; nothing is stored here).
 */
export default function LoadoutEditor({ gear, charms, onGearChange, onCharmChange, onClear, onScanApplied }) {
  const [review, setReview] = useState(null);
  const [active, setActive] = useState(null);
  const [open, setOpen] = useState(null);
  const [announce, setAnnounce] = useState('');
  const [confirming, setConfirming] = useState(false);
  const clearBtn = useRef(null);

  // Board slot -> its small editor (one open at a time). Pressing the open slot again closes it.
  function activate(pieceId, target) {
    setActive({ piece: pieceId, target });
    setOpen((cur) => (cur?.piece === pieceId && cur?.target === target ? null : { piece: pieceId, target }));
  }
  const closePopover = () => setOpen(null);

  function changeGear(piece, value) {
    setActive({ piece: piece.id, target: 'gear' });
    onGearChange(piece.gearKey, value);
    setAnnounce(gearAnnouncement(piece, value));
  }
  function changeCharm(piece, index, key, value) {
    setActive({ piece: piece.id, target: index });
    onCharmChange(key, value);
    setAnnounce(charmAnnouncement(piece, index, value));
  }
  function applyScan({ gear: nextGear, charms: nextCharms, corrections }) {
    for (const [key, value] of Object.entries(nextGear)) onGearChange(key, value);
    for (const [key, value] of Object.entries(nextCharms)) onCharmChange(key, value);
    setReview(null);
    setActive(null);
    setOpen(null);
    setAnnounce('Scan values added to your board. Save when you are ready.');
    onScanApplied?.(corrections);
  }

  function clearAll() {
    onClear();
    setActive(null);
    setOpen(null);
    setConfirming(false);
    setAnnounce('All gear and charms cleared');
    clearBtn.current?.focus();
  }

  return (
    <div className="lo">
      <div className="lo-head">
        <div className="lo-head-copy">
          <p className="lo-help">Tap a gear tile or a charm on the board to set it.</p>
        </div>
        <ScanLauncher onReview={setReview} disabled={Boolean(review)} />
      </div>

      {review ? <ScanReview review={review} onUse={applyScan} onCancel={() => setReview(null)} /> : null}

      <div className="lo-bar" hidden={Boolean(review)}>
        <p className="lo-count" id="lo-count">{completionText(gear, charms)}</p>
        {confirming ? (
          <span className="lo-confirm" role="group" aria-label="Confirm clearing everything">
            <span>Clear all gear and charms?</span>
            <button type="button" className="lo-btn lo-btn-danger" onClick={clearAll}>Yes, clear all</button>
            <button type="button" className="lo-btn lo-btn-text" onClick={() => setConfirming(false)}>Keep</button>
          </span>
        ) : (
          <button ref={clearBtn} type="button" className="lo-btn lo-btn-text" onClick={() => setConfirming(true)}>Clear all</button>
        )}
      </div>

      <div hidden={Boolean(review)}>
      <LoadoutBoard gear={gear} charms={charms} active={active} open={open} onActivate={activate} onClose={closePopover} onGearChange={changeGear} onCharmChange={changeCharm} />
      </div>
      <section className="lo-sr-only" aria-labelledby="lo-summary-title">
        <h4 id="lo-summary-title">Current gear and charms</h4>
        <ul>
          {loadoutSummaryLines(gear, charms).map((line) => <li key={line}>{line}</li>)}
        </ul>
      </section>

      <p className="lo-sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}

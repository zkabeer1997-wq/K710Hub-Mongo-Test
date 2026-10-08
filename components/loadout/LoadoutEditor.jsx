'use client';

import { useRef, useState } from 'react';
import LoadoutBoard from './LoadoutBoard';
import ScanLauncher from './ScanLauncher';
import { charmAnnouncement, completionText, gearAnnouncement, loadoutSummaryLines } from '../../lib/loadout.mjs';
import './loadout.css';

/**
 * Governor Gear and Charms: the board (popovers are the only editors) over ONE state (the form's gear / charms maps).
 * onGearChange(key, storedValue) / onCharmChange(key, storedValue) / onClear() are owned by the form,
 * which serialises them with the existing lib/powerProfiles.mjs helpers.
 */
export default function LoadoutEditor({ gear, charms, onGearChange, onCharmChange, onClear }) {
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
        <ScanLauncher />
      </div>

      <div className="lo-bar">
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

      <LoadoutBoard gear={gear} charms={charms} active={active} open={open} onActivate={activate} onClose={closePopover} onGearChange={changeGear} onCharmChange={changeCharm} />
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

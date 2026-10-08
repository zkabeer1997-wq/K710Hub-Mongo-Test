'use client';

import { useEffect, useRef, useState } from 'react';
import LoadoutBoard from './LoadoutBoard';
import LoadoutTable from './LoadoutTable';
import ScanLauncher from './ScanLauncher';
import { charmAnnouncement, completionText, gearAnnouncement } from '../../lib/loadout.mjs';
import './loadout.css';

/**
 * Governor Gear and Charms: board + table over ONE state (the form's gear / charms maps).
 * onGearChange(key, storedValue) / onCharmChange(key, storedValue) / onClear() are owned by the form,
 * which serialises them with the existing lib/powerProfiles.mjs helpers.
 */
export default function LoadoutEditor({ gear, charms, onGearChange, onCharmChange, onClear }) {
  const [active, setActive] = useState(null);
  const [announce, setAnnounce] = useState('');
  const [confirming, setConfirming] = useState(false);
  const clearBtn = useRef(null);
  const reduce = useRef(false);
  useEffect(() => {
    try { reduce.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
  }, []);

  // Board slot -> its row in the table: focus the first control for that slot and bring it into view.
  function activate(pieceId, target) {
    setActive({ piece: pieceId, target });
    const el = document.getElementById(target === 'gear' ? `lo-gear-${pieceId}` : `lo-charm-${pieceId}-${target}`);
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: 'center', behavior: reduce.current ? 'auto' : 'smooth' });
  }

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
    setConfirming(false);
    setAnnounce('All gear and charms cleared');
    clearBtn.current?.focus();
  }

  return (
    <div className="lo">
      <div className="lo-head">
        <div className="lo-head-copy">
          <h3 className="lo-title">Your Governor Gear and Charms</h3>
          <p className="lo-help">Tap a slot on the board, or use the table below. Both show the same values.</p>
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

      <LoadoutBoard gear={gear} charms={charms} active={active} onActivate={activate} />
      <LoadoutTable gear={gear} charms={charms} active={active} onGearChange={changeGear} onCharmChange={changeCharm} />

      <p className="lo-sr-only" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}

'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CharmLevelSelect, QualitySelect, StarsSelect, TierSelect } from './LoadoutFields';
import LoadoutArt from './LoadoutArt';
import { HAS_GEAR_ART, charmImageFor, gearImageFor, placePopover } from '../../lib/loadout.mjs';

/**
 * Small non-modal editor anchored to a board slot (bottom sheet on phones, see loadout.css).
 * target 'gear' -> Quality / Tier / Stars / Clear; a number -> that charm's Level.
 * Focus moves in on open; Escape / Done / outside click / focus leaving close it. Escape and Done return focus to the slot.
 * Positioned with JS measurement (fixed coordinates, flipped and clamped by placePopover) so it works in every browser.
 */
export default function LoadoutPopover({ piece, target, anchorId, gear, charms, onGearChange, onCharmChange, onClose }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  const isGear = target === 'gear';
  const titleId = `lo-pop-title-${piece.id}-${isGear ? 'gear' : target}`;
  const title = isGear ? `${piece.troopName} ${piece.name.toLowerCase()}` : `${piece.troopName} ${piece.name.toLowerCase()} charm ${target + 1}`;
  const value = gear[piece.gearKey] || '';
  const previewSrc = isGear ? gearImageFor(piece.gearKey, value) : charmImageFor(piece.troop, charms[piece.charmKeys[target]]);

  function close(returnFocus) {
    onClose();
    if (returnFocus) document.getElementById(anchorId)?.focus();
  }

  // Measure and place; re-run on scroll/resize so it stays glued to the slot.
  useLayoutEffect(() => {
    const place = () => {
      const el = ref.current;
      const anchorEl = document.getElementById(anchorId);
      if (!el || !anchorEl) return;
      const a = anchorEl.getBoundingClientRect();
      const result = placePopover({
        anchor: { left: a.left, top: a.top, right: a.right, bottom: a.bottom },
        size: { width: el.offsetWidth, height: el.offsetHeight },
        viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
      });
      setPos(result);
    };
    place();
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => { window.removeEventListener('resize', place); window.removeEventListener('scroll', place, true); };
  }, [anchorId]);

  // Focus the first control on open; close on a press outside (the slot itself toggles via its own click).
  useEffect(() => {
    const onDown = (e) => {
      if (ref.current?.contains(e.target) || document.getElementById(anchorId)?.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anchorId]);

  // The popover is visibility:hidden until placed, and hidden elements cannot take focus: focus once it is ready.
  const focused = useRef(false);
  useEffect(() => {
    if (!pos || focused.current) return;
    focused.current = true;
    const el = ref.current?.querySelector('select');
    el?.focus({ preventScroll: true });
  }, [pos]);

  function onKeyDown(e) {
    if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(true); }
  }
  function onBlur(e) {
    const next = e.relatedTarget;
    if (!next) return; // pointer presses are handled above; a null target is the window losing focus
    if (ref.current?.contains(next) || next.id === anchorId) return;
    onClose();
  }

  const style = pos && pos.placement !== 'sheet' ? { left: pos.left, top: pos.top } : undefined;
  return (
    <div
      ref={ref}
      className="lo-pop"
      role="dialog"
      aria-labelledby={titleId}
      data-placement={pos?.placement || 'below'}
      data-ready={pos ? 'true' : undefined}
      style={style}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
    >
      <p className="lo-pop-title" id={titleId}>{title}</p>
      {!isGear || HAS_GEAR_ART[piece.gearKey] ? (
        <div className="lo-pop-preview" data-empty={previewSrc ? undefined : 'true'}>
          <LoadoutArt src={previewSrc} alt={isGear ? `${title} preview` : `${title} level ${String(charms[piece.charmKeys[target]]).replace(/^Level\s*/, '')} preview`} className="lo-pop-art" />
          {previewSrc ? null : <span className="lo-pop-preview-note">{isGear ? 'No gear' : 'Not set'}</span>}
        </div>
      ) : null}
      {isGear ? (
        <div className="lo-pop-fields">
          <label className="lo-pop-field">
            <span>Quality</span>
            <QualitySelect piece={piece} value={value} onChange={(v) => onGearChange(piece, v)} />
          </label>
          <label className="lo-pop-field">
            <span>Tier</span>
            <TierSelect piece={piece} value={value} onChange={(v) => onGearChange(piece, v)} />
          </label>
          <label className="lo-pop-field">
            <span>Stars</span>
            <StarsSelect piece={piece} value={value} onChange={(v) => onGearChange(piece, v)} />
          </label>
        </div>
      ) : (
        <div className="lo-pop-fields">
          <label className="lo-pop-field">
            <span>Level</span>
            <CharmLevelSelect value={charms[piece.charmKeys[target]]} onChange={(v) => onCharmChange(piece, target, piece.charmKeys[target], v)} />
          </label>
        </div>
      )}
      <div className="lo-pop-actions">
        {isGear ? (
          <button type="button" className="lo-btn lo-btn-text" disabled={!value} onClick={() => { onGearChange(piece, ''); ref.current?.querySelector('select')?.focus(); }}>Clear this slot</button>
        ) : <span />}
        <button type="button" className="lo-btn lo-btn-secondary" onClick={() => close(true)}>Done</button>
      </div>
    </div>
  );
}

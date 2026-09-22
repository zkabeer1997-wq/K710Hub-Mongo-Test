'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { lookupDefinition } from '../../lib/glossaryLookup.mjs';

// Small jargon-tooltip trigger. Renders `children` (or the looked-up term's
// own label, if no children are given) with a dotted underline; hover,
// keyboard focus, and tap on touch all reveal a short definition pulled from
// lib/glossary.js. Deliberately not a native `title` attribute — those are
// invisible to touch and inconsistent with keyboard users, which is the
// usability gap this component exists to close.
export default function Term({ term, children, className = '' }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const popoverId = useId();
  // Hover only opens the popover on genuinely hover-capable pointers
  // (mouse/trackpad). Touch devices have no real hover, and browsers
  // simulate mouseenter/click on tap, which would otherwise open-then-
  // immediately-toggle-closed on a single tap. Matches the same
  // `(hover: hover)` guard used for the nav dropdowns.
  const hoverCapableRef = useRef(false);
  useEffect(() => {
    try {
      hoverCapableRef.current = window.matchMedia('(hover: hover)').matches;
    } catch {
      hoverCapableRef.current = false;
    }
  }, []);

  const entry = lookupDefinition(term);

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function handlePointerDown(event) {
      if (!triggerRef.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  // The popover is anchored to the trigger's own left edge, which can be
  // anywhere on a line of text — near either edge of a narrow viewport,
  // that default position pushes it partly off-screen. Clamp it back
  // in-bounds (8px margin) with a horizontal shift after each open/layout,
  // rather than assuming a fixed breakpoint's worth of room.
  useLayoutEffect(() => {
    if (!open || !popoverRef.current) {
      setShift(0);
      return undefined;
    }
    const margin = 8;
    const el = popoverRef.current;
    el.style.transform = 'translateX(0)';
    const rect = el.getBoundingClientRect();
    let delta = 0;
    if (rect.left < margin) delta = margin - rect.left;
    else if (rect.right > window.innerWidth - margin) delta = window.innerWidth - margin - rect.right;
    setShift(delta);
    return undefined;
  }, [open]);

  // No definition found (typo, term not yet in the glossary) — render plain
  // text rather than a tooltip trigger that would open empty.
  if (!entry) return <>{children ?? term}</>;

  function handleClick(event) {
    event.stopPropagation();
    // On hover-capable pointers, hover already drives open/closed and a
    // click there is incidental (e.g. after a keyboard Enter). On touch,
    // there is no hover, so click is the only signal — toggle it there.
    if (hoverCapableRef.current) return;
    setOpen((value) => !value);
  }

  function handleMouseEnter() {
    if (hoverCapableRef.current) setOpen(true);
  }
  function handleMouseLeave() {
    if (hoverCapableRef.current) setOpen(false);
  }
  function handleFocus(event) {
    // A tap on touch also focuses the button (no real keyboard involved).
    // Only auto-open on a genuine keyboard focus (:focus-visible) so a tap
    // doesn't get opened-by-focus and then immediately closed-by-click —
    // touch relies solely on the click toggle below.
    try {
      if (event.target.matches(':focus-visible')) setOpen(true);
    } catch {
      setOpen(true);
    }
  }
  function handleBlur() {
    setOpen(false);
  }

  return (
    <span className="ui-term">
      <button
        type="button"
        ref={triggerRef}
        className={`ui-term-trigger ${className}`}
        aria-describedby={open ? popoverId : undefined}
        aria-expanded={open}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onFocus={handleFocus}
        onBlur={handleBlur}
      >
        {children ?? entry.term}
      </button>
      {open && (
        <span
          role="tooltip"
          id={popoverId}
          ref={popoverRef}
          className="ui-term-popover"
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        >
          {entry.definition}
        </span>
      )}
    </span>
  );
}

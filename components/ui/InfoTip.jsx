'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';

// Small inline-help affordance: a "?" button that toggles a short explanatory
// popover. Built for dense calculator forms where a field or section label
// needs a plain-language gloss without permanently spending vertical space.
//
// Deliberately click/tap-toggled (not hover) so it behaves the same on touch,
// mouse and keyboard — a help icon is an intentional "tell me more", unlike the
// incidental hover reveal used by <Term> for inline jargon. Accessible: a real
// <button> with aria-expanded + aria-describedby, Escape closes and returns
// focus, outside pointer/keyboard dismiss, and the reveal animation is dropped
// under prefers-reduced-motion (see .ui-infotip-popover in primitives.css).
export default function InfoTip({ label = 'More information', className = '', children }) {
  const [open, setOpen] = useState(false);
  const [shift, setShift] = useState(0);
  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const popoverId = useId();

  useEffect(() => {
    if (!open) return undefined;
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    function handlePointerDown(event) {
      if (
        !triggerRef.current?.contains(event.target) &&
        !popoverRef.current?.contains(event.target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('pointerdown', handlePointerDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('pointerdown', handlePointerDown);
    };
  }, [open]);

  // The popover is anchored to the trigger, which can sit anywhere on a line —
  // near either viewport edge the default position spills off-screen. Clamp it
  // back in-bounds (8px margin) with a horizontal shift after each open, the
  // same approach as <Term>.
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

  return (
    <span className="ui-infotip">
      <button
        type="button"
        ref={triggerRef}
        className={`ui-infotip-trigger ${className}`.trim()}
        aria-label={label}
        aria-describedby={open ? popoverId : undefined}
        aria-expanded={open}
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
      >
        <span aria-hidden="true">?</span>
      </button>
      {open && (
        <span
          role="tooltip"
          id={popoverId}
          ref={popoverRef}
          className="ui-infotip-popover"
          style={shift ? { transform: `translateX(${shift}px)` } : undefined}
        >
          {children}
        </span>
      )}
    </span>
  );
}

'use client';

import { useEffect, useId, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Modal / right-side drawer with a focus trap, Esc to close and focus return.
export default function AdminDialog({ open, title, onClose, children, footer, variant = 'modal', busy = false, role = 'dialog' }) {
  const ref = useRef(null);
  const titleId = useId();
  const returnRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    returnRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const first = ref.current?.querySelector('[data-autofocus]') || ref.current?.querySelector(FOCUSABLE);
    first?.focus();
    function onKeyDown(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        if (!busy) onClose();
        return;
      }
      if (event.key !== 'Tab') return;
      const nodes = Array.from(ref.current?.querySelectorAll(FOCUSABLE) || []);
      if (!nodes.length) return;
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === firstNode || !nodes.includes(active))) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && (active === lastNode || !nodes.includes(active))) {
        event.preventDefault();
        firstNode.focus();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = prevOverflow;
      document.removeEventListener('keydown', onKeyDown);
      if (returnRef.current && document.contains(returnRef.current)) returnRef.current.focus();
    };
  }, [open, busy, onClose]);

  if (!open) return null;
  return (
    <div className={`ec-overlay ec-overlay-${variant}`} role="presentation" onClick={() => { if (!busy) onClose(); }}>
      <div
        ref={ref}
        className={`ec-dialog ec-dialog-${variant}`}
        role={role}
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ec-dialog-head">
          <h2 id={titleId}>{title}</h2>
          <button type="button" className="ec-dialog-close" onClick={onClose} disabled={busy} aria-label="Close">&times;</button>
        </div>
        <div className="ec-dialog-body">{children}</div>
        {footer ? <div className="ec-dialog-foot">{footer}</div> : null}
      </div>
    </div>
  );
}

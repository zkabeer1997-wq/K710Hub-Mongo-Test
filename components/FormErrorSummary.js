'use client';

import { useEffect, useRef } from 'react';
import { useT } from './i18n/LanguageProvider';

/** Focuses the field (or the first control inside a group) with the given id. */
export function focusFieldById(id) {
  const el = typeof document === 'undefined' ? null : document.getElementById(id);
  if (!el) return false;
  const target = el.matches('input, select, textarea, button') ? el : el.querySelector('input, select, textarea, button') || el;
  if (target !== el && !el.hasAttribute('tabindex')) { /* group wrapper: focus inner control */ }
  target.focus();
  target.scrollIntoView?.({ block: 'center', behavior: 'auto' });
  return true;
}

/**
 * Error summary shown when Next/Submit fails validation. Moves focus to the
 * summary (role=alert) whenever `focusSignal` changes; each entry links to
 * its field via an anchor that focuses the field instead of just scrolling.
 *
 * errors: [{ id: 'field-dom-id', message: 'text' }]
 */
export default function FormErrorSummary({ errors, focusSignal = 0, id = 'form-error-summary' }) {
  const ref = useRef(null);
  const t = useT();
  useEffect(() => {
    if (errors.length && focusSignal) ref.current?.focus({ preventScroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusSignal]);
  if (!errors.length) return null;
  return (
    <div id={id} ref={ref} className="status error form-error-summary" role="alert" tabIndex={-1}>
      <strong className="form-error-summary-title">
        {t('form.errors', { count: errors.length })}
      </strong>
      <ul>
        {errors.map((error) => (
          <li key={`${error.id}-${error.message}`}>
            <a
              href={`#${error.id}`}
              onClick={(event) => {
                event.preventDefault();
                focusFieldById(error.id);
              }}
            >
              {error.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

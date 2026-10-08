'use client';

import { useEffect, useState } from 'react';

const KEY = 'k710-easy-view';

function apply(on) {
  if (on) document.documentElement.setAttribute('data-easy', 'true');
  else document.documentElement.removeAttribute('data-easy');
}

// "Easy view": larger text, bigger buttons, no motion, no ticker. The choice
// is remembered on this device only (localStorage), and the page works without it.
export default function EasyViewToggle({ className = '' }) {
  const [on, setOn] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) === '1';
      setOn(saved);
      apply(saved);
    } catch {
      /* storage unavailable: stay in normal view */
    }
  }, []);

  function toggle() {
    const next = !on;
    setOn(next);
    apply(next);
    try {
      localStorage.setItem(KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  }

  return (
    <button
      type="button"
      className={`easy-view-toggle ${className}`.trim()}
      aria-pressed={on}
      onClick={toggle}
      title="Bigger text and simpler pages"
    >
      <span className="easy-view-aa" aria-hidden="true">Aa</span>
      <span className="easy-view-label">Easy view: {on ? 'On' : 'Off'}</span>
    </button>
  );
}

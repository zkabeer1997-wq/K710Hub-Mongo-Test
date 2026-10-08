// Original inline SVG marks for the loadout board. Decorative: callers label the buttons they sit in.

/** Troop mark: horse head = cavalry, shield = infantry, crossbow = archer. */
export function TroopIcon({ troop, className = '' }) {
  const common = {
    viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6,
    strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': 'true', focusable: 'false', className,
  };
  if (troop === 'cavalry') {
    return (
      <svg {...common}>
        <path d="M6 21v-3c0-3 1.5-5 3-7 1-1.4 1.2-2.6 1-4.4L14 3l1.2 2.2c2.4.8 4 3 4 5.8V21z" />
        <path d="M10 6.5 8 5.5M14.5 9.2h.01" />
      </svg>
    );
  }
  if (troop === 'infantry') {
    return (
      <svg {...common}>
        <path d="M12 3 20 6v6c0 4.5-3.2 7.6-8 9-4.8-1.4-8-4.5-8-9V6z" />
        <path d="M12 8v8M8.5 11.5h7" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M3.5 9C8 4.5 16 4.5 20.5 9" />
      <path d="M12 6v15M5 12.5l7-1 7 1" />
      <path d="M9.5 18.5 12 21l2.5-2.5" />
    </svg>
  );
}

/** K710 shield crest (same outline as the site header brand mark), gold on obsidian. */
export function CrestMark({ className = '' }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" focusable="false" className={className}>
      <path d="M20 3 L35 8 V19 C35 28 29 34 20 37 C11 34 5 28 5 19 V8 Z" fill="var(--lo-crest-fill)" stroke="currentColor" strokeWidth="1.2" />
      <path d="M20 7 L31 10.8 V19 C31 25.6 26.8 30.4 20 33 C13.2 30.4 9 25.6 9 19 V10.8 Z" stroke="currentColor" strokeWidth="0.6" opacity="0.55" />
      <text x="20" y="24.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="currentColor" fontFamily="var(--font-display)">710</text>
    </svg>
  );
}

export function StarGlyph({ className = '' }) {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false" className={className}>
      <path d="M10 1.8l2.4 5.2 5.7.6-4.3 3.8 1.2 5.6L10 14.2 5 17l1.2-5.6L1.9 7.6l5.7-.6z" fill="currentColor" />
    </svg>
  );
}

/** Charm gem: a rounded triangle. `level` draws inside; empty = dashed outline. */
export function CharmGem({ level }) {
  return (
    <svg viewBox="0 0 44 40" aria-hidden="true" focusable="false" className="lo-gem">
      <path
        d="M22 3.5 40.5 35.5H3.5z"
        className="lo-gem-shape"
        strokeLinejoin="round"
        strokeWidth="2.4"
      />
      {level ? <text x="22" y="30" textAnchor="middle" className="lo-gem-num">{level}</text> : null}
    </svg>
  );
}

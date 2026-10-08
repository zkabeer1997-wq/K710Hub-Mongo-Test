// Status chip: always icon + text, never colour alone.
const ICONS = {
  open: <path d="M5 12.5 10 17.5 19 7" />,
  upcoming: <><circle cx="12" cy="12" r="8" /><path d="M12 7.5V12l3 2" /></>,
  closed: <><rect x="6" y="11" width="12" height="9" rx="1.5" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></>,
  ended: <path d="M6 20V4M6 5h11l-2 4 2 4H6" />,
  published: <><rect x="4" y="5" width="16" height="15" rx="1.5" /><path d="M4 10h16M9 14l2 2 4-4" /></>,
  warn: <><path d="M12 4 3 20h18L12 4Z" /><path d="M12 10v4M12 17v.5" /></>,
  none: <circle cx="12" cy="12" r="7" />,
};

const TONES = {
  open: 'success',
  published: 'success',
  upcoming: 'info',
  closed: 'neutral',
  ended: 'neutral',
  warn: 'warn',
  none: 'neutral',
};

export default function StatusChip({ kind = 'none', children, className = '' }) {
  return (
    <span className={`ec-chip ec-chip-${TONES[kind] || 'neutral'} ${className}`}>
      <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {ICONS[kind] || ICONS.none}
      </svg>
      <span>{children}</span>
    </span>
  );
}

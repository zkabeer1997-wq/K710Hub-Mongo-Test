import Link from 'next/link';

export const TABS = [
  { id: 'mine', label: 'My appointment' },
  { id: 'schedule', label: 'Schedule' },
];

/** Unknown values fall back to "My appointment". The old ?tab=apply is redirected by the page itself. */
export function normalizeTab(value) {
  return TABS.some((t) => t.id === value) ? value : 'mine';
}

// Each tab is a real link (?tab=...) so it is shareable, works without JS and
// the browser Back button moves between tabs. Not an ARIA tablist on purpose:
// links navigating between URLs are semantically a nav with aria-current.
export default function Tabs({ current }) {
  return (
    <nav className="appt-tabs" aria-label="Appointment sections">
      {TABS.map((tab) => (
        <Link
          key={tab.id}
          href={`/forms/kvk-appointments?tab=${tab.id}`}
          aria-current={tab.id === current ? 'page' : undefined}
          className={tab.id === current ? 'is-current' : ''}
          scroll={false}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}

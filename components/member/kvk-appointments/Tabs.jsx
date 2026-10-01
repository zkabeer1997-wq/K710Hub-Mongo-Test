import Link from 'next/link';

export const TABS = [
  { id: 'apply', label: 'Apply' },
  { id: 'mine', label: 'My Appointments' },
  { id: 'schedule', label: 'View Schedule' },
];

export function normalizeTab(value) {
  return TABS.some((t) => t.id === value) ? value : 'apply';
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

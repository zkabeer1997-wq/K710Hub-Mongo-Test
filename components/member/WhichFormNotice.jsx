import Link from 'next/link';

// One plain rule, shown at the top of the three overlapping forms (Prep Backpack,
// KvK Appointments, Noble Advisor). Appointments is the schedule leadership
// places and publishes; the other two are inputs and never book a time by themselves.
const COPY = {
  appointments: {
    text: 'This form is for booking your minister or advisor appointment time. This is the one that counts.',
    linkText: 'Looking for your backpack? Open Prep Backpack',
    href: '/prep-phase-backpack',
  },
  prep: {
    text: 'This form is for your backpack items and the times you are free. To book your appointment time, use KvK Appointments.',
    linkText: 'Go to KvK Appointments',
    href: '/forms/kvk-appointments',
  },
  noble: {
    text: 'This form is for your Noble Advisor details. To book your appointment time, use KvK Appointments.',
    linkText: 'Go to KvK Appointments',
    href: '/forms/kvk-appointments',
  },
};

export default function WhichFormNotice({ kind }) {
  const c = COPY[kind];
  if (!c) return null;
  return (
    <aside className="which-form-notice" aria-label="Which form to use">
      <p><strong>{c.text}</strong></p>
      <p><Link href={c.href}>{c.linkText} &rarr;</Link></p>
    </aside>
  );
}

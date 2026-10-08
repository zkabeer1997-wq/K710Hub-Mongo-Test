import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Breadcrumbs from '../../../components/Breadcrumbs';
import PageHero from '../../../components/ui/PageHero';
import { readMemberSession } from '../../../lib/memberAuth';
import ResultUnavailable from '../../../components/member/ResultUnavailable';
import { getResultPagesVisible } from '../../../lib/memberFormStatus.server.js';
import Tabs, { normalizeTab } from '../../../components/member/kvk-appointments/Tabs';
import KvkAppointments from '../../../components/member/kvk-appointments/KvkAppointments';

// /forms/kvk-appointments?tab=mine|schedule - read-only: the times leadership published.
// Requests are made in the KvK Prep & Appointments form (/prep-phase-backpack); the old ?tab=apply goes there.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }) {
  const tab = normalizeTab((await searchParams)?.tab);
  return { title: tab === 'schedule' ? 'KvK appointment schedule' : 'My appointment', alternates: { canonical: `/forms/kvk-appointments?tab=${tab}` } };
}

export default async function KvkAppointmentsPage({ searchParams }) {
  const raw = (await searchParams)?.tab;
  if (raw === 'apply') redirect('/prep-phase-backpack');
  const tab = normalizeTab(raw);
  const session = await readMemberSession({ cookies: await cookies() });
  if (!session) redirect(`/dashboard?next=${encodeURIComponent(`/forms/kvk-appointments?tab=${tab}`)}`);
  const visible = (await getResultPagesVisible()).kvk;
  return (
    <main className="event-form-page appt-page">
      <Breadcrumbs items={[{ label: 'Members', href: '/dashboard' }, { label: 'Forms', href: '/forms' }]} current="My appointment" />
      <PageHero tone="console" eyebrow="Kingdom 710 · KvK" title="My appointment" lede={visible ? "Your Chief Minister and Noble Advisor times for the KvK prep days. Leadership publishes them here after you fill in the KvK Prep & Appointments form." : "Leadership shows this page while the KvK Prep & Appointments form is open."} />
      {visible ? (
        <>
          <Tabs current={tab} />
          <KvkAppointments tab={tab} />
        </>
      ) : <ResultUnavailable kind="kvk" />}
    </main>
  );
}

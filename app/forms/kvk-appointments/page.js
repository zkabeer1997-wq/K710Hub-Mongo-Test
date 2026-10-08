import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Breadcrumbs from '../../../components/Breadcrumbs';
import PageHero from '../../../components/ui/PageHero';
import { readMemberSession } from '../../../lib/memberAuth';
import WhichFormNotice from '../../../components/member/WhichFormNotice';
import Tabs, { normalizeTab } from '../../../components/member/kvk-appointments/Tabs';
import KvkAppointments from '../../../components/member/kvk-appointments/KvkAppointments';

// /forms/kvk-appointments?tab=apply|mine|schedule - each tab has its own URL.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }) {
  const tab = normalizeTab((await searchParams)?.tab);
  const name = { apply: 'Apply for appointments', mine: 'My appointments', schedule: 'Appointment schedule' }[tab];
  return { title: `KvK ${name}`, alternates: { canonical: `/forms/kvk-appointments?tab=${tab}` } };
}

export default async function KvkAppointmentsPage({ searchParams }) {
  const tab = normalizeTab((await searchParams)?.tab);
  const session = await readMemberSession({ cookies: await cookies() });
  if (!session) redirect(`/dashboard?next=${encodeURIComponent(`/forms/kvk-appointments?tab=${tab}`)}`);
  return (
    <main className="event-form-page appt-page">
      <Breadcrumbs items={[{ label: 'Members', href: '/dashboard' }, { label: 'Forms', href: '/forms' }]} current="KvK appointments" />
      <PageHero tone="console" eyebrow="Kingdom 710 · KvK" title="KvK appointments" lede="Apply for a minister or advisor buff, see where you stand, and find your slot once leadership publishes the schedule." />
      <WhichFormNotice kind="appointments" />
      <Tabs current={tab} />
      <KvkAppointments tab={tab} />
    </main>
  );
}

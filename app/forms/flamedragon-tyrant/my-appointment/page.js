import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Breadcrumbs from '../../../../components/Breadcrumbs';
import PageHero from '../../../../components/ui/PageHero';
import { readMemberSession } from '../../../../lib/memberAuth';
import { NOBLE_MY_HREF } from '../../../../lib/nobleAppointment.mjs';
import ResultUnavailable from '../../../../components/member/ResultUnavailable';
import { getResultPagesVisible } from '../../../../lib/memberFormStatus.server.js';
import Tabs, { normalizeTab } from '../../../../components/member/kvk-appointments/Tabs';
import NobleAppointment from '../../../../components/member/noble-appointments/NobleAppointment';

// /forms/flamedragon-tyrant/my-appointment?tab=mine|schedule - read-only: the Noble Advisor time leadership published.
export const dynamic = 'force-dynamic';

export async function generateMetadata({ searchParams }) {
  const tab = normalizeTab((await searchParams)?.tab);
  return { title: tab === 'schedule' ? 'Noble Advisor schedule' : 'My Noble Advisor appointment', alternates: { canonical: `${NOBLE_MY_HREF}?tab=${tab}` } };
}

export default async function NobleMyAppointmentPage({ searchParams }) {
  const tab = normalizeTab((await searchParams)?.tab);
  const session = await readMemberSession({ cookies: await cookies() });
  if (!session) redirect(`/dashboard?next=${encodeURIComponent(`${NOBLE_MY_HREF}?tab=${tab}`)}`);
  const visible = (await getResultPagesVisible()).noble;
  return (
    <main className="event-form-page appt-page">
      <Breadcrumbs items={[{ label: 'Members', href: '/dashboard' }, { label: 'Forms', href: '/forms' }]} current="My Noble Advisor appointment" />
      <PageHero tone="console" eyebrow="Kingdom 710 · Flamedragon Tyrant" title="My Noble Advisor appointment" lede={visible ? "Your Noble Advisor time for Flamedragon Tyrant. Leadership publishes it here after you fill in the Noble Advisor form." : "Leadership shows this page while the Noble Advisor form is open."} />
      {visible ? (
        <>
          <Tabs current={tab} basePath={NOBLE_MY_HREF} />
          <NobleAppointment tab={tab} />
        </>
      ) : <ResultUnavailable kind="noble" />}
    </main>
  );
}

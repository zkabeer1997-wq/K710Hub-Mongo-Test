import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readMemberSession } from '../../../../lib/memberAuth';
import { getFormGate } from '../../../../lib/formGates.server.js';
import { getFormFieldMeta } from '../../../../lib/formFieldMeta.server';
import WhichFormNotice from '../../../../components/member/WhichFormNotice';
import UpsertNotice from '../../../../components/member/UpsertNotice';
import FormClosedNotice from '../../../../components/FormClosedNotice';
import { getMemberIdentity } from '../../../../lib/memberPrefill.server.js';
import NobleAdvisorForm from './NobleAdvisorForm';
import TourLauncher from '../../../../components/tour/TourLauncher';

export const metadata = { title: 'Noble Advisor Schedule' };

export default async function NobleAdvisorPage() {
  const session = await readMemberSession({ cookies: await cookies() });
  if (!session) redirect('/dashboard?next=/forms/flamedragon-tyrant/noble-advisor');
  const [gate, fieldMeta, identity] = await Promise.all([
    getFormGate('noble'),
    getFormFieldMeta('noble').catch(() => null),
    getMemberIdentity(session),
  ]);
  const intro = fieldMeta?.intro || { heading: 'Noble Advisor Schedule' };
  return (
    <main className="page public-page">
      <div className="public-shell single-form prep-wide">
        <Link href="/forms/flamedragon-tyrant">← Flamedragon forms</Link>
        <h1 data-tour="noble-intro">{intro.heading}</h1>
        {gate.is_open === false ? null : <p><TourLauncher id="noble" /></p>}
        <p data-tour="noble-appointment"><Link href="/forms/flamedragon-tyrant/my-appointment">See My Noble Advisor appointment</Link></p>
        {gate.is_open === false ? (
          <FormClosedNotice message={gate.message} />
        ) : (
          <>
            <WhichFormNotice kind="noble" />
            <UpsertNotice formKey="noble" />
            <NobleAdvisorForm identity={identity} />
          </>
        )}
      </div>
    </main>
  );
}

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { readMemberSession } from '../../../../lib/memberAuth';
import { getFormGate } from '../../../../lib/formGates.server.js';
import { getFormFieldMeta } from '../../../../lib/formFieldMeta.server';
import FormClosedNotice from '../../../../components/FormClosedNotice';
import NobleAdvisorForm from './NobleAdvisorForm';

export const metadata = { title: 'Noble Advisor Schedule | K710' };

export default async function NobleAdvisorPage() {
  const session = await readMemberSession({ cookies: await cookies() });
  if (!session) redirect('/player-record?next=/forms/flamedragon-tyrant/noble-advisor');
  const [gate, fieldMeta] = await Promise.all([
    getFormGate('noble'),
    getFormFieldMeta('noble').catch(() => null),
  ]);
  const intro = fieldMeta?.intro || { heading: 'Noble Advisor Schedule' };
  return (
    <main className="page public-page">
      <div className="public-shell single-form prep-wide">
        <Link href="/forms/flamedragon-tyrant">← Flamedragon forms</Link>
        <h1>{intro.heading}</h1>
        {gate.is_open === false ? (
          <FormClosedNotice message={gate.message} />
        ) : (
          <NobleAdvisorForm memberId={session.memberId} />
        )}
      </div>
    </main>
  );
}

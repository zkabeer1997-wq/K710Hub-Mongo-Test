import { Suspense } from 'react';
import { checkIsAdmin } from '../../../lib/contentBlocks';
import { getFormGate } from '../../../lib/formGates.mjs';
import FormClosedNotice from '../../../components/FormClosedNotice';
import PlayerRecordFormClient from './PlayerRecordFormClient';

export default async function PlayerRecordFormPage() {
  const [isAdmin, gate] = await Promise.all([checkIsAdmin(), getFormGate('joiner')]);

  if (gate.is_open === false && !isAdmin) {
    return (
      <main className="page public-page">
        <FormClosedNotice message={gate.message} />
      </main>
    );
  }

  return (
    <main className="page public-page">
      <Suspense fallback={null}>
        <PlayerRecordFormClient />
      </Suspense>
    </main>
  );
}

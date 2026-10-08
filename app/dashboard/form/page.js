import { Suspense } from 'react';
import { getPageIdentity } from '../../../lib/memberPrefill.server.js';
import { checkIsAdmin } from '../../../lib/contentBlocks';
import { getFormGate } from '../../../lib/formGates.server.js';
import UpsertNotice from '../../../components/member/UpsertNotice';
import FormClosedNotice from '../../../components/FormClosedNotice';
import { getPublicHeroes } from '../../../lib/heroCatalog.server.js';
import PlayerRecordFormClient from './PlayerRecordFormClient';

export default async function PlayerRecordFormPage() {
  const [isAdmin, gate, heroes, identity] = await Promise.all([checkIsAdmin(), getFormGate('joiner'), getPublicHeroes(), getPageIdentity()]);

  if (gate.is_open === false && !isAdmin) {
    return (
      <main className="page public-page">
        <FormClosedNotice message={gate.message} />
      </main>
    );
  }

  return (
    <main className="page public-page">
      <div className="member-form-col">
        <UpsertNotice formKey="joiner" />
        <Suspense fallback={null}>
          <PlayerRecordFormClient heroCatalog={heroes} identity={identity} />
        </Suspense>
      </div>
    </main>
  );
}

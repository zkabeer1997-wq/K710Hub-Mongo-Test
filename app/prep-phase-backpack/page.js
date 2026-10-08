import { checkIsAdmin } from '../../lib/contentBlocks';
import { getFormGate } from '../../lib/formGates.server.js';
import UpsertNotice from '../../components/member/UpsertNotice';
import FormClosedNotice from '../../components/FormClosedNotice';
import { getPageIdentity } from '../../lib/memberPrefill.server.js';
import PrepBackpackClient from './PrepBackpackClient';

export default async function PrepBackpackPage() {
  const [isAdmin, gate, identity] = await Promise.all([checkIsAdmin(), getFormGate('prep'), getPageIdentity()]);

  if (gate.is_open === false && !isAdmin) {
    return (
      <main className="page public-page">
        <div className="public-shell single-form prep-wide">
          <FormClosedNotice message={gate.message} />
        </div>
      </main>
    );
  }

  return (
    <main className="page public-page">
      <div className="public-shell single-form prep-wide">
        <UpsertNotice formKey="prep" />
        <PrepBackpackClient identity={identity} />
      </div>
    </main>
  );
}

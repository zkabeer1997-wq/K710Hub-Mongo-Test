import { checkIsAdmin } from '../../../lib/contentBlocks';
import { getFormGate } from '../../../lib/formGates.server.js';
import FormClosedNotice from '../../../components/FormClosedNotice';
import { getPageIdentity } from '../../../lib/memberPrefill.server.js';
import WebsiteRequestForm from './WebsiteRequestForm';

export const metadata = {
  title: 'Website Requests',
};

export default async function WebsiteRequestsPage() {
  const [isAdmin, gate, identity] = await Promise.all([checkIsAdmin(), getFormGate('requests'), getPageIdentity()]);

  if (gate.is_open === false && !isAdmin) {
    return (
      <main className="page public-page">
        <div className="public-shell single-form">
          <FormClosedNotice message={gate.message} />
        </div>
      </main>
    );
  }

  return (
    <main className="page public-page">
      <WebsiteRequestForm identity={identity} />
    </main>
  );
}

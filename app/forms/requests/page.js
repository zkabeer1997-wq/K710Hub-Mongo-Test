import { checkIsAdmin } from '../../../lib/contentBlocks';
import { getFormGate } from '../../../lib/formGates.mjs';
import FormClosedNotice from '../../../components/FormClosedNotice';
import WebsiteRequestForm from './WebsiteRequestForm';

export const metadata = {
  title: 'K710 Website Requests',
};

export default async function WebsiteRequestsPage() {
  const [isAdmin, gate] = await Promise.all([checkIsAdmin(), getFormGate('requests')]);

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
      <WebsiteRequestForm />
    </main>
  );
}

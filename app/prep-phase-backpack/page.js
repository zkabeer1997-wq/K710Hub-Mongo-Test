import { Suspense } from 'react';
import { checkIsAdmin } from '../../lib/contentBlocks';
import { getFormGate } from '../../lib/formGates.mjs';
import FormClosedNotice from '../../components/FormClosedNotice';
import PrepBackpackClient from './PrepBackpackClient';

export default async function PrepBackpackPage() {
  const [isAdmin, gate] = await Promise.all([checkIsAdmin(), getFormGate('prep')]);

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
        <Suspense fallback={null}>
          <PrepBackpackClient />
        </Suspense>
      </div>
    </main>
  );
}

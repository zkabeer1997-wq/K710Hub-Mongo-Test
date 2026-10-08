'use client';

import PrepBackpackForm from './PrepBackpackForm';

// Identity comes from the server (the signed-in session), never from the URL or an extra fetch.
export default function PrepBackpackClient({ identity }) {
  return <PrepBackpackForm identity={identity} />;
}

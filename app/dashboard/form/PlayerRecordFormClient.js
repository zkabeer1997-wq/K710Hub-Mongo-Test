'use client';

import PlayerRecordForm from '../PlayerRecordForm';

// Identity comes from the server (the signed-in session), never from the URL.
export default function PlayerRecordFormClient({ heroCatalog, identity }) {
  return <PlayerRecordForm identity={identity} heroCatalog={heroCatalog} />;
}

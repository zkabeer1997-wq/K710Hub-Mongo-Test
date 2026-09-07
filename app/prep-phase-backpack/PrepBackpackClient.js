'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import PrepBackpackForm from './PrepBackpackForm';

export default function PrepBackpackClient() {
  const searchParams = useSearchParams();
  const [memberId, setMemberId] = useState(searchParams.get('member_id') || '');

  useEffect(() => {
    let active = true;
    // The member_id query param is only present when this page is reached
    // via a link that carries it forward (e.g. from the member hub). A
    // direct visit or a bookmarked URL has none, even though proxy.js has
    // already confirmed a real member session exists - fall back to that
    // session instead of showing "Booking as Member ID: (unknown)".
    if (memberId) return undefined;
    fetch('/api/session', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((session) => {
        if (!active) return;
        const resolved = session?.profile?.playerId || session?.profile?.memberId;
        if (resolved) setMemberId(String(resolved));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [memberId]);

  return <PrepBackpackForm initialMemberId={memberId} />;
}

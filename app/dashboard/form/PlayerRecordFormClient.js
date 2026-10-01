'use client';

import { useSearchParams } from 'next/navigation';
import PlayerRecordForm from '../PlayerRecordForm';

export default function PlayerRecordFormClient() {
  const searchParams = useSearchParams();
  const memberId = searchParams.get('member_id') || '';
  return <PlayerRecordForm initialMemberId={memberId} />;
}

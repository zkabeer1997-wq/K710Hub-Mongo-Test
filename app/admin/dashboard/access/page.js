import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readKingshotSession } from '../../../../lib/memberAuthKingshot';
import AccessManager from './AccessManager';

export const metadata = { title: 'User access' };
export const dynamic = 'force-dynamic';

export default async function UserAccessPage() {
  // Cookie jar adapter for readKingshotSession
  const cookieStore = await cookies();
  const requestLike = {
    cookies: {
      get: (name) => cookieStore.get(name),
    },
    headers: {
      get: () => '',
    },
  };
  const session = await readKingshotSession(requestLike);
  if (session?.role !== 'superadmin') redirect('/admin/dashboard/overview');
  return <AccessManager actorPlayerId={session.playerId} />;
}

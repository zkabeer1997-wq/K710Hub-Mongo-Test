import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { readKingshotSession } from '../../../../lib/memberAuthKingshot';
import { ADMIN_COOKIE_NAME, isValidAdminToken } from '../../../../lib/adminAuth';
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

  // The shared admin-password login (no Kingshot player account attached)
  // is treated as full admin access everywhere else in /admin/dashboard
  // (see isAdminRequest in lib/adminAuth.js) - it must clear this page's
  // gate too, or anyone using that login is bounced back to Overview.
  const legacyToken = cookieStore.get(ADMIN_COOKIE_NAME);
  if (await isValidAdminToken(legacyToken && legacyToken.value)) {
    return <AccessManager actorPlayerId={null} />;
  }

  const session = await readKingshotSession(requestLike);
  if (session?.role !== 'superadmin') redirect('/admin/dashboard/overview');
  return <AccessManager actorPlayerId={session.playerId} />;
}

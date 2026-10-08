import { NextResponse } from 'next/server';
import { requireRouteSuperadmin } from '../../../lib/routeAliasesAccess.server';

// Tells the admin UI whether to show superadmin-only items. Cosmetic only:
// every superadmin API re-checks the live role on the server.
export async function GET(request) {
  const session = await requireRouteSuperadmin(request);
  const res = NextResponse.json({ isSuperadmin: Boolean(session) });
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

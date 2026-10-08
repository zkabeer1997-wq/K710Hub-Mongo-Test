import 'server-only';
import { readKingshotSession } from './memberAuthKingshot';

// SuperAdmin only. Deliberately NOT the shared admin-password cookie: the
// role comes from the live kingshot_users profile via the Kingshot session.
export async function requireRouteSuperadmin(request) {
  try {
    const session = await readKingshotSession(request);
    return session?.role === 'superadmin' ? session : null;
  } catch {
    return null;
  }
}

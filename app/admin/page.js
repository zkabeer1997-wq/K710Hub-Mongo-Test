import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, isValidAdminToken } from '../../lib/adminAuth';
import { readKingshotSession } from '../../lib/memberAuthKingshot';

export default async function AdminIndexPage() {
  const cookieStore = await cookies();

  const adminCookie = cookieStore.get(ADMIN_COOKIE_NAME);
  if (await isValidAdminToken(adminCookie && adminCookie.value)) {
    redirect('/admin/dashboard/overview');
  }

  try {
    const fakeRequest = {
      cookies: { get: (name) => cookieStore.get(name) },
      headers: { get: () => '' },
    };
    const session = await readKingshotSession(fakeRequest);
    if (session?.role === 'admin' || session?.role === 'superadmin') {
      redirect('/admin/dashboard/overview');
    }
  } catch {
    /* fall through to password login */
  }

  redirect('/admin/login');
}

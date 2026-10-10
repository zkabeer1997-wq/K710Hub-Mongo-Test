'use client';

import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import LorePanel from '../../../../components/admin/LorePanel';

// Console surface. Lore = the short comedic stories on the public /lore page (English only, one optional photo each).
export default function LoreAdminPage() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }
  return (
    <AdminShell onLogout={logout} title="Lore" subtitle="Type the 710 Lore stories and add a photo to each">
      <LorePanel />
    </AdminShell>
  );
}

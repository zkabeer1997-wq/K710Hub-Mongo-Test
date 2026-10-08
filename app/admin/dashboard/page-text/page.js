'use client';

import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import PageTextEditor from '../../../../components/admin/PageTextEditor';

// Console surface. Page text = the words on public pages (About for now).
export default function PageTextAdminPage() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }
  return (
    <AdminShell onLogout={logout} title="Page text" subtitle="Edit the words on the About page">
      <PageTextEditor />
    </AdminShell>
  );
}

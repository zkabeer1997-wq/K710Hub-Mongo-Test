'use client';

import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import HelpImagesEditor from '../../../../components/admin/HelpImagesEditor';

// Console surface. Help images = one optional picture next to each section of the public /help page.
export default function HelpImagesPage() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }
  return (
    <AdminShell onLogout={logout} title="Help images" subtitle="A picture next to each section of the public Help page">
      <HelpImagesEditor />
    </AdminShell>
  );
}

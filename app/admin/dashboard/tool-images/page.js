'use client';

import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import SectionTabs, { TOOL_TABS } from '../../../../components/admin/SectionTabs';
import ToolImagesEditor from '../../../../components/admin/ToolImagesEditor';

// Console surface. Tool images = the picture on each Tools & Calculators tile.
export default function ToolImagesPage() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }
  return (
    <AdminShell onLogout={logout} title="Tool images" subtitle="The picture shown on each Tools & Calculators tile">
      <SectionTabs tabs={TOOL_TABS} label="Tools sections" />
      <ToolImagesEditor />
    </AdminShell>
  );
}

'use client';

import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import SectionTabs, { TOOL_TABS } from '../../../../components/admin/SectionTabs';
import ToolDataEditor from '../../../../components/admin/ToolDataEditor';

// Console surface. Pack editing = real-money packs only: price in USD, what the pack
// contains, purchase limits. Per-level / per-tier upgrade requirements live in Tool database.
export default function ToolEditingPage() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }
  return (
    <AdminShell onLogout={logout} title="Pack editing" subtitle="Real-money packs: price in USD, contents and purchase limits">
      <SectionTabs tabs={TOOL_TABS} label="Tools sections" />
      <ToolDataEditor
        kind="pack"
        intro="Only paid packs belong here: the price in USD, what each pack contains, and how many can be bought. Per-level upgrade data (guides, designs, satin, threads and similar) is not edited here; it lives in Tool database."
        otherHref="/admin/dashboard/tool-database"
        otherLabel="Open Tool database"
        savedNote="Members see the new packs when they open or reload the tool."
      />
    </AdminShell>
  );
}

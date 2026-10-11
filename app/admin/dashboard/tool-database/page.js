'use client';

import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import SectionTabs, { TOOL_TABS } from '../../../../components/admin/SectionTabs';
import ToolDataEditor from '../../../../components/admin/ToolDataEditor';
import ReferenceTableEditor from '../../../../components/admin/ReferenceTableEditor';
import DatabasesManager from '../../../../components/admin/DatabasesManager';

// Console surface. Tool database = the data behind the calculators: per-level / per-tier
// requirements, sailing chest rewards and in-game shop rates; the editable charm level and
// governor gear tier tables; and the admin's own named databases. No $ prices and no pack
// definitions (those live in Pack editing).
const EXTRA_VIEWS = [
  { key: 'ref-charms', label: 'Charm levels table (editable)', render: (_styles, { setDirty }) => <ReferenceTableEditor key="charm-levels" tableKey="charm-levels" onDirtyChange={setDirty} /> },
  { key: 'ref-gear', label: 'Governor gear tiers table (editable)', render: (_styles, { setDirty }) => <ReferenceTableEditor key="gear-tiers" tableKey="gear-tiers" onDirtyChange={setDirty} /> },
  { key: 'my-databases', label: 'Your databases (add and edit)', render: (_styles, { setDirty }) => <DatabasesManager onDirtyChange={setDirty} /> },
];

export default function ToolDatabasePage() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }
  return (
    <AdminShell onLogout={logout} title="Packs/Tools" subtitle="Tool database: calculator data and your own tables">
      <SectionTabs tabs={TOOL_TABS} label="Tools sections" />
      <ToolDataEditor
        kind="calc"
        intro="The numbers behind the calculators: what each charm level or gear tier costs, sailing chest rewards and in-game shop rates. The last three entries in the Tool list are the charm and gear tier tables and your own databases. No dollar prices: pack prices live in Pack editing."
        otherHref="/admin/dashboard/tool-editing"
        otherLabel="Open Pack editing"
        extraViews={EXTRA_VIEWS}
        savedNote="Members see the new numbers when they open or reload the tool."
      />
    </AdminShell>
  );
}

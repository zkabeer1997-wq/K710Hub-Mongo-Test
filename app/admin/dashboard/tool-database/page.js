'use client';

import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import SectionTabs, { TOOL_TABS } from '../../../../components/admin/SectionTabs';
import ToolDataEditor from '../../../../components/admin/ToolDataEditor';
import { CharmReferenceTable, GearReferenceTable } from '../../../../components/admin/ToolReferenceTables';

// Console surface. Tool database = the raw calculator data used to work out an upgrade:
// per-level / per-tier requirements, sailing chest rewards and in-game shop rates.
// No $ prices and no pack definitions (those live in Pack editing).
const REFERENCE_VIEWS = [
  { key: 'ref-charms', label: 'Reference: charm levels (read-only)', render: (styles) => <CharmReferenceTable styles={styles} /> },
  { key: 'ref-gear', label: 'Reference: governor gear tiers (read-only)', render: (styles) => <GearReferenceTable styles={styles} /> },
];

export default function ToolDatabasePage() {
  const router = useRouter();
  async function logout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }
  return (
    <AdminShell onLogout={logout} title="Tool database" subtitle="Raw calculator data: per-level and per-tier upgrade requirements">
      <SectionTabs tabs={TOOL_TABS} label="Tools sections" />
      <ToolDataEditor
        kind="calc"
        intro="Only the numbers a calculator needs to work out an upgrade belong here: what each charm level or gear tier costs, sailing chest rewards and in-game shop rates. No dollar prices: pack prices live in Pack editing."
        otherHref="/admin/dashboard/tool-editing"
        otherLabel="Open Pack editing"
        extraViews={REFERENCE_VIEWS}
        savedNote="Members see the new numbers when they open or reload the tool."
      />
    </AdminShell>
  );
}

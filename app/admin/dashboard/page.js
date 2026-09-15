import RosterWorkspace from '../../../components/admin/RosterWorkspace';

export default function AdminDashboardPage() {
  return (
    <RosterWorkspace
      title="KvK Participants"
      subtitle="Manage participant records"
      membersEndpoint="/api/admin-submissions"
      ralliesEndpoint="/api/admin-rallies"
      rallyStorageKey="kvk-admin-rallies-v1"
      exportFileNamePrefix="k710-kvk-participants"
      workbookSheetName="KvK Participants"
      allowClearTestData
      cycleType="kvk"
    />
  );
}

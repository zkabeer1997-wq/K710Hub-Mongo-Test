import RosterWorkspace from '../../../../components/admin/RosterWorkspace';

export default function AdminFlamedragonPage() {
  return (
    <RosterWorkspace
      title="Tyrant Participants"
      subtitle="Manage Flamedragon roster"
      pageLead="Select a member to view their full record. Drag the handle beside their name to assign a rally."
      membersEndpoint="/api/admin-flamedragon"
      ralliesEndpoint="/api/admin-flamedragon-rallies"
      rallyStorageKey="flamedragon-admin-rallies-v1"
      exportFileNamePrefix="k710-tyrant-participants"
      workbookSheetName="Tyrant Participants"
      cycleType="flamedragon"
    />
  );
}

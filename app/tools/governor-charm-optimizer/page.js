import ToolPage from "../../../components/tools/ToolPage";
import { CharmStatPlanner } from "../../../components/tools/Phase2Planners";
export const metadata = { title: "Governor Charm Stat Optimizer | K710" };
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId =
    typeof params?.member_id === "string" ? params.member_id : "";
  return (
    <ToolPage
      title="Governor Charm Stat Optimizer"
      description="Rank upgrades across all 18 charms using your inventory and editable troop and stat priorities."
      memberId={memberId}
    >
      <CharmStatPlanner memberId={memberId} />
    </ToolPage>
  );
}

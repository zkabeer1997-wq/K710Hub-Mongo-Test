import ToolPage from "../../../components/tools/ToolPage";
import { CharmStatPlanner } from "../../../components/tools/Phase2Planners";
import { loadToolConfiguration } from "../../../lib/toolSettings";
export const metadata = { title: "Governor Charm Stat Optimizer | K710" };
export default async function Page({ searchParams }) {
  let packConfiguration = null;
  try {
    packConfiguration = await loadToolConfiguration("charm-pack-optimizer");
  } catch {
    // The checked-in reference table keeps the calculator usable during a
    // database outage; configured values take precedence whenever available.
  }
  const params = await searchParams;
  const memberId =
    typeof params?.member_id === "string" ? params.member_id : "";
  return (
    <ToolPage
      title="Governor Charm Optimizer"
      description="Set all 18 charm levels, rank the best upgrades, and turn the complete target shortfall into the cheapest weekly pack schedule."
      memberId={memberId}
    >
      <CharmStatPlanner memberId={memberId} packConfiguration={packConfiguration} />
    </ToolPage>
  );
}

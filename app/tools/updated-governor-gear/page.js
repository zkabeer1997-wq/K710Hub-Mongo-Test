import ToolPage from "../../../components/tools/ToolPage";
import { GovernorGearPlanner } from "../../../components/tools/Phase2Planners";

export const metadata = { title: "Updated Governor Gear Optimizer | K710" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  const suffix = memberId ? `&member_id=${encodeURIComponent(memberId)}` : "";
  return <ToolPage title="Updated Governor Gear Optimizer" description="Rank six Governor Gear pieces with squared scarcity, matching-tier set bonuses, and KvK Preparation scoring." backHref={`/tools?category=UPDATED+TOOLS${suffix}`} backLabel="Updated Tools"><GovernorGearPlanner toolKey="updated-governor-gear" /></ToolPage>;
}

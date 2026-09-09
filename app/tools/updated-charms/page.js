import ToolPage from "../../../components/tools/ToolPage";
import { CharmStatPlanner } from "../../../components/tools/Phase2Planners";
import { loadToolConfiguration } from "../../../lib/toolSettings";

export const metadata = { title: "Updated Charms Optimizer | K710" };

export default async function Page({ searchParams }) {
  let packConfiguration = null;
  try { packConfiguration = await loadToolConfiguration("charm-pack-optimizer"); } catch { /* checked-in exact costs remain available */ }
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  const suffix = memberId ? `&member_id=${encodeURIComponent(memberId)}` : "";
  return <ToolPage title="Updated Charms Optimizer" description="Optimize all 18 charms for weighted stats or KvK Preparation points, then buy the exact target shortfall." backHref={`/tools?category=UPDATED+TOOLS${suffix}`} backLabel="Updated Tools"><CharmStatPlanner memberId={memberId} packConfiguration={packConfiguration} toolKey="updated-charms" /></ToolPage>;
}

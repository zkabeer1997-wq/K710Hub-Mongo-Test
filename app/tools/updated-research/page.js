import ToolPage from "../../../components/tools/ToolPage";
import UnifiedResearchPlanner from "../../../components/tools/UnifiedResearchPlanner";
import academy from "../../../lib/data/academy.json";
import warAcademy from "../../../lib/data/war-academy.json";
import advancedResearch from "../../../lib/data/advanced-research.json";

export const metadata = { title: "Unified Research Planner | K710" };

export default async function UpdatedResearchPage({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  const suffix = memberId ? `&member_id=${encodeURIComponent(memberId)}` : "";
  const datasets = { academy, "war-academy": warAcademy, "advanced-research": advancedResearch };
  return <ToolPage title="Unified Research Planner" description="Plan exact Academy, War Academy, and Advanced Research levels from one workspace, including prerequisites, inventory, adjusted time, and exports." backHref={`/tools?category=UPDATED+TOOLS${suffix}`} backLabel="Updated Tools"><UnifiedResearchPlanner datasets={datasets} /></ToolPage>;
}

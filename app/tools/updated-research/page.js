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
  const help = (
    <>
      <p>Plan exact research levels across three systems — <strong>Academy</strong>, <strong>War Academy</strong>, and <strong>Advanced Research</strong> — from one workspace. Switch systems with the tabs; each keeps its own plan.</p>
      <p><strong>Upgrade plan:</strong> pick a current and target level for each technology. Prerequisites can be pulled in automatically so nothing is missed.</p>
      <p><strong>Inventory &amp; speed:</strong> subtract the resources you already hold, then enter your total research-speed bonus to see realistic completion times rather than base times.</p>
      <p>Numbers come from verified per-level records; workbook tree totals shown for context are rounded estimates. Export any plan as CSV when you are done.</p>
    </>
  );
  return <ToolPage title="Unified Research Planner" description="Plan exact Academy, War Academy, and Advanced Research levels from one workspace, including prerequisites, inventory, adjusted time, and exports." backHref={`/tools?category=UPDATED+TOOLS${suffix}`} backLabel="Updated Tools" help={help}><UnifiedResearchPlanner datasets={datasets} /></ToolPage>;
}

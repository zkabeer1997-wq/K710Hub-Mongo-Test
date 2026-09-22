import ToolPage from "../../../components/tools/ToolPage";
import UpdatedConstructionPlanner from "../../../components/tools/UpdatedConstructionPlanner";

export const metadata = { title: "Updated Construction Planner | K710" };

export default async function UpdatedConstructionPage({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  const suffix = memberId ? `&member_id=${encodeURIComponent(memberId)}` : "";
  const help = (
    <>
      <p>Work out everything it takes to push your buildings from their current True Gold tier to a target tier, then turn the leftover cost into a day-by-day refining schedule.</p>
      <p><strong>Building targets:</strong> set a current and target tier for each building; the planner adds up the <strong>True Gold (TG)</strong> and <strong>Tempered True Gold (TTG)</strong> every upgrade needs.</p>
      <p><strong>Inventory:</strong> enter what you already own. Construction needs are set aside first, so the refining schedule only spends what is truly spare.</p>
      <p><strong>Refining schedule:</strong> tell it your Crucible pace and it lays out how many refinements to run each day to reach your TTG total — and whether a deadline is reachable.</p>
    </>
  );
  return <ToolPage title="Updated Construction Planner" description="Plan TG1–TG10 upgrades across eight buildings and generate the Tempered True Gold schedule needed to complete them." backHref={`/tools?category=UPDATED+TOOLS${suffix}`} backLabel="Updated Tools" help={help}><UpdatedConstructionPlanner /></ToolPage>;
}

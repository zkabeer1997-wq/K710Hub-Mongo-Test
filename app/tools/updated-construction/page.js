import ToolPage from "../../../components/tools/ToolPage";
import UpdatedConstructionPlanner from "../../../components/tools/UpdatedConstructionPlanner";

export const metadata = { title: "Updated Construction Planner | K710" };

export default async function UpdatedConstructionPage({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  const suffix = memberId ? `&member_id=${encodeURIComponent(memberId)}` : "";
  return <ToolPage title="Updated Construction Planner" description="Plan TG1–TG10 upgrades across eight buildings and generate the Tempered True Gold schedule needed to complete them." backHref={`/tools?category=UPDATED+TOOLS${suffix}`} backLabel="Updated Tools"><UpdatedConstructionPlanner /></ToolPage>;
}

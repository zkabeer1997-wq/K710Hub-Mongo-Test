import ToolPage from "../../../components/tools/ToolPage";
import { HeroGearPlanner } from "../../../components/tools/Phase2Planners";

export const metadata = { title: "Updated Hero Gear Optimizer | K710" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  const suffix = memberId ? `&member_id=${encodeURIComponent(memberId)}` : "";
  return <ToolPage title="Updated Hero Gear Optimizer" description="Optimize Enhancement, Mastery, Red ascension and imbuement with exact resource handoffs and safe reforging rules." backHref={`/tools?category=UPDATED+TOOLS${suffix}`} backLabel="Updated Tools"><HeroGearPlanner toolKey="updated-hero-gear" /></ToolPage>;
}

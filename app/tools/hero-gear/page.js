import ToolPage from "../../../components/tools/ToolPage";
import { HeroGearPlanner } from "../../../components/tools/Phase2Planners";

export const metadata = { title: "Hero Gear Optimizer" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  return <ToolPage title="Hero Gear Optimizer" description="Optimize Enhancement, Mastery, Red ascension and imbuement with exact resource handoffs and safe reforging rules." memberId={memberId}><HeroGearPlanner toolKey="updated-hero-gear" /></ToolPage>;
}

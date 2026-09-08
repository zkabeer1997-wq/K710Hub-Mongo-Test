import ToolPage from "../../../components/tools/ToolPage";
import { HeroGearPlanner } from "../../../components/tools/Phase2Planners";
export const metadata = { title: "Hero Gear Optimizer | K710" };
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId =
    typeof params?.member_id === "string" ? params.member_id : "";
  return (
    <ToolPage
      title="Hero Gear Optimizer"
      description="Enter your inventory and current 12-piece setup to get the most efficient affordable Hero Gear upgrade order."
      memberId={memberId}
    >
      <HeroGearPlanner />
    </ToolPage>
  );
}

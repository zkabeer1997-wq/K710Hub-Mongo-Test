import ToolPage from "../../../components/tools/ToolPage";
import { GovernorGearPlanner } from "../../../components/tools/Phase2Planners";
export const metadata = { title: "Governor Gear Optimizer | K710" };
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId =
    typeof params?.member_id === "string" ? params.member_id : "";
  return (
    <ToolPage
      title="Governor Gear Optimizer"
      description="Plan target tiers or rank the best use of Satin, Gilded Threads, and Artisan’s Visions."
      memberId={memberId}
    >
      <GovernorGearPlanner />
    </ToolPage>
  );
}

import ToolPage from "../../../components/tools/ToolPage";
import { MastersPlanner } from "../../../components/tools/Phase2Planners";
export const metadata = { title: "Masters Planner | K710" };
export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId =
    typeof params?.member_id === "string" ? params.member_id : "";
  return (
    <ToolPage
      title="Masters Planner"
      description="Track Master relationships, talents, skills, learning progress, and progression inventory."
      memberId={memberId}
    >
      <MastersPlanner />
    </ToolPage>
  );
}

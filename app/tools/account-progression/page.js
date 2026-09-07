import AccountProgressionPlanner from "../../../components/tools/AccountProgressionPlanner";
import ToolPage from "../../../components/tools/ToolPage";

export const metadata = { title: "Account Progression Planner | K710" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId =
    typeof params?.member_id === "string" ? params.member_id : "";
  const initialGoal = ["kvk", "stats", "balanced"].includes(params?.goal)
    ? params.goal
    : "";
  return (
    <ToolPage
      title="Account Progression Planner"
      description="Turn every saved K710 planner into one transparent, prioritized account roadmap."
      memberId={memberId}
    >
      <AccountProgressionPlanner memberId={memberId} initialGoal={initialGoal} />
    </ToolPage>
  );
}

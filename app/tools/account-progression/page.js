import AccountProgressionPlanner from "../../../components/tools/AccountProgressionPlanner";
import ToolPage from "../../../components/tools/ToolPage";

export const metadata = { title: "Account Progression Summary | K710" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId =
    typeof params?.member_id === "string" ? params.member_id : "";
  const initialGoal = ["kvk", "stats", "balanced"].includes(params?.goal)
    ? params.goal
    : "";
  return (
    <ToolPage
      title="Account Progression Summary"
      description="See your saved Updated Tool targets, exact KvK points, next actions, and material bottlenecks in one place."
      memberId={memberId}
    >
      <AccountProgressionPlanner memberId={memberId} initialGoal={initialGoal} />
    </ToolPage>
  );
}

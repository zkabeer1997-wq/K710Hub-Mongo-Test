import ToolPage from "../../../components/tools/ToolPage";
import MastersPackOptimizer from "../MastersPackOptimizer";

export const metadata = { title: "Masters Optimizer" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  return <ToolPage title="Masters Optimizer" description="Plan multiple Masters, partial Affinity progress, skill Manuscripts, inventory, and the cheapest reset-aware pack schedule." memberId={memberId}><MastersPackOptimizer toolKey="updated-masters" /></ToolPage>;
}

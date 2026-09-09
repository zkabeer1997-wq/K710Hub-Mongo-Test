import ToolPage from "../../../components/tools/ToolPage";
import MastersPackOptimizer from "../MastersPackOptimizer";

export const metadata = { title: "Updated Masters Optimizer | K710" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  const suffix = memberId ? `&member_id=${encodeURIComponent(memberId)}` : "";
  return <ToolPage title="Updated Masters Optimizer" description="Plan multiple Masters, partial Affinity progress, skill Manuscripts, inventory, and the cheapest reset-aware pack schedule." backHref={`/tools?category=UPDATED+TOOLS${suffix}`} backLabel="Updated Tools"><MastersPackOptimizer toolKey="updated-masters" /></ToolPage>;
}

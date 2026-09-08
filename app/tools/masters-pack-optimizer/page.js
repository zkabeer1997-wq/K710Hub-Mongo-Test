import ToolPage from "../../../components/tools/ToolPage";
import MastersPackOptimizer from "../MastersPackOptimizer";

export const metadata = { title: "Masters Calculator & Pack Optimizer | K710" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  const suffix = memberId ? `&member_id=${encodeURIComponent(memberId)}` : "";
  return <ToolPage title="Masters Calculator & Pack Optimizer" description="Plan multiple Masters, total their progression materials, and calculate the cheapest monthly and weekly pack schedule." backHref={`/tools?category=Masters${suffix}`} backLabel="Masters tools"><MastersPackOptimizer/></ToolPage>;
}

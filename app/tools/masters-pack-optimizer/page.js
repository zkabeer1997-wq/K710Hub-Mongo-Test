import ToolPage from "../../../components/tools/ToolPage";
import MastersPackOptimizer from "../MastersPackOptimizer";

export const metadata = { title: "Masters Calculator & Pack Optimizer" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  return <ToolPage title="Masters Calculator & Pack Optimizer" description="Plan multiple Masters, total their progression materials, and calculate the cheapest monthly and weekly pack schedule." memberId={memberId}><MastersPackOptimizer/></ToolPage>;
}

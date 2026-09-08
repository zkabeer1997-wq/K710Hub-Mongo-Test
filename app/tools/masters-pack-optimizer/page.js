import ToolPage from "../../../components/tools/ToolPage";
import MastersPackOptimizer from "../MastersPackOptimizer";

export const metadata = { title: "Masters Pack Optimization Tool | K710" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  const suffix = memberId ? `&member_id=${encodeURIComponent(memberId)}` : "";
  return <ToolPage title="Masters Pack Optimization Tool" description="Calculate the cheapest mix of monthly Masters Acuity choices and weekly Masters packs for your resource target." backHref={`/tools?category=Masters${suffix}`} backLabel="Masters tools"><MastersPackOptimizer/></ToolPage>;
}

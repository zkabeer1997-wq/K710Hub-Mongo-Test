import ToolPage from "../../../components/tools/ToolPage";
import PetPackOptimizer from "../PetPackOptimizer";
import { loadToolConfiguration } from "../../../lib/toolSettings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Pets Optimizer" };

export default async function Page({ searchParams }) {
  let configuration = null;
  try { configuration = await loadToolConfiguration("pet-pack-optimizer"); } catch { /* checked-in pack defaults remain available */ }
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  return <ToolPage title="Pets Optimizer" description="Plan multiple pets from the complete progression dataset and generate a combined weekly pack and chest-redemption schedule." memberId={memberId}><PetPackOptimizer configuration={configuration} toolKey="updated-pets" /></ToolPage>;
}

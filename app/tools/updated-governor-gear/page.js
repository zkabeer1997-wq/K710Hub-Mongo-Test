import ToolPage from "../../../components/tools/ToolPage";
import { GovernorGearPlanner } from "../../../components/tools/Phase2Planners";

export const metadata = { title: "Updated Governor Gear Optimizer | K710" };

export default async function Page({ searchParams }) {
  const params = await searchParams;
  const memberId = typeof params?.member_id === "string" ? params.member_id : "";
  const suffix = memberId ? `&member_id=${encodeURIComponent(memberId)}` : "";
  const help = (
    <>
      <p>Rank the best order to upgrade your six Governor Gear pieces so limited materials go where they matter most.</p>
      <p><strong>Current gear:</strong> set the tier each of your six pieces is at now, and the tier you are aiming for. Lock (protect) any piece you do not want touched.</p>
      <p><strong>Available inventory:</strong> enter your Satin, Gilded Threads, and Artisan&rsquo;s Visions. The optimizer only recommends upgrades your materials can support.</p>
      <p><strong>Optimization goal:</strong> choose whether to maximize raw stats or KvK Preparation points. Matching-tier set bonuses (Defense at three pieces, Attack at all six) are factored into the ranking.</p>
    </>
  );
  return <ToolPage title="Updated Governor Gear Optimizer" description="Rank six Governor Gear pieces with squared scarcity, matching-tier set bonuses, and KvK Preparation scoring." backHref={`/tools?category=UPDATED+TOOLS${suffix}`} backLabel="Updated Tools" help={help}><GovernorGearPlanner toolKey="updated-governor-gear" /></ToolPage>;
}

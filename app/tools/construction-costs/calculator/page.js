import CostPlanner from '../../../../components/tools/CostPlanner';
import ToolPage from '../../../../components/tools/ToolPage';
import dataset from '../../../../lib/data/construction.json';
export const metadata={title:'Construction Calculator'};
export default function ConstructionCalculator(){return <ToolPage title="Construction Calculator" description="Plan standard and True Gold building upgrades, including prerequisites, inventory, and construction bonuses." backHref="/tools/construction-costs" backLabel="Construction Costs"><CostPlanner dataset={dataset} toolKey="construction" construction/></ToolPage>;}

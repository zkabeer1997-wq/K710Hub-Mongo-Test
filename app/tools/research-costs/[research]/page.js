import {notFound} from 'next/navigation';
import CostPlanner from '../../../../components/tools/CostPlanner';
import ToolPage from '../../../../components/tools/ToolPage';
const titles={'academy':'Academy Research Costs Calculator','war-academy':'War Academy Research Costs Calculator','advanced-research':'War Academy Advanced Research Costs Calculator'};
const loaders={'academy':()=>import('../../../../lib/data/academy.json'),'war-academy':()=>import('../../../../lib/data/war-academy.json'),'advanced-research':()=>import('../../../../lib/data/advanced-research.json')};
export function generateStaticParams(){return Object.keys(titles).map(research=>({research}));}
export async function generateMetadata({params}){const {research}=await params;return {title:`${titles[research]||'Research'}`};}
export default async function ResearchCalculator({params}){const {research}=await params;if(!Object.hasOwn(loaders,research))notFound();const dataset=(await loaders[research]()).default;return <ToolPage title={titles[research]} description="Set your current research and target levels to calculate materials, prerequisites, and time." backHref="/tools/research-costs" backLabel="Research Tools"><CostPlanner dataset={dataset} toolKey={research}/></ToolPage>;}

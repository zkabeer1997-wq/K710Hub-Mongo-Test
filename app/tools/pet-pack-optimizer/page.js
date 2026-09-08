export const dynamic = 'force-dynamic';
import { loadToolConfiguration } from '../../../lib/toolSettings';
import Link from 'next/link';
import PetPackOptimizer from '../PetPackOptimizer';

export const metadata = { title: 'Pet Calculator & Pack Optimizer · K710' };

export default async function PetPackOptimizerPage({ searchParams: searchParamsPromise }) {
  const configuration = await loadToolConfiguration('pet-pack-optimizer');
  const searchParams = await searchParamsPromise;
  const memberId = typeof searchParams?.member_id === 'string' ? searchParams.member_id : '';
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';
  return <main className="armory pet-pack-page"><div className="armory-atmos" aria-hidden="true"/><span className="armory-rack-l" aria-hidden="true"/><span className="armory-rack-r" aria-hidden="true"/><div className="armory-inner pet-pack-inner"><div className="pet-pack-nav"><Link href={`/tools?category=Pets${memberId ? `&member_id=${encodeURIComponent(memberId)}` : ''}`}>← Pets tools</Link><span className="k-mark">Pet progression + packs</span></div><header className="armory-head pet-pack-head"><h1 className="k-display armory-title">Pet Calculator & Pack Optimizer</h1><p className="k-narrative armory-lede">Plan multiple pets, calculate their combined progression materials, and follow the cheapest weekly pack and Advanced Chest redemption plan.</p></header><PetPackOptimizer configuration={configuration}/></div><style>{`.pet-pack-page{color:var(--parchment)}.pet-pack-inner{width:min(1380px,100%);padding-top:clamp(76px,9vh,108px)}.pet-pack-nav{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:24px;padding-bottom:15px;border-bottom:1px solid var(--edge)}.pet-pack-nav a{color:var(--brass);font-family:var(--font-body);font-size:12px;letter-spacing:.05em;text-decoration:none}.pet-pack-nav a:hover{color:var(--gold-hot)}.pet-pack-head{margin-bottom:24px}.pet-pack-head .armory-lede{max-width:760px}@media(max-width:620px){.pet-pack-nav{align-items:flex-start;flex-direction:column}.pet-pack-inner{padding-top:70px}}`}</style></main>;
}

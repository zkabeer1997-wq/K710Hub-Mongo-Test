export const dynamic = 'force-dynamic';
import { loadToolConfiguration } from '../../../lib/toolSettings';
import Link from 'next/link';
import AdventureStallOptimizer from '../AdventureStallOptimizer';

export const metadata = { title: 'Adventure Stall Optimizer | K710' };

export default async function AdventureStallPage({ searchParams: searchParamsPromise }) {
  const configuration = await loadToolConfiguration('adventure-stall');
  const searchParams = await searchParamsPromise;
  const memberId = typeof searchParams?.member_id === 'string' ? searchParams.member_id : '';
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';
  return <main className="armory as-page">
    <div className="armory-atmos" aria-hidden="true"/><span className="armory-rack-l" aria-hidden="true"/><span className="armory-rack-r" aria-hidden="true"/>
    <div className="armory-inner as-inner">
      <div className="as-nav"><Link href={`/tools${query}`}>← Tools &amp; Calculators</Link><span className="k-mark">Special Event Shops</span></div>
      <header className="armory-head as-head"><h1 className="k-display armory-title">Adventure Stall</h1><p className="k-narrative armory-lede">Build your reward cart and find the lowest-cost legal Shell pack combination across the event days remaining.</p></header>
      <AdventureStallOptimizer configuration={configuration}/>
    </div>
    <style>{`.as-page{color:var(--parchment)}.as-inner{width:min(1440px,100%);padding-top:clamp(76px,9vh,108px)}.as-nav{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:24px;padding-bottom:15px;border-bottom:1px solid var(--edge)}.as-nav a{color:var(--brass);font-family:var(--font-body);font-size:12px;letter-spacing:.05em;text-decoration:none}.as-nav a:hover{color:var(--gold-hot)}.as-head{margin-bottom:24px}@media(max-width:620px){.as-nav{align-items:flex-start;flex-direction:column}.as-inner{padding-top:70px}}`}</style>
  </main>;
}

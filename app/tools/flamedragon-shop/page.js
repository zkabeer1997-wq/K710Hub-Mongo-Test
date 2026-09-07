export const dynamic = 'force-dynamic';
import { loadToolConfiguration } from '../../../lib/toolSettings';
import Link from 'next/link';
import FlamedragonShopOptimizer from '../FlamedragonShopOptimizer';

export const metadata = { title: 'Flamedragon Tyrant Shop Optimizer | K710' };

export default async function FlamedragonShopPage({ searchParams: searchParamsPromise }) {
  const configuration = await loadToolConfiguration('flamedragon-shop');
  const searchParams = await searchParamsPromise;
  const memberId = typeof searchParams?.member_id === 'string' ? searchParams.member_id : '';
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';
  return <main className="armory ft-shop-page">
    <div className="armory-atmos" aria-hidden="true"/><span className="armory-rack-l" aria-hidden="true"/><span className="armory-rack-r" aria-hidden="true"/>
    <div className="armory-inner ft-shop-inner">
      <div className="ft-shop-nav"><Link href={`/tools${query}`}>← Tools &amp; Calculators</Link><span className="k-mark">Special Event Shops</span></div>
      <header className="armory-head ft-shop-head"><h1 className="k-display armory-title">Flamedragon Tyrant</h1><p className="k-narrative armory-lede">Prioritize the Dragon’s Caravan rewards you want and find the lowest-cost legal pack combination.</p></header>
      <FlamedragonShopOptimizer configuration={configuration}/>
    </div>
    <style>{`.ft-shop-page{color:var(--parchment)}.ft-shop-inner{width:min(1440px,100%);padding-top:clamp(76px,9vh,108px)}.ft-shop-nav{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:24px;padding-bottom:15px;border-bottom:1px solid var(--edge)}.ft-shop-nav a{color:var(--brass);font-family:var(--font-body);font-size:12px;letter-spacing:.05em;text-decoration:none}.ft-shop-nav a:hover{color:var(--gold-hot)}.ft-shop-head{margin-bottom:24px}@media(max-width:620px){.ft-shop-nav{align-items:flex-start;flex-direction:column}.ft-shop-inner{padding-top:70px}}`}</style>
  </main>;
}

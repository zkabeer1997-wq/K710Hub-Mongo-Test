import Breadcrumbs from '../../../components/Breadcrumbs';
export const dynamic = 'force-dynamic';
import { loadToolConfiguration } from '../../../lib/toolSettings';
import Link from 'next/link';
import WaveboundCharmOptimizer from '../WaveboundCharmOptimizer';

export const metadata = {
  title: 'Charm Sailing Optimizer',
};

export default async function WaveboundCharmsPage({ searchParams: searchParamsPromise }) {
  const configuration = await loadToolConfiguration('charm-sailing-optimizer');
  const searchParams = await searchParamsPromise;
  const memberId = typeof searchParams?.member_id === 'string' ? searchParams.member_id : '';
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';

  return (
    <main className="armory wavebound-tool-page">
      <div className="armory-atmos" aria-hidden="true" />
      <span className="armory-rack-l" aria-hidden="true" />
      <span className="armory-rack-r" aria-hidden="true" />

      <div className="armory-inner wavebound-tool-inner">
        <Breadcrumbs items={[{ label: 'Members', href: `/dashboard${query}` }, { label: 'Tools & Calculators', href: `/tools${query}` }]} current="Charm Sailing Optimizer" />

        <header className="armory-head wavebound-tool-head">
          <h1 className="k-display armory-title">Charm Sailing Optimizer</h1>
          <p className="k-narrative armory-lede">Plan the Tidal Treasure merges needed to reach your target Charm level without wasting the material type you need most.</p>
        </header>

        <WaveboundCharmOptimizer configuration={configuration} />
      </div>

      <style>{`
        .wavebound-tool-page{color:var(--parchment)}
        .wavebound-tool-inner{width:min(1220px,100%);padding-top:clamp(76px,9vh,108px)}
        .wavebound-tool-nav{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-bottom:24px;padding-bottom:15px;border-bottom:1px solid var(--edge)}
        .wavebound-back{color:var(--brass);font-family:var(--font-body);font-size:12px;letter-spacing:.05em;text-decoration:none}
        .wavebound-back:hover{color:var(--gold-hot)}
        .wavebound-tool-head{margin-bottom:24px}
        @media(max-width:620px){.wavebound-tool-nav{align-items:flex-start;flex-direction:column}.wavebound-tool-inner{padding-top:70px}}
      `}</style>
    </main>
  );
}

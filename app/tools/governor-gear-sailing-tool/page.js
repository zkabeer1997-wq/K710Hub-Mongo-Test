export const dynamic = 'force-dynamic';
import { loadToolConfiguration } from '../../../lib/toolSettings';
import Link from 'next/link';
import GovernorGearSailingTool from '../GovernorGearSailingTool';

export const metadata = {
  title: 'Governor Gear Sailing Tool',
};

export default async function GovernorGearSailingToolPage({ searchParams: searchParamsPromise }) {
  const configuration = await loadToolConfiguration('governor-gear-sailing-tool');
  const searchParams = await searchParamsPromise;
  const memberId = typeof searchParams?.member_id === 'string' ? searchParams.member_id : '';
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';

  return (
    <main className="armory wavebound-tool-page">
      <div className="armory-atmos" aria-hidden="true" />
      <span className="armory-rack-l" aria-hidden="true" />
      <span className="armory-rack-r" aria-hidden="true" />

      <div className="armory-inner wavebound-tool-inner">
        <div className="wavebound-tool-nav">
          <Link href={`/tools${query}`} className="wavebound-back">← Tools &amp; Calculators</Link>
          <span className="k-mark">Governor&apos;s Expedition</span>
        </div>

        <header className="armory-head wavebound-tool-head">
          <h1 className="k-display armory-title">Governor Gear Merge Optimizer</h1>
          <p className="k-narrative armory-lede">Plan the chest merges needed to reach your target Governor Gear tier without wasting the material type you need most.</p>
        </header>

        <GovernorGearSailingTool configuration={configuration} />
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

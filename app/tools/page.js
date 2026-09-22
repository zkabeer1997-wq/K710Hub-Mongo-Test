import { redirect } from 'next/navigation';
import Link from 'next/link';
import ToolsDirectory from './ToolsDirectory';

export const metadata = { title: 'K710 Tools & Calculators' };

export default async function ToolsPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const memberId = typeof searchParams?.member_id === 'string' ? searchParams.member_id : '';
  const category = typeof searchParams?.category === 'string' ? searchParams.category : '';
  if(category==='Research Costs')redirect('/tools/research-costs');
  if(['Building Costs','Construction Costs'].includes(category))redirect('/tools/construction-costs');
  const backHref = memberId ? `/player-record?member_id=${encodeURIComponent(memberId)}` : '/player-record';
  return <main className="armory tools-workshop">
    <div className="armory-atmos" aria-hidden="true"/><span className="armory-rack-l" aria-hidden="true"/><span className="armory-rack-r" aria-hidden="true"/>
    <div className="armory-inner tools-workshop-inner">
      <header className="armory-head tools-workshop-head"><span className="k-mark">Kingdom 710</span><h1 className="k-display armory-title">Tools &amp; Calculators</h1><p className="k-narrative armory-lede">Search or filter by category to find the calculator you need.</p><Link href="/glossary" className="tools-glossary-link">What do these terms mean?</Link></header>
      <ToolsDirectory memberId={memberId} category={category}/><Link href={backHref} className="tools-back">← Return to member page</Link>
    </div>
    <style>{`.tools-workshop{color:var(--parchment)}.tools-workshop-inner{width:min(1100px,100%)}.tools-workshop-head{margin-bottom:clamp(28px,5vh,48px)}.tools-back{display:inline-block;margin-top:34px;color:var(--brass);font-family:var(--font-body);font-size:12px;text-decoration:none;letter-spacing:.06em}.tools-back:hover{color:var(--gold-hot)}.tools-glossary-link{display:inline-block;margin-top:12px;color:var(--gold-hot);font-family:var(--font-body);font-size:12px;font-weight:600;text-decoration:underline;text-underline-offset:3px}@media(max-width:700px){.tools-workshop-inner{padding-top:86px}}`}</style>
  </main>;
}

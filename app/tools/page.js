import { redirect } from 'next/navigation';
import Link from 'next/link';
import Breadcrumbs from '../../components/Breadcrumbs';
import ToolsDirectory from './ToolsDirectory';
import PageHero from '../../components/ui/PageHero';
import { cookies } from 'next/headers';
import { getSavedToolPlans } from '../../lib/savedToolPlans.server';

export const metadata = { title: 'Tools & Calculators' };

export default async function ToolsPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const memberId = typeof searchParams?.member_id === 'string' ? searchParams.member_id : '';
  const category = typeof searchParams?.category === 'string' ? searchParams.category : '';
  if(category==='Research Costs')redirect('/tools/research-costs');
  if(['Building Costs','Construction Costs'].includes(category))redirect('/tools/construction-costs');
  const saved = await getSavedToolPlans(await cookies());
  const backHref = memberId ? `/dashboard?member_id=${encodeURIComponent(memberId)}` : '/dashboard';
  return <main className="armory tools-workshop">
    <div className="armory-atmos" aria-hidden="true"/><span className="armory-rack-l" aria-hidden="true"/><span className="armory-rack-r" aria-hidden="true"/>
    <div className="armory-inner tools-workshop-inner">
      <Breadcrumbs items={[{ label: 'Members', href: backHref }]} current="Tools & Calculators" />
      <PageHero tone="console" className="tools-workshop-head" eyebrow="Kingdom 710 · Members" title="Tools & Calculators" lede="Search or filter by category to find the calculator you need." actions={<Link href="/glossary" className="tools-glossary-link">What do these terms mean?</Link>} />
      <ToolsDirectory memberId={memberId} category={category} savedPlans={saved.plans}/>
    </div>
    <style>{`.tools-workshop{color:var(--parchment)}.tools-workshop-inner{width:min(1100px,100%)}.tools-workshop-head .ph-inner{padding-inline:0}.tools-workshop-head .ph-actions{margin-top:0}.tools-back{display:inline-block;margin-top:34px;color:var(--brass);font-family:var(--font-body);font-size:12px;text-decoration:none;letter-spacing:.06em}.tools-back:hover{color:var(--gold-hot)}.tools-glossary-link{display:inline-block;color:var(--gold-hot);font-family:var(--font-body);font-size:13px;font-weight:600;text-decoration:underline;text-underline-offset:3px}@media(max-width:700px){.tools-workshop-inner{padding-top:86px}}`}</style>
  </main>;
}

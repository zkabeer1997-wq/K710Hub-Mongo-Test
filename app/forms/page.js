import PageHero from '../../components/ui/PageHero';
import Breadcrumbs from '../../components/Breadcrumbs';
import FormsDirectory from './FormsDirectory';
import { getFormGates } from '../../lib/formGates.server.js';
import { getMemberFormCompletions } from '../../lib/formCompletionQueries.server.js';

export const metadata = {
  title: 'Forms',
};

export default async function FormsPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const memberId = typeof searchParams?.member_id === 'string' ? searchParams.member_id : '';
  const [gates, completions] = await Promise.all([
    getFormGates(),
    getMemberFormCompletions(memberId),
  ]);
  const closedKeys = Object.values(gates)
    .filter((gate) => gate.is_open === false)
    .map((gate) => gate.form_key);

  const backHref = memberId
    ? `/dashboard?member_id=${encodeURIComponent(memberId)}`
    : '/dashboard';

  return (
    <main className="armory tools-workshop forms-workshop">
      <div className="armory-atmos" aria-hidden="true" />
      <span className="armory-rack-l" aria-hidden="true" />
      <span className="armory-rack-r" aria-hidden="true" />
      <div className="armory-inner tools-workshop-inner">
        <Breadcrumbs items={[{ label: 'Members', href: backHref }]} current="Forms" />
        <PageHero tone="console" className="tools-workshop-head" eyebrow="Kingdom 710 · Members" title="Member Forms" lede="Update your profile and submit event forms for Kingdom 710." />

        <FormsDirectory memberId={memberId} closedKeys={closedKeys} completions={completions} />

      </div>
      <style>{`
        .forms-workshop{color:var(--parchment)}
        .tools-workshop-inner{width:min(1100px,100%)}
        .tools-workshop-head .ph-inner{padding-inline:0}
        .tools-back{display:inline-block;margin-top:34px;color:var(--brass);font-family:var(--font-body);font-size:12px;text-decoration:none;letter-spacing:.06em}
        .tools-back:hover{color:var(--gold-hot)}
        @media(max-width:700px){.tools-workshop-inner{padding-top:86px}}
      `}</style>
    </main>
  );
}

import Link from 'next/link';
import FormsDirectory from './FormsDirectory';
import { getFormGates } from '../../lib/formGates.server.js';

export const metadata = {
  title: 'K710 Forms',
};

export default async function FormsPage({ searchParams: searchParamsPromise }) {
  const searchParams = await searchParamsPromise;
  const memberId = typeof searchParams?.member_id === 'string' ? searchParams.member_id : '';
  const gates = await getFormGates();
  const closedKeys = Object.values(gates)
    .filter((gate) => gate.is_open === false)
    .map((gate) => gate.form_key);

  const backHref = memberId
    ? `/player-record?member_id=${encodeURIComponent(memberId)}`
    : '/player-record';

  return (
    <main className="armory tools-workshop forms-workshop">
      <div className="armory-atmos" aria-hidden="true" />
      <span className="armory-rack-l" aria-hidden="true" />
      <span className="armory-rack-r" aria-hidden="true" />
      <div className="armory-inner tools-workshop-inner">
        <header className="armory-head tools-workshop-head">
          <span className="k-mark">Kingdom 710</span>
          <h1 className="k-display armory-title">Member Forms</h1>
          <p className="k-narrative armory-lede">
            Update your profile and submit event forms for Kingdom 710.
          </p>
        </header>

        <FormsDirectory memberId={memberId} closedKeys={closedKeys} />

        <Link href={backHref} className="tools-back">
          ← Return to member page
        </Link>
      </div>
      <style>{`
        .forms-workshop{color:var(--parchment)}
        .tools-workshop-inner{width:min(1100px,100%)}
        .tools-workshop-head{margin-bottom:clamp(28px,5vh,48px)}
        .tools-back{display:inline-block;margin-top:34px;color:var(--brass);font-family:var(--font-body);font-size:12px;text-decoration:none;letter-spacing:.06em}
        .tools-back:hover{color:var(--gold-hot)}
        @media(max-width:700px){.tools-workshop-inner{padding-top:86px}}
      `}</style>
    </main>
  );
}

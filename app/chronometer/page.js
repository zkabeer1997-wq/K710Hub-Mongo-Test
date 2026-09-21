import PublicBearAlliances from '../../components/PublicBearAlliances';
import { loadPublicBearScheduleOrNull, bearAllianceNotes } from '../../lib/publicBearSchedule';
import Link from 'next/link';
import HomeEditableText from '../../components/HomeEditableText';
import { getHomeContent, checkIsAdmin } from '../../lib/homeContent';
import Chronometer from '../../components/kingdom/world/Chronometer';

export const metadata = {
  title: 'Bear Hunt Schedule & Transfers',
  description:
    'Kingdom 710 Bear Hunt times, alliance information, and transfer application steps.',
  alternates: { canonical: '/chronometer' },
};

// Recruitment copy still lives in content_blocks (page = 'home') and stays
// inline-editable by a logged-in admin. Moving the chamber here does not
// change the storage contract or the seeding behaviour.
export const dynamic = 'force-dynamic';
export const fetchCache = 'force-no-store';
export const revalidate = 0;



const DOCTRINE = [
  { n: 'I', titleKey: 'why-1-title', bodyKey: 'why-1-body' },
  { n: 'II', titleKey: 'why-2-title', bodyKey: 'why-2-body' },
  { n: 'III', titleKey: 'why-3-title', bodyKey: 'why-3-body' },
];

const MARCH = [
  { n: '01', titleKey: 'step-1-title', bodyKey: 'step-1-body' },
  { n: '02', titleKey: 'step-2-title', bodyKey: 'step-2-body' },
  { n: '03', titleKey: 'step-3-title', bodyKey: 'step-3-body' },
  { n: '04', titleKey: 'step-4-title', bodyKey: 'step-4-body' },
];

export default async function ChronometerPage() {
  const content = await getHomeContent();
  const bearAlliances = await loadPublicBearScheduleOrNull();
  const isAdmin = await checkIsAdmin();

  const field = (key, props = {}) => {
    if (key === 'why-1-title') return 'Alliance Bear Hunt times';
    if (key === 'why-1-body') return 'Each alliance keeps its current schedule here. Choose the times that work for you.';
    const c = content[key] || { id: null, text: '' };
    return (
      <HomeEditableText id={c.id} fieldKey={key} initialText={c.text} isAdmin={isAdmin} {...props} />
    );
  };

  return (
    <main className="chamber">
      <div className="chamber-atmos" aria-hidden="true" />
      <div className="chamber-shafts" aria-hidden="true" />

      {/* ---- The instrument ---- */}
      <section className="chamber-hero">
        <span className="k-mark">Kingdom 710</span>
        <h1 className="k-display chamber-title k-engraved">Bear Hunt Schedule</h1>
        <p className="k-narrative chamber-lede">
          Current daily Bear Hunt times for Kingdom 710’s alliances.
          All times below are shown in UTC.
        </p>
        <Chronometer initialAlliances={bearAlliances} />
      </section>

      {/* ---- Three alliance standards ---- */}
      <section className="chamber-section">
        <header className="chamber-head">
          <span className="k-mark">{field('wb-head-kicker')}</span>
          <h2 className="k-display chamber-h2">{field('wb-head-title')}</h2>
        </header>
        <PublicBearAlliances layout="chamber" initialAlliances={bearAlliances} notes={bearAllianceNotes(content)} />
      </section>

      {/* ---- About the kingdom ---- */}
      <section className="chamber-section">
        <header className="chamber-head">
          <span className="k-mark">{field('why-head-kicker')}</span>
          <h2 className="k-display chamber-h2">{field('why-head-title')}</h2>
        </header>
        <div className="doctrine">
          {DOCTRINE.map((d) => (
            <article key={d.n} className="doctrine-entry">
              <span className="doctrine-num k-display">{d.n}</span>
              <div>
                <h3 className="k-display doctrine-title">{field(d.titleKey)}</h3>
                <p className="k-narrative doctrine-body">{field(d.bodyKey)}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* ---- Transfer process ---- */}
      <section className="chamber-section">
        <header className="chamber-head">
          <span className="k-mark">{field('steps-head-kicker')}</span>
          <h2 className="k-display chamber-h2">{field('steps-head-title')}</h2>
        </header>
        <ol className="march">
          {MARCH.map((m) => (
            <li key={m.n} className="march-stone">
              <span className="march-marker" aria-hidden="true" />
              <span className="k-mark march-num">{m.n}</span>
              <h3 className="k-display march-title">{field(m.titleKey)}</h3>
              <p className="k-narrative march-body">{field(m.bodyKey)}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---- Transfer form ---- */}
      <section className="registry-doors">
        <div className="registry-doors-light" aria-hidden="true" />
        <span className="k-mark">The Registry</span>
        <h2 className="k-display registry-doors-title">The Clerk Is Waiting</h2>
        <p className="k-narrative registry-doors-copy">
          Bring your name, your strength, and your intent. The council reviews every petition.
        </p>
        <Link href="/interest" className="k-btn registry-doors-cta">
          Apply to Join K710
        </Link>
      </section>
    </main>
  );
}

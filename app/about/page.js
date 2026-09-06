import { stripLegacyBearCopy } from '../../lib/publicBearSchedule';
import Link from 'next/link';
import { AllianceBearTimes } from '../../components/BearScheduleProvider';
import EditableSection from '../../components/EditableSection';
import { getBlocks, checkIsAdmin } from '../../lib/contentBlocks';
import { getHomeContent } from '../../lib/homeContent';
import { getCollection } from '../../lib/mongo';
import { COLLECTIONS } from '../../lib/mongoCollections';
import { Button, Card, Tag } from '../../components/ui';
import {
  OPTIMIZER_RECORD,
  ATLAS_RANKING,
  OPTIMIZER_KINGDOM_URL,
  OPTIMIZER_RANKINGS_URL,
  ATLAS_KINGDOM_URL,
} from '../../lib/kingdomExternalData.mjs';

export const metadata = {
  title: 'About',
  description:
    'About Kingdom 710 — alliances, competitive KvK record, and live Optimizer & Atlas rankings.',
  alternates: { canonical: '/about' },
};

const DOCTRINE_KEYS = [
  { titleKey: 'why-1-title', bodyKey: 'why-1-body' },
  { titleKey: 'why-2-title', bodyKey: 'why-2-body' },
  { titleKey: 'why-3-title', bodyKey: 'why-3-body' },
];

const STATUS_LABEL = { open: 'Recruiting', selective: 'Selective', closed: 'Closed' };
const STATUS_TONE = { open: 'success', selective: 'accent', closed: 'neutral' };

async function loadAlliances() {
  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    const data = await coll
      .find({ active: true })
      .project({
        tag: 1,
        name: 1,
        blurb: 1,
        timezone_focus: 1,
        recruiting_status: 1,
        language: 1,
        roster_size: 1,
        bear_times_utc: 1,
        sort_order: 1,
        _id: 0,
      })
      .sort({ sort_order: 1 })
      .toArray();
    return data || [];
  } catch (error) {
    console.error('about alliances load failed', error);
    return [];
  }
}

export default async function AboutPage() {
  const [recordBlocks, sourcesBlocks, isAdmin, homeContent, alliances] = await Promise.all([
    getBlocks('about-record'),
    getBlocks('about-sources'),
    checkIsAdmin(),
    getHomeContent(),
    loadAlliances(),
  ]);

  const hasSources = sourcesBlocks.length > 0;
  const rec = OPTIMIZER_RECORD;
  const atlas = ATLAS_RANKING;

  return (
    <main className="theme-realm about-page">
      <div className="about-page-inner">
        <header className="about-head">
          <div className="about-head-copy">
            <span className="k-mark">Kingdom 710</span>
            <h1 className="about-title">About Kingdom 710</h1>
            <p className="about-lede">
              Kingdom 710 includes three alliances: 710, RED, and SKY. We coordinate KvK preparation,
              run seven Bear Hunt times, and share the same events, guides, forms, and member tools.
            </p>
            <nav className="about-jump" aria-label="About page sections">
              <a href="#alliances">Meet the alliances</a>
              <a href="#competitive-record">See our record</a>
            </nav>
          </div>
          <div className="about-standard" aria-label="Kingdom 710 standard">
            <span className="about-standard-ring" aria-hidden="true" />
            <span className="about-standard-crown" aria-hidden="true">♜</span>
            <strong>710</strong>
            <span>710 · RED · SKY</span>
          </div>
        </header>

        <section className="about-section">
          <div className="about-section-heading">
            <h2 className="about-section-title">How the kingdom works</h2>
            <p>These are the practical arrangements shared across all three alliances.</p>
          </div>
          <div className="about-doctrine">
            {DOCTRINE_KEYS.map((d) => (
              <Card key={d.titleKey} className="about-doctrine-card">
                <h3>{homeContent[d.titleKey]?.text || d.titleKey}</h3>
                <p>{homeContent[d.bodyKey]?.text || ''}</p>
              </Card>
            ))}
          </div>
        </section>

        <section id="alliances" className="about-section">
          <div className="about-section-heading">
            <h2 className="about-section-title">Alliances</h2>
            <p>Open an alliance page for Bear Hunt times and leadership contacts.</p>
          </div>
          <div className="about-alliance-grid">
            {(alliances || []).map((a) => (
              <Link key={a.tag} href={`/alliances/${String(a.tag).toLowerCase()}`} className="about-alliance-card">
                <div className="about-alliance-card-head">
                  <Tag band={a.tag}>{a.tag}</Tag>
                  <Tag tone={STATUS_TONE[a.recruiting_status] || 'neutral'}>
                    {STATUS_LABEL[a.recruiting_status] || a.recruiting_status}
                  </Tag>
                </div>
                <strong>{a.name}</strong>
                {stripLegacyBearCopy(a.blurb) && <p>{stripLegacyBearCopy(a.blurb)}</p>}
                <AllianceBearTimes tag={a.tag} initialTimes={a.bear_times_utc} />
              </Link>
            ))}
          </div>
          <Button href="/interest" variant="struck">Apply to transfer</Button>
        </section>

        <section id="competitive-record" className="about-section">
          <div className="about-section-heading">
            <h2 className="about-section-title">Competitive record</h2>
            <p>Live rankings and recent results from public leaderboards.</p>
          </div>
          <EditableSection page="about-record" initialBlocks={recordBlocks} isAdmin={isAdmin} />
          <div className="about-rank-links">
            <a href={OPTIMIZER_KINGDOM_URL} target="_blank" rel="noreferrer">Optimizer kingdom</a>
            <a href={OPTIMIZER_RANKINGS_URL} target="_blank" rel="noreferrer">Optimizer rankings</a>
            <a href={ATLAS_KINGDOM_URL} target="_blank" rel="noreferrer">Atlas kingdom</a>
          </div>
          {hasSources && (
            <EditableSection page="about-sources" initialBlocks={sourcesBlocks} isAdmin={isAdmin} />
          )}
        </section>
      </div>
      <style>{`
        .about-page{padding:56px 24px 96px;background:var(--color-bg);color:var(--color-ink);min-height:100vh}
        .about-page-inner{max-width:960px;margin:0 auto;display:flex;flex-direction:column;gap:40px}
        .about-title{margin:8px 0;font-family:var(--font-display);font-size:clamp(32px,5vw,48px)}
        .about-lede{color:var(--color-ink-muted);max-width:60ch}
        .about-jump{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px}
        .about-jump a{color:var(--color-accent-strong);font-weight:700;text-decoration:none}
        .about-alliance-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}
        .about-alliance-card{display:flex;flex-direction:column;gap:8px;padding:16px;border:1px solid var(--color-border);border-radius:12px;text-decoration:none;color:inherit;background:var(--color-surface)}
        .about-doctrine{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}
        .about-doctrine-card{padding:16px}
        .about-rank-links{display:flex;gap:16px;flex-wrap:wrap;margin-top:12px}
        .about-rank-links a{color:var(--color-accent-strong);font-weight:700}
        @media (max-width:720px){.about-doctrine{grid-template-columns:1fr}}
      `}</style>
    </main>
  );
}

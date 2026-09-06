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
              run daily Bear Hunts, and share the same events, guides, forms, and member tools.
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
            {DOCTRINE_KEYS.map((d, i) => (
              <Card key={d.titleKey} className="about-doctrine-card">
                <span className="k-mark">{['I', 'II', 'III'][i]}</span>
                <h3>{d.titleKey === 'why-1-title' ? 'Alliance Bear Hunt times' : homeContent[d.titleKey]?.text}</h3>
                <p>{d.bodyKey === 'why-1-body' ? 'Each alliance’s current UTC schedule is shown below. Choose the times that work for you.' : homeContent[d.bodyKey]?.text}</p>
              </Card>
            ))}
          </div>
        </section>

        <section className="about-section" id="alliances">
          <div className="about-section-heading split">
            <h2 className="about-section-title">Our three alliances</h2>
            <p className="about-section-lede">
              Each alliance has its own Bear Hunt times, leadership, languages, and current recruiting status.
            </p>
          </div>
          {alliances.length === 0 ? (
            <Card className="about-empty">Alliance directory is loading or unavailable right now.</Card>
          ) : (
            <div className="about-alliances-grid">
              {alliances.map((a) => (
                <Link key={a.tag} href={`/alliances/${a.tag.toLowerCase()}`} className="about-alliance-link">
                  <Card className="about-alliance-card">
                    <div className="about-alliance-head">
                      <Tag band={a.tag}>{a.tag}</Tag>
                      <Tag tone={STATUS_TONE[a.recruiting_status] || 'neutral'}>
                        {STATUS_LABEL[a.recruiting_status] || a.recruiting_status}
                      </Tag>
                    </div>
                    <h3 className="about-alliance-name">{a.name}</h3>
                    {stripLegacyBearCopy(a.blurb) && <p className="about-alliance-blurb">{stripLegacyBearCopy(a.blurb)}</p>}
                    <dl className="about-alliance-facts">
                      <div><dt>Bear Hunts</dt><dd><AllianceBearTimes tag={a.tag} initialTimes={a.bear_times_utc} /></dd></div>
                      {a.timezone_focus && (
                        <div><dt>Timezone</dt><dd>{a.timezone_focus}</dd></div>
                      )}
                      {a.roster_size != null && (
                        <div><dt>Roster</dt><dd>{a.roster_size}</dd></div>
                      )}
                      {a.language && (
                        <div><dt>Language</dt><dd>{a.language}</dd></div>
                      )}
                    </dl>
                    <span className="about-alliance-more">View alliance →</span>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="about-section" id="competitive-record">
          <div className="about-section-heading split">
            <h2 className="about-section-title">KvK record</h2>
            <p className="about-section-lede">
              Competitive record verified through{' '}
              <a href={OPTIMIZER_KINGDOM_URL} target="_blank" rel="noopener noreferrer">
                Kingshot Optimizer
              </a>.
            </p>
          </div>
          <Card className="about-record-card">
            <div className="about-record-stats">
              <div>
                <span className="about-stat-label">KvKs</span>
                <strong>{rec.kvksParticipated}</strong>
              </div>
              <div>
                <span className="about-stat-label">Prep</span>
                <strong className="about-stat-split">
                  <span className="win">{rec.prep.wins}</span>
                  <span className="sep">–</span>
                  <span className="loss">{rec.prep.losses}</span>
                </strong>
              </div>
              <div>
                <span className="about-stat-label">Battle</span>
                <strong className="about-stat-split">
                  <span className="win">{rec.battle.wins}</span>
                  <span className="sep">–</span>
                  <span className="loss">{rec.battle.losses}</span>
                </strong>
              </div>
              <div>
                <span className="about-stat-label">Rating</span>
                <strong>{rec.rating}</strong>
              </div>
              <div>
                <span className="about-stat-label">Rank</span>
                <strong className="about-rank">#{rec.rank}</strong>
              </div>
            </div>
            <div className="about-record-matchups">
              <div>
                <span className="about-stat-label">Latest matchup · KvK {rec.latestMatchup.kvk}</span>
                <p>
                  vs K{rec.latestMatchup.opponent}
                  <span className="muted"> (#{rec.latestMatchup.opponentRank})</span>
                  {' · '}
                  <span className="win">Prep {rec.latestMatchup.prep}</span>
                  {' · '}
                  <span className="win">Battle {rec.latestMatchup.battle}</span>
                </p>
              </div>
              <div>
                <span className="about-stat-label">Toughest matchup · KvK {rec.toughestMatchup.kvk}</span>
                <p>
                  vs K{rec.toughestMatchup.opponent}
                  <span className="muted"> (#{rec.toughestMatchup.opponentRank})</span>
                  {' · '}
                  <span className="loss">Prep {rec.toughestMatchup.prep}</span>
                  {' · '}
                  <span className="loss">Battle {rec.toughestMatchup.battle}</span>
                </p>
              </div>
            </div>
            <a
              className="about-external-link"
              href={OPTIMIZER_KINGDOM_URL}
              target="_blank"
              rel="noopener noreferrer"
            >
              Open full record on Optimizer →
            </a>
          </Card>
          {isAdmin && (
            <div className="about-admin-note">
              <EditableSection
                page="about-record"
                initialBlocks={recordBlocks}
                isAdmin={isAdmin}
                as="div"
                className="about-editable"
              />
            </div>
          )}
        </section>

        <section className="about-section" id="kingdom-rankings">
          <h2 className="about-section-title">Kingdom Rankings</h2>
          <div className="about-rankings-grid">
            <Card className="about-rank-box about-rank-optimizer">
              <h3>Optimizer Ranking</h3>
              <p className="about-rank-source">Kingshot Optimizer</p>
              <dl className="about-rank-facts">
                <div><dt>Rank</dt><dd>#{rec.rank}</dd></div>
                <div><dt>Rating</dt><dd>{rec.rating}</dd></div>
                <div><dt>Prep</dt><dd>{rec.prep.wins}–{rec.prep.losses}</dd></div>
                <div><dt>Battle</dt><dd>{rec.battle.wins}–{rec.battle.losses}</dd></div>
                <div><dt>KvKs</dt><dd>{rec.kvksParticipated}</dd></div>
              </dl>
              <a href={OPTIMIZER_RANKINGS_URL} target="_blank" rel="noopener noreferrer" className="about-external-link">
                View on Optimizer rankings →
              </a>
            </Card>

            <Card className="about-rank-box about-rank-atlas">
              <h3>Atlas Ranking</h3>
              <p className="about-rank-source">Kingshot Atlas</p>
              <div className="about-atlas-pill">
                <span>Atlas Score: <strong>{atlas.atlasScore}</strong></span>
                <span>Rank: <strong>#{atlas.rank}</strong></span>
                <span className="about-atlas-top">Top {atlas.topPercent}</span>
              </div>
              {atlas.tier && <p className="about-atlas-tier">{atlas.tier}</p>}
              <a href={ATLAS_KINGDOM_URL} target="_blank" rel="noopener noreferrer" className="about-external-link">
                View on Atlas →
              </a>
            </Card>
          </div>
        </section>

        <section className="about-section">
          <h2 className="about-section-title">Sources</h2>
          {(hasSources || isAdmin) ? (
            <EditableSection page="about-sources" initialBlocks={sourcesBlocks} isAdmin={isAdmin} as="div" className="about-editable" />
          ) : (
            <Card className="about-empty">
              Rankings and competitive record are sourced from{' '}
              <a href={OPTIMIZER_KINGDOM_URL} target="_blank" rel="noopener noreferrer">Kingshot Optimizer</a>
              {' '}and{' '}
              <a href={ATLAS_KINGDOM_URL} target="_blank" rel="noopener noreferrer">Kingshot Atlas</a>.
            </Card>
          )}
        </section>

        <section className="about-section about-links">
          <Button href="/timeline" variant="quiet">Kingdom timeline →</Button>
          <Button href="/chronometer" variant="quiet">Read the full recruitment story →</Button>
        </section>
      </div>
    </main>
  );
}

import { stripLegacyBearCopy } from '../../lib/publicBearSchedule';
import Link from 'next/link';
import { AllianceBearTimes } from '../../components/BearScheduleProvider';
import EditableSection from '../../components/EditableSection';
import { getBlocks, checkIsAdmin } from '../../lib/contentBlocks';
import { getHomeContent } from '../../lib/homeContent';
import { createAdminSupabaseClient } from '../../lib/adminSupabase';
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
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('alliances')
      .select('tag, name, blurb, timezone_focus, recruiting_status, language, roster_size, bear_times_utc')
      .eq('active', true)
      .order('sort_order', { ascending: true });
    if (error) throw error;
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

      <style>{`
        .about-page{padding:0 24px 112px;background:var(--color-bg);color:var(--color-ink);min-height:100vh;overflow:hidden}
        .about-page-inner{max-width:1120px;margin:0 auto;display:flex;flex-direction:column;gap:clamp(64px,9vw,112px)}
        .about-head{position:relative;display:grid;grid-template-columns:minmax(0,1.35fr) minmax(280px,.65fr);align-items:center;gap:clamp(36px,7vw,96px);min-height:600px;padding:80px 0 72px}
        .about-head:before{content:'';position:absolute;inset:0 -50vw;background:radial-gradient(circle at 72% 45%,rgba(217,122,31,.16),transparent 32%),linear-gradient(135deg,#24170b 0%,#3b2410 58%,#7b4018 100%);z-index:0}
        .about-head:after{content:'K710';position:absolute;left:-8px;bottom:20px;color:rgba(255,246,228,.045);font:800 clamp(96px,18vw,230px)/.75 var(--font-display);letter-spacing:-.03em;z-index:0}
        .about-head-copy{position:relative;z-index:1;color:#fff6e4}
        .about-head .k-mark{color:#f3d99a}
        .about-title{max-width:720px;margin:14px 0 0;font-family:var(--font-display);font-size:clamp(48px,7vw,82px);line-height:.98;letter-spacing:-.035em;text-wrap:balance}
        .about-lede{margin:24px 0 0;font-size:clamp(16px,2vw,19px);line-height:1.65;color:#e9d9bd;max-width:62ch;text-wrap:pretty}
        .about-jump{display:flex;flex-wrap:wrap;gap:12px;margin-top:32px}
        .about-jump a{display:inline-flex;padding:11px 15px;border:1px solid rgba(243,217,154,.42);border-radius:var(--radius-sm);color:#fff6e4;font-size:13px;font-weight:800;text-decoration:none;transition:background .2s ease,color .2s ease,transform .2s ease}
        .about-jump a:hover{background:#f3d99a;color:#24170b;transform:translateY(-2px)}
        .about-standard{position:relative;z-index:1;aspect-ratio:4/5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#fff6e4;background:linear-gradient(160deg,#a3283c,#611620);border:1px solid rgba(243,217,154,.5);clip-path:polygon(0 0,100% 0,100% 84%,50% 100%,0 84%);filter:drop-shadow(0 12px 8px rgba(0,0,0,.28))}
        .about-standard:before,.about-standard:after{content:'';position:absolute;inset:14px;border:1px solid rgba(243,217,154,.34);clip-path:inherit}
        .about-standard:after{inset:24px;border-color:rgba(243,217,154,.12)}
        .about-standard-ring{position:absolute;width:62%;aspect-ratio:1;border:1px solid rgba(243,217,154,.26);border-radius:50%}
        .about-standard-crown{font-size:28px;color:#f3d99a;line-height:1}
        .about-standard strong{font:800 clamp(54px,7vw,84px)/1 var(--font-display);letter-spacing:-.03em}
        .about-standard > span:last-child{max-width:14ch;text-align:center;color:#f3d99a;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
        .about-section{scroll-margin-top:96px}
        .about-section-heading{margin-bottom:24px;max-width:700px}
        .about-section-heading.split{display:grid;grid-template-columns:minmax(220px,.8fr) minmax(260px,1.2fr);gap:48px;align-items:end;max-width:none;border-bottom:1px solid var(--color-border);padding-bottom:24px}
        .about-section-heading p{margin:8px 0 0;color:var(--color-ink-muted);line-height:1.6}
        .about-section-title{margin:0;font-family:var(--font-display);font-size:clamp(30px,4vw,48px);line-height:1.05;letter-spacing:-.025em;text-wrap:balance}
        .about-section-lede{margin:0 0 16px;font-size:14px;color:var(--color-ink-muted);line-height:1.5}
        .about-section-lede a{color:var(--color-accent-strong)}
        .about-doctrine{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}
        .about-doctrine-card{padding:28px 30px;display:flex;flex-direction:column;gap:10px;border:0;border-radius:0;background:transparent}
        .about-doctrine-card+.about-doctrine-card{border-left:1px solid var(--color-border)}
        .about-doctrine-card .k-mark{color:var(--color-accent)}
        .about-doctrine-card h3{margin:0;font-family:var(--font-display);font-size:16px}
        .about-doctrine-card p{margin:0;font-size:13.5px;color:var(--color-ink-muted);line-height:1.55}
        .about-alliances-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:18px}
        .about-alliance-link{text-decoration:none;color:inherit;display:block}
        .about-alliance-card{position:relative;overflow:hidden;padding:24px;display:flex;flex-direction:column;gap:12px;height:100%;min-height:270px;transition:background .2s,transform .2s}
        .about-alliance-card:after{content:attr(data-band);position:absolute;right:-5px;bottom:-18px;font:800 86px/1 var(--font-display);color:rgba(44,28,12,.04)}
        .about-alliance-link:hover .about-alliance-card{background:var(--color-surface-alt);transform:translateY(-4px)}
        .about-alliance-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
        .about-alliance-name{margin:0;font-family:var(--font-display);font-size:18px}
        .about-alliance-blurb{margin:0;color:var(--color-ink-muted);font-size:13px;line-height:1.5}
        .about-alliance-facts{margin:0;display:flex;flex-direction:column;gap:4px}
        .about-alliance-facts div{display:flex;justify-content:space-between;gap:8px;font-size:12px;border-top:1px solid var(--color-border);padding-top:6px}
        .about-alliance-facts dt{color:var(--color-ink-muted);margin:0}
        .about-alliance-facts dd{margin:0;font-weight:700}
        .about-alliance-more{margin-top:auto;color:var(--color-accent-strong);font-weight:700;font-size:12.5px}
        .about-record-card{padding:clamp(24px,4vw,40px);display:flex;flex-direction:column;gap:28px;background:#2c1c0c;color:#fff6e4;border:0}
        .about-record-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:12px}
        .about-stat-label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#c4b493;margin-bottom:6px}
        .about-record-stats strong{font-size:clamp(26px,4vw,40px);font-family:var(--font-display)}
        .about-rank{color:var(--color-accent-strong)}
        .about-stat-split .win{color:#3ecf8e}
        .about-stat-split .loss{color:#f07178}
        .about-stat-split .sep{margin:0 2px;color:var(--color-ink-muted)}
        .about-record-matchups{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;font-size:13.5px}
        .about-record-matchups p{margin:4px 0 0}
        .about-record-matchups .win{color:#3ecf8e;text-transform:capitalize}
        .about-record-matchups .loss{color:#f07178;text-transform:capitalize}
        .about-record-matchups .muted{color:#c4b493}
        .about-rankings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
        .about-rank-box{padding:20px;display:flex;flex-direction:column;gap:10px}
        .about-rank-box h3{margin:0;font-family:var(--font-display);font-size:18px}
        .about-rank-source{margin:0;font-size:12px;color:var(--color-ink-muted)}
        .about-rank-facts{margin:0;display:flex;flex-direction:column;gap:6px}
        .about-rank-facts div{display:flex;justify-content:space-between;font-size:13.5px;border-top:1px solid var(--color-border);padding-top:6px}
        .about-rank-facts dt{margin:0;color:var(--color-ink-muted)}
        .about-rank-facts dd{margin:0;font-weight:700}
        .about-atlas-pill{display:flex;flex-wrap:wrap;gap:8px;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,rgba(56,140,220,.18),rgba(80,120,255,.12));border:1px solid rgba(100,160,255,.35);font-size:13.5px}
        .about-atlas-pill .about-atlas-top{color:#7ec8ff;font-weight:700}
        .about-atlas-tier{margin:0;font-size:13px;color:var(--color-accent-strong);font-weight:700}
        .about-external-link{margin-top:auto;font-size:13px;font-weight:700;color:var(--color-accent-strong);text-decoration:none}
        .about-external-link:hover{text-decoration:underline}
        .about-empty{padding:18px;color:var(--color-ink-muted);font-size:14px}
        .about-empty a{color:var(--color-accent-strong)}
        .about-links{display:flex;gap:12px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--color-border)}
        .about-admin-note{margin-top:12px}
        @media (max-width:760px){.about-head{grid-template-columns:1fr;min-height:auto;padding:64px 0}.about-head:before{right:-24px}.about-standard{width:min(260px,72vw);justify-self:center}.about-section-heading.split{grid-template-columns:1fr;gap:12px}.about-doctrine{grid-template-columns:1fr}.about-doctrine-card+.about-doctrine-card{border-left:0;border-top:1px solid var(--color-border)}}
        @media (prefers-reduced-motion:reduce){.about-jump a,.about-alliance-card{transition:none}}
      `}</style>
    </main>
  );
}

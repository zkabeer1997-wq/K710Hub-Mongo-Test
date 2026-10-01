import { stripLegacyBearCopy } from '../../lib/publicBearSchedule';
import Link from 'next/link';
import { AllianceBearTimes } from '../../components/BearScheduleProvider';
import EditableSection from '../../components/EditableSection';
import { getBlocks, checkIsAdmin } from '../../lib/contentBlocks';
import HomeEditableText from '../../components/HomeEditableText';
import { getHomeContent } from '../../lib/homeContent';
import { getCollection } from '../../lib/mongo';
import { COLLECTIONS } from '../../lib/mongoCollections';
import { Button, Card, Tag, PageHero, SectionHeader } from '../../components/ui';
import {
  OPTIMIZER_RECORD,
  ATLAS_RANKING,
  OPTIMIZER_KINGDOM_URL,
  OPTIMIZER_RANKINGS_URL,
  ATLAS_KINGDOM_URL,
  KINGDOM_DATA_AS_OF,
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

const MARCH = [1, 2, 3, 4].map((n) => ({ n: `0${n}`, titleKey: `step-${n}-title`, bodyKey: `step-${n}-body` }));

const FAQ = [
  {
    q: 'How long does the transfer take?',
    a: 'Most transfers are reviewed within a day or two. New intake windows open regularly — apply now and we will confirm your place when the next window lands.',
  },
  {
    q: 'Do I need to leave my current alliance first?',
    a: 'No. Send your application first. Leadership will walk you through the timing so you do not lose progress or leave before there is a spot ready for you.',
  },
  {
    q: 'What happens after I apply?',
    a: 'Your application goes to the council, who review your account, preferred event times, and KvK plans. You will be contacted about migration and which of the three alliances fits you best.',
  },
  {
    q: 'Who do I contact if I have questions?',
    a: 'The transfer form has a contact field, and our leadership monitors it daily. Ask anything there — no question is too small before you commit to moving.',
  },
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

  const field = (key, props = {}) => {
    const c = homeContent[key] || { id: null, text: '' };
    return <HomeEditableText id={c.id} fieldKey={key} initialText={c.text} isAdmin={isAdmin} {...props} />;
  };

  const hasSources = sourcesBlocks.length > 0;
  const rec = OPTIMIZER_RECORD;
  const atlas = ATLAS_RANKING;
  const dataAsOf = new Date(`${KINGDOM_DATA_AS_OF}T00:00:00Z`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' });

  return (
    <main className="theme-realm about-page">
      <PageHero
        eyebrow="Kingdom 710"
        title="About Kingdom 710"
        lede="Kingdom 710 includes three alliances: 710, RED, and SKY. We coordinate KvK preparation, run daily Bear Hunts, and share the same events, guides, forms, and member tools."
        actions={<><a href="#alliances">Meet the alliances</a><a href="#competitive-record">See our record</a></>}
        aside={
          <div className="about-standard" aria-label="Kingdom 710 standard">
            <span className="about-standard-ring" aria-hidden="true" />
            <span className="about-standard-crown" aria-hidden="true">♜</span>
            <strong>710</strong>
            <span>710 · RED · SKY</span>
          </div>
        }
      />
      <div className="about-page-inner">

        <section className="about-section">
          <SectionHeader title="How the kingdom works" className="about-sh" lede="These are the practical arrangements shared across all three alliances." />
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
          <SectionHeader title="Our three alliances" className="about-sh" lede="Each alliance has its own Bear Hunt times, leadership, languages, and current recruiting status." />
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
          <span id="kingdom-rankings" aria-hidden="true" />
          <SectionHeader title="KvK record and rankings" className="about-sh" lede={`Data as of ${dataAsOf}. Snapshot from Kingshot Optimizer and Kingshot Atlas; the linked pages are always current.`} />
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
                <span className="about-stat-label">Optimizer rating</span>
                <strong>{rec.rating}</strong>
              </div>
              <div>
                <span className="about-stat-label">Optimizer rank</span>
                <strong className="about-rank">#{rec.rank}</strong>
              </div>
              <div>
                <span className="about-stat-label">Atlas rank</span>
                <strong className="about-rank">#{atlas.rank}</strong>
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
              <div>
                <span className="about-stat-label">Atlas</span>
                <p>Score {atlas.atlasScore} · Top {atlas.topPercent}{atlas.tier ? ` · ${atlas.tier}` : ''}</p>
              </div>
            </div>
            <p className="about-record-sources">
              Sources:{' '}
              <a href={OPTIMIZER_KINGDOM_URL} target="_blank" rel="noopener noreferrer">Kingshot Optimizer record</a>,{' '}
              <a href={OPTIMIZER_RANKINGS_URL} target="_blank" rel="noopener noreferrer">Optimizer rankings</a>,{' '}
              <a href={ATLAS_KINGDOM_URL} target="_blank" rel="noopener noreferrer">Kingshot Atlas</a>.
            </p>
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

        {(hasSources || isAdmin) && (
          <section className="about-section">
            <SectionHeader title="More sources" className="about-sh" />
            <EditableSection page="about-sources" initialBlocks={sourcesBlocks} isAdmin={isAdmin} as="div" className="about-editable" />
          </section>
        )}

        <section className="about-section" id="how-to-transfer">
          <SectionHeader title="How transferring works" className="about-sh" lede="Four steps from application to your first Bear Hunt." />
          <ol className="about-march">
            {MARCH.map((m) => (
              <li key={m.n}>
                <span className="k-mark">Step {m.n}</span>
                <h3>{field(m.titleKey, { as: 'span' })}</h3>
                <p>{field(m.bodyKey, { as: 'span' })}</p>
              </li>
            ))}
          </ol>
          <div className="about-faq">
            {FAQ.map((item) => (
              <details key={item.q}>
                <summary>{item.q}</summary>
                <p>{item.a}</p>
              </details>
            ))}
          </div>
          <div className="about-apply">
            <p>Ready to move? The council reviews every application.</p>
            <Button href="/interest">Apply to transfer</Button>
          </div>
        </section>

        <section className="about-section about-links">
          <Button href="/timeline" variant="quiet">Release timeline →</Button>
          <Button href="/interest" variant="quiet">Transfer application →</Button>
        </section>
      </div>

      <style>{`
        .about-page{padding:0 0 112px;background:var(--color-bg);color:var(--color-ink);min-height:100vh;overflow:hidden}
        .about-page-inner{max-width:1120px;margin:0 auto;padding:clamp(64px,9vw,112px) 24px 0;display:flex;flex-direction:column;gap:clamp(64px,9vw,112px)}
        .about-standard{position:relative;z-index:1;width:min(300px,100%);justify-self:end;aspect-ratio:4/5;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;color:#fff6e4;background:linear-gradient(160deg,#a3283c,#611620);border:1px solid rgba(243,217,154,.5);clip-path:polygon(0 0,100% 0,100% 84%,50% 100%,0 84%);filter:drop-shadow(0 12px 8px rgba(0,0,0,.28))}
        .about-standard:before,.about-standard:after{content:'';position:absolute;inset:14px;border:1px solid rgba(243,217,154,.34);clip-path:inherit}
        .about-standard:after{inset:24px;border-color:rgba(243,217,154,.12)}
        .about-standard-ring{position:absolute;width:62%;aspect-ratio:1;border:1px solid rgba(243,217,154,.26);border-radius:50%}
        .about-standard-crown{font-size:28px;color:#f3d99a;line-height:1}
        .about-standard strong{font:800 clamp(54px,7vw,84px)/1 var(--font-display);letter-spacing:-.03em}
        .about-standard > span:last-child{max-width:14ch;text-align:center;color:#f3d99a;font-size:11px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}
        .about-section{scroll-margin-top:96px}
        .about-sh{margin-bottom:24px;padding-bottom:20px;border-bottom:1px solid var(--color-border)}.about-sh .sh-title{font-size:clamp(30px,4vw,46px)}.about-sh .sh-lede a{color:var(--color-link)}
        .about-doctrine{display:grid;grid-template-columns:repeat(3,1fr);border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}
        .about-doctrine-card{padding:28px 30px;display:flex;flex-direction:column;gap:10px;border:0;border-radius:0;background:transparent}
        .about-doctrine-card+.about-doctrine-card{border-left:1px solid var(--color-border)}
        .about-doctrine-card .k-mark{color:var(--color-accent-text)}
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
        .about-alliance-more{margin-top:auto;color:var(--color-link);font-weight:700;font-size:12.5px}
        .about-record-card{padding:clamp(24px,4vw,40px);display:flex;flex-direction:column;gap:28px;background:#2c1c0c;color:#fff6e4;border:0}
        .about-record-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:12px}
        .about-stat-label{display:block;font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#c4b493;margin-bottom:6px}
        .about-record-stats strong{font-size:clamp(26px,4vw,40px);font-family:var(--font-display)}
        .about-rank{color:var(--color-link)}
        .about-record-card .about-rank,.about-record-card .about-external-link{color:var(--hero-eyebrow)}
        .about-stat-split .win{color:#3ecf8e}
        .about-stat-split .loss{color:#f07178}
        .about-stat-split .sep{margin:0 2px;color:rgba(255,246,228,.7)}
        .about-record-matchups{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;font-size:13.5px}
        .about-record-matchups p{margin:4px 0 0}
        .about-record-matchups .win{color:#3ecf8e;text-transform:capitalize}
        .about-record-matchups .loss{color:#f07178;text-transform:capitalize}
        .about-record-matchups .muted{color:#c4b493}
        .about-record-sources{margin:0;font-size:12.5px;color:#c4b493}.about-record-sources a{color:var(--hero-eyebrow)}
        .about-rankings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
        .about-rank-box{padding:20px;display:flex;flex-direction:column;gap:10px}
        .about-rank-box h3{margin:0;font-family:var(--font-display);font-size:18px}
        .about-rank-source{margin:0;font-size:12px;color:var(--color-ink-muted)}
        .about-rank-facts{margin:0;display:flex;flex-direction:column;gap:6px}
        .about-rank-facts div{display:flex;justify-content:space-between;font-size:13.5px;border-top:1px solid var(--color-border);padding-top:6px}
        .about-rank-facts dt{margin:0;color:var(--color-ink-muted)}
        .about-rank-facts dd{margin:0;font-weight:700}
        .about-atlas-pill{display:flex;flex-wrap:wrap;gap:8px;padding:12px 14px;border-radius:12px;background:linear-gradient(135deg,rgba(56,140,220,.18),rgba(80,120,255,.12));border:1px solid rgba(100,160,255,.35);font-size:13.5px}
        .about-atlas-pill .about-atlas-top{color:#1a5c96;font-weight:700}
        .about-atlas-tier{margin:0;font-size:13px;color:color-mix(in srgb, var(--color-accent-strong) 50%, var(--color-ink));font-weight:700}
        .about-external-link{margin-top:auto;font-size:13px;font-weight:700;color:var(--color-link);text-decoration:none}
        .about-rank-box .about-external-link{color:color-mix(in srgb, var(--color-accent-strong) 50%, var(--color-ink))}
        .about-external-link:hover{text-decoration:underline}
        .about-march{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border)}
        .about-march li{padding:24px 24px;display:flex;flex-direction:column;gap:8px}
        .about-march li+li{border-left:1px solid var(--color-border)}
        .about-march .k-mark{color:var(--color-accent-text)}
        .about-march h3{margin:0;font-family:var(--font-display);font-size:17px}
        .about-march p{margin:0;font-size:13.5px;color:var(--color-ink-muted);line-height:1.55}
        .about-faq{margin-top:28px;max-width:760px}
        .about-faq details{border-bottom:1px solid var(--color-border)}
        .about-faq summary{cursor:pointer;padding:16px 4px;font-weight:700;color:var(--color-ink)}
        .about-faq summary:focus-visible{outline:2px solid var(--color-accent-strong);outline-offset:2px}
        .about-faq p{margin:0 0 16px;padding:0 4px;color:var(--color-ink-muted);line-height:1.65;max-width:68ch}
        .about-apply{display:flex;align-items:center;gap:20px;flex-wrap:wrap;margin-top:32px}
        .about-apply p{margin:0;font-family:var(--font-display);font-size:clamp(20px,2.4vw,26px)}
        @media(max-width:860px){.about-march{grid-template-columns:1fr 1fr}.about-march li:nth-child(3){border-left:0}.about-march li:nth-child(n+3){border-top:1px solid var(--color-border)}}
        @media(max-width:520px){.about-march{grid-template-columns:1fr}.about-march li+li{border-left:0;border-top:1px solid var(--color-border)}}
        .about-empty{padding:18px;color:var(--color-ink-muted);font-size:14px}
        .about-empty a{color:var(--color-link)}
        .about-links{display:flex;gap:12px;flex-wrap:wrap;padding-top:8px;border-top:1px solid var(--color-border)}
        .about-admin-note{margin-top:12px}
        @media (max-width:760px){.about-standard{width:min(190px,56vw);justify-self:start}.about-doctrine{grid-template-columns:1fr}.about-doctrine-card+.about-doctrine-card{border-left:0;border-top:1px solid var(--color-border)}}
        @media (prefers-reduced-motion:reduce){.about-jump a,.about-alliance-card{transition:none}}
      `}</style>
    </main>
  );
}

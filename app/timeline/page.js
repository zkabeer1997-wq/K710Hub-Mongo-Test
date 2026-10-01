import Link from 'next/link';
import { Card, PageHero } from '../../components/ui';
import {
  TIMELINE_MILESTONES,
  OPTIMIZER_TIMELINE_URL,
  OPTIMIZER_KINGDOM_URL,
} from '../../lib/kingdomExternalData.mjs';

export const metadata = {
  title: 'Kingshot Release Timeline',
  description:
    'Kingdom 710 timeline — heroes, pets, Truegold, PvP milestones, and feature unlocks from Kingshot Optimizer.',
  alternates: { canonical: '/timeline' },
};

const CATEGORY_TONE = {
  Heroes: 'heroes',
  Pets: 'pets',
  Truegold: 'truegold',
  PvP: 'pvp',
  'New Feature': 'feature',
};

export default function TimelinePage() {
  return (
    <main className="theme-realm timeline-page">
      <PageHero
        eyebrow="Kingdom 710 timeline"
        title="Kingshot release timeline"
        lede="See when hero generations, pets, Truegold tiers, PvP features, and other upgrades become available."
        aside={<div className="timeline-hero-seal" aria-hidden="true"><span>710</span><small>TIMELINE</small></div>}
      />

      <div className="timeline-page-inner">
        <div className="timeline-toolbar">
          <div className="timeline-legend" aria-label="Timeline category key">
            {Object.entries(CATEGORY_TONE).map(([label, tone]) => (
              <span key={label} className={`timeline-cat timeline-cat-${tone}`}>{label}</span>
            ))}
          </div>
          <p className="timeline-source">
            Live data from{' '}
            <a href={OPTIMIZER_TIMELINE_URL} target="_blank" rel="noopener noreferrer">Kingshot Optimizer</a>
          </p>
        </div>

        <ol className="timeline-list">
          {TIMELINE_MILESTONES.map((m, i) => (
            <li key={`${m.title}-${i}`} className="timeline-item">
              <div className={`timeline-marker timeline-marker-${CATEGORY_TONE[m.category] || 'feature'}`} aria-hidden="true">
                <span>{i + 1}</span>
              </div>
              <Card className="timeline-card">
                <div className="timeline-card-head">
                  <span className={`timeline-cat timeline-cat-${CATEGORY_TONE[m.category] || 'feature'}`}>
                    {m.category}
                  </span>
                  <span className="timeline-index">Milestone {String(i + 1).padStart(2, '0')}</span>
                </div>
                <h2 className="timeline-title">{m.title}</h2>
                {m.notes && <p className="timeline-notes">{m.notes}</p>}
              </Card>
            </li>
          ))}
        </ol>

        <footer className="timeline-footer">
          <div><strong>Timeline updates</strong><span>New milestones are added when the source data changes.</span></div>
          <nav><Link href="/about">← About K710</Link><a href={OPTIMIZER_KINGDOM_URL} target="_blank" rel="noopener noreferrer">View KvK history →</a></nav>
        </footer>
      </div>

      <style>{`
        .timeline-page{background:var(--color-bg);color:var(--color-ink);min-height:100vh;padding-bottom:112px}
        .timeline-hero-seal{width:min(220px,100%);justify-self:end;aspect-ratio:1;border:1px solid rgba(243,217,154,.5);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 0 0 10px #3b2410,inset 0 0 0 11px rgba(243,217,154,.18)}
        .timeline-hero-seal span{font:800 62px/1 var(--font-display);color:#f3d99a}.timeline-hero-seal small{font-size:9px;letter-spacing:.14em;color:#cbd2e0}
        .timeline-page-inner{max-width:900px;margin:0 auto;display:flex;flex-direction:column;gap:32px;padding:0 24px}
        .timeline-toolbar{display:flex;justify-content:space-between;align-items:center;gap:24px;margin-top:-28px;padding:20px 22px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg);position:relative;z-index:2}
        .timeline-legend{display:flex;flex-wrap:wrap;gap:7px}
        .timeline-source{margin:0;font-size:12px;color:var(--color-ink-muted);white-space:nowrap}
        .timeline-source a{color:var(--color-link)}
        .timeline-list{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column}
        .timeline-item{position:relative;display:grid;grid-template-columns:72px minmax(0,1fr);gap:24px;padding-bottom:28px}
        .timeline-item:not(:last-child):before{content:'';position:absolute;left:35px;top:56px;bottom:0;width:2px;background:linear-gradient(var(--color-border-strong),var(--color-border))}
        .timeline-marker{position:relative;z-index:1;width:72px;height:72px;border-radius:50%;display:grid;place-items:center;background:var(--color-bg);border:1px solid var(--color-border-strong)}
        .timeline-marker:after{content:'';position:absolute;inset:7px;border-radius:50%;background:var(--marker,#d97a1f);opacity:.14}
        .timeline-marker span{position:relative;z-index:1;font:800 20px/1 var(--font-display);color:var(--marker,#d97a1f)}
        .timeline-marker-heroes{--marker:#3276b8}.timeline-marker-pets{--marker:#3f815e}.timeline-marker-truegold{--marker:#c18115}.timeline-marker-pvp{--marker:#b3402f}.timeline-marker-feature{--marker:#7650a8}
        .timeline-card{padding:22px 24px;display:flex;flex-direction:column;gap:9px;border:0;border-bottom:1px solid var(--color-border);border-radius:0;background:transparent;transition:background .2s ease,transform .2s ease}
        .timeline-card:hover{background:var(--color-surface-alt);transform:translateX(4px)}
        .timeline-card-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
        .timeline-cat{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;padding:2px 8px;border-radius:999px}
        .timeline-cat-heroes{background:rgba(120,180,255,.15);color:#0f3f6e}
        .timeline-cat-pets{background:rgba(120,220,160,.15);color:#2a5a2a}
        .timeline-cat-truegold{background:rgba(255,200,80,.15);color:#6b4c03}
        .timeline-cat-pvp{background:rgba(255,100,100,.15);color:#8f2c1d}
        .timeline-cat-feature{background:rgba(180,140,255,.15);color:#4b2f94}
        .timeline-index{font-size:11px;color:var(--color-ink-muted);font-weight:700}
        .timeline-title{margin:0;font-family:var(--font-display);font-size:clamp(20px,3vw,28px);letter-spacing:-.02em}
        .timeline-notes{margin:0;font-size:14px;color:var(--color-ink-muted);line-height:1.6}
        .timeline-footer{margin-top:32px;padding:28px 0;border-top:1px solid var(--color-border);border-bottom:1px solid var(--color-border);display:flex;justify-content:space-between;gap:24px;align-items:center}
        .timeline-footer div{display:flex;flex-direction:column;gap:4px}.timeline-footer div span{color:var(--color-ink-muted);font-size:13px}.timeline-footer nav{display:flex;gap:16px;flex-wrap:wrap}.timeline-footer a{color:var(--color-link);font-weight:700;font-size:13px;text-decoration:none}
        @media(max-width:680px){.timeline-hero-seal{display:none}.timeline-toolbar{align-items:flex-start;flex-direction:column}.timeline-source{white-space:normal}.timeline-item{grid-template-columns:48px minmax(0,1fr);gap:12px}.timeline-marker{width:48px;height:48px}.timeline-item:not(:last-child):before{left:23px;top:44px}.timeline-card{padding:10px 10px 22px}.timeline-footer{align-items:flex-start;flex-direction:column}}
        @media(prefers-reduced-motion:reduce){.timeline-card{transition:none}}
      `}</style>
    </main>
  );
}

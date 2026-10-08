import Link from 'next/link';
import { PageHero } from '../../components/ui';
import TimelineRibbon, { DaySeal, UpdatedAgo } from '../../components/timeline/TimelineRibbon';
import '../../components/timeline/timeline.css';
import { getTimeline } from '../../lib/external/index.mjs';
import { buildChapters } from '../../lib/external/timelineProgress.mjs';
import { TIMELINE_MILESTONES } from '../../lib/kingdomExternalData.mjs';

// Rendered per request from the Mongo snapshot (refreshed at most hourly); see lib/external.
export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Kingshot Release Timeline',
  description:
    'Kingdom 710 timeline: hero generations, pets, Truegold tiers, PvP milestones and feature unlocks, with live progress to the next unlock.',
  alternates: { canonical: '/timeline' },
};

export default async function TimelinePage() {
  const t = await getTimeline();
  const serverNow = Date.now();
  const chapters = buildChapters(t.milestones);

  return (
    <main className="theme-realm tl-page">
      <PageHero
        eyebrow={`Kingdom ${t.kingdom} timeline`}
        title="Kingshot release timeline"
        lede="When hero generations, pets, Truegold tiers, PvP firsts and other upgrades unlock for our kingdom, and how far along we are right now."
        aside={t.available ? <DaySeal createdDate={t.createdDate} serverNow={serverNow} kingdom={t.kingdom} /> : undefined}
      />
      <div className="tl-inner">
        {t.available && t.stale && (
          <p className="tl-notice" role="status">
            <strong>This copy may be out of date.</strong>
            The source has not answered recently, so you are seeing the last saved timeline
            {t.fetchedAt ? <> from <UpdatedAgo iso={t.fetchedAt} serverNow={serverNow} /></> : null}. Check the link below for the latest.
          </p>
        )}

        {t.available ? (
          <TimelineRibbon chapters={chapters} serverNow={serverNow} />
        ) : (
          <>
            <p className="tl-notice" role="status">
              <strong>Live dates are unavailable right now.</strong>
              Showing our saved list of milestones in order. Dates and progress return as soon as the source answers.
            </p>
            <ol className="tl-fallback" aria-label="Kingdom milestones in order">
              {TIMELINE_MILESTONES.map((m) => (
                <li key={m.title}>
                  <strong>{m.title}</strong> <span className="tl-cat">{m.category}</span>
                  {m.notes && <p>{m.notes}</p>}
                </li>
              ))}
            </ol>
          </>
        )}

        <p className="tl-source">
          <span>
            Data from{' '}
            <a href={t.sourceUrl} target="_blank" rel="noopener noreferrer">kingshotoptimizer.com</a>
            {t.fetchedAt ? <>, updated <UpdatedAgo iso={t.fetchedAt} serverNow={serverNow} /></> : null}.
            Unlocks happen at 00:00 UTC.
          </span>
          <Link href="/about#competitive-record">KvK record and rankings</Link>
        </p>
      </div>
    </main>
  );
}

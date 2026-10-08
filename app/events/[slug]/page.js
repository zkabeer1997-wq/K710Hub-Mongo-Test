import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { notFound, unstable_rethrow } from 'next/navigation';
import Link from 'next/link';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { Button, Tag } from '../../../components/ui';

import { RECURRENCE_FIELDS } from '../../../lib/eventRecurrence.mjs';
import EventSchedule from '../EventSchedule';
import { findDefaultEvent } from '../../../lib/defaultEvents.mjs';
import { loadPublicBearScheduleOrNull } from '../../../lib/publicBearSchedule';

const KIND_LABEL = {
  kvk: 'KvK',
  championship: 'Championship',
  swordland: 'Swordland',
  bear_hunt: 'Bear Hunt',
  custom: 'Kingdom Event',
};

// Root layout reads headers() (CSP nonce) so this route is always dynamic.
export const dynamic = 'force-dynamic';

async function loadEvent(slug) {
  const coll = await getCollection(COLLECTIONS.EVENTS);
  const stored = await coll.findOne(
    { slug },
    {
      projection: {
        slug: 1, title: 1, kind: 1, description: 1, body_md: 1,
        starts_at: 1, ends_at: 1, published: 1,
        recurrence_frequency: 1, recurrence_interval: 1, recurrence_until: 1, recurrence_weekdays: 1, exdates: 1, all_day: 1, guide_slug: 1, alliance_tags: 1,
        _id: 0,
      },
    }
  );
  // A stored event with this slug (even a draft) overrides the built-in default.
  if (stored) return stored.published ? stored : null;
  return findDefaultEvent(slug, (await loadPublicBearScheduleOrNull()) || []);
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const event = await loadEvent(slug);
    if (!event) return { title: 'Event' };
    return {
      title: event.title,
      description: event.description || undefined,
      openGraph: { title: event.title, description: event.description || undefined },
      twitter: { card: 'summary_large_image', title: event.title, description: event.description || undefined },
    };
  } catch (error) {
    unstable_rethrow(error);
    return { title: 'Event' };
  }
}

export default async function EventPage({ params }) {
  const { slug } = await params;
  let event = null;
  try {
    event = await loadEvent(slug);
  } catch (error) {
    unstable_rethrow(error);
    console.error('event page load failed', error);
    return (
      <main className="theme-realm event-page" style={{ minHeight: '100vh', padding: '56px 24px', background: 'var(--color-bg)', color: 'var(--color-ink)' }}>
        <div className="event-page-inner" style={{ maxWidth: 700, margin: '0 auto' }}>
          <Link href="/events" className="event-back">← Events</Link>
          <p className="event-description" style={{ marginTop: 16 }}>This event could not be loaded right now.</p>
        </div>
      </main>
    );
  }
  if (!event) notFound();

  return (
    <main className="theme-realm event-page">
      <div className="event-page-inner">
        <Link href="/events" className="event-back">← Events</Link>
        <Tag tone="accent">{KIND_LABEL[event.kind] || event.kind}</Tag>
        <h1 className="event-title">{event.title}</h1>
        <EventSchedule event={event} />
        {event.description && <p className="event-description">{event.description}</p>}

        <div className="event-actions">
          {event.guide_slug && <Button href={`/guides/${event.guide_slug}`}>Read the guide</Button>}
          <Button href={`/api/events/${event.slug}/ics`} variant="quiet">📅 Add to calendar (.ics)</Button>
        </div>

        {event.body_md && (
          <article className="event-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {event.body_md}
            </ReactMarkdown>
          </article>
        )}
      </div>

      <style>{`
        .event-page{padding:56px 24px 96px;background:var(--color-bg);color:var(--color-ink);min-height:100vh}
        .event-page-inner{max-width:760px;margin:0 auto;display:flex;flex-direction:column;gap:14px;align-items:flex-start}
        .event-back{color:var(--color-accent-strong);text-decoration:none;font-size:13px;font-weight:700;margin-bottom:10px}
        .event-back:hover{text-decoration:underline}
        .event-title{margin:6px 0 0;font-family:var(--font-display);font-size:clamp(28px,4.5vw,44px)}
        .event-when{margin:0;color:var(--color-ink-muted);font-size:15px}
        .event-description{margin:8px 0 0;font-size:16px;line-height:1.6;max-width:65ch}
        .event-actions{margin:10px 0}
        .event-body{margin-top:20px;font-size:16px;line-height:1.7;max-width:70ch}
        .event-body :global(h2){font-family:var(--font-display);font-size:22px;margin:1.4em 0 .5em}
        .event-body :global(ul),.event-body :global(ol){padding-left:1.4em}
        .event-body :global(a){color:var(--color-accent-strong)}
      `}</style>
    </main>
  );
}

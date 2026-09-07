import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import { Button, Tag } from '../../../components/ui';

import { RECURRENCE_FIELDS } from '../../../lib/eventRecurrence.mjs';
import EventSchedule from '../EventSchedule';

const KIND_LABEL = {
  kvk: 'KvK',
  championship: 'Championship',
  swordland: 'Swordland',
  custom: 'Kingdom Event',
};

// Simpler than guides/[slug]: events have no admin-preview-unpublished
// requirement, so this page never needs cookies() or searchParams at all -
// avoiding that whole class of DYNAMIC_SERVER_USAGE conflict from the
// start rather than fixing it after the fact.
export async function generateStaticParams() {
  try {
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase.from('events').select('slug').eq('published', true);
    if (error) throw error;
    return (data || []).map((e) => ({ slug: e.slug }));
  } catch (error) {
    console.error('events generateStaticParams failed', error);
    return [];
  }
}

async function loadEvent(slug) {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('events')
    .select(`slug, title, kind, description, body_md, starts_at, ends_at, published, ${RECURRENCE_FIELDS}`)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export async function generateMetadata({ params }) {
  const { slug } = await params;
  try {
    const event = await loadEvent(slug);
    if (!event) return { title: 'Event | K710' };
    return {
      title: event.title,
      description: event.description || undefined,
      openGraph: { title: event.title, description: event.description || undefined },
    };
  } catch {
    return { title: 'Event | K710' };
  }
}

export default async function EventPage({ params }) {
  const { slug } = await params;
  let event = null;
  try {
    event = await loadEvent(slug);
  } catch (error) {
    console.error('event page load failed', error);
    // Same reasoning as the alliance detail page: a Supabase hiccup here
    // is a different situation from a genuinely missing event, and
    // shouldn't be silently relabeled as a 404 via notFound().
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

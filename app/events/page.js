import Link from 'next/link';
import { getCollection } from '../../lib/mongo';
import { COLLECTIONS } from '../../lib/mongoCollections';
import { Card, EmptyState, Button, Term, PageHero, SectionHeader } from '../../components/ui';
import { loadPublicBearScheduleOrNull } from '../../lib/publicBearSchedule';
import { loadPublicAllianceEventsOrNull } from '../../lib/publicAllianceEvents';
import AllianceEventSchedule from './AllianceEventSchedule';
import BearHuntSchedule from './BearHuntSchedule';
import EventCountdownCards from './EventCountdownCards';
import { upcomingEventSeries } from '../../lib/eventRecurrence.mjs';
import { mergeDefaultEvents } from '../../lib/defaultEvents.mjs';

export const metadata = {
  title: 'Events',
  description:
    'Kingdom 710 event calendar — Bear Hunt windows, KvK, Championship, and Swordland, with live countdowns in your local time.',
};

export const revalidate = 300;

async function loadUpcomingEvents(alliances) {
  const coll = await getCollection(COLLECTIONS.EVENTS);
  const data = await coll
    .find({})
    .project({
      published: 1,
      slug: 1,
      title: 1,
      kind: 1,
      description: 1,
      body_md: 1,
      starts_at: 1,
      ends_at: 1,
      recurrence_frequency: 1,
      recurrence_interval: 1,
      recurrence_until: 1,
      _id: 0,
    })
    .sort({ starts_at: 1 })
    .toArray();
  // Built-in recurring defaults appear unless a stored event (even a draft) reuses their slug.
  const merged = mergeDefaultEvents(data || [], alliances || []).filter((event) => event.published);
  return upcomingEventSeries(merged).map((entry) => entry.event);
}

export default async function EventsPage() {
  const [bearAlliances, allianceEvents] = await Promise.all([loadPublicBearScheduleOrNull(), loadPublicAllianceEventsOrNull()]);
  let events = [];
  let loadError = '';
  try {
    events = await loadUpcomingEvents(bearAlliances);
  } catch (error) {
    console.error('events page load failed', error);
    loadError = 'The event calendar could not be opened right now.';
  }

  return (
    <main className="theme-realm events-page">
      <PageHero
        eyebrow="Kingdom 710 events"
        title="Event schedule"
        lede={<>Check <Term term="Bear Hunt">Bear Hunt</Term> times, <Term term="KvK">KvK</Term>, Championship, Swordland, and other published events. Times are converted to your device’s time zone.</>}
        actions={<Link href="/glossary">What do these terms mean?</Link>}
        aside={
          <div className="events-time-dial" aria-hidden="true">
            <span className="events-dial-hand" />
            <strong>UTC</strong>
            <small>LOCALIZED FOR YOU</small>
          </div>
        }
      />
      <div className="events-page-inner">
        <section className="events-section events-section-hunts">
          <SectionHeader eyebrow="Daily rhythm" title="Bear Hunt schedule" lede="Daily times set by each alliance. Times are shown locally on your device." className="events-sh" />
          <BearHuntSchedule initialAlliances={bearAlliances} />
        </section>

        <section className="events-section" aria-labelledby="alliance-events-heading">
          <SectionHeader eyebrow="By alliance" title="Alliance events" id="alliance-events-heading" lede="Swordland, Tri-Alliance, and Vikings Vengeance dates set by each alliance. Today’s events and upcoming dates, with both your local time and UTC." className="events-sh" />
          <AllianceEventSchedule initialEvents={allianceEvents} initialNow={Date.now()} />
        </section>

        <section className="events-section">
          <SectionHeader eyebrow="Calendar" title="Upcoming events" lede="Open an event to see its full details. Countdown times use your device’s time zone." className="events-sh" />
          {loadError ? (
            <Card className="events-error">{loadError}</Card>
          ) : events.length === 0 ? (
            <EmptyState
              icon="🗓️"
              title="No upcoming events yet"
              description="When an admin publishes an event, it will appear here with a live countdown."
            />
          ) : (
            <EventCountdownCards events={events} initialNow={Date.now()} />
          )}
        </section>

        <div className="events-footer"><p>Kingdom 710 event calendar</p><Button href="/about" variant="quiet">← About Kingdom 710</Button></div>
      </div>

      <style>{`
        .events-page{padding:0 0 112px;background:var(--color-bg);color:var(--color-ink);min-height:100vh;overflow:hidden}
        .events-time-dial{position:relative;width:min(280px,100%);justify-self:end;aspect-ratio:1;border:1px solid rgba(243,217,154,.42);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 0 0 12px #3b2410,inset 0 0 0 13px rgba(243,217,154,.15)}
        .events-time-dial:before{content:'12';position:absolute;top:25px;color:#9aa6b9;font-size:11px}.events-time-dial:after{content:'6';position:absolute;bottom:25px;color:#9aa6b9;font-size:11px}
        .events-time-dial strong{font:800 50px/1 var(--font-display);color:#f3d99a}.events-time-dial small{margin-top:7px;color:#cbd2e0;font-size:9px;letter-spacing:.12em}
        .events-dial-hand{position:absolute;width:2px;height:88px;bottom:50%;left:50%;background:linear-gradient(transparent,#e2692a);transform-origin:bottom;transform:rotate(38deg)}
        .events-page-inner{max-width:1060px;margin:0 auto;padding-inline:24px;display:flex;flex-direction:column;gap:clamp(64px,9vw,96px);padding-top:72px}
        .events-section{display:flex;flex-direction:column;gap:24px}
        .events-sh{border-bottom:1px solid var(--color-border);padding-bottom:22px;margin-bottom:0}.events-section-hunts{margin-top:-112px;position:relative;z-index:2;padding:30px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg)}
        .events-hunts .ui-table{border:0}.events-hunts .ui-table th,.events-hunts .ui-table td{white-space:nowrap}
        .events-hunts-utc{color:var(--color-ink-muted);font-size:12px}
        .events-ics{margin-top:16px}
        .events-ics-link{display:inline-block;color:var(--color-link);font-weight:700;font-size:14px;text-decoration:none}
        .events-ics-link:hover{text-decoration:underline}
        .events-ics-hint{margin:4px 0 0;color:var(--color-ink-muted);font-size:12px;line-height:1.5}
        .events-error{padding:20px;color:var(--color-ink-muted)}
        .events-footer{display:flex;justify-content:space-between;align-items:center;gap:24px;padding-top:28px;border-top:1px solid var(--color-border)}.events-footer p{margin:0;font:700 20px/1.2 var(--font-display)}
        @media(max-width:720px){.events-time-dial{display:none}.events-section-hunts{margin-top:-96px;padding:20px 16px}.events-footer{align-items:flex-start;flex-direction:column}}
      `}</style>
    </main>
  );
}

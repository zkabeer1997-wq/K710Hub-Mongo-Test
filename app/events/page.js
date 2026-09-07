import { createAdminSupabaseClient } from '../../lib/adminSupabase';
import { Card, EmptyState, Button } from '../../components/ui';
import { loadPublicBearScheduleOrNull } from '../../lib/publicBearSchedule';
import { loadPublicAllianceEventsOrNull } from '../../lib/publicAllianceEvents';
import AllianceEventSchedule from './AllianceEventSchedule';
import BearHuntSchedule from './BearHuntSchedule';
import EventCountdownCards from './EventCountdownCards';
import { RECURRENCE_FIELDS, upcomingEventSeries } from '../../lib/eventRecurrence.mjs';

export const metadata = {
  title: 'Events',
  description:
    'Kingdom 710 event calendar — Bear Hunt windows, KvK, Championship, and Swordland, with live countdowns in your local time.',
};

export const revalidate = 300;

async function loadUpcomingEvents() {
  const supabase = createAdminSupabaseClient();
  const { data, error } = await supabase
    .from('events')
    .select(`slug, title, kind, description, body_md, starts_at, ends_at, ${RECURRENCE_FIELDS}`)
    .eq('published', true)
    .order('starts_at', { ascending: true });
  if (error) throw error;
  return upcomingEventSeries(data || []).map(entry => entry.event);
}

export default async function EventsPage() {
  const [bearAlliances, allianceEvents] = await Promise.all([loadPublicBearScheduleOrNull(), loadPublicAllianceEventsOrNull()]);
  let events = [];
  let loadError = '';
  try {
    events = await loadUpcomingEvents();
  } catch (error) {
    console.error('events page load failed', error);
    loadError = 'The event calendar could not be opened right now.';
  }

  return (
    <main className="theme-realm events-page">
      <header className="events-hero">
        <div className="events-hero-copy">
          <p className="k-mark">Kingdom 710 events</p>
          <h1>Event schedule</h1>
          <p>Check Bear Hunt times, KvK, Championship, Swordland, and other published events. Times are converted to your device’s time zone.</p>
        </div>
        <div className="events-time-dial" aria-hidden="true">
          <span className="events-dial-hand" />
          <strong>UTC</strong>
          <small>LOCALIZED FOR YOU</small>
        </div>
      </header>
      <div className="events-page-inner">
        <section className="events-section events-section-hunts">
          <div className="events-section-heading">
            <div><span className="events-section-mark">Daily rhythm</span><h2 className="events-section-title">Bear Hunt schedule</h2></div>
            <p>Daily times set by each alliance. Times are shown locally on your device.</p>
          </div>
          <BearHuntSchedule initialAlliances={bearAlliances} />
        </section>

        <section className="events-section" aria-labelledby="alliance-events-heading">
          <div className="events-section-heading">
            <div><span className="events-section-mark">By alliance</span><h2 id="alliance-events-heading" className="events-section-title">Alliance events</h2></div>
            <p>Swordland, Tri-Alliance, and Vikings Vengeance dates set by each alliance. Today’s events and upcoming dates, with both your local time and UTC.</p>
          </div>
          <AllianceEventSchedule initialEvents={allianceEvents} initialNow={Date.now()} />
        </section>

        <section className="events-section">
          <div className="events-section-heading">
            <div><span className="events-section-mark">Calendar</span><h2 className="events-section-title">Upcoming events</h2></div>
            <p>Open an event to see its full details. Countdown times use your device’s time zone.</p>
          </div>
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
        .events-page{padding:0 24px 112px;background:var(--color-bg);color:var(--color-ink);min-height:100vh;overflow:hidden}
        .events-hero{position:relative;max-width:1180px;min-height:530px;margin:0 auto;display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:72px;align-items:center;padding:72px 0 80px;color:#fff6e4}
        .events-hero:before{content:'';position:absolute;inset:0 -50vw;background:radial-gradient(circle at 78% 44%,rgba(217,169,78,.18),transparent 25%),linear-gradient(120deg,#0e1728,#1d2d43 56%,#4c2a17);z-index:0}
        .events-hero-copy,.events-time-dial{position:relative;z-index:1}.events-hero .k-mark{color:#f3d99a}
        .events-hero h1{max-width:760px;margin:14px 0 0;font:800 clamp(48px,7vw,84px)/.98 var(--font-display);letter-spacing:-.035em;text-wrap:balance}
        .events-hero p:not(.k-mark){max-width:62ch;margin:24px 0 0;color:#d7dce5;font-size:17px;line-height:1.65}
        .events-time-dial{aspect-ratio:1;border:1px solid rgba(243,217,154,.42);border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;box-shadow:inset 0 0 0 12px #17243a,inset 0 0 0 13px rgba(243,217,154,.15)}
        .events-time-dial:before{content:'12';position:absolute;top:25px;color:#9aa6b9;font-size:11px}.events-time-dial:after{content:'6';position:absolute;bottom:25px;color:#9aa6b9;font-size:11px}
        .events-time-dial strong{font:800 50px/1 var(--font-display);color:#f3d99a}.events-time-dial small{margin-top:7px;color:#cbd2e0;font-size:9px;letter-spacing:.12em}
        .events-dial-hand{position:absolute;width:2px;height:88px;bottom:50%;left:50%;background:linear-gradient(transparent,#e2692a);transform-origin:bottom;transform:rotate(38deg)}
        .events-page-inner{max-width:1060px;margin:0 auto;display:flex;flex-direction:column;gap:clamp(64px,9vw,96px);padding-top:72px}
        .events-section{display:flex;flex-direction:column;gap:24px}
        .events-section-heading{display:grid;grid-template-columns:minmax(260px,.85fr) minmax(280px,1.15fr);gap:48px;align-items:end;border-bottom:1px solid var(--color-border);padding-bottom:22px}
        .events-section-heading p{margin:0;color:var(--color-ink-muted);font-size:14px;line-height:1.6;max-width:60ch}
        .events-section-mark{display:block;margin-bottom:8px;color:var(--color-accent-strong);font-size:12px;font-weight:800}
        .events-section-title{margin:0;font-family:var(--font-display);font-size:clamp(30px,4vw,46px);line-height:1.05;letter-spacing:-.025em;color:var(--color-ink)}
        .events-section-hunts{margin-top:-112px;position:relative;z-index:2;padding:30px;background:var(--color-surface);border:1px solid var(--color-border);border-radius:var(--radius-lg)}
        .events-hunts .ui-table{border:0}.events-hunts .ui-table th,.events-hunts .ui-table td{white-space:nowrap}
        .events-hunts-utc{color:var(--color-ink-muted);font-size:12px}
        .events-ics-link{display:inline-block;margin-top:14px;color:var(--color-accent-strong);font-weight:700;font-size:13px;text-decoration:none}
        .events-ics-link:hover{text-decoration:underline}
        .events-error{padding:20px;color:var(--color-ink-muted)}
        .events-footer{display:flex;justify-content:space-between;align-items:center;gap:24px;padding-top:28px;border-top:1px solid var(--color-border)}.events-footer p{margin:0;font:700 20px/1.2 var(--font-display)}
        @media(max-width:720px){.events-hero{grid-template-columns:1fr;min-height:auto;padding:64px 0 120px}.events-time-dial{display:none}.events-section-heading{grid-template-columns:1fr;gap:12px}.events-section-hunts{margin-top:-128px;padding:20px 16px}.events-footer{align-items:flex-start;flex-direction:column}}
      `}</style>
    </main>
  );
}

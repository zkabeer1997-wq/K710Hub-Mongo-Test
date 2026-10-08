'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import StatusChip from '../../../../components/admin/StatusChip';
import { fetchEventState } from '../../../../components/admin/eventControlClient';
import { formatUtc, toMs } from '../../../../lib/deadlines.mjs';
import { Button } from '../../../../components/ui';

const SOON_MS = 48 * 3600e3;
const EVENTS = [
  { type: 'kvk', name: 'KvK', href: '/admin/dashboard/events/kvk' },
  { type: 'flamedragon', name: 'Flamedragon Tyrant', href: '/admin/dashboard/events/flamedragon' },
];

const CYCLE_STATUS = {
  collecting: { kind: 'open', text: 'Collecting answers' },
  closed: { kind: 'closed', text: 'Forms closed' },
  published: { kind: 'published', text: 'Schedule published' },
  ended: { kind: 'ended', text: 'Ended' },
};

function buildAttention(counts, events) {
  const items = [];
  const pending = Number(counts?.transfersPending || 0);
  const waitlist = Number(counts?.transfersWaitlist || 0);
  if (pending > 0) {
    items.push({ id: 'transfers', count: pending, text: `transfer request${pending === 1 ? '' : 's'} waiting for a decision`, href: '/admin/dashboard/interest', cta: 'Review' });
  }
  if (waitlist > 0) {
    items.push({ id: 'waitlist', count: waitlist, text: `transfer request${waitlist === 1 ? '' : 's'} on the waitlist`, href: '/admin/dashboard/interest', cta: 'Open' });
  }
  const web = Number(counts?.website || 0);
  if (web > 0) {
    items.push({ id: 'website', count: web, text: `new website request${web === 1 ? '' : 's'}`, href: '/admin/dashboard/website-requests', cta: 'Read' });
  }
  const now = Date.now();
  for (const ev of events) {
    const s = ev.state;
    if (!s) continue;
    for (const form of s.forms || []) {
      const closes = toMs(form.closes_at);
      if (form.is_open && closes !== null && closes > now && closes - now <= SOON_MS) {
        items.push({ id: `${ev.type}-${form.form_key}-soon`, text: `${ev.name}: ${form.label} closes ${formatUtc(form.closes_at)}`, href: ev.href, cta: 'Open' });
      }
    }
    if (s.appointments && !s.appointments.published && s.cycle) {
      const tab = ev.type === 'kvk' ? 'appointments' : 'noble';
      items.push({ id: `${ev.type}-unpublished`, text: `${ev.name}: appointments are not published yet`, href: `${ev.href}?tab=${tab}`, cta: 'Review' });
    }
    if (s.counts?.unassigned > 0 && s.cycle && s.cycle.status !== 'ended') {
      items.push({ id: `${ev.type}-unassigned`, count: s.counts.unassigned, text: `${ev.name} applicants without a rally`, href: `${ev.href}?tab=rallies`, cta: 'Assign' });
    }
  }
  return items;
}

export default function AdminOverviewPage() {
  const [counts, setCounts] = useState(null);
  const [events, setEvents] = useState(EVENTS.map((e) => ({ ...e, state: null, error: '' })));
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [countsResult, ...states] = await Promise.allSettled([
      fetch('/api/admin-task-counts', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('counts')))),
      ...EVENTS.map((e) => fetchEventState(e.type)),
    ]);
    setCounts(countsResult.status === 'fulfilled' ? countsResult.value : null);
    setEvents(EVENTS.map((e, i) => ({
      ...e,
      state: states[i].status === 'fulfilled' ? states[i].value : null,
      error: states[i].status === 'rejected' ? states[i].reason?.message || 'Could not load.' : '',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const attention = buildAttention(counts, events);

  return (
    <AdminShell title="Overview" subtitle="What needs you today.">
      <div className="ov-grid">
        <section aria-labelledby="ov-attn" className="ov-attn">
          <h2 id="ov-attn" className="ec-h2">Needs attention</h2>
          {loading && attention.length === 0 ? (
            <p className="ec-empty">Checking...</p>
          ) : attention.length === 0 ? (
            <p className="ov-clear"><StatusChip kind="open">All clear</StatusChip> <span>Nothing is waiting on you.</span></p>
          ) : (
            <ul className="ov-list">
              {attention.map((item) => (
                <li key={item.id}>
                  <span className="ov-text">
                    {item.count ? <strong className="ov-count">{item.count}</strong> : null} {item.text}
                  </span>
                  <Link className="ov-cta" href={item.href}>{item.cta}</Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ov-events" className="ov-events">
          <h2 id="ov-events" className="ec-h2">Events</h2>
          <div className="admin-table-wrap">
            <table className="admin-table ov-table">
              <thead>
                <tr>
                  <th scope="col">Event</th>
                  <th scope="col">Cycle</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="ec-num">Applicants</th>
                  <th scope="col" className="ec-num">Forms open</th>
                  <th scope="col"><span className="sr-only">Open</span></th>
                </tr>
              </thead>
              <tbody>
                {events.map((ev) => {
                  const s = ev.state;
                  const st = s?.cycle ? CYCLE_STATUS[s.cycle.status] || { kind: 'none', text: s.cycle.status } : { kind: 'none', text: 'No active cycle' };
                  return (
                    <tr key={ev.type}>
                      <th scope="row" data-label="Event">{ev.name}</th>
                      {s ? (
                        <>
                          <td data-label="Cycle">{s.cycle ? s.cycle.label : 'None yet'}</td>
                          <td data-label="Status"><StatusChip kind={st.kind}>{st.text}</StatusChip></td>
                          <td data-label="Applicants" className="ec-num">{s.counts?.applicants ?? 0}</td>
                          <td data-label="Forms open" className="ec-num">{s.counts?.forms_open ?? 0} of {s.counts?.forms_total ?? 0}</td>
                        </>
                      ) : (
                        <td colSpan={4} className="ov-error" role={ev.error ? 'alert' : undefined}>
                          {loading ? 'Loading...' : ev.error || 'Not available.'}
                        </td>
                      )}
                      <td data-label="Open"><Button variant="quiet" href={ev.href} className="ec-btn-sm">Open {ev.name}</Button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}

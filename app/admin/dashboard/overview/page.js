'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import StatusChip from '../../../../components/admin/StatusChip';
import { fetchEventState } from '../../../../components/admin/eventControlClient';
import { formatUtc, toMs } from '../../../../lib/deadlines.mjs';
import { Button } from '../../../../components/ui';
import { VOTE_FORM_KEYS, FORM_GATE_LABELS } from '../../../../lib/formGates.mjs';
import { rankAttention, startsInText, giftCodeHealth, driveHealth } from '../../../../lib/adminOverview.mjs';

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

function buildAttention(counts, events, gates = []) {
  const items = [];
  const pending = Number(counts?.transfersPending || 0);
  const waitlist = Number(counts?.transfersWaitlist || 0);
  if (pending > 0) {
    items.push({ id: 'transfers', urgency: 20, count: pending, text: `transfer request${pending === 1 ? '' : 's'} waiting for a decision`, href: '/admin/dashboard/interest', cta: 'Review' });
  }
  if (waitlist > 0) {
    items.push({ id: 'waitlist', urgency: 60, count: waitlist, text: `transfer request${waitlist === 1 ? '' : 's'} on the waitlist`, href: '/admin/dashboard/interest', cta: 'Open' });
  }
  const web = Number(counts?.website || 0);
  if (web > 0) {
    items.push({ id: 'website', urgency: 40, count: web, text: `new website request${web === 1 ? '' : 's'}`, href: '/admin/dashboard/website-requests', cta: 'Read' });
  }
  const now = Date.now();
  for (const gate of gates) {
    if (VOTE_FORM_KEYS.includes(gate.form_key) && gate.is_open !== false && !gate.opens_at && !gate.closes_at) {
      items.push({ id: `vote-${gate.form_key}-nowindow`, urgency: 30, text: `${FORM_GATE_LABELS[gate.form_key]} is switched on but has no open and close times, so members cannot vote yet`, href: `/admin/dashboard/form-gates?settings=${gate.form_key}`, cta: 'Set times' });
    }
  }
  for (const ev of events) {
    const s = ev.state;
    if (!s) continue;
    for (const form of s.forms || []) {
      const closes = toMs(form.closes_at);
      if (form.is_open && closes !== null && closes > now && closes - now <= SOON_MS) {
        items.push({ id: `${ev.type}-${form.form_key}-soon`, urgency: 10, whenMs: closes, text: `${ev.name}: ${form.label} closes ${startsInText(closes, now)} (${formatUtc(form.closes_at)})`, href: ev.href, cta: 'Open' });
      }
    }
    if (s.appointments && !s.appointments.published && s.cycle) {
      const tab = ev.type === 'kvk' ? 'appointments' : 'noble';
      const startsMs = toMs(s.cycle.start_date);
      const when = startsMs && startsMs > now ? `, ${ev.name} starts ${startsInText(startsMs, now)}` : '';
      items.push({ id: `${ev.type}-unpublished`, urgency: 25, whenMs: startsMs && startsMs > now ? startsMs : undefined, text: `${ev.name}: appointments are not published yet${when}`, href: `${ev.href}?tab=${tab}`, cta: 'Review' });
    }
    if (s.counts?.unassigned > 0 && s.cycle && s.cycle.status !== 'ended') {
      items.push({ id: `${ev.type}-unassigned`, urgency: 35, count: s.counts.unassigned, text: `${ev.name} applicants without a rally`, href: `${ev.href}?tab=rallies`, cta: 'Assign' });
    }
  }
  return rankAttention(items);
}

export default function AdminOverviewPage() {
  const [counts, setCounts] = useState(null);
  const [events, setEvents] = useState(EVENTS.map((e) => ({ ...e, state: null, error: '' })));
  const [gates, setGates] = useState([]);
  const [health, setHealth] = useState({ drive: null, gifts: null });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const [countsResult, gatesResult, driveResult, giftResult, ...states] = await Promise.allSettled([
      fetch('/api/admin-task-counts', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('counts')))),
      fetch('/api/admin-form-gates', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('gates')))),
      fetch('/api/admin-drive/status', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('drive')))),
      fetch('/api/admin-gift-codes', { cache: 'no-store' }).then((r) => (r.ok ? r.json() : Promise.reject(new Error('gifts')))),
      ...EVENTS.map((e) => fetchEventState(e.type)),
    ]);
    setCounts(countsResult.status === 'fulfilled' ? countsResult.value : null);
    setHealth({ drive: driveResult.status === 'fulfilled' ? driveResult.value : null, gifts: giftResult.status === 'fulfilled' ? giftResult.value.sources || [] : null });
    setGates(gatesResult.status === 'fulfilled' ? gatesResult.value.gates || [] : []);
    setEvents(EVENTS.map((e, i) => ({
      ...e,
      state: states[i].status === 'fulfilled' ? states[i].value : null,
      error: states[i].status === 'rejected' ? states[i].reason?.message || 'Could not load.' : '',
    })));
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const attention = buildAttention(counts, events, gates);

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

        <section aria-label="Integrations health" className="ov-health">
          {[driveHealth(health.drive), health.gifts ? giftCodeHealth(health.gifts) : { kind: 'none', text: 'Gift codes: status unavailable' }].map((h) => (
            <span key={h.text} className="ov-health-item"><StatusChip kind={h.kind === 'warn' ? 'warn' : h.kind === 'ok' ? 'open' : 'none'}>{h.kind === 'warn' ? 'Check' : h.kind === 'ok' ? 'OK' : '-'}</StatusChip> {h.text}</span>
          ))}
          <Link className="ov-cta" href="/admin/dashboard/integrations">Integrations</Link>
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

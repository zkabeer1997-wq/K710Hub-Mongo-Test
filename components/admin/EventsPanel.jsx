'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import EventCalendar from '../events/EventCalendar';
import EventFormDialog from './EventFormDialog';
import TableSkeleton from './TableSkeleton';
import { Button, Table } from '../ui';
import { DEFAULT_KINGDOM_EVENTS, mergeDefaultEvents } from '../../lib/defaultEvents.mjs';
import { recurrenceLabel } from '../../lib/eventRecurrence.mjs';
import { eventAllianceLabel } from '../../lib/eventFields.mjs';
import { emptyForm, formFromEvent, eventFromForm, shiftSeries, singleOccurrenceCopy, withExdate } from '../../lib/eventForm.mjs';

const FALLBACK_ALLIANCES = [{ tag: '710' }, { tag: 'RED' }, { tag: 'SKY' }];

async function api(url, options) {
  const response = await fetch(url, { ...options, headers: { 'Content-Type': 'application/json' }, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Request failed. Please try again.');
  return result;
}

// Google-Calendar-style admin: click a day or drag a time range to add, click an event to edit or delete.
// Everything saved here is what members see on /events (the API revalidates that page).
export default function EventsPanel() {
  const [rows, setRows] = useState([]);
  const [alliances, setAlliances] = useState(FALLBACK_ALLIANCES);
  const [guides, setGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [dialog, setDialog] = useState(null); // { mode, initial, event, occStart, isDefault }
  const [saving, setSaving] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const load = useCallback(async () => {
    setError('');
    try {
      const [events, allianceList, guideList] = await Promise.all([
        api('/api/admin-events'),
        api('/api/admin-alliances').catch(() => null),
        api('/api/admin-guides').catch(() => null),
      ]);
      setRows(events.events || []);
      if (allianceList?.alliances?.length) setAlliances(allianceList.alliances.filter(a => a.active !== false && a.tag));
      if (guideList?.guides) setGuides(guideList.guides.filter(g => g.is_published).map(g => ({ slug: g.slug, title: g.title || g.slug })));
    } catch (err) {
      setError(err.message || 'Unable to load events.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  // Stored events win over built-in ones with the same slug, so a customised default never shows twice.
  const events = useMemo(() => mergeDefaultEvents(rows, []), [rows]);
  const guideOptions = useMemo(() => guides, [guides]);

  function openCreate(startMs, endMs) {
    setDialogError('');
    setStatus('');
    setDialog({ mode: 'create', initial: emptyForm(startMs ?? Date.now(), endMs ?? (startMs ?? Date.now()) + 3600000), event: null });
  }

  function openEdit(occ) {
    setDialogError('');
    setStatus('');
    const event = occ.event;
    const form = formFromEvent(event);
    const seriesStart = Date.parse(event.starts_at);
    const recurring = event.recurrence_frequency && event.recurrence_frequency !== 'none';
    if (recurring) { // show the date that was clicked, like a calendar app
      const start = new Date(occ.startMs).toISOString();
      form.start_date = start.slice(0, 10);
      form.start_time = start.slice(11, 16);
    }
    setDialog({ mode: 'edit', initial: form, event, occStart: occ.starts_at, seriesStart, recurring: Boolean(recurring), isDefault: Boolean(event.is_default) });
  }

  const close = () => { if (!saving) setDialog(null); };

  async function run(task, done) {
    setSaving(true);
    setDialogError('');
    try {
      await task();
      setDialog(null);
      setStatus(done);
      await load();
    } catch (err) {
      setDialogError(err.message || 'Unable to save.');
    } finally {
      setSaving(false);
    }
  }

  function save(payload, scope) {
    const { mode, event, occStart, seriesStart, recurring, isDefault } = dialog;
    return run(async () => {
      if (mode === 'create') {
        await api('/api/admin-events', { method: 'POST', body: JSON.stringify(payload) });
        return;
      }
      if (recurring && scope === 'one') {
        // This event only: skip that date in the series and add a one-off event carrying the change.
        const skip = withExdate(event, occStart);
        const copy = singleOccurrenceCopy({ ...payload, slug: event.slug }, occStart);
        if (isDefault) await api('/api/admin-events', { method: 'POST', body: JSON.stringify({ ...formToStored(event), exdates: skip }) });
        else await api(`/api/admin-events/${event.id}`, { method: 'PUT', body: JSON.stringify({ exdates: skip }) });
        await api('/api/admin-events', { method: 'POST', body: JSON.stringify(copy) });
        return;
      }
      const shift = recurring ? Date.parse(payload.starts_at) - Date.parse(occStart) : 0;
      const body = recurring ? shiftSeries(payload, seriesStart, shift) : payload;
      if (isDefault) await api('/api/admin-events', { method: 'POST', body: JSON.stringify({ ...body, slug: event.slug }) });
      else await api(`/api/admin-events/${event.id}`, { method: 'PUT', body: JSON.stringify(body) });
    }, mode === 'create' ? 'Event added. It now shows on the public Events page.' : 'Event saved. The public Events page is updated.');
  }

  function remove(which) {
    const { event, occStart, isDefault } = dialog;
    return run(async () => {
      if (which === 'one') {
        const exdates = withExdate(event, occStart);
        if (isDefault) await api('/api/admin-events', { method: 'POST', body: JSON.stringify({ ...formToStored(event), exdates }) });
        else await api(`/api/admin-events/${event.id}`, { method: 'PUT', body: JSON.stringify({ exdates }) });
      } else if (isDefault) {
        // A built-in cannot be deleted; an unpublished copy with its slug hides it.
        await api('/api/admin-events', { method: 'POST', body: JSON.stringify({ ...formToStored(event), published: false }) });
      } else if (DEFAULT_KINGDOM_EVENTS.some(def => def.slug === event.slug)) {
        // Deleting a customised built-in would bring the original back, so hide it instead.
        await api(`/api/admin-events/${event.id}`, { method: 'PUT', body: JSON.stringify({ published: false }) });
      } else {
        await api(`/api/admin-events/${event.id}`, { method: 'DELETE' });
      }
    }, which === 'one' ? 'That date was removed from the series.' : 'Event deleted.');
  }

  return (
    <div className="evp">
      <p className="admin-page-lead">
        Click a day, or drag across a time range in Week or Day view, to add an event. Click an event to edit or delete it. Published events appear on the public Events page automatically. Edit Bear Hunt times and alliance legion dates in the Alliances tab.
      </p>
      {error && <p className="guide-message error" role="alert">{error}</p>}
      {status && <p className="guide-message success" role="status">{status}</p>}

      {loading ? <TableSkeleton rows={4} columns={4} /> : (
        <EventCalendar
          events={events}
          mode="admin"
          defaultUtc
          views={['month', 'week', 'day']}
          label="Admin event calendar"
          onCreate={openCreate}
          onOpen={openEdit}
          toolbarExtra={<Button onClick={() => openCreate()}>+ New event</Button>}
        />
      )}

      <details className="evp-list">
        <summary>All events as a list ({events.length})</summary>
        <Table className="stack-table">
          <thead><tr><th>Name</th><th>First start (UTC)</th><th>Repeats</th><th>Alliance</th><th>Status</th><th /></tr></thead>
          <tbody>
            {events.map((event) => (
              <tr key={event.slug}>
                <td>{event.title}{event.is_default ? ' (built-in)' : ''}</td>
                <td>{event.starts_at.slice(0, 16).replace('T', ' ')}</td>
                <td>{recurrenceLabel(event)}</td>
                <td>{eventAllianceLabel(event)}</td>
                <td>{event.published ? 'Published' : 'Draft'}</td>
                <td className="admin-table-actions">
                  <Button variant="quiet" onClick={() => openEdit({ event, startMs: Date.parse(event.starts_at), starts_at: event.starts_at })}>Edit</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
        <p className="admin-page-lead">Built-in events: {DEFAULT_KINGDOM_EVENTS.map(e => e.title).join(', ')}. Editing one saves your own copy that replaces it; starting dates are defaults, so confirm them with leadership.</p>
      </details>

      <EventFormDialog
        open={Boolean(dialog)}
        initial={dialog?.initial}
        mode={dialog?.mode}
        recurring={dialog?.recurring}
        isDefault={dialog?.isDefault}
        alliances={alliances}
        guides={guideOptions}
        busy={saving}
        error={dialogError}
        onSave={save}
        onDelete={remove}
        onClose={close}
      />
    </div>
  );
}

// A stored copy of a built-in or existing event, used to override a default.
function formToStored(event) {
  const { payload } = eventFromForm({ ...formFromEvent(event), slug: event.slug });
  return { ...payload, slug: event.slug, exdates: event.exdates || [] };
}

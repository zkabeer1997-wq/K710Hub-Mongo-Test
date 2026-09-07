'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Field, Input, Select, Textarea, Table } from '../../../../components/ui';

import { nextEventOccurrence, recurrenceLabel, validateEventSchedule } from '../../../../lib/eventRecurrence.mjs';

const KINDS = ['kvk', 'championship', 'swordland', 'custom'];
const EMPTY_FORM = {
  slug: '', title: '', kind: 'custom', description: '', body_md: '',
  starts_at: '', ends_at: '', published: false,
  recurrence_frequency: 'none', recurrence_interval: 1, recurrence_until: '',
};

function toLocalInputValue(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminEventsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmRow, setConfirmRow] = useState(null);
  const router = useRouter();
  const [repeatChoice, setRepeatChoice] = useState('none:1');
  const scheduleInput = {
    ...form,
    starts_at: form.starts_at && Number.isFinite(Date.parse(form.starts_at)) ? new Date(form.starts_at).toISOString() : '',
    ends_at: form.ends_at && Number.isFinite(Date.parse(form.ends_at)) ? new Date(form.ends_at).toISOString() : null,
  };
  const nextDates = [];
  if (form.recurrence_frequency !== 'none') {
    let after = Date.now();
    for (let i = 0; i < 3; i++) {
      const next = nextEventOccurrence(scheduleInput, after);
      if (!next) break;
      nextDates.push(next.starts_at);
      after = Date.parse(next.ends_at || next.starts_at) + 1;
    }
  }

  function changeRepeat(value) {
    setRepeatChoice(value);
    if (value === 'custom') {
      setForm(current => ({ ...current, recurrence_frequency: current.recurrence_frequency === 'none' ? 'daily' : current.recurrence_frequency }));
      return;
    }
    const [frequency, interval] = value.split(':');
    setForm(current => ({ ...current, recurrence_frequency: frequency, recurrence_interval: Number(interval), recurrence_until: frequency === 'none' ? '' : current.recurrence_until }));
  }

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin-events', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load events.');
      setRows(result.events || []);
    } catch (err) {
      setError(err.message || 'Unable to load events.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  function openCreate() {
    setError('');
    setStatus('');
    setEditingId('new');
    setRepeatChoice('none:1');
    setForm(EMPTY_FORM);
  }

  function openEdit(row) {
    setError('');
    setStatus('');
    setEditingId(row.id);
    const choice = `${row.recurrence_frequency || 'none'}:${row.recurrence_interval || 1}`;
    setRepeatChoice(['none:1', 'daily:1', 'daily:2', 'weekly:1', 'weekly:2', 'monthly:1', 'yearly:1'].includes(choice) ? choice : 'custom');
    setForm({
      slug: row.slug,
      title: row.title,
      kind: row.kind,
      description: row.description || '',
      body_md: row.body_md || '',
      starts_at: toLocalInputValue(row.starts_at),
      ends_at: toLocalInputValue(row.ends_at),
      published: row.published,
      recurrence_frequency: row.recurrence_frequency || 'none',
      recurrence_interval: row.recurrence_interval || 1,
      recurrence_until: row.recurrence_until || '',
    });
  }

  function closeEdit() {
    if (saving) return;
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  async function save() {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const { error: scheduleError } = validateEventSchedule(scheduleInput);
      if (scheduleError) throw new Error(scheduleError);
      const isNew = editingId === 'new';
      const response = await fetch(isNew ? '/api/admin-events' : `/api/admin-events/${editingId}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : '',
          ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save event.');
      setStatus(isNew ? 'Event created.' : 'Event saved.');
      setEditingId(null);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message || 'Unable to save event.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!confirmRow) return;
    try {
      const response = await fetch(`/api/admin-events/${confirmRow.id}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to delete event.');
      setStatus('Event deleted.');
      setConfirmRow(null);
      await load();
    } catch (err) {
      setError(err.message || 'Unable to delete event.');
      setConfirmRow(null);
    }
  }

  return (
    <AdminShell
      title="Events"
      subtitle="Schedule one-time or recurring kingdom events. Edit Bear Hunt times and alliance event dates in the Alliances tab."
      onLogout={handleLogout}
    >
      {error && <p className="guide-message error" role="alert">{error}</p>}
      {status && <p className="guide-message success" role="status">{status}</p>}

      <div style={{ marginBottom: 16 }}>
        <Button onClick={openCreate} disabled={editingId !== null}>+ New event</Button>
      </div>

      {editingId !== null && (
        <div className="k-plate" style={{ padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
            <Field label="Title">
              <Input tone="console" value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} />
            </Field>
            <Field label="Slug" hint="lowercase-with-hyphens">
              <Input tone="console" value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))} />
            </Field>
            <Field label="Kind">
              <Select tone="console" value={form.kind} onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </Select>
            </Field>
            <Field label="Published">
              <Select tone="console" value={form.published ? 'yes' : 'no'} onChange={(e) => setForm((f) => ({ ...f, published: e.target.value === 'yes' }))}>
                <option value="no">Draft</option>
                <option value="yes">Published</option>
              </Select>
            </Field>
            <Field label="Starts at (your local time)">
              <Input tone="console" type="datetime-local" value={form.starts_at} onChange={(e) => setForm((f) => ({ ...f, starts_at: e.target.value }))} />
            </Field>
            <Field label="Ends at (optional)">
              <Input tone="console" type="datetime-local" value={form.ends_at} onChange={(e) => setForm((f) => ({ ...f, ends_at: e.target.value }))} />
            </Field>
          </div>
          <fieldset disabled={saving} style={{ border: '1px solid var(--edge)', padding: 16, display: 'grid', gap: 12, minWidth: 0 }}>
            <legend>Repeat schedule</legend>
            <Field label="Repeats" htmlFor="event-repeat">
              <Select id="event-repeat" tone="console" value={repeatChoice} onChange={event => changeRepeat(event.target.value)}>
                <option value="none:1">Does not repeat</option>
                <option value="daily:1">Daily</option>
                <option value="daily:2">Every 2 days</option>
                <option value="weekly:1">Weekly</option>
                <option value="weekly:2">Every 2 weeks</option>
                <option value="monthly:1">Monthly</option>
                <option value="yearly:1">Yearly</option>
                <option value="custom">Custom interval…</option>
              </Select>
            </Field>
            {repeatChoice === 'custom' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Repeat every" htmlFor="event-interval">
                  <Input id="event-interval" tone="console" type="number" min="1" max="365" step="1" value={form.recurrence_interval} onChange={event => setForm(current => ({ ...current, recurrence_interval: event.target.value }))} />
                </Field>
                <Field label="Unit" htmlFor="event-repeat-unit">
                  <Select id="event-repeat-unit" tone="console" value={form.recurrence_frequency} onChange={event => setForm(current => ({ ...current, recurrence_frequency: event.target.value }))}>
                    <option value="daily">Days</option><option value="weekly">Weeks</option><option value="monthly">Months</option><option value="yearly">Years</option>
                  </Select>
                </Field>
              </div>
            )}
            {form.recurrence_frequency !== 'none' && (
              <>
                <Field label="Repeat through (optional, UTC date)" htmlFor="event-repeat-until" hint="Leave blank to repeat indefinitely. The stop date includes events starting on that day.">
                  <Input id="event-repeat-until" tone="console" type="date" value={form.recurrence_until} onChange={event => setForm(current => ({ ...current, recurrence_until: event.target.value }))} />
                </Field>
                <p style={{ margin: 0 }}>Repeats at the same UTC time as the first event. Your local time may shift with daylight saving time. Editing this event updates the whole series.</p>
                {['monthly', 'yearly'].includes(form.recurrence_frequency) && <p style={{ margin: 0 }}>Dates that do not exist in a month or year are skipped, including February 29 in non-leap years.</p>}
                {!form.ends_at && <p style={{ margin: 0 }}>Add an end time to show each occurrence as live until it ends. Otherwise, the countdown advances after its start time.</p>}
                {nextDates.length > 0 && <div><strong>Next dates (UTC)</strong><ul>{nextDates.map(date => <li key={date}>{date.slice(0, 16).replace('T', ' ')} UTC</li>)}</ul></div>}
              </>
            )}
          </fieldset>
          <Field label="Short description">
            <Input tone="console" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
          <Field label="Body (markdown)">
            <Textarea tone="console" rows={8} value={form.body_md} onChange={(e) => setForm((f) => ({ ...f, body_md: e.target.value }))} />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button variant="quiet" onClick={closeEdit} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={4} columns={4} />
      ) : (
        <Table>
          <thead>
            <tr><th>Title</th><th>Kind</th><th>First start</th><th>Repeats</th><th>Status</th><th /></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.title}</td>
                <td>{row.kind}</td>
                <td>{new Date(row.starts_at).toLocaleString()}</td>
                <td>{recurrenceLabel(row)}</td>
                <td>{row.published ? 'Published' : 'Draft'}</td>
                <td className="admin-table-actions">
                  <Button variant="quiet" onClick={() => openEdit(row)} disabled={editingId !== null}>Edit</Button>
                  <Button variant="quiet" onClick={() => setConfirmRow(row)} disabled={editingId !== null}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <ConfirmDialog
        open={Boolean(confirmRow)}
        title="Delete this event?"
        message={confirmRow ? `"${confirmRow.title}" and all its recurring dates will be permanently removed.` : ''}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmRow(null)}
      />
    </AdminShell>
  );
}

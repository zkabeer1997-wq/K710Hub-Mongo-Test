'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import AllianceEventEditor from '../../../../components/admin/AllianceEventEditor';
import { validateAllianceEvents } from '../../../../lib/allianceEvents.mjs';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Field, Input, Select, Textarea, Table } from '../../../../components/ui';

import { validateBearTimes } from '../../../../lib/bearHuntSchedule';
import { notifyBearScheduleChanged } from '../../../../components/BearScheduleProvider';

const STATUSES = ['open', 'selective', 'closed'];
const EMPTY_FORM = {
  tag: '', name: '', blurb: '', leader_player_id: '', timezone_focus: '',
  recruiting_status: 'open', language: '', roster_size: '', active: true, sort_order: 0, bear_times_utc: [], scheduled_events: [],
};

export default function AdminAlliancesPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [editingTag, setEditingTag] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [confirmRow, setConfirmRow] = useState(null);
  const router = useRouter();

  async function load() {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin-alliances', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to load alliances.');
      setRows(result.alliances || []);
    } catch (err) {
      setError(err.message || 'Unable to load alliances.');
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
    setError(''); setStatus(''); setEditingTag('new'); setForm(EMPTY_FORM);
  }

  function openEdit(row) {
    setError(''); setStatus(''); setEditingTag(row.tag);
    setForm({
      bear_times_utc: row.bear_times_utc || [],
      scheduled_events: row.scheduled_events || [],
      tag: row.tag, name: row.name, blurb: row.blurb || '',
      leader_player_id: row.leader_player_id || '', timezone_focus: row.timezone_focus || '',
      recruiting_status: row.recruiting_status, language: row.language || '',
      roster_size: row.roster_size ?? '', active: row.active, sort_order: row.sort_order,
    });
  }

  function closeEdit() {
    if (saving) return;
    setEditingTag(null); setForm(EMPTY_FORM);
  }

  async function save() {
    setSaving(true); setError(''); setStatus('');
    try {
      const { error: timeError } = validateBearTimes(form.bear_times_utc);
      if (timeError) throw new Error(timeError);
      const { error: eventError } = validateAllianceEvents(form.scheduled_events);
      if (eventError) throw new Error(eventError);
      const isNew = editingTag === 'new';
      const response = await fetch(isNew ? '/api/admin-alliances' : `/api/admin-alliances/${editingTag}`, {
        method: isNew ? 'POST' : 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to save alliance.');
      notifyBearScheduleChanged();
      setStatus(isNew ? 'Alliance created.' : 'Alliance saved. Bear Hunt times and event dates updated across the site.');
      setEditingTag(null); setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(err.message || 'Unable to save alliance.');
    } finally {
      setSaving(false);
    }
  }

  async function confirmDelete() {
    if (!confirmRow) return;
    try {
      const response = await fetch(`/api/admin-alliances/${confirmRow.tag}`, { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to delete alliance.');
      notifyBearScheduleChanged();
      setStatus('Alliance deleted.'); setConfirmRow(null);
      await load();
    } catch (err) {
      setError(err.message || 'Unable to delete alliance.'); setConfirmRow(null);
    }
  }

  return (
    <AdminShell title="Alliances" subtitle="Manage alliance details, Bear Hunt times, and event dates shown on the website." onLogout={handleLogout}>
      {error && <p className="guide-message error" role="alert">{error}</p>}
      {status && <p className="guide-message success" role="status">{status}</p>}

      <div style={{ marginBottom: 16 }}>
        <Button onClick={openCreate} disabled={editingTag !== null}>+ New alliance</Button>
      </div>

      {editingTag !== null && (
        <div className="k-plate" style={{ padding: 20, marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(220px, 100%), 1fr))', gap: 12 }}>
            <Field label="Tag" hint="e.g. 710, RED, SKY">
              <Input tone="console" value={form.tag} disabled={editingTag !== 'new'} onChange={(e) => setForm((f) => ({ ...f, tag: e.target.value.toUpperCase() }))} />
            </Field>
            <Field label="Display name">
              <Input tone="console" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
            </Field>
            <Field label="Recruiting status">
              <Select tone="console" value={form.recruiting_status} onChange={(e) => setForm((f) => ({ ...f, recruiting_status: e.target.value }))}>
                {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </Select>
            </Field>
            <Field label="Active (shown publicly)">
              <Select tone="console" value={form.active ? 'yes' : 'no'} onChange={(e) => setForm((f) => ({ ...f, active: e.target.value === 'yes' }))}>
                <option value="yes">Active</option>
                <option value="no">Hidden</option>
              </Select>
            </Field>
            <Field label="Timezone focus">
              <Input tone="console" placeholder="e.g. EU evening → NA late" value={form.timezone_focus} onChange={(e) => setForm((f) => ({ ...f, timezone_focus: e.target.value }))} />
            </Field>
            <Field label="Primary language">
              <Input tone="console" value={form.language} onChange={(e) => setForm((f) => ({ ...f, language: e.target.value }))} />
            </Field>
            <Field label="Roster size">
              <Input tone="console" type="number" value={form.roster_size} onChange={(e) => setForm((f) => ({ ...f, roster_size: e.target.value }))} />
            </Field>
            <Field label="Leadership contact (player ID or name)">
              <Input tone="console" value={form.leader_player_id} onChange={(e) => setForm((f) => ({ ...f, leader_player_id: e.target.value }))} />
            </Field>
          </div>
          <fieldset disabled={saving} style={{ border: '1px solid var(--edge)', padding: 16, display: 'grid', gap: 12, minWidth: 0 }}>
            <legend>Bear Hunt times (UTC)</legend>
            <p style={{ margin: 0 }}>These daily times update the Events page, public alliance schedules, clock, and calendar download.</p>
            {form.bear_times_utc.map((time, index) => (
              <div key={index} style={{ display: 'flex', alignItems: 'end', gap: 12 }}>
                <Field label={`Hunt ${index + 1}`} htmlFor={`bear-time-${index}`}>
                  <Input id={`bear-time-${index}`} tone="console" type="time" step="60" value={time} onChange={event => setForm(current => ({ ...current, bear_times_utc: current.bear_times_utc.map((value, i) => i === index ? event.target.value : value) }))} />
                </Field>
                <Button variant="quiet" aria-label={`Remove hunt ${index + 1}`} onClick={() => setForm(current => ({ ...current, bear_times_utc: current.bear_times_utc.filter((_, i) => i !== index) }))}>Remove</Button>
              </div>
            ))}
            {form.bear_times_utc.length === 0 && <p style={{ margin: 0 }}>No Bear Hunt times set. Add a time to include this alliance in the schedule.</p>}
            <Button variant="quiet" disabled={form.bear_times_utc.length >= 24} onClick={() => setForm(current => ({ ...current, bear_times_utc: [...current.bear_times_utc, ''] }))}>+ Add Bear Hunt time</Button>
          </fieldset>
          <AllianceEventEditor events={form.scheduled_events} disabled={saving} onChange={events => setForm(current => ({ ...current, scheduled_events: events }))} />
          <Field label="Blurb">
            <Textarea tone="console" rows={3} value={form.blurb} onChange={(e) => setForm((f) => ({ ...f, blurb: e.target.value }))} />
          </Field>
          <div style={{ display: 'flex', gap: 10 }}>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
            <Button variant="quiet" onClick={closeEdit} disabled={saving}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={3} columns={4} />
      ) : (
        <Table>
          <thead><tr><th>Tag</th><th>Name</th><th>Bear Hunts (UTC)</th><th>Event dates</th><th>Status</th><th>Active</th><th /></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.tag}>
                <td>{row.tag}</td>
                <td>{row.name}</td>
                <td>{row.bear_times_utc?.join(' · ') || 'Not set'}</td>
                <td>{row.scheduled_events?.length || 0}</td>
                <td>{row.recruiting_status}</td>
                <td>{row.active ? 'Yes' : 'No'}</td>
                <td className="admin-table-actions">
                  <Button variant="quiet" onClick={() => openEdit(row)} disabled={editingTag !== null}>Edit</Button>
                  <Button variant="quiet" onClick={() => setConfirmRow(row)} disabled={editingTag !== null}>Delete</Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}

      <ConfirmDialog
        open={Boolean(confirmRow)}
        title="Delete this alliance?"
        message={confirmRow ? `"${confirmRow.name}" will be permanently removed.` : ''}
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setConfirmRow(null)}
      />
    </AdminShell>
  );
}

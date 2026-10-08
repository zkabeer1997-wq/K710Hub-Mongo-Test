'use client';

import { useEffect, useMemo, useState } from 'react';
import AdminDialog from './AdminDialog';
import GuideCombobox from './GuideCombobox';
import { Button } from '../ui';
import { DURATIONS, REPEATS, eventFromForm, slugify, weekdayZoneNote } from '../../lib/eventForm.mjs';
import { WEEKDAY_NAMES, expandOccurrences, rawOccurrences } from '../../lib/eventRecurrence.mjs';
import './event-editor.css';

const KINDS = [['custom', 'Kingdom event'], ['kvk', 'KvK'], ['championship', 'Championship'], ['swordland', 'Swordland']];

function localLabel(iso) {
  try { return new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' }).format(new Date(iso)); } catch { return ''; }
}

/**
 * Add / edit form. `mode`: 'create' | 'edit'. For a recurring event being edited, `scope` chooses
 * "all events" or "this event only". Parent handles saving and deleting.
 */
export default function EventFormDialog({ open, initial, mode, recurring, isDefault, alliances, guides, busy, error, onSave, onDelete, onClose }) {
  const [form, setForm] = useState(initial);
  const [scope, setScope] = useState('all');
  const [localError, setLocalError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setForm(initial); setScope('all'); setLocalError(''); setConfirmDelete(false); }, [initial, open]);
  const set = patch => setForm(current => ({ ...current, ...patch }));
  const built = useMemo(() => (form ? eventFromForm({ ...form, slug: form.slug || 'preview' }) : { error: '' }), [form]);
  const preview = useMemo(() => {
    if (!built.payload || built.payload.recurrence_frequency === 'none') return [];
    const from = Date.now();
    return expandOccurrences(built.payload, from, from + 400 * 86400000, 4).map(o => o.starts_at);
  }, [built]);
  // For "after N occurrences" show the final date so the admin can sanity-check the total.
  const lastDate = useMemo(() => {
    if (!built.payload?.recurrence_count) return '';
    let last = null;
    for (const ms of rawOccurrences(built.payload)) last = ms;
    return last ? new Date(last).toISOString().slice(0, 10) : '';
  }, [built]);
  const zoneNote = useMemo(() => weekdayZoneNote(built.payload?.starts_at), [built]);
  if (!open || !form) return null;

  const repeating = form.repeat !== 'none';
  const showWeekdays = form.repeat === 'weekly' || form.repeat === 'nweeks' || (form.repeat === 'custom' && form.unit === 'weekly');
  const allianceTags = alliances.map(a => a.tag);
  const startIso = built.payload?.starts_at;

  function submit(event) {
    event.preventDefault();
    if (built.error) { setLocalError(built.error); return; }
    setLocalError('');
    const slug = form.slug || `${slugify(form.title)}-${Date.now().toString(36).slice(-4)}`;
    onSave({ ...built.payload, slug }, scope);
  }

  const toggleDay = day => set({ weekdays: form.weekdays.includes(day) ? form.weekdays.filter(d => d !== day) : [...form.weekdays, day] });
  const toggleAlliance = tag => set({ alliance_tags: form.alliance_tags.includes(tag) ? form.alliance_tags.filter(t => t !== tag) : [...form.alliance_tags, tag] });

  const footer = confirmDelete ? (
    <div className="evf-actions">
      <span className="evf-del-q">{recurring ? 'Delete which events?' : 'Delete this event?'}</span>
      {recurring && <Button variant="quiet" className="evf-outline" onClick={() => onDelete('one')} disabled={busy}>This event</Button>}
      {recurring && <Button variant="quiet" className="evf-outline" onClick={() => onDelete('following')} disabled={busy}>This and following events</Button>}
      <Button variant="quiet" className="evf-danger" onClick={() => onDelete('all')} disabled={busy}>{recurring ? 'All events' : 'Delete'}</Button>
      <Button variant="quiet" onClick={() => setConfirmDelete(false)} disabled={busy}>Back</Button>
    </div>
  ) : (
    <div className="evf-actions">
      {mode === 'edit' && <Button variant="quiet" className="evf-danger" onClick={() => setConfirmDelete(true)} disabled={busy}>Delete</Button>}
      <span className="evf-spacer" />
      <Button variant="quiet" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button type="submit" form="event-form" disabled={busy}>{busy ? 'Saving…' : 'Save'}</Button>
    </div>
  );

  return (
    <AdminDialog open={open} onClose={onClose} busy={busy} title={mode === 'edit' ? 'Edit event' : 'Add event'} variant="drawer" footer={footer}>
      <form id="event-form" className="evf" onSubmit={submit} noValidate>
        {isDefault && <p className="evf-note">Built-in kingdom event. Saving creates your own copy that replaces the built-in one (no duplicates). Deleting hides it.</p>}
        <label className="evf-field">Event name
          <input className="evf-input" data-autofocus required value={form.title} placeholder="e.g. Strongest Governor" onChange={(e) => set({ title: e.target.value })} />
        </label>

        <fieldset className="evf-group">
          <legend>When (UTC)</legend>
          <label className="evf-check"><input type="checkbox" checked={form.all_day} onChange={(e) => set({ all_day: e.target.checked })} /> All-day event</label>
          <div className="evf-row">
            <label className="evf-field">{form.all_day ? 'Start date' : 'Start date (UTC)'}
              <input className="evf-input" type="date" value={form.start_date} onChange={(e) => set({ start_date: e.target.value })} />
            </label>
            {!form.all_day && (
              <label className="evf-field">Start time (UTC)
                <input className="evf-input" type="time" step="300" value={form.start_time} onChange={(e) => set({ start_time: e.target.value })} />
              </label>
            )}
          </div>
          {form.all_day ? (
            <label className="evf-field">Last day (optional)
              <input className="evf-input" type="date" min={form.start_date} value={form.end_date} onChange={(e) => set({ end_date: e.target.value })} />
            </label>
          ) : (
            <>
              <label className="evf-field">Length
                <select className="evf-input" value={form.duration} onChange={(e) => set({ duration: e.target.value })}>
                  {DURATIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
              </label>
              {form.duration === 'custom' && (
                <div className="evf-row">
                  <label className="evf-field">End date (UTC)<input className="evf-input" type="date" value={form.end_date} onChange={(e) => set({ end_date: e.target.value })} /></label>
                  <label className="evf-field">End time (UTC)<input className="evf-input" type="time" step="300" value={form.end_time} onChange={(e) => set({ end_time: e.target.value })} /></label>
                </div>
              )}
            </>
          )}
          {startIso && <p className="evf-zone"><b>{startIso.slice(0, 16).replace('T', ' ')} UTC</b> = {localLabel(startIso)} on your device</p>}
        </fieldset>

        <fieldset className="evf-group">
          <legend>Repeat</legend>
          <label className="evf-field">Repeats
            <select className="evf-input" value={form.repeat} onChange={(e) => set({ repeat: e.target.value })}>
              {REPEATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          {(form.repeat === 'nweeks' || form.repeat === 'custom') && (
            <div className="evf-row">
              <label className="evf-field">Every
                <input className="evf-input" type="number" min="1" max="365" value={form.interval} onChange={(e) => set({ interval: e.target.value })} />
              </label>
              <label className="evf-field">{form.repeat === 'nweeks' ? 'Unit' : 'Unit'}
                {form.repeat === 'nweeks' ? <input className="evf-input" value="weeks" readOnly /> : (
                  <select className="evf-input" value={form.unit} onChange={(e) => set({ unit: e.target.value })}>
                    <option value="daily">days</option><option value="weekly">weeks</option><option value="monthly">months</option><option value="yearly">years</option>
                  </select>
                )}
              </label>
            </div>
          )}
          {showWeekdays && (
            <div role="group" aria-label="Repeat on these days (UTC)" className="evf-days">
              <span className="evf-days-label">Days (UTC)</span>
              {WEEKDAY_NAMES.map((name, day) => (
                <button type="button" key={name} aria-pressed={form.weekdays.includes(day)} onClick={() => toggleDay(day)}>{name}</button>
              ))}
              <small className="evf-hint">Days are UTC weekdays. None selected means the weekday of the start date.</small>
              {zoneNote && <small className="evf-hint" data-testid="evf-zone-note">{zoneNote.text}.</small>}
              {zoneNote?.hint && <small className="evf-hint evf-warn" role="status">{zoneNote.hint}</small>}
            </div>
          )}
          {repeating && (
            <div role="radiogroup" aria-label="Ends" className="evf-stop">
              <span className="evf-days-label">Ends</span>
              <label><input type="radio" name="stop" checked={form.stop === 'never'} onChange={() => set({ stop: 'never' })} /> Never</label>
              <label><input type="radio" name="stop" checked={form.stop === 'date'} onChange={() => set({ stop: 'date' })} /> On date (UTC)
                <input className="evf-input" type="date" aria-label="Stop date (UTC)" min={form.start_date} value={form.until} disabled={form.stop !== 'date'} onChange={(e) => set({ until: e.target.value })} />
              </label>
              <label><input type="radio" name="stop" checked={form.stop === 'count'} onChange={() => set({ stop: 'count' })} /> After
                <input className="evf-input evf-count" type="number" min="1" max="500" step="1" aria-label="Number of occurrences" value={form.count} disabled={form.stop !== 'count'} onChange={(e) => set({ count: e.target.value })} /> occurrences
              </label>
            </div>
          )}
          {preview.length > 0 && <p className="evf-hint">Next: {preview.map(iso => iso.slice(5, 16).replace('T', ' ')).join(' · ')} UTC{lastDate ? ` · last on ${lastDate}` : ''}</p>}
          {form.series_id && <p className="evf-hint">Part of a series (split with &ldquo;this and following events&rdquo;).</p>}
          {form.exdates?.length > 0 && <p className="evf-hint">{form.exdates.length} single date(s) skipped.</p>}
          {recurring && mode === 'edit' && (
            <div role="radiogroup" aria-label="Apply changes to" className="evf-scope">
              <label><input type="radio" name="scope" checked={scope === 'one'} onChange={() => setScope('one')} /> This event</label>
              <label><input type="radio" name="scope" checked={scope === 'following'} onChange={() => setScope('following')} /> This and following events</label>
              <label><input type="radio" name="scope" checked={scope === 'all'} onChange={() => setScope('all')} /> All events</label>
            </div>
          )}
        </fieldset>

        <fieldset className="evf-group">
          <legend>Alliance</legend>
          <div className="evf-days" role="group" aria-label="Alliances">
            <button type="button" aria-pressed={form.alliance_tags.length === 0} onClick={() => set({ alliance_tags: [] })}>All</button>
            {allianceTags.map(tag => <button type="button" key={tag} aria-pressed={form.alliance_tags.includes(tag)} onClick={() => toggleAlliance(tag)}>{tag}</button>)}
          </div>
        </fieldset>

        <div className="evf-field">
          <label htmlFor="evf-guide">Linked guide</label>
          <GuideCombobox id="evf-guide" guides={guides} value={form.guide_slug} onChange={(guide_slug) => set({ guide_slug })} />
        </div>
        <label className="evf-field">Description
          <textarea className="evf-input" rows={3} value={form.description} onChange={(e) => set({ description: e.target.value })} />
        </label>
        <label className="evf-field">Type
          <select className="evf-input" value={form.kind} onChange={(e) => set({ kind: e.target.value })}>
            {KINDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        <label className="evf-check"><input type="checkbox" checked={form.published} onChange={(e) => set({ published: e.target.checked })} /> Published (visible to members on /events)</label>
        <details className="evf-adv">
          <summary>More options</summary>
          <label className="evf-field">Detail page text (markdown)<textarea className="evf-input" rows={5} value={form.body_md} onChange={(e) => set({ body_md: e.target.value })} /></label>
          <label className="evf-field">Slug (web address)<input className="evf-input" value={form.slug} readOnly={isDefault || mode === 'edit'} placeholder="made from the name" onChange={(e) => set({ slug: e.target.value })} /></label>
        </details>
        {(localError || error) && <p className="evf-error" role="alert">{localError || error}</p>}
      </form>
    </AdminDialog>
  );
}

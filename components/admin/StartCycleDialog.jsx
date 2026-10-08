'use client';

import { useMemo, useState } from 'react';
import AdminDialog from './AdminDialog';
import { Button, Field, Input } from '../ui';
import { fromLocalInput, localZoneName } from './adminDates';

// "KvK Season 12" -> "KvK Season 13". Falls back to "<fallback> 1".
export function suggestNextLabel(history, cycle, fallback) {
  const labels = [cycle?.label, ...(history || []).map((h) => h.label)].filter(Boolean);
  let best = null;
  for (const label of labels) {
    const m = String(label).match(/^(.*?)(\d+)\s*$/);
    if (m) {
      const n = Number(m[2]);
      if (!best || n > best.n) best = { prefix: m[1], n };
    }
  }
  if (best) return `${best.prefix}${best.n + 1}`;
  if (labels.length) return `${labels[0]} 2`;
  return `${fallback} 1`;
}

export default function StartCycleDialog({ open, onClose, onSubmit, suggestion, hasPrevious, eventName }) {
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [serverError, setServerError] = useState('');
  const zone = useMemo(() => localZoneName(), []);

  // Re-seed the form every time the dialog opens.
  const [wasOpen, setWasOpen] = useState(false);
  if (open && !wasOpen) {
    setWasOpen(true);
    setForm({ label: suggestion, start: '', end: '', opens: '', closes: '', keep: true, closePrev: true });
    setErrors({});
    setServerError('');
  } else if (!open && wasOpen) {
    setWasOpen(false);
  }
  if (!open || !form) return null;

  const set = (key, value) => setForm((cur) => ({ ...cur, [key]: value }));

  function validate() {
    const next = {};
    const label = form.label.trim();
    if (!label) next.label = 'Enter a name for the new cycle.';
    else if (label.length > 60) next.label = 'Keep the name under 60 characters.';
    if (form.start && form.end && new Date(form.end) <= new Date(form.start)) next.end = 'The end must be after the start.';
    if (form.opens && form.closes && new Date(form.closes) <= new Date(form.opens)) next.closes = 'Forms must close after they open.';
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event) {
    event.preventDefault();
    if (!validate()) return;
    setBusy(true);
    setServerError('');
    try {
      await onSubmit({
        label: form.label.trim(),
        start_date: fromLocalInput(form.start),
        end_date: fromLocalInput(form.end),
        opens_at: fromLocalInput(form.opens),
        closes_at: fromLocalInput(form.closes),
        copy_settings: form.keep,
        close_previous: hasPrevious ? form.closePrev : false,
      });
    } catch (err) {
      setServerError(err.message || 'Could not start the cycle.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AdminDialog
      open
      title={`Start next ${eventName} cycle`}
      onClose={onClose}
      busy={busy}
      footer={(
        <>
          <Button variant="quiet" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" form="start-cycle-form" disabled={busy}>{busy ? 'Starting...' : 'Start cycle'}</Button>
        </>
      )}
    >
      <form id="start-cycle-form" className="ec-form" onSubmit={submit} noValidate>
        {serverError ? <p className="ec-inline-error" role="alert">{serverError}</p> : null}
        <Field label="Cycle name" error={errors.label} htmlFor="sc-label">
          <Input tone="console" id="sc-label" data-autofocus value={form.label} maxLength={80} onChange={(e) => set('label', e.target.value)} aria-invalid={Boolean(errors.label)} />
        </Field>
        <div className="ec-form-row">
          <Field label="Cycle starts (optional)" htmlFor="sc-start">
            <Input tone="console" id="sc-start" type="datetime-local" value={form.start} onChange={(e) => set('start', e.target.value)} />
          </Field>
          <Field label="Cycle ends (optional)" error={errors.end} htmlFor="sc-end">
            <Input tone="console" id="sc-end" type="datetime-local" value={form.end} onChange={(e) => set('end', e.target.value)} aria-invalid={Boolean(errors.end)} />
          </Field>
        </div>
        <div className="ec-form-row">
          <Field label="Forms open (optional)" htmlFor="sc-opens">
            <Input tone="console" id="sc-opens" type="datetime-local" value={form.opens} onChange={(e) => set('opens', e.target.value)} />
          </Field>
          <Field label="Forms close (optional)" error={errors.closes} htmlFor="sc-closes">
            <Input tone="console" id="sc-closes" type="datetime-local" value={form.closes} onChange={(e) => set('closes', e.target.value)} aria-invalid={Boolean(errors.closes)} />
          </Field>
        </div>
        <p className="ec-hint">Times are in your local time ({zone}) and saved in UTC.</p>
        <label className="ec-check">
          <input type="checkbox" checked={form.keep} onChange={(e) => set('keep', e.target.checked)} />
          <span>Keep the previous form messages</span>
        </label>
        <label className="ec-check">
          <input type="checkbox" checked={hasPrevious ? form.closePrev : false} disabled={!hasPrevious} onChange={(e) => set('closePrev', e.target.checked)} />
          <span>Close the previous cycle{hasPrevious ? '' : ' (there is none yet)'}</span>
        </label>
      </form>
    </AdminDialog>
  );
}

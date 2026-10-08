'use client';

import Link from 'next/link';
import { useState } from 'react';
import StatusChip from './StatusChip';
import Switch from './Switch';
import { Button } from '../ui';
import { describeFormState, fromLocalInput, localZoneName, toLocalInput } from './adminDates';

// Compact forms table for one event cycle. Opens / Closes are inline editors
// saved per row with an explicit Save button and visible feedback.
export default function EventForms({ forms, onSaveWindow, onToggle }) {
  const [drafts, setDrafts] = useState({});
  const [saving, setSaving] = useState(null);
  const [feedback, setFeedback] = useState({});

  const draftFor = (form) => drafts[form.form_key] || { opens: toLocalInput(form.opens_at), closes: toLocalInput(form.closes_at) };
  const isDirty = (form) => {
    const d = drafts[form.form_key];
    return Boolean(d) && (d.opens !== toLocalInput(form.opens_at) || d.closes !== toLocalInput(form.closes_at));
  };

  function edit(form, key, value) {
    setDrafts((cur) => ({ ...cur, [form.form_key]: { ...draftFor(form), [key]: value } }));
    setFeedback((cur) => ({ ...cur, [form.form_key]: null }));
  }

  async function save(form) {
    const d = draftFor(form);
    if (d.opens && d.closes && new Date(d.closes) <= new Date(d.opens)) {
      setFeedback((cur) => ({ ...cur, [form.form_key]: { kind: 'error', text: 'Closes must be after Opens.' } }));
      return;
    }
    setSaving(form.form_key);
    try {
      await onSaveWindow(form, { opens_at: fromLocalInput(d.opens), closes_at: fromLocalInput(d.closes) });
      setDrafts((cur) => {
        const next = { ...cur };
        delete next[form.form_key];
        return next;
      });
      setFeedback((cur) => ({ ...cur, [form.form_key]: { kind: 'ok', text: 'Saved' } }));
    } catch (err) {
      setFeedback((cur) => ({ ...cur, [form.form_key]: { kind: 'error', text: err.message || 'Could not save.' } }));
    } finally {
      setSaving(null);
    }
  }

  if (!forms.length) return <p className="ec-empty">No forms are attached to this cycle yet.</p>;

  return (
    <div className="ec-forms">
      <div className="admin-table-wrap">
        <table className="admin-table ec-forms-table">
          <thead>
            <tr>
              <th scope="col">Form</th>
              <th scope="col">State</th>
              <th scope="col">Opens</th>
              <th scope="col">Closes</th>
              <th scope="col"><span className="sr-only">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {forms.map((form) => {
              const chip = describeFormState(form.state, form.opens_at, form.closes_at, form.is_open ? 'window' : 'admin');
              const d = draftFor(form);
              const fb = feedback[form.form_key];
              const dirty = isDirty(form);
              return (
                <tr key={form.form_key}>
                  <th scope="row" data-label="Form" className="ec-form-name">
                    <span>{form.label}</span>
                    {form.edit_href ? <Link href={form.edit_href} className="ec-link">Edit form text</Link> : null}
                  </th>
                  <td data-label="State"><StatusChip kind={chip.kind}>{chip.text}</StatusChip></td>
                  <td data-label="Opens">
                    <input
                      type="datetime-local"
                      className="ec-dt"
                      aria-label={`${form.label}: opens`}
                      value={d.opens}
                      onChange={(e) => edit(form, 'opens', e.target.value)}
                    />
                  </td>
                  <td data-label="Closes">
                    <input
                      type="datetime-local"
                      className="ec-dt"
                      aria-label={`${form.label}: closes`}
                      value={d.closes}
                      onChange={(e) => edit(form, 'closes', e.target.value)}
                    />
                  </td>
                  <td data-label="Actions" className="ec-form-actions">
                    <Switch
                      checked={form.is_open}
                      label={`${form.label}: ${form.is_open ? 'open, switch to close' : 'closed, switch to open'}`}
                      onText="Open"
                      offText="Closed"
                      onChange={(next) => onToggle(form, next)}
                      disabled={saving === form.form_key}
                    />
                    <Button variant="quiet" className="ec-btn-sm" onClick={() => save(form)} disabled={!dirty || saving === form.form_key}>
                      {saving === form.form_key ? 'Saving...' : 'Save'}
                    </Button>
                    <span className={`ec-feedback${fb ? ` is-${fb.kind}` : ''}`} role={fb?.kind === 'error' ? 'alert' : 'status'}>
                      {fb ? (fb.kind === 'ok' ? `✓ ${fb.text}` : fb.text) : dirty ? 'Unsaved changes' : ''}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="ec-hint">Times are in your local time ({localZoneName()}) and saved in UTC.</p>
    </div>
  );
}

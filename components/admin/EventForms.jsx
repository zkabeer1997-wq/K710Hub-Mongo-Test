'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import StatusChip from './StatusChip';
import Switch from './Switch';
import { Button } from '../ui';
import { describeFormState, fromLocalInput, localZoneName, toLocalInput } from './adminDates';
import { formsStripSummary } from '../../lib/eventPage.mjs';

// Forms for one event cycle, collapsed to a one-line status strip so the
// page's real content (Participants, Rallies...) stays above the fold. Open it
// to switch forms on/off and set open/close times. Opens / Closes are inline
// editors saved per row with an explicit Save button and visible feedback.
// Unscheduled forms say "Not scheduled" until the admin chooses to schedule.
export default function EventForms({ forms, onSaveWindow, onToggle, gatesHref = '/admin/dashboard/form-gates' }) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);
  const [drafts, setDrafts] = useState({});
  const [revealed, setRevealed] = useState({});
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

  function cancelSchedule(form) {
    setRevealed((cur) => ({ ...cur, [form.form_key]: false }));
    setDrafts((cur) => {
      const next = { ...cur };
      delete next[form.form_key];
      return next;
    });
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
      setRevealed((cur) => ({ ...cur, [form.form_key]: false }));
      setFeedback((cur) => ({ ...cur, [form.form_key]: { kind: 'ok', text: 'Saved' } }));
    } catch (err) {
      setFeedback((cur) => ({ ...cur, [form.form_key]: { kind: 'error', text: err.message || 'Could not save.' } }));
    } finally {
      setSaving(null);
    }
  }

  if (!forms.length) return <p className="ec-empty">No forms are attached to this cycle yet.</p>;

  const summary = formsStripSummary(forms);
  const unsaved = forms.some(isDirty);

  return (
    <div className="ec-forms">
      <div className="ec-forms-strip">
        <button
          type="button"
          className="ec-forms-toggle"
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="ec-forms-name">Forms</span>
          <span className="ec-forms-sum">{summary.text}</span>
          {unsaved ? <span className="ec-forms-unsaved">Unsaved changes</span> : null}
          <span className="ec-forms-manage">{expanded ? 'Hide' : 'Manage'}<span aria-hidden="true">{expanded ? ' ▴' : ' ▾'}</span></span>
        </button>
        <Link href={gatesHref} className="ec-link ec-forms-gates">Forms &amp; copy</Link>
      </div>

      <div id={panelId} className="ec-forms-panel" hidden={!expanded}>
        <ul className="ec-forms-list">
          {forms.map((form) => {
            const chip = describeFormState(form.state, form.opens_at, form.closes_at, form.is_open ? 'window' : 'admin');
            const d = draftFor(form);
            const fb = feedback[form.form_key];
            const dirty = isDirty(form);
            const scheduled = Boolean(d.opens || d.closes || form.opens_at || form.closes_at || revealed[form.form_key]);
            const busy = saving === form.form_key;
            return (
              <li key={form.form_key} className="ec-form-item">
                <div className="ec-form-id">
                  <strong>{form.label}</strong>
                  {form.edit_href ? <Link href={form.edit_href} className="ec-link">Edit form text</Link> : null}
                </div>
                <div className="ec-form-state">
                  <StatusChip kind={chip.kind}>{chip.text}</StatusChip>
                  <Switch
                    checked={form.is_open}
                    label={`${form.label}: ${form.is_open ? 'open, switch to close' : 'closed, switch to open'}`}
                    onText="Open"
                    offText="Closed"
                    onChange={(next) => onToggle(form, next)}
                    disabled={busy}
                  />
                </div>
                <div className="ec-form-sched">
                  {scheduled ? (
                    <>
                      <label className="ec-dt-field">
                        <span>Opens</span>
                        <input
                          type="datetime-local"
                          className="ec-dt"
                          aria-label={`${form.label}: opens`}
                          value={d.opens}
                          onChange={(e) => edit(form, 'opens', e.target.value)}
                        />
                      </label>
                      <label className="ec-dt-field">
                        <span>Closes</span>
                        <input
                          type="datetime-local"
                          className="ec-dt"
                          aria-label={`${form.label}: closes`}
                          value={d.closes}
                          onChange={(e) => edit(form, 'closes', e.target.value)}
                        />
                      </label>
                    </>
                  ) : (
                    <p className="ec-unscheduled">
                      <span>Not scheduled</span>
                      <Button
                        variant="quiet"
                        className="ec-btn-sm"
                        aria-label={`Schedule ${form.label}`}
                        onClick={() => setRevealed((cur) => ({ ...cur, [form.form_key]: true }))}
                      >
                        Schedule
                      </Button>
                    </p>
                  )}
                </div>
                <div className="ec-form-save">
                  {scheduled ? (
                    <>
                      <Button className="ec-btn-sm" onClick={() => save(form)} disabled={!dirty || busy}>
                        {busy ? 'Saving...' : 'Save'}
                      </Button>
                      {!form.opens_at && !form.closes_at && !dirty ? (
                        <button type="button" className="ec-link-btn" onClick={() => cancelSchedule(form)}>Cancel</button>
                      ) : null}
                    </>
                  ) : null}
                  <span className={`ec-feedback${fb ? ` is-${fb.kind}` : ''}`} role={fb?.kind === 'error' ? 'alert' : 'status'}>
                    {fb ? (fb.kind === 'ok' ? `✓ ${fb.text}` : fb.text) : dirty ? 'Unsaved changes' : ''}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="ec-hint">Times are in your local time ({localZoneName()}) and saved in UTC.</p>
      </div>
    </div>
  );
}

'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import StatusChip from './StatusChip';
import { describeFormState } from './adminDates';
import { formatUtc } from '../../lib/deadlines.mjs';
import { formsStripSummary } from '../../lib/eventPage.mjs';

// Forms for one event cycle, collapsed to a one-line status strip so the page's
// real content (Participants, Rallies...) stays above the fold. This strip is
// READ-ONLY: Forms & copy is the single place where forms are switched on/off,
// scheduled and reworded, so the two screens can never disagree. The cycle-wide
// actions (open / close all forms, start a cycle) stay in the page header.
export default function EventForms({ forms, gatesHref = '/admin/dashboard/form-gates' }) {
  const panelId = useId();
  const [expanded, setExpanded] = useState(false);

  if (!forms.length) return <p className="ec-empty">No forms are attached to this cycle yet.</p>;

  const summary = formsStripSummary(forms);

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
          <span className="ec-forms-manage">{expanded ? 'Hide' : 'Details'}<span aria-hidden="true">{expanded ? ' ▴' : ' ▾'}</span></span>
        </button>
        <Link href={gatesHref} className="ec-link ec-forms-gates">Forms &amp; copy</Link>
      </div>

      <div id={panelId} className="ec-forms-panel" hidden={!expanded}>
        <ul className="ec-forms-list">
          {forms.map((form) => {
            const chip = describeFormState(form.state, form.opens_at, form.closes_at, form.is_open ? 'window' : 'admin');
            return (
              <li key={form.form_key} className="ec-form-item ec-form-item-ro">
                <div className="ec-form-id"><strong>{form.label}</strong></div>
                <div className="ec-form-state"><StatusChip kind={chip.kind}>{chip.text}</StatusChip></div>
                <div className="ec-form-sched ec-form-times">
                  {form.opens_at || form.closes_at ? (
                    <span>
                      {form.opens_at ? `Opens ${formatUtc(form.opens_at)}` : ''}
                      {form.opens_at && form.closes_at ? ' · ' : ''}
                      {form.closes_at ? `Closes ${formatUtc(form.closes_at)}` : ''}
                    </span>
                  ) : (
                    <span className="ec-unscheduled">Not scheduled</span>
                  )}
                </div>
                <div className="ec-form-save">
                  {form.edit_href ? <Link href={form.edit_href} className="ec-link">Edit form text</Link> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="ec-hint">To switch a form on or off, or change its times and wording, use Forms &amp; copy.</p>
      </div>
    </div>
  );
}

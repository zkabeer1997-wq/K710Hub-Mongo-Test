'use client';

import DualTime from '../ui/DualTime';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';

// Plain-words state line at the top of every member form. Three cases:
//  (a) done this cycle, (b) not done this cycle (with a carried-over hint when last cycle's
//  answers exist), (c) never filled in. Pass `formKey` to look the state up itself, or
//  `known` + `updatedAt` (+ optional `cycleLabel`, `previousLabel`) when the form loaded its own entry.
//  Additive props: `fromLabel` (a non-cycle source such as 'your Power Profile', for forms prefilled
//  from another record) and `prefillOnly` (render only the "we filled this in" line, nothing else).
export default function UpsertNotice({ formKey, updatedAt, known, cycleLabel, previousLabel, subject, fromLabel, prefillOnly }) {
  const { status, loaded } = useMemberFormStatus();
  let at = updatedAt;
  let ready = known;
  let cycle = cycleLabel || null;
  let previous = previousLabel || null;
  let from = fromLabel || null;
  if (formKey) {
    const form = status.forms?.find((f) => f.key === formKey);
    ready = loaded && status.signedIn && Boolean(form);
    at = form?.submitted ? form.updatedAt || null : null;
    cycle = form?.cycleLabel || null;
    previous = form?.carriedOver ? form.previousLabel : null;
    from = !form?.submitted && !previous && form?.baseLabel ? form.baseLabel : from;
  }
  if (!ready) return null;
  if (prefillOnly) {
    if (!previous && !from) return null;
    return (
      <p className="upsert-notice" role="status">
        <span>We filled this in from {previous ? `your answers last cycle (${previous})` : from}. Please check them, then press Save.</span>
      </p>
    );
  }
  const forCycle = cycle ? ` for ${cycle}` : '';
  const forSubject = subject ? ` (${subject})` : '';
  return (
    <p className="upsert-notice" role="status">
      {at ? (
        <>
          <strong>Done{forCycle}{forSubject}. Saved <DualTime value={at} />.</strong>
          <span>You can change your answers and save again.</span>
        </>
      ) : previous ? (
        <>
          <strong>Not done{forCycle}{forSubject} yet.</strong>
          <span>We filled this in from your answers last cycle ({previous}). Please check them, then press Save.</span>
        </>
      ) : from ? (
        <>
          <strong>Not done{forCycle}{forSubject} yet.</strong>
          <span>We filled in what we already know from {from}. Please check it, then press Save.</span>
        </>
      ) : cycle ? (
        <>
          <strong>Not done{forCycle}{forSubject} yet.</strong>
          <span>You have not filled this in yet.</span>
        </>
      ) : (
        <strong>You have not filled this in yet.</strong>
      )}
    </p>
  );
}

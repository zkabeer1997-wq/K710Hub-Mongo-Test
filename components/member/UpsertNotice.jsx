'use client';

import DualTime from '../ui/DualTime';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';

// Plain-words state line at the top of every member form. Three cases:
//  (a) done this cycle, (b) not done this cycle (with a carried-over hint when last cycle's
//  answers exist), (c) never filled in. Pass `formKey` to look the state up itself, or
//  `known` + `updatedAt` (+ optional `cycleLabel`, `previousLabel`) when the form loaded its own entry.
export default function UpsertNotice({ formKey, updatedAt, known, cycleLabel, previousLabel, subject }) {
  const { status, loaded } = useMemberFormStatus();
  let at = updatedAt;
  let ready = known;
  let cycle = cycleLabel || null;
  let previous = previousLabel || null;
  if (formKey) {
    const form = status.forms?.find((f) => f.key === formKey);
    ready = loaded && status.signedIn && Boolean(form);
    at = form?.submitted ? form.updatedAt || null : null;
    cycle = form?.cycleLabel || null;
    previous = form?.carriedOver ? form.previousLabel : null;
  }
  if (!ready) return null;
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

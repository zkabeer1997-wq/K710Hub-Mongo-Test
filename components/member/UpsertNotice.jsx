'use client';

import DualTime from '../ui/DualTime';
import { useMemberFormStatus } from '../../lib/useMemberFormStatus';

// Plain-words state line shown at the top of every member form: what is on file
// and that saving overwrites it. Pass `formKey` to look the state up itself, or
// `updatedAt` + `known` when the form already loaded its own entry.
export default function UpsertNotice({ formKey, updatedAt, known }) {
  const { status, loaded } = useMemberFormStatus();
  let at = updatedAt;
  let ready = known;
  if (formKey) {
    const form = status.forms?.find((f) => f.key === formKey);
    ready = loaded && status.signedIn && Boolean(form);
    at = form?.updatedAt || null;
  }
  if (!ready) return null;
  return (
    <p className="upsert-notice" role="status">
      {at ? (<strong>Last updated <DualTime value={at} /></strong>) : (<strong>No entry on file yet — this will be your first submission.</strong>)}
      <small>Saving replaces your previous entry; it never creates a duplicate.</small>
    </p>
  );
}

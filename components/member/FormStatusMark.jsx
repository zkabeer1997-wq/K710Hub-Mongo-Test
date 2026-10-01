// Status for one member form, never colour-only: a red dot (decorative) always
// comes with visually-hidden text, and window states are spelled out as badges.
export default function FormStatusMark({ status }) {
  if (!status) return null;
  return (
    <span className="form-status-mark">
      {status.needsInput && (
        <>
          <span className="form-status-dot" aria-hidden="true" />
          <span className="sr-only">not submitted</span>
        </>
      )}
      {status.badge && <span className={`form-status-badge is-${status.state}`}>{status.badge}</span>}
    </span>
  );
}

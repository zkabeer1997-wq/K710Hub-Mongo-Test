// A labelled on/off switch. Wraps a real checkbox input (not a div) so
// keyboard, screen reader, and form semantics come for free - only the
// visual track/thumb is custom.
export default function Toggle({ label, checked, onChange, disabled = false, id, className = '' }) {
  return (
    <label className={`ui-toggle ${disabled ? 'is-disabled' : ''} ${className}`} htmlFor={id}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span className="ui-toggle-track" aria-hidden="true">
        <span className="ui-toggle-thumb" />
      </span>
      {label && <span className="ui-toggle-label">{label}</span>}
    </label>
  );
}

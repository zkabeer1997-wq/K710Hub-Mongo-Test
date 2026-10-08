'use client';

// Accessible on/off switch. The visible state text sits beside it, so state is
// never carried by colour or position alone.
export default function Switch({ checked, onChange, label, onText = 'On', offText = 'Off', disabled = false }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={`ec-switch${checked ? ' is-on' : ''}`}
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="ec-switch-track" aria-hidden="true"><span className="ec-switch-thumb" /></span>
      <span className="ec-switch-text">{checked ? onText : offText}</span>
    </button>
  );
}

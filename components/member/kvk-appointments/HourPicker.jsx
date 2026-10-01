'use client';

import { useEffect, useId, useState } from 'react';
import { HOUR_OPTIONS, PREFERRED_HOUR_COUNT, localTimeLabel } from '../../../lib/kvkAppointments.mjs';

// Pick exactly PREFERRED_HOUR_COUNT UTC hours. Every option shows UTC first and,
// once mounted, the viewer's local time. Native checkboxes keep keyboard and
// screen-reader behaviour for free; once the limit is reached the unchecked
// options are disabled (the API validates the count again on save).
export default function HourPicker({ value, onChange, disabled = false, describedBy }) {
  const uid = useId();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const ref = new Date();
  const full = value.length >= PREFERRED_HOUR_COUNT;

  function toggle(hour) {
    if (value.includes(hour)) onChange(value.filter((h) => h !== hour));
    else if (!full) onChange([...value, hour]);
  }

  return (
    <fieldset className="hour-picker" disabled={disabled} aria-describedby={describedBy}>
      <legend>Preferred hours (pick exactly {PREFERRED_HOUR_COUNT})</legend>
      <p className="hour-picker-count" id={`${uid}-count`} role="status" aria-live="polite">
        {value.length} of {PREFERRED_HOUR_COUNT} selected{value.length === PREFERRED_HOUR_COUNT ? ' - ready' : ''}
      </p>
      <div className="hour-picker-grid">
        {HOUR_OPTIONS.map((option) => {
          const checked = value.includes(option.value);
          const local = mounted ? localTimeLabel(option.utc, ref) : '';
          return (
            <label key={option.value} className={`hour-option${checked ? ' is-checked' : ''}`}>
              <input
                type="checkbox"
                name="preferred_hours"
                value={option.value}
                checked={checked}
                disabled={!checked && full}
                onChange={() => toggle(option.value)}
                aria-describedby={`${uid}-count`}
              />
              <span className="hour-option-utc">{option.utc} UTC</span>
              {local && <span className="hour-option-local">{local} local</span>}
              {checked && <span className="hour-option-rank" aria-label={`choice ${value.indexOf(option.value) + 1}`}>{value.indexOf(option.value) + 1}</span>}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

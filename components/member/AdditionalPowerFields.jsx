'use client';

import { useT } from '../i18n/LanguageProvider';
import { checkPowerNumber, displayPowerNumber } from '../../lib/powerProfiles.mjs';

const FIELDS = [
  { key: 'pet_power', labelKey: 'profile.pet.label' },
  { key: 'masters_power', labelKey: 'profile.masters.label' },
];

/**
 * Pet Power and Masters Power: plain numbers (0 to 100,000,000, commas allowed, optional), the same boxes on the
 * Power Profile and the Flamedragon Tyrant form. The owner keeps the values; `onChange(key, value)` receives each
 * keystroke and, on leaving a valid box, the value with thousands separators (only when that changes it).
 * `errors` is the owner's [{ key, message }] list; boxes get the id `${idPrefix}-${key}` so an error summary can focus them.
 */
export default function AdditionalPowerFields({ values, onChange, errors = [], idPrefix = 'pp', tourAnchor }) {
  const t = useT();
  const formatOnBlur = (key) => {
    const checked = checkPowerNumber(key, values[key]);
    if (!checked.ok || checked.empty) return;
    const shown = displayPowerNumber(checked.digits);
    if (shown !== values[key]) onChange(key, shown);
  };
  return (
    <div className="member-identity" data-tour={tourAnchor}>
      {FIELDS.map(({ key, labelKey }) => {
        const id = `${idPrefix}-${key}`;
        const error = errors.find((e) => e.key === key);
        return (
          <div className="member-identity-field" key={key}>
            <label>
              <span className="member-identity-label">{t(labelKey)}</span>
              <input
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                maxLength={11}
                placeholder={t('profile.number.placeholder')}
                value={values[key] || ''}
                onChange={(e) => onChange(key, e.target.value)}
                onBlur={() => formatOnBlur(key)}
                aria-invalid={error ? 'true' : undefined}
                aria-describedby={[`${id}-hint`, error ? `${id}-error` : ''].filter(Boolean).join(' ')}
              />
            </label>
            <p className="member-identity-hint" id={`${id}-hint`}>{t('profile.number.hint')}</p>
            {error ? <p id={`${id}-error`} className="field-error">{error.message}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

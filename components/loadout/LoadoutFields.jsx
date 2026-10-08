import { CHARM_LEVEL_OPTIONS } from '../../lib/equipmentOptions.mjs';
import { QUALITIES } from '../../lib/scan/kinds/governorProfile/gameData.mjs';
import { editGearValue, parseGearValue, starsFor, starsLabel, tierLabel, tiersFor } from '../../lib/loadout.mjs';

// The four controls used by BOTH the table row and the board popovers, so invalid combinations are
// clamped identically (editGearValue) and the options never drift apart.
// Props: piece, value (stored string), onChange(newStoredValue), id, label (aria-label, optional).

export function QualitySelect({ piece, value, onChange, id, label, ...rest }) {
  const parsed = parseGearValue(value);
  const unknown = Boolean(String(value || '').trim()) && !parsed;
  return (
    <select id={id} aria-label={label} value={unknown ? '__saved' : parsed?.quality || ''} onChange={(e) => onChange(editGearValue(value, 'quality', e.target.value))} {...rest}>
      <option value="">No gear</option>
      {unknown ? <option value="__saved" disabled>{`Saved: ${value}`}</option> : null}
      {QUALITIES.map((q) => <option key={q.id} value={q.id}>{q.name}</option>)}
    </select>
  );
}

export function TierSelect({ piece, value, onChange, id, label, ...rest }) {
  const parsed = parseGearValue(value);
  return (
    <select id={id} aria-label={label} value={parsed ? String(parsed.tier) : ''} disabled={!parsed} onChange={(e) => onChange(editGearValue(value, 'tier', e.target.value))} {...rest}>
      {!parsed ? <option value="">-</option> : null}
      {parsed ? tiersFor(parsed.quality).map((t) => <option key={t} value={t}>{tierLabel(t)}</option>) : null}
    </select>
  );
}

export function StarsSelect({ piece, value, onChange, id, label, ...rest }) {
  const parsed = parseGearValue(value);
  return (
    <select id={id} aria-label={label} value={parsed ? String(parsed.stars) : ''} disabled={!parsed} onChange={(e) => onChange(editGearValue(value, 'stars', e.target.value))} {...rest}>
      {!parsed ? <option value="">-</option> : null}
      {parsed ? starsFor(parsed.quality, parsed.tier).map((s) => <option key={s} value={s}>{starsLabel(s)}</option>) : null}
    </select>
  );
}

export function CharmLevelSelect({ value, onChange, id, label, ...rest }) {
  return (
    <select id={id} aria-label={label} value={value || ''} onChange={(e) => onChange(e.target.value)} {...rest}>
      <option value="">Not set</option>
      {CHARM_LEVEL_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

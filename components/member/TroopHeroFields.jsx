'use client';

import { HEROES, PROFILE_UNIT_FIELDS, TROOP_TGS, TROOP_TIERS } from '../../lib/playerCombatOptions.mjs';
import { heroSlug } from '../../lib/powerProfileWizard.mjs';

// Troop level (tier + TG per troop type) and hero roster pickers. Used by the KvK Availability form,
// where these are answered once per KvK cycle. Controlled: the parent owns `values` + `heroes`.

export function TroopLevelFields({ values, onChange, disabled = false }) {
  return (
    <div className="unit-card-grid">
      {PROFILE_UNIT_FIELDS.map((unit) => (
        <div key={unit.key} className={`unit-card ${unit.key}`}>
          <h4>{unit.label}</h4>
          <div className="row">
            <label>
              Tier
              <select value={values[unit.tier] || ''} disabled={disabled} onChange={(e) => onChange(unit.tier, e.target.value)}>
                <option value="">Tier</option>
                {TROOP_TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
              </select>
            </label>
            <label>
              TG
              <select value={values[unit.tg] || ''} disabled={disabled} onChange={(e) => onChange(unit.tg, e.target.value)}>
                <option value="">TG</option>
                {TROOP_TGS.map((tg) => <option key={tg} value={tg}>{tg}</option>)}
              </select>
            </label>
          </div>
        </div>
      ))}
    </div>
  );
}

export function HeroRosterPicker({ heroes, onToggle, disabled = false }) {
  return (
    <div className="hero-chip-grid">
      {HEROES.map((hero) => (
        <label key={hero} className={heroes.includes(hero) ? 'hero-chip selected' : 'hero-chip'}>
          <input type="checkbox" checked={heroes.includes(hero)} disabled={disabled} onChange={() => onToggle(hero)} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            className="hero-chip-portrait"
            src={`/heroes/${heroSlug(hero)}.webp`}
            alt=""
            ref={(el) => {
              if (!el) return;
              const markLoaded = () => {
                el.classList.add('loaded');
                el.closest('.hero-chip')?.classList.add('has-portrait');
              };
              // A cached image can finish loading before this ref attaches, so check .complete first.
              if (el.complete && el.naturalWidth > 0) markLoaded();
              else el.addEventListener('load', markLoaded, { once: true });
            }}
            onError={(event) => { event.currentTarget.style.display = 'none'; }}
          />
          <span>{hero}</span>
        </label>
      ))}
    </div>
  );
}

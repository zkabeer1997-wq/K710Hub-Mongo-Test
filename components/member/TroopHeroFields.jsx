'use client';

import { useEffect, useState } from 'react';
import { HEROES, PROFILE_UNIT_FIELDS, TROOP_TGS, TROOP_TIERS } from '../../lib/playerCombatOptions.mjs';
import { heroKey, staticImageUrl } from '../../lib/heroCatalog.mjs';
import './easy-view-fixes.css';
import './hero-picker.css';
import './troop-required.css';

// Troop level (tier + TG per troop type) and hero roster pickers. Used by the KvK Availability form,
// where these are answered once per KvK cycle. Controlled: the parent owns `values` + `heroes`.

/** DOM id of a troop select, so a form can move focus to the first invalid one. */
export const troopFieldId = (key) => `troop-${key.replace(/_/g, '-')}`;

// Tier and TG are REQUIRED for every troop type (heroes are not). `errors` is { [fieldKey]: message }
// from troopFieldErrors(); an invalid select is flagged with aria-invalid + aria-describedby pointing at
// its inline message, which reads "Error: ..." so it never relies on colour alone.
export function TroopLevelFields({ values, onChange, disabled = false, errors = {} }) {
  const select = (key, noun, options) => {
    const id = troopFieldId(key);
    const error = errors[key];
    return (
      <div className="troop-field">
        <label htmlFor={id}>
          {noun} <span className="troop-required-mark">(required)</span>
        </label>
        <select
          id={id}
          value={values[key] || ''}
          disabled={disabled}
          aria-required="true"
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          onChange={(e) => onChange(key, e.target.value)}
        >
          <option value="">Choose</option>
          {options.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
        {error ? <p id={`${id}-error`} className="field-error">{error}</p> : null}
      </div>
    );
  };
  return (
    <div className="unit-card-grid">
      {PROFILE_UNIT_FIELDS.map((unit) => (
        <div key={unit.key} className={`unit-card ${unit.key}`}>
          <h4>{unit.label}</h4>
          <div className="row">
            {select(unit.tier, 'Tier', TROOP_TIERS)}
            {select(unit.tg, 'TG', TROOP_TGS)}
          </div>
        </div>
      ))}
    </div>
  );
}

// Built-in list, used only when the catalog could not be loaded at all.
export const DEFAULT_HERO_CATALOG = HEROES.map((name) => ({ key: heroKey(name), name, image_url: null, default_url: staticImageUrl(heroKey(name)) }));

/** The heroes to offer: the server-rendered `initial` list, else the tiny public GET /api/heroes, else the defaults. */
export function useHeroCatalog(initial) {
  const [heroes, setHeroes] = useState(initial || null);
  useEffect(() => {
    if (initial) return undefined;
    let cancelled = false;
    fetch('/api/heroes').then((r) => (r.ok ? r.json() : null))
      .then((body) => { if (!cancelled) setHeroes(Array.isArray(body?.heroes) ? body.heroes : DEFAULT_HERO_CATALOG); })
      .catch(() => { if (!cancelled) setHeroes(DEFAULT_HERO_CATALOG); });
    return () => { cancelled = true; };
  }, [initial]);
  return heroes;
}

// Portrait: the Drive image (same-origin proxy), else the static default, else an initial-letter placeholder.
function HeroPortrait({ hero }) {
  const sources = [hero.image_url, hero.default_url].filter(Boolean);
  const [failed, setFailed] = useState(0);
  const src = sources[failed];
  return (
    <span className="hero-portrait" aria-hidden={src ? undefined : 'true'}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt={hero.name} width="88" height="88" loading="lazy" decoding="async" onError={() => setFailed((n) => n + 1)} />
      ) : (
        <span className="hero-portrait-letter">{hero.name.slice(0, 1).toUpperCase()}</span>
      )}
    </span>
  );
}

export function HeroRosterPicker({ heroes, onToggle, disabled = false, catalog }) {
  const list = useHeroCatalog(catalog);
  if (!list) return <div className="hero-chip-grid" aria-busy="true" />;
  if (!list.length) return <p className="hero-empty">No heroes are available to choose right now.</p>;
  return (
    <div className="hero-chip-grid">
      {list.map((hero) => (
        <label key={hero.key} className={heroes.includes(hero.name) ? 'hero-chip hero-card selected' : 'hero-chip hero-card'}>
          <input type="checkbox" checked={heroes.includes(hero.name)} disabled={disabled} onChange={() => onToggle(hero.name)} />
          <HeroPortrait key={`${hero.key}:${hero.image_url || ''}`} hero={hero} />
          <span className="hero-name">{hero.name}</span>
        </label>
      ))}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { HEROES, PROFILE_UNIT_FIELDS, TROOP_TGS, TROOP_TIERS } from '../../lib/playerCombatOptions.mjs';
import { heroKey, staticImageUrl } from '../../lib/heroCatalog.mjs';
import './easy-view-fixes.css';
import './hero-picker.css';

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

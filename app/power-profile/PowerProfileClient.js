'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import GovernorGearOcr from '../../components/GovernorGearOcr';
import GiftCodeRewards from '../../components/GiftCodeRewards';
import {
CHARM_LEVEL_OPTIONS,
CHARM_SLOTS,
GOVERNOR_GEAR_OPTIONS,
GOVERNOR_GEAR_SLOTS,
HEROES,
POWER_PROFILE_FIELDS,
PROFILE_UNIT_FIELDS,
TROOP_TGS,
TROOP_TIERS,
blankCharmSelections,
blankGovernorGearSelections,
parseCharmSelections,
parseGovernorGearSelections,
serializeCharmSelections,
serializeGovernorGearSelections,
} from '../../lib/powerProfiles.mjs';

function PowerProfileForm({ initialMemberId = '', intro }) {
const [form, setForm] = useState({
name: '',
member_id: initialMemberId,
governor_gear: '',
charms: '',
hero_gear: '',
pet_power: '',
masters_power: '',
mystic_trial_score: '',
infantry_tier: '',
infantry_tg: '',
cavalry_tier: '',
cavalry_tg: '',
archer_tier: '',
archer_tg: '',
heroes: [],
});
const [governorGear, setGovernorGear] = useState(blankGovernorGearSelections());
const [charms, setCharms] = useState(blankCharmSelections());
const [onFile, setOnFile] = useState(null);
const [status, setStatus] = useState('');
const [isError, setIsError] = useState(false);
const [loading, setLoading] = useState(false);

function updateField(key, value) {
setForm((current) => ({ ...current, [key]: value }));
}

function updateGovernorGear(key, value) {
setGovernorGear((current) => {
const next = { ...current, [key]: value };
setForm((currentForm) => ({ ...currentForm, governor_gear: serializeGovernorGearSelections(next) }));
return next;
});
}

/** Apply OCR results for gear and/or charms in one pass. */
function applyPowerDataScan({ gear, charms: charmSelections }) {
if (gear && Object.keys(gear).length) {
setGovernorGear((current) => {
const next = { ...current, ...gear };
setForm((currentForm) => ({ ...currentForm, governor_gear: serializeGovernorGearSelections(next) }));
return next;
});
}
if (charmSelections && Object.keys(charmSelections).length) {
setCharms((current) => {
const next = { ...current, ...charmSelections };
setForm((currentForm) => ({ ...currentForm, charms: serializeCharmSelections(next) }));
return next;
});
}
}

function updateCharm(key, value) {
setCharms((current) => {
const next = { ...current, [key]: value };
setForm((currentForm) => ({ ...currentForm, charms: serializeCharmSelections(next) }));
return next;
});
}

function toggleHero(hero) {
setForm((current) => ({
...current,
heroes: current.heroes.includes(hero)
? current.heroes.filter((currentHero) => currentHero !== hero)
: [...current.heroes, hero],
}));
}

async function lookup(overrideMemberId) {
const memberId = (overrideMemberId !== undefined ? overrideMemberId : form.member_id).trim();
if (!memberId) return;
const response = await fetch(`/api/power-profile?member_id=${encodeURIComponent(memberId)}`);
const result = await response.json();
if (!response.ok) {
setOnFile(null);
return;
}
if (result.profile) {
const gearSelections = parseGovernorGearSelections(result.profile.governor_gear);
const gearSummary = serializeGovernorGearSelections(gearSelections);
const charmSelections = parseCharmSelections(result.profile.charms);
const charmSummary = serializeCharmSelections(charmSelections);
setGovernorGear(gearSelections);
setCharms(charmSelections);
setOnFile(result.profile);
setForm((current) => ({
...current,
name: current.name || result.profile.name || '',
governor_gear: gearSummary || result.profile.governor_gear || '',
charms: charmSummary || result.profile.charms || '',
hero_gear: result.profile.hero_gear || '',
pet_power: result.profile.pet_power || '',
masters_power: result.profile.masters_power || '',
mystic_trial_score: result.profile.mystic_trial_score || '',
infantry_tier: result.profile.infantry_tier || '',
infantry_tg: result.profile.infantry_tg || '',
cavalry_tier: result.profile.cavalry_tier || '',
cavalry_tg: result.profile.cavalry_tg || '',
archer_tier: result.profile.archer_tier || '',
archer_tg: result.profile.archer_tg || '',
heroes: Array.isArray(result.profile.heroes) ? result.profile.heroes : [],
}));
} else {
setOnFile(null);
}
}

useEffect(() => {
if (initialMemberId) {
lookup(initialMemberId);
}
// eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

async function handleSubmit(event) {
event.preventDefault();
setStatus('');
setIsError(false);
setLoading(true);
const response = await fetch('/api/power-profile', {
method: 'POST',
headers: { 'Content-Type': 'application/json' },
body: JSON.stringify(form),
});
const result = await response.json();
setLoading(false);
if (!response.ok) {
setIsError(true);
setStatus(result.error || 'Could not save Gear Tracking.');
return;
}
setOnFile(result.profile);
setStatus(result.status === 'created' ? 'Gear Tracking created.' : 'Gear Tracking updated.');
}

return (
<main className="armory">
<div className="armory-atmos" aria-hidden="true" />
<div className="armory-rack-l" aria-hidden="true" />
<div className="armory-rack-r" aria-hidden="true" />
<div className="armory-inner">
<header className="armory-head">
<span className="k-mark">Kingdom 710 member profile</span>
<h1 className="k-display armory-title k-engraved">Gear Tracking</h1>
<p className="k-narrative armory-lede">Keep your troop levels, heroes, Governor Gear, charms, and power information up to date.</p>
</header>
{intro}
<GiftCodeRewards />
<form className="public-form-card war-ledger-form" onSubmit={handleSubmit}>
<section className="identity-grid">
<label>Your name<input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Your in-game name" /></label>
<label>Member ID<input value={form.member_id} onChange={(e) => updateField('member_id', e.target.value)} onBlur={() => lookup()} placeholder="Your Member ID" /></label>
</section>
{onFile && (
<div className="on-file">
Player profile on file - Governor Gear: {onFile.governor_gear || '-'} / Charms: {onFile.charms || '-'} / Heroes: {onFile.heroes?.length ? onFile.heroes.join(', ') : '-'}
</div>
)}

<div className="ledger-block">
  <div className="ledger-block-head">
    <span className="ledger-block-kicker">Army Strength</span>
    <h3>Troop Levels</h3>
    <p>Choose the best tier and TG for each troop type.</p>
  </div>
  <div className="unit-card-grid">
    {PROFILE_UNIT_FIELDS.map((unit) => (
      <div key={unit.key} className={`unit-card ${unit.key}`}>
        <h4>{unit.label}</h4>
        <div className="row">
          <label>Tier<select value={form[unit.tier]} onChange={(event) => updateField(unit.tier, event.target.value)}><option value="">Tier</option>{TROOP_TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}</select></label>
          <label>TG<select value={form[unit.tg]} onChange={(event) => updateField(unit.tg, event.target.value)}><option value="">TG</option>{TROOP_TGS.map((tg) => <option key={tg} value={tg}>{tg}</option>)}</select></label>
        </div>
      </div>
    ))}
  </div>
</div>

<div className="ledger-block">
  <div className="ledger-block-head">
    <span className="ledger-block-kicker">Hero Roster</span>
    <h3>Heroes</h3>
    <p>Select the heroes available on your account.</p>
  </div>
  <div className="hero-chip-grid">
    {HEROES.map((hero) => (
      <label key={hero} className={form.heroes.includes(hero) ? 'hero-chip selected' : 'hero-chip'}>
        <input type="checkbox" checked={form.heroes.includes(hero)} onChange={() => toggleHero(hero)} />
        <span>{hero}</span>
      </label>
    ))}
  </div>
</div>

<div className="ledger-block">
  <div className="ledger-block-head">
    <span className="ledger-block-kicker">Power Data</span>
    <h3>Governor Gear &amp; Charms</h3>
    <p>Upload a screenshot to auto-fill gear pieces and charm levels, then verify the dropdowns.</p>
  </div>
  <GovernorGearOcr onApply={applyPowerDataScan} />
  <h4 className="power-subheader">Governor Gear</h4>
  <div className="ledger-gear-grid">
    {GOVERNOR_GEAR_SLOTS.map((slot) => (
      <label key={slot.key} className="ledger-select">
        <span>{slot.label}</span>
        <select
          value={governorGear[slot.key]}
          onChange={(event) => updateGovernorGear(slot.key, event.target.value)}
        >
          <option value="">Select gear</option>
          {GOVERNOR_GEAR_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    ))}
  </div>
  <h4 className="power-subheader">Charms</h4>
  <p className="hint" style={{ marginTop: 0 }}>Levels 1–22 (Kingshot Optimizer charm reference).</p>
  <div className="ledger-charm-grid">
    {CHARM_SLOTS.map((slot) => (
      <label key={slot.key} className="ledger-select">
        <span>{slot.label}</span>
        <select
          value={charms[slot.key]}
          onChange={(event) => updateCharm(slot.key, event.target.value)}
        >
          <option value="">Select level</option>
          {CHARM_LEVEL_OPTIONS.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
      </label>
    ))}
  </div>
</div>

<div className="ledger-block">
  <div className="ledger-block-head">
    <span className="ledger-block-kicker">Additional power</span>
    <h3>Hero, Pet &amp; Masters Power</h3>
    <p>Enter the values shown in your account.</p>
  </div>
  <div className="ledger-stats-grid">
    {POWER_PROFILE_FIELDS.map((field) => (
      <label key={field.key} className="ledger-select">
        <span>{field.label}</span>
        <input
          value={form[field.key]}
          onChange={(event) => updateField(field.key, event.target.value)}
          placeholder={field.label}
        />
      </label>
    ))}
  </div>
</div>

{status && <div className={isError ? 'status error' : 'status'}>{status}</div>}
<button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Gear Tracking'}</button>
</form>
</div>
</main>
);
}

function PowerProfilePageInner({ intro }) {
const searchParams = useSearchParams();
const memberId = searchParams.get('member_id') || '';
return <PowerProfileForm initialMemberId={memberId} intro={intro} />;
}

export default function PowerProfileClient({ intro }) {
return (
<Suspense fallback={null}>
<PowerProfilePageInner intro={intro} />
</Suspense>
);
}

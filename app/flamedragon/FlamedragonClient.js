'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import GovernorGearOcr from '../../components/GovernorGearOcr';
import {
  HEROES,
  TIERS,
  TGS,
  ALLIANCES,
  UNIT_FIELDS,
  AVAILABILITY_OPTIONS,
  VOICE_CHAT_OPTIONS,
  AUTO_HELP_OPTIONS,
  CHARM_SLOTS,
  CHARM_LEVEL_OPTIONS,
  GOVERNOR_GEAR_SLOTS,
  GOVERNOR_GEAR_OPTIONS,
  POWER_PROFILE_FIELDS,
  blankCharmSelections,
  blankGovernorGearSelections,
  parseCharmSelections,
  parseGovernorGearSelections,
  serializeCharmSelections,
  serializeGovernorGearSelections,
} from '../../lib/flamedragonForm.mjs';
import { useFormFieldMeta } from '../../lib/useFormFieldMeta';

function FlamedragonForm({ initialMemberId = '', intro }) {
  const { intro: fieldMetaIntro } = useFormFieldMeta('dragon');
  const [form, setForm] = useState({
    name: '',
    member_id: initialMemberId,
    current_alliance: '',
    infantry_tier: '',
    infantry_tg: '',
    cavalry_tier: '',
    cavalry_tg: '',
    archer_tier: '',
    archer_tg: '',
    charms: '',
    governor_gear: '',
    pet_power: '',
    masters_power: '',
    mystic_trial_score: '',
    availability: '',
    voice_chat: '',
    auto_help: '',
    pin: '',
  });
  const [heroes, setHeroes] = useState([]);
  const [charms, setCharms] = useState(blankCharmSelections());
  const [governorGear, setGovernorGear] = useState(blankGovernorGearSelections());
  const [onFile, setOnFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

  const tierValues = { infantry: form.infantry_tier, cavalry: form.cavalry_tier, archer: form.archer_tier };
  const tgValues = { infantry: form.infantry_tg, cavalry: form.cavalry_tg, archer: form.archer_tg };

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateCharm(key, value) {
    setCharms((current) => {
      const next = { ...current, [key]: value };
      setForm((currentForm) => ({ ...currentForm, charms: serializeCharmSelections(next) }));
      return next;
    });
  }

  function updateGovernorGear(key, value) {
    setGovernorGear((current) => {
      const next = { ...current, [key]: value };
      setForm((currentForm) => ({ ...currentForm, governor_gear: serializeGovernorGearSelections(next) }));
      return next;
    });
  }

  function applyGovernorGearScan(selections) {
    setGovernorGear((current) => {
      const next = { ...current, ...selections };
      setForm((currentForm) => ({ ...currentForm, governor_gear: serializeGovernorGearSelections(next) }));
      return next;
    });
  }

  function toggleHero(hero) {
    setHeroes((prev) => (prev.includes(hero) ? prev.filter((h) => h !== hero) : [...prev, hero]));
  }

  async function lookup(overrideMemberId) {
    const memberId = (overrideMemberId !== undefined ? overrideMemberId : form.member_id).trim();
    if (!memberId) return;
    const response = await fetch(`/api/flamedragon?member_id=${encodeURIComponent(memberId)}`);
    const result = await response.json();
    if (!response.ok) {
      setOnFile(null);
      return;
    }
    if (result.record) {
      const r = result.record;
      const charmSelections = parseCharmSelections(r.charms);
      const gearSelections = parseGovernorGearSelections(r.governor_gear);
      setCharms(charmSelections);
      setGovernorGear(gearSelections);
      setHeroes(Array.isArray(r.heroes) ? r.heroes : []);
      setOnFile(r);
      setForm((current) => ({
        ...current,
        name: current.name || r.name || '',
        current_alliance: r.current_alliance || '',
        infantry_tier: r.infantry_tier || '',
        infantry_tg: r.infantry_tg || '',
        cavalry_tier: r.cavalry_tier || '',
        cavalry_tg: r.cavalry_tg || '',
        archer_tier: r.archer_tier || '',
        archer_tg: r.archer_tg || '',
        charms: serializeCharmSelections(charmSelections) || r.charms || '',
        governor_gear: serializeGovernorGearSelections(gearSelections) || r.governor_gear || '',
        pet_power: r.pet_power || '',
        masters_power: r.masters_power || '',
        mystic_trial_score: r.mystic_trial_score || '',
        availability: r.availability || '',
        voice_chat: r.voice_chat || '',
        auto_help: r.auto_help || '',
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
    if (!form.name || !form.member_id || !form.pin) {
      setIsError(true);
      setStatus('Please fill in your name, member ID, and PIN.');
      return;
    }
    setLoading(true);
    const response = await fetch('/api/flamedragon', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, heroes }),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      setIsError(true);
      setStatus(result.error || 'Could not save your Flamedragon form.');
      return;
    }
    setIsError(false);
    setOnFile(result.record);
    setStatus(result.status === 'created' ? 'Submitted! Your entry has been created.' : 'Updated! Your entry has been saved.');
  }
  return (
    <main className="page public-page">
      <div className="public-shell single-form power-shell">
        {intro}
        <form className="public-form-card" onSubmit={handleSubmit}>
          <div className="form-section-header">
            <span>{fieldMetaIntro.kicker}</span>
            <h1>{fieldMetaIntro.heading}</h1>
          </div>

          <section className="identity-grid">
            <label>In Game Name<input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Your in-game name" /></label>
            <label>Player ID<input value={form.member_id} onChange={(e) => updateField('member_id', e.target.value)} onBlur={() => lookup()} placeholder="Your Player ID" /></label>
          </section>

          <section className="troop-section public-section">
            <div className="section-title-row"><span>Alliance</span><h3>Current Alliance</h3><p>Select the alliance you are currently in.</p></div>
            <label>Current Alliance<select value={form.current_alliance} onChange={(e) => updateField('current_alliance', e.target.value)}><option value="">Select alliance</option>{ALLIANCES.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
          </section>

          {onFile && (
            <div className="on-file">
              On file - Infantry: {onFile.infantry_tier || '-'}-{onFile.infantry_tg || '-'} / Cavalry: {onFile.cavalry_tier || '-'}-{onFile.cavalry_tg || '-'} / Archer: {onFile.archer_tier || '-'}-{onFile.archer_tg || '-'}
              {onFile.heroes && onFile.heroes.length > 0 && <> / Heroes: {onFile.heroes.join(', ')}</>}
              {onFile.availability && <> / Availability: {onFile.availability}</>}
            </div>
          )}

          <section className="troop-section public-section">
            <div className="section-title-row"><span>Troops</span><h3>Troop Levels</h3><p>Choose the best tier and TG for each troop type.</p></div>
            <div className="unit-card-grid">
              {UNIT_FIELDS.map((unit) => (
                <div key={unit.key} className={`unit-card ${unit.key}`}>
                  <h4>{unit.label}</h4>
                  <div className="row">
                    <label>Tier<select value={tierValues[unit.key]} onChange={(e) => updateField(unit.tier, e.target.value)}><option value="">Tier</option>{TIERS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                    <label>TG<select value={tgValues[unit.key]} onChange={(e) => updateField(unit.tg, e.target.value)}><option value="">TG</option>{TGS.map((t) => <option key={t} value={t}>{t}</option>)}</select></label>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="troop-section public-section">
            <div className="section-title-row"><span>Heroes</span><h3>Available Heroes</h3><p>Select the heroes you can field for this battle.</p></div>
            <div className="hero-chip-grid">
              {HEROES.map((hero) => (
                <label key={hero} className={heroes.includes(hero) ? 'hero-chip selected' : 'hero-chip'}>
                  <input type="checkbox" checked={heroes.includes(hero)} onChange={() => toggleHero(hero)} />
                  <span>{hero}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="troop-section public-section">
            <div className="section-title-row"><span>Power data</span><h3>Charms, Gear and Power</h3><p>Set your charm levels, governor gear, and power stats.</p></div>
            <div className="power-field-grid">
              <h4 className="power-subheader">Charm Levels</h4>
              <div className="charm-grid">
                {CHARM_SLOTS.map((slot) => (
                  <label key={slot.key}>
                    {slot.label}
                    <select value={charms[slot.key]} onChange={(event) => updateCharm(slot.key, event.target.value)}>
                      <option value="">Select level</option>
                      {CHARM_LEVEL_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <h4 className="power-subheader">Governor Gear</h4>
              <GovernorGearOcr onApply={applyGovernorGearScan} />
              <div className="governor-gear-grid">
                {GOVERNOR_GEAR_SLOTS.map((slot) => (
                  <label key={slot.key}>
                    {slot.label}
                    <select value={governorGear[slot.key]} onChange={(event) => updateGovernorGear(slot.key, event.target.value)}>
                      <option value="">Select gear</option>
                      {GOVERNOR_GEAR_OPTIONS.map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              <h4 className="power-subheader">Power</h4>
              {POWER_PROFILE_FIELDS.filter(field => field.key !== 'mystic_trial_score').map((field) => (
                <label key={field.key}>
                  {field.label}
                  <input value={form[field.key]} onChange={(event) => updateField(field.key, event.target.value)} placeholder={field.label} />
                </label>
              ))}
              <label>
                Mystic Trial Total Score
                <input value={form.mystic_trial_score} onChange={(event) => updateField('mystic_trial_score', event.target.value)} placeholder="e.g. 1500" />
              </label>
            </div>
          </section>
          <section className="troop-section public-section">
            <div className="section-title-row"><span>Timing</span><h3>Battle Availability</h3><p>Select the window rally planners should count on.</p></div>
            <div className="availability-grid">
              {AVAILABILITY_OPTIONS.map((option) => (
                <label key={option} className={form.availability === option ? 'availability-choice selected' : 'availability-choice'}>
                  <input type="radio" name="availability" checked={form.availability === option} onChange={() => updateField('availability', option)} />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </section>

          <section className="troop-section public-section">
            <div className="section-title-row"><span>Coordination</span><h3>Additional Questions</h3><p>Help leads plan voice coordination and support.</p></div>
            <div className="power-field-grid">
              <label>
                Can you do Voice Chat during the battle?
                <select value={form.voice_chat} onChange={(event) => updateField('voice_chat', event.target.value)}>
                  <option value="">Select an option</option>
                  {VOICE_CHAT_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
              <label>
                Do you have Auto Help?
                <select value={form.auto_help} onChange={(event) => updateField('auto_help', event.target.value)}>
                  <option value="">Select an option</option>
                  {AUTO_HELP_OPTIONS.map((option) => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </label>
            </div>
          </section>

          <section className="pin-panel">
            <label>Enter your PIN<input type="password" value={form.pin} onChange={(e) => updateField('pin', e.target.value)} placeholder="Your PIN" /></label>
            <p className="hint">First submission sets your PIN. Enter the same PIN next time to update your entry.</p>
          </section>

          {status && <div className={isError ? 'status error' : 'status'}>{status}</div>}
          <button type="submit" disabled={loading}>{loading ? 'Submitting...' : 'Submit Flamedragon form'}</button>
        </form>
      </div>
    </main>
  );
}

function FlamedragonPageInner({ intro }) {
  const searchParams = useSearchParams();
  const memberId = searchParams.get('member_id') || '';
  return <FlamedragonForm initialMemberId={memberId} intro={intro} />;
}

export default function FlamedragonClient({ intro }) {
  return (
    <Suspense fallback={null}>
      <FlamedragonPageInner intro={intro} />
    </Suspense>
  );
}

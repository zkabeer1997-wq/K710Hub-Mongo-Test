'use client';

import { useEffect, useState } from 'react';
import IdentityFields from '../../components/member/IdentityFields';
import TourLauncher from '../../components/tour/TourLauncher';
import { HeroRosterPicker, TroopLevelFields, troopFieldId } from '../../components/member/TroopHeroFields';
import { TROOP_FIELD_KEYS, troopFieldErrors } from '../../lib/kvkAvailability.mjs';
import {
  ALLIANCES,
  currentHeroesOnly,
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
import { refreshMemberFormStatus } from '../../lib/useMemberFormStatus';

function FlamedragonForm({ identity, intro, heroCatalog }) {
  const { intro: fieldMetaIntro } = useFormFieldMeta('dragon');
  const [form, setForm] = useState({
    name: identity?.name || '',
    member_id: identity?.memberId || '',
    current_alliance: identity?.alliance || '',
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
  const [troopErrors, setTroopErrors] = useState({});
  const [heroes, setHeroes] = useState([]);
  const [charms, setCharms] = useState(blankCharmSelections());
  const [governorGear, setGovernorGear] = useState(blankGovernorGearSelections());
  const [onFile, setOnFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);

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

  function toggleHero(hero) {
    setHeroes((prev) => (prev.includes(hero) ? prev.filter((h) => h !== hero) : [...prev, hero]));
  }

  async function lookup() {
    const response = await fetch('/api/flamedragon');
    const result = await response.json();
    if (!response.ok) {
      setOnFile(null);
      return;
    }
    // This cycle's saved form, otherwise last cycle's answers as a starting point (not saved until Submit).
    let r = result.record || result.previous || result.fallback;
    // Newer troops/heroes saved on the KvK form (kept on the profile) replace the older cycle answer's.
    if (!result.record && result.previous && result.fallback?.prefer_troops) {
      const f = result.fallback;
      r = { ...result.previous, heroes: f.heroes?.length ? f.heroes : result.previous.heroes, ...Object.fromEntries(TROOP_FIELD_KEYS.map((key) => [key, f[key] || result.previous[key]])) };
    }
    if (r) {
      const charmSelections = parseCharmSelections(r.charms);
      const gearSelections = parseGovernorGearSelections(r.governor_gear);
      setCharms(charmSelections);
      setGovernorGear(gearSelections);
      // The server already drops heroes that are switched off; this also covers a catalog passed as props.
      setHeroes(currentHeroesOnly(r.heroes, heroCatalog ? heroCatalog.map((h) => h.name) : undefined));
      setOnFile(result.record || null);
      setForm((current) => ({
        ...current,
        name: r.name || current.name || result.identity?.name || '',
        current_alliance: r.current_alliance || current.current_alliance || '',
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
    lookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('');
    setIsError(false);
    if (!form.name) {
      setIsError(true);
      setStatus('Please type your name.');
      return;
    }
    // Troop tier + TG are required for every troop type: flag each blank select and focus the first.
    const errors = troopFieldErrors(form);
    setTroopErrors(errors);
    const firstInvalid = TROOP_FIELD_KEYS.find((key) => errors[key]);
    if (firstInvalid) {
      setIsError(true);
      setStatus('Choose a tier and TG for Infantry, Cavalry and Archer before submitting. See the messages marked Error.');
      document.getElementById(troopFieldId(firstInvalid))?.focus();
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
    refreshMemberFormStatus();
    setStatus(result.status === 'created' ? 'Submitted! Your entry has been created.' : 'Updated! Your entry has been saved.');
  }
  return (
    <main className="page public-page">
      <div className="member-form-col">
        {intro}
        <div className="public-shell single-form">
        <section className="public-intro" data-tour="dragon-intro">
          <span className="public-kicker">{fieldMetaIntro.kicker}</span>
          <h1>{fieldMetaIntro.heading}</h1>
          {fieldMetaIntro.description ? <p>{fieldMetaIntro.description}</p> : null}
          <TourLauncher id="dragon" />
        </section>
        <form className="public-form-card" onSubmit={handleSubmit} noValidate>

          <IdentityFields memberId={form.member_id} name={form.name} onNameChange={(v) => updateField('name', v)} label="In Game Name" known={Boolean(identity?.name)} />

          <section className="troop-section public-section" data-tour="dragon-alliance">
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

          <section className="troop-section public-section" data-tour="dragon-troops">
            <div className="section-title-row"><span>Army</span><h3>Troop levels</h3><p>Choose the best tier and TG for each troop type, as they stand for this battle.</p></div>
            <p className="troop-required-note">Tier and TG are required for Infantry, Cavalry and Archer. They are remembered on your profile and filled in for you next time.</p>
            <TroopLevelFields
              values={form}
              errors={troopErrors}
              onChange={(key, value) => {
                updateField(key, value);
                setTroopErrors((current) => {
                  if (!current[key]) return current;
                  const rest = { ...current };
                  delete rest[key];
                  return rest;
                });
              }}
            />
          </section>

          <section className="troop-section public-section" data-tour="dragon-heroes">
            <div className="section-title-row"><span>Heroes</span><h3>Hero roster</h3><p>Select the heroes you have available for this battle.</p></div>
            <HeroRosterPicker catalog={heroCatalog} heroes={heroes} onToggle={toggleHero} />
          </section>

          <section className="troop-section public-section">
            <div className="section-title-row" data-tour="dragon-power"><span>Power data</span><h3>Charms, Gear and Power</h3><p>Set your charm levels, governor gear, and power stats.</p></div>
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
          <section className="troop-section public-section" data-tour="dragon-timing">
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

          {status && <div className={isError ? 'status error' : 'status'} role={isError ? 'alert' : 'status'}>{status}</div>}
          <button type="submit" disabled={loading} data-tour="dragon-submit">{loading ? 'Submitting...' : 'Submit Flamedragon form'}</button>
        </form>
        </div>
      </div>
    </main>
  );
}

export default function FlamedragonClient({ intro, heroCatalog, identity }) {
  return <FlamedragonForm identity={identity} intro={intro} heroCatalog={heroCatalog} />;
}

'use client';

import { useEffect, useState } from 'react';
import IdentityFields from '../../components/member/IdentityFields';
import TourLauncher from '../../components/tour/TourLauncher';
import LoadoutEditor from '../../components/loadout/LoadoutEditor';
import AdditionalPowerFields from '../../components/member/AdditionalPowerFields';
import MysticTrialReadout from '../../components/member/MysticTrialReadout';
import FormErrorSummary from '../../components/FormErrorSummary';
import { useT } from '../../components/i18n/LanguageProvider';
import { HeroRosterPicker, TroopLevelFields, troopFieldId } from '../../components/member/TroopHeroFields';
import { TROOP_FIELD_KEYS, troopFieldErrors } from '../../lib/kvkAvailability.mjs';
import {
  currentHeroesOnly,
  AVAILABILITY_OPTIONS,
  VOICE_CHAT_OPTIONS,
  AUTO_HELP_OPTIONS,
  blankCharmSelections,
  blankGovernorGearSelections,
  parseCharmSelections,
  parseGovernorGearSelections,
  serializeCharmSelections,
  serializeGovernorGearSelections,
} from '../../lib/flamedragonForm.mjs';
import { POWER_NUMBER_KEYS, displayPowerNumber, powerNumberErrors } from '../../lib/powerProfiles.mjs';
import { useAllianceTags } from '../../lib/useAllianceTags';
import { withCurrentTag } from '../../lib/allianceTags.mjs';
import { useFormFieldMeta } from '../../lib/useFormFieldMeta';
import { refreshMemberFormStatus } from '../../lib/useMemberFormStatus';

function FlamedragonForm({ identity, intro, heroCatalog }) {
  const ALLIANCES = useAllianceTags();
  const t = useT();
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
    availability: '',
    voice_chat: '',
    auto_help: '',
    pin: '',
  });
  const [troopErrors, setTroopErrors] = useState({});
  const [heroes, setHeroes] = useState([]);
  const [charms, setCharms] = useState(blankCharmSelections());
  const [governorGear, setGovernorGear] = useState(blankGovernorGearSelections());
  // Mystic Trial is read-only: { value, source: 'login' | 'saved' | 'none' } from GET /api/flamedragon.
  const [mystic, setMystic] = useState({ value: '', source: 'none' });
  const [powerFromProfile, setPowerFromProfile] = useState(false);
  const [scanSaveMsg, setScanSaveMsg] = useState('');
  const [powerErrors, setPowerErrors] = useState([]);
  const [errorSignal, setErrorSignal] = useState(0);
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

  function updatePower(key, value) {
    updateField(key, value);
    setPowerErrors((current) => (current.some((e) => e.key === key) ? current.filter((e) => e.key !== key) : current));
  }

  function clearLoadout() {
    setGovernorGear(blankGovernorGearSelections());
    setCharms(blankCharmSelections());
    setForm((current) => ({ ...current, governor_gear: '', charms: '' }));
  }

  // "Use these values" on the scan review: the reviewed gear and charms go straight onto the member's Power
  // Profile too (the same save the Power Profile uses, under this form's open/closed switch), and the
  // corrections are kept for improving the reader. The screenshot itself never leaves the browser.
  async function saveScanned({ corrections = [], gear = {}, charms: nextCharms = {} } = {}) {
    const gearStr = serializeGovernorGearSelections({ ...governorGear, ...gear });
    const charmStr = serializeCharmSelections({ ...charms, ...nextCharms });
    setScanSaveMsg(t('dragon.power.scanSaving'));
    try {
      const response = await fetch('/api/power-profile/loadout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: 'dragon', governor_gear: gearStr, charms: charmStr, corrections }),
      });
      const result = await response.json().catch(() => ({}));
      setScanSaveMsg(response.ok ? t('dragon.power.scanSaved') : (result.error || t('dragon.power.scanFailed')));
    } catch {
      setScanSaveMsg(t('dragon.power.scanFailed'));
    }
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
        pet_power: displayPowerNumber(r.pet_power || ''),
        masters_power: displayPowerNumber(r.masters_power || ''),
        availability: r.availability || '',
        voice_chat: r.voice_chat || '',
        auto_help: r.auto_help || '',
      }));
    } else {
      setOnFile(null);
    }
    if (result.mystic) setMystic(result.mystic);
    // Gear, charms, Pet and Masters Power are shared with the Power Profile: start from whichever was saved last.
    const p = result.power;
    if (p && (p.governor_gear || p.charms || p.pet_power || p.masters_power)) {
      const gearSelections = parseGovernorGearSelections(p.governor_gear);
      const charmSelections = parseCharmSelections(p.charms);
      setGovernorGear(gearSelections);
      setCharms(charmSelections);
      setPowerFromProfile(p.from === 'profile');
      setForm((current) => ({
        ...current,
        governor_gear: serializeGovernorGearSelections(gearSelections),
        charms: serializeCharmSelections(charmSelections),
        pet_power: displayPowerNumber(p.pet_power),
        masters_power: displayPowerNumber(p.masters_power),
      }));
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
    // Pet / Masters Power follow the Power Profile rule; flag a bad number on its own box and focus it.
    const numberProblems = powerNumberErrors(form).map(({ key, message }) => ({ id: `fd-${key}`, key, message }));
    setPowerErrors(numberProblems);
    if (numberProblems.length) {
      setErrorSignal((n) => n + 1); // the error summary takes focus; each entry links to its box
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
      if (POWER_NUMBER_KEYS.includes(result.field)) {
        // The server disagreed with one of the number boxes: show it on that box, like the local check.
        setPowerErrors([{ id: `fd-${result.field}`, key: result.field, message: result.error }]);
        setErrorSignal((n) => n + 1);
        return;
      }
      setIsError(true);
      setStatus(result.error || 'Could not save your Flamedragon form.');
      return;
    }
    setIsError(false);
    setPowerErrors([]);
    setPowerFromProfile(false);
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
            <label>Current Alliance<select value={form.current_alliance} onChange={(e) => updateField('current_alliance', e.target.value)}><option value="">Select alliance</option>{withCurrentTag(ALLIANCES, form.current_alliance).map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
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
            <div className="section-title-row" data-tour="dragon-power"><span>Power data</span><h3>Charms, Gear and Power</h3><p>Scan a screenshot or tap the board to set your governor gear and charms, then add your Pet and Masters Power.</p></div>
            <p className="power-shared-note">{t('dragon.power.shared')}</p>
            {powerFromProfile && <p className="power-shared-note power-shared-note-fresh" role="status">{t('dragon.power.fromProfile')}</p>}
            {scanSaveMsg && <p className="save-status-line" role="status" aria-live="polite">{scanSaveMsg}</p>}
            <LoadoutEditor
              gear={governorGear}
              charms={charms}
              onGearChange={updateGovernorGear}
              onCharmChange={updateCharm}
              onClear={clearLoadout}
              onScanApplied={saveScanned}
            />
            <AdditionalPowerFields idPrefix="fd" values={form} onChange={updatePower} errors={powerErrors} />
            <div className="member-identity"><MysticTrialReadout mystic={mystic} /></div>
            <FormErrorSummary errors={powerErrors} focusSignal={errorSignal} id="form-error-summary-power" />
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

'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
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
import { useFormFieldMeta } from '../../lib/useFormFieldMeta';
import { heroSlug, saveStatusLabel } from '../../lib/powerProfileWizard.mjs';

// Wizard steps. Presentational grouping only - every field below still
// reads/writes the same lifted `form` / `governorGear` / `charms` state as
// before, so moving between steps can never drop an input.
const STEPS = [
  { id: 'power', kicker: 'Governor Power', label: 'Governor Power' },
  { id: 'troops', kicker: 'Army Strength', label: 'Troop Levels' },
  { id: 'heroes', kicker: 'Hero Roster', label: 'Hero Roster' },
  { id: 'gear', kicker: 'Power Data', label: 'Gear & Charms' },
  { id: 'review', kicker: 'Final Check', label: 'Review & Submit' },
];

// CHARM_SLOTS is [...archer(6), ...infantry(6), ...cavalry(6)] - see
// lib/powerProfiles.mjs. Group them by unit for step 4's sub-sections
// without touching the slot list, keys, or serialize/parse order.
const CHARM_GROUPS = [
  { id: 'archer', label: 'Archer' },
  { id: 'infantry', label: 'Infantry' },
  { id: 'cavalry', label: 'Cavalry' },
].map((group) => ({
  ...group,
  slots: CHARM_SLOTS.filter((slot) => slot.key.startsWith(`${group.id}_`)),
}));

function PowerProfileForm({ initialMemberId = '', intro }) {
  const { intro: formIntro } = useFormFieldMeta('lead');
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

  // Wizard-only UI state. Never read by handleSubmit and never sent to the
  // API - purely for the stepper/progress bar and the save-status line.
  const [step, setStep] = useState(0);
  const [dirty, setDirty] = useState(false);
  const headingRefs = useRef([]);
  const skipFocusRef = useRef(true);

  function goToStep(index) {
    const bounded = Math.max(0, Math.min(STEPS.length - 1, index));
    setStep(bounded);
  }

  useEffect(() => {
    if (skipFocusRef.current) {
      skipFocusRef.current = false;
      return;
    }
    headingRefs.current[step]?.focus();
  }, [step]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }

  function updateGovernorGear(key, value) {
    setGovernorGear((current) => {
      const next = { ...current, [key]: value };
      setForm((currentForm) => ({ ...currentForm, governor_gear: serializeGovernorGearSelections(next) }));
      return next;
    });
    setDirty(true);
  }

  /** Apply OCR results for gear and/or charms in one pass. */
  function applyPowerDataScan({ gear, charms: charmSelections }) {
    if (gear && Object.keys(gear).length) {
      setGovernorGear((current) => {
        const next = { ...current, ...gear };
        setForm((currentForm) => ({ ...currentForm, governor_gear: serializeGovernorGearSelections(next) }));
        return next;
      });
      setDirty(true);
    }
    if (charmSelections && Object.keys(charmSelections).length) {
      setCharms((current) => {
        const next = { ...current, ...charmSelections };
        setForm((currentForm) => ({ ...currentForm, charms: serializeCharmSelections(next) }));
        return next;
      });
      setDirty(true);
    }
  }

  function updateCharm(key, value) {
    setCharms((current) => {
      const next = { ...current, [key]: value };
      setForm((currentForm) => ({ ...currentForm, charms: serializeCharmSelections(next) }));
      return next;
    });
    setDirty(true);
  }

  function toggleHero(hero) {
    setForm((current) => ({
      ...current,
      heroes: current.heroes.includes(hero)
        ? current.heroes.filter((currentHero) => currentHero !== hero)
        : [...current.heroes, hero],
    }));
    setDirty(true);
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
    setDirty(false);
    setStatus(result.status === 'created' ? 'Gear Tracking created.' : 'Gear Tracking updated.');
  }

  // Guards against a bare Enter key implicitly submitting the form from an
  // earlier step, now that the submit button only renders on Review.
  function handleFormKeyDown(event) {
    if (event.key !== 'Enter') return;
    if (step === STEPS.length - 1) return;
    if (event.target.tagName === 'TEXTAREA') return;
    event.preventDefault();
  }

  const statusLine = saveStatusLabel({ loading, isError, dirty, status });

  return (
    <main className="armory">
      <div className="armory-atmos" aria-hidden="true" />
      <div className="armory-rack-l" aria-hidden="true" />
      <div className="armory-rack-r" aria-hidden="true" />
      <div className="armory-inner">
        <header className="armory-head">
          <span className="k-mark">{formIntro.kicker}</span>
          <h1 className="k-display armory-title k-engraved">{formIntro.heading}</h1>
          <p className="k-narrative armory-lede">{formIntro.description}</p>
        </header>
        {intro}

        <nav className="wizard-stepper" aria-label="Gear Tracking steps">
          <div
            className="wizard-stepper-progress"
            role="progressbar"
            aria-valuenow={step + 1}
            aria-valuemin={1}
            aria-valuemax={STEPS.length}
            aria-label={`Step ${step + 1} of ${STEPS.length}: ${STEPS[step].label}`}
          >
            <div
              className="wizard-stepper-fill"
              style={{ width: `${(step / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
          <ol className="wizard-stepper-list">
            {STEPS.map((s, index) => (
              <li key={s.id}>
                <button
                  type="button"
                  className={`wizard-stepper-step${index === step ? ' active' : ''}${index < step ? ' done' : ''}`}
                  aria-current={index === step ? 'step' : undefined}
                  onClick={() => goToStep(index)}
                >
                  <span className="wizard-stepper-index">{index + 1}</span>
                  <span className="wizard-stepper-label">{s.label}</span>
                </button>
              </li>
            ))}
          </ol>
        </nav>

        <form
          className="public-form-card war-ledger-form wizard-form"
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
        >
          {/* ---------- Step 1: Governor Power & Gift Codes ---------- */}
          <section className="ledger-block wizard-step" hidden={step !== 0}>
            <div className="ledger-block-head">
              <span className="ledger-block-kicker">{STEPS[0].kicker}</span>
              <h2 ref={(el) => { headingRefs.current[0] = el; }} tabIndex={-1}>Governor Power</h2>
              <p>Your name and Member ID look you up and prefill anything already on file.</p>
            </div>
            <div className="identity-grid">
              <label>Your name<input value={form.name} onChange={(e) => updateField('name', e.target.value)} placeholder="Your in-game name" /></label>
              <label>Member ID<input value={form.member_id} onChange={(e) => updateField('member_id', e.target.value)} onBlur={() => lookup()} placeholder="Your Member ID" /></label>
            </div>
            {onFile && (
              <div className="on-file">
                Player profile on file - Governor Gear: {onFile.governor_gear || '-'} / Charms: {onFile.charms || '-'} / Heroes: {onFile.heroes?.length ? onFile.heroes.join(', ') : '-'}
              </div>
            )}
            <GiftCodeRewards />
            <div className="wizard-nav">
              <span />
              <button type="button" className="wizard-next" onClick={() => goToStep(1)}>Next: Troop Levels</button>
            </div>
          </section>

          {/* ---------- Step 2: Troop Levels ---------- */}
          <section className="ledger-block wizard-step" hidden={step !== 1}>
            <div className="ledger-block-head">
              <span className="ledger-block-kicker">{STEPS[1].kicker}</span>
              <h2 ref={(el) => { headingRefs.current[1] = el; }} tabIndex={-1}>Troop Levels</h2>
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
            <div className="wizard-nav">
              <button type="button" className="wizard-back" onClick={() => goToStep(0)}>Back</button>
              <button type="button" className="wizard-next" onClick={() => goToStep(2)}>Next: Hero Roster</button>
            </div>
          </section>

          {/* ---------- Step 3: Hero Roster ---------- */}
          <section className="ledger-block wizard-step" hidden={step !== 2}>
            <div className="ledger-block-head">
              <span className="ledger-block-kicker">{STEPS[2].kicker}</span>
              <h2 ref={(el) => { headingRefs.current[2] = el; }} tabIndex={-1}>Heroes</h2>
              <p>Select the heroes available on your account.</p>
            </div>
            <div className="hero-chip-grid">
              {HEROES.map((hero) => (
                <label key={hero} className={form.heroes.includes(hero) ? 'hero-chip selected' : 'hero-chip'}>
                  <input type="checkbox" checked={form.heroes.includes(hero)} onChange={() => toggleHero(hero)} />
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
                      // If the image resolved from cache before this ref attached,
                      // the native `load` event already fired and a React onLoad
                      // handler would miss it - check `.complete` first.
                      if (el.complete && el.naturalWidth > 0) {
                        markLoaded();
                      } else {
                        el.addEventListener('load', markLoaded, { once: true });
                      }
                    }}
                    onError={(event) => {
                      event.currentTarget.style.display = 'none';
                    }}
                  />
                  <span>{hero}</span>
                </label>
              ))}
            </div>
            <div className="wizard-nav">
              <button type="button" className="wizard-back" onClick={() => goToStep(1)}>Back</button>
              <button type="button" className="wizard-next" onClick={() => goToStep(3)}>Next: Gear &amp; Charms</button>
            </div>
          </section>

          {/* ---------- Step 4: Gear & Charms ---------- */}
          <section className="ledger-block wizard-step" hidden={step !== 3}>
            <div className="ledger-block-head">
              <span className="ledger-block-kicker">{STEPS[3].kicker}</span>
              <h2 ref={(el) => { headingRefs.current[3] = el; }} tabIndex={-1}>Governor Gear &amp; Charms</h2>
              <p>Upload a screenshot to auto-fill gear pieces and charm levels, then verify the dropdowns.</p>
            </div>
            {statusLine && <p className="save-status-line" aria-live="polite">{statusLine}</p>}
            <GovernorGearOcr onApply={applyPowerDataScan} />
            <h3 className="power-subheader">Governor Gear</h3>
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
            <h3 className="power-subheader">Charms</h3>
            <p className="hint" style={{ marginTop: 0 }}>Levels 1–22 (Kingshot Optimizer charm reference).</p>
            {CHARM_GROUPS.map((group) => (
              <div key={group.id} className="charm-subsection">
                <h4 className="charm-subsection-head">{group.label}</h4>
                <div className="ledger-charm-grid">
                  {group.slots.map((slot) => (
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
            ))}
            <div className="wizard-nav">
              <button type="button" className="wizard-back" onClick={() => goToStep(2)}>Back</button>
              <button type="button" className="wizard-next" onClick={() => goToStep(4)}>Next: Review &amp; Submit</button>
            </div>
          </section>

          {/* ---------- Step 5: Review & Submit ---------- */}
          <section className="ledger-block wizard-step" hidden={step !== 4}>
            <div className="ledger-block-head">
              <span className="ledger-block-kicker">{STEPS[4].kicker}</span>
              <h2 ref={(el) => { headingRefs.current[4] = el; }} tabIndex={-1}>Review &amp; Submit</h2>
              <p>Confirm everything below, then save your Gear Tracking.</p>
            </div>

            <div className="wizard-review-grid">
              <div className="wizard-review-card">
                <h4>Governor Power</h4>
                <dl>
                  <div><dt>Name</dt><dd>{form.name || '-'}</dd></div>
                  <div><dt>Member ID</dt><dd>{form.member_id || '-'}</dd></div>
                </dl>
                <button type="button" className="wizard-review-edit" onClick={() => goToStep(0)}>Edit</button>
              </div>

              <div className="wizard-review-card">
                <h4>Troop Levels</h4>
                <dl>
                  {PROFILE_UNIT_FIELDS.map((unit) => (
                    <div key={unit.key}>
                      <dt>{unit.label}</dt>
                      <dd>{[form[unit.tier], form[unit.tg]].filter(Boolean).join(' / ') || '-'}</dd>
                    </div>
                  ))}
                </dl>
                <button type="button" className="wizard-review-edit" onClick={() => goToStep(1)}>Edit</button>
              </div>

              <div className="wizard-review-card">
                <h4>Hero Roster</h4>
                <p className="wizard-review-text">{form.heroes.length ? form.heroes.join(', ') : 'No heroes selected.'}</p>
                <button type="button" className="wizard-review-edit" onClick={() => goToStep(2)}>Edit</button>
              </div>

              <div className="wizard-review-card">
                <h4>Governor Gear</h4>
                <p className="wizard-review-text">{form.governor_gear || 'No gear selected.'}</p>
              </div>

              <div className="wizard-review-card">
                <h4>Charms</h4>
                <p className="wizard-review-text">{form.charms || 'No charms selected.'}</p>
                <button type="button" className="wizard-review-edit" onClick={() => goToStep(3)}>Edit</button>
              </div>

              <div className="wizard-review-card">
                <h4>Additional Power</h4>
                <dl>
                  {POWER_PROFILE_FIELDS.map((field) => (
                    <div key={field.key}><dt>{field.label}</dt><dd>{form[field.key] || '-'}</dd></div>
                  ))}
                </dl>
              </div>
            </div>

            {statusLine && <p className="save-status-line" aria-live="polite">{statusLine}</p>}
            {status && <div className={isError ? 'status error' : 'status'}>{status}</div>}
            <div className="wizard-nav">
              <button type="button" className="wizard-back" onClick={() => goToStep(3)}>Back</button>
              <button type="submit" disabled={loading}>{loading ? 'Saving...' : 'Save Gear Tracking'}</button>
            </div>
          </section>
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

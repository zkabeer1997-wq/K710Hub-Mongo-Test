'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '../../components/i18n/LanguageProvider';
import IdentityFields from '../../components/member/IdentityFields';
import PageHero from '../../components/ui/PageHero';
import LoadoutEditor from '../../components/loadout/LoadoutEditor';
import '../../components/member/easy-view-fixes.css';
import {
POWER_NUMBER_KEYS,
POWER_PROFILE_FIELDS,
blankCharmSelections,
blankGovernorGearSelections,
checkPowerNumber,
displayPowerNumber,
powerNumberErrors,
parseCharmSelections,
parseGovernorGearSelections,
serializeCharmSelections,
serializeGovernorGearSelections,
} from '../../lib/powerProfiles.mjs';
import { useFormFieldMeta } from '../../lib/useFormFieldMeta';
import { saveStatusLabel } from '../../lib/powerProfileWizard.mjs';
import { LoadingRow } from '../../components/ui';
import FormErrorSummary from '../../components/FormErrorSummary';
import { useWizardUrlStep } from '../../lib/useWizardUrlStep';
import TourLauncher from '../../components/tour/TourLauncher';
import { completionText, reviewLines } from '../../lib/loadout.mjs';
import { draftKey, mergeDraft, parseDraft, serializeDraft } from '../../lib/wizardState.mjs';

const DRAFT_KEY = draftKey('power-profile');

// Same grouping the member dashboard uses for the Mystic Trial figure, so the two always read the same.
const formatCount = (value) => (value == null || value === '' || Number.isNaN(Number(value)) ? String(value || '') : new Intl.NumberFormat().format(Number(value)));

// Draft selections (slot -> value) over the saved ones: only non-blank draft values replace them.
function mergeNonBlank(saved, draft) {
  const out = { ...saved };
  if (draft && typeof draft === 'object') {
    for (const [key, value] of Object.entries(draft)) if (key in out && String(value || '')) out[key] = String(value);
  }
  return out;
}

// Per-step validation (step 1 has the required name / Member ID; step 2 checks the optional Pet Power and
// Masters Power numbers). The API checks the same rules. Returns [{ id, key, message }].
function stepErrors(index, form) {
  const found = [];
  if (index === 0) {
    if (!String(form.name || '').trim()) found.push({ id: 'pp-name', key: 'name', message: 'Your name is required.' });
    if (!String(form.member_id || '').trim()) found.push({ id: 'pp-member_id', key: 'member_id', message: 'Member ID is required.' });
  }
  if (index === 1) {
    for (const { key, message } of powerNumberErrors(form)) found.push({ id: `pp-${key}`, key, message });
  }
  return found;
}

// Wizard steps. Presentational grouping only - every field below still
// reads/writes the same lifted `form` / `governorGear` / `charms` state as
// before, so moving between steps can never drop an input.
const STEPS = [
  { id: 'power', kicker: 'You', label: 'Your details' },
  { id: 'gear', kicker: 'Power Data', label: 'Gear & Charms' },
  { id: 'review', kicker: 'Final Check', label: 'Review & Submit' },
];

function PowerProfileForm({ identity, intro }) {
  const memberId = identity?.memberId || '';
  const { intro: formIntro } = useFormFieldMeta('lead');
  const [form, setForm] = useState({
    name: identity?.name || '',
    member_id: memberId,
    governor_gear: '',
    charms: '',
    hero_gear: '',
    pet_power: '',
    masters_power: '',
  });
  // Mystic Trial is read-only: { value, source: 'login' | 'saved' | 'none' } from GET /api/power-profile.
  const [mystic, setMystic] = useState({ value: '', source: 'none' });
  const t = useT();
  const [governorGear, setGovernorGear] = useState(blankGovernorGearSelections());
  const [charms, setCharms] = useState(blankCharmSelections());
  const [onFile, setOnFile] = useState(null);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lookingUp, setLookingUp] = useState(false);

  // Wizard-only UI state. Never read by handleSubmit and never sent to the
  // API - purely for the stepper/progress bar and the save-status line.
  const [dirty, setDirty] = useState(false);
  const [scanSaveMsg, setScanSaveMsg] = useState('');
  const [errors, setErrors] = useState([]);
  const [errorSignal, setErrorSignal] = useState(0);
  const headingRefs = useRef([]);
  const skipFocusRef = useRef(false);
  const prevStepRef = useRef(0);
  const formRef = useRef(form);
  const draftReady = useRef(false);
  const draftRef = useRef(null);
  const { step, setStep, initFromUrl } = useWizardUrlStep(STEPS.length, () => {
    // A deep link can't skip past step 1 while its required fields are empty.
    return stepErrors(0, formRef.current).length ? 0 : STEPS.length - 1;
  });
  useEffect(() => { formRef.current = form; });

  // Moving forward past step 1 requires its fields; going back is always free.
  function goToStep(index) {
    const bounded = Math.max(0, Math.min(STEPS.length - 1, index));
    if (bounded > step) {
      // Every step we pass on the way forward must be valid; the first problem stops us on its own step.
      for (let i = 0; i < bounded; i++) {
        const found = stepErrors(i, form);
        if (found.length) {
          if (i !== step) setStep(i);
          setErrors(found);
          setErrorSignal((n) => n + 1);
          return;
        }
      }
    }
    setErrors([]);
    setStep(bounded);
  }

  // Restore the local draft, then the ?step= value (limited by validity).
  useEffect(() => {
    try {
      const draft = parseDraft(window.localStorage.getItem(DRAFT_KEY));
      if (draft) {
        const restored = mergeDraft(form, draft.form || {});
        restored.member_id = memberId; // the login, never a stored draft value
        if (!restored.name) restored.name = identity?.name || '';
        formRef.current = restored;
        draftRef.current = draft;
        setForm(restored);
        if (draft.governorGear && typeof draft.governorGear === 'object') setGovernorGear((cur) => mergeDraft(cur, draft.governorGear));
        if (draft.charms && typeof draft.charms === 'object') setCharms((cur) => mergeDraft(cur, draft.charms));
      }
    } catch { /* storage unavailable */ }
    // A deep-linked step shouldn't steal focus on first paint.
    skipFocusRef.current = initFromUrl() > 0;
    draftReady.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Debounced draft save. Contains only the profile fields below - no PINs,
  // passwords or uploaded files ever enter this form's state.
  useEffect(() => {
    if (!draftReady.current) return undefined;
    const t = setTimeout(() => {
      try {
        window.localStorage.setItem(DRAFT_KEY, serializeDraft({ form, governorGear, charms }));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [form, governorGear, charms]);

  useEffect(() => {
    if (prevStepRef.current === step) return;
    prevStepRef.current = step;
    if (skipFocusRef.current) {
      skipFocusRef.current = false;
      return;
    }
    // Focus without letting the browser jump; only scroll if the heading is
    // off-screen, so the hero is not scrolled past on every step change.
    const heading = headingRefs.current[step];
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const top = heading.getBoundingClientRect().top;
    if (top < 80 || top > window.innerHeight * 0.7) {
      window.scrollTo({ top: Math.max(0, window.scrollY + top - 96), behavior: 'auto' });
    }
  }, [step]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current.some((e) => e.key === key) ? current.filter((e) => e.key !== key) : current));
    setDirty(true);
  }

  // Pet / Masters Power: thousands separators once the box is left and the number is valid.
  function formatPowerOnBlur(key) {
    const checked = checkPowerNumber(key, form[key]);
    if (checked.ok && !checked.empty) setForm((current) => ({ ...current, [key]: displayPowerNumber(checked.digits) }));
  }

  const errorFor = (key) => errors.find((e) => e.key === key);
  const fieldProps = (key) => {
    const err = errorFor(key);
    return { id: `pp-${key}`, 'aria-invalid': err ? 'true' : undefined, 'aria-describedby': err ? `pp-${key}-error` : undefined };
  };
  const fieldError = (key) => {
    const err = errorFor(key);
    return err ? <p id={`pp-${key}-error`} className="field-error">{err.message}</p> : null;
  };

  function updateGovernorGear(key, value) {
    setGovernorGear((current) => {
      const next = { ...current, [key]: value };
      setForm((currentForm) => ({ ...currentForm, governor_gear: serializeGovernorGearSelections(next) }));
      return next;
    });
    setDirty(true);
  }

  function updateCharm(key, value) {
    setCharms((current) => {
      const next = { ...current, [key]: value };
      setForm((currentForm) => ({ ...currentForm, charms: serializeCharmSelections(next) }));
      return next;
    });
    setDirty(true);
  }

  // "Use these values" on the scan review: the values (corrected or confirmed by the player) go straight into the
  // saved profile so tools and calculators see them, and the corrections are kept for improving the reader.
  async function saveScanned({ corrections = [], gear = {}, charms: nextCharms = {} } = {}) {
    const wasDirty = dirty;
    const gearStr = serializeGovernorGearSelections({ ...governorGear, ...gear });
    const charmStr = serializeCharmSelections({ ...charms, ...nextCharms });
    setScanSaveMsg('Saving your gear and charms to your profile...');
    try {
      const response = await fetch('/api/power-profile/loadout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ governor_gear: gearStr, charms: charmStr, corrections }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setScanSaveMsg(result.error || 'Could not save to your profile. Your values are on the board: press Save to keep them.');
        return;
      }
      if (!wasDirty) setDirty(false);
      setScanSaveMsg('Saved to your profile. Tools and calculators will now start from these gear and charm levels.');
    } catch {
      setScanSaveMsg('Could not save to your profile. Your values are on the board: press Save to keep them.');
    }
  }

  function clearLoadout() {
    setGovernorGear(blankGovernorGearSelections());
    setCharms(blankCharmSelections());
    setForm((current) => ({ ...current, governor_gear: '', charms: '' }));
    setDirty(true);
  }

  // Always load the saved profile. A leftover local draft means unsaved edits (it is deleted after a
  // successful save), so a non-empty draft value wins; anything the draft left blank comes from the
  // saved profile, so the form never shows a blank where an answer is on file.
  async function lookup() {
    setLookingUp(true);
    let response;
    let result;
    try {
      response = await fetch('/api/power-profile', { cache: 'no-store' });
      result = await response.json();
      if (result && result.mystic) setMystic(result.mystic);
    } catch {
      return;
    } finally {
      setLookingUp(false);
    }
    if (!response.ok) {
      setOnFile(null);
      return;
    }
    if (result.profile) {
      const draft = draftRef.current || {};
      const draftForm = draft.form && typeof draft.form === 'object' ? draft.form : {};
      const pick = (key) => String(draftForm[key] || '') || result.profile[key] || '';
      const gearSelections = mergeNonBlank(parseGovernorGearSelections(result.profile.governor_gear), draft.governorGear);
      const charmSelections = mergeNonBlank(parseCharmSelections(result.profile.charms), draft.charms);
      setGovernorGear(gearSelections);
      setCharms(charmSelections);
      setOnFile(result.profile);
      setForm((current) => ({
        ...current,
        name: String(draftForm.name || '') || result.profile.name || current.name || '',
        governor_gear: serializeGovernorGearSelections(gearSelections) || result.profile.governor_gear || '',
        charms: serializeCharmSelections(charmSelections) || result.profile.charms || '',
        hero_gear: pick('hero_gear'),
        pet_power: displayPowerNumber(pick('pet_power')),
        masters_power: displayPowerNumber(pick('masters_power')),
      }));
    } else {
      setOnFile(null);
      // No saved profile yet: start from the name we already know (KvK answers, Kingshot nickname).
      if (result.base?.name) setForm((current) => ({ ...current, name: current.name || result.base.name }));
    }
  }

  // Identity (name + locked Member ID) arrives from the server as props; only the saved profile is fetched.
  useEffect(() => {
    if (memberId) lookup();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleSubmit(event) {
    event.preventDefault();
    setStatus('');
    setIsError(false);
    for (let i = 0; i < 2; i++) {
      const missing = stepErrors(i, form);
      if (missing.length) {
        setStep(i);
        setErrors(missing);
        setErrorSignal((n) => n + 1);
        return;
      }
    }
    setErrors([]);
    setLoading(true);
    const response = await fetch('/api/power-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const result = await response.json();
    setLoading(false);
    if (!response.ok) {
      if (POWER_NUMBER_KEYS.includes(result.field)) {
        // The server disagreed with one of the number boxes: show it on that box, like a local check.
        setStep(1);
        setErrors([{ id: `pp-${result.field}`, key: result.field, message: result.error }]);
        setErrorSignal((n) => n + 1);
        return;
      }
      setIsError(true);
      setStatus(result.error || 'Could not save Power Profile.');
      return;
    }
    setOnFile(result.profile);
    if (result.mystic) setMystic(result.mystic);
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setDirty(false);
    setStatus(result.status === 'created' ? 'Power Profile created.' : 'Power Profile updated.');
  }

  // Guards against a bare Enter key implicitly submitting the form from an
  // earlier step, now that the submit button only renders on Review.
  function handleFormKeyDown(event) {
    if (event.key !== 'Enter') return;
    if (step === STEPS.length - 1) return;
    // Buttons and links must keep their normal Enter activation (keyboard users press Back/Next with it).
    if (['TEXTAREA', 'BUTTON', 'A'].includes(event.target.tagName)) return;
    event.preventDefault();
  }

  const mysticField = POWER_PROFILE_FIELDS.find((field) => field.key === 'mystic_trial_score');
  const statusLine = saveStatusLabel({ loading, isError, dirty, status });

  return (
    <main className="armory">
      <div className="armory-atmos" aria-hidden="true" />
      <div className="armory-rack-l" aria-hidden="true" />
      <div className="armory-rack-r" aria-hidden="true" />
      <div className="armory-inner">
        <PageHero tone="console" className="armory-page-hero" eyebrow={formIntro.kicker} title={formIntro.heading} lede={formIntro.description} actions={<TourLauncher id="power" />} />
        {intro}

        <nav className="wizard-stepper" aria-label="Power Profile steps" data-tour="power-steps">
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
          noValidate
          className="public-form-card war-ledger-form wizard-form"
          onSubmit={handleSubmit}
          onKeyDown={handleFormKeyDown}
        >
          {/* ---------- Step 1: Power & Gift Codes ---------- */}
          <section className="ledger-block wizard-step" hidden={step !== 0}>
            <div className="ledger-block-head">
              <span className="ledger-block-kicker">{STEPS[0].kicker}</span>
              <h2 ref={(el) => { headingRefs.current[0] = el; }} tabIndex={-1}>Your details</h2>
              <p>We filled in your name and Member ID from your sign-in. Check that your name is right. Your Member ID is your login, so it cannot be changed here.</p>
            </div>
            <IdentityFields tourAnchor="power-details" memberId={form.member_id} name={form.name} onNameChange={(v) => updateField('name', v)} known={Boolean(identity?.name)} inputProps={{ id: 'pp-name' }} invalid={Boolean(fieldProps('name')['aria-invalid'])} describedBy={fieldProps('name')['aria-describedby']} />
            {fieldError('name')}
            {/* Reserved height: the row appearing on blur must not shift the Next button mid-click. */}
            <div className="lookup-slot" aria-live="polite">{lookingUp && <LoadingRow>Looking up your profile…</LoadingRow>}</div>
            {onFile && (
              <div className="on-file">
                Saved profile - Governor Gear: {onFile.governor_gear || '-'} / Charms: {onFile.charms || '-'}
              </div>
            )}
            <FormErrorSummary errors={errors} focusSignal={errorSignal} />
            <div className="wizard-nav">
              <span />
              <button type="button" className="wizard-next" onClick={() => goToStep(1)}>Next: Gear &amp; Charms</button>
            </div>
          </section>

          {/* ---------- Step 4: Gear & Charms ---------- */}
          <section className="ledger-block wizard-step" hidden={step !== 1}>
            <div className="ledger-block-head">
              <span className="ledger-block-kicker">{STEPS[1].kicker}</span>
              <h2 ref={(el) => { headingRefs.current[1] = el; }} tabIndex={-1}>Governor Gear &amp; Charms</h2>
              <p>Set the quality, tier and stars of each gear piece and the level of its three charms.</p>
            </div>
            {statusLine && <p className="save-status-line" aria-live="polite">{statusLine}</p>}
            {scanSaveMsg && <p className="save-status-line" role="status" aria-live="polite">{scanSaveMsg}</p>}
            <LoadoutEditor
              gear={governorGear}
              charms={charms}
              onGearChange={updateGovernorGear}
              onCharmChange={updateCharm}
              onClear={clearLoadout}
              onScanApplied={saveScanned}
            />
            <div className="member-identity" data-tour="power-extra">
              <div className="member-identity-field">
                <label>
                  <span className="member-identity-label">{t('profile.pet.label')}</span>
                  <input
                    {...fieldProps('pet_power')}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={11}
                    placeholder={t('profile.number.placeholder')}
                    value={form.pet_power}
                    onChange={(e) => updateField('pet_power', e.target.value)}
                    onBlur={() => formatPowerOnBlur('pet_power')}
                    aria-describedby={['pp-pet_power-hint', fieldProps('pet_power')['aria-describedby']].filter(Boolean).join(' ')}
                  />
                </label>
                <p className="member-identity-hint" id="pp-pet_power-hint">{t('profile.number.hint')}</p>
                {fieldError('pet_power')}
              </div>
              <div className="member-identity-field">
                <label>
                  <span className="member-identity-label">{t('profile.masters.label')}</span>
                  <input
                    {...fieldProps('masters_power')}
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    maxLength={11}
                    placeholder={t('profile.number.placeholder')}
                    value={form.masters_power}
                    onChange={(e) => updateField('masters_power', e.target.value)}
                    onBlur={() => formatPowerOnBlur('masters_power')}
                    aria-describedby={['pp-masters_power-hint', fieldProps('masters_power')['aria-describedby']].filter(Boolean).join(' ')}
                  />
                </label>
                <p className="member-identity-hint" id="pp-masters_power-hint">{t('profile.number.hint')}</p>
                {fieldError('masters_power')}
              </div>
            </div>
            <FormErrorSummary errors={errors} focusSignal={errorSignal} id="form-error-summary-gear" />
            <div className="wizard-nav">
              <button type="button" className="wizard-back" onClick={() => goToStep(0)}>Back</button>
              <button type="button" className="wizard-next" onClick={() => goToStep(2)}>Next: Review &amp; Submit</button>
            </div>
          </section>

          {/* ---------- Step 5: Review & Submit ---------- */}
          <section className="ledger-block wizard-step" hidden={step !== 2}>
            <div className="ledger-block-head">
              <span className="ledger-block-kicker">{STEPS[2].kicker}</span>
              <h2 ref={(el) => { headingRefs.current[2] = el; }} tabIndex={-1}>Review &amp; Submit</h2>
              <p>Confirm everything below, then save your Power Profile.</p>
            </div>

            <div className="wizard-review-grid" data-tour="power-review">
              <div className="wizard-review-card">
                <h4>Your details</h4>
                <dl>
                  <div><dt>Name</dt><dd>{form.name || '-'}</dd></div>
                  <div><dt>Member ID</dt><dd>{form.member_id || '-'}</dd></div>
                </dl>
                <button type="button" className="wizard-review-edit" onClick={() => goToStep(0)}>Edit</button>
              </div>

              <div className="wizard-review-card">
                <h4>Governor Gear and Charms</h4>
                <p className="wizard-review-text">{completionText(governorGear, charms)}</p>
                <dl>
                  {reviewLines(governorGear, charms).map((line) => (
                    <div key={line.id}><dt>{line.name}</dt><dd>{line.gear}<br />Charms {line.charms}</dd></div>
                  ))}
                </dl>
                <button type="button" className="wizard-review-edit" onClick={() => goToStep(1)}>Edit</button>
              </div>

              <div className="wizard-review-card">
                <h4>Additional Power</h4>
                <dl>
                  {POWER_PROFILE_FIELDS.filter((field) => field.key !== 'mystic_trial_score').map((field) => (
                    <div key={field.key}><dt>{field.label}</dt><dd>{form[field.key] || '-'}</dd></div>
                  ))}
                  <div data-testid="review-mystic">
                    <dt>{mysticField.label}</dt>
                    <dd>{mystic.value ? formatCount(mystic.value) : t('profile.mystic.none')}</dd>
                  </div>
                </dl>
                <p className="wizard-review-note">{mystic.source === 'login' ? t('profile.mystic.login') : mystic.source === 'saved' ? t('profile.mystic.saved') : t('profile.mystic.missing')}</p>
                <button type="button" className="wizard-review-edit" onClick={() => goToStep(1)}>Edit</button>
              </div>
            </div>

            {statusLine && <p className="save-status-line" aria-live="polite">{statusLine}</p>}
            <FormErrorSummary errors={errors} focusSignal={errorSignal} id="form-error-summary-review" />
            {status && <div className={isError ? 'status error' : 'status'} role={isError ? 'alert' : 'status'}>{status}</div>}
            <div className="wizard-nav">
              <button type="button" className="wizard-back" onClick={() => goToStep(1)}>Back</button>
              <button type="submit" disabled={loading} data-tour="power-save">{loading ? 'Saving...' : 'Save Power Profile'}</button>
            </div>
          </section>
        </form>
      </div>
    </main>
  );
}

export default function PowerProfileClient({ intro, identity }) {
  return <PowerProfileForm identity={identity} intro={intro} />;
}

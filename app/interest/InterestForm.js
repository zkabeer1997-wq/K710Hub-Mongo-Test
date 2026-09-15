'use client';

import { useEffect, useRef, useState } from 'react';
import SealedPetition from '../../components/kingdom/world/SealedPetition';
import { processInterestImages } from './processInterestImages';
import { useFormFieldMeta } from '../../lib/useFormFieldMeta';

const MIGRATE_OPTIONS = [
'710 (Bear 0200UTC and 1300UTC)',
'RED (Bear 1105UTC, 1900UTC and 2320UTC)',
'SKY (Bear 1200UTC and 2000UTC)',
'Other',
];
const TROOP_LEVEL_OPTIONS = ['TG8', 'TG7', 'TG6', 'TG5', 'Below TG5'];
const T11_OPTIONS = ['Infantry', 'Cavalry', 'Archer', 'No T11'];
const YES_NO = ['Yes', 'No'];
const SPENDING_OPTIONS = [
'P2W Whale (spending like a KS shareholder)',
'P2W Dolphin (between $1000-$2000 monthly)',
'P2W Tadpole (upto $1000 monthly)',
'Occasional spending (less than $100 monthly)',
'F2P (pure skills, always on)',
];

// One screen per Act instead of one long scroll - the same ~20 fields and
// screenshot upload the admin review queue already relies on (see
// app/api/admin-interest-status/route.js and the review UI at
// /admin/dashboard/interest, both of which screen applicants on troop
// level, TG, spending archetype, and commitment answers collected here).
// Shortening what's COLLECTED would blind that review, which is a
// recruiting-policy call, not a UI one - so this only changes how much is
// on screen at once, matching the "5-6 fields, no account" feel of a short
// funnel without dropping the vetting data behind it.
const ACTS = [
  { id: 'identity', num: 'I', label: 'Who Approaches', required: ['inGameName', 'playerId', 'discordUsername', 'currentServer', 'currentAlliance'] },
  { id: 'intake', num: 'II', label: 'The Crossing', required: ['migrateAlliance'] },
  { id: 'troops', num: 'III', label: 'Strength of Arms', required: ['highestTroopLevel', 'currentTg', 'mysticTrialStages', 'totalPower'], requiresT11: true },
  { id: 'commitment', num: 'IV', label: 'The Oath', required: ['activeCommit', 'willingSaveResources', 'participatesBattles', 'spendingArchetype', 'mainLanguage'] },
  { id: 'battle-report', num: 'V', label: 'Proof', requiresScreenshot: true },
];

function Chapter({ id, title, children }) {
  return (
    <section id={id} className="petition-group">
      <h3 className="petition-group-title k-mark">{title}</h3>
      <div className="petition-group-body">{children}</div>
    </section>
  );
}

const initialForm = {
inGameName: '',
playerId: '',
discordUsername: '',
currentServer: '',
currentAlliance: '',
migrateAlliance: '',
migrateAllianceOther: '',
highestTroopLevel: '',
currentTg: '',
t11: [],
mysticTrialStages: '',
totalPower: '',
willingReducePower: '',
passesRequired: '',
currentPasses: '',
activeCommit: '',
willingSaveResources: '',
participatesBattles: '',
spendingArchetype: '',
mainLanguage: '',
mainLanguageOther: '',
// Honeypot - a real applicant never sees or fills this field (hidden via
// CSS, not `type="hidden"`, since some bots skip inputs they detect as
// hidden by type). Filled in => treat the submission as spam.
website: '',
};

export default function InterestForm() {
const [form, setForm] = useState(initialForm);
const [screenshots, setScreenshots] = useState([]);
const [processingImages, setProcessingImages] = useState(false);
const [status, setStatus] = useState('');
const [isError, setIsError] = useState(false);
const [loading, setLoading] = useState(false);
const [sealed, setSealed] = useState(false);
const [reducedMotion, setReducedMotion] = useState(false);
const [step, setStep] = useState(0);
const [confirmedInfo, setConfirmedInfo] = useState({});
const [activePeriod, setActivePeriod] = useState(null);
const [activePeriodLoaded, setActivePeriodLoaded] = useState(false);
const { fields: editableFields } = useFormFieldMeta('interest');
const editableLabel = (key, fallback) => editableFields.find((f) => f.key === key)?.label || fallback;
const editablePlaceholder = (key, fallback) => editableFields.find((f) => f.key === key)?.placeholder || fallback;
const renderedAt = useRef(Date.now());
const screenshotInput = useRef(null);

useEffect(() => {
  if (typeof window === 'undefined') return;
  setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
}, []);

useEffect(() => {
  let cancelled = false;
  fetch('/api/intake-periods/active')
    .then((r) => r.json())
    .then((data) => { if (!cancelled) setActivePeriod(data.label || null); })
    .catch(() => { if (!cancelled) setActivePeriod(null); })
    .finally(() => { if (!cancelled) setActivePeriodLoaded(true); });
  return () => { cancelled = true; };
}, []);

useEffect(() => {
  const section = document.getElementById(ACTS[step].id);
  section?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  // Move focus to the new step's heading so keyboard/screen-reader users
  // perceive the step change, not just a visual scroll.
  section?.querySelector('.petition-act-title')?.focus();
}, [step, reducedMotion]);

function updateField(key, value) {
setForm((current) => ({ ...current, [key]: value }));
}

function toggleT11(option) {
setForm((current) => {
const has = current.t11.includes(option);
return { ...current, t11: has ? current.t11.filter((o) => o !== option) : [...current.t11, option] };
});
}

const FIELD_LABELS = {
  inGameName: 'In-game name',
  playerId: 'Player ID',
  discordUsername: 'Discord username',
  currentServer: 'Your current server',
  currentAlliance: 'Your current alliance',
  migrateAlliance: 'Which alliance are you looking to migrate to',
  highestTroopLevel: 'Current highest troop level',
  currentTg: 'Current amount of TG',
  mysticTrialStages: 'Current Mystic Trial total stages',
  totalPower: 'Total Power',
  passesRequired: 'Number of passes required to transfer',
  currentPasses: 'Your current number of transfer passes',
  activeCommit: 'Active commitment',
  willingSaveResources: 'Willing to save resources',
  participatesBattles: 'Participation in battles',
  spendingArchetype: 'Spending archetype',
  mainLanguage: 'Main language',
};

// Digits only, with optional thousands commas (e.g. "245,000,000") - loose
// enough for power/TG figures pasted straight from in-game, strict enough
// to catch stray letters or negative numbers before they reach admin review.
const NUMERIC_FIELDS = ['currentTg', 'mysticTrialStages', 'totalPower', 'passesRequired', 'currentPasses'];
function isNumericValue(value) {
  return /^[0-9][0-9,]*$/.test(String(value || '').trim());
}

function validateStep(index) {
  const act = ACTS[index];
  for (const key of act.required || []) {
    if (!String(form[key] || '').trim()) {
      setIsError(true);
      setStatus(`Please fill in: ${editableLabel(key, FIELD_LABELS[key])}.`);
      return false;
    }
  }
  for (const key of NUMERIC_FIELDS) {
    if (key in form && form[key] && !isNumericValue(form[key])) {
      setIsError(true);
      setStatus(`${editableLabel(key, FIELD_LABELS[key])} should be numbers only.`);
      return false;
    }
  }
  if (act.id === 'intake' && form.migrateAlliance === 'Other' && !form.migrateAllianceOther.trim()) {
    setIsError(true);
    setStatus('Please specify which alliance you want to migrate to.');
    return false;
  }
  if (act.id === 'commitment' && form.mainLanguage === 'Other' && !form.mainLanguageOther.trim()) {
    setIsError(true);
    setStatus('Please specify your main language.');
    return false;
  }
  if (act.requiresT11 && form.t11.length === 0) {
    setIsError(true);
    setStatus('Please select at least one T11 option.');
    return false;
  }
  if (act.requiresScreenshot && screenshots.length === 0) {
    setIsError(true);
    setStatus('Please upload at least one screenshot.');
    return false;
  }
  setIsError(false);
  setStatus('');
  return true;
}

function goNext() {
  if (!validateStep(step)) return;
  setStep((s) => Math.min(s + 1, ACTS.length - 1));
}

function goBack() {
  setIsError(false);
  setStatus('');
  setStep((s) => Math.max(s - 1, 0));
}

async function handleScreenshotChange(event) {
  const input = event.currentTarget;
  const files = input.files;
  setProcessingImages(true);
  setIsError(false);
  setStatus('Preparing and compressing your screenshots…');

  try {
    const processed = await processInterestImages(files);
    setScreenshots(processed);
    setStatus(`${processed.length} screenshot${processed.length === 1 ? '' : 's'} ready to upload.`);
  } catch (error) {
    setScreenshots([]);
    setIsError(true);
    setStatus(error instanceof Error ? error.message : 'The screenshots could not be prepared. Please try again.');
    input.value = '';
  } finally {
    setProcessingImages(false);
  }
}

async function handleSubmit(e) {
e.preventDefault();
if (!validateStep(step)) return;

setLoading(true);
const body = new FormData();
body.append('in_game_name', form.inGameName);
body.append('player_id', form.playerId);
body.append('discord_username', form.discordUsername);
body.append('current_server', form.currentServer);
body.append('current_alliance', form.currentAlliance);
body.append(
'migrate_alliance',
form.migrateAlliance === 'Other' ? `Other: ${form.migrateAllianceOther}` : form.migrateAlliance
);
body.append('highest_troop_level', form.highestTroopLevel);
body.append('current_tg', form.currentTg);
form.t11.forEach((option) => body.append('t11_units', option));
body.append('mystic_trial_stages', form.mysticTrialStages);
body.append('total_power', form.totalPower);
body.append('willing_reduce_power', form.willingReducePower);
body.append('passes_required', form.passesRequired);
body.append('current_passes', form.currentPasses);
body.append('active_commit', form.activeCommit);
body.append('willing_save_resources', form.willingSaveResources);
body.append('participates_battles', form.participatesBattles);
body.append('spending_archetype', form.spendingArchetype);
body.append(
'main_language',
form.mainLanguage === 'Other' ? `Other: ${form.mainLanguageOther}` : form.mainLanguage
);
screenshots.forEach((file) => body.append('screenshots', file));
body.append('website', form.website);
body.append('rendered_at', String(renderedAt.current));

let response;
let result = {};
try {
  response = await fetch('/api/interest', { method: 'POST', body });
  result = await response.json().catch(() => ({}));
} catch {
  setLoading(false);
  setIsError(true);
  setStatus('The upload was interrupted. Check your connection and try submitting again.');
  return;
}
setLoading(false);

if (!response.ok) {
setIsError(true);
setStatus(result.error || 'Something went wrong. Please try again.');
return;
}
setIsError(false);
setStatus('');
setConfirmedInfo({ intakePeriod: activePeriod, discordUsername: form.discordUsername, reference: result.reference || null });
setForm(initialForm);
setScreenshots([]);
if (screenshotInput.current) screenshotInput.current.value = '';
setStep(0);
renderedAt.current = Date.now();
setSealed(true);
}

const isFinalStep = step === ACTS.length - 1;

return (
<>
{sealed && (
  <SealedPetition
    reducedMotion={reducedMotion}
    onClose={() => setSealed(false)}
    intakePeriod={confirmedInfo.intakePeriod}
    discordUsername={confirmedInfo.discordUsername}
    reference={confirmedInfo.reference}
  />
)}
<form className="public-form-card interest-petition" onSubmit={handleSubmit}>
<nav className="petition-index" aria-label="Petition sections">
  {ACTS.map((a, i) => (
    <button
      key={a.id}
      type="button"
      className={`petition-index-item ${i === step ? 'is-current' : ''} ${i < step ? 'is-done' : ''}`}
      aria-current={i === step ? 'step' : undefined}
      onClick={() => { if (i <= step || validateStep(step)) setStep(i); }}
    >
      <span className="petition-index-num">{a.num}</span>
      {a.label}
    </button>
  ))}
</nav>

{/* Honeypot: visually hidden (not type="hidden" - some bots skip those),
    off-screen, unreachable by tab order. A real applicant never sees or
    fills it; the server treats a non-empty value as spam. */}
<div className="petition-honeypot" aria-hidden="true">
  <label htmlFor="website">Leave this field blank</label>
  <input
    id="website"
    name="website"
    type="text"
    tabIndex={-1}
    autoComplete="off"
    value={form.website}
    onChange={(e) => updateField('website', e.target.value)}
  />
</div>

{step === 0 && (
<section id="identity" className="petition-act">
<header className="petition-act-head">
<span className="petition-act-num k-display">I</span>
<h2 className="petition-act-title k-display" tabIndex={-1}>Who Approaches</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<div className="petition-act-body">
<Chapter id="identity-fields" title="Identity">
<div className="identity-grid">
<label>{editableLabel('inGameName', 'In-game name')}<input value={form.inGameName} onChange={(e) => updateField('inGameName', e.target.value)} /></label>
<label>{editableLabel('playerId', 'Player ID')}<input value={form.playerId} onChange={(e) => updateField('playerId', e.target.value)} /></label>
<label>{editableLabel('discordUsername', 'Discord username')}<input value={form.discordUsername} onChange={(e) => updateField('discordUsername', e.target.value)} /></label>
<label>{editableLabel('currentServer', 'Your current server (prior to transfer)')}<input value={form.currentServer} onChange={(e) => updateField('currentServer', e.target.value)} /></label>
<label>{editableLabel('currentAlliance', 'Your current alliance (prior to transfer)')}<input value={form.currentAlliance} onChange={(e) => updateField('currentAlliance', e.target.value)} /></label>
</div>
</Chapter>
</div>
</section>
)}

{step === 1 && (
<section id="intake" className="petition-act">
<header className="petition-act-head">
<span className="petition-act-num k-display">II</span>
<h2 className="petition-act-title k-display" tabIndex={-1}>The Crossing</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<div className="petition-act-body">
<Chapter id="intake-fields" title="Intake window">
<div className="troop-section public-section">
<div className="section-title-row"><span>Intake</span><h3>Intake window</h3></div>
{!activePeriodLoaded && <p>Checking the current intake window…</p>}
{activePeriodLoaded && activePeriod && (
<p>You&apos;re applying for the <strong>{activePeriod}</strong> intake window. Leadership sets this window; it isn&apos;t something you choose.</p>
)}
{activePeriodLoaded && !activePeriod && (
<p className="status error" role="alert">Transfer intake is currently closed. Check back soon.</p>
)}
</div>
</Chapter>

<Chapter id="migration-fields" title="Migration">
<div className="troop-section public-section">
<div className="section-title-row"><span>Migration</span><h3>Which alliance are you looking to migrate to?</h3></div>
<div className="radio-group">
{MIGRATE_OPTIONS.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="migrateAlliance" checked={form.migrateAlliance === option} onChange={() => updateField('migrateAlliance', option)} />
<span>{option}</span>
</label>
))}
</div>
{form.migrateAlliance === 'Other' && (
<input placeholder="Please specify" value={form.migrateAllianceOther} onChange={(e) => updateField('migrateAllianceOther', e.target.value)} />
)}
</div>
</Chapter>
</div>
</section>
)}

{step === 2 && (
<section id="troops" className="petition-act">
<header className="petition-act-head">
<span className="petition-act-num k-display">III</span>
<h2 className="petition-act-title k-display" tabIndex={-1}>Strength of Arms</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<div className="petition-act-body">
<Chapter id="troops-fields" title="Troops">
<div className="troop-section public-section">
<div className="section-title-row"><span>Troops</span><h3>Current highest troop level (not TC)</h3></div>
<div className="radio-group">
{TROOP_LEVEL_OPTIONS.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="highestTroopLevel" checked={form.highestTroopLevel === option} onChange={() => updateField('highestTroopLevel', option)} />
<span>{option}</span>
</label>
))}
</div>
</div>

<div className="identity-grid">
<label>{editableLabel('currentTg', 'Current amount of TG')}<input inputMode="numeric" value={form.currentTg} onChange={(e) => updateField('currentTg', e.target.value)} placeholder={editablePlaceholder('currentTg', 'We need to understand how far you can push your TG level')} /></label>
</div>

<div className="troop-section public-section">
<div className="section-title-row"><span>Troops</span><h3>Do you have T11?</h3></div>
<div className="checkbox-grid">
{T11_OPTIONS.map((option) => (
<label key={option} className="checkbox-item">
<input type="checkbox" checked={form.t11.includes(option)} onChange={() => toggleT11(option)} />
<span>{option}</span>
</label>
))}
</div>
</div>
</Chapter>

<Chapter id="power-fields" title="Power">
<div className="identity-grid">
<label>{editableLabel('mysticTrialStages', 'Current Mystic Trial TOTAL STAGES')}<input inputMode="numeric" value={form.mysticTrialStages} onChange={(e) => updateField('mysticTrialStages', e.target.value)} /></label>
<label>{editableLabel('totalPower', 'Total Power')}<input inputMode="numeric" value={form.totalPower} onChange={(e) => updateField('totalPower', e.target.value)} /></label>
</div>

<div className="troop-section public-section">
<div className="section-title-row"><span>Power</span><h3>Are you willing to reduce your power? (for normal invite power cap)</h3></div>
<div className="radio-group">
{YES_NO.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="willingReducePower" checked={form.willingReducePower === option} onChange={() => updateField('willingReducePower', option)} />
<span>{option}</span>
</label>
))}
</div>
</div>

<div className="identity-grid">
<label>{editableLabel('passesRequired', 'Number of passes required for you to transfer to 710')}<input inputMode="numeric" value={form.passesRequired} onChange={(e) => updateField('passesRequired', e.target.value)} /></label>
<label>{editableLabel('currentPasses', 'Your current number of transfer passes')}<input inputMode="numeric" value={form.currentPasses} onChange={(e) => updateField('currentPasses', e.target.value)} /></label>
</div>
</Chapter>
</div>
</section>
)}

{step === 3 && (
<section id="commitment" className="petition-act">
<header className="petition-act-head">
<span className="petition-act-num k-display">IV</span>
<h2 className="petition-act-title k-display" tabIndex={-1}>The Oath</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<div className="petition-act-body">
<Chapter id="commitment-fields" title="Commitment">
<div className="troop-section public-section">
<div className="section-title-row"><span>Commitment</span><h3>Are you able to actively commit to game, and participate in alliance events?</h3></div>
<div className="radio-group">
{YES_NO.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="activeCommit" checked={form.activeCommit === option} onChange={() => updateField('activeCommit', option)} />
<span>{option}</span>
</label>
))}
</div>
</div>

<div className="troop-section public-section">
<div className="section-title-row"><span>Commitment</span><h3>Are you willing to save resources for kvk prep, doing only minimal rewards on sub-events?</h3></div>
<div className="radio-group">
{YES_NO.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="willingSaveResources" checked={form.willingSaveResources === option} onChange={() => updateField('willingSaveResources', option)} />
<span>{option}</span>
</label>
))}
</div>
</div>

<div className="troop-section public-section">
<div className="section-title-row"><span>Commitment</span><h3>Do you participate in Sanctuaries, Castle and KVK battles?</h3></div>
<div className="radio-group">
{YES_NO.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="participatesBattles" checked={form.participatesBattles === option} onChange={() => updateField('participatesBattles', option)} />
<span>{option}</span>
</label>
))}
</div>
</div>
</Chapter>

<Chapter id="spending-fields" title="Spending">
<div className="troop-section public-section">
<div className="section-title-row"><span>Spending</span><h3>Your spending archetype</h3></div>
<div className="radio-group">
{SPENDING_OPTIONS.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="spendingArchetype" checked={form.spendingArchetype === option} onChange={() => updateField('spendingArchetype', option)} />
<span>{option}</span>
</label>
))}
</div>
</div>
</Chapter>

<Chapter id="language-fields" title="Language">
<div className="troop-section public-section">
<div className="section-title-row"><span>Language</span><h3>Main language of communication in-game</h3></div>
<div className="radio-group">
<label className="radio-option">
<input type="radio" name="mainLanguage" checked={form.mainLanguage === 'English'} onChange={() => updateField('mainLanguage', 'English')} />
<span>English</span>
</label>
<label className="radio-option">
<input type="radio" name="mainLanguage" checked={form.mainLanguage === 'Other'} onChange={() => updateField('mainLanguage', 'Other')} />
<span>Other</span>
</label>
</div>
{form.mainLanguage === 'Other' && (
<input placeholder="Please specify" value={form.mainLanguageOther} onChange={(e) => updateField('mainLanguageOther', e.target.value)} />
)}
</div>
</Chapter>
</div>
</section>
)}

{step === 4 && (
<section id="battle-report" className="petition-act">
<header className="petition-act-head">
<span className="petition-act-num k-display">V</span>
<h2 className="petition-act-title k-display" tabIndex={-1}>Proof</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<div className="petition-act-body">
<Chapter id="proof-fields" title="Battle report">
<div className="troop-section public-section">
<div className="section-title-row"><span>Screenshots</span><h3>Upload your most recent battle report</h3><p>Should show your in-game name, Gov Gears/charms, Hero Gears and Masters.</p></div>
<input
  id="battle-report-upload"
  ref={screenshotInput}
  type="file"
  multiple
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
  aria-label="Upload battle report screenshots"
  aria-describedby="battle-report-upload-help"
  disabled={processingImages || loading}
  onChange={handleScreenshotChange}
/>
<p id="battle-report-upload-help" className="file-hint">
  {processingImages
    ? 'Compressing images…'
    : screenshots.length > 0
      ? `${screenshots.length} screenshot${screenshots.length === 1 ? '' : 's'} ready · JPG, PNG, WebP, HEIC, and HEIF supported`
      : 'Up to 4 screenshots · 12 MB each · JPG, PNG, WebP, HEIC, or HEIF'}
</p>
</div>
</Chapter>
</div>
</section>
)}

{status && (
  <div className={isError ? 'status error' : 'status'} role="alert" aria-live="assertive">
    {status}
  </div>
)}

<div className="petition-step-nav">
  <span className="petition-step-count k-mark">Step {step + 1} of {ACTS.length}</span>
  <div className="petition-step-actions">
    {step > 0 && (
      <button type="button" className="k-btn k-btn-quiet" onClick={goBack}>Back</button>
    )}
    {isFinalStep ? (
      <button type="submit" className="k-btn k-btn-struck" disabled={loading || processingImages || (activePeriodLoaded && !activePeriod)}>{processingImages ? 'Preparing images…' : loading ? 'Submitting...' : 'Submit Petition'}</button>
    ) : (
      <button type="button" className="k-btn" onClick={goNext}>Continue</button>
    )}
  </div>
</div>
</form>
</>
);
}

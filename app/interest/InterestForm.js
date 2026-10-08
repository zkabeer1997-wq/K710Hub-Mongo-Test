'use client';

import { useEffect, useRef, useState } from 'react';
import SealedPetition from '../../components/kingdom/world/SealedPetition';
import { processInterestImages } from './processInterestImages';
import { useFormFieldMeta } from '../../lib/useFormFieldMeta';
import FormErrorSummary from '../../components/FormErrorSummary';
import { useWizardUrlStep } from '../../lib/useWizardUrlStep';
import { draftKey, firstInvalidStep, mergeDraft, parseDraft, serializeDraft } from '../../lib/wizardState.mjs';

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
  { id: 'identity', num: 'I', label: 'Your account', sub: 'Step 1 · Your account', required: ['inGameName', 'playerId', 'discordUsername', 'currentServer', 'currentAlliance'] },
  { id: 'intake', num: 'II', label: 'Your move', sub: 'Step 2 · Transfer details', required: ['migrateAlliance'] },
  { id: 'troops', num: 'III', label: 'Your power', sub: 'Step 3 · Your power and troops', required: ['highestTroopLevel', 'currentTg', 'mysticTrialStages', 'totalPower'], requiresT11: true },
  { id: 'commitment', num: 'IV', label: 'Your promise', sub: 'Step 4 · Your commitment', required: ['activeCommit', 'willingSaveResources', 'participatesBattles', 'spendingArchetype', 'mainLanguage'] },
  { id: 'battle-report', num: 'V', label: 'Screenshots', sub: 'Step 5 · Screenshots', requiresScreenshot: true },
  { id: 'review', num: 'VI', label: 'Check and send', sub: 'Step 6 · Check your answers' },
];

function Where({ children }) {
  return (
    <details className="where-help">
      <summary>Where do I find this?</summary>
      <p>{children}</p>
    </details>
  );
}

function Thumb({ file, index, onRemove }) {
  const [url, setUrl] = useState('');
  useEffect(() => {
    const u = URL.createObjectURL(file);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [file]);
  return (
    <li className="shot-item">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt={`Screenshot ${index + 1} preview`} />}
      <span>Screenshot {index + 1}</span>
      <button type="button" className="k-btn k-btn-quiet" onClick={() => onRemove(index)}>Remove</button>
    </li>
  );
}

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

// Pure per-step validation: returns [{ id, key, message }] (ids are the DOM
// anchors of the offending field, see gp() in the component).
function computeErrors(index, form, screenshots, label) {
  const act = ACTS[index];
  const found = [];
  for (const key of act.required || []) {
    if (!String(form[key] || '').trim()) found.push({ id: `f-${key}`, key, message: `Please fill in “${label(key)}”. It is needed to continue.` });
  }
  for (const key of NUMERIC_FIELDS) {
    const inAct = (index === 2 && ['currentTg', 'mysticTrialStages', 'totalPower', 'passesRequired', 'currentPasses'].includes(key));
    if (inAct && form[key] && !isNumericValue(form[key]) && !found.some((f) => f.key === key)) {
      found.push({ id: `f-${key}`, key, message: `Please use numbers only for “${label(key)}”, for example 12345. Do not type letters or commas.` });
    }
  }
  if (act.id === 'intake' && form.migrateAlliance === 'Other' && !form.migrateAllianceOther.trim()) {
    found.push({ id: 'f-migrateAllianceOther', key: 'migrateAllianceOther', message: 'Please type the name of the alliance you want to join.' });
  }
  if (act.id === 'commitment' && form.mainLanguage === 'Other' && !form.mainLanguageOther.trim()) {
    found.push({ id: 'f-mainLanguageOther', key: 'mainLanguageOther', message: 'Please specify your main language.' });
  }
  if (act.requiresT11 && form.t11.length === 0) {
    found.push({ id: 'f-t11', key: 't11', message: 'Select at least one T11 option.' });
  }
  if (act.requiresScreenshot && screenshots.length === 0) {
    found.push({ id: 'f-screenshots', key: 'screenshots', message: 'Upload at least one screenshot.' });
  }
  return found;
}

const DRAFT_KEY = draftKey('interest');

export default function InterestForm() {
const [form, setForm] = useState(initialForm);
const [screenshots, setScreenshots] = useState([]);
const [processingImages, setProcessingImages] = useState(false);
const [status, setStatus] = useState('');
const [isError, setIsError] = useState(false);
const [loading, setLoading] = useState(false);
const [sealed, setSealed] = useState(false);
const [reducedMotion, setReducedMotion] = useState(false);
const [errors, setErrors] = useState([]);
const [errorSignal, setErrorSignal] = useState(0);
const formRef = useRef(initialForm);
const screenshotsRef = useRef([]);
const labelRef = useRef((key) => FIELD_LABELS[key] || key);
const { step, setStep, initFromUrl } = useWizardUrlStep(ACTS.length, () => {
  const bad = firstInvalidStep(ACTS.length, (i) => computeErrors(i, formRef.current, screenshotsRef.current, labelRef.current));
  return bad < 0 ? ACTS.length - 1 : bad;
});
const draftReady = useRef(false);
const suppressFocus = useRef(false);
const [confirmedInfo, setConfirmedInfo] = useState({});
const [activePeriod, setActivePeriod] = useState(null);
const [activePeriodLoaded, setActivePeriodLoaded] = useState(false);
const { fields: editableFields } = useFormFieldMeta('interest');
const editableLabel = (key, fallback) => editableFields.find((f) => f.key === key)?.label || fallback;
const labelFor = (key) => editableLabel(key, FIELD_LABELS[key] || key);
useEffect(() => {
  labelRef.current = labelFor;
  formRef.current = form;
  screenshotsRef.current = screenshots;
});
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

// Restore the local draft (never PINs/passwords/files - see lib/wizardState)
// and then the ?step= value, limited to the first step that fails validation.
useEffect(() => {
  try {
    const restored = mergeDraft(initialForm, parseDraft(window.localStorage.getItem(DRAFT_KEY)));
    restored.website = '';
    formRef.current = restored;
    setForm(restored);
  } catch { /* storage unavailable */ }
  // A deep-linked step shouldn't steal focus on first paint.
  if (initFromUrl() > 0) suppressFocus.current = true;
  draftReady.current = true;
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);

// Save the draft (debounced) once the initial restore has happened.
useEffect(() => {
  if (!draftReady.current || sealed) return undefined;
  const t = setTimeout(() => {
    try {
      const { website, ...rest } = form; // honeypot is never stored
      void website;
      window.localStorage.setItem(DRAFT_KEY, serializeDraft(rest));
    } catch { /* ignore */ }
  }, 400);
  return () => clearTimeout(t);
}, [form, sealed]);

const prevStep = useRef(step);
useEffect(() => {
  // Don't hijack scroll/focus on first paint - only when the step changes.
  if (prevStep.current === step) return;
  prevStep.current = step;
  if (suppressFocus.current) { suppressFocus.current = false; return; }
  // Move focus to the new step's heading so keyboard/screen-reader users
  // perceive the step change. preventScroll + a manual scroll only when the
  // heading is out of view, so the page never jumps past the hero.
  const heading = document.getElementById(ACTS[step].id)?.querySelector('.petition-act-title');
  if (!heading) return;
  heading.focus({ preventScroll: true });
  const top = heading.getBoundingClientRect().top;
  if (top < 80 || top > window.innerHeight * 0.7) {
    window.scrollTo({ top: Math.max(0, window.scrollY + top - 96), behavior: reducedMotion ? 'auto' : 'smooth' });
  }
}, [step, reducedMotion]);

function updateField(key, value) {
setForm((current) => ({ ...current, [key]: value }));
setErrors((current) => (current.some((e) => e.key === key) ? current.filter((e) => e.key !== key) : current));
}

// Field a11y wiring: id doubles as the error-summary anchor; aria-invalid and
// aria-describedby point at the inline message rendered by fe().
const errorFor = (key) => errors.find((e) => e.key === key);
const gp = (key) => {
  const err = errorFor(key);
  return { id: `f-${key}`, 'aria-invalid': err ? 'true' : undefined, 'aria-describedby': err ? `f-${key}-error` : undefined };
};
const fe = (key) => {
  const err = errorFor(key);
  return err ? <p id={`f-${key}-error`} className="field-error">{err.message}</p> : null;
};

function toggleT11(option) {
setForm((current) => {
const has = current.t11.includes(option);
return { ...current, t11: has ? current.t11.filter((o) => o !== option) : [...current.t11, option] };
});
setErrors((current) => current.filter((e) => e.key !== 't11'));
}



function validateStep(index) {
  const found = computeErrors(index, form, screenshots, (key) => editableLabel(key, FIELD_LABELS[key] || key));
  setErrors(found);
  if (found.length) {
    setIsError(false);
    setStatus('');
    setErrorSignal((n) => n + 1);
    return false;
  }
  setIsError(false);
  setStatus('');
  return true;
}

function goNext() {
  if (!validateStep(step)) return;
  setStep(step + 1);
}

function goBack() {
  setIsError(false);
  setStatus('');
  setErrors([]);
  setStep(step - 1);
}

async function handleScreenshotChange(event) {
  const input = event.currentTarget;
  const files = input.files;
  if (!files || files.length === 0) return;
  setProcessingImages(true);
  setIsError(false);
  setStatus('Preparing your screenshot…');

  try {
    const processed = await processInterestImages(files);
    const merged = [...screenshots, ...processed];
    if (merged.length > 4) {
      setIsError(true);
      setStatus('You can add up to 4 screenshots. Remove one first if you want to add another.');
    } else {
      setScreenshots(merged);
      setErrors((current) => current.filter((e) => e.key !== 'screenshots'));
      setStatus(`${merged.length} screenshot${merged.length === 1 ? '' : 's'} added.`);
    }
  } catch (error) {
    setIsError(true);
    setStatus(error instanceof Error ? error.message : 'That screenshot could not be prepared. Please try a different picture.');
  } finally {
    input.value = '';
    setProcessingImages(false);
  }
}

function removeScreenshot(index) {
  setScreenshots((current) => current.filter((_, i) => i !== index));
  setIsError(false);
  setStatus('Screenshot removed.');
}

async function handleSubmit(e) {
e.preventDefault();
// Only the last step ("Check and send") may submit. Anything else (Enter in a
// text field, a re-used DOM button) just moves to the next step.
if (step !== ACTS.length - 1) { goNext(); return; }
if (loading) return;
const bad = firstInvalidStep(ACTS.length + 1, (i) => computeErrors(Math.min(i, ACTS.length - 1), form, screenshots, labelRef.current));
if (bad !== -1 && bad < step) { setStep(bad); setErrors(computeErrors(bad, form, screenshots, labelRef.current)); setErrorSignal((n) => n + 1); return; }
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
  setStatus('The upload stopped, probably because of the internet connection. Your answers are saved on this device. Press Submit again to retry.');
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
setErrors([]);
try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
if (screenshotInput.current) screenshotInput.current.value = '';
setStep(0, { replace: true });
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
      title={a.sub}
      onClick={() => {
        if (i <= step) { setErrors([]); setStep(i); return; }
        const bad = firstInvalidStep(ACTS.length, (n) => computeErrors(n, form, screenshots, labelRef.current));
        if (bad === -1 || bad >= i) { setErrors([]); setStep(i); return; }
        if (bad === step) { validateStep(step); return; }
        setStep(bad);
        setErrors(computeErrors(bad, form, screenshots, labelRef.current));
        setErrorSignal((n) => n + 1);
      }}
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
<h2 className="petition-act-title k-display" tabIndex={-1}>Your account</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<p className="petition-act-sub">Step 1 · Your account</p>
<div className="petition-act-body">
<Chapter id="identity-fields" title="Identity">
<div className="identity-grid">
<div className="wizard-field"><label>{editableLabel('inGameName', 'In-game name')}<input {...gp('inGameName')} value={form.inGameName} onChange={(e) => updateField('inGameName', e.target.value)} /></label>{fe('inGameName')}</div>
<div className="wizard-field"><label>{editableLabel('playerId', 'Player ID')}<input {...gp('playerId')} value={form.playerId} onChange={(e) => updateField('playerId', e.target.value)} /></label>{fe('playerId')}<Where>Open Kingshot and tap your picture in the top-left corner. Your Player ID is the number shown there.</Where></div>
<div className="wizard-field"><label>{editableLabel('discordUsername', 'Discord username')}<input {...gp('discordUsername')} value={form.discordUsername} onChange={(e) => updateField('discordUsername', e.target.value)} /></label>{fe('discordUsername')}<Where>Open Discord and look under your picture at the bottom-left. Your username is the name written there, for example name or name#1234.</Where></div>
<div className="wizard-field"><label>{editableLabel('currentServer', 'Your current server (prior to transfer)')}<input {...gp('currentServer')} value={form.currentServer} onChange={(e) => updateField('currentServer', e.target.value)} /></label>{fe('currentServer')}</div>
<div className="wizard-field"><label>{editableLabel('currentAlliance', 'Your current alliance (prior to transfer)')}<input {...gp('currentAlliance')} value={form.currentAlliance} onChange={(e) => updateField('currentAlliance', e.target.value)} /></label>{fe('currentAlliance')}</div>
</div>
</Chapter>
</div>
</section>
)}

{step === 1 && (
<section id="intake" className="petition-act">
<header className="petition-act-head">
<span className="petition-act-num k-display">II</span>
<h2 className="petition-act-title k-display" tabIndex={-1}>Your move</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<p className="petition-act-sub">Step 2 · Transfer details</p>
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
<div className="radio-group" role="radiogroup" aria-label={labelFor('migrateAlliance')} {...gp('migrateAlliance')}>
{MIGRATE_OPTIONS.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="migrateAlliance" checked={form.migrateAlliance === option} onChange={() => updateField('migrateAlliance', option)} />
<span>{option}</span>
</label>
))}
</div>
{fe('migrateAlliance')}
{form.migrateAlliance === 'Other' && (
<><input {...gp('migrateAllianceOther')} aria-label="Please specify" placeholder="Please specify" value={form.migrateAllianceOther} onChange={(e) => updateField('migrateAllianceOther', e.target.value)} />{fe('migrateAllianceOther')}</>
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
<h2 className="petition-act-title k-display" tabIndex={-1}>Your power</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<p className="petition-act-sub">Step 3 · Your power and troops</p>
<div className="petition-act-body">
<Chapter id="troops-fields" title="Troops">
<div className="troop-section public-section">
<div className="section-title-row"><span>Troops</span><h3>Current highest troop level (not TC)</h3></div>
<div className="radio-group" role="radiogroup" aria-label={labelFor('highestTroopLevel')} {...gp('highestTroopLevel')}>
{TROOP_LEVEL_OPTIONS.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="highestTroopLevel" checked={form.highestTroopLevel === option} onChange={() => updateField('highestTroopLevel', option)} />
<span>{option}</span>
</label>
))}
</div>
{fe('highestTroopLevel')}
</div>

<div className="identity-grid">
<div className="wizard-field"><label>{editableLabel('currentTg', 'Current amount of TG')}<input {...gp('currentTg')} inputMode="numeric" value={form.currentTg} onChange={(e) => updateField('currentTg', e.target.value)} placeholder={editablePlaceholder('currentTg', 'We need to understand how far you can push your TG level')} /></label>{fe('currentTg')}<Where>TG means Troop Grade, the upgrade level of your troops. Look at your troop camps in the game, or ask your alliance leader.</Where></div>
</div>

<div className="troop-section public-section">
<div className="section-title-row"><span>Troops</span><h3>Do you have T11?</h3></div>
<div className="checkbox-grid" role="group" aria-label="T11 troop types" {...gp('t11')}>
{T11_OPTIONS.map((option) => (
<label key={option} className="checkbox-item">
<input type="checkbox" checked={form.t11.includes(option)} onChange={() => toggleT11(option)} />
<span>{option}</span>
</label>
))}
</div>
{fe('t11')}
</div>
</Chapter>

<Chapter id="power-fields" title="Power">
<div className="identity-grid">
<div className="wizard-field"><label>{editableLabel('mysticTrialStages', 'Current Mystic Trial TOTAL STAGES')}<input {...gp('mysticTrialStages')} inputMode="numeric" value={form.mysticTrialStages} onChange={(e) => updateField('mysticTrialStages', e.target.value)} /></label>{fe('mysticTrialStages')}</div>
<div className="wizard-field"><label>{editableLabel('totalPower', 'Total Power')}<input {...gp('totalPower')} inputMode="numeric" value={form.totalPower} onChange={(e) => updateField('totalPower', e.target.value)} /></label>{fe('totalPower')}<Where>In Kingshot tap your picture in the top-left corner. Your Power is the big number on your profile. Type it with digits only, for example 12345678.</Where></div>
</div>

<div className="troop-section public-section">
<div className="section-title-row"><span>Power</span><h3>Are you willing to reduce your power? (for normal invite power cap)</h3></div>
<div className="radio-group" role="radiogroup" aria-label={labelFor('willingReducePower')} {...gp('willingReducePower')}>
{YES_NO.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="willingReducePower" checked={form.willingReducePower === option} onChange={() => updateField('willingReducePower', option)} />
<span>{option}</span>
</label>
))}
</div>
{fe('willingReducePower')}
</div>

<div className="identity-grid">
<div className="wizard-field"><label>{editableLabel('passesRequired', 'Number of passes required for you to transfer to 710')}<input {...gp('passesRequired')} inputMode="numeric" value={form.passesRequired} onChange={(e) => updateField('passesRequired', e.target.value)} /></label>{fe('passesRequired')}</div>
<div className="wizard-field"><label>{editableLabel('currentPasses', 'Your current number of transfer passes')}<input {...gp('currentPasses')} inputMode="numeric" value={form.currentPasses} onChange={(e) => updateField('currentPasses', e.target.value)} /></label>{fe('currentPasses')}</div>
</div>
</Chapter>
</div>
</section>
)}

{step === 3 && (
<section id="commitment" className="petition-act">
<header className="petition-act-head">
<span className="petition-act-num k-display">IV</span>
<h2 className="petition-act-title k-display" tabIndex={-1}>Your promise</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<p className="petition-act-sub">Step 4 · Your commitment</p>
<div className="petition-act-body">
<Chapter id="commitment-fields" title="Commitment">
<div className="troop-section public-section">
<div className="section-title-row"><span>Commitment</span><h3>Are you able to actively commit to game, and participate in alliance events?</h3></div>
<div className="radio-group" role="radiogroup" aria-label={labelFor('activeCommit')} {...gp('activeCommit')}>
{YES_NO.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="activeCommit" checked={form.activeCommit === option} onChange={() => updateField('activeCommit', option)} />
<span>{option}</span>
</label>
))}
</div>
{fe('activeCommit')}
</div>

<div className="troop-section public-section">
<div className="section-title-row"><span>Commitment</span><h3>Are you willing to save resources for kvk prep, doing only minimal rewards on sub-events?</h3></div>
<div className="radio-group" role="radiogroup" aria-label={labelFor('willingSaveResources')} {...gp('willingSaveResources')}>
{YES_NO.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="willingSaveResources" checked={form.willingSaveResources === option} onChange={() => updateField('willingSaveResources', option)} />
<span>{option}</span>
</label>
))}
</div>
{fe('willingSaveResources')}
</div>

<div className="troop-section public-section">
<div className="section-title-row"><span>Commitment</span><h3>Do you participate in Sanctuaries, Castle and KVK battles?</h3></div>
<div className="radio-group" role="radiogroup" aria-label={labelFor('participatesBattles')} {...gp('participatesBattles')}>
{YES_NO.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="participatesBattles" checked={form.participatesBattles === option} onChange={() => updateField('participatesBattles', option)} />
<span>{option}</span>
</label>
))}
</div>
{fe('participatesBattles')}
</div>
</Chapter>

<Chapter id="spending-fields" title="Spending">
<div className="troop-section public-section">
<div className="section-title-row"><span>Spending</span><h3>Your spending archetype</h3></div>
<div className="radio-group" role="radiogroup" aria-label={labelFor('spendingArchetype')} {...gp('spendingArchetype')}>
{SPENDING_OPTIONS.map((option) => (
<label key={option} className="radio-option">
<input type="radio" name="spendingArchetype" checked={form.spendingArchetype === option} onChange={() => updateField('spendingArchetype', option)} />
<span>{option}</span>
</label>
))}
</div>
{fe('spendingArchetype')}
</div>
</Chapter>

<Chapter id="language-fields" title="Language">
<div className="troop-section public-section">
<div className="section-title-row"><span>Language</span><h3>Main language of communication in-game</h3></div>
<div className="radio-group" role="radiogroup" aria-label={labelFor('mainLanguage')} {...gp('mainLanguage')}>
<label className="radio-option">
<input type="radio" name="mainLanguage" checked={form.mainLanguage === 'English'} onChange={() => updateField('mainLanguage', 'English')} />
<span>English</span>
</label>
<label className="radio-option">
<input type="radio" name="mainLanguage" checked={form.mainLanguage === 'Other'} onChange={() => updateField('mainLanguage', 'Other')} />
<span>Other</span>
</label>
</div>
{fe('mainLanguage')}
{form.mainLanguage === 'Other' && (
<><input {...gp('mainLanguageOther')} aria-label="Please specify" placeholder="Please specify" value={form.mainLanguageOther} onChange={(e) => updateField('mainLanguageOther', e.target.value)} />{fe('mainLanguageOther')}</>
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
<h2 className="petition-act-title k-display" tabIndex={-1}>Screenshots</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<p className="petition-act-sub">Step 5 · Screenshots</p>
<div className="petition-act-body">
<Chapter id="proof-fields" title="Battle report">
<div className="troop-section public-section">
<div className="section-title-row"><span>Screenshots</span><h3>Upload your most recent battle report</h3><p>Should show your in-game name, Gov Gears/charms, Hero Gears and Masters.</p></div>
<input
  {...gp('screenshots')}
  ref={screenshotInput}
  type="file"
  accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif"
  aria-label="Add a screenshot"
  aria-describedby={errorFor('screenshots') ? 'f-screenshots-error battle-report-upload-help' : 'battle-report-upload-help'}
  disabled={processingImages || loading}
  onChange={handleScreenshotChange}
/>
<p id="battle-report-upload-help" className="file-hint">
  {processingImages
    ? 'Compressing images…'
    : screenshots.length > 0
      ? 'Added. You can add another one (up to 4), or press Continue.'
      : 'Add one screenshot at a time, up to 4. Pictures from your phone gallery work.'}
</p>
{screenshots.length > 0 && (
  <ul className="shot-list" aria-label="Your screenshots">
    {screenshots.map((file, i) => (
      <Thumb key={`${file.name}-${file.size}-${i}`} file={file} index={i} onRemove={removeScreenshot} />
    ))}
  </ul>
)}
{fe('screenshots')}
</div>
</Chapter>
</div>
</section>
)}

{step === 5 && (
<section id="review" className="petition-act">
<header className="petition-act-head">
<span className="petition-act-num k-display">VI</span>
<h2 className="petition-act-title k-display" tabIndex={-1}>Check your answers</h2>
<span className="petition-act-rule" aria-hidden="true" />
</header>
<p className="petition-act-sub">Step 6 · Look everything over, then press “Send my application”.</p>
<div className="petition-act-body review-groups">
<p className="review-once-note"><strong>Send this only once.</strong> If you already applied, do not send it again. Use “Check my application” instead.</p>
{[
  { stepIndex: 0, title: 'Your account', rows: [['In-game name', form.inGameName], ['Player ID', form.playerId], ['Discord username', form.discordUsername], ['Current server', form.currentServer], ['Current alliance', form.currentAlliance]] },
  { stepIndex: 1, title: 'Your move', rows: [['Alliance you want to join', form.migrateAlliance === 'Other' ? `Other: ${form.migrateAllianceOther}` : form.migrateAlliance]] },
  { stepIndex: 2, title: 'Your power', rows: [['Highest troop level', form.highestTroopLevel], ['Current TG', form.currentTg], ['Mystic Trial stages', form.mysticTrialStages], ['Total power', form.totalPower]] },
  { stepIndex: 3, title: 'Your promise', rows: [['Active commitment', form.activeCommit], ['Willing to save resources', form.willingSaveResources], ['Takes part in battles', form.participatesBattles], ['Spending style', form.spendingArchetype], ['Main language', form.mainLanguage === 'Other' ? `Other: ${form.mainLanguageOther}` : form.mainLanguage]] },
  { stepIndex: 4, title: 'Screenshots', rows: [['Screenshots added', String(screenshots.length)]] },
].map((group) => (
  <section key={group.title} className="review-group" aria-labelledby={`review-${group.stepIndex}`}>
    <div className="review-group-head">
      <h3 id={`review-${group.stepIndex}`}>{group.title}</h3>
      <button type="button" className="k-btn k-btn-quiet" onClick={() => { setErrors([]); setStep(group.stepIndex); }}>Change</button>
    </div>
    <dl>
      {group.rows.map(([k, v]) => (
        <div key={k}><dt>{k}</dt><dd>{String(v || '').trim() || 'Not answered'}</dd></div>
      ))}
    </dl>
  </section>
))}
</div>
</section>
)}

<FormErrorSummary errors={errors} focusSignal={errorSignal} />
{status && (
  <div className={isError ? 'status error' : 'status'} role={isError ? 'alert' : 'status'} aria-live={isError ? 'assertive' : 'polite'}>
    {status}
  </div>
)}

<div className="petition-step-nav">
  <span className="petition-step-count k-mark">
    Step {step + 1} of {ACTS.length}
    <small className="petition-saved-note">Your answers are saved on this device. You can close this page and come back.</small>
  </span>
  <div className="petition-step-actions">
    {step > 0 && (
      <button type="button" className="k-btn k-btn-quiet" onClick={goBack}>Back</button>
    )}
    {isFinalStep ? (
      <button key="send" type="submit" className="k-btn k-btn-struck" disabled={loading || processingImages || (activePeriodLoaded && !activePeriod)}>{processingImages ? 'Preparing images…' : loading ? 'Sending…' : 'Send my application'}</button>
    ) : (
      <button key="continue" type="button" className="k-btn" onClick={(e) => { e.preventDefault(); goNext(); }}>Continue</button>
    )}
  </div>
</div>
</form>
</>
);
}

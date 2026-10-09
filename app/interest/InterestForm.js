'use client';

import { useEffect, useRef, useState } from 'react';
import './apply.css';
import SealedPetition from '../../components/kingdom/world/SealedPetition';
import Term from '../../components/ui/Term';
import { processInterestImages } from './processInterestImages';
import { useFormFieldMeta } from '../../lib/useFormFieldMeta';
import FormErrorSummary from '../../components/FormErrorSummary';
import { useWizardUrlStep } from '../../lib/useWizardUrlStep';
import { draftKey, firstInvalidStep, mergeDraft, parseDraft, serializeDraft } from '../../lib/wizardState.mjs';
import { INTEREST_UPLOAD_LIMITS, isHeicFile, validateProcessedInterestFiles } from '../../lib/interestUploadLimits.mjs';
import {
  describeAge,
  draftFilledCount,
  formatFileSize,
  normalizeDiscordUsername,
  normalizeNumericAnswer,
  NUMBER_INPUT_MAX_LENGTH,
  normalizePlayerId,
  numberPreview,
  parseNumberInput,
  playerIdHint,
  readDraftSavedAt,
  shouldOfferResume,
  validateNumericAnswer,
} from '../../lib/interestForm.mjs';

// Values are what leadership receives in the Inbox - keep the strings stable.
// `label`/`hint` are only what the applicant reads.
const MIGRATE_OPTIONS = [
  { value: '710 (Bear 0200UTC and 1300UTC)', label: '710', hint: 'Bear Hunt at 02:00 and 13:00 UTC' },
  { value: 'RED (Bear 1105UTC, 1900UTC and 2320UTC)', label: 'RED', hint: 'Bear Hunt at 11:05, 19:00 and 23:20 UTC' },
  { value: 'SKY (Bear 1200UTC and 2000UTC)', label: 'SKY', hint: 'Bear Hunt at 12:00 and 20:00 UTC' },
  { value: 'Other', label: 'Another alliance', hint: 'You will type its name' },
];
const TROOP_LEVEL_OPTIONS = ['TG8', 'TG7', 'TG6', 'TG5', 'Below TG5'].map((v) => ({ value: v, label: v }));
const T11_OPTIONS = [
  { value: 'Infantry', label: 'Infantry' },
  { value: 'Cavalry', label: 'Cavalry' },
  { value: 'Archer', label: 'Archer' },
  { value: 'No T11', label: 'I do not have T11' },
];
const YES_NO = [{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }];
const SPENDING_OPTIONS = [
  { value: 'P2W Whale (spending like a KS shareholder)', label: 'Very high spender', hint: 'P2W Whale: spends like a KS shareholder' },
  { value: 'P2W Dolphin (between $1000-$2000 monthly)', label: 'High spender', hint: 'P2W Dolphin: about $1000 to $2000 a month' },
  { value: 'P2W Tadpole (upto $1000 monthly)', label: 'Medium spender', hint: 'P2W Tadpole: up to $1000 a month' },
  { value: 'Occasional spending (less than $100 monthly)', label: 'Small spender', hint: 'Less than $100 a month' },
  { value: 'F2P (pure skills, always on)', label: 'Free to play', hint: 'F2P: no spending, always online' },
];
const LANGUAGE_OPTIONS = [{ value: 'English', label: 'English' }, { value: 'Other', label: 'Another language', hint: 'You will type it' }];

// One question group per screen, same data leadership already screens on.
// `fields` lists every key validated on that step.
const ACTS = [
  { id: 'identity', label: 'Your account', short: 'Account', fields: ['inGameName', 'playerId', 'discordUsername', 'currentServer', 'currentAlliance'] },
  { id: 'intake', label: 'Your move', short: 'Move', fields: ['migrateAlliance', 'migrateAllianceOther'] },
  { id: 'troops', label: 'Your power', short: 'Power', fields: ['highestTroopLevel', 'currentTg', 't11', 'mysticTrialStages', 'totalPower', 'willingReducePower', 'passesRequired', 'currentPasses'] },
  { id: 'commitment', label: 'Your play style', short: 'Play style', fields: ['activeCommit', 'willingSaveResources', 'participatesBattles', 'spendingArchetype', 'mainLanguage', 'mainLanguageOther'] },
  { id: 'battle-report', label: 'Screenshots', short: 'Pictures', fields: ['screenshots'] },
  { id: 'review', label: 'Check and send', short: 'Send', fields: [] },
];

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
  // Honeypot - a real applicant never sees or fills this field.
  website: '',
};

const DEFAULT_LABELS = {
  inGameName: 'Your in-game name',
  playerId: 'Player ID',
  discordUsername: 'Discord username',
  currentServer: 'Your current server number',
  currentAlliance: 'Your current alliance',
  currentTg: 'How much TrueGold (TG) do you have now?',
  mysticTrialStages: 'Mystic Trial: total stages cleared',
  totalPower: 'Total power',
  passesRequired: 'Transfer passes you need',
  currentPasses: 'Transfer passes you have now',
};

const REQUIRED_MESSAGES = {
  inGameName: 'Please type your in-game name.',
  playerId: 'Please type your Player ID. It is a number.',
  discordUsername: 'Please type your Discord username so we can reach you.',
  currentServer: 'Please type the number of your current server.',
  currentAlliance: 'Please type your current alliance. If you have none, type “None”.',
  migrateAlliance: 'Please choose the alliance you want to join.',
  highestTroopLevel: 'Please choose your highest troop level.',
  currentTg: 'Please type how much TrueGold you have. If none, type 0.',
  mysticTrialStages: 'Please type your Mystic Trial stages. If none, type 0.',
  totalPower: 'Please type your total power, for example 12,345,678.',
  activeCommit: 'Please answer Yes or No.',
  willingSaveResources: 'Please answer Yes or No.',
  participatesBattles: 'Please answer Yes or No.',
  spendingArchetype: 'Please choose the answer closest to you.',
  mainLanguage: 'Please choose your main language.',
  willingReducePower: 'Please answer Yes or No.',
  passesRequired: 'Please type how many transfer passes you need. If you are not sure, type 0.',
  currentPasses: 'Please type how many transfer passes you have. If none, type 0.',
};
// UI key -> stored field name that carries the numeric limits (lib/interestForm.mjs).
const NUMERIC_FIELD = { currentServer: 'current_server', currentTg: 'current_tg', mysticTrialStages: 'mystic_trial_stages', totalPower: 'total_power', passesRequired: 'passes_required', currentPasses: 'current_passes' };
const NUMERIC_KEYS = ['currentServer', 'currentTg', 'mysticTrialStages', 'totalPower', 'passesRequired', 'currentPasses'];
const REQUIRED_TEXT = ['inGameName', 'playerId', 'discordUsername', 'currentServer', 'currentAlliance', 'migrateAlliance', 'highestTroopLevel', 'currentTg', 'mysticTrialStages', 'totalPower', 'willingReducePower', 'passesRequired', 'currentPasses', 'activeCommit', 'willingSaveResources', 'participatesBattles', 'spendingArchetype', 'mainLanguage'];

// Pure per-field validation: returns a message or ''.
function fieldError(key, form, screenshots) {
  const value = String(form[key] ?? '').trim();
  if (key === 't11') return form.t11.length === 0 ? 'Please pick at least one, or “I do not have T11”.' : '';
  if (key === 'screenshots') return screenshots.length === 0 ? 'Please add at least one screenshot.' : '';
  if (key === 'migrateAllianceOther') return form.migrateAlliance === 'Other' && !value ? 'Please type the name of the alliance you want to join.' : '';
  if (key === 'mainLanguageOther') return form.mainLanguage === 'Other' && !value ? 'Please type your main language.' : '';
  if (key === 'playerId') {
    if (!value) return REQUIRED_MESSAGES.playerId;
    return normalizePlayerId(value) ? '' : 'A Player ID only has numbers. Please check it.';
  }
  if (REQUIRED_TEXT.includes(key) && !value) return REQUIRED_MESSAGES[key];
  if (NUMERIC_KEYS.includes(key)) return validateNumericAnswer(NUMERIC_FIELD[key], value).error;
  return '';
}

function computeErrors(index, form, screenshots) {
  const found = [];
  for (const key of ACTS[index].fields) {
    const message = fieldError(key, form, screenshots);
    if (message) found.push({ id: `f-${key}`, key, message });
  }
  return found;
}

const DRAFT_KEY = draftKey('interest');
const REF_KEY = 'k710-interest-last-ref';

function newRequestId() {
  try { return crypto.randomUUID(); } catch { return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`; }
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
      {url && <img src={url} alt={`Preview of screenshot ${index + 1}`} />}
      <span><strong>Screenshot {index + 1}</strong><small>{formatFileSize(file.size)}</small></span>
      <button type="button" className="k-btn k-btn-quiet" onClick={() => onRemove(index)} aria-label={`Remove screenshot ${index + 1}`}>Remove</button>
    </li>
  );
}

function Where({ children }) {
  return (
    <details className="where-help">
      <summary>Where do I find this?</summary>
      <p>{children}</p>
    </details>
  );
}

// A group of big tappable choice cards (radio or checkbox).
function Choices({ legend, hint, name, options, value, onChange, multiple = false, id, error, errorId, children, tour }) {
  const isOn = (v) => (multiple ? value.includes(v) : value === v);
  return (
    <fieldset className="apply-group" id={id} aria-describedby={error ? errorId : undefined} data-tour={tour}>
      <legend>{legend}</legend>
      {hint && <p className="apply-hint">{hint}</p>}
      <div className={`apply-choices ${options.length <= 2 ? 'is-pair' : ''}`}>
        {options.map((option) => (
          <label key={option.value} className={`apply-choice ${isOn(option.value) ? 'is-on' : ''}`}>
            <input
              type={multiple ? 'checkbox' : 'radio'}
              name={name}
              checked={isOn(option.value)}
              onChange={() => onChange(option.value)}
            />
            <span className="apply-choice-text">
              <strong>{option.label}</strong>
              {option.hint && <small>{option.hint}</small>}
            </span>
          </label>
        ))}
      </div>
      {children}
      {error && <p id={errorId} className="field-error">{error}</p>}
    </fieldset>
  );
}

// Text/number field with persistent label, hint and live feedback. Module
// level so React keeps the same input mounted while typing.
function TextField({ ctx, k, label, hint, mode, type = 'text', placeholder, autoComplete = 'off', live, liveBad = false, maxLength, children, tour }) {
  const { form, updateField, gp, errMsg, fe } = ctx;
  return (
    <div className="wizard-field apply-field" data-tour={tour}>
      <label htmlFor={`f-${k}`}>{label}</label>
      <p id={`f-${k}-hint`} className="apply-hint">{hint}</p>
      <input
        {...gp(k)}
        type={type}
        inputMode={mode}
        enterKeyHint="next"
        autoComplete={autoComplete}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        placeholder={placeholder}
        maxLength={maxLength}
        value={form[k]}
        onChange={(e) => updateField(k, e.target.value)}
      />
      {live && !errMsg(k) && <p className={`apply-live${liveBad ? ' is-bad' : ''}`} aria-live="polite">{live}</p>}
      {fe(k)}
      {children}
    </div>
  );
}

function StepProgress({ step, onJump }) {
  const pct = Math.round(((step + 1) / ACTS.length) * 100);
  return (
    <nav className="apply-progress" aria-label="Application steps" data-tour="interest-progress">
      <p className="apply-progress-label">
        <span>Step {step + 1} of {ACTS.length}</span>
        <strong>{ACTS[step].label}</strong>
      </p>
      <div className="apply-bar" role="progressbar" aria-valuemin={1} aria-valuemax={ACTS.length} aria-valuenow={step + 1} aria-valuetext={`Step ${step + 1} of ${ACTS.length}: ${ACTS[step].label}`}>
        <span style={{ width: `${pct}%` }} />
      </div>
      <ol className="apply-steps">
        {ACTS.map((a, i) => (
          <li key={a.id}>
            <button
              type="button"
              className={`apply-step ${i === step ? 'is-current' : ''} ${i < step ? 'is-done' : ''}`}
              aria-current={i === step ? 'step' : undefined}
              aria-label={`Step ${i + 1}: ${a.label}${i < step ? ' (done)' : ''}`}
              onClick={() => onJump(i)}
            >
              <span className="apply-step-num" aria-hidden="true">{i < step ? '✓' : i + 1}</span>
              <span className="apply-step-name">{a.short}</span>
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function buildSummary(form, screenshots) {
  const other = (v, o) => (v === 'Other' ? `Other: ${o}` : v);
  const rows = [
    ['In-game name', form.inGameName], ['Player ID', form.playerId], ['Discord', form.discordUsername],
    ['Current server', form.currentServer], ['Current alliance', form.currentAlliance],
    ['Alliance I want to join', other(form.migrateAlliance, form.migrateAllianceOther)],
    ['Highest troop level', form.highestTroopLevel], ['TrueGold (TG)', form.currentTg], ['T11', form.t11.join(', ')],
    ['Mystic Trial stages', form.mysticTrialStages], ['Total power', form.totalPower],
    ['Willing to lower power', form.willingReducePower], ['Passes needed', form.passesRequired], ['Passes I have', form.currentPasses],
    ['Active in events', form.activeCommit], ['Saves resources for KvK prep', form.willingSaveResources],
    ['Joins Sanctuary, Castle and KvK battles', form.participatesBattles], ['Spending', form.spendingArchetype],
    ['Main language', other(form.mainLanguage, form.mainLanguageOther)], ['Screenshots', String(screenshots.length)],
  ];
  return `Kingdom 710 transfer application\n${rows.map(([k, v]) => `${k}: ${String(v || '').trim() || '-'}`).join('\n')}`;
}

export default function InterestForm({ initialPeriod }) {
  const [form, setForm] = useState(initialForm);
  const [screenshots, setScreenshots] = useState([]);
  const [processingImages, setProcessingImages] = useState(false);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [errors, setErrors] = useState([]);
  const [errorSignal, setErrorSignal] = useState(0);
  const [pendingDraft, setPendingDraft] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const formRef = useRef(initialForm);
  const screenshotsRef = useRef([]);
  const submittingRef = useRef(false);
  const requestId = useRef(null);
  const { step, setStep, initFromUrl } = useWizardUrlStep(ACTS.length, () => {
    const bad = firstInvalidStep(ACTS.length, (i) => computeErrors(i, formRef.current, screenshotsRef.current));
    return bad < 0 ? ACTS.length - 1 : bad;
  });
  const draftReady = useRef(false);
  const suppressFocus = useRef(false);
  const [confirmedInfo, setConfirmedInfo] = useState({});
  const hasInitial = initialPeriod !== undefined;
  const [activePeriod, setActivePeriod] = useState(hasInitial ? initialPeriod : null);
  const [activePeriodLoaded, setActivePeriodLoaded] = useState(hasInitial);
  const { fields: editableFields } = useFormFieldMeta('interest');
  const editableLabel = (key, fallback) => String(editableFields.find((f) => f.key === key)?.label || fallback).replace(/\s*\(optional\)\s*$/i, '');
  const L = (key) => editableLabel(key, DEFAULT_LABELS[key] || key);
  useEffect(() => {
    formRef.current = form;
    screenshotsRef.current = screenshots;
  });
  const renderedAt = useRef(Date.now());

  useEffect(() => {
    if (hasInitial) return undefined;
    let cancelled = false;
    fetch('/api/intake-periods/active')
      .then((r) => r.json())
      .then((data) => { if (!cancelled) setActivePeriod(data.label || null); })
      .catch(() => { if (!cancelled) setActivePeriod(null); })
      .finally(() => { if (!cancelled) setActivePeriodLoaded(true); });
    return () => { cancelled = true; };
  }, [hasInitial]);

  // Look for a saved draft, but do NOT apply it silently: ask first.
  useEffect(() => {
    let offered = false;
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      const data = parseDraft(raw);
      if (data && shouldOfferResume(data)) {
        setPendingDraft({ data, savedAt: readDraftSavedAt(raw), count: draftFilledCount(data) });
        offered = true;
      }
    } catch { /* storage unavailable */ }
    if (!offered) {
      if (initFromUrl() > 0) suppressFocus.current = true;
      draftReady.current = true;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function resumeDraft() {
    if (!pendingDraft) return;
    const restored = mergeDraft(initialForm, pendingDraft.data);
    restored.website = '';
    formRef.current = restored;
    setForm(restored);
    setPendingDraft(null);
    draftReady.current = true;
    const bad = firstInvalidStep(ACTS.length, (i) => computeErrors(i, restored, []));
    // Pictures are never saved, so a finished draft resumes at the pictures step.
    setStep(bad < 0 ? ACTS.length - 2 : bad, { replace: true });
  }

  function startOver() {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setPendingDraft(null);
    draftReady.current = true;
    setStep(0, { replace: true });
  }

  // Save the draft (debounced) once the resume question has been answered.
  useEffect(() => {
    if (!draftReady.current || done) return undefined;
    const t = setTimeout(() => {
      try {
        const { website, ...rest } = form; // honeypot is never stored
        void website;
        if (draftFilledCount(rest) === 0) return;
        window.localStorage.setItem(DRAFT_KEY, serializeDraft(rest));
      } catch { /* ignore */ }
    }, 400);
    return () => clearTimeout(t);
  }, [form, done, pendingDraft]);

  // Warn before leaving while the upload is in flight.
  useEffect(() => {
    if (!loading) return undefined;
    const warn = (e) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [loading]);

  const prevStep = useRef(step);
  useEffect(() => {
    if (prevStep.current === step) return;
    prevStep.current = step;
    if (suppressFocus.current) { suppressFocus.current = false; return; }
    const heading = document.getElementById(ACTS[step].id)?.querySelector('.apply-title');
    if (!heading) return;
    heading.focus({ preventScroll: true });
    const top = heading.getBoundingClientRect().top;
    if (top < 80 || top > window.innerHeight * 0.7) {
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: Math.max(0, window.scrollY + top - 140), behavior: reduce ? 'auto' : 'smooth' });
    }
  }, [step]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => (current.some((e) => e.key === key) ? current.filter((e) => e.key !== key) : current));
  }

  // Validate one field when the person leaves it (not only on Continue), and
  // tidy what they typed (strip @, spaces, "12.3M" -> 12300000).
  function blurField(key) {
    let value = form[key];
    if (key === 'discordUsername') value = normalizeDiscordUsername(value);
    else if (key === 'playerId') value = normalizePlayerId(value);
    else if (NUMERIC_KEYS.includes(key)) value = normalizeNumericAnswer(value, NUMERIC_FIELD[key]);
    else if (typeof value === 'string') value = value.trim();
    const next = { ...form, [key]: value };
    if (value !== form[key]) setForm(next);
    const message = fieldError(key, next, screenshots);
    setErrors((current) => {
      const rest = current.filter((e) => e.key !== key);
      return message ? [...rest, { id: `f-${key}`, key, message }] : rest;
    });
  }

  const errorFor = (key) => errors.find((e) => e.key === key);
  const errMsg = (key) => errorFor(key)?.message || '';
  const gp = (key) => {
    const err = errorFor(key);
    return { id: `f-${key}`, 'aria-invalid': err ? 'true' : undefined, 'aria-describedby': [err ? `f-${key}-error` : '', `f-${key}-hint`].filter(Boolean).join(' '), onBlur: () => blurField(key) };
  };
  const fe = (key) => {
    const err = errorFor(key);
    return err ? <p id={`f-${key}-error`} className="field-error">{err.message}</p> : null;
  };

  function toggleT11(option) {
    setForm((current) => {
      const has = current.t11.includes(option);
      let next;
      if (has) next = current.t11.filter((o) => o !== option);
      else if (option === 'No T11') next = ['No T11'];
      else next = [...current.t11.filter((o) => o !== 'No T11'), option];
      return { ...current, t11: next };
    });
    setErrors((current) => current.filter((e) => e.key !== 't11'));
  }

  function validateStep(index) {
    const found = computeErrors(index, form, screenshots);
    setErrors(found);
    setIsError(false);
    setStatus('');
    if (found.length) { setErrorSignal((n) => n + 1); return false; }
    return true;
  }

  function goNext() {
    if (processingImages) return;
    if (!validateStep(step)) return;
    setStep(step + 1);
  }

  function goBack() {
    setIsError(false);
    setStatus('');
    setErrors([]);
    setStep(step - 1);
  }

  function jumpTo(i) {
    if (i <= step) { setErrors([]); setStep(i); return; }
    const bad = firstInvalidStep(ACTS.length, (n) => computeErrors(n, form, screenshots));
    if (bad === -1 || bad >= i) { setErrors([]); setStep(i); return; }
    if (bad === step) { validateStep(step); return; }
    setStep(bad);
    setErrors(computeErrors(bad, form, screenshots));
    setErrorSignal((n) => n + 1);
  }

  async function addFiles(fileList) {
    const files = Array.from(fileList || []);
    if (!files.length || processingImages) return;
    const room = INTEREST_UPLOAD_LIMITS.maxFiles - screenshots.length;
    if (room <= 0) {
      setIsError(true);
      setStatus('You already added 4 screenshots. Remove one first to add another.');
      return;
    }
    setProcessingImages(true);
    setIsError(false);
    setStatus(files.some(isHeicFile)
      ? 'Converting your iPhone picture (HEIC). This can take a few seconds…'
      : 'Getting your picture ready…');
    const accepted = [];
    const problems = [];
    const take = files.slice(0, room);
    for (const file of take) {
      try {
        const [processed] = await processInterestImages([file]);
        accepted.push(processed);
      } catch (error) {
        problems.push(error instanceof Error ? error.message : `${file.name} could not be prepared.`);
      }
    }
    if (files.length > room) problems.push(`Only ${INTEREST_UPLOAD_LIMITS.maxFiles} screenshots fit, so ${files.length - room} picture${files.length - room === 1 ? ' was' : 's were'} skipped.`);
    let merged = [...screenshots, ...accepted];
    const sizeError = validateProcessedInterestFiles(merged);
    if (sizeError) { problems.push(sizeError); merged = screenshots; }
    if (merged.length !== screenshots.length) {
      setScreenshots(merged);
      setErrors((current) => current.filter((e) => e.key !== 'screenshots'));
    }
    setIsError(problems.length > 0);
    const addedText = merged.length > screenshots.length ? `${merged.length} screenshot${merged.length === 1 ? '' : 's'} ready. ` : '';
    setStatus(`${addedText}${problems.join(' ')}`.trim());
    setProcessingImages(false);
  }

  function removeScreenshot(index) {
    setScreenshots((current) => current.filter((_, i) => i !== index));
    setIsError(false);
    setStatus('Screenshot removed.');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { document.execCommand('copy'); } catch { /* ignore */ }
      area.remove();
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (step !== ACTS.length - 1) { goNext(); return; }
    if (loading || submittingRef.current) return;
    const bad = firstInvalidStep(ACTS.length + 1, (i) => computeErrors(Math.min(i, ACTS.length - 1), form, screenshots));
    if (bad !== -1 && bad < step) { setStep(bad); setErrors(computeErrors(bad, form, screenshots)); setErrorSignal((n) => n + 1); return; }
    if (!validateStep(step)) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      setIsError(true);
      setStatus('You are offline. Your answers are saved on this device. Connect to the internet, then press “Send my application” again.');
      return;
    }

    submittingRef.current = true;
    setLoading(true);
    setIsError(false);
    setStatus('Sending… please keep this page open.');
    if (!requestId.current) requestId.current = newRequestId();
    const body = new FormData();
    body.append('client_request_id', requestId.current);
    body.append('in_game_name', form.inGameName.trim());
    body.append('player_id', normalizePlayerId(form.playerId));
    body.append('discord_username', normalizeDiscordUsername(form.discordUsername));
    body.append('current_server', normalizeNumericAnswer(form.currentServer, 'current_server'));
    body.append('current_alliance', form.currentAlliance.trim());
    body.append('migrate_alliance', form.migrateAlliance === 'Other' ? `Other: ${form.migrateAllianceOther.trim()}` : form.migrateAlliance);
    body.append('highest_troop_level', form.highestTroopLevel);
    body.append('current_tg', normalizeNumericAnswer(form.currentTg, 'current_tg'));
    form.t11.forEach((option) => body.append('t11_units', option));
    body.append('mystic_trial_stages', normalizeNumericAnswer(form.mysticTrialStages, 'mystic_trial_stages'));
    body.append('total_power', normalizeNumericAnswer(form.totalPower, 'total_power'));
    body.append('willing_reduce_power', form.willingReducePower);
    body.append('passes_required', normalizeNumericAnswer(form.passesRequired, 'passes_required'));
    body.append('current_passes', normalizeNumericAnswer(form.currentPasses, 'current_passes'));
    body.append('active_commit', form.activeCommit);
    body.append('willing_save_resources', form.willingSaveResources);
    body.append('participates_battles', form.participatesBattles);
    body.append('spending_archetype', form.spendingArchetype);
    body.append('main_language', form.mainLanguage === 'Other' ? `Other: ${form.mainLanguageOther.trim()}` : form.mainLanguage);
    screenshots.forEach((file) => body.append('screenshots', file));
    body.append('website', form.website);
    body.append('rendered_at', String(renderedAt.current));

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120000);
    let response;
    let result = {};
    try {
      response = await fetch('/api/interest', { method: 'POST', body, signal: controller.signal });
      result = await response.json().catch(() => ({}));
    } catch {
      clearTimeout(timer);
      submittingRef.current = false;
      setLoading(false);
      setIsError(true);
      setStatus('The connection stopped before we could confirm. Nothing is lost: your answers and pictures are still here. Press “Send my application” to try again. It is safe to press it again.');
      return;
    }
    clearTimeout(timer);
    submittingRef.current = false;
    setLoading(false);

    if (!response.ok) {
      setIsError(true);
      setStatus(result.error || 'Something went wrong on our side. Please try again in a minute.');
      return;
    }
    setIsError(false);
    setStatus('');
    try { if (result.reference) window.localStorage.setItem(REF_KEY, result.reference); } catch { /* ignore */ }
    setConfirmedInfo({ intakePeriod: activePeriod, discordUsername: normalizeDiscordUsername(form.discordUsername), reference: result.reference || null });
    setForm(initialForm);
    setScreenshots([]);
    setErrors([]);
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setStep(0, { replace: true });
    renderedAt.current = Date.now();
    requestId.current = null;
    setDone(true);
    window.scrollTo({ top: 0 });
  }

  if (done) {
    return (
      <SealedPetition
        intakePeriod={confirmedInfo.intakePeriod}
        discordUsername={confirmedInfo.discordUsername}
        reference={confirmedInfo.reference}
        onAnother={() => setDone(false)}
      />
    );
  }

  if (activePeriodLoaded && !activePeriod) {
    return (
      <section className="apply-closed" aria-labelledby="apply-closed-title">
        <h2 id="apply-closed-title">Applications are closed right now</h2>
        <p>We open a new transfer window from time to time. Nothing is wrong with your device, and there is nothing you can do on this page today.</p>
        <ul>
          <li>Watch the Kingdom 710 Discord. Leadership announces the next window there.</li>
          <li>Already applied? <a href="/interest/status">Check your application</a>.</li>
          <li>Questions? Read the <a href="/help">Help page</a>.</li>
          <li>Not sure which alliance fits you? <a href="/about#alliances">See the alliance schedules</a>.</li>
        </ul>
      </section>
    );
  }

  const liveBad = (k) => Boolean(form[k]) && !validateNumericAnswer(NUMERIC_FIELD[k], form[k]).ok && !errMsg(k);
  const ctx = { form, updateField, gp, errMsg, fe };
  const isFinalStep = step === ACTS.length - 1;
  const act = ACTS[step];
  const actHead = (title, lede) => (
    <header className="apply-head">
      <h2 className="apply-title" tabIndex={-1}>{title}</h2>
      {lede && <p className="apply-lede">{lede}</p>}
    </header>
  );
  const reviewGroups = [
    { stepIndex: 0, title: 'Your account', rows: [['In-game name', form.inGameName], ['Player ID', form.playerId], ['Discord username', form.discordUsername], ['Current server', form.currentServer], ['Current alliance', form.currentAlliance]] },
    { stepIndex: 1, title: 'Your move', rows: [['Alliance you want to join', form.migrateAlliance === 'Other' ? `Other: ${form.migrateAllianceOther}` : form.migrateAlliance]] },
    { stepIndex: 2, title: 'Your power', rows: [['Highest troop level', form.highestTroopLevel], ['TrueGold (TG)', form.currentTg ? formatNum(form.currentTg) : ''], ['T11 troops', form.t11.join(', ')], ['Mystic Trial stages', formatNum(form.mysticTrialStages)], ['Total power', formatNum(form.totalPower)], ['Would lower power if needed', form.willingReducePower], ['Passes needed', formatNum(form.passesRequired)], ['Passes you have', formatNum(form.currentPasses)]] },
    { stepIndex: 3, title: 'Your play style', rows: [['Active in alliance events', form.activeCommit], ['Saves resources for KvK prep', form.willingSaveResources], ['Joins Sanctuary, Castle and KvK battles', form.participatesBattles], ['Spending', form.spendingArchetype], ['Main language', form.mainLanguage === 'Other' ? `Other: ${form.mainLanguageOther}` : form.mainLanguage]] },
    { stepIndex: 4, title: 'Screenshots', rows: [['Screenshots added', String(screenshots.length)]] },
  ];

  return (
    <form className="public-form-card interest-petition apply-form" onSubmit={handleSubmit}
      onKeyDown={(e) => {
        // Enter in a text box = Next (a form with no submit button does nothing on Enter).
        if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type === 'text' && !isFinalStep) { e.preventDefault(); goNext(); }
      }}
      noValidate>
      {pendingDraft && (
        <section className="apply-resume" aria-labelledby="apply-resume-title">
          <h2 id="apply-resume-title">Continue where you left off?</h2>
          <p>You started this application {describeAge(pendingDraft.savedAt) || 'before'} and we saved your answers on this device. Your pictures are not saved, you will add them again.</p>
          <div className="apply-resume-actions">
            <button type="button" className="k-btn" onClick={resumeDraft}>Continue my application</button>
            <button type="button" className="k-btn k-btn-quiet" onClick={startOver}>Start over</button>
          </div>
        </section>
      )}

      <StepProgress step={step} onJump={jumpTo} />

      {/* Honeypot: off-screen, not reachable by Tab; a real applicant never sees it. */}
      <div className="petition-honeypot" aria-hidden="true">
        <label htmlFor="website">Leave this field blank</label>
        <input id="website" name="website" type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={(e) => updateField('website', e.target.value)} />
      </div>

      <section id={act.id} className="apply-step-body" aria-labelledby={`${act.id}-title`}>
        {step === 0 && (
          <>
            {actHead('Your account', 'So we can find you in the game and message you.')}
            <aside className="apply-ready" aria-label="Before you start" data-tour="interest-ready">
              <h3>Before you start</h3>
              <p><strong>About 5 minutes.</strong> You can stop and come back: your answers are saved on this device.</p>
              <ul>
                <li>Your <strong>Player ID</strong> and <strong>Discord username</strong></li>
                <li>Your <strong>power</strong> and troop numbers (open your profile in Kingshot)</li>
                <li><strong>1 to 4 screenshots</strong> from your phone</li>
              </ul>
            </aside>
            <FormErrorSummary errors={errors} focusSignal={errorSignal} />
            <div className="apply-fields">
              <TextField ctx={ctx} k="inGameName" tour="interest-identity" label={L('inGameName')} hint="The name other players see in Kingshot." autoComplete="off" />
              <TextField ctx={ctx} k="playerId" label={L('playerId')} hint="Numbers only." mode="numeric" live={playerIdHint(form.playerId)}>
                <Where>Open Kingshot and tap your picture in the top-left corner. Your Player ID is the number shown there.</Where>
              </TextField>
              <TextField ctx={ctx} k="discordUsername" label={L('discordUsername')} hint="We message you here. You can leave out the @." placeholder="yourname">
                <Where>Open Discord and tap your picture. Your username is the short name without spaces, for example name or name#1234.</Where>
              </TextField>
              <TextField ctx={ctx} k="currentServer" label={L('currentServer')} hint="The kingdom you play in today, before moving. Numbers only, from 250 to 1,100." mode="numeric" maxLength={4} placeholder="for example 512" />
              <TextField ctx={ctx} k="currentAlliance" label={L('currentAlliance')} hint="The alliance you are in today. Type “None” if you have none." />
            </div>
          </>
        )}

        {step === 1 && (
          <>
            {actHead('Your move', activePeriod ? <>You are applying for the <strong>{activePeriod}</strong> transfer window. Leadership sets it, you do not choose it.</> : null)}
            <FormErrorSummary errors={errors} focusSignal={errorSignal} />
            <Choices
              legend="Which alliance do you want to join?"
              hint="You can check the schedules first. Your answers stay saved if you leave."
              name="migrateAlliance"
              id="f-migrateAlliance"
              tour="interest-move"
              options={MIGRATE_OPTIONS}
              value={form.migrateAlliance}
              onChange={(v) => updateField('migrateAlliance', v)}
              error={errMsg('migrateAlliance')}
              errorId="f-migrateAlliance-error"
            >
              {form.migrateAlliance === 'Other' && (
                <div className="apply-reveal">
                  <label htmlFor="f-migrateAllianceOther">Name of the alliance</label>
                  <input {...gp('migrateAllianceOther')} enterKeyHint="next" autoComplete="off" value={form.migrateAllianceOther} onChange={(e) => updateField('migrateAllianceOther', e.target.value)} />
                  <span id="f-migrateAllianceOther-hint" hidden />
                  {fe('migrateAllianceOther')}
                </div>
              )}
            </Choices>
            <p className="apply-hint"><a href="/about#alliances">See alliance schedules</a> (opens the About page).</p>
          </>
        )}

        {step === 2 && (
          <>
            {actHead('Your power', 'Open your profile in Kingshot and copy the numbers. Rough numbers are fine if you are unsure.')}
            <FormErrorSummary errors={errors} focusSignal={errorSignal} />
            <Choices
              legend="What is your highest troop level?"
              hint={<><Term term="TrueGold">TG</Term> is the troop level (TG8 is higher than TG7). Look at your troop camps, not your castle level.</>}
              name="highestTroopLevel"
              id="f-highestTroopLevel"
              tour="interest-power"
              options={TROOP_LEVEL_OPTIONS}
              value={form.highestTroopLevel}
              onChange={(v) => updateField('highestTroopLevel', v)}
              error={errMsg('highestTroopLevel')}
              errorId="f-highestTroopLevel-error"
            />
            <Choices
              legend="Do you have T11 troops?"
              hint="T11 is the very top troop tier. Pick every type you have."
              name="t11"
              id="f-t11"
              multiple
              options={T11_OPTIONS}
              value={form.t11}
              onChange={toggleT11}
              error={errMsg('t11')}
              errorId="f-t11-error"
            />
            <div className="apply-fields">
              <TextField ctx={ctx} k="totalPower" label={L('totalPower')} hint="The big number on your profile. Type it like 12,345,678. The most we accept is 3,000,000,000." mode="decimal" placeholder="12,345,678" maxLength={NUMBER_INPUT_MAX_LENGTH} live={numberPreview(form.totalPower, 'total_power')} liveBad={liveBad('totalPower')}>
                <Where>In Kingshot tap your picture in the top-left corner. Your power is the big number on your profile.</Where>
              </TextField>
              <TextField ctx={ctx} k="currentTg" label={L('currentTg')} hint="TrueGold is a late-game upgrade material. We want to know how far you can push your troops. Type 0 if none." mode="decimal" maxLength={NUMBER_INPUT_MAX_LENGTH} live={numberPreview(form.currentTg, 'current_tg')} liveBad={liveBad('currentTg')} />
              <TextField ctx={ctx} k="mysticTrialStages" label={L('mysticTrialStages')} hint="Add up all the stages you have cleared in Mystic Trial. Whole number from 0 to 4,000. Type 0 if none." mode="numeric" maxLength={5} live={numberPreview(form.mysticTrialStages, 'mystic_trial_stages')} liveBad={liveBad('mysticTrialStages')} />
            </div>
            <Choices
              legend="Would you lower your power if needed to join?"
              hint="Some invites have a power limit."
              name="willingReducePower"
              id="f-willingReducePower"
              options={YES_NO}
              value={form.willingReducePower}
              onChange={(v) => updateField('willingReducePower', v)}
              error={errMsg('willingReducePower')}
              errorId="f-willingReducePower-error"
            />
            <div className="apply-fields">
              <TextField ctx={ctx} k="passesRequired" label={L('passesRequired')} hint="How many transfer passes the move needs. If you are not sure, type 0." mode="numeric" maxLength={7} live={numberPreview(form.passesRequired, 'passes_required')} liveBad={liveBad('passesRequired')} />
              <TextField ctx={ctx} k="currentPasses" label={L('currentPasses')} hint="How many transfer passes you hold today. Type 0 if none." mode="numeric" maxLength={7} live={numberPreview(form.currentPasses, 'current_passes')} liveBad={liveBad('currentPasses')} />
            </div>
          </>
        )}

        {step === 3 && (
          <>
            {actHead('Your play style', 'Honest answers help us put you in the right alliance.')}
            <FormErrorSummary errors={errors} focusSignal={errorSignal} />
            <Choices legend="Can you play often and join alliance events?" name="activeCommit" id="f-activeCommit" options={YES_NO} value={form.activeCommit} onChange={(v) => updateField('activeCommit', v)} error={errMsg('activeCommit')} errorId="f-activeCommit-error" />
            <Choices legend="Will you save resources before KvK, and only do minimal rewards in side events?" hint="KvK is the big kingdom-versus-kingdom war." name="willingSaveResources" id="f-willingSaveResources" options={YES_NO} value={form.willingSaveResources} onChange={(v) => updateField('willingSaveResources', v)} error={errMsg('willingSaveResources')} errorId="f-willingSaveResources-error" />
            <Choices legend="Do you join Sanctuary, Castle and KvK battles?" name="participatesBattles" id="f-participatesBattles" options={YES_NO} value={form.participatesBattles} onChange={(v) => updateField('participatesBattles', v)} error={errMsg('participatesBattles')} errorId="f-participatesBattles-error" />
            <Choices legend="How much do you spend on the game?" hint="Pick the one closest to you." name="spendingArchetype" id="f-spendingArchetype" options={SPENDING_OPTIONS} value={form.spendingArchetype} onChange={(v) => updateField('spendingArchetype', v)} error={errMsg('spendingArchetype')} errorId="f-spendingArchetype-error" />
            <Choices legend="Main language you use in the game" name="mainLanguage" id="f-mainLanguage" options={LANGUAGE_OPTIONS} value={form.mainLanguage} onChange={(v) => updateField('mainLanguage', v)} error={errMsg('mainLanguage')} errorId="f-mainLanguage-error">
              {form.mainLanguage === 'Other' && (
                <div className="apply-reveal">
                  <label htmlFor="f-mainLanguageOther">Which language?</label>
                  <input {...gp('mainLanguageOther')} enterKeyHint="next" autoComplete="off" value={form.mainLanguageOther} onChange={(e) => updateField('mainLanguageOther', e.target.value)} />
                  <span id="f-mainLanguageOther-hint" hidden />
                  {fe('mainLanguageOther')}
                </div>
              )}
            </Choices>
          </>
        )}

        {step === 4 && (
          <>
            {actHead('Screenshots', 'Add 1 to 4 pictures from your phone gallery. They help officers check your account.')}
            <FormErrorSummary errors={errors} focusSignal={errorSignal} />
            <div className="apply-capture" data-tour="interest-shots">
              <h3>What to take a picture of</h3>
              <svg viewBox="0 0 330 150" role="img" aria-label="Diagram: three phone screens. 1: a battle report that shows your name. 2: your Governor Gear and charms. 3: your hero gear and Masters." className="apply-capture-svg">
                {[0, 1, 2].map((i) => (
                  <g key={i} transform={`translate(${10 + i * 112} 6)`}>
                    <rect x="0" y="0" width="96" height="138" rx="10" fill="none" stroke="currentColor" strokeWidth="2" />
                    <rect x="8" y="16" width="80" height="14" rx="3" fill="currentColor" opacity={i === 0 ? 0.55 : 0.18} />
                    <rect x="8" y="38" width="38" height="38" rx="4" fill="currentColor" opacity={i === 1 ? 0.55 : 0.18} />
                    <rect x="50" y="38" width="38" height="38" rx="4" fill="currentColor" opacity={i === 1 ? 0.55 : 0.18} />
                    <rect x="8" y="82" width="80" height="22" rx="4" fill="currentColor" opacity={i === 2 ? 0.55 : 0.18} />
                    <circle cx="48" cy="123" r="5" fill="none" stroke="currentColor" strokeWidth="1.5" />
                  </g>
                ))}
              </svg>
              <p className="apply-hint">Schematic only, not a real game screen.</p>
              <ol className="apply-capture-list">
                <li><strong>Your most recent battle report.</strong> Your in-game name must be visible.</li>
                <li><strong>Governor Gear and charms.</strong></li>
                <li><strong>Hero gear and Masters.</strong></li>
              </ol>
              <p className="apply-hint">One picture is enough to continue. More pictures help us decide faster. Take them with your phone screenshot button.</p>
            </div>

            <div
              className={`apply-drop ${dragOver ? 'is-over' : ''}`}
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => { e.preventDefault(); setDragOver(false); addFiles(e.dataTransfer?.files); }}
            >
              <input
                {...gp('screenshots')}
                onBlur={undefined}
                type="file"
                multiple
                accept="image/*,.heic,.heif"
                className="apply-file-input"
                disabled={processingImages || loading || screenshots.length >= INTEREST_UPLOAD_LIMITS.maxFiles}
                onChange={(e) => { const input = e.currentTarget; const files = Array.from(input.files || []); input.value = ''; addFiles(files); }}
              />
              <label htmlFor="f-screenshots" className="k-btn apply-drop-btn">{screenshots.length ? 'Add another picture' : 'Choose pictures'}</label>
              <p className="apply-hint" id="f-screenshots-hint">Choose from your gallery or camera, or drag pictures here. Photos from iPhone (HEIC) are fine. Up to 4 pictures.</p>
            </div>
            {fe('screenshots')}
            {screenshots.length > 0 && (
              <ul className="shot-list" aria-label="Your screenshots">
                {screenshots.map((file, i) => (
                  <Thumb key={`${file.name}-${file.size}-${file.lastModified}-${i}`} file={file} index={i} onRemove={removeScreenshot} />
                ))}
              </ul>
            )}
          </>
        )}

        {step === 5 && (
          <>
            {actHead('Check your answers', 'Look everything over. Use Change to fix anything, then send.')}
            <FormErrorSummary errors={errors} focusSignal={errorSignal} />
            <p className="review-once-note"><strong>Send this only once.</strong> If you already applied, do not send again. Use <a href="/interest/status">Check my application</a> instead.</p>
            <div className="review-groups">
              {reviewGroups.map((group) => (
                <section key={group.title} className="review-group" aria-labelledby={`review-${group.stepIndex}`} data-tour={group.stepIndex === 0 ? 'interest-review' : undefined}>
                  <div className="review-group-head">
                    <h3 id={`review-${group.stepIndex}`}>{group.title}</h3>
                    <button type="button" className="k-btn k-btn-quiet" onClick={() => { setErrors([]); setStep(group.stepIndex); }} aria-label={`Change ${group.title}`}>Change</button>
                  </div>
                  <dl>
                    {group.rows.map(([k, v]) => (
                      <div key={k}><dt>{k}</dt><dd>{String(v || '').trim() || 'Not answered'}</dd></div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
            <div className="apply-copy">
              <button type="button" className="k-btn k-btn-quiet" onClick={() => copyText(buildSummary(form, screenshots))}>{copied ? 'Copied' : 'Copy a summary of my answers'}</button>
            </div>
          </>
        )}
      </section>

      <div className="apply-status" aria-live="polite">
        {status && (
          <div className={isError ? 'status error' : 'status'} role={isError ? 'alert' : 'status'}>
            {loading && <span className="apply-spinner" aria-hidden="true" />}
            {status}
          </div>
        )}
        {processingImages && !status && <p className="status">Getting your picture ready…</p>}
      </div>

      {!pendingDraft && (
      <div className="petition-step-nav apply-bar-nav" data-tour="interest-nav" data-tour-reserve>
        <p className="apply-saved">{isFinalStep ? 'Nothing is sent until you press the button.' : 'Your answers are saved on this device.'}</p>
        <div className="petition-step-actions">
          {step > 0 && (
            <button type="button" className="k-btn k-btn-quiet" onClick={goBack} disabled={loading}>Back</button>
          )}
          {isFinalStep ? (
            <button key="send" type="submit" className="k-btn k-btn-struck" disabled={loading || processingImages} aria-busy={loading || undefined}>{loading ? 'Sending… keep this page open' : 'Send my application'}</button>
          ) : (
            <button key="continue" type="button" className="k-btn" disabled={processingImages} onClick={(e) => { e.preventDefault(); goNext(); }}>{processingImages ? 'Please wait…' : 'Continue'}</button>
          )}
        </div>
      </div>
      )}
    </form>
  );
}

function formatNum(value) {
  const parsed = parseNumberInput(value);
  return parsed.ok ? parsed.digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : String(value || '');
}

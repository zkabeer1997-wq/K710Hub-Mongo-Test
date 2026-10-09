'use client';

import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n/LanguageProvider';

// "Verify with your Kingshot account (recommended)" panel for /interest.
// Wording, states and error handling mirror the member sign-in (app/dashboard/
// PlayerRecordGate.js) but this is a separate component with its own routes.
// It sits inside the application <form>, so it uses buttons and Enter handlers
// instead of a nested form.

export function LockIcon({ className = '' }) {
  return (
    <svg className={`verify-lock ${className}`} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path fill="currentColor" d="M8 1a3.5 3.5 0 0 0-3.5 3.5V6H4a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-.5V4.5A3.5 3.5 0 0 0 8 1Zm-2 3.5a2 2 0 1 1 4 0V6H6V4.5Z" />
    </svg>
  );
}

// The surrounding form treats Enter as "Continue", so Enter here is handled (and stopped) locally.
function isEnter(event) {
  if (event.key !== 'Enter') return false;
  event.preventDefault();
  event.stopPropagation();
  return true;
}

export default function ApplicantVerify({ verify, onUseDifferent }) {
  const t = useT();
  const { view, profile, playerId: knownPlayerId, status, notice, busy } = verify;
  const [idValue, setIdValue] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState('');
  const [resent, setResent] = useState(false);
  const idRef = useRef(null);
  const codeRef = useRef(null);
  const headingRef = useRef(null);
  const prevView = useRef(view);

  useEffect(() => { if (knownPlayerId && !idValue) setIdValue(knownPlayerId); }, [knownPlayerId, idValue]);

  // Move focus where the person needs to be after each state change (not on first paint).
  useEffect(() => {
    if (prevView.current === view) return;
    const from = prevView.current;
    prevView.current = view;
    if (view === 'code') codeRef.current?.focus();
    else if (view === 'verified') headingRef.current?.focus();
    else if (view === 'player' && from !== 'loading') idRef.current?.focus();
  }, [view]);

  async function sendCode() {
    setLocalError('');
    setResent(false);
    const id = idValue.trim();
    if (!/^\d{4,20}$/.test(id)) {
      setLocalError(t('interest.verify.invalidId'));
      idRef.current?.focus();
      return;
    }
    setCode('');
    await verify.sendCode(id);
  }

  async function submitCode() {
    setLocalError('');
    setResent(false);
    const clean = code.trim();
    if (!/^[A-Za-z0-9]{4,12}$/.test(clean)) {
      setLocalError(t('interest.verify.codeFormat'));
      codeRef.current?.focus();
      return;
    }
    const profileResult = await verify.submitCode(clean);
    setCode('');
    if (!profileResult) codeRef.current?.focus();
  }

  async function resend() {
    setLocalError('');
    const ok = await verify.resendCode();
    setResent(ok);
  }

  const errorText = localError || status;

  if (view === 'loading') {
    return (
      <section className="verify-panel is-loading" aria-label={t('interest.verify.title')} aria-busy="true" data-tour="interest-verify">
        <p className="apply-hint">{t('interest.verify.loading')}</p>
      </section>
    );
  }

  if (view === 'skipped') {
    return (
      <section className="verify-panel is-quiet" aria-labelledby="verify-title" data-tour="interest-verify">
        <h3 id="verify-title" className="verify-title">{t('interest.verify.skipped.title')}</h3>
        <p className="verify-lede">{t('interest.verify.skipped.body')}</p>
        <button type="button" className="verify-link" onClick={verify.unskip}>{t('interest.verify.skipped.back')}</button>
      </section>
    );
  }

  if (view === 'verified' && profile) {
    return (
      <section className="verify-panel is-verified" aria-labelledby="verify-title" data-tour="interest-verify">
        <h3 id="verify-title" className="verify-title" tabIndex={-1} ref={headingRef}>
          <LockIcon /> {t('interest.verify.done.title')}
        </h3>
        <p className="verify-lede">{t('interest.verify.done.body', { name: profile.nickname, playerId: profile.playerId })}</p>
        <div className="verify-live" role="status" aria-live="polite">{t('interest.verify.done.announce')}</div>
        <button type="button" className="verify-link" onClick={onUseDifferent} disabled={busy}>{t('interest.verify.different')}</button>
      </section>
    );
  }

  return (
    <section className="verify-panel" aria-labelledby="verify-title" aria-busy={busy || undefined} data-tour="interest-verify">
      <h3 id="verify-title" className="verify-title">{t('interest.verify.title')}</h3>
      <p className="verify-lede">{t('interest.verify.lede')}</p>

      {notice && <p className="verify-notice" role="status">{notice}</p>}

      {view === 'player' && (
        <div className="verify-step">
          <label htmlFor="verify-player-id">{t('interest.verify.playerId.label')}</label>
          <p id="verify-player-id-hint" className="apply-hint">{t('interest.verify.playerId.hint')}</p>
          <input
            id="verify-player-id"
            ref={idRef}
            className="verify-input"
            value={idValue}
            onChange={(event) => setIdValue(event.target.value.replace(/\D/g, ''))}
            onKeyDown={(event) => { if (isEnter(event)) sendCode(); }}
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="go"
            maxLength={20}
            placeholder="123456789"
            aria-describedby={[ 'verify-player-id-hint', errorText ? 'verify-error' : '' ].filter(Boolean).join(' ')}
            aria-invalid={errorText ? 'true' : undefined}
          />
          <p className="apply-hint">{t('interest.verify.sendHint')}</p>
          {errorText ? <p id="verify-error" className="field-error" role="alert">{errorText}</p> : null}
          <button type="button" className="k-btn verify-primary" onClick={sendCode} disabled={busy}>
            {busy ? t('interest.verify.sending') : t('interest.verify.send')}
          </button>
        </div>
      )}

      {view === 'code' && (
        <div className="verify-step">
          <h4 className="verify-step-title">{t('interest.verify.code.title')}</h4>
          <p id="verify-code-hint" className="apply-hint">{t('interest.verify.code.hint')}</p>
          <label htmlFor="verify-code">{t('interest.verify.code.label')}</label>
          <input
            id="verify-code"
            ref={codeRef}
            className="verify-input verify-code-input"
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/[^A-Za-z0-9]/g, ''))}
            onKeyDown={(event) => { if (isEnter(event)) submitCode(); }}
            autoComplete="one-time-code"
            autoCapitalize="characters"
            enterKeyHint="go"
            minLength={4}
            maxLength={12}
            placeholder={t('interest.verify.code.placeholder')}
            aria-describedby={['verify-code-hint', errorText ? 'verify-error' : ''].filter(Boolean).join(' ')}
            aria-invalid={errorText ? 'true' : undefined}
          />
          {errorText ? <p id="verify-error" className="field-error" role="alert">{errorText}</p> : null}
          {resent && !errorText ? <p className="verify-live" role="status">{t('interest.verify.code.resent')}</p> : null}
          <div className="verify-actions">
            <button type="button" className="k-btn verify-primary" onClick={submitCode} disabled={busy}>
              {busy ? t('interest.verify.code.checking') : t('interest.verify.code.submit')}
            </button>
            <button type="button" className="verify-link" onClick={resend} disabled={busy}>{t('interest.verify.code.resend')}</button>
            <button type="button" className="verify-link" onClick={onUseDifferent} disabled={busy}>{t('interest.verify.otherId')}</button>
          </div>
        </div>
      )}

      <p className="verify-skip">
        <button type="button" className="verify-link" onClick={verify.skip} disabled={busy}>{t('interest.verify.skip')}</button>
      </p>
    </section>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MemberHub from '../../components/kingdom/world/MemberHub';
import { Button, Field, Input } from '../../components/ui';

// Only an internal path is a safe redirect target - "//evil.com" is
// protocol-relative and browsers will happily follow it off-site.
function isSafeNext(next) {
  return typeof next === 'string' && next.startsWith('/') && !next.startsWith('//');
}

export default function PlayerRecordGate({ banner, next }) {
  const router = useRouter();
  const safeNext = isSafeNext(next) ? next : null;
  const [memberId, setMemberId] = useState('');
  const [name, setName] = useState('');
  const [pin, setPin] = useState('');
  const [firstTime, setFirstTime] = useState(false);
  const [issuedPin, setIssuedPin] = useState('');
  const [copied, setCopied] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [verifiedMemberId, setVerifiedMemberId] = useState('');
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opening, setOpening] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }, []);

  function openGate() {
    if (reduced) {
      if (safeNext) {
        router.push(safeNext);
      } else {
        setUnlocked(true);
      }
      return;
    }
    setOpening(true);
    window.setTimeout(() => {
      if (safeNext) {
        router.push(safeNext);
      } else {
        setUnlocked(true);
      }
      setOpening(false);
    }, 1500);
  }

  function switchMode(nextFirstTime) {
    setFirstTime(nextFirstTime);
    setStatus('');
    setIsError(false);
    setIssuedPin('');
    setCopied(false);
    setPin('');
  }

  async function handleUnlock(e) {
    e.preventDefault();
    setStatus('');
    setIsError(false);

    if (!memberId.trim()) {
      setIsError(true);
      setStatus('Please enter your Member ID.');
      return;
    }

    if (firstTime && !name.trim()) {
      setIsError(true);
      setStatus('Please enter your governor name.');
      return;
    }

    if (!firstTime && !pin) {
      setIsError(true);
      setStatus('Please enter your PIN.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(firstTime ? '/api/member-register' : '/api/member-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(firstTime
          ? { name: name.trim(), memberId: memberId.trim() }
          : { memberId: memberId.trim(), pin }),
      });
      const data = await response.json();
      if (!response.ok || data?.ok !== true) {
        setIsError(true);
        setStatus(data?.error || (firstTime ? 'Unable to create member credentials.' : 'Unable to verify member access.'));
        return;
      }

      setVerifiedMemberId(data.memberId || memberId.trim());

      if (firstTime && data.created === true && data.pin) {
        setIssuedPin(String(data.pin));
        setCopied(false);
        setStatus('Your member sign-in was created. Save your PIN before continuing.');
        return;
      }

      openGate();
    } catch {
      setIsError(true);
      setStatus(firstTime ? 'Unable to create member credentials.' : 'Unable to verify member access.');
    } finally {
      setLoading(false);
    }
  }

  async function copyCredentials() {
    if (!issuedPin) return;
    const text = `K710 Member ID: ${verifiedMemberId}\nPIN: ${issuedPin}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false);
      setStatus('Select and save your Member ID and PIN manually before continuing.');
    }
  }

  if (unlocked) {
    return <MemberHub memberId={verifiedMemberId} />;
  }

  return (
    <main className="k-scene gatehouse">
      <div className="k-scene-layer gatehouse-art" aria-hidden="true" />
      <div className="k-scene-layer gatehouse-torch gatehouse-torch-l" aria-hidden="true" />
      <div className="k-scene-layer gatehouse-torch gatehouse-torch-r" aria-hidden="true" />
      <div className="k-scene-layer k-vignette" aria-hidden="true" />

      <div className="k-scene-layer gatehouse-guards" aria-hidden="true">
        <span className="gatehouse-guard gatehouse-guard-l" />
        <span className="gatehouse-guard gatehouse-guard-r" />
      </div>

      <div className="gatehouse-inner">
        {banner}

        <header className="gatehouse-head">
          <span className="k-mark">Kingdom 710 members</span>
          <h1 className="k-display gatehouse-title">Member sign in</h1>
          <p className="k-narrative gatehouse-lede">
            {firstTime ? 'Create a member sign-in using your Kingshot Member ID.' : 'Enter your Member ID and PIN.'}
          </p>
        </header>

        {issuedPin ? (
          <section className="gatehouse-desk k-ui" aria-live="polite">
            <div className="gatehouse-desk-grain" aria-hidden="true" />
            <span className="k-mark">Credentials issued</span>
            <h2 className="k-display" style={{ margin: '8px 0 16px', fontSize: '1.35rem' }}>Save these now</h2>
            <p className="k-narrative" style={{ margin: '0 0 16px' }}>
              Your PIN is stored as a one-way hash and cannot be shown again. An admin can reset it later if needed.
            </p>
            <Field label="Member ID">
              <div className="k-input" style={{ display: 'flex', alignItems: 'center', minHeight: 44 }}>{verifiedMemberId}</div>
            </Field>
            <Field label="6-digit PIN">
              <div className="k-input" style={{ display: 'flex', alignItems: 'center', minHeight: 44, letterSpacing: '.18em', fontWeight: 800 }}>{issuedPin}</div>
            </Field>
            {status && <div className="status" role="status">{status}</div>}
            <div style={{ display: 'grid', gap: 10, marginTop: 14 }}>
              <button type="button" className="k-btn" onClick={copyCredentials}>{copied ? 'Credentials copied' : 'Copy credentials'}</button>
              <Button variant="sky" className="gatehouse-submit" onClick={openGate} disabled={opening}>
                {opening ? 'Opening member page…' : 'I saved them — continue'}
              </Button>
            </div>
          </section>
        ) : (
          <form className="gatehouse-desk k-ui" onSubmit={handleUnlock}>
            <div className="gatehouse-desk-grain" aria-hidden="true" />

            {firstTime && (
              <Field label="Governor Name" htmlFor="gate-member-name">
                <Input
                  tone="console"
                  id="gate-member-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  autoComplete="name"
                  maxLength={120}
                  required
                />
              </Field>
            )}

            <Field label="Member ID" htmlFor="gate-member-id">
              <Input
                tone="console"
                id="gate-member-id"
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                autoComplete="username"
                maxLength={120}
                required
              />
            </Field>

            {!firstTime && (
              <Field label="PIN" htmlFor="gate-pin">
                <Input
                  tone="console"
                  id="gate-pin"
                  type="password"
                  value={pin}
                  onChange={(e) => setPin(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Enter the PIN you originally set"
                  required
                />
              </Field>
            )}

            {status && (
              <div className={isError ? 'status error' : 'status'} role="status">
                {status}
              </div>
            )}

            <Button type="submit" variant="sky" className="gatehouse-submit" disabled={loading || opening}>
              {loading ? (firstTime ? 'Creating…' : 'Checking…') : opening ? 'Opening member page…' : firstTime ? 'Create member sign-in' : 'Sign in'}
            </Button>

            <button
              type="button"
              className="k-btn"
              style={{ width: '100%', marginTop: 10 }}
              onClick={() => switchMode(!firstTime)}
              disabled={loading || opening}
            >
              {firstTime ? 'I already have credentials' : 'First time member? Create credentials'}
            </button>

            <p className="gatehouse-hint k-narrative">
              {firstTime
                ? 'Use the Member ID from Kingshot. The site will generate a secure 6-digit PIN and show it once.'
                : 'Use the PIN you originally set. Forgot it? An admin can reset it from the Member PINs panel.'}
            </p>
          </form>
        )}

        <Link href="/admin" className="gatehouse-restricted">
          <span className="k-mark">Administrators only</span>
          <span>Admin sign in</span>
        </Link>
      </div>

      <div className={`gatehouse-doors ${opening ? 'is-open' : ''}`} aria-hidden="true">
        <span className="gatehouse-door gatehouse-door-l" />
        <span className="gatehouse-door gatehouse-door-r" />
        <span className="gatehouse-doorlight" />
      </div>
    </main>
  );
}

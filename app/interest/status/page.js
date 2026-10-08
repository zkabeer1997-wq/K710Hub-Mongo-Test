'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { statusCopy } from '../../../lib/interestForm.mjs';
import '../apply.css';

const REF_KEY = 'k710-interest-last-ref';

function InterestStatusInner() {
  const searchParams = useSearchParams();
  const [reference, setReference] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [savedRef, setSavedRef] = useState('');
  const resultRef = useRef(null);

  async function lookup(raw) {
    const ref = String(raw ?? '').trim().toUpperCase().replace(/\s+/g, '');
    setError('');
    setResult(null);
    if (!ref) {
      setError('Please type the reference code from your confirmation. It starts with K710-.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/interest/status?reference=${encodeURIComponent(ref)}`, { cache: 'no-store' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(res.status === 404
          ? 'We could not find that code. Check each letter and number. The code looks like K710-A1B2C3D4.'
          : data.error || 'Something went wrong. Please try again.');
        return;
      }
      setResult(data);
    } catch {
      setError('We could not reach the server. Check your internet and try again.');
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    try { setSavedRef(window.localStorage.getItem(REF_KEY) || ''); } catch { /* ignore */ }
    const q = searchParams?.get('reference');
    if (q && q.trim()) {
      const ref = q.trim().toUpperCase();
      setReference(ref);
      lookup(ref);
    }
  }, [searchParams]);

  useEffect(() => { if (result) resultRef.current?.focus(); }, [result]);

  const copy = result ? statusCopy(result.status) : null;

  return (
    <>
      <Link href="/interest" className="interest-status-back">← Back to the application</Link>
      <h1>Check my application</h1>
      <p>Type the reference code you got after sending the form. It looks like <code>K710-A1B2C3D4</code>.</p>

      <form onSubmit={(e) => { e.preventDefault(); lookup(reference); }} className="interest-status-form" noValidate>
        <label htmlFor="interest-ref">Reference code</label>
        <input
          id="interest-ref"
          value={reference}
          onChange={(e) => setReference(e.target.value.toUpperCase())}
          placeholder="K710-XXXXXXXX"
          autoComplete="off"
          autoCapitalize="characters"
          autoCorrect="off"
          enterKeyHint="go"
          spellCheck={false}
          aria-describedby={error ? 'interest-ref-error' : undefined}
          aria-invalid={error ? 'true' : undefined}
        />
        <button type="submit" disabled={busy}>{busy ? 'Checking…' : 'Check my application'}</button>
      </form>

      {savedRef && savedRef !== reference && (
        <p className="apply-hint">
          Last code sent from this device: <button type="button" className="apply-linkish" onClick={() => { setReference(savedRef); lookup(savedRef); }}>{savedRef}</button>
        </p>
      )}

      {error && <p id="interest-ref-error" className="interest-status-error" role="alert">{error}</p>}

      {result && copy && (
        <div className="interest-status-result" role="status" tabIndex={-1} ref={resultRef}>
          <p className="interest-status-badge" data-status={result.status}>{copy.title}</p>
          {result.name && <p>Application for <strong>{result.name}</strong></p>}
          <p>{copy.body}</p>
          <p><strong>What to do:</strong> {copy.next}</p>
          {result.status === 'accepted' && result.target_alliance && <p>Alliance you asked for: <strong>{result.target_alliance}</strong></p>}
          {result.status === 'accepted' && (
            <p><Link href="/login?next=/dashboard" className="interest-status-signin">Sign in</Link></p>
          )}
        </div>
      )}

      <aside className="apply-lost">
        <h2>Lost your code?</h2>
        <p>We cannot show applications without the code, to keep everyone&apos;s data private. Ask an officer on the Kingdom 710 Discord and tell them your in-game name. You can also read the <Link href="/help">Help page</Link>.</p>
      </aside>
    </>
  );
}

export default function InterestStatusPage() {
  return (
    <main className="interest-status-page">
      <div className="interest-status-inner">
        <Suspense fallback={<p>Loading…</p>}>
          <InterestStatusInner />
        </Suspense>
      </div>

      <style>{`
        .interest-status-page { min-height: 100vh; padding: 48px 20px 80px; background: var(--color-bg, #0f0e0c); color: var(--color-ink, #f2eee6); }
        .interest-status-inner { max-width: 520px; margin: 0 auto; display: flex; flex-direction: column; gap: 12px; font-size: 17px; line-height: 1.55; }
        .interest-status-inner h1 { margin: 4px 0 0; }
        .interest-status-back { color: var(--color-accent-strong, #d9a94e); text-decoration: none; font-size: 15px; font-weight: 700; display: inline-flex; align-items: center; min-height: 44px; }
        .interest-status-form { display: flex; flex-direction: column; gap: 8px; margin-top: 8px; }
        .interest-status-form label { font-weight: 700; }
        .interest-status-form input { padding: 14px; min-height: 52px; font-size: 18px; border-radius: 10px; border: 1px solid var(--color-border-strong, #5a5246); background: var(--color-surface, #1a1814); color: inherit; font-family: var(--font-mono, ui-monospace, monospace); letter-spacing: 0.04em; }
        .interest-status-form button { padding: 14px 16px; min-height: 52px; font-size: 17px; border-radius: 10px; border: 0; background: var(--color-accent, #d9a94e); color: #1a1408; font-weight: 700; cursor: pointer; }
        .interest-status-form button:disabled { opacity: 0.6; cursor: wait; }
        .interest-status-error { color: #f0a090; margin: 0; }
        .interest-status-result { margin-top: 8px; padding: 18px; border-radius: 12px; border: 1px solid var(--color-border, #3a3630); background: var(--color-surface, #1a1814); }
        .interest-status-result p { margin: 0 0 10px; }
        .interest-status-badge { display: inline-block; padding: 6px 12px; border-radius: 999px; font-size: 15px; font-weight: 700; background: #2a2824; }
        .interest-status-badge[data-status="accepted"] { background: #2a3d2a; color: #b5e3b5; }
        .interest-status-badge[data-status="pending"] { background: #3d3520; color: #f0d58a; }
        .interest-status-badge[data-status="waitlist"] { background: #2a3040; color: #b3c8ee; }
        .interest-status-badge[data-status="rejected"] { background: #3d2424; color: #f0aaaa; }
        .interest-status-result a { color: var(--color-accent-strong, #d9a94e); font-weight: 700; }
        .apply-lost { margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--color-border, #3a3630); }
        .apply-lost h2 { font-size: 20px; margin: 0 0 6px; }
        .apply-lost p { margin: 0; }
        .apply-lost a { color: var(--color-accent-strong, #d9a94e); font-weight: 700; }
        .apply-linkish { background: none; border: 0; padding: 8px 4px; color: var(--color-accent-strong, #d9a94e); font: inherit; font-family: var(--font-mono, monospace); font-weight: 700; text-decoration: underline; cursor: pointer; min-height: 44px; }
      `}</style>
    </main>
  );
}

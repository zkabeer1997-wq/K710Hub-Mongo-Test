'use client';

import { useCallback, useState } from 'react';
import Link from 'next/link';

export default function InterestStatusPage() {
  const [reference, setReference] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const lookup = useCallback(
    async (event) => {
      event?.preventDefault?.();
      setError('');
      setResult(null);
      const ref = reference.trim().toUpperCase();
      if (!ref) {
        setError('Enter the reference code from your confirmation (K710-…).');
        return;
      }
      setBusy(true);
      try {
        const res = await fetch(
          `/api/interest/status?reference=${encodeURIComponent(ref)}`,
          { cache: 'no-store' }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || 'Submission not found.');
          return;
        }
        setResult(data);
      } catch {
        setError('Unable to check status right now. Try again shortly.');
      } finally {
        setBusy(false);
      }
    },
    [reference]
  );

  return (
    <main className="interest-status-page">
      <div className="interest-status-inner">
        <Link href="/interest" className="interest-status-back">
          ← Transfer form
        </Link>
        <h1>Check transfer status</h1>
        <p>
          Enter the reference code shown after you submitted the transfer form
          (for example <code>K710-A1B2C3D4</code>).
        </p>

        <form onSubmit={lookup} className="interest-status-form">
          <label htmlFor="interest-ref">Reference code</label>
          <input
            id="interest-ref"
            value={reference}
            onChange={(e) => setReference(e.target.value.toUpperCase())}
            placeholder="K710-XXXXXXXX"
            autoComplete="off"
            spellCheck={false}
          />
          <button type="submit" disabled={busy}>
            {busy ? 'Checking…' : 'Check status'}
          </button>
        </form>

        {error && (
          <p className="interest-status-error" role="alert">
            {error}
          </p>
        )}

        {result && (
          <div className="interest-status-result" role="status">
            <p className="interest-status-badge" data-status={result.status}>
              {result.status}
            </p>
            {result.name && <p>Applicant: <strong>{result.name}</strong></p>}
            <p>{result.next_step}</p>
            {result.status === 'accepted' && (
              <p>
                <Link href="/player-record">Go to member login →</Link>
              </p>
            )}
          </div>
        )}
      </div>

      <style>{`
        .interest-status-page {
          min-height: 100vh;
          padding: 48px 20px 80px;
          background: var(--color-bg, #0f0e0c);
          color: var(--color-ink, #f2eee6);
        }
        .interest-status-inner {
          max-width: 480px;
          margin: 0 auto;
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        .interest-status-back {
          color: var(--color-accent-strong, #d9a94e);
          text-decoration: none;
          font-size: 13px;
          font-weight: 700;
        }
        .interest-status-form {
          display: flex;
          flex-direction: column;
          gap: 8px;
          margin-top: 8px;
        }
        .interest-status-form input {
          padding: 12px 14px;
          border-radius: 10px;
          border: 1px solid var(--color-border, #3a3630);
          background: var(--color-surface, #1a1814);
          color: inherit;
          font-family: var(--font-mono, ui-monospace, monospace);
          letter-spacing: 0.04em;
        }
        .interest-status-form button {
          padding: 12px 16px;
          border-radius: 10px;
          border: 0;
          background: var(--color-accent, #d9a94e);
          color: #1a1408;
          font-weight: 700;
          cursor: pointer;
        }
        .interest-status-form button:disabled { opacity: 0.6; cursor: wait; }
        .interest-status-error { color: #e08070; }
        .interest-status-result {
          margin-top: 8px;
          padding: 16px;
          border-radius: 12px;
          border: 1px solid var(--color-border, #3a3630);
          background: var(--color-surface, #1a1814);
        }
        .interest-status-badge {
          display: inline-block;
          padding: 4px 10px;
          border-radius: 999px;
          font-size: 12px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          background: #2a2824;
        }
        .interest-status-badge[data-status="accepted"] { background: #2a3d2a; color: #9fd49f; }
        .interest-status-badge[data-status="pending"] { background: #3d3520; color: #e0c878; }
        .interest-status-badge[data-status="waitlist"] { background: #2a3040; color: #9eb6e0; }
        .interest-status-badge[data-status="rejected"] { background: #3d2424; color: #e09090; }
        .interest-status-result a { color: var(--color-accent-strong, #d9a94e); font-weight: 700; }
      `}</style>
    </main>
  );
}

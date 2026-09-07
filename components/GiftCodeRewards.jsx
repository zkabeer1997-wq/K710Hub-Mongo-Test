'use client';

import { useCallback, useEffect, useState } from 'react';

const REDEMPTION_SITE_URL = 'https://ks-giftcode.centurygame.com/';

const STATUS_LABEL = {
  redeemed: 'Redeemed',
  already_redeemed: 'Already had it',
  pending: 'Ready to redeem',
  processing: 'Ready to redeem',
  skipped: "Didn't work / skipped",
  expired: 'Code invalid/expired',
  invalid_code: 'Code invalid/expired',
  invalid_player: 'Player issue',
  temporary_failure: 'Retrying',
};

function statusLabel(status) {
  return STATUS_LABEL[status] || status || '—';
}

/**
 * Compact Gift Code Rewards for signed-in members.
 *
 * Discovery is automatic (daily wiki check); redemption itself is not - the
 * member redeems each new code themselves at Century Games' own site, then
 * confirms the outcome here.
 */
export default function GiftCodeRewards({ className = '' }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/gift-codes', { cache: 'no-store' });
      if (res.status === 401) {
        setData(null);
        setError('');
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to load gift codes.');
      setData(json);
    } catch (err) {
      setError(err.message || 'Unable to load gift codes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function setEnabled(enabled) {
    setBusy('toggle');
    setError('');
    try {
      const res = await fetch('/api/gift-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to update preference.');
      setData(json);
    } catch (err) {
      setError(err.message || 'Unable to update preference.');
    } finally {
      setBusy('');
    }
  }

  async function confirm(redemptionId, result) {
    setBusy(redemptionId);
    setError('');
    try {
      const res = await fetch('/api/gift-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ redemptionId, result }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Unable to update redemption.');
      setData(json);
    } catch (err) {
      setError(err.message || 'Unable to update redemption.');
    } finally {
      setBusy('');
    }
  }

  // Not signed in — hide quietly (page may still be public).
  if (!loading && !data && !error) return null;

  const history = data?.history || [];
  const readyToRedeem = history.filter((h) => h.status === 'pending' || h.status === 'processing');
  const pastResults = history.filter((h) => h.status !== 'pending' && h.status !== 'processing').slice(0, 8);

  return (
    <section className={`gift-code-rewards ledger-block ${className}`.trim()} aria-labelledby="gift-code-rewards-title">
      <div className="ledger-block-head">
        <span className="ledger-block-kicker">Kingdom 710</span>
        <h3 id="gift-code-rewards-title">Gift Code Rewards</h3>
        <p>
          New codes are discovered automatically from the wiki every day. When one appears, redeem
          it yourself at{' '}
          <a href={REDEMPTION_SITE_URL} target="_blank" rel="noreferrer">
            ks-giftcode.centurygame.com
          </a>{' '}
          using your Player ID and Kingdom 710 shown below, then confirm the result here.
        </p>
      </div>

      {loading ? <p className="hint">Loading gift code status…</p> : null}
      {error ? <p className="status error">{error}</p> : null}

      {data ? (
        <>
          <div className="gift-code-rewards-meta" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', alignItems: 'center', marginBottom: '0.75rem' }}>
            <span>
              Status:{' '}
              <strong>
                {!data.enrolled ? 'Not enrolled' : data.enabled ? 'Code alerts on' : 'Code alerts off'}
              </strong>
            </span>
            {data.playerId ? (
              <span className="hint" style={{ margin: 0 }}>
                Player ID {data.playerId} · Kingdom {data.kingdom || 710}
              </span>
            ) : null}
            <button
              type="button"
              className="secondary-btn"
              disabled={busy === 'toggle'}
              onClick={() => setEnabled(!(data.enabled && data.enrolled))}
              style={{ marginLeft: 'auto' }}
            >
              {busy === 'toggle'
                ? 'Saving…'
                : data.enabled && data.enrolled
                  ? 'Turn off code alerts'
                  : 'Turn on code alerts'}
            </button>
          </div>

          {readyToRedeem.length > 0 ? (
            <div className="gift-code-ready-list">
              {readyToRedeem.map((h) => (
                <div className="gift-code-ready-card" key={h.id}>
                  <div className="gift-code-ready-head">
                    <span className="gift-code-ready-badge">New code</span>
                    <code>{h.code}</code>
                  </div>
                  <p className="hint" style={{ margin: '4px 0 10px' }}>
                    Player ID <strong>{data.playerId}</strong> · Kingdom <strong>{data.kingdom || 710}</strong>
                  </p>
                  <div className="gift-code-ready-actions">
                    <a
                      className="primary-btn"
                      href={REDEMPTION_SITE_URL}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Redeem now →
                    </a>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={busy === h.id}
                      onClick={() => confirm(h.id, 'redeemed')}
                    >
                      Mark redeemed
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={busy === h.id}
                      onClick={() => confirm(h.id, 'already_redeemed')}
                    >
                      Already had it
                    </button>
                    <button
                      type="button"
                      className="secondary-btn"
                      disabled={busy === h.id}
                      onClick={() => confirm(h.id, 'skipped')}
                    >
                      Didn't work
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : null}

          {pastResults.length === 0 ? (
            <p className="hint">
              {readyToRedeem.length > 0
                ? ''
                : 'No codes yet. Codes are checked daily from the wiki.'}
            </p>
          ) : (
            <div className="gift-code-rewards-table-wrap" style={{ overflowX: 'auto' }}>
              <table className="gift-code-rewards-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem' }}>Code</th>
                    <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem' }}>Result</th>
                    <th style={{ textAlign: 'left', padding: '0.35rem 0.5rem' }}>When</th>
                  </tr>
                </thead>
                <tbody>
                  {pastResults.map((h) => (
                    <tr key={h.id}>
                      <td style={{ padding: '0.35rem 0.5rem' }}>
                        <code>{h.code}</code>
                      </td>
                      <td style={{ padding: '0.35rem 0.5rem' }}>{statusLabel(h.status)}</td>
                      <td style={{ padding: '0.35rem 0.5rem' }}>
                        {h.completed_at || h.updated_at || h.created_at
                          ? new Date(h.completed_at || h.updated_at || h.created_at).toLocaleString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      ) : null}

      <style>{`
        .gift-code-ready-list{display:flex;flex-direction:column;gap:10px;margin-bottom:14px}
        .gift-code-ready-card{border:1px solid var(--border-soft, #3a3a3a);border-radius:10px;padding:12px 14px;background:rgba(255,255,255,0.03)}
        .gift-code-ready-head{display:flex;align-items:center;gap:8px;font-size:1.05rem}
        .gift-code-ready-head code{font-size:1.1rem;font-weight:700}
        .gift-code-ready-badge{font-size:0.68rem;font-weight:800;letter-spacing:.06em;text-transform:uppercase;padding:2px 8px;border-radius:999px;background:rgba(65,164,255,.16);color:#7fbfff}
        .gift-code-ready-actions{display:flex;flex-wrap:wrap;gap:8px}
        .gift-code-rewards .primary-btn{display:inline-flex;align-items:center;justify-content:center;background:var(--gold, #d9a94e);color:var(--ink, #14141c);font-weight:800;padding:8px 14px;border-radius:8px;text-decoration:none;font-size:0.85rem;border:1px solid var(--gold, #d9a94e)}
        .gift-code-rewards .primary-btn:hover{background:var(--gold-bright, #f0c368)}
        .gift-code-rewards .secondary-btn{background:transparent;color:inherit;border:1px solid var(--border-soft, #3a3a3a);padding:8px 14px;border-radius:8px;font-size:0.85rem;cursor:pointer}
        .gift-code-rewards .secondary-btn:hover:not(:disabled){border-color:var(--gold, #d9a94e);color:var(--gold, #d9a94e)}
        .gift-code-rewards .secondary-btn:disabled{opacity:.5;cursor:not-allowed}
      `}</style>
    </section>
  );
}

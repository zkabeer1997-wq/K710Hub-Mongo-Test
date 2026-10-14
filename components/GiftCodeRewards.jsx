'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useT } from './i18n/LanguageProvider';

const RESULT_KEY = {
  redeemed: 'gift.result.redeemed',
  already_had: 'gift.result.alreadyHad',
  expired: 'gift.result.expired',
  problem: 'gift.result.problem',
  waiting: 'gift.result.waiting',
};

/**
 * Gift codes for signed-in members: the opt-in for automatic redeeming, the active codes (with a
 * Copy button) and this member's own result per code. Everything comes from /api/gift-codes, which
 * only ever returns the signed-in member's own data.
 */
export default function GiftCodeRewards({ className = '' }) {
  const t = useT();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState('');
  const copiedTimer = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/gift-codes', { cache: 'no-store' });
      if (res.status === 401) {
        setData(null);
        return;
      }
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'load');
      setData(json);
    } catch {
      setError(t('gift.error.load'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  async function setEnabled(enabled) {
    setSaving(true);
    setError('');
    const before = data;
    setData((d) => (d ? { ...d, enabled } : d)); // show the choice at once; undone below if saving fails
    try {
      const res = await fetch('/api/gift-codes', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'save');
      setData(json);
    } catch {
      setData(before);
      setError(t('gift.error.save'));
    } finally {
      setSaving(false);
    }
  }

  async function copy(code) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(code);
    } catch {
      // Clipboard blocked: select-by-hand still works because the code is shown as plain text.
      setCopied('');
      return;
    }
    clearTimeout(copiedTimer.current);
    copiedTimer.current = setTimeout(() => setCopied(''), 2000);
  }

  // Not signed in: hide quietly (the page may be public).
  if (!loading && !data && !error) return null;

  const codes = data?.codes || [];

  return (
    <section className={`gift-rewards ${className}`.trim()} aria-label={t('gift.title')}>
      {loading && !data ? <p className="gift-rewards-note">{t('gift.loading')}</p> : null}
      {error ? <p className="gift-rewards-error" role="alert">{error}</p> : null}

      {data ? (
        <>
          <p className="gift-rewards-intro">{t('gift.intro')}</p>

          <div className="gift-rewards-optin">
            <input
              id="gift-optin"
              type="checkbox"
              role="switch"
              checked={Boolean(data.enabled)}
              disabled={saving}
              onChange={(e) => setEnabled(e.target.checked)}
              aria-describedby="gift-optin-hint"
            />
            <label htmlFor="gift-optin">{t('gift.toggle.label')}</label>
            <p id="gift-optin-hint" className="gift-rewards-note">
              {t('gift.toggle.hint', { id: data.playerId })}
              {data.enabled && !data.autoRedeemAvailable ? ` ${t('gift.toggle.unavailable')}` : ''}
              {data.failed ? ` ${t('gift.failed')}` : ''}
            </p>
            <p className="gift-rewards-note" aria-live="polite">{saving ? t('gift.saving') : data.enabled ? t('gift.state.on') : t('gift.state.off')}</p>
          </div>

          <h3 className="gift-rewards-heading">{t('gift.codes.heading')}</h3>
          {codes.length === 0 ? (
            <p className="gift-rewards-note">{t('gift.codes.none')}</p>
          ) : (
            <ul className="gift-rewards-list">
              {codes.map((c) => (
                <li key={c.code} className="gift-rewards-item">
                  <code className="gift-rewards-code">{c.code}</code>
                  <span className={`gift-rewards-result is-${c.result}`}>
                    <span className="gift-rewards-mark" aria-hidden="true">{c.result === 'redeemed' || c.result === 'already_had' ? '✓' : c.result === 'waiting' ? '…' : '!'}</span>
                    {t(RESULT_KEY[c.result] || 'gift.result.waiting')}
                  </span>
                  <button type="button" className="gift-rewards-copy" onClick={() => copy(c.code)} aria-label={t('gift.copy.aria', { code: c.code })}>
                    {copied === c.code ? t('gift.copied') : t('gift.copy')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {codes.some((c) => c.result === 'problem') ? <p className="gift-rewards-note">{t('gift.result.problemHint')}</p> : null}
          <p className="gift-rewards-note">
            {t('gift.manual')}{' '}
            <a href={data.redemptionSite} target="_blank" rel="noreferrer">{t('gift.siteLink')}</a>
          </p>
        </>
      ) : null}

      <style>{`
        .gift-rewards{display:grid;gap:12px;font-size:14px;line-height:1.5}
        .gift-rewards-intro{margin:0;color:var(--t-secondary,#a9afc0)}
        .gift-rewards-note{margin:0;font-size:13px;color:var(--t-secondary,#a9afc0)}
        .gift-rewards-error{margin:0;color:var(--danger,#f08a8a)}
        .gift-rewards a{color:var(--color-link,#8fb7ff);text-decoration:underline;text-underline-offset:2px}
        .gift-rewards-optin{display:grid;grid-template-columns:auto 1fr;column-gap:12px;row-gap:4px;align-items:start;padding:12px 14px;border:1px solid var(--border-soft,#3a3a3a);border-radius:8px}
        .gift-rewards-optin input{width:22px;height:22px;margin:1px 0 0;accent-color:var(--gold,#d9a94e)}
        .gift-rewards-optin label{font-weight:700;font-size:15px}
        .gift-rewards-optin p{grid-column:2}
        .gift-rewards-optin input:focus-visible{outline:2px solid var(--gold-bright,#f0c368);outline-offset:2px}
        .gift-rewards-heading{margin:4px 0 0;font:700 13px/1.3 var(--font-body,sans-serif);letter-spacing:.08em;text-transform:uppercase;color:var(--t-secondary,#a9afc0)}
        .gift-rewards-list{list-style:none;margin:0;padding:0;display:grid}
        .gift-rewards-item{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px 14px;align-items:center;padding:10px 0;border-top:1px solid var(--border-soft,#3a3a3a)}
        .gift-rewards-code{font-family:var(--font-mono,monospace);font-weight:700;font-size:16px;overflow-wrap:anywhere;user-select:all}
        .gift-rewards-result{display:inline-flex;gap:6px;align-items:center;font-weight:600}
        .gift-rewards-mark{display:inline-grid;place-items:center;width:18px;height:18px;border-radius:50%;font-size:12px;border:1px solid currentColor}
        .gift-rewards-result.is-redeemed,.gift-rewards-result.is-already_had{color:var(--success,#7fd49a)}
        .gift-rewards-result.is-problem,.gift-rewards-result.is-expired{color:var(--ember-bright,#f0a070)}
        .gift-rewards-result.is-waiting{color:var(--t-secondary,#a9afc0)}
        .gift-rewards-copy{min-height:36px;padding:0 14px;background:transparent;color:inherit;border:1px solid var(--border-soft,#3a3a3a);border-radius:6px;font:inherit;font-size:13px;cursor:pointer}
        .gift-rewards-copy:hover{border-color:var(--gold,#d9a94e);color:var(--gold,#d9a94e)}
        .gift-rewards-copy:focus-visible{outline:2px solid var(--gold-bright,#f0c368);outline-offset:2px}
        :root[data-easy="true"] .gift-rewards{font-size:17px}
        :root[data-easy="true"] .gift-rewards-note{font-size:16px}
        :root[data-easy="true"] .gift-rewards-code{font-size:19px}
        :root[data-easy="true"] .gift-rewards-copy{min-height:44px;font-size:16px}
        @media (max-width:520px){
          .gift-rewards-item{grid-template-columns:minmax(0,1fr) auto}
          .gift-rewards-result{grid-column:1}
          .gift-rewards-copy{grid-row:1;grid-column:2}
        }
      `}</style>
    </section>
  );
}

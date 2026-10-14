'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import StatusBand from '../../../../components/admin/giftRedeem/StatusBand';
import CodesPanel from '../../../../components/admin/giftRedeem/CodesPanel';
import PlayersPanel from '../../../../components/admin/giftRedeem/PlayersPanel';
import HistoryPanel from '../../../../components/admin/giftRedeem/HistoryPanel';
import { ago, giftGet, giftPost, startRunNow } from '../../../../components/admin/giftRedeem/giftApi';
import { Button, Callout, Panel, Tag } from '../../../../components/ui';
import {
  BULK_PAUSE_EVERY, BULK_PAUSE_MS, DEFAULT_DELAY_MS, MAX_RETRIES, RETRY_DELAY_MS,
} from '../../../../lib/giftRedeem/constants.mjs';

const RESULT_TEXT = {
  ok: ['OK', 'success'],
  blocked: ['Blocked: the site refused automated access', 'danger'],
  changed_shape: ['Page layout changed: codes could not be read', 'accent'],
  failed: ['Failed: could not reach the page', 'accent'],
  not_used: ['Not read automatically', 'neutral'],
  never_checked: ['Not checked yet', 'neutral'],
};

const AUDIT_LABEL = {
  auto_redeem_on: 'Switched automatic redeeming on',
  auto_redeem_off: 'Switched automatic redeeming off',
  add_players: 'Added players',
  import_players: 'Imported players',
  enable_player: 'Enabled a player',
  disable_player: 'Paused a player',
  remove_player: 'Removed a player',
  reenable_player: 'Re-enabled a failed player',
  add_codes: 'Added codes',
  enable_code: 'Switched a code on',
  disable_code: 'Switched a code off',
  delete_code: 'Deleted a code',
  reprocess_code: 'Reprocessed a code',
  member_opt_in: 'Member turned auto-redeem on',
  member_opt_out: 'Member turned auto-redeem off',
};

function describeResult(action, json) {
  if (action === 'check_sources') {
    const d = json.discovery || {};
    if (!d.refreshed) return 'Nothing was fetched: each source is checked at most once every 30 minutes (or the site is paused).';
    return `Checked ${d.refreshed} source(s). New codes: ${d.new_codes}. No longer listed: ${d.delisted}.`;
  }
  if (action === 'add_codes' || action === 'add_code') {
    const bad = json.rejected?.length ? ` Skipped ${json.rejected.length} that were not valid codes.` : '';
    return `Added ${json.added}, re-enabled ${json.reactivated}, already had ${json.already}.${bad}`;
  }
  if (action === 'add_players') {
    const bad = json.rejected?.length ? ` Skipped ${json.rejected.length} line(s) that were not valid.` : '';
    return `Added ${json.added} player(s). ${json.existing} were already enrolled.${bad}`;
  }
  if (action === 'delete_code') return 'Code deleted.';
  if (action === 'reprocess_code') return `Queued again. ${json.removed} skipped result(s) will be retried.`;
  if (action === 'set_auto_redeem') return json.auto_redeem_enabled ? 'Automatic redeeming is on.' : 'Automatic redeeming is off.';
  return 'Done.';
}

export default function AdminGiftCodesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [overview, setOverview] = useState(null);
  const [busy, setBusy] = useState('');
  const [confirmState, setConfirmState] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);
  const pollRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const json = await giftGet();
      setOverview(json);
      setError('');
      return json;
    } catch (err) {
      setError(err.message || 'Unable to load gift codes.');
      return null;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Poll while a run is going (or just asked for); otherwise stay quiet.
  const running = overview?.runner?.state === 'running';
  const [watching, setWatching] = useState(0);
  useEffect(() => {
    if (!running && !watching) return undefined;
    pollRef.current = setInterval(async () => {
      const json = await load();
      setReloadKey((k) => k + 1);
      if (json && json.runner.state !== 'running') setWatching((w) => (w > 0 ? w - 1 : 0));
    }, 4000);
    return () => clearInterval(pollRef.current);
  }, [running, watching, load]);

  async function runAction(action, payload = {}, { quiet = false } = {}) {
    setBusy(action);
    setStatus('');
    setError('');
    try {
      const json = await giftPost(action, payload);
      if (!quiet) setStatus(describeResult(action, json));
      await load();
      setReloadKey((k) => k + 1);
      return json;
    } catch (err) {
      setError(err.message || 'Action failed');
      return null;
    } finally {
      setBusy('');
    }
  }

  async function runNow() {
    setBusy('run');
    setError('');
    try {
      await startRunNow();
      setStatus('Started. Progress shows below.');
      setWatching(3);
      setTimeout(load, 1200);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy('');
    }
  }

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  const c = overview?.counters;
  const dash = (v) => (c ? v : '—');
  const sources = overview?.sources || [];

  return (
    <AdminShell
      title="Gift codes"
      subtitle="Finds new Kingdom 710 gift codes and redeems them for enrolled players automatically"
      onLogout={handleLogout}
      counters={[
        { label: 'Ready', value: dash(c?.ready) },
        { label: 'Redeemed', value: dash(c?.redeemed) },
        { label: 'Already had it', value: dash(c?.already_had) },
        { label: 'Expired', value: dash(c?.expired) },
        { label: 'Login failed', value: dash(c?.login_failed) },
        { label: 'Skipped', value: dash(c?.skipped) },
      ]}
    >
      <div className="gift-page">
        {error ? <Callout tone="danger">{error}</Callout> : null}
        {status ? <Callout tone="success">{status}</Callout> : null}

        <StatusBand
          overview={overview}
          busy={busy}
          onToggle={(enabled) => runAction('set_auto_redeem', { enabled })}
          onRun={runNow}
        />

        <CodesPanel overview={overview} loading={loading} busy={busy} onAction={runAction} onConfirm={setConfirmState} />

        <PlayersPanel busy={busy} reloadKey={reloadKey} onAction={runAction} onConfirm={setConfirmState} onNotice={setStatus} />

        <HistoryPanel reloadKey={reloadKey} />

        <Panel title="Code sources" description="Where new codes are found. Each site is contacted at most once every 30 minutes, and if a site fails or refuses, your existing codes stay exactly as they are.">
          <ul className="gift-sources">
            {sources.map((src, i) => {
              const [label, tone] = RESULT_TEXT[src.result] || RESULT_TEXT.failed;
              return (
                <li key={src.id}>
                  <div className="gift-source-row">
                    <a href={src.url} target="_blank" rel="noreferrer">{src.label}</a>
                    <Tag>{i === 0 ? 'Primary' : 'Backup'}</Tag>
                    <Tag tone={tone}>{label}</Tag>
                    <span>Last checked: {ago(src.last_checked_at)}</span>
                    <span>Codes found: {src.codes_found ?? '—'}</span>
                  </div>
                  {!src.enabled ? <p className="hint">{src.note} Use the link to copy codes by hand.</p> : null}
                  {src.paused_until && src.result === 'blocked' ? <p className="hint">Paused until {new Date(src.paused_until).toLocaleString()}.</p> : null}
                </li>
              );
            })}
          </ul>
          <div className="gift-actions">
            <Button disabled={Boolean(busy)} onClick={() => runAction('check_sources')}>
              {busy === 'check_sources' ? 'Checking…' : 'Check now'}
            </Button>
            <Button
              variant="quiet"
              disabled={Boolean(busy)}
              title="Ignores the 30 minute wait and contacts the gift code sites right now. A site that refuses access is never forced."
              onClick={() => setConfirmState({
                title: 'Force a check?',
                message: 'This ignores the 30 minute wait and contacts the gift code sites again right now. Use it sparingly; a site that refuses access is never forced.',
                confirmLabel: 'Force check',
                danger: false,
                onConfirm: () => runAction('check_sources', { force: true }),
              })}
            >
              Force check
            </Button>
          </div>
        </Panel>

        <Panel title="Pacing" description="Fixed delays, copied from the Discord bot. They cannot be changed here.">
          <ul className="gift-pacing">
            <li><strong>{DEFAULT_DELAY_MS / 1000} s</strong> pause after every player</li>
            <li><strong>{RETRY_DELAY_MS / 1000} s</strong> between tries for the same player, up to <strong>{MAX_RETRIES}</strong> tries</li>
            <li><strong>{BULK_PAUSE_MS / 1000} s</strong> extra pause after every <strong>{BULK_PAUSE_EVERY}th</strong> player</li>
            <li>If the game says a code is expired, that code stops for everyone and is switched off</li>
            <li>If the game says a player cannot log in, that player is marked failed and skipped until you re-enable them</li>
            <li>Long lists are done in several short runs; each run picks up where the last one stopped</li>
          </ul>
        </Panel>

        <Panel title="Recent changes" description="Who changed what on this page, newest first.">
          {(overview?.audit || []).length === 0 ? (
            <p>No changes recorded yet.</p>
          ) : (
            <ul className="gift-audit">
              {overview.audit.map((a, i) => (
                <li key={`${a.at}-${i}`}>
                  <span className="hint">{ago(a.at)}</span>
                  <span>{AUDIT_LABEL[a.action] || a.action}{a.target && a.target !== 'switch' ? `: ${a.target}` : ''}</span>
                  <span className="hint">by {a.actor}{a.detail ? ` · ${a.detail}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <ConfirmDialog
        open={Boolean(confirmState)}
        title={confirmState?.title}
        message={confirmState?.message}
        confirmLabel={confirmState?.confirmLabel}
        danger={confirmState?.danger !== false}
        onCancel={() => setConfirmState(null)}
        onConfirm={() => {
          const fn = confirmState?.onConfirm;
          setConfirmState(null);
          if (fn) fn();
        }}
      />

      <style>{`
        .gift-page{display:grid;grid-template-columns:minmax(0,1fr);gap:18px}
        .gift-page .hint{margin:2px 0 0;font-size:12px}
        .gift-band{display:grid;gap:10px;border:1px solid var(--border-soft);border-radius:8px;padding:14px 16px;background:rgba(255,255,255,0.02)}
        .gift-band-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px;align-items:start}
        .gift-band-cell{min-width:0}
        .gift-band-label{margin:0 0 6px;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--text-muted);font-weight:700}
        .gift-band-value{margin:0;font-size:14px}
        .gift-band-action{display:flex;flex-direction:column;align-items:flex-start;gap:4px}
        .gift-num{font-family:var(--font-mono);font-variant-numeric:tabular-nums}
        .gift-sub{display:block}
        .gift-actions{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
        .gift-codes-table .gift-actions{flex-direction:column;align-items:stretch}
        .gift-codes-table .gift-actions .ui-btn{white-space:normal;height:auto;min-height:34px;padding-block:6px;text-align:left;justify-content:flex-start}
        .gift-codes-table td:last-child{min-width:170px}
        .gift-danger{color:var(--ember-bright)}
        .gift-add{margin-bottom:14px}
        .gift-add summary{cursor:pointer;font-weight:700;margin-bottom:8px;min-height:32px;display:flex;align-items:center}
        .gift-add summary:focus-visible{outline:2px solid var(--gold-bright);outline-offset:2px}
        .gift-add-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin-bottom:16px}
        .gift-filters{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:12px}
        .gift-flag{margin-left:8px}
        .gift-pager{display:flex;gap:12px;align-items:center;justify-content:flex-end;margin-top:10px;flex-wrap:wrap}
        .gift-search{display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap}
        .gift-search .ui-input{flex:1;min-width:180px}
        .gift-sources{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:10px}
        .gift-sources li{border-top:1px solid var(--line);padding-top:10px}
        .gift-source-row{display:flex;flex-wrap:wrap;gap:6px 14px;align-items:center}
        .gift-source-row a{color:inherit;font-weight:700;text-decoration:underline}
        .gift-pacing{margin:0;padding-left:18px;display:grid;gap:4px}
        .gift-audit{list-style:none;margin:0;padding:0;display:grid;gap:6px}
        .gift-audit li{display:grid;grid-template-columns:110px minmax(0,1fr) minmax(0,1.2fr);gap:12px;align-items:baseline;border-top:1px solid var(--line);padding-top:6px}
        @media (max-width: 900px){
          .gift-band-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
          .gift-filters{grid-template-columns:repeat(2,minmax(0,1fr))}
        }
        @media (max-width: 640px){
          .gift-band-grid,.gift-add-grid{grid-template-columns:minmax(0,1fr)}
          .gift-audit li{grid-template-columns:minmax(0,1fr);gap:2px}
          .gift-pager{justify-content:space-between}
        }
      `}</style>
    </AdminShell>
  );
}

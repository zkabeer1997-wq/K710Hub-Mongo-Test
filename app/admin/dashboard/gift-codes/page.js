'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import { Button, Callout, Field, Input, Panel, Table, Tag, Textarea } from '../../../../components/ui';

const RESULT_TEXT = {
  ok: ['OK', 'success'],
  blocked: ['Blocked: the site refused automated access', 'danger'],
  changed_shape: ['Page layout changed: codes could not be read', 'accent'],
  failed: ['Failed: could not reach the page', 'accent'],
  not_used: ['Not read automatically', 'neutral'],
  never_checked: ['Not checked yet', 'neutral'],
};

function ago(iso) {
  if (!iso) return 'never';
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 2) return 'just now';
  if (min < 90) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 36 ? `${h} h ago` : `${Math.round(h / 24)} days ago`;
}

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
  return 'Done.';
}

export default function AdminGiftCodesPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState(null);
  const [query, setQuery] = useState('');
  const [history, setHistory] = useState([]);
  const [newCode, setNewCode] = useState('');
  const [enrollId, setEnrollId] = useState('');
  const [busy, setBusy] = useState('');
  const [pasteText, setPasteText] = useState('');

  const load = useCallback(async (q = '') => {
    setLoading(true);
    setError('');
    try {
      const url = q ? `/api/admin-gift-codes?q=${encodeURIComponent(q)}` : '/api/admin-gift-codes';
      const res = await fetch(url, { cache: 'no-store' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to load');
      setData(json);
      setHistory(json.history || []);
    } catch (err) {
      setError(err.message || 'Unable to load gift codes.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function runAction(action, payload = {}) {
    setBusy(action);
    setStatus('');
    setError('');
    try {
      const res = await fetch('/api/admin-gift-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ...payload }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Action failed');
      setStatus(describeResult(action, json));
      await load(query);
      return json;
    } catch (err) {
      setError(err.message || 'Action failed');
    } finally {
      setBusy('');
    }
  }

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  const totals = data?.totals || {};
  const codes = data?.codes || [];

  return (
    <AdminShell
      title="Gift codes"
      subtitle="Automatic code discovery + member alerts for Kingdom 710 — members redeem themselves"
      onLogout={handleLogout}
      counters={[
        { label: 'Ready to redeem', value: totals.pending ?? '—' },
        { label: 'Redeemed', value: totals.redeemed ?? '—' },
        { label: 'Already had it', value: totals.already_redeemed ?? '—' },
        { label: 'Skipped', value: totals.skipped ?? '—' },
      ]}
    >
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {status ? <Callout tone="success">{status}</Callout> : null}

      <Panel title="Code sources">
        <p style={{ marginBottom: '0.75rem' }}>
          Codes are read from public lists once a day (and on request below). Each site is contacted at most once
          every 30 minutes, and if a site fails or refuses, your existing codes stay exactly as they are. Members
          redeem themselves at Century Games and confirm the result in their own panel.
        </p>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.75rem' }}>
          {(data?.sources || []).map((src, i) => {
            const [label, tone] = RESULT_TEXT[src.result] || RESULT_TEXT.failed;
            return (
              <li key={src.id} style={{ borderTop: '1px solid rgba(255,255,255,0.12)', paddingTop: '0.75rem' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1rem', alignItems: 'center' }}>
                  <a href={src.url} target="_blank" rel="noreferrer" style={{ color: 'inherit', fontWeight: 600, textDecoration: 'underline' }}>{src.label}</a>
                  <Tag>{i === 0 ? 'Primary' : 'Backup'}</Tag>
                  <Tag tone={tone}>{label}</Tag>
                  <span>Last checked: {ago(src.last_checked_at)}</span>
                  <span>Codes found: {src.codes_found ?? '—'}</span>
                </div>
                {!src.enabled ? <p className="hint" style={{ margin: '0.35rem 0 0' }}>{src.note} Use the link to copy codes by hand.</p> : null}
                {src.paused_until && src.result === 'blocked' ? <p className="hint" style={{ margin: '0.35rem 0 0' }}>Paused until {new Date(src.paused_until).toLocaleString()}.</p> : null}
              </li>
            );
          })}
        </ul>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginTop: '0.75rem' }}>
          <Button disabled={!!busy} onClick={() => runAction('check_sources')}>
            {busy === 'check_sources' ? 'Checking…' : 'Check now'}
          </Button>
          <details className="roster-more">
            <summary aria-label="More ways to check">More</summary>
            <div className="roster-more-menu">
              <button
                type="button"
                disabled={!!busy}
                title="Ignores the 30 minute wait and contacts the gift code sites right now. Use sparingly; a site that refuses access is never forced."
                onClick={() => {
                  if (window.confirm('Force check? This ignores the 30 minute wait and contacts the gift code sites again right now. Use it sparingly; a site that refuses access is never forced.')) {
                    runAction('check_sources', { force: true });
                  }
                }}
              >
                Force check
              </button>
            </div>
          </details>
          <Button variant="quiet" href="https://kingshot.net/gift-codes" target="_blank" rel="noreferrer">Open kingshot.net/gift-codes</Button>
          <Button variant="quiet" href="https://kingshotmastery.com/gift-codes" target="_blank" rel="noreferrer">Open kingshotmastery.com/gift-codes</Button>
        </div>
      </Panel>

      <Panel title="Paste codes">
        <p style={{ marginBottom: '0.5rem' }}>
          Copy codes from either site and paste them here, one per line or separated by spaces or commas. Spelling and
          capital letters are kept exactly as typed. Only letters and digits (4 to 32 characters) are accepted.
        </p>
        <Field label="Codes to add">
          <Textarea rows={4} value={pasteText} onChange={(e) => setPasteText(e.target.value)} aria-label="Codes to add" placeholder={'Kingshot888\nVIP777'} />
        </Field>
        <Button
          disabled={!!busy || !pasteText.trim()}
          onClick={async () => {
            const r = await runAction('add_codes', { text: pasteText });
            if (r) setPasteText('');
          }}
        >
          {busy === 'add_codes' ? 'Adding…' : 'Add these codes'}
        </Button>
      </Panel>

      <Panel title="Active codes">
        {loading && !codes.length ? (
          <p>Loading…</p>
        ) : codes.length === 0 ? (
          <p>No codes stored yet. Use “Check now” or paste codes above.</p>
        ) : (
          <Table className="stack-table">
            <thead>
              <tr>
                <th>Code</th>
                <th>Source</th>
                <th>Active</th>
                <th>Discovered</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {codes.map((c) => (
                <tr key={c.id || c.code}>
                  <td>
                    <code>{c.code}</code>
                  </td>
                  <td>{c.source}</td>
                  <td>
                    <Tag tone={c.active ? 'success' : 'neutral'}>{c.active ? 'Active' : 'Off'}</Tag>
                  </td>
                  <td>{c.discovered_at ? new Date(c.discovered_at).toLocaleString() : '—'}</td>
                  <td>
                    <Button
                      size="sm"
                      disabled={!!busy}
                      onClick={() =>
                        runAction('set_code_active', { code: c.code, active: !c.active })
                      }
                    >
                      {c.active ? 'Disable' : 'Enable'}
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}

        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem', alignItems: 'flex-end' }}>
          <Field label="Add code">
            <Input
              value={newCode}
              onChange={(e) => setNewCode(e.target.value)}
              aria-label="e.g. Kingshot888 (exact spelling matters)" placeholder="e.g. Kingshot888 (exact spelling matters)"
            />
          </Field>
          <Button
            disabled={!!busy || newCode.trim().length < 4}
            onClick={async () => {
              await runAction('add_code', { code: newCode.trim() });
              setNewCode('');
            }}
          >
            Add code
          </Button>
        </div>
      </Panel>

      <Panel title="Enroll existing member">
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Member ID / Player ID">
            <Input value={enrollId} onChange={(e) => setEnrollId(e.target.value)} aria-label="In-game ID" placeholder="In-game ID" />
          </Field>
          <Button
            disabled={!!busy || !enrollId.trim()}
            onClick={async () => {
              await runAction('enroll_member', { memberId: enrollId.trim(), playerId: enrollId.trim() });
              setEnrollId('');
            }}
          >
            Enroll + queue active codes
          </Button>
        </div>
      </Panel>

      <Panel title="Redemption history search">
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.75rem' }}>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Player ID or code" placeholder="Player ID or code"
            onKeyDown={(e) => {
              if (e.key === 'Enter') load(query);
            }}
          />
          <Button onClick={() => load(query)}>Search</Button>
        </div>
        {history.length === 0 ? (
          <p style={{ opacity: 0.8 }}>No matching history. Search by player ID or code.</p>
        ) : (
          <Table className="stack-table">
            <thead>
              <tr>
                <th>Player</th>
                <th>Code</th>
                <th>Status</th>
                <th>Attempts</th>
                <th>Updated</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id}>
                  <td>{h.player_id}</td>
                  <td>
                    <code>{h.code}</code>
                  </td>
                  <td>
                    <Tag>{h.status}</Tag>
                  </td>
                  <td>{h.attempts}</td>
                  <td>
                    {h.completed_at || h.created_at
                      ? new Date(h.completed_at || h.created_at).toLocaleString()
                      : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Panel>
    </AdminShell>
  );
}

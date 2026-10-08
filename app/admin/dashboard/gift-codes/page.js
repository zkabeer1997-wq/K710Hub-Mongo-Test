'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import { Button, Callout, Field, Input, Panel, Table, Tag } from '../../../../components/ui';

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
      setStatus(`${action} completed.`);
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
  const lastCheck = data?.lastCheck;

  return (
    <AdminShell
      title="Gift Codes"
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

      <Panel title="Automation status">
        <p style={{ marginBottom: '0.75rem' }}>
          Discovery and per-member queueing are automatic (daily wiki check). Submission to
          Century Games (ks-giftcode.centurygame.com) is not automated — their redemption API
          requires a signed request we cannot forge without their authorization. Each enrolled
          member sees new codes in their own Gift Code Rewards panel and redeems themselves,
          then confirms the result there.
        </p>
        <p style={{ marginBottom: '0.75rem', opacity: 0.85 }}>
          Last wiki check:{' '}
          {lastCheck
            ? `${lastCheck.success ? 'OK' : 'FAILED'} at ${new Date(lastCheck.checked_at).toLocaleString()} · found ${lastCheck.codes_found} · new ${lastCheck.new_codes}`
            : 'None yet'}
        </p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
          <Button disabled={!!busy} onClick={() => runAction('check_wiki')}>
            {busy === 'check_wiki' ? 'Checking…' : 'Check for codes'}
          </Button>
        </div>
      </Panel>

      <Panel title="Active codes">
        {loading && !codes.length ? (
          <p>Loading…</p>
        ) : codes.length === 0 ? (
          <p>No codes stored yet. Run “Check for codes” or add one manually.</p>
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

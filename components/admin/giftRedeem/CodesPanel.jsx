'use client';

import { useState } from 'react';
import { Button, Field, Panel, Table, Tag, Textarea } from '../../ui';
import { STATUS_LABEL } from './giftApi';

function codeState(c, runner) {
  if (c.active === false) {
    return c.expired_reason === 'game_expired' ? ['Expired by the game', 'neutral'] : ['Off', 'neutral'];
  }
  if (runner.state === 'running' && runner.progress?.code === c.code) return ['Running', 'accent'];
  if (c.redeem_status === 'done' || (c.total > 0 && c.pending === 0)) return ['Done', 'success'];
  if (c.total === 0) return ['No players yet', 'neutral'];
  return ['Waiting', 'accent'];
}

function breakdown(byStatus) {
  const parts = Object.entries(byStatus || {}).map(([k, n]) => `${n} ${(STATUS_LABEL[k] || k).toLowerCase()}`);
  return parts.length ? parts.join(' · ') : '—';
}

export default function CodesPanel({ overview, busy, loading, onAction, onConfirm }) {
  const [paste, setPaste] = useState('');
  const codes = overview?.codes || [];
  const runner = overview?.runner || {};

  return (
    <Panel
      title="Codes"
      description="New codes arrive from the public lists or from you. Switching a code off or deleting it stops it from ever being redeemed."
    >
      <details className="gift-add" open={codes.length === 0}>
        <summary>Add codes by hand</summary>
        <Field label="Codes to add" hint="One per line or separated by spaces or commas. Capital letters are kept exactly. Letters and digits only, 4 to 32 characters.">
          <Textarea rows={3} value={paste} onChange={(e) => setPaste(e.target.value)} aria-label="Codes to add" placeholder={'Kingshot888\nVIP777'} />
        </Field>
        <Button
          disabled={Boolean(busy) || !paste.trim()}
          onClick={async () => {
            const r = await onAction('add_codes', { text: paste });
            if (r) setPaste('');
          }}
        >
          {busy === 'add_codes' ? 'Adding…' : 'Add these codes'}
        </Button>
      </details>

      {loading && !codes.length ? (
        <p>Loading…</p>
      ) : codes.length === 0 ? (
        <p>No codes stored yet. Use “Check now” below or add codes by hand.</p>
      ) : (
        <Table className="stack-table gift-codes-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Source</th>
              <th>Status</th>
              <th>Processed</th>
              <th>Rewards / expiry</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {codes.map((c) => {
              const [label, tone] = codeState(c, runner);
              const on = c.active !== false;
              return (
                <tr key={c.code}>
                  <td><code>{c.code}</code></td>
                  <td>{c.source || '—'}</td>
                  <td><Tag tone={tone}>{label}</Tag></td>
                  <td>
                    <strong className="gift-num">{c.processed} of {c.total}</strong>
                    <span className="hint gift-sub">{breakdown(c.by_status)}</span>
                  </td>
                  <td>
                    {c.rewards ? <span>{String(c.rewards).slice(0, 80)}</span> : <span className="hint">Not listed</span>}
                    {c.expires_at ? <span className="hint gift-sub">Expires {new Date(c.expires_at).toLocaleDateString()}</span> : null}
                  </td>
                  <td>
                    <div className="gift-actions">
                      {on ? (
                        <Button variant="quiet" className="ec-btn-sm" disabled={Boolean(busy)} onClick={() => onConfirm({
                          title: `Switch off ${c.code}?`,
                          message: 'It will not be redeemed for anyone from now on. Results already recorded stay. You can switch it back on later.',
                          confirmLabel: 'Switch off',
                          onConfirm: () => onAction('set_code_active', { code: c.code, active: false }),
                        })}>Switch off</Button>
                      ) : (
                        <Button variant="quiet" className="ec-btn-sm" disabled={Boolean(busy)} onClick={() => onAction('set_code_active', { code: c.code, active: true })}>Switch on</Button>
                      )}
                      {on ? (
                        <Button variant="quiet" className="ec-btn-sm" disabled={Boolean(busy)} title="Retries players that were skipped or got an unclear answer, then redeems anyone not yet processed." onClick={() => onAction('reprocess_code', { code: c.code })}>Reprocess unprocessed players</Button>
                      ) : null}
                      <Button variant="quiet" className="ec-btn-sm gift-danger" disabled={Boolean(busy)} onClick={() => onConfirm({
                        title: `Delete ${c.code}?`,
                        message: 'The code and every recorded result for it are removed. If a list still shows this code it will come back as new and be redeemed again for players who already have it (they will just get "already had it").',
                        confirmLabel: 'Delete code',
                        onConfirm: () => onAction('delete_code', { code: c.code }),
                      })}>Delete</Button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Panel>
  );
}

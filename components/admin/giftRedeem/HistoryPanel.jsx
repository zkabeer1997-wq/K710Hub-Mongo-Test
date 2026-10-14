'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Callout, Input, Panel, Table, Tag } from '../../ui';
import { giftGet, STATUS_LABEL, STATUS_TONE } from './giftApi';

const PAGE = 20;

export default function HistoryPanel({ reloadKey }) {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await giftGet({ view: 'history', q: applied, page, limit: PAGE }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => { load(); }, [load, reloadKey]);
  const pages = Math.max(1, Math.ceil(data.total / PAGE));

  return (
    <Panel title="Redemption history" description="One final result per player and code. Search by player ID or by code.">
      <form
        className="gift-search"
        onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(query.trim()); }}
      >
        <Input value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Player ID or code" placeholder="Player ID or code" />
        <Button type="submit">Search</Button>
        {applied ? <Button variant="quiet" onClick={() => { setQuery(''); setApplied(''); setPage(1); }}>Clear</Button> : null}
      </form>
      {error ? <Callout tone="danger">{error}</Callout> : null}
      {loading && !data.rows.length ? <p>Loading…</p> : data.rows.length === 0 ? (
        <p>{applied ? 'No results match that search.' : 'Nothing has been redeemed yet.'}</p>
      ) : (
        <Table className="stack-table">
          <thead><tr><th>Player</th><th>Code</th><th>Result</th><th>Tries</th><th>Game reply</th><th>When</th></tr></thead>
          <tbody>
            {data.rows.map((h) => (
              <tr key={`${h.code}-${h.player_id}`}>
                <td><span className="gift-num">{h.player_id}</span></td>
                <td><code>{h.code}</code></td>
                <td><Tag tone={STATUS_TONE[h.status] || 'neutral'}>{STATUS_LABEL[h.status] || h.status}</Tag></td>
                <td><span className="gift-num">{h.attempts}</span></td>
                <td><span className="hint">{h.err_code ?? '—'}{h.msg ? ` · ${h.msg}` : ''}</span></td>
                <td>{h.updated_at ? new Date(h.updated_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="gift-pager">
        <span className="hint">{data.total} result(s)</span>
        <Button variant="quiet" className="ec-btn-sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Previous</Button>
        <span className="hint">Page {page} of {pages}</span>
        <Button variant="quiet" className="ec-btn-sm" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>Next</Button>
      </div>
    </Panel>
  );
}

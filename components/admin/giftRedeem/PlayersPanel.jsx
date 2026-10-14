'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button, Callout, Field, Input, Panel, Select, Table, Tag, Textarea } from '../../ui';
import { parseBotImport } from '../../../lib/giftRedeem/players.mjs';
import { giftGet } from './giftApi';

const PAGE = 25;
const SOURCE_LABEL = { member: 'Member', admin: 'Admin', bot_import: 'Bot import' };
const EMPTY_FILTERS = { enabled: '', failed: '', source: '', kingdom: '', q: '' };

export default function PlayersPanel({ busy, reloadKey, onAction, onConfirm, onNotice }) {
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [bulk, setBulk] = useState('');
  const [preview, setPreview] = useState(null);
  const fileRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setData(await giftGet({ view: 'players', page, limit: PAGE, ...filters }));
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, filters]);

  useEffect(() => { load(); }, [load, reloadKey]);

  const setFilter = (key, value) => { setPage(1); setFilters((f) => ({ ...f, [key]: value })); };
  const pages = Math.max(1, Math.ceil(data.total / PAGE));

  async function pickFile(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setPreview(null);
    if (file.size > 3_000_000) { setPreview({ error: 'That file is too large to be one of the bot lists.' }); return; }
    try {
      // The file is read here in the browser; only the parsed {player_id, kingdom_id} list is sent to the server.
      const parsed = parseBotImport(JSON.parse(await file.text()));
      if (parsed.kind === 'unknown' || !parsed.players.length) {
        setPreview({ error: 'This does not look like the bot\'s player_ids.json or player_submissions.json, or it has no usable players.' });
        return;
      }
      setPreview({ ...parsed, name: file.name });
    } catch {
      setPreview({ error: 'Could not read that file. Choose the bot\'s player_ids.json or player_submissions.json.' });
    }
  }

  async function confirmImport() {
    const rows = preview.players.map((p) => ({ player_id: p.player_id, kingdom_id: p.kingdom_id, failed: p.failed }));
    let added = 0;
    let existing = 0;
    try {
      for (let i = 0; i < rows.length; i += 1000) {
        const r = await onAction('import_players', { players: rows.slice(i, i + 1000) }, { quiet: true });
        if (!r) return;
        added += r.added; existing += r.existing;
      }
      onNotice(`Imported ${added} new player(s). ${existing} were already enrolled and were not duplicated.`);
      setPreview(null);
    } catch { /* onAction already surfaced the error */ }
  }

  const otherKingdoms = preview?.players?.filter((p) => p.kingdom_id !== '710').length || 0;
  const botFailed = preview?.players?.filter((p) => p.failed).length || 0;

  return (
    <Panel
      title="Players"
      description="Players the runner redeems for. Members who turn the option on in their own dashboard appear here too; you can pause them, but they stay in control of their own choice."
    >
      <div className="gift-add-grid">
        <div>
          <Field label="Add players" hint="One pair per line: Player ID, then kingdom number. Example: 106599852 710">
            <Textarea rows={4} value={bulk} onChange={(e) => setBulk(e.target.value)} aria-label="Players to add, one per line" placeholder={'106599852 710\n123456789 523'} />
          </Field>
          <Button
            disabled={Boolean(busy) || !bulk.trim()}
            onClick={async () => {
              const r = await onAction('add_players', { text: bulk });
              if (r) setBulk('');
            }}
          >
            {busy === 'add_players' ? 'Adding…' : 'Add players'}
          </Button>
        </div>
        <div>
          <Field label="Import from the Discord bot" hint="Choose the bot's player_ids.json or player_submissions.json. The file is read in your browser; only the player IDs and kingdoms are sent.">
            <input ref={fileRef} type="file" accept="application/json,.json" className="ui-input" aria-label="Bot player file" onChange={pickFile} />
          </Field>
          {preview?.error ? <Callout tone="danger">{preview.error}</Callout> : null}
          {preview && !preview.error ? (
            <Callout tone="info" title={`${preview.players.length} player(s) found in ${preview.name}`}>
              <p>
                {otherKingdoms ? `${otherKingdoms} are in other kingdoms (allowed, flagged in the table). ` : ''}
                {botFailed ? `${botFailed} were already marked failed by the bot and will stay paused. ` : ''}
                {preview.skipped_no_kingdom ? `${preview.skipped_no_kingdom} have no kingdom and are skipped. ` : ''}
                {preview.invalid ? `${preview.invalid} have an invalid ID and are skipped. ` : ''}
                Players already enrolled are not duplicated.
              </p>
              <div className="gift-actions">
                <Button disabled={Boolean(busy)} onClick={confirmImport}>{busy === 'import_players' ? 'Importing…' : `Add ${preview.players.length} players`}</Button>
                <Button variant="quiet" onClick={() => setPreview(null)}>Cancel</Button>
              </div>
            </Callout>
          ) : null}
        </div>
      </div>

      <div className="gift-filters" role="group" aria-label="Filter players">
        <Field label="Search ID"><Input value={filters.q} inputMode="numeric" onChange={(e) => setFilter('q', e.target.value)} aria-label="Search by player ID" placeholder="Starts with…" /></Field>
        <Field label="Enabled">
          <Select value={filters.enabled} onChange={(e) => setFilter('enabled', e.target.value)} aria-label="Filter by enabled">
            <option value="">All</option><option value="yes">Enabled</option><option value="no">Paused</option>
          </Select>
        </Field>
        <Field label="Game status">
          <Select value={filters.failed} onChange={(e) => setFilter('failed', e.target.value)} aria-label="Filter by failed">
            <option value="">All</option><option value="yes">Failed</option><option value="no">Not failed</option>
          </Select>
        </Field>
        <Field label="Source">
          <Select value={filters.source} onChange={(e) => setFilter('source', e.target.value)} aria-label="Filter by source">
            <option value="">All</option><option value="member">Member</option><option value="admin">Admin</option><option value="bot_import">Bot import</option>
          </Select>
        </Field>
        <Field label="Kingdom"><Input value={filters.kingdom} inputMode="numeric" onChange={(e) => setFilter('kingdom', e.target.value)} aria-label="Filter by kingdom" placeholder="e.g. 710" /></Field>
      </div>

      {error ? <Callout tone="danger">{error}</Callout> : null}
      {loading && !data.rows.length ? (
        <p>Loading…</p>
      ) : data.rows.length === 0 ? (
        <p>{data.total === 0 && Object.values(filters).every((v) => !v) ? 'No players yet. Add some above, or members can opt in from their dashboard.' : 'No players match these filters.'}</p>
      ) : (
        <Table className="stack-table gift-players-table">
          <thead>
            <tr><th>Player ID</th><th>Kingdom</th><th>Source</th><th>Status</th><th>Added</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {data.rows.map((p) => (
              <tr key={p.player_id}>
                <td><span className="gift-num">{p.player_id}</span></td>
                <td>
                  <span className="gift-num">{p.kingdom_id}</span>
                  {p.kingdom_id !== '710' ? <Tag tone="accent" className="gift-flag">Other kingdom</Tag> : null}
                </td>
                <td>{SOURCE_LABEL[p.source] || p.source}</td>
                <td>
                  {p.failed ? <Tag tone="danger">Failed (game)</Tag> : p.enabled ? <Tag tone="success">Enabled</Tag> : <Tag>Paused</Tag>}
                </td>
                <td>{p.created_at ? new Date(p.created_at).toLocaleDateString() : '—'}</td>
                <td>
                  <div className="gift-actions">
                    {p.failed ? (
                      <Button variant="quiet" className="ec-btn-sm" disabled={Boolean(busy)} onClick={() => onAction('reenable_player', { player_id: p.player_id })}>Re-enable</Button>
                    ) : (
                      <Button variant="quiet" className="ec-btn-sm" disabled={Boolean(busy)} onClick={() => onAction('set_player_enabled', { player_id: p.player_id, enabled: !p.enabled })}>{p.enabled ? 'Pause' : 'Enable'}</Button>
                    )}
                    <Button variant="quiet" className="ec-btn-sm gift-danger" disabled={Boolean(busy)} onClick={() => onConfirm({
                      title: `Remove player ${p.player_id}?`,
                      message: 'They will no longer be redeemed for. Their past results stay in the history.',
                      confirmLabel: 'Remove player',
                      onConfirm: () => onAction('remove_player', { player_id: p.player_id }),
                    })}>Remove</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <div className="gift-pager">
        <span className="hint">{data.total} player(s)</span>
        <Button variant="quiet" className="ec-btn-sm" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>Previous</Button>
        <span className="hint">Page {page} of {pages}</span>
        <Button variant="quiet" className="ec-btn-sm" disabled={page >= pages} onClick={() => setPage((n) => n + 1)}>Next</Button>
      </div>
    </Panel>
  );
}

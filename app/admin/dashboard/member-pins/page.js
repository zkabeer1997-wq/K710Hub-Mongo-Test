'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TableFilters from '../../../../components/admin/TableFilters';
import { compareValues, searchRow, numericValue } from '../../../../lib/adminTable.mjs';
import { profileSummary } from '../../../../lib/memberProfiles.mjs';
import { parseCharmSelections, parseGovernorGearSelections, GOVERNOR_GEAR_OPTIONS } from '../../../../lib/powerProfiles.mjs';
import { formatUnitLevel } from '../../../../lib/kvkMembersExport.mjs';
import AdminShell from '../../../../components/admin/AdminShell';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Callout, Field, Input, Panel, Table, Tag } from '../../../../components/ui';

const EMPTY_MEMBER = { name: '', memberId: '' };

function giftStatusLabel(status) {
  switch (status) {
    case 'redeemed': return 'Redeemed';
    case 'already_redeemed': return 'Already redeemed';
    case 'pending':
    case 'processing': return 'Pending';
    case 'temporary_failure': return 'Retrying';
    case 'expired':
    case 'invalid_code': return 'Code invalid/expired';
    case 'invalid_player': return 'Player issue';
    default: return status || '—';
  }
}

export default function AdminMembersPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ alliance: '', gear: '', charm: '', pet: '', master: '', mystic: '' });
  const [sort, setSort] = useState('name');
  const [descending, setDescending] = useState(false);
  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  const [showCreate, setShowCreate] = useState(false);
  const [newMember, setNewMember] = useState(EMPTY_MEMBER);
  const [creating, setCreating] = useState(false);
  const router = useRouter();

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/admin-member-pins', { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || 'Could not load members.');
        if (active) setRows(result.rows || []);
      } catch (loadError) {
        if (active) setError(loadError.message || 'Could not load members.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, []);

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  function openCreate() {
    setError('');
    setStatus('');
    setNewMember({ ...EMPTY_MEMBER });
    setShowCreate(true);
  }

  function closeCreate() {
    if (creating) return;
    setShowCreate(false);
    setNewMember(EMPTY_MEMBER);
  }

  function setCreateField(key, value) {
    setNewMember((current) => ({ ...current, [key]: value }));
  }

  async function createMember(event) {
    event.preventDefault();
    setError('');
    setStatus('');

    const name = newMember.name.trim();
    const memberId = newMember.memberId.trim();

    if (!name || !memberId) {
      setError('Name and Player ID are required.');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/admin-member-pins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, memberId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create member.');

      const createdRow = result.row || {
        name,
        member_id: memberId,
        updated_at: null,
      };
      setRows((current) => [...current, createdRow].sort((a, b) => (
        String(a.name || '').localeCompare(String(b.name || ''))
      )));
      setStatus(`Added ${name} (${memberId}). They sign in with their Player ID.`);
      setShowCreate(false);
      setNewMember(EMPTY_MEMBER);
    } catch (createError) {
      setError(createError.message || 'Unable to create member.');
    } finally {
      setCreating(false);
    }
  }

  const visibleRows = useMemo(() => rows.map(profileSummary).filter(row =>
    searchRow(row, query, ['name','member_id','current_alliance','governor_gear','charms','infantry_tier','cavalry_tier','archer_tier']) &&
    (!filters.alliance || row.current_alliance === filters.alliance) &&
    (!filters.gear || row.gear_min >= Number(filters.gear)) && (!filters.charm || row.charm_min >= Number(filters.charm)) &&
    (!filters.pet || numericValue(row.pet_power) >= numericValue(filters.pet)) && (!filters.master || numericValue(row.masters_power) >= numericValue(filters.master)) &&
    (!filters.mystic || numericValue(row.mystic_trial_score) >= numericValue(filters.mystic))
  ).sort((a,b) => {
    const value = row => ['infantry','cavalry','archer'].includes(sort) ? formatUnitLevel(row[`${sort}_tier`], row[`${sort}_tg`]) : row[sort];
    return compareValues(value(a),value(b),['charm_min','gear_min','pet_power','masters_power','mystic_trial_score'].includes(sort)) * (descending ? -1 : 1);
  }), [rows,query,filters,sort,descending]);
  const sortOptions = [{value:'name',label:'Name'},{value:'member_id',label:'Player ID'},...['infantry','cavalry','archer'].map(value=>({value,label:value+' level'})),{value:'gear_min',label:'Lowest gear level'},{value:'charm_min',label:'Lowest charm level'},{value:'pet_power',label:'Pet power'},{value:'masters_power',label:'Master power'},{value:'mystic_trial_score',label:'Mystic Trial total'}];

  const profileCount = rows.filter((row) => row.pet_power || row.masters_power || row.mystic_trial_score || row.governor_gear || row.charms).length;

  return (
    <AdminShell
      title="Members"
      subtitle="Everyone on the roster by Player ID, with troop levels, gear and power totals."
      onLogout={handleLogout}
      actions={(
        <Button variant="quiet" onClick={showCreate ? closeCreate : openCreate}>
          {showCreate ? 'Cancel' : 'Add member'}
        </Button>
      )}
      counters={[
        { label: 'Members', value: rows.length },
        { label: 'With a Power Profile', value: profileCount },
      ]}
    >
      {!showCreate && error && <Callout tone="danger">{error}</Callout>}
      {showCreate && (
        <Panel eyebrow="New member" title="Add a member" description="Adds someone to the roster by Player ID. They sign in with that ID; troop and hero details can be filled in later." className="admin-page-panel">
          <form onSubmit={createMember} className="member-pin-create-form">
            {error && <Callout tone="danger">{error}</Callout>}
            <div className="member-pin-create-grid">
              <Field label="Name">
                <Input
                  tone="console"
                  value={newMember.name}
                  onChange={(event) => setCreateField('name', event.target.value)}
                  maxLength={120}
                  autoComplete="off"
                  placeholder="In-game name"
                  required
                />
              </Field>
              <Field label="Player ID">
                <Input
                  tone="console"
                  value={newMember.memberId}
                  onChange={(event) => setCreateField('memberId', event.target.value)}
                  maxLength={120}
                  autoComplete="off"
                  placeholder="Kingshot Player ID"
                  required
                />
              </Field>
            </div>
            <div className="member-pin-create-actions">
              <Button variant="quiet" onClick={closeCreate} disabled={creating}>Cancel</Button>
              <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create member'}</Button>
            </div>
          </form>
        </Panel>
      )}

      <TableFilters query={query} onQuery={setQuery} placeholder="Name, Player ID, alliance, troop or gear level" shown={visibleRows.length} total={rows.length} onReset={() => { setQuery(''); setFilters({}); setSort('name'); setDescending(false); }} filters={[
        {key:'alliance',label:'Alliance',value:filters.alliance || '',onChange:v=>setFilter('alliance',v),options:[...new Set(rows.map(r=>r.current_alliance).filter(Boolean))].sort()},
                {key:'gear',label:'All gear at least',value:filters.gear || '',onChange:v=>setFilter('gear',v),options:GOVERNOR_GEAR_OPTIONS.map((label,i)=>({value:String(i+1),label}))},
        {key:'charm',label:'All charms at least',value:filters.charm || '',onChange:v=>setFilter('charm',v),options:Array.from({length:22},(_,i)=>({value:String(i+1),label:`Level ${i+1}`}))},
      ]}>
        {[['pet','Min. pet power'],['master','Min. master power'],['mystic','Min. Mystic Trial']].map(([key,label])=><label key={key}>{label}<input inputMode="decimal" placeholder="e.g. 1.5M" value={filters[key] || ''} onChange={e=>setFilter(key,e.target.value)} /></label>)}
        <label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}>{sortOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label>Order<select value={descending ? 'desc' : 'asc'} onChange={e=>setDescending(e.target.value==='desc')}><option value="asc">Low to high / A–Z</option><option value="desc">High to low / Z–A</option></select></label>
      </TableFilters>

      {status && <div className="status">{status}</div>}

      {loading ? (
        <TableSkeleton columns={9} rows={8} />
      ) : (
        <div style={{ overflowX: 'auto' }}>
        <Table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Player ID</th>
              <th>Troop levels</th><th>Governor Gear</th><th>Charms</th><th>Mystic Trial total</th><th>Pet power</th><th>Master power</th>
              <th>Gift Codes</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan="9">No members found.</td></tr>
            ) : visibleRows.map((row) => {
              const memberId = String(row.member_id);
              return (
                <tr key={memberId}>
                  <td><strong>{row.name || '-'}</strong></td>
                  <td><span className="member-id-cell">{memberId}</span></td>
                  <td>{['infantry','cavalry','archer'].map(unit=><div key={unit}><strong>{unit}:</strong> {formatUnitLevel(row[`${unit}_tier`],row[`${unit}_tg`])}</div>)}</td>
                  <td>{['infantry','cavalry','archer'].map(unit=><div key={unit}><strong>{unit}:</strong> {[1,2].map(i=>parseGovernorGearSelections(row.governor_gear)[`${unit}_${i}`] || '—').join(' / ')}</div>)}</td>
                  <td>{['infantry','cavalry','archer'].map(unit=><div key={unit}><strong>{unit}:</strong> {[1,2,3,4,5,6].map(i=>parseCharmSelections(row.charms)[`${unit}_${i}`] || '—').join(' · ')}</div>)}</td>
                  <td>{row.mystic_trial_score || '—'}</td><td>{row.pet_power || '—'}</td><td>{row.masters_power || '—'}</td>
                  <td>
                    {row.gift_code?.enrolled ? (
                      <div className="member-gift-code-cell">
                        <Tag tone={row.gift_code.enabled ? 'success' : 'neutral'}>
                          {row.gift_code.enabled ? 'Enrolled' : 'Paused'}
                        </Tag>
                        <span className="hint">
                          {row.gift_code.latestStatus
                            ? `${giftStatusLabel(row.gift_code.latestStatus)} · ${row.gift_code.latestCode}`
                            : 'No attempts yet'}
                        </span>
                        <span className="hint">
                          {row.gift_code.redeemed} redeemed · {row.gift_code.pending} pending
                          {row.gift_code.failed ? ` · ${row.gift_code.failed} failed` : ''}
                        </span>
                      </div>
                    ) : (
                      <Tag tone="neutral">Not enrolled</Tag>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
        </div>
      )}

      <style>{`
        .admin-page-callout{margin-bottom:18px}
        .admin-page-panel{margin-bottom:20px}
        .member-pin-create-form{display:flex;flex-direction:column;gap:14px}
        .member-pin-create-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:14px}
        .member-pin-create-actions{display:flex;justify-content:flex-end;gap:9px}
        .member-pin-code{font-family:var(--font-mono-loaded),ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:1rem;font-weight:800;letter-spacing:.16em}
        .member-gift-code-cell{display:flex;flex-direction:column;gap:4px;align-items:flex-start}
        .member-gift-code-cell .hint{margin:0;font-size:.72rem}
        @media(max-width:720px){.member-pin-create-grid{grid-template-columns:1fr}.member-pin-create-actions{align-items:stretch;flex-direction:column-reverse}}
      `}</style>
    </AdminShell>
  );
}

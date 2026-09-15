'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TableFilters from '../../../../components/admin/TableFilters';
import { compareValues, searchRow, numericValue } from '../../../../lib/adminTable.mjs';
import { profileSummary } from '../../../../lib/memberProfiles.mjs';
import { parseCharmSelections, parseGovernorGearSelections, GOVERNOR_GEAR_OPTIONS } from '../../../../lib/powerProfiles.mjs';
import { formatUnitLevel } from '../../../../lib/kvkMembersExport.mjs';
import AdminShell from '../../../../components/admin/AdminShell';
import ConfirmDialog from '../../../../components/admin/ConfirmDialog';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Callout, Field, Input, Panel, Table, Tag } from '../../../../components/ui';

const EMPTY_MEMBER = { name: '', memberId: '', pin: '' };

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

function generateSixDigitPin() {
  if (typeof window === 'undefined' || !window.crypto?.getRandomValues) return '';
  const values = new Uint32Array(1);
  const range = 1_000_000;
  const limit = 0x100000000 - (0x100000000 % range);
  let value;
  do {
    window.crypto.getRandomValues(values);
    value = values[0];
  } while (value >= limit);
  return String(value % range).padStart(6, '0');
}

export default function AdminMemberPinsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState({ alliance: '', pin: '', gear: '', charm: '', pet: '', master: '', mystic: '' });
  const [sort, setSort] = useState('name');
  const [descending, setDescending] = useState(false);
  const setFilter = (key, value) => setFilters(current => ({ ...current, [key]: value }));
  const [resettingId, setResettingId] = useState('');
  const [confirmRow, setConfirmRow] = useState(null);
  const [revealedPins, setRevealedPins] = useState({});
  const [copiedId, setCopiedId] = useState('');
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
        if (!response.ok) throw new Error(result.error || 'Unable to load member profiles.');
        if (active) setRows(result.rows || []);
      } catch (loadError) {
        if (active) setError(loadError.message || 'Unable to load member profiles.');
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
    setNewMember({ ...EMPTY_MEMBER, pin: generateSixDigitPin() });
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

  function regeneratePin() {
    const pin = generateSixDigitPin();
    if (!pin) {
      setError('Secure PIN generation is unavailable in this browser. Enter a 6-digit PIN manually.');
      return;
    }
    setCreateField('pin', pin);
  }

  async function createMember(event) {
    event.preventDefault();
    setError('');
    setStatus('');

    const name = newMember.name.trim();
    const memberId = newMember.memberId.trim();
    const pin = newMember.pin.trim();

    if (!name || !memberId) {
      setError('Name and Member ID are required.');
      return;
    }
    if (!/^\d{6}$/.test(pin)) {
      setError('PIN must be exactly 6 digits.');
      return;
    }

    setCreating(true);
    try {
      const response = await fetch('/api/admin-member-pins', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, memberId, pin }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to create member.');

      const createdRow = result.row || {
        name,
        member_id: memberId,
        pin_status: 'secured',
        updated_at: null,
      };
      setRows((current) => [...current, createdRow].sort((a, b) => (
        String(a.name || '').localeCompare(String(b.name || ''))
      )));
      setRevealedPins((current) => ({ ...current, [memberId]: pin }));
      setStatus(`Created ${name} (${memberId}). Copy the new PIN now; it will not be recoverable later.`);
      setShowCreate(false);
      setNewMember(EMPTY_MEMBER);
    } catch (createError) {
      setError(createError.message || 'Unable to create member.');
    } finally {
      setCreating(false);
    }
  }

  async function performReset(row) {
    setConfirmRow(null);
    setResettingId(String(row.member_id));
    setError('');
    setStatus('');
    setCopiedId('');

    try {
      const response = await fetch('/api/admin-member-pins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: row.member_id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Unable to reset PIN.');

      setRevealedPins((current) => ({ ...current, [row.member_id]: result.pin }));
      setRows((current) => current.map((item) => (
        String(item.member_id) === String(row.member_id)
          ? { ...item, pin_status: 'secured' }
          : item
      )));
      setStatus(`Reset PIN for ${row.name || row.member_id}. Copy the new PIN now; it will not be recoverable later.`);
    } catch (resetError) {
      setError(resetError.message || 'Unable to reset PIN.');
    } finally {
      setResettingId('');
    }
  }

  async function copyPin(memberId, pin) {
    try {
      await navigator.clipboard.writeText(pin);
      setCopiedId(memberId);
      window.setTimeout(() => setCopiedId((current) => (current === memberId ? '' : current)), 1600);
    } catch {
      setError('Could not copy automatically. Select the PIN and copy it manually.');
    }
  }

  const visibleRows = useMemo(() => rows.map(profileSummary).filter(row =>
    searchRow(row, query, ['name','member_id','current_alliance','governor_gear','charms','infantry_tier','cavalry_tier','archer_tier']) &&
    (!filters.alliance || row.current_alliance === filters.alliance) && (!filters.pin || row.pin_status === filters.pin) &&
    (!filters.gear || row.gear_min >= Number(filters.gear)) && (!filters.charm || row.charm_min >= Number(filters.charm)) &&
    (!filters.pet || numericValue(row.pet_power) >= numericValue(filters.pet)) && (!filters.master || numericValue(row.masters_power) >= numericValue(filters.master)) &&
    (!filters.mystic || numericValue(row.mystic_trial_score) >= numericValue(filters.mystic))
  ).sort((a,b) => {
    const value = row => ['infantry','cavalry','archer'].includes(sort) ? formatUnitLevel(row[`${sort}_tier`], row[`${sort}_tg`]) : row[sort];
    return compareValues(value(a),value(b),['charm_min','gear_min','pet_power','masters_power','mystic_trial_score'].includes(sort)) * (descending ? -1 : 1);
  }), [rows,query,filters,sort,descending]);
  const sortOptions = [{value:'name',label:'Name'},{value:'member_id',label:'Player ID'},...['infantry','cavalry','archer'].map(value=>({value,label:value+' level'})),{value:'gear_min',label:'Lowest gear level'},{value:'charm_min',label:'Lowest charm level'},{value:'pet_power',label:'Pet power'},{value:'masters_power',label:'Master power'},{value:'mystic_trial_score',label:'Mystic Trial total'}];

  const securedCount = rows.filter((row) => row.pin_status === 'secured').length;
  const needsResetCount = rows.length - securedCount;

  return (
    <AdminShell
      title="Member Profiles"
      subtitle="Player levels, equipment, power totals, and PIN resets"
      onLogout={handleLogout}
      actions={(
        <Button variant="quiet" onClick={showCreate ? closeCreate : openCreate}>
          {showCreate ? 'Cancel' : 'Create member'}
        </Button>
      )}
      counters={[
        { label: 'Members', value: rows.length },
        { label: 'PINs secured', value: securedCount },
        { label: 'Need reset', value: needsResetCount },
      ]}
    >
      <Callout tone="info" title="Existing PINs cannot be viewed." className="admin-page-callout">
        Member PINs are stored as one-way hashes. Create a member with an initial 6-digit PIN,
        or reset an existing member to a replacement PIN that is revealed here once for private copying.
      </Callout>

      {!showCreate && error && <Callout tone="danger">{error}</Callout>}
      {showCreate && (
        <Panel eyebrow="New roster access" title="Create member + PIN" description="Adds the member to KvK Participants with a secure initial PIN. Troop and hero details can be filled in later." className="admin-page-panel">
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
              <Field label="Member ID">
                <Input
                  tone="console"
                  value={newMember.memberId}
                  onChange={(event) => setCreateField('memberId', event.target.value)}
                  maxLength={120}
                  autoComplete="off"
                  placeholder="Member ID"
                  required
                />
              </Field>
              <Field label="6-digit PIN">
                <div className="member-pin-input-row">
                  <Input
                    tone="console"
                    value={newMember.pin}
                    onChange={(event) => setCreateField('pin', event.target.value.replace(/\D/g, '').slice(0, 6))}
                    inputMode="numeric"
                    pattern="[0-9]{6}"
                    maxLength={6}
                    autoComplete="new-password"
                    className="member-pin-input"
                    placeholder="000000"
                    required
                  />
                  <Button variant="quiet" onClick={regeneratePin}>Generate</Button>
                </div>
              </Field>
            </div>
            <div className="member-pin-create-actions">
              <Button variant="quiet" onClick={closeCreate} disabled={creating}>Cancel</Button>
              <Button type="submit" disabled={creating}>{creating ? 'Creating...' : 'Create member'}</Button>
            </div>
          </form>
        </Panel>
      )}

      <TableFilters query={query} onQuery={setQuery} placeholder="Name, ID, alliance, troop or equipment level" shown={visibleRows.length} total={rows.length} onReset={() => { setQuery(''); setFilters({}); setSort('name'); setDescending(false); }} filters={[
        {key:'alliance',label:'Alliance',value:filters.alliance || '',onChange:v=>setFilter('alliance',v),options:[...new Set(rows.map(r=>r.current_alliance).filter(Boolean))].sort()},
        {key:'pin',label:'PIN status',value:filters.pin || '',onChange:v=>setFilter('pin',v),options:[{value:'secured',label:'Secured'},{value:'needs_reset',label:'Needs reset'}]},
        {key:'gear',label:'All gear at least',value:filters.gear || '',onChange:v=>setFilter('gear',v),options:GOVERNOR_GEAR_OPTIONS.map((label,i)=>({value:String(i+1),label}))},
        {key:'charm',label:'All charms at least',value:filters.charm || '',onChange:v=>setFilter('charm',v),options:Array.from({length:22},(_,i)=>({value:String(i+1),label:`Level ${i+1}`}))},
      ]}>
        {[['pet','Min. pet power'],['master','Min. master power'],['mystic','Min. Mystic Trial']].map(([key,label])=><label key={key}>{label}<input inputMode="decimal" placeholder="e.g. 1.5M" value={filters[key] || ''} onChange={e=>setFilter(key,e.target.value)} /></label>)}
        <label>Sort by<select value={sort} onChange={e=>setSort(e.target.value)}>{sortOptions.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>
        <label>Order<select value={descending ? 'desc' : 'asc'} onChange={e=>setDescending(e.target.value==='desc')}><option value="asc">Low to high / A–Z</option><option value="desc">High to low / Z–A</option></select></label>
      </TableFilters>

      {status && <div className="status">{status}</div>}

      {loading ? (
        <TableSkeleton columns={4} rows={8} />
      ) : (
        <Table>
          <thead>
            <tr>
              <th>Member</th>
              <th>Member ID</th>
              <th>Troop levels</th><th>Governor Gear</th><th>Charms</th><th>Mystic Trial total</th><th>Pet power</th><th>Master power</th>
              <th>PIN</th>
              <th>Gift Codes</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.length === 0 ? (
              <tr><td colSpan="11">No members found.</td></tr>
            ) : visibleRows.map((row) => {
              const memberId = String(row.member_id);
              const revealedPin = revealedPins[memberId];
              const resetting = resettingId === memberId;
              return (
                <tr key={memberId}>
                  <td><strong>{row.name || '-'}</strong></td>
                  <td><span className="member-id-cell">{memberId}</span></td>
                  <td>{['infantry','cavalry','archer'].map(unit=><div key={unit}><strong>{unit}:</strong> {formatUnitLevel(row[`${unit}_tier`],row[`${unit}_tg`])}</div>)}</td>
                  <td>{['infantry','cavalry','archer'].map(unit=><div key={unit}><strong>{unit}:</strong> {[1,2].map(i=>parseGovernorGearSelections(row.governor_gear)[`${unit}_${i}`] || '—').join(' / ')}</div>)}</td>
                  <td>{['infantry','cavalry','archer'].map(unit=><div key={unit}><strong>{unit}:</strong> {[1,2,3,4,5,6].map(i=>parseCharmSelections(row.charms)[`${unit}_${i}`] || '—').join(' · ')}</div>)}</td>
                  <td>{row.mystic_trial_score || '—'}</td><td>{row.pet_power || '—'}</td><td>{row.masters_power || '—'}</td>
                  <td>
                    {revealedPin ? (
                      <div className="member-pin-reveal">
                        <div>
                          <span className="member-pin-reveal-label">New PIN · shown once</span>
                          <code className="member-pin-code">{revealedPin}</code>
                        </div>
                        <Button variant="quiet" onClick={() => copyPin(memberId, revealedPin)}>
                          {copiedId === memberId ? 'Copied' : 'Copy'}
                        </Button>
                      </div>
                    ) : (
                      <Tag tone={row.pin_status === 'secured' ? 'success' : 'accent'}>
                        {row.pin_status === 'secured' ? 'Protected · hidden' : 'Needs reset'}
                      </Tag>
                    )}
                  </td>
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
                  <td>
                    <Button variant="quiet" disabled={resetting} onClick={() => setConfirmRow(row)}>
                      {resetting ? 'Resetting...' : 'Reset PIN'}
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </Table>
      )}

      <ConfirmDialog
        open={Boolean(confirmRow)}
        title="Reset member PIN?"
        message={confirmRow ? `Replace the PIN for ${confirmRow.name || confirmRow.member_id} (${confirmRow.member_id})? Their old PIN will stop working immediately.` : ''}
        confirmLabel="Reset PIN"
        danger={false}
        onCancel={() => setConfirmRow(null)}
        onConfirm={() => confirmRow && performReset(confirmRow)}
      />

      <style>{`
        .admin-page-callout{margin-bottom:18px}
        .admin-page-panel{margin-bottom:20px}
        .member-pin-create-form{display:flex;flex-direction:column;gap:14px}
        .member-pin-create-grid{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr) minmax(220px,0.85fr);gap:14px}
        .member-pin-input-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
        .member-pin-input{font-family:var(--font-mono-loaded),ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-weight:800;letter-spacing:.16em}
        .member-pin-create-actions{display:flex;justify-content:flex-end;gap:9px}
        .member-pin-reveal{display:flex;align-items:center;gap:12px;width:fit-content;max-width:100%;padding:8px 10px 8px 12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-surface)}
        .member-pin-reveal-label{display:block;margin-bottom:2px;font-size:.64rem;font-weight:800;letter-spacing:.08em;text-transform:uppercase;opacity:.7}
        .member-pin-code{font-family:var(--font-mono-loaded),ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:1rem;font-weight:800;letter-spacing:.16em}
        .member-gift-code-cell{display:flex;flex-direction:column;gap:4px;align-items:flex-start}
        .member-gift-code-cell .hint{margin:0;font-size:.72rem}
        @media(max-width:900px){.member-pin-create-grid{grid-template-columns:1fr 1fr}.member-pin-create-grid>:last-child{grid-column:1/-1}}
        @media(max-width:720px){.member-pin-create-grid{grid-template-columns:1fr}.member-pin-create-grid>:last-child{grid-column:auto}.member-pin-input-row{grid-template-columns:1fr}.member-pin-create-actions{align-items:stretch;flex-direction:column-reverse}.member-pin-reveal{align-items:flex-start;flex-direction:column}}
      `}</style>
    </AdminShell>
  );
}

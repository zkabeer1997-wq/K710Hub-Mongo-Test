'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import TableFilters from './TableFilters';
import { searchRow, compareValues } from '../../lib/adminTable.mjs';
import AdminShell from './AdminShell';
import ConfirmDialog from './ConfirmDialog';
import TableSkeleton from './TableSkeleton';
import { Button, Input, Table } from '../ui';
import MemberDetailsDrawer from './MemberDetailsDrawer';
import { buildKvkMembersWorkbook, formatUnitLevel } from '../../lib/kvkMembersExport.mjs';
import { useEscapeToClose } from '../../lib/useEscapeToClose';
import { filterRowsUpdatedOnOrAfter } from '../../lib/adminTimeWindow.mjs';
import {
  HEROES,
  KVK_ALLIANCES,
  KVK_AVAILABILITY_OPTIONS,
  TROOP_TGS,
  TROOP_TIERS,
} from '../../lib/playerCombatOptions.mjs';
import {
  formatRallyRows,
  serializeRalliesForSave,
  assignMemberToRally,
  autoAssignRallyMembers,
  createNextRally,
  decrementRallyLeadHero,
  getLeadHeroTotal,
  getMatchingLeadHeroes,
  getRallyLeadMemberIds,
  getTroopLevelSummary,
  incrementRallyLeadHero,
  normalizeRalliesForRows,
  parseStoredRallies,
  removeRowsAndAssignments,
  removeRallyById,
  renameRally,
  removeMemberFromRallies,
  setRallyLead,
  setRallyTroopWeight,
  MAX_LEAD_HEROES,
} from '../../app/admin/dashboard/rallyState.mjs';

const EMPTY_MEMBER = {
  name: '',
  member_id: '',
  infantry_tier: '',
  infantry_tg: '',
  cavalry_tier: '',
  cavalry_tg: '',
  archer_tier: '',
  archer_tg: '',
  heroes: [],
  availability: '',
  current_alliance: '',
};

const COLUMNS = [
  { key: 'name', label: 'Player Name' },
  { key: 'infantry_tg', label: 'Troop Levels' },
  { key: 'heroes', label: 'Heroes' },
  { key: 'current_alliance', label: 'Alliance' },
  { key: 'availability', label: 'Availability' },
  { key: 'updated_at', label: 'Updated' },
];

function availabilityTone(availability) {
  const text = String(availability || '').toLowerCase();
  if (text.includes('not available')) return 'unavailable';
  if (text.includes('full')) return 'full';
  if (text.includes('second')) return 'late';
  if (text.includes('first')) return 'early';
  return 'partial';
}

/**
 * Shared roster + rally planner workspace for the admin panel.
 * Powers both the KvK Members tab and the Flamedragon Tyrant tab -
 * each passes its own member/rally API endpoints and storage key so
 * the two rosters and rally boards stay fully independent.
 */
export default function RosterWorkspace({
  title,
  subtitle,
  pageLead = 'Select a member to view their full record. Drag the handle beside their name to assign a rally.',
  membersEndpoint,
  ralliesEndpoint,
  rallyStorageKey,
  exportFileNamePrefix,
  workbookSheetName,
  allowClearTestData = false,
}) {
  const [rows, setRows] = useState([]);
  const [selectedMemberId, setSelectedMemberId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionStatus, setActionStatus] = useState('');
  const [actionError, setActionError] = useState('');
  const [deletingIds, setDeletingIds] = useState([]);
  const [search, setSearch] = useState('');
  const [allianceFilter,setAllianceFilter]=useState('');
  const [availabilityFilter,setAvailabilityFilter]=useState('');
  const [heroFilter,setHeroFilter]=useState('');
  const [tierFilter,setTierFilter]=useState('');
  const [sortKey, setSortKey] = useState('updated_at');
  const [sortDir, setSortDir] = useState('desc');
  const [assignmentCutoff, setAssignmentCutoff] = useState('');
  const [rallies, setRallies] = useState([]);
  const [ralliesHydrated, setRalliesHydrated] = useState(false);
  const [newMember, setNewMember] = useState({ ...EMPTY_MEMBER });
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');
  const [addMemberStatus, setAddMemberStatus] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  const [draggingMemberId, setDraggingMemberId] = useState(null);
  const [dragOverRallyId, setDragOverRallyId] = useState(null);
  const [collapsedRallyIds, setCollapsedRallyIds] = useState([]);
  const [autoAssignSummaries, setAutoAssignSummaries] = useState({});
  const router = useRouter();

  useEscapeToClose(showAddMember, () => setShowAddMember(false));

  useEffect(() => {
    async function load() {
      setLoading(true);
      const response = await fetch(membersEndpoint);
      const result = await response.json();
      if (!response.ok) {
        setError(result.error || 'Unable to load entries.');
      } else {
        setRows(result.rows || []);
      }
      setLoading(false);
    }
    load();
  }, [membersEndpoint]);

  useEffect(() => {
    let cancelled = false;
    async function loadRallies() {
      try {
        const response = await fetch(ralliesEndpoint);
        if (response.ok) {
          const result = await response.json();
          if (!cancelled) setRallies(formatRallyRows(result.rallies || []));
        } else if (!cancelled) {
          setRallies(parseStoredRallies(window.localStorage.getItem(rallyStorageKey)));
        }
      } catch {
        if (!cancelled) setRallies(parseStoredRallies(window.localStorage.getItem(rallyStorageKey)));
      }
      if (!cancelled) setRalliesHydrated(true);
    }
    loadRallies();
    return () => { cancelled = true; };
  }, [ralliesEndpoint, rallyStorageKey]);

  useEffect(() => {
    if (!ralliesHydrated) return;
    try {
      window.localStorage.setItem(rallyStorageKey, JSON.stringify(rallies));
    } catch {}
    const timer = setTimeout(() => {
      fetch(ralliesEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rallies: serializeRalliesForSave(rallies) }),
      }).catch(() => {});
    }, 800);
    return () => clearTimeout(timer);
  }, [rallies, ralliesHydrated, ralliesEndpoint, rallyStorageKey]);

  useEffect(() => {
    if (!rows.length) return;
    setRallies((current) => {
      const normalized = normalizeRalliesForRows(current, rows);
      return JSON.stringify(normalized) === JSON.stringify(current) ? current : normalized;
    });
  }, [rows]);

  async function handleLogout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  function handleSort(key) {
    if (sortKey === key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  function applyDeletedMemberIds(memberIds) {
    setRows((currentRows) => {
      const { rows: nextRows, rallies: nextRallies } = removeRowsAndAssignments(
        currentRows,
        rallies,
        memberIds,
      );
      setRallies(nextRallies);
      return nextRows;
    });
  }

  function deleteMember(row) {
    const label = `${row.name || 'this entry'} (${row.member_id})`;
    setConfirmState({
      message: `Remove ${label}? This cannot be undone.`,
      confirmLabel: 'Remove',
      onConfirm: () => { setConfirmState(null); performDeleteMember(row, label); },
    });
  }

  async function performDeleteMember(row, label) {
    setActionStatus('');
    setActionError('');
    setDeletingIds((current) => [...current, String(row.member_id)]);
    const response = await fetch(`${membersEndpoint}/${encodeURIComponent(row.member_id)}`, {
      method: 'DELETE',
    });
    const result = await response.json();
    setDeletingIds((current) => current.filter((id) => id !== String(row.member_id)));
    if (!response.ok) {
      setActionError(result.error || `Could not remove ${label}.`);
      return;
    }
    applyDeletedMemberIds(result.deletedMemberIds || [row.member_id]);
    setActionStatus(`Removed ${label}.`);
  }

  function clearTestData() {
    setConfirmState({
      message: 'Remove all Test Seed / TEST710 entries? This cannot be undone.',
      confirmLabel: 'Clear test data',
      onConfirm: () => { setConfirmState(null); performClearTestData(); },
    });
  }

  async function performClearTestData() {
    setActionStatus('');
    setActionError('');
    setDeletingIds(['__test_data__']);
    const response = await fetch(`${membersEndpoint}?scope=test`, { method: 'DELETE' });
    const result = await response.json();
    setDeletingIds([]);
    if (!response.ok) {
      setActionError(result.error || 'Could not clear test data.');
      return;
    }
    const deletedMemberIds = result.deletedMemberIds || [];
    applyDeletedMemberIds(deletedMemberIds);
    setActionStatus(`Cleared ${deletedMemberIds.length} test entries.`);
  }

  function handleCreateRally() {
    setRallies((current) => createNextRally(current, `rally-${current.length + 1}-${Date.now()}`));
  }

  function handleDragStart(event, memberId) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', String(memberId));
    setDraggingMemberId(String(memberId));
  }

  function handleDragEnd() {
    setDraggingMemberId(null);
    setDragOverRallyId(null);
  }

  function handleDropOnRally(event, rallyId) {
    event.preventDefault();
    const memberId = event.dataTransfer.getData('text/plain');
    setDraggingMemberId(null);
    setDragOverRallyId(null);
    if (!memberId) return;
    setRallies((current) => assignMemberToRally(current, rallyId, memberId));
  }

  function handleRemoveFromRally(memberId) {
    setRallies((current) => removeMemberFromRallies(current, memberId));
  }

  function toggleRallyCollapsed(rallyId) {
    setCollapsedRallyIds((current) => (
      current.includes(rallyId) ? current.filter((id) => id !== rallyId) : [...current, rallyId]
    ));
  }

  function handleDeleteRally(rally) {
    setConfirmState({
      message: `Delete ${rally.name}? Members will stay in the table.`,
      confirmLabel: 'Delete rally',
      onConfirm: () => {
        setConfirmState(null);
        setRallies((current) => removeRallyById(current, rally.id));
      },
    });
  }

  function handleRallyLeadChange(rallyId, memberId) {
    setRallies((current) => setRallyLead(current, rallyId, memberId));
  }

  function handleTroopWeightChange(rallyId, troopType, value) {
    setRallies((current) => setRallyTroopWeight(current, rallyId, troopType, value));
  }

  function handleIncrementLeadHero(rallyId, hero) {
    setRallies((current) => incrementRallyLeadHero(current, rallyId, hero));
  }

  function handleDecrementLeadHero(rallyId, hero) {
    setRallies((current) => decrementRallyLeadHero(current, rallyId, hero));
  }

  function handleAutoAssign(rallyId) {
    const eligibleRows = filterRowsUpdatedOnOrAfter(rows, assignmentCutoff);
    const result = autoAssignRallyMembers(rallies, rallyId, eligibleRows);
    if (!result.summary) return;
    setRallies(result.rallies);
    setAutoAssignSummaries((current) => ({ ...current, [rallyId]: result.summary }));
  }

  function handleAssignFromDropdown(memberId, rallyId) {
    if (!rallyId) {
      setRallies((current) => removeMemberFromRallies(current, memberId));
      return;
    }
    setRallies((current) => assignMemberToRally(current, rallyId, memberId));
  }

  function handleRenameRally(rallyId, name) {
    setRallies((current) => renameRally(current, rallyId, name));
  }

  function handleExportXlsx() {
    const blob = buildKvkMembersWorkbook(filteredSorted, workbookSheetName);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `${exportFileNamePrefix}-${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  function toggleNewMemberHero(hero) {
    setNewMember((current) => ({
      ...current,
      heroes: current.heroes.includes(hero)
        ? current.heroes.filter((h) => h !== hero)
        : [...current.heroes, hero],
    }));
  }

  async function handleAddMember(event) {
    event.preventDefault();
    setAddMemberError('');
    setAddMemberStatus('');
    const name = newMember.name.trim();
    const memberId = newMember.member_id.trim();
    if (!name || !memberId) {
      setAddMemberError('Name and Member ID are required.');
      return;
    }
    setAddingMember(true);
    const payload = {
      name,
      member_id: memberId,
      infantry_tier: newMember.infantry_tier || null,
      infantry_tg: newMember.infantry_tg || null,
      cavalry_tier: newMember.cavalry_tier || null,
      cavalry_tg: newMember.cavalry_tg || null,
      archer_tier: newMember.archer_tier || null,
      archer_tg: newMember.archer_tg || null,
      heroes: newMember.heroes,
      availability: newMember.availability || null,
      current_alliance: newMember.current_alliance || null,
    };
    const response = await fetch(membersEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    setAddingMember(false);
    if (!response.ok) {
      setAddMemberError(result.error || 'Could not add member.');
      return;
    }
    if (result.row) {
      setRows((current) => [result.row, ...current]);
    }
    setAddMemberStatus(`Added ${name}.`);
    setNewMember({ ...EMPTY_MEMBER });
    setShowAddMember(false);
  }

  const filteredSorted = useMemo(() => {
    const result = rows.filter(row =>
      (!allianceFilter || row.current_alliance===allianceFilter) && (!availabilityFilter || row.availability===availabilityFilter) &&
      (!heroFilter || row.heroes?.includes(heroFilter)) && (!tierFilter || [row.infantry_tier,row.cavalry_tier,row.archer_tier].includes(tierFilter)) &&
      searchRow(row,search,['name','member_id','heroes','current_alliance','availability','governor_gear','charms','infantry_tier','cavalry_tier','archer_tier'])
    );
    return result.sort((a,b)=>compareValues(a[sortKey],b[sortKey])*(sortDir==='asc'?1:-1));
  }, [rows,search,sortKey,sortDir,allianceFilter,availabilityFilter,heroFilter,tierFilter]);

  const membersById = useMemo(() => {
    return new Map(rows.map((row) => [String(row.member_id), row]));
  }, [rows]);

  const rallyByMemberId = useMemo(() => {
    const assignments = new Map();
    rallies.forEach((rally) => {
      rally.memberIds.forEach((memberId) => assignments.set(String(memberId), rally.name));
    });
    return assignments;
  }, [rallies]);

  const rallyIdByMemberId = useMemo(() => {
    const assignments = new Map();
    rallies.forEach((rally) => {
      rally.memberIds.forEach((memberId) => assignments.set(String(memberId), rally.id));
    });
    return assignments;
  }, [rallies]);

  const rallyLeadNameByMemberId = useMemo(() => {
    const names = new Map();
    rallies.forEach((rally) => {
      if (rally.leadMemberId) names.set(String(rally.leadMemberId), rally.name);
    });
    return names;
  }, [rallies]);

  const leadMemberIds = useMemo(() => getRallyLeadMemberIds(rallies), [rallies]);

  const assignedCount = rallyByMemberId.size;
  const availableCount = rows.filter((row) => (
    !String(row.availability || '').toLowerCase().includes('not available')
  )).length;
  const powerProfileCount = rows.filter((row) => row.power_profile).length;
  const rallyCount = rallies.length;
  const lastUpdated = rows.reduce((latest, row) => {
    const timestamp = row.updated_at ? Date.parse(row.updated_at) : 0;
    return timestamp > latest ? timestamp : latest;
  }, 0);

  return (
    <AdminShell
      title={title}
      subtitle={subtitle}
      onLogout={handleLogout}
      counters={[
        { label: 'Members', value: rows.length },
        { label: 'Available', value: availableCount },
        { label: 'Assigned', value: assignedCount },
        { label: 'Unassigned', value: Math.max(rows.length - assignedCount, 0) },
        { label: 'Rallies', value: rallyCount },
      ]}
      actions={allowClearTestData ? (
        <Button
          variant="quiet"
          onClick={clearTestData}
          disabled={deletingIds.includes('__test_data__')}
        >
          {deletingIds.includes('__test_data__') ? 'Clearing...' : 'Clear test data'}
        </Button>
      ) : null}
    >
      <ConfirmDialog
        open={Boolean(confirmState)}
        message={confirmState ? confirmState.message : ''}
        confirmLabel={confirmState ? confirmState.confirmLabel : 'Confirm'}
        onConfirm={() => confirmState && confirmState.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
      <p className="admin-page-lead">{pageLead}</p>
      <div className="dashboard-stats" aria-label="Dashboard summary">
        <div><span>Total members</span><strong>{rows.length}</strong></div>
        <div><span>Available</span><strong>{availableCount}</strong></div>
        <div><span>Assigned</span><strong>{assignedCount}</strong></div>
        <div className="unassigned-stat"><span>Unassigned</span><strong>{Math.max(rows.length - assignedCount, 0)}</strong></div>
        <div><span>Player Profiles</span><strong>{powerProfileCount}</strong></div>
        <div><span>Rallies</span><strong>{rallyCount}</strong></div>
        <div><span>Latest update</span><strong>{lastUpdated ? new Date(lastUpdated).toLocaleDateString() : '-'}</strong></div>
      </div>
      <TableFilters query={search} onQuery={setSearch} placeholder="Name, player ID, hero, or equipment" shown={filteredSorted.length} total={rows.length} onReset={()=>{setSearch('');setAllianceFilter('');setAvailabilityFilter('');setHeroFilter('');setTierFilter('');setSortKey('updated_at');setSortDir('desc');}} filters={[
        {key:'alliance',label:'Alliance',value:allianceFilter,onChange:setAllianceFilter,options:[...new Set(rows.map(r=>r.current_alliance).filter(Boolean))].sort()},
        {key:'availability',label:'Availability',value:availabilityFilter,onChange:setAvailabilityFilter,options:[...new Set(rows.map(r=>r.availability).filter(Boolean))].sort()},
        {key:'hero',label:'Hero',value:heroFilter,onChange:setHeroFilter,options:HEROES},
        {key:'tier',label:'Any troop tier',value:tierFilter,onChange:setTierFilter,options:TROOP_TIERS},
      ]}/>
      {actionStatus && <div className="status">{actionStatus}</div>}
      {actionError && <div className="status error">{actionError}</div>}
      {loading && <TableSkeleton columns={COLUMNS.length} rows={8} />}
      {error && <div className="status error">{error}</div>}
      {!loading && !error && (
        <div className="admin-workspace">
          <div className="admin-table-wrap">
            <Table className="admin-table">
              <thead>
                <tr>
                  <th aria-label="Drag" />
                  {COLUMNS.map((col) => (
                    <th key={col.key}>
                      <button type="button" className="admin-sort-btn" onClick={() => handleSort(col.key)}>
                        {col.label}{sortKey === col.key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : ''}
                      </button>
                    </th>
                  ))}
                  <th>Rally</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((row) => (
                  <tr key={row.member_id}>
                    <td>
                      <span
                        draggable
                        onDragStart={(e) => handleDragStart(e, row.member_id)}
                        onDragEnd={handleDragEnd}
                        style={{ cursor: 'grab' }}
                        aria-label="Drag to rally"
                      >⠿</span>
                    </td>
                    <td>
                      <button type="button" className="admin-sort-btn" onClick={() => setSelectedMemberId(row.member_id)}>
                        {row.name || '—'}
                      </button>
                      <div className="admin-row-message">{row.member_id}</div>
                    </td>
                    <td>{getTroopLevelSummary(row)}</td>
                    <td>{(row.heroes || []).join(', ') || '—'}</td>
                    <td>{row.current_alliance || '—'}</td>
                    <td>{row.availability || '—'}</td>
                    <td>{row.updated_at ? new Date(row.updated_at).toLocaleString() : '—'}</td>
                    <td>
                      <select
                        value={rallyIdByMemberId.get(String(row.member_id)) || ''}
                        onChange={(e) => handleAssignFromDropdown(row.member_id, e.target.value)}
                      >
                        <option value="">Unassigned</option>
                        {rallies.map((r) => (
                          <option key={r.id} value={r.id}>{r.name}</option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <Button variant="quiet" onClick={() => deleteMember(row)} disabled={deletingIds.includes(String(row.member_id))}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <section className="rally-board" aria-label="Rally planner">
            <div className="rally-board-header">
              <h2>Rally planner</h2>
              <button type="button" className="dash-btn" onClick={handleCreateRally}>
                Create Rally {rallies.length + 1}
              </button>
            </div>
            <div className="admin-time-cutoff">
              <label htmlFor="rally-assignment-cutoff">Use member updates from</label>
              <input
                id="rally-assignment-cutoff"
                type="datetime-local"
                value={assignmentCutoff}
                onChange={(event) => setAssignmentCutoff(event.target.value)}
              />
              {assignmentCutoff ? (
                <>
                  <button type="button" onClick={() => setAssignmentCutoff('')}>Use all updates</button>
                  <p>
                    Auto assign will consider {filterRowsUpdatedOnOrAfter(rows, assignmentCutoff).length} of {rows.length} members.
                    Older records remain in the table.
                  </p>
                </>
              ) : (
                <p>Auto assign will consider all members.</p>
              )}
            </div>
            <div className="rally-list">
              {rallies.length === 0 && (
                <div className="rally-empty-state">Create Rally 1 to start assigning members.</div>
              )}
              {rallies.map((rally) => (
                <div
                  key={rally.id}
                  className="rally-card"
                  onDragOver={(e) => { e.preventDefault(); setDragOverRallyId(rally.id); }}
                  onDragLeave={() => setDragOverRallyId(null)}
                  onDrop={(e) => handleDropOnRally(e, rally.id)}
                >
                  <div className="rally-card-head">
                    <input
                      value={rally.name || ''}
                      onChange={(e) => handleRenameRally(rally.id, e.target.value)}
                      aria-label="Rally name"
                    />
                    <button type="button" onClick={() => toggleRallyCollapsed(rally.id)}>
                      {collapsedRallyIds.includes(rally.id) ? 'Expand' : 'Collapse'}
                    </button>
                    <button type="button" onClick={() => handleAutoAssign(rally.id)}>Auto assign</button>
                    <button type="button" onClick={() => handleDeleteRally(rally)}>Delete</button>
                  </div>
                  {!collapsedRallyIds.includes(rally.id) && (
                    <div className="rally-card-body">
                      <p>{(rally.memberIds || []).length} members</p>
                      {autoAssignSummaries[rally.id] && (
                        <p className="admin-row-message">{autoAssignSummaries[rally.id]}</p>
                      )}
                      <ul>
                        {(rally.memberIds || []).map((id) => {
                          const m = membersById.get(String(id));
                          return (
                            <li key={id}>
                              {m?.name || id}
                              <button type="button" onClick={() => handleRemoveFromRally(id)}>Remove</button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
      <MemberDetailsDrawer
        open={Boolean(selectedMemberId)}
        member={rows.find((r) => String(r.member_id) === String(selectedMemberId)) || null}
        onClose={() => setSelectedMemberId(null)}
      />
    </AdminShell>
  );
}

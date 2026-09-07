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

  // A Rally Lead cannot also be assigned as a joiner - here or on any other rally.
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
        <div>
          <span>Total members</span>
          <strong>{rows.length}</strong>
        </div>
        <div>
          <span>Available</span>
          <strong>{availableCount}</strong>
        </div>
        <div>
          <span>Assigned</span>
          <strong>{assignedCount}</strong>
        </div>
        <div className="unassigned-stat">
          <span>Unassigned</span>
          <strong>{Math.max(rows.length - assignedCount, 0)}</strong>
        </div>
        <div>
          <span>Player Profiles</span>
          <strong>{powerProfileCount}</strong>
        </div>
        <div>
          <span>Rallies</span>
          <strong>{rallyCount}</strong>
        </div>
        <div>
          <span>Latest update</span>
          <strong>{lastUpdated ? new Date(lastUpdated).toLocaleDateString() : '-'}</strong>
        </div>
      </div>
      <TableFilters query={search} onQuery={setSearch} placeholder="Name, player ID, hero, or equipment" shown={filteredSorted.length} total={rows.length} onReset={()=>{setSearch('');setAllianceFilter('');setAvailabilityFilter('');setHeroFilter('');setTierFilter('');setSortKey('updated_at');setSortDir('desc');}} filters={[
        {key:'alliance',label:'Alliance',value:allianceFilter,onChange:setAllianceFilter,options:[...new Set(rows.map(r=>r.current_alliance).filter(Boolean))].sort()},
        {key:'availability',label:'Availability',value:availabilityFilter,onChange:setAvailabilityFilter,options:[...new Set(rows.map(r=>r.availability).filter(Boolean))].sort()},
        {key:'hero',label:'Hero',value:heroFilter,onChange:setHeroFilter,options:HEROES},
        {key:'tier',label:'Any troop tier',value:tierFilter,onChange:setTierFilter,options:TROOP_TIERS},
      ]}/>
      {actionStatus && <div className="status">{actionStatus}</div>}
      {actionError && <div className="status error">{actionError}</div>}
      {loading && <TableSkeleton columns={COLUMNS.length} rows={7} />}
      {error && <div className="status error">{error}</div>}
      {!loading && !error && (
        <div className="admin-workspace kvk-members-workspace">
          <section className="roster-panel" aria-label="Member roster">
            <div className="panel-heading">
              <div>
                <span>Roster</span>
                <h2>Members</h2>
              </div>
              <p>{filteredSorted.length} shown</p>
            </div>
            <div className="roster-toolbar">
              <Button variant="quiet" onClick={handleExportXlsx}>
                Export to Excel
              </Button>
              <Button onClick={() => setShowAddMember(true)}>
                + Add Member
              </Button>
            </div>
            {showAddMember && (
              <div className="admin-drawer-overlay" role="presentation" onClick={() => setShowAddMember(false)}>
                <div className="admin-drawer" role="dialog" aria-modal="true" aria-labelledby="add-member-title" onClick={(e) => e.stopPropagation()}>
                  <div className="admin-drawer-header">
                    <h2 id="add-member-title">Add roster member</h2>
                    <button type="button" className="admin-drawer-close" onClick={() => setShowAddMember(false)} aria-label="Close">&times;</button>
                  </div>
                  <form className="add-member-form" onSubmit={handleAddMember}>
                    {addMemberError && <div className="status error">{addMemberError}</div>}
                    {addMemberStatus && <div className="status">{addMemberStatus}</div>}

                    <section className="admin-drawer-section">
                      <h3>Identity</h3>
                      <div className="add-member-grid">
                        <Input tone="console" type="text" placeholder="Name" value={newMember.name} onChange={(e) => setNewMember({ ...newMember, name: e.target.value })} />
                        <Input tone="console" type="text" placeholder="Member ID" value={newMember.member_id} onChange={(e) => setNewMember({ ...newMember, member_id: e.target.value })} />
                      </div>
                    </section>

                    <section className="admin-drawer-section">
                      <h3>Troop Levels</h3>
                      <div className="unit-card-grid">
                        {[
                          ['infantry', 'Infantry Level', 'infantry_tier', 'infantry_tg'],
                          ['cavalry', 'Cavalry Level', 'cavalry_tier', 'cavalry_tg'],
                          ['archer', 'Archer Level', 'archer_tier', 'archer_tg'],
                        ].map(([key, label, tierKey, tgKey]) => (
                          <div key={key} className={`unit-card ${key}`}>
                            <h4>{label}</h4>
                            <div className="row">
                              <label>Tier
                                <select value={newMember[tierKey]} onChange={(e) => setNewMember({ ...newMember, [tierKey]: e.target.value })}>
                                  <option value="">Tier</option>
                                  {TROOP_TIERS.map((tier) => <option key={tier} value={tier}>{tier}</option>)}
                                </select>
                              </label>
                              <label>TG
                                <select value={newMember[tgKey]} onChange={(e) => setNewMember({ ...newMember, [tgKey]: e.target.value })}>
                                  <option value="">TG</option>
                                  {TROOP_TGS.map((tg) => <option key={tg} value={tg}>{tg}</option>)}
                                </select>
                              </label>
                            </div>
                          </div>
                        ))}
                      </div>
                    </section>

                    <section className="admin-drawer-section">
                      <h3>Heroes</h3>
                      <div className="hero-chip-grid">
                        {HEROES.map((hero) => (
                          <label key={hero} className={newMember.heroes.includes(hero) ? 'hero-chip selected' : 'hero-chip'}>
                            <input type="checkbox" checked={newMember.heroes.includes(hero)} onChange={() => toggleNewMemberHero(hero)} />
                            <span>{hero}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="admin-drawer-section">
                      <h3>Availability</h3>
                      <div className="availability-grid">
                        {KVK_AVAILABILITY_OPTIONS.map((option) => (
                          <label key={option} className={newMember.availability === option ? 'availability-choice selected' : 'availability-choice'}>
                            <input
                              type="radio"
                              name="new-member-availability"
                              checked={newMember.availability === option}
                              onChange={() => setNewMember({ ...newMember, availability: option })}
                            />
                            <span>{option}</span>
                          </label>
                        ))}
                      </div>
                    </section>

                    <section className="admin-drawer-section">
                      <h3>Alliance</h3>
                      <label className="ledger-select">
                        <span>Alliance</span>
                        <select value={newMember.current_alliance} onChange={(e) => setNewMember({ ...newMember, current_alliance: e.target.value })}>
                          <option value="">Select alliance</option>
                          {KVK_ALLIANCES.map((alliance) => <option key={alliance} value={alliance}>{alliance}</option>)}
                        </select>
                      </label>
                    </section>

                    <Button type="submit" disabled={addingMember}>
                      {addingMember ? 'Adding...' : 'Add member'}
                    </Button>
                  </form>
                </div>
              </div>
            )}
            <Table className="kvk-members-table">
              <thead>
                <tr>
                  {COLUMNS.map((col) => (
                    <th key={col.key} aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}>
                      <button type="button" className="admin-sort-btn" onClick={() => handleSort(col.key)}>
                        {col.label}
                        {sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : ''}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredSorted.map((row) => {
                  const isRallyLead = leadMemberIds.has(String(row.member_id));
                  return (
                  <tr
                    key={row.member_id}
                    className={'admin-row-clickable' + (draggingMemberId === String(row.member_id) ? ' row-dragging' : '')}
                    onClick={() => setSelectedMemberId(String(row.member_id))}
                  >
                    <td>
                      <div className="member-name-cell">
                        <span className="member-name-row">
                          <span
                            className={isRallyLead ? 'rally-drag-handle is-disabled' : 'rally-drag-handle'}
                            onClick={(event) => event.stopPropagation()}
                            draggable={!isRallyLead}
                            onDragStart={(event) => (isRallyLead ? event.preventDefault() : handleDragStart(event, row.member_id))}
                            onDragEnd={handleDragEnd}
                            role="button"
                            tabIndex={-1}
                            aria-label={isRallyLead ? `${row.name} is a Rally Lead and can't be dragged as a joiner` : `Drag ${row.name} to a rally`}
                            title={isRallyLead ? "Rally Leads can't be assigned as joiners" : 'Drag to assign to a rally'}
                          >
                            &#8942;&#8942;
                          </span>
                          <button type="button" className="member-details-trigger" aria-haspopup="dialog" onClick={(event) => { event.stopPropagation(); setSelectedMemberId(String(row.member_id)); }}>{row.name}</button>
                        </span>
                        {rallyByMemberId.has(String(row.member_id)) && (
                          <span className="rally-badge">{rallyByMemberId.get(String(row.member_id))}</span>
                        )}
                        {isRallyLead && (
                          <span className="rally-badge rally-lead-badge">Lead - {rallyLeadNameByMemberId.get(String(row.member_id))}</span>
                        )}
                      </div>
                      {isRallyLead ? (
                        <p className="rally-assign-locked" title="Rally Leads can't be assigned as joiners">Rally Lead - not a joiner</p>
                      ) : (
                        <select
                          className="rally-assign-select"
                          aria-label={`Assign ${row.name} to a rally`}
                          value={rallyIdByMemberId.get(String(row.member_id)) || ''}
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => { event.stopPropagation(); handleAssignFromDropdown(row.member_id, event.target.value); }}
                        >
                          <option value="">Unassigned</option>
                          {rallies.map((rally) => (
                            <option key={rally.id} value={rally.id}>{rally.name}</option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td>
                      <div className="member-troop-stack">
                        {[['infantry', 'Infantry'], ['cavalry', 'Cavalry'], ['archer', 'Archer']].map(([key, label]) => (
                          <div key={key}><span>{label}</span><strong>{formatUnitLevel(row[`${key}_tier`], row[`${key}_tg`])}</strong></div>
                        ))}
                      </div>
                    </td>
                    <td>
                      <div className="heroes-cell">
                        <strong>{(row.heroes || []).length}</strong>
                        <span>{(row.heroes || []).slice(0, 3).join(', ') || '-'}</span>
                      </div>
                    </td>
                    <td><span className="unit-pill">{row.current_alliance || '-'}</span></td>
                    <td>
                      <span className={`availability-pill ${availabilityTone(row.availability)}`}>
                        {row.availability || '-'}
                      </span>
                    </td>
                    <td className="updated-cell">{row.updated_at ? new Date(row.updated_at).toLocaleString() : ''}</td>
                  </tr>
                  );
                })}
              </tbody>
            </Table>
            {filteredSorted.length === 0 && <p>No results found.</p>}
          </section>
        </div>
      )}
      {!loading && !error && (
        <section className="rally-board" aria-label="Rally planner">
          <div className="rally-board-header">
            <div>
              <span>Planner</span>
              <h2>Rallies</h2>
              <p>{assignedCount} members assigned</p>
            </div>
            <button type="button" onClick={handleCreateRally} className="create-rally-btn">
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
              {rallies.map((rally) => {
                const isCollapsed = collapsedRallyIds.includes(rally.id);
                const leadHeroTotal = getLeadHeroTotal(rally);
                const summary = autoAssignSummaries[rally.id];
                return (
                  <section
                    key={rally.id}
                    className={
                      'rally-dropzone'
                      + (draggingMemberId ? ' drag-active' : '')
                      + (dragOverRallyId === rally.id ? ' drag-over' : '')
                    }
                    onDragOver={(event) => event.preventDefault()}
                    onDragEnter={() => setDragOverRallyId(rally.id)}
                    onDragLeave={() => setDragOverRallyId((current) => (current === rally.id ? null : current))}
                    onDrop={(event) => handleDropOnRally(event, rally.id)}
                  >
                    <div className="rally-dropzone-header">
                      <div className="rally-title-row">
                        <button
                          type="button"
                          className="rally-collapse-btn"
                          onClick={() => toggleRallyCollapsed(rally.id)}
                          aria-expanded={!isCollapsed}
                          aria-label={isCollapsed ? `Expand ${rally.name}` : `Collapse ${rally.name}`}
                        >
                          {isCollapsed ? '+' : '−'}
                        </button>
                        <input className="rally-name-input" type="text" value={rally.name} onChange={(event) => handleRenameRally(rally.id, event.target.value)} aria-label="Rally name" />
                        <span>{rally.memberIds.length}</span>
                      </div>
                      <button
                        type="button"
                        className="delete-rally-btn"
                        onClick={() => handleDeleteRally(rally)}
                        aria-label={`Delete ${rally.name}`}
                      >
                        Delete
                      </button>
                    </div>
                    {!isCollapsed && (
                      <>
                        <div className="rally-controls">
                          <label className="rally-control-label">
                            <span>Rally Lead</span>
                            <select
                              value={rally.leadMemberId || ''}
                              onChange={(event) => handleRallyLeadChange(rally.id, event.target.value)}
                            >
                              <option value="">Select lead</option>
                              {rows.map((row) => (
                                <option key={row.member_id} value={row.member_id}>
                                  {row.name} ({row.member_id})
                                </option>
                              ))}
                            </select>
                          </label>
                          <div className="troop-weight-grid" aria-label={`${rally.name} troop criteria`}>
                            {[
                              ['infantry', 'Infantry %'],
                              ['cavalry', 'Cavalry %'],
                              ['archer', 'Archer %'],
                            ].map(([key, label]) => (
                              <label key={key} className="rally-control-label">
                                <span>{label}</span>
                                <input
                                  type="number"
                                  min="0"
                                  max="100"
                                  value={(rally.troopWeights && rally.troopWeights[key]) || 0}
                                  onChange={(event) => handleTroopWeightChange(rally.id, key, event.target.value)}
                                />
                              </label>
                            ))}
                          </div>
                          <div className="lead-heroes-block">
                            <div className="lead-heroes-header">
                              <span>Lead Heroes</span>
                              <span>{leadHeroTotal}/{MAX_LEAD_HEROES}</span>
                            </div>
                            <p className="lead-heroes-hint">Click a hero to add a slot; click its badge to remove one. Up to {MAX_LEAD_HEROES} total, any mix.</p>
                            <div className="lead-heroes-grid">
                              {HEROES.map((hero) => {
                                const count = (rally.leadHeroes || {})[hero] || 0;
                                const disabled = count === 0 && leadHeroTotal >= MAX_LEAD_HEROES;
                                return (
                                  <button
                                    key={hero}
                                    type="button"
                                    className={count > 0 ? 'lead-hero-btn selected' : 'lead-hero-btn'}
                                    onClick={() => handleIncrementLeadHero(rally.id, hero)}
                                    disabled={disabled}
                                  >
                                    {hero}
                                    {count > 0 && (
                                      <span
                                        className="lead-hero-count"
                                        role="button"
                                        tabIndex={0}
                                        aria-label={`Remove one ${hero} slot`}
                                        onClick={(event) => { event.stopPropagation(); handleDecrementLeadHero(rally.id, hero); }}
                                        onKeyDown={(event) => {
                                          if (event.key === 'Enter' || event.key === ' ') {
                                            event.preventDefault();
                                            event.stopPropagation();
                                            handleDecrementLeadHero(rally.id, hero);
                                          }
                                        }}
                                      >
                                        {count}
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="auto-assign-btn"
                            onClick={() => handleAutoAssign(rally.id)}
                          >
                            Auto assign 8
                          </button>
                          {summary && (
                            <div className="auto-assign-summary" role="status">
                              <p>
                                Added {summary.addedCount} ({summary.fullCount} full battle
                                {summary.firstHalfCount > 0 || summary.secondHalfCount > 0
                                  ? `, ${summary.firstHalfCount} first half, ${summary.secondHalfCount} second half`
                                  : ''}
                                ) - {summary.totalMembers} total.
                              </p>
                              {summary.leadHeroLines.map((line) => (
                                <p key={line}>{line}</p>
                              ))}
                            </div>
                          )}
                        </div>
                        {rally.memberIds.length === 0 ? (
                          <p className="rally-drop-hint">Drop members here</p>
                        ) : (
                          <div className="rally-member-list">
                            {rally.memberIds.map((memberId) => {
                              const member = membersById.get(String(memberId));
                              if (!member) return null;
                              const assignedHero = (rally.leadHeroAssignments || {})[String(memberId)];
                              const matchingLeadHeroes = getMatchingLeadHeroes(member, rally);
                              const troopLevels = getTroopLevelSummary(member);
                              return (
                                <div key={memberId} className="rally-member">
                                  <div className="rally-member-details">
                                    <strong>{member.name}</strong>
                                    <span className="rally-member-id">{member.member_id}</span>
                                    <span className={`availability-pill rally-member-availability ${availabilityTone(member.availability)}`}>
                                      {member.availability || 'Availability unknown'}
                                    </span>
                                    {troopLevels.length > 0 && (
                                      <div className="rally-member-troops">
                                        {troopLevels.map((troopLevel) => (
                                          <span key={troopLevel}>{troopLevel}</span>
                                        ))}
                                      </div>
                                    )}
                                    <div className="rally-member-heroes">
                                      <span>{assignedHero ? 'Assigned:' : 'Use:'}</span>
                                      <strong>
                                        {assignedHero
                                          || (matchingLeadHeroes.length > 0 ? matchingLeadHeroes.join(', ') : 'No selected lead hero match')}
                                      </strong>
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromRally(memberId)}
                                    aria-label={`Remove ${member.name} from ${rally.name}`}
                                  >
                                    x
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </>
                    )}
                  </section>
                );
              })}
          </div>
        </section>
      )}
      {selectedMemberId && membersById.has(selectedMemberId) && (
        <MemberDetailsDrawer
          member={membersById.get(selectedMemberId)}
          rallyName={rallyByMemberId.get(selectedMemberId)}
          onClose={() => setSelectedMemberId(null)}
          onDelete={deleteMember}
          deleting={deletingIds.includes(selectedMemberId)}
          confirming={Boolean(confirmState)}
        />
      )}
    </AdminShell>
  );
}

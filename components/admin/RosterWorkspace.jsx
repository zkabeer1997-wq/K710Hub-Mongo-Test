'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TableFilters from './TableFilters';
import { searchRow, compareValues } from '../../lib/adminTable.mjs';
import ConfirmDialog from './ConfirmDialog';
import TableSkeleton from './TableSkeleton';
import { Button, Table } from '../ui';
import MemberDetailsDrawer from './MemberDetailsDrawer';
import { buildKvkMembersWorkbook, formatUnitLevel, kvkMemberExportRows, KVK_MEMBER_HEADERS } from '../../lib/kvkMembersExport.mjs';
import ExportToGoogleDrive from './ExportToGoogleDrive';
import { useEscapeToClose } from '../../lib/useEscapeToClose';
import {
  HEROES,
  KVK_ALLIANCES,
  KVK_AVAILABILITY_OPTIONS,
  TROOP_TGS,
  TROOP_TIERS,
} from '../../lib/playerCombatOptions.mjs';
import {
  hydrateRallies,
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
 * Powers both the KvK Participants tab and the Tyrant Participants tab -
 * each passes its own member/rally API endpoints and storage key so
 * the two rosters and rally boards stay fully independent.
 */
export default function RosterWorkspace({
  title,
  view = 'participants',
  cycleFilter = 'current',
  membersEndpoint,
  ralliesEndpoint,
  rallyStorageKey,
  exportFileNamePrefix,
  workbookSheetName,
  allowClearTestData = false,
  cycleType = null,
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
  const [rallies, setRallies] = useState([]);
  // Autosave only runs after a real user edit. Hydrating from the server (or
  // normalising against the roster) must never write anything back.
  const ralliesDirtyRef = useRef(false);
  const updateRallies = useCallback((next) => {
    ralliesDirtyRef.current = true;
    setRallies(next);
  }, []);
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
  const [cycles, setCycles] = useState([]);
  // 'current', 'all', or a past cycle id. Chosen by the event page (History tab).
  const seasonFilter = cycleFilter;

  const loadCycles = useCallback(async () => {
    if (!cycleType) return;
    try {
      const response = await fetch(`/api/admin-event-cycles?type=${cycleType}`, { cache: 'no-store' });
      const result = await response.json();
      if (response.ok) setCycles(result.cycles || []);
    } catch {
      /* ignore - season filter just stays unavailable */
    }
  }, [cycleType]);

  useEffect(() => { loadCycles(); }, [loadCycles]);

  const currentCycle = cycles.find((c) => c.is_current) || null;
  const seasonFilteredRows = useMemo(() => {
    if (!cycleType || !cycles.length) return rows;
    if (seasonFilter === 'all') return rows;
    const targetId = seasonFilter === 'current' ? currentCycle?.id : seasonFilter;
    if (!targetId) return rows;
    return rows.filter((row) => row.event_cycle_id === targetId);
  }, [rows, cycleType, cycles, seasonFilter, currentCycle]);

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
          if (!cancelled) setRallies(hydrateRallies(result.rallies || []));
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
    if (!ralliesHydrated || !ralliesDirtyRef.current) return;
    try {
      window.localStorage.setItem(rallyStorageKey, JSON.stringify(rallies));
    } catch {}
    const timer = setTimeout(() => {
      ralliesDirtyRef.current = false;
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
      updateRallies(nextRallies);
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
    updateRallies((current) => createNextRally(current, `rally-${current.length + 1}-${Date.now()}`));
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
    updateRallies((current) => assignMemberToRally(current, rallyId, memberId));
  }

  function handleRemoveFromRally(memberId) {
    updateRallies((current) => removeMemberFromRallies(current, memberId));
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
        updateRallies((current) => removeRallyById(current, rally.id));
      },
    });
  }

  function handleRallyLeadChange(rallyId, memberId) {
    updateRallies((current) => setRallyLead(current, rallyId, memberId));
  }

  function handleTroopWeightChange(rallyId, troopType, value) {
    updateRallies((current) => setRallyTroopWeight(current, rallyId, troopType, value));
  }

  function handleIncrementLeadHero(rallyId, hero) {
    updateRallies((current) => incrementRallyLeadHero(current, rallyId, hero));
  }

  function handleDecrementLeadHero(rallyId, hero) {
    updateRallies((current) => decrementRallyLeadHero(current, rallyId, hero));
  }

  function handleAutoAssign(rallyId) {
    const eligibleRows = seasonFilteredRows;
    const result = autoAssignRallyMembers(rallies, rallyId, eligibleRows);
    if (!result.summary) return;
    updateRallies(result.rallies);
    setAutoAssignSummaries((current) => ({ ...current, [rallyId]: result.summary }));
  }

  function handleAssignFromDropdown(memberId, rallyId) {
    if (!rallyId) {
      updateRallies((current) => removeMemberFromRallies(current, memberId));
      return;
    }
    updateRallies((current) => assignMemberToRally(current, rallyId, memberId));
  }

  function handleRenameRally(rallyId, name) {
    updateRallies((current) => renameRally(current, rallyId, name));
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
    const result = seasonFilteredRows.filter(row =>
      (!allianceFilter || row.current_alliance===allianceFilter) && (!availabilityFilter || row.availability===availabilityFilter) &&
      (!heroFilter || row.heroes?.includes(heroFilter)) && (!tierFilter || [row.infantry_tier,row.cavalry_tier,row.archer_tier].includes(tierFilter)) &&
      searchRow(row,search,['name','member_id','heroes','current_alliance','availability','governor_gear','charms','infantry_tier','cavalry_tier','archer_tier'])
    );
    return result.sort((a,b)=>compareValues(a[sortKey],b[sortKey])*(sortDir==='asc'?1:-1));
  }, [seasonFilteredRows,search,sortKey,sortDir,allianceFilter,availabilityFilter,heroFilter,tierFilter]);

  // Scoped to the season filter above (not the full roster) so the Rally
  // Planner only shows and can select members from the season currently
  // in view - switching to a past season or "All seasons" widens it back.
  const membersById = useMemo(() => {
    return new Map(seasonFilteredRows.map((row) => [String(row.member_id), row]));
  }, [seasonFilteredRows]);

  const assignedInView = useMemo(() => {
    const ids = new Set();
    rallies.forEach((rally) => {
      [...(rally.memberIds || []), rally.leadMemberId].filter(Boolean).forEach((id) => {
        if (membersById.has(String(id))) ids.add(String(id));
      });
    });
    return ids.size;
  }, [rallies, membersById]);

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
      if (rally.leadMemberId) assignments.set(String(rally.leadMemberId), rally.id);
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

  const toolbar = (
    <div className="roster-toolbar">
      <Button variant="quiet" onClick={handleExportXlsx}>Export to Excel</Button>
      <ExportToGoogleDrive
        title={`${title} - ${new Date().toISOString().slice(0, 10)}`}
        getSheets={() => [{ name: workbookSheetName, aoa: [KVK_MEMBER_HEADERS, ...kvkMemberExportRows(filteredSorted)] }]}
      />
      {allowClearTestData && (
        <details className="roster-more">
          <summary>More</summary>
          <div className="roster-more-menu">
            <button
              type="button"
              className="roster-more-danger"
              onClick={clearTestData}
              disabled={deletingIds.includes('__test_data__')}
            >
              {deletingIds.includes('__test_data__') ? 'Clearing...' : 'Clear test data'}
            </button>
          </div>
        </details>
      )}
    </div>
  );

  return (
    <div className="roster-workspace">
      <ConfirmDialog
        open={Boolean(confirmState)}
        message={confirmState ? confirmState.message : ''}
        confirmLabel={confirmState ? confirmState.confirmLabel : 'Confirm'}
        onConfirm={() => confirmState && confirmState.onConfirm()}
        onCancel={() => setConfirmState(null)}
      />
      {actionStatus && <div className="status" role="status">{actionStatus}</div>}
      {actionError && <div className="status error" role="alert">{actionError}</div>}
      {loading && <TableSkeleton columns={COLUMNS.length} rows={8} />}
      {error && <div className="status error" role="alert">{error}</div>}
      {!loading && !error && view === 'participants' && (
        <>
          <TableFilters query={search} onQuery={setSearch} placeholder="Name, player ID, hero, or equipment" shown={filteredSorted.length} total={seasonFilteredRows.length} onReset={()=>{setSearch('');setAllianceFilter('');setAvailabilityFilter('');setHeroFilter('');setTierFilter('');setSortKey('updated_at');setSortDir('desc');}} filters={[
            {key:'alliance',label:'Alliance',value:allianceFilter,onChange:setAllianceFilter,options:[...new Set(seasonFilteredRows.map(r=>r.current_alliance).filter(Boolean))].sort()},
            {key:'availability',label:'Availability',value:availabilityFilter,onChange:setAvailabilityFilter,options:[...new Set(seasonFilteredRows.map(r=>r.availability).filter(Boolean))].sort()},
            {key:'hero',label:'Hero',value:heroFilter,onChange:setHeroFilter,options:HEROES},
            {key:'tier',label:'Any troop tier',value:tierFilter,onChange:setTierFilter,options:TROOP_TIERS},
          ]}/>

          {toolbar}
          <div className="admin-workspace">
          <div className="admin-table-wrap">
            <Table className="admin-table stack-table">
              <thead>
                <tr>
                  <th><span className="sr-only">Drag</span></th>
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
                        role="img" aria-label="Drag to assign a rally"
                      >⠿</span>
                    </td>
                    <td>
                      <button type="button" className="admin-sort-btn" onClick={() => setSelectedMemberId(row.member_id)}>
                        {row.name || '—'}
                      </button>
                      <div className="admin-row-message">{row.member_id}</div>
                    </td>
                    <td style={{ maxWidth: 150, whiteSpace: 'normal' }}>{getTroopLevelSummary(row)}</td>
                    <td style={{ maxWidth: 190, whiteSpace: 'normal' }}>{(row.heroes || []).join(', ') || '—'}</td>
                    <td>{row.current_alliance || '—'}</td>
                    <td style={{ maxWidth: 150, whiteSpace: 'normal' }}>{row.availability || '—'}</td>
                    <td>{row.updated_at ? new Date(row.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</td>
                    <td>
                      <select
                        aria-label={`Rally for ${row.name || row.member_id}`}
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
          </div>
        </>
      )}
      {!loading && !error && view === 'rallies' && (
        <div className="admin-workspace">
          <section className="rally-board rally-board-embedded" aria-label="Rallies">
            <div className="rally-board-header">
              <h2>Rallies</h2>
              <button type="button" className="dash-btn" onClick={handleCreateRally}>
                Add rally {rallies.length + 1}
              </button>
            </div>
            <p className="ec-panel-note">
              {assignedInView} of {seasonFilteredRows.length} applicants{cycleType && seasonFilter !== 'all' ? ' in this cycle' : ''} are in a rally. Auto assign picks from all of them.
            </p>
            <div className="rally-list">
              {rallies.length === 0 && (
                <div className="rally-empty-state">Add rally 1 to start assigning applicants.</div>
              )}
              {rallies.map((rally) => (
                <div
                  key={rally.id}
                  className={`rally-card${dragOverRallyId === rally.id ? ' is-drag-over' : ''}`}
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
                      <p>
                        {rally.leadMemberId ? <>Lead: <strong>{membersById.get(String(rally.leadMemberId))?.name || rally.leadMemberId}</strong>{' · '}</> : null}
                        {(rally.memberIds || []).filter((id) => membersById.has(String(id))).length} joiners{cycleType && seasonFilter !== 'all' ? ' this cycle' : ''}
                      </p>
                      {autoAssignSummaries[rally.id] && (
                        <p className="admin-row-message">{autoAssignSummaries[rally.id]}</p>
                      )}
                      <ul>
                        {(rally.memberIds || []).filter((id) => membersById.has(String(id))).map((id) => {
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
    </div>
  );
}

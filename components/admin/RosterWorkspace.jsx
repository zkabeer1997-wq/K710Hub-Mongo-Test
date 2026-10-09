'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import TableFilters from './TableFilters';
import { searchRow, compareValues } from '../../lib/adminTable.mjs';
import ConfirmDialog from './ConfirmDialog';
import TableSkeleton from './TableSkeleton';
import { Button, Table } from '../ui';
import MemberDetailsDrawer from './MemberDetailsDrawer';
import RallyBoard from './RallyBoard';
import {
  assignFilterLabel,
  assignedMemberIds,
  compactTroopLevels,
  filterByAssignment,
  heroChips,
  planBulkAddToRally,
  splitAvailability,
} from '../../lib/eventPage.mjs';
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
  assignMemberToRally,
  createNextRally,
  normalizeRalliesForRows,
  parseStoredRallies,
  removeRowsAndAssignments,
  removeMemberFromRallies,
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
  { key: 'infantry_tg', label: 'Troops' },
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
  assignFilter = '',
  onAssignFilterChange = null,
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
  // The heroes members can pick on the KvK Availability and Flamedragon forms (Admin > Heroes controls it).
  const [offeredHeroes, setOfferedHeroes] = useState(HEROES);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/heroes').then((r) => (r.ok ? r.json() : null)).then((body) => {
      const names = Array.isArray(body?.heroes) ? body.heroes.map((h) => h.name).filter(Boolean) : [];
      if (!cancelled && names.length) setOfferedHeroes(names);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [newMember, setNewMember] = useState({ ...EMPTY_MEMBER });
  const [addingMember, setAddingMember] = useState(false);
  const [addMemberError, setAddMemberError] = useState('');
  const [addMemberStatus, setAddMemberStatus] = useState('');
  const [showAddMember, setShowAddMember] = useState(false);
  const [confirmState, setConfirmState] = useState(null);
  // Participants ticked for a bulk action (member ids as strings).
  const [selectedIds, setSelectedIds] = useState(() => new Set());
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

  const [ralliesSave, setRalliesSave] = useState({ status: 'idle', at: null });
  const ralliesRef = useRef(rallies);
  useEffect(() => { ralliesRef.current = rallies; }, [rallies]);
  const saveSeqRef = useRef(0);

  const saveRallies = useCallback(async () => {
    const seq = (saveSeqRef.current += 1);
    setRalliesSave((current) => ({ ...current, status: 'saving' }));
    try {
      const response = await fetch(ralliesEndpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        // The route serialises once; sending already-serialised rows made it drop every joiner.
        body: JSON.stringify({ rallies: ralliesRef.current }),
      });
      if (!response.ok) throw new Error(`save failed (${response.status})`);
      const result = await response.json().catch(() => ({}));
      // Only the newest save decides the indicator; an older one finishing late must not say "Saved".
      if (seq === saveSeqRef.current) {
        ralliesDirtyRef.current = false;
        setRalliesSave({ status: 'saved', at: result.saved_at || new Date().toISOString() });
      }
    } catch {
      if (seq === saveSeqRef.current) setRalliesSave((current) => ({ ...current, status: 'error' }));
    }
  }, [ralliesEndpoint]);
  const retryRalliesSave = useCallback(() => { saveRallies(); }, [saveRallies]);

  useEffect(() => {
    if (!ralliesHydrated || !ralliesDirtyRef.current) return undefined;
    try {
      window.localStorage.setItem(rallyStorageKey, JSON.stringify(rallies));
    } catch {}
    setRalliesSave((current) => (current.status === 'saving' ? current : { ...current, status: 'saving' }));
    const timer = setTimeout(saveRallies, 800);
    return () => clearTimeout(timer);
  }, [rallies, ralliesHydrated, rallyStorageKey, saveRallies]);

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

  function handleAssignFromDropdown(memberId, rallyId) {
    if (!rallyId) {
      updateRallies((current) => removeMemberFromRallies(current, memberId));
      return;
    }
    updateRallies((current) => assignMemberToRally(current, rallyId, memberId));
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

  // Built-in heroes plus any hero name a member saved (including heroes since switched off or added in Admin > Heroes).
  const heroFilterOptions = useMemo(() => [...new Set([...HEROES, ...seasonFilteredRows.flatMap((row) => (Array.isArray(row.heroes) ? row.heroes : []))])], [seasonFilteredRows]);

  const assignedIds = useMemo(() => assignedMemberIds(rallies), [rallies]);

  const filteredSorted = useMemo(() => {
    const result = filterByAssignment(seasonFilteredRows, assignFilter, assignedIds).filter(row =>
      (!allianceFilter || row.current_alliance===allianceFilter) && (!availabilityFilter || row.availability===availabilityFilter) &&
      (!heroFilter || row.heroes?.includes(heroFilter)) && (!tierFilter || [row.infantry_tier,row.cavalry_tier,row.archer_tier].includes(tierFilter)) &&
      searchRow(row,search,['name','member_id','heroes','current_alliance','availability','governor_gear','charms','infantry_tier','cavalry_tier','archer_tier'])
    );
    return result.sort((a,b)=>compareValues(a[sortKey],b[sortKey])*(sortDir==='asc'?1:-1));
  }, [seasonFilteredRows,assignFilter,assignedIds,search,sortKey,sortDir,allianceFilter,availabilityFilter,heroFilter,tierFilter]);

  // Scoped to the season filter above (not the full roster) so the Rally
  // Planner only shows and can select members from the season currently
  // in view - switching to a past season or "All seasons" widens it back.
  const membersById = useMemo(() => {
    return new Map(seasonFilteredRows.map((row) => [String(row.member_id), row]));
  }, [seasonFilteredRows]);

  const rallyIdByMemberId = useMemo(() => {
    const assignments = new Map();
    rallies.forEach((rally) => {
      rally.memberIds.forEach((memberId) => assignments.set(String(memberId), rally.id));
      if (rally.leadMemberId) assignments.set(String(rally.leadMemberId), rally.id);
    });
    return assignments;
  }, [rallies]);

  const leadRallyByMemberId = useMemo(() => {
    const leads = new Map();
    rallies.forEach((rally) => { if (rally.leadMemberId) leads.set(String(rally.leadMemberId), rally.name); });
    return leads;
  }, [rallies]);

  // ---- bulk select + "Add selected to rally" ----
  const selectedVisible = useMemo(
    () => filteredSorted.filter((row) => selectedIds.has(String(row.member_id))),
    [filteredSorted, selectedIds],
  );
  const allVisibleSelected = filteredSorted.length > 0 && selectedVisible.length === filteredSorted.length;
  const selectAllRef = useRef(null);
  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedVisible.length > 0 && !allVisibleSelected;
  }, [selectedVisible.length, allVisibleSelected]);

  function toggleSelected(memberId) {
    setSelectedIds((current) => {
      const next = new Set(current);
      const id = String(memberId);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allVisibleSelected) filteredSorted.forEach((row) => next.delete(String(row.member_id)));
      else filteredSorted.forEach((row) => next.add(String(row.member_id)));
      return next;
    });
  }

  function handleBulkAdd(rallyId) {
    const nameOf = (id) => membersById.get(String(id))?.name || String(id);
    let base = rallies;
    let targetId = rallyId;
    if (rallyId === '__new__') {
      targetId = `rally-${rallies.length + 1}-${Date.now()}`;
      base = createNextRally(rallies, targetId);
    }
    const plan = planBulkAddToRally(base, targetId, selectedVisible.map((row) => row.member_id), assignMemberToRally, nameOf);
    setActionStatus('');
    setActionError('');
    if (plan.added.length) {
      updateRallies(plan.rallies);
      setActionStatus(plan.message);
    } else {
      setActionError(plan.message);
    }
    setSelectedIds(new Set());
  }

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
          {seasonFilteredRows.length > 0 && (
            <TableFilters compact query={search} onQuery={setSearch} placeholder="Name, player ID, hero, or equipment" shown={filteredSorted.length} total={seasonFilteredRows.length} onReset={()=>{setSearch('');setAllianceFilter('');setAvailabilityFilter('');setHeroFilter('');setTierFilter('');setSortKey('updated_at');setSortDir('desc');if (assignFilter && onAssignFilterChange) onAssignFilterChange('');}} filters={[
              {key:'alliance',label:'Alliance',value:allianceFilter,onChange:setAllianceFilter,options:[...new Set(seasonFilteredRows.map(r=>r.current_alliance).filter(Boolean))].sort()},
              {key:'availability',label:'Availability',value:availabilityFilter,onChange:setAvailabilityFilter,options:[...new Set(seasonFilteredRows.map(r=>r.availability).filter(Boolean))].sort()},
              {key:'hero',label:'Hero',value:heroFilter,onChange:setHeroFilter,options:heroFilterOptions},
              {key:'tier',label:'Any troop tier',value:tierFilter,onChange:setTierFilter,options:TROOP_TIERS},
            ]}/>
          )}

          {assignFilter ? (
            <div className="roster-filter-chip" role="status">
              <span>Showing only: <strong>{assignFilterLabel(assignFilter)}</strong> ({filteredSorted.length})</span>
              {onAssignFilterChange ? <button type="button" className="ec-link-btn" onClick={() => onAssignFilterChange('')}>Show everyone</button> : null}
            </div>
          ) : null}

          {toolbar}

          {selectedVisible.length > 0 && (
            <div className="roster-bulk" role="region" aria-label="Bulk actions">
              <strong>{selectedVisible.length} selected</strong>
              <details
                className="roster-more roster-bulk-menu"
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    e.currentTarget.removeAttribute('open');
                    e.currentTarget.querySelector('summary')?.focus();
                  }
                }}
              >
                <summary>Add selected to rally</summary>
                <div className="roster-more-menu">
                  {rallies.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); handleBulkAdd(r.id); }}
                    >
                      {r.name || 'Rally'}
                    </button>
                  ))}
                  <button
                    type="button"
                    className="roster-bulk-new"
                    onClick={(e) => { e.currentTarget.closest('details')?.removeAttribute('open'); handleBulkAdd('__new__'); }}
                  >
                    + New rally{rallies.length === 0 ? ' (none yet)' : ''}
                  </button>
                </div>
              </details>
              <button type="button" className="ec-link-btn" onClick={() => setSelectedIds(new Set())}>Clear selection</button>
            </div>
          )}

          {seasonFilteredRows.length === 0 ? (
            <p className="ec-empty">No applicants in this cycle yet. Members show up here as they send the forms.</p>
          ) : filteredSorted.length === 0 ? (
            <p className="ec-empty">No participants match these filters.</p>
          ) : (
          <div className="admin-workspace">
          <div className="admin-table-wrap roster-table-wrap">
            <Table className="admin-table stack-table roster-table">
              <thead>
                <tr>
                  <th className="roster-col-check" data-stack-label="Select">
                    <input
                      ref={selectAllRef}
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={toggleSelectAll}
                      aria-label={`Select all ${filteredSorted.length} shown`}
                    />
                  </th>
                  {COLUMNS.map((col) => (
                    <th
                      key={col.key}
                      className={col.key === 'name' ? 'roster-col-name' : col.key === 'updated_at' ? 'roster-updated' : col.key === 'current_alliance' ? 'roster-alliance' : undefined}
                      aria-sort={sortKey === col.key ? (sortDir === 'asc' ? 'ascending' : 'descending') : undefined}
                    >
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
                {filteredSorted.map((row) => {
                  const id = String(row.member_id);
                  const heroes = heroChips(row.heroes);
                  const troops = compactTroopLevels(row);
                  const avail = splitAvailability(row.availability);
                  const leadOf = leadRallyByMemberId.get(id);
                  const isSelected = selectedIds.has(id);
                  return (
                    <tr key={row.member_id} className={isSelected ? 'is-selected' : undefined}>
                      <td className="roster-col-check">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelected(id)}
                          aria-label={`Select ${row.name || row.member_id}`}
                        />
                      </td>
                      <td className="roster-col-name">
                        <div className="roster-namecell">
                        <button type="button" className="admin-sort-btn roster-name-btn" onClick={() => setSelectedMemberId(row.member_id)}>
                          {row.name || '—'}
                        </button>
                        <div className="roster-id">{row.member_id}</div>
                        <div className="roster-meta">{[row.current_alliance, row.updated_at ? new Date(row.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : ''].filter(Boolean).join(' · ')}</div>
                      </div>
                      </td>
                      <td className="roster-troops">
                        <div>{troops ? troops.split(' · ').map((unit, i, all) => <span key={unit} className="roster-unit">{unit}{i < all.length - 1 ? ' ·' : ''}</span>) : '—'}</div>
                      </td>
                      <td>
                        {heroes.all.length ? (
                          <div className="roster-heroes">
                            {heroes.all.map((hero, i) => (
                              <span key={hero} className={`roster-hero${i >= heroes.shown.length ? ' roster-hero-extra' : ''}`}>{hero}</span>
                            ))}
                            {heroes.restCount > 0 && (
                              <span
                                className="roster-hero-more"
                                tabIndex={0}
                                aria-label={`${heroes.restCount} more heroes: ${heroes.rest.join(', ')}`}
                              >
                                +{heroes.restCount}
                                <span className="roster-hero-tip" aria-hidden="true">{heroes.all.join(', ')}</span>
                              </span>
                            )}
                          </div>
                        ) : '—'}
                      </td>
                      <td className="roster-alliance">{row.current_alliance || '—'}</td>
                      <td className="roster-avail">
                        {avail.label ? <><span>{avail.label}</span>{avail.detail ? <small>{avail.detail}</small> : null}</> : '—'}
                      </td>
                      <td className="roster-updated">{row.updated_at ? new Date(row.updated_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—'}</td>
                      <td>
                        {leadOf ? (
                          <span className="roster-lead-note">Lead of {leadOf}</span>
                        ) : (
                          <select
                            aria-label={`Rally for ${row.name || row.member_id}`}
                            value={rallyIdByMemberId.get(id) || ''}
                            onChange={(e) => handleAssignFromDropdown(row.member_id, e.target.value)}
                          >
                            <option value="">Unassigned</option>
                            {rallies.map((r) => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                        )}
                      </td>
                      <td>
                        <button type="button" className="roster-remove" onClick={() => deleteMember(row)} disabled={deletingIds.includes(id)} aria-label={`Remove ${row.name || row.member_id}`}>
                          Remove
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </div>
          </div>
          )}
        </>
      )}
      {!loading && !error && view === 'rallies' && (
        <div className="admin-workspace">
          <RallyBoard
            rallies={rallies}
            updateRallies={updateRallies}
            rows={seasonFilteredRows}
            membersById={membersById}
            heroOptions={offeredHeroes}
            eventType={cycleType || 'kvk'}
            eventName={title}
            saveState={ralliesSave}
            onRetrySave={retryRalliesSave}
            onOpenMember={setSelectedMemberId}
          />
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

'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import AdminDialog from './AdminDialog';
import ConfirmDialog from './ConfirmDialog';
import styles from './RallyBoard.module.css';
import { KVK_ALLIANCES } from '../../lib/playerCombatOptions.mjs';
import { timeBucket, timeLabel, troopCell } from '../../lib/rallyExport.mjs';
import {
  MAX_LEAD_HEROES,
  RALLY_FORMATIONS,
  RALLY_FORMATION_LABELS,
  RALLY_JOINER_FLAG_ABOVE,
  RALLY_TYPES,
  RALLY_TYPE_LABELS,
  assignMemberToRally,
  createNextRally,
  decrementRallyLeadHero,
  getLeadHeroTotal,
  getRallyLeadMemberIds,
  incrementRallyLeadHero,
  moveRallyJoiner,
  normalizeRallyType,
  planAutoFillAll,
  rallySlotCount,
  removeMemberFromRallies,
  removeRallyById,
  setRallyField,
  setRallyLead,
  sortRalliesByType,
} from '../../app/admin/dashboard/rallyState.mjs';

const TINT = { full: styles.tFull, first: styles.tFirst, second: styles.tSecond, other: styles.tOther };
const PILL = { attack: styles.pillAttack, garrison: styles.pillGarrison, optional: styles.pillOptional };
const UNDO_MS = 9000;

function troopLine(row) {
  const parts = [['Inf', row.infantry_tier, row.infantry_tg], ['Cav', row.cavalry_tier, row.cavalry_tg], ['Arc', row.archer_tier, row.archer_tg]]
    .map(([label, tier, tg]) => `${label} ${troopCell(tier, tg) || '-'}`);
  return parts.join(' · ');
}

const saveText = (state) => {
  if (state.status === 'saving') return 'Saving…';
  if (state.status === 'saved') return `Saved${state.at ? ` ${new Date(state.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`;
  if (state.status === 'error') return 'Not saved. Your changes are still on this page.';
  return 'All changes save automatically.';
};

export default function RallyBoard({
  rallies, updateRallies, rows, membersById, heroOptions, eventType, eventName, saveState, onRetrySave, onOpenMember,
}) {
  const [poolOpen, setPoolOpen] = useState(true);
  const [allianceFilter, setAllianceFilter] = useState('');
  const [timeFilter, setTimeFilter] = useState('');
  const [dragId, setDragId] = useState(null);
  const [overCard, setOverCard] = useState(null);
  const [overRow, setOverRow] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [undo, setUndo] = useState(null);
  const [fillOpen, setFillOpen] = useState(false);
  const [fillMode, setFillMode] = useState('keep');
  const [exportMsg, setExportMsg] = useState(null);
  const [exporting, setExporting] = useState(false);
  const undoTimer = useRef(null);

  useEffect(() => () => clearTimeout(undoTimer.current), []);

  const ordered = useMemo(() => sortRalliesByType(rallies), [rallies]);
  const leadIds = useMemo(() => getRallyLeadMemberIds(rallies), [rallies]);
  const assignedIds = useMemo(() => new Set(rallies.flatMap((r) => r.memberIds.map(String))), [rallies]);
  const sortedRows = useMemo(() => [...rows].sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))), [rows]);

  const unassigned = useMemo(() => rows.filter((row) => {
    const id = String(row.member_id);
    if (assignedIds.has(id) || leadIds.has(id)) return false;
    if (allianceFilter && row.current_alliance !== allianceFilter) return false;
    if (timeFilter && timeBucket(row.availability) !== timeFilter) return false;
    return true;
  }), [rows, assignedIds, leadIds, allianceFilter, timeFilter]);
  const unassignedTotal = useMemo(() => rows.filter((row) => !assignedIds.has(String(row.member_id)) && !leadIds.has(String(row.member_id))).length, [rows, assignedIds, leadIds]);

  const plan = useMemo(() => (fillOpen ? planAutoFillAll(rallies, rows, { replace: fillMode === 'replace' }) : null), [fillOpen, rallies, rows, fillMode]);
  const placedNow = rallies.reduce((sum, r) => sum + r.memberIds.length, 0);

  // ---- edits (every one goes through updateRallies, which autosaves) ----
  function addRally(type) {
    updateRallies((current) => createNextRally(current, `rally-${current.length + 1}-${Date.now()}`, type));
  }
  function setField(id, field, value) { updateRallies((current) => setRallyField(current, id, field, value)); }
  function setName(id, name) { updateRallies((current) => current.map((r) => (r.id === id ? { ...r, name } : r))); }
  function chooseLead(rally, memberId) {
    const lead = membersById.get(String(memberId));
    updateRallies((current) => {
      const next = setRallyLead(current, rally.id, memberId);
      const isDefaultName = !rally.name || /^Rally \d+$/.test(rally.name);
      return lead && isDefaultName ? next.map((r) => (r.id === rally.id ? { ...r, name: lead.name || r.name } : r)) : next;
    });
  }
  function addToRally(memberId, rallyId, index) {
    if (!rallyId) return;
    updateRallies((current) => {
      const placed = assignMemberToRally(current, rallyId, memberId);
      return index == null ? placed : moveRallyJoiner(placed, rallyId, memberId, index);
    });
  }
  function removeJoiner(memberId) { updateRallies((current) => removeMemberFromRallies(current, memberId)); }
  function moveJoiner(rallyId, memberId, to) { updateRallies((current) => moveRallyJoiner(current, rallyId, memberId, to)); }

  function deleteRally(rally) {
    const index = rallies.findIndex((r) => r.id === rally.id);
    updateRallies((current) => removeRallyById(current, rally.id));
    setConfirmDelete(null);
    clearTimeout(undoTimer.current);
    setUndo({ rally, index });
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }
  function undoDelete() {
    if (!undo) return;
    const { rally, index } = undo;
    updateRallies((current) => {
      const taken = new Set(current.flatMap((r) => [...r.memberIds.map(String), ...(r.leadMemberId ? [String(r.leadMemberId)] : [])]));
      const restored = { ...rally, memberIds: rally.memberIds.filter((id) => !taken.has(String(id))), leadMemberId: taken.has(String(rally.leadMemberId)) ? '' : rally.leadMemberId };
      const next = [...current];
      next.splice(Math.min(index, next.length), 0, restored);
      return next;
    });
    clearTimeout(undoTimer.current);
    setUndo(null);
  }

  function applyFill() {
    if (!plan) return;
    updateRallies(plan.rallies);
    setFillOpen(false);
  }

  // ---- drag and drop ----
  function startDrag(event, memberId) {
    event.dataTransfer.setData('text/plain', String(memberId));
    event.dataTransfer.effectAllowed = 'move';
    setDragId(String(memberId));
  }
  function endDrag() { setDragId(null); setOverCard(null); setOverRow(null); }
  function dropOn(event, rallyId, index) {
    event.preventDefault();
    event.stopPropagation();
    const memberId = event.dataTransfer.getData('text/plain') || dragId;
    endDrag();
    if (memberId) addToRally(memberId, rallyId, index);
  }

  // ---- export ----
  async function exportToDrive(mode) {
    setExporting(true);
    setExportMsg(null);
    try {
      const response = await fetch('/api/admin-rally-export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: eventType, mode }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Export failed.');
      setExportMsg({ ok: true, url: result.url, text: result.updated ? 'Updated the existing sheet.' : mode === 'copy' ? 'Saved a new copy.' : 'Created the sheet.' });
    } catch (error) {
      setExportMsg({ ok: false, text: error.message || 'Export failed.' });
    } finally {
      setExporting(false);
    }
  }
  const exportBlocked = saveState.status === 'saving' || saveState.status === 'error';

  function closeMenu(event) { event.currentTarget.closest('details')?.removeAttribute('open'); }

  const countsLine = `${rows.length - unassignedTotal} of ${rows.length} applicants are in a rally; ${unassignedTotal} unassigned.`;

  return (
    <section className={styles.board} aria-label="Rallies">
      <div className={styles.head}>
        <h2>Rallies</h2>
        <div className={styles.tools}>
          <span className={styles.addGroup}>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => addRally('attack')}>+ Add rally</button>
            <details className={styles.menu}>
              <summary className={styles.btn} aria-label="Choose the type of rally to add">Type</summary>
              <div className={styles.menuList}>
                {RALLY_TYPES.map((type) => (
                  <button key={type} type="button" onClick={(e) => { addRally(type); closeMenu(e); }}>Add {RALLY_TYPE_LABELS[type]} rally</button>
                ))}
              </div>
            </details>
          </span>
          <button type="button" className={styles.btn} onClick={() => setFillOpen(true)} disabled={!rallies.length || !rows.length}>Auto-fill all rallies</button>
          <details className={styles.menu}>
            <summary className={styles.btn}>Export</summary>
            <div className={styles.menuList}>
              <button type="button" disabled={exporting || exportBlocked || !rallies.length} onClick={(e) => { exportToDrive('update'); closeMenu(e); }}>Export to Google Drive</button>
              <button type="button" disabled={exporting || exportBlocked || !rallies.length} onClick={(e) => { exportToDrive('copy'); closeMenu(e); }}>Save as new copy in Drive</button>
              <a href={`/api/admin-rally-export?type=${eventType}`} download onClick={closeMenu} aria-disabled={exportBlocked || !rallies.length}>Download .xlsx</a>
            </div>
          </details>
        </div>
      </div>
      <p className={styles.saveState} role="status" aria-live="polite" data-state={saveState.status}>
        {saveText(saveState)}
        {saveState.status === 'error' && <button type="button" className={styles.btn} onClick={onRetrySave}>Retry</button>}
      </p>
      <p className={styles.note}>{countsLine}</p>
      {exportMsg && (
        <div className={`${styles.toast} ${exportMsg.ok ? '' : styles.toastError}`} role={exportMsg.ok ? 'status' : 'alert'}>
          <span>{exportMsg.text}</span>
          {exportMsg.url && <a href={exportMsg.url} target="_blank" rel="noopener noreferrer">Open sheet</a>}
          <button type="button" className={styles.iconBtn} aria-label="Dismiss" onClick={() => setExportMsg(null)}>&times;</button>
        </div>
      )}
      {undo && (
        <div className={styles.toast} role="status">
          <span>Deleted {undo.rally.name}.</span>
          <button type="button" className={styles.btn} onClick={undoDelete}>Undo</button>
        </div>
      )}

      <div className={`${styles.layout} ${poolOpen ? styles.layoutWithPool : ''}`}>
        {poolOpen ? (
          <aside className={styles.pool} aria-label="Unassigned applicants">
            <div className={styles.poolHead}>
              <h3>Unassigned ({unassignedTotal})</h3>
              <button type="button" className={styles.btn} onClick={() => setPoolOpen(false)} aria-label="Hide the unassigned list">Hide</button>
            </div>
            <div className={styles.poolFilters}>
              <select className={styles.field} aria-label="Alliance" value={allianceFilter} onChange={(e) => setAllianceFilter(e.target.value)}>
                <option value="">Any alliance</option>
                {KVK_ALLIANCES.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
              <select className={styles.field} aria-label="Availability" value={timeFilter} onChange={(e) => setTimeFilter(e.target.value)}>
                <option value="">Any time</option>
                <option value="full">Full battle</option>
                <option value="first">First half</option>
                <option value="second">Second half</option>
                <option value="other">Unavailable / other</option>
              </select>
            </div>
            <ul className={styles.poolList}>
              {unassigned.length === 0 && <li className={styles.poolEmpty}>{unassignedTotal ? 'No one matches these filters.' : 'Everyone is in a rally.'}</li>}
              {unassigned.map((row) => (
                <li
                  key={row.member_id}
                  className={`${styles.poolItem} ${TINT[timeBucket(row.availability)]}`}
                  draggable
                  onDragStart={(e) => startDrag(e, row.member_id)}
                  onDragEnd={endDrag}
                >
                  <span className={styles.poolName}>{row.name || row.member_id} <span className={styles.ali}>{row.current_alliance || ''}</span></span>
                  <select
                    className={styles.field}
                    style={{ width: 'auto', maxWidth: 130 }}
                    aria-label={`Add ${row.name || row.member_id} to a rally`}
                    value=""
                    onChange={(e) => addToRally(row.member_id, e.target.value)}
                  >
                    <option value="">Add to…</option>
                    {ordered.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                  </select>
                  <span className={styles.poolMeta}>{timeLabel(row.availability)} · {troopLine(row)}</span>
                </li>
              ))}
            </ul>
          </aside>
        ) : (
          <div><button type="button" className={styles.btn} onClick={() => setPoolOpen(true)}>Show unassigned ({unassignedTotal})</button></div>
        )}

        <div>
          {rallies.length === 0 ? (
            <div className={styles.empty}>No rallies yet. Choose “+ Add rally”, then fill them by hand or with Auto-fill all rallies.</div>
          ) : (
            <div className={styles.grid}>
              {ordered.map((rally) => {
                const type = normalizeRallyType(rally.rallyType);
                const joiners = rally.memberIds.length;
                const slots = rallySlotCount(rally);
                const heroTotal = getLeadHeroTotal(rally);
                return (
                  <article
                    key={rally.id}
                    className={`${styles.card} ${overCard === rally.id ? styles.cardOver : ''}`}
                    aria-label={rally.name || 'Rally'}
                    onDragOver={(e) => { e.preventDefault(); setOverCard(rally.id); }}
                    onDragLeave={() => setOverCard(null)}
                    onDrop={(e) => dropOn(e, rally.id, null)}
                  >
                    <div className={styles.cardHead}>
                      <div className={styles.cardTitle}>
                        <input className={styles.field} value={rally.name || ''} onChange={(e) => setName(rally.id, e.target.value)} aria-label="Rally name" />
                        <span className={`${styles.pill} ${PILL[type]}`}>{RALLY_TYPE_LABELS[type]}</span>
                        <details className={styles.menu}>
                          <summary className={styles.iconBtn} aria-label={`More actions for ${rally.name}`}>&#8943;</summary>
                          <div className={styles.menuList}>
                            <button type="button" className={styles.danger} onClick={(e) => { setConfirmDelete(rally); closeMenu(e); }}>Delete rally…</button>
                          </div>
                        </details>
                      </div>
                      <div className={styles.cardRow}>
                        <label className={styles.label}>Type
                          <select className={styles.field} value={type} onChange={(e) => setField(rally.id, 'rallyType', e.target.value)}>
                            {RALLY_TYPES.map((t) => <option key={t} value={t}>{RALLY_TYPE_LABELS[t]}</option>)}
                          </select>
                        </label>
                        <label className={styles.label}>Formation
                          <select className={styles.field} value={rally.formationKind || 'balanced'} onChange={(e) => setField(rally.id, 'formationKind', e.target.value)}>
                            {RALLY_FORMATIONS.map((f) => <option key={f} value={f}>{RALLY_FORMATION_LABELS[f]}</option>)}
                          </select>
                        </label>
                      </div>
                      <div className={styles.cardRow}>
                        <label className={styles.label}>Rally lead
                          <select className={styles.field} value={rally.leadMemberId || ''} onChange={(e) => chooseLead(rally, e.target.value)}>
                            <option value="">No lead set</option>
                            {sortedRows.filter((r) => !assignedIds.has(String(r.member_id)) || String(r.member_id) === String(rally.leadMemberId)).map((r) => (
                              <option key={r.member_id} value={r.member_id}>{r.name || r.member_id}</option>
                            ))}
                          </select>
                        </label>
                        <label className={styles.label}>Manager
                          <input className={styles.field} value={rally.managerName || ''} list={`mgr-${rally.id}`} onChange={(e) => setField(rally.id, 'managerName', e.target.value)} placeholder="Name" />
                          <datalist id={`mgr-${rally.id}`}>{sortedRows.map((r) => <option key={r.member_id} value={r.name || r.member_id} />)}</datalist>
                        </label>
                      </div>
                      <div className={styles.cardTitle}>
                        <span className={`${styles.count} ${joiners > RALLY_JOINER_FLAG_ABOVE ? styles.countOver : ''}`}>
                          {joiners} {joiners === 1 ? 'joiner' : 'joiners'}{joiners > RALLY_JOINER_FLAG_ABOVE ? ' (over 10)' : ''}
                        </span>
                      </div>
                    </div>

                    <details className={styles.heroes}>
                      <summary>Required heroes ({heroTotal}/{MAX_LEAD_HEROES})</summary>
                      <div className={styles.heroChips}>
                        {Object.entries(rally.leadHeroes || {}).map(([hero, count]) => (
                          <span key={hero} className={styles.chip}>{hero} ×{count}
                            <button type="button" aria-label={`One fewer ${hero}`} onClick={() => updateRallies((c) => decrementRallyLeadHero(c, rally.id, hero))}>−</button>
                            <button type="button" aria-label={`One more ${hero}`} disabled={heroTotal >= MAX_LEAD_HEROES} onClick={() => updateRallies((c) => incrementRallyLeadHero(c, rally.id, hero))}>+</button>
                          </span>
                        ))}
                      </div>
                      <select
                        className={styles.field}
                        aria-label={`Add a required hero to ${rally.name}`}
                        value=""
                        disabled={heroTotal >= MAX_LEAD_HEROES}
                        onChange={(e) => e.target.value && updateRallies((c) => incrementRallyLeadHero(c, rally.id, e.target.value))}
                      >
                        <option value="">{heroTotal >= MAX_LEAD_HEROES ? 'All six hero slots used' : 'Add a required hero…'}</option>
                        {heroOptions.map((h) => <option key={h} value={h}>{h}</option>)}
                      </select>
                      <p className={styles.heroLine}>Auto-fill prefers joiners who have these heroes. If nobody left has one, it skips it so the rally still fills.</p>
                    </details>

                    <ol className={styles.rows}>
                      {Array.from({ length: slots }, (_, index) => {
                        const id = rally.memberIds[index];
                        const row = id == null ? null : membersById.get(String(id)) || { member_id: id, name: String(id) };
                        const over = overRow === `${rally.id}:${index}`;
                        if (!row) {
                          return (
                            <li
                              key={`empty-${index}`}
                              className={`${styles.row} ${styles.emptyRow} ${over ? styles.rowOver : ''}`}
                              onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOverRow(`${rally.id}:${index}`); setOverCard(rally.id); }}
                              onDrop={(e) => dropOn(e, rally.id, index)}
                            >
                              <span className={styles.slot}>{index + 1}</span>
                              <span className={styles.emptyText}>Empty. Drop a player here.</span>
                            </li>
                          );
                        }
                        const hero = (rally.leadHeroAssignments || {})[String(row.member_id)];
                        return (
                          <li
                            key={row.member_id}
                            className={`${styles.row} ${styles.rowDrag} ${TINT[timeBucket(row.availability)]} ${over ? styles.rowOver : ''}`}
                            draggable
                            onDragStart={(e) => startDrag(e, row.member_id)}
                            onDragEnd={endDrag}
                            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setOverRow(`${rally.id}:${index}`); setOverCard(rally.id); }}
                            onDrop={(e) => dropOn(e, rally.id, index)}
                          >
                            <span className={styles.slot}>{index + 1}</span>
                            <span className={styles.nameLine}>
                              <button type="button" className={styles.name} onClick={() => onOpenMember?.(row.member_id)}>{row.name || row.member_id}</button>
                              <span className={styles.ali}>{row.current_alliance || ''}</span>
                              <span className={styles.time}>{timeLabel(row.availability)}</span>
                              {hero && <span className={styles.heroBadge}>{hero}</span>}
                            </span>
                            <span className={styles.rowActions}>
                              <button type="button" className={styles.iconBtn} aria-label={`Move ${row.name || row.member_id} up`} disabled={index === 0} onClick={() => moveJoiner(rally.id, row.member_id, index - 1)}>↑</button>
                              <button type="button" className={styles.iconBtn} aria-label={`Move ${row.name || row.member_id} down`} disabled={index >= joiners - 1} onClick={() => moveJoiner(rally.id, row.member_id, index + 1)}>↓</button>
                              <button type="button" className={styles.iconBtn} aria-label={`Remove ${row.name || row.member_id} from ${rally.name}`} onClick={() => removeJoiner(row.member_id)}>&times;</button>
                            </span>
                            <span className={styles.troops}>{troopLine(row)}</span>
                          </li>
                        );
                      })}
                    </ol>

                    <div className={styles.notes}>
                      <label className={styles.label}>Notes
                        <textarea className={`${styles.field}`} value={rally.notes || ''} onChange={(e) => setField(rally.id, 'notes', e.target.value)} placeholder="e.g. Reinforce & Pass Castle" rows={2} />
                      </label>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        title="Delete this rally?"
        message={confirmDelete ? `Delete ${confirmDelete.name}? Its ${confirmDelete.memberIds.length} joiners go back to the unassigned list. You can undo this for a few seconds.` : ''}
        confirmLabel="Delete rally"
        onConfirm={() => confirmDelete && deleteRally(confirmDelete)}
        onCancel={() => setConfirmDelete(null)}
      />

      <AdminDialog
        open={fillOpen}
        title="Auto-fill all rallies"
        onClose={() => setFillOpen(false)}
        footer={(
          <>
            <button type="button" className={styles.btn} onClick={() => setFillOpen(false)}>Cancel</button>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={applyFill} disabled={!plan || (plan.preview.placed === 0 && plan.preview.replacedCount === 0)}>
              {plan && plan.preview.replacedCount ? `Replace and place ${plan.preview.totalPlaced}` : `Place ${plan ? plan.preview.placed : 0} players`}
            </button>
          </>
        )}
      >
        {plan && (
          <div>
            {placedNow > 0 && (
              <div className={styles.radios} role="radiogroup" aria-label="What to do with current joiners">
                <label><input type="radio" name="fillmode" checked={fillMode === 'keep'} onChange={() => setFillMode('keep')} /> Keep the {placedNow} current joiners and only fill the gaps</label>
                <label><input type="radio" name="fillmode" checked={fillMode === 'replace'} onChange={() => setFillMode('replace')} /> Start over: move all {placedNow} current joiners and fill again from scratch</label>
              </div>
            )}
            <p>
              Will place <strong>{plan.preview.placed}</strong> {plan.preview.placed === 1 ? 'player' : 'players'}; <strong>{plan.preview.unassigned}</strong> stay unassigned.
              {plan.preview.replacedCount > 0 && <> This replaces <strong>{plan.preview.replacedCount}</strong> current joiners.</>}
            </p>
            <ul className={styles.previewList}>
              {plan.preview.perRally.map((line) => (
                <li key={line.id}>
                  <strong>{line.name}</strong>: {line.skipped ? 'not filled yet (fills only after every Attack and Garrison rally is complete)' : `${line.total} joiners${line.added ? `, +${line.added}` : ''}`}
                  {!line.skipped && !line.complete && <span className={styles.warn}> · not enough people to have 8 in every half</span>}
                  {line.leadHeroLines.map((text) => <div key={text} className={styles.heroLine}>{text}</div>)}
                </li>
              ))}
            </ul>
            <p className={styles.note}>Nothing is saved until you confirm. Rule: availability first, then troop level for the formation, then required heroes. Eight joiners are kept in every half of the battle.</p>
          </div>
        )}
      </AdminDialog>
    </section>
  );
}

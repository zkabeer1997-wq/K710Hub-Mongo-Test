'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminDialog from '../../../../components/admin/AdminDialog';
import ExportToGoogleDrive from '../../../../components/admin/ExportToGoogleDrive';
import StatusChip from '../../../../components/admin/StatusChip';
import TableFilters from '../../../../components/admin/TableFilters';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Select, Table } from '../../../../components/ui';
import { searchRow } from '../../../../lib/adminTable.mjs';
import { SLOT_OPTIONS, slotRange, findScheduleType, typeTitle } from '../../../../lib/kvkAppointments.mjs';
import { scheduleAsText, scheduleSheets } from '../../../../lib/kvkScheduleBridge.mjs';
import { buildXlsx } from '../prep-ministers/xlsx.mjs';

// ONE guided flow for KvK appointments: Review answers -> Build schedule -> Adjust -> Publish -> Share.
// Source of truth: the "KvK Prep & Appointments" answers (ranking inputs + 30-minute availability).

const DAYS = [
  { day: 1, buff: 'construction', short: 'Day 1 Construction', want: 'want_construction', avail: 'avail_day1' },
  { day: 2, buff: 'research', short: 'Day 2 Research', want: 'want_research', avail: 'avail_day2' },
  { day: 4, buff: 'training', short: 'Day 4 Troop Training', want: 'want_troop_training', avail: 'avail_day4' },
  { day: 5, buff: 'overflow', short: 'Day 5 Overflow', want: null, avail: 'avail_day5' },
];

const STEPS = [
  { id: 'review', title: 'Review answers' },
  { id: 'build', title: 'Build schedule' },
  { id: 'adjust', title: 'Adjust' },
  { id: 'publish', title: 'Publish' },
  { id: 'share', title: 'Share' },
];

const yes = (v) => ['yes', 'y'].includes(String(v ?? '').trim().toLowerCase());
const list = (v) => (Array.isArray(v) ? v : String(v || '').split(',').map((s) => s.trim()).filter(Boolean));

function detail(row, day) {
  const rank = row.ranks?.[day];
  if (day === 1 && yes(row.want_construction)) {
    return [rank ? `#${rank}` : '', list(row.construction_upgrades).join(' ') || 'no upgrades', `TTG ${row.ttg_used || 0}`, `TG ${row.tg_used || 0}`].filter(Boolean).join(' · ');
  }
  if (day === 2 && yes(row.want_research)) {
    return [rank ? `#${rank}` : '', list(row.t11_troops).length ? 'New T11' : 'no T11', `${row.research_speedup_days || 0} SU days`, `dust ${row.tg_dust || 0}`].filter(Boolean).join(' · ');
  }
  if (day === 4 && yes(row.want_troop_training)) {
    return [rank ? `#${rank}` : '', yes(row.is_transfer) ? 'transfer' : '', yes(row.promoting_t11) ? 'promoting T11' : '', `${row.troop_speedup_days || 0} SU days`].filter(Boolean).join(' · ');
  }
  return '-';
}

const asgFor = (assignments, day, memberId) => assignments.find((a) => a.day === day && String(a.member_id) === String(memberId));

export default function AppointmentsFlow({ onChanged = null }) {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [cycleId, setCycleId] = useState('');
  const [step, setStep] = useState('review');
  const [query, setQuery] = useState('');
  const [dayFilter, setDayFilter] = useState('');
  const [adjustDay, setAdjustDay] = useState(1);
  const [built, setBuilt] = useState(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(cycleId ? `/api/admin-kvk-appointments?cycle=${encodeURIComponent(cycleId)}` : '/api/admin-kvk-appointments', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { router.push('/admin/login'); return; }
      if (!res.ok) throw new Error(body.error || 'Could not load appointments.');
      setData(body);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [router, cycleId]);
  useEffect(() => { load(); }, [load]);

  async function act(payload, okText) {
    setBusy(true); setStatus(''); setError('');
    try {
      const res = await fetch('/api/admin-kvk-appointments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Update failed.');
      setStatus(okText(body));
      await load();
      if (onChanged) onChanged();
      return body;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const prepRows = useMemo(() => data?.prep_rows || [], [data]);
  const assignments = useMemo(() => data?.assignments || [], [data]);
  const unplaced = data?.unplaced || [];
  const readOnly = data ? data.is_live === false : false;
  const legacyApps = data?.applications || [];
  const people = new Set(assignments.map((a) => String(a.member_id))).size;

  const visibleRows = useMemo(() => prepRows.filter((r) => {
    if (dayFilter) {
      const d = DAYS.find((x) => String(x.day) === dayFilter);
      if (d.want ? !yes(r[d.want]) : !(yes(r.want_construction) || yes(r.want_research))) return false;
    }
    return searchRow(r, query, ['in_game_name', 'member_id']);
  }), [prepRows, query, dayFilter]);

  const done = {
    review: prepRows.length > 0,
    build: assignments.length > 0,
    adjust: assignments.length > 0 && unplaced.length === 0,
    publish: data?.published === true,
    share: false,
  };
  const current = STEPS.findIndex((s) => s.id === step);
  const next = STEPS[current + 1];

  // ------------------------------------------------------------------ exports
  const daysForExport = () => scheduleSheets(assignments);
  const answerSheet = () => ({
    name: 'Answers',
    aoa: [
      ['Name', 'Member ID', 'Day 1 rank', 'Day 2 rank', 'Day 4 rank', 'Day 1 Construction', 'Day 2 Research', 'Day 4 Training', 'Day 1 times (UTC)', 'Day 2 times (UTC)', 'Day 4 times (UTC)', 'Day 5 times (UTC)'],
      ...prepRows.map((r) => [r.in_game_name, r.member_id, r.ranks?.[1] || '', r.ranks?.[2] || '', r.ranks?.[4] || '',
        detail(r, 1), detail(r, 2), detail(r, 4), list(r.avail_day1).join(' '), list(r.avail_day2).join(' '), list(r.avail_day4).join(' '), list(r.avail_day5).join(' ')]),
    ],
  });
  const exportSheets = () => [...daysForExport(), answerSheet()];
  const fileDate = new Date().toISOString().slice(0, 10);

  function downloadExcel() {
    const blob = buildXlsx(exportSheets());
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kvk-appointments-${fileDate}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  const textSchedule = useMemo(() => scheduleAsText(assignments, { cycleLabel: data?.cycle_label || '' }), [assignments, data]);
  async function copyText() {
    try {
      await navigator.clipboard.writeText(textSchedule);
      setCopied('Copied. Paste it into Discord.');
    } catch {
      setCopied('Could not copy automatically. Select the text below and copy it.');
    }
  }

  // ------------------------------------------------------------------ adjust
  const adjustMeta = DAYS.find((d) => d.day === adjustDay);
  const adjustRows = useMemo(() => {
    if (adjustDay !== 5) return prepRows.filter((r) => yes(r[adjustMeta.want]) || asgFor(assignments, adjustDay, r.member_id));
    return prepRows.filter((r) => asgFor(assignments, 5, r.member_id)
      || (yes(r.want_construction) && !asgFor(assignments, 1, r.member_id))
      || (yes(r.want_research) && !asgFor(assignments, 2, r.member_id)));
  }, [prepRows, assignments, adjustDay, adjustMeta]);
  const adjustSorted = useMemo(() => adjustRows.slice().sort((a, b) => (a.ranks?.[adjustDay] || 999) - (b.ranks?.[adjustDay] || 999) || String(a.in_game_name).localeCompare(String(b.in_game_name))), [adjustRows, adjustDay]);
  const takenBy = (slot) => assignments.find((a) => a.day === adjustDay && a.slot === slot);

  // ------------------------------------------------------------------ render
  return (
    <section className="apx" aria-label="KvK appointments">
      {error && <p className="event-form-error" role="alert">{error}</p>}
      <div aria-live="polite">{status && <p className="event-form-ok" role="status">{status}</p>}</div>
      {!data && !error && <TableSkeleton rows={6} />}
      {data && (
        <>
          <div className="apx-head">
            <label htmlFor="appt-cycle" className="sr-only">KvK cycle</label>
            <Select id="appt-cycle" tone="console" value={data.cycle_id} onChange={(e) => { setCycleId(e.target.value); setBuilt(null); }} style={{ maxWidth: 280 }}>
              {(data.cycles || []).map((c) => <option key={c.id} value={c.id}>{c.label}{c.is_current ? ' (current)' : ''}</option>)}
            </Select>
            <span className="help">{readOnly ? 'Earlier cycle: you can look and share, not change.' : 'Current cycle.'}</span>
            <span className="apx-spacer" />
            <StatusChip kind={data.published ? 'published' : 'warn'}>{data.published ? 'Published to members' : 'Not published yet'}</StatusChip>
          </div>

          <ol className="apx-steps" aria-label="Appointment steps">
            {STEPS.map((s, i) => (
              <li key={s.id}>
                <button type="button" className={`apx-step${step === s.id ? ' is-current' : ''}${done[s.id] ? ' is-done' : ''}`} aria-current={step === s.id ? 'step' : undefined} onClick={() => setStep(s.id)}>
                  <span className="apx-step-n" aria-hidden="true">{done[s.id] ? '✓' : i + 1}</span>
                  <span className="apx-step-t">{s.title}</span>
                  <span className="sr-only">{done[s.id] ? ' (done)' : ''}</span>
                </button>
              </li>
            ))}
          </ol>

          {step === 'review' && (
            <div className="apx-panel" id="apx-review">
              <h3 className="apx-h">Step 1 · Review answers</h3>
              <p className="help">Everything members sent in KvK Prep &amp; Appointments this cycle. The rank is each person&apos;s place for that day (#1 gets the first pick of time).</p>
              <dl className="apx-facts">
                <div><dt>Answers</dt><dd>{prepRows.length}</dd></div>
                <div><dt>Day 1</dt><dd>{prepRows.filter((r) => yes(r.want_construction)).length}</dd></div>
                <div><dt>Day 2</dt><dd>{prepRows.filter((r) => yes(r.want_research)).length}</dd></div>
                <div><dt>Day 4</dt><dd>{prepRows.filter((r) => yes(r.want_troop_training)).length}</dd></div>
              </dl>
              {prepRows.length === 0 ? (
                legacyApps.length > 0 ? (
                  <>
                    <p>This earlier cycle used the old Appointments form. Its {legacyApps.length} applications are listed read-only.</p>
                    <div className="admin-table-wrap">
                      <Table className="stack-table">
                        <thead><tr><th>Member</th><th>Day / buff</th><th>TG</th><th>TTG</th><th>Speedup days</th><th>Hours (UTC)</th></tr></thead>
                        <tbody>{legacyApps.map((a) => (
                          <tr key={`${a.member_id}-${a.day}-${a.buff}`}><td>{a.in_game_name || '-'} <small>{a.member_id}</small></td><td>{typeTitle(findScheduleType(a.day, a.buff) || { day: a.day, label: a.buff })}</td><td>{a.tg}</td><td>{a.ttg}</td><td>{a.speedup_days}</td><td>{(a.preferred_hours || []).join(', ')}</td></tr>
                        ))}</tbody>
                      </Table>
                    </div>
                  </>
                ) : <p className="ec-empty">No answers yet for this cycle. Members send them in KvK Prep &amp; Appointments.</p>
              ) : (
                <>
                  <TableFilters query={query} onQuery={setQuery} shown={visibleRows.length} total={prepRows.length} placeholder="Name or player ID"
                    onReset={() => { setQuery(''); setDayFilter(''); }}
                    filters={[{ key: 'day', label: 'Asked for', value: dayFilter, onChange: setDayFilter, allLabel: 'Any day', options: DAYS.filter((d) => d.day !== 5).map((d) => ({ value: String(d.day), label: d.short })).concat([{ value: '5', label: 'Day 5 candidates' }]) }]} />
                  <div className="admin-table-wrap">
                    <Table className="stack-table apx-table">
                      <thead><tr><th scope="col">Member</th><th scope="col">Day 1 Construction</th><th scope="col">Day 2 Research</th><th scope="col">Day 4 Training</th><th scope="col">Times picked (D1 / D2 / D4 / D5)</th><th scope="col">Slots</th></tr></thead>
                      <tbody>
                        {visibleRows.map((r) => (
                          <tr key={r.member_id}>
                            <td><strong>{r.in_game_name || '-'}</strong> <small>{r.member_id}</small></td>
                            <td>{detail(r, 1)}</td>
                            <td>{detail(r, 2)}</td>
                            <td>{detail(r, 4)}</td>
                            <td>{[r.avail_day1, r.avail_day2, r.avail_day4, r.avail_day5].map((a) => list(a).length).join(' / ')}</td>
                            <td>{DAYS.map((d) => asgFor(assignments, d.day, r.member_id)).filter(Boolean).map((a) => `D${a.day} ${a.slot}`).join(', ') || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                </>
              )}
            </div>
          )}

          {step === 'build' && (
            <div className="apx-panel" id="apx-build">
              <h3 className="apx-h">Step 2 · Build schedule</h3>
              <p>The schedule ranks everyone for each day and gives out 30-minute slots inside the times they picked. Each person gets <strong>at most one slot per day</strong>. People who missed Day 1 or Day 2 are tried again on Day 5. Slots you placed by hand stay as they are.</p>
              <p className="help">Building again replaces only the automatic slots, so it is safe to repeat after members change their answers.</p>
              <div className="apx-actions">
                <Button disabled={busy || readOnly || prepRows.length === 0} onClick={async () => {
                  const out = await act({ action: 'build_schedule' }, (b) => `Schedule built: ${b.summary.reduce((n, d) => n + d.assigned, 0)} slots booked, ${b.unplaced.length} not placed.`);
                  if (out) { setBuilt(out); setStep('adjust'); }
                }}>{assignments.length ? 'Build again' : 'Build schedule'}</Button>
                {prepRows.length === 0 && <span className="help">Nothing to build yet: no answers this cycle.</span>}
              </div>
              {(built?.summary || null) && (
                <ul className="apx-list">{built.summary.map((d) => <li key={d.day}>{typeTitle(findScheduleType(d.day, d.buff))}: {d.assigned} booked{d.locked ? `, ${d.locked} placed by hand` : ''}</li>)}</ul>
              )}
            </div>
          )}

          {step === 'adjust' && (
            <div className="apx-panel" id="apx-adjust">
              <h3 className="apx-h">Step 3 · Adjust</h3>
              <p className="help">Pick a different time for anyone. A person you place or move is locked: building again will not touch them. Choose &quot;No slot&quot; to remove a booking.</p>
              {unplaced.length > 0 ? (
                <div className="apx-unplaced" role="region" aria-label="Members without a slot">
                  <h4>Not placed ({unplaced.length})</h4>
                  <ul>{unplaced.map((u) => <li key={`${u.day}-${u.member_id}`}><strong>{u.name || u.member_id}</strong> · Day {u.day}: {u.reason}</li>)}</ul>
                </div>
              ) : assignments.length > 0 ? <p className="apx-ok">Everyone who asked for a day has a slot.</p> : <p className="ec-empty">Nothing built yet. Go to Build schedule first.</p>}
              <div className="apx-daytabs" role="group" aria-label="Day">
                {DAYS.map((d) => (
                  <button key={d.day} type="button" className={`apx-daytab${adjustDay === d.day ? ' is-current' : ''}`} aria-pressed={adjustDay === d.day} onClick={() => setAdjustDay(d.day)}>{d.short}</button>
                ))}
              </div>
              {adjustSorted.length === 0 ? <p className="ec-empty">Nobody for {adjustMeta.short}.</p> : (
                <div className="admin-table-wrap">
                  <Table className="stack-table apx-table">
                    <thead><tr><th scope="col">#</th><th scope="col">Member</th><th scope="col">Times they picked (UTC)</th><th scope="col">Slot</th></tr></thead>
                    <tbody>
                      {adjustSorted.map((r) => {
                        const cur = asgFor(assignments, adjustDay, r.member_id);
                        const picked = new Set(list(r[adjustMeta.avail]));
                        return (
                          <tr key={r.member_id}>
                            <td>{adjustDay === 5 ? '-' : (r.ranks?.[adjustDay] || '-')}</td>
                            <td><strong>{r.in_game_name || '-'}</strong> <small>{r.member_id}</small></td>
                            <td>{[...picked].join(', ') || 'none'}</td>
                            <td>
                              <label className="sr-only" htmlFor={`slot-${adjustDay}-${r.member_id}`}>Slot for {r.in_game_name || r.member_id}</label>
                              <Select id={`slot-${adjustDay}-${r.member_id}`} tone="console" value={cur?.slot || ''} disabled={busy || readOnly}
                                onChange={(e) => (e.target.value
                                  ? act({ action: 'assign', day: adjustDay, buff: adjustMeta.buff, member_id: String(r.member_id), slot: e.target.value }, () => 'Slot saved and locked.')
                                  : act({ action: 'unassign', day: adjustDay, buff: adjustMeta.buff, member_id: String(r.member_id) }, () => 'Slot removed.'))}>
                                <option value="">No slot</option>
                                {SLOT_OPTIONS.map((s) => {
                                  const t = takenBy(s.value);
                                  const other = t && String(t.member_id) !== String(r.member_id);
                                  return <option key={s.value} value={s.value} disabled={Boolean(other)}>{slotRange(s.value)}{picked.has(s.value) ? ' (their time)' : ''}{other ? ` (booked: ${t.name || t.member_id})` : ''}</option>;
                                })}
                              </Select>
                              {cur?.manual && <small className="apx-lock"> locked by hand</small>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              )}
            </div>
          )}

          {step === 'publish' && (
            <div className="apx-panel" id="apx-publish">
              <h3 className="apx-h">Step 4 · Publish</h3>
              <p>Members see their slot in <strong>My appointment</strong> as soon as you publish, and the full schedule by day.</p>
              <dl className="apx-facts">
                <div><dt>Slots booked</dt><dd>{assignments.length}</dd></div>
                <div><dt>People</dt><dd>{people}</dd></div>
                <div className={unplaced.length ? 'is-attn' : ''}><dt>Not placed</dt><dd>{unplaced.length}</dd></div>
              </dl>
              <div className="apx-actions">
                {data.published
                  ? <Button variant="quiet" disabled={busy || readOnly} onClick={() => act({ action: 'publish', published: false }, () => 'Schedule unpublished. Members see Pending again.')}>Unpublish</Button>
                  : <Button disabled={busy || readOnly || assignments.length === 0} onClick={() => setConfirmPublish(true)}>Publish schedule</Button>}
                <span role="status">{data.published ? 'Published: members can see their slots.' : 'Draft: members only see Pending.'}</span>
              </div>
            </div>
          )}

          {step === 'share' && (
            <div className="apx-panel" id="apx-share">
              <h3 className="apx-h">Step 5 · Share</h3>
              <p className="help">Post the schedule where members will see it. Times are UTC (game time); the text says so.</p>
              <div className="apx-actions">
                <Button variant="quiet" onClick={downloadExcel}>Download Excel</Button>
                <ExportToGoogleDrive title={`K710 KvK Appointments - ${fileDate}`} getSheets={exportSheets} />
                <Button variant="quiet" onClick={copyText}>Copy as text for Discord</Button>
                {copied && <span role="status">{copied}</span>}
              </div>
              <details className="apx-preview" open>
                <summary>Text preview</summary>
                <pre tabIndex={0} aria-label="Schedule as plain text">{textSchedule}</pre>
              </details>
            </div>
          )}

          {next && (
            <div className="apx-next">
              <Button variant="quiet" onClick={() => setStep(next.id)}>Next: {next.title}</Button>
            </div>
          )}
        </>
      )}

      <AdminDialog
        open={confirmPublish}
        title="Publish the schedule?"
        onClose={() => setConfirmPublish(false)}
        busy={busy}
        role="alertdialog"
        footer={(
          <>
            <Button variant="quiet" onClick={() => setConfirmPublish(false)} disabled={busy}>Cancel</Button>
            <Button disabled={busy} onClick={async () => {
              const out = await act({ action: 'publish', published: true }, () => 'Schedule published.');
              if (out) setConfirmPublish(false);
            }}>{busy ? 'Working...' : 'Publish schedule'}</Button>
          </>
        )}
      >
        <p className="ec-confirm-line">{assignments.length} slots for {people} people will be visible to members straight away.</p>
        {unplaced.length > 0 && <p className="ec-confirm-line">{unplaced.length} {unplaced.length === 1 ? 'person has' : 'people have'} no slot yet and will see Pending.</p>}
      </AdminDialog>
    </section>
  );
}

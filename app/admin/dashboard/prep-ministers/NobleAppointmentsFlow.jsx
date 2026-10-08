'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminDialog from '../../../../components/admin/AdminDialog';
import ExportToGoogleDrive from '../../../../components/admin/ExportToGoogleDrive';
import useResultGate from '../../../../components/admin/useResultGate';
import { visibilityStatusLine, publishFormClosedWarning } from '../../../../lib/resultVisibility.mjs';
import StatusChip from '../../../../components/admin/StatusChip';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Select, Table } from '../../../../components/ui';
import { SLOT_OPTIONS, slotRange } from '../../../../lib/kvkAppointments.mjs';
import { nobleScheduleAsText, nobleScheduleSheets } from '../../../../lib/nobleAppointment.mjs';
import { buildXlsx } from './xlsx.mjs';
import PrepMinistersTable from './PrepMinistersTable';

// The Flamedragon Noble Advisor schedule as the SAME five steps as the KvK Appointments tab:
// Review answers -> Build schedule -> Adjust -> Publish -> Share. One slot per member.

const STEPS = [
  { id: 'review', title: 'Review answers' },
  { id: 'build', title: 'Build schedule' },
  { id: 'adjust', title: 'Adjust' },
  { id: 'publish', title: 'Publish' },
  { id: 'share', title: 'Share' },
];
const yes = (v) => ['yes', 'y'].includes(String(v ?? '').trim().toLowerCase());
const API = '/api/admin-noble-advisor/appointments';

export default function NobleAppointmentsFlow() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState('review');
  const [confirmPublish, setConfirmPublish] = useState(false);
  const gate = useResultGate('noble');
  const [copied, setCopied] = useState('');

  const load = useCallback(async () => {
    try {
      const res = await fetch(API, { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { router.push('/admin/login'); return; }
      if (!res.ok) throw new Error(body.error || 'Could not load the schedule.');
      setData(body);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [router]);
  useEffect(() => { load(); }, [load]);

  async function act(payload, okText) {
    setBusy(true); setStatus(''); setError('');
    try {
      const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Update failed.');
      setStatus(okText(body));
      await load();
      return body;
    } catch (err) {
      setError(err.message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  const rows = useMemo(() => data?.rows || [], [data]);
  const assignments = useMemo(() => data?.assignments || [], [data]);
  const unplaced = data?.unplaced || [];
  const readOnly = data ? data.is_live === false : false;
  const wanting = rows.filter((r) => yes(r.want_troop_training));
  const done = {
    review: rows.length > 0,
    build: assignments.length > 0,
    adjust: assignments.length > 0 && unplaced.length === 0,
    publish: data?.published === true,
    share: false,
  };
  const current = STEPS.findIndex((s) => s.id === step);
  const next = STEPS[current + 1];
  const takenBy = (slot) => assignments.find((a) => a.slot === slot);
  const asgOf = (id) => assignments.find((a) => String(a.member_id) === String(id));
  const adjustRows = useMemo(
    () => rows.filter((r) => yes(r.want_troop_training) || assignments.some((a) => String(a.member_id) === String(r.member_id)))
      .slice().sort((a, b) => String(a.in_game_name).localeCompare(String(b.in_game_name))),
    [rows, assignments],
  );

  const fileDate = new Date().toISOString().slice(0, 10);
  const textSchedule = useMemo(() => nobleScheduleAsText(assignments, { cycleLabel: data?.cycle_label || '' }), [assignments, data]);
  const exportSheets = () => nobleScheduleSheets(assignments);
  function downloadExcel() {
    const url = URL.createObjectURL(buildXlsx(exportSheets()));
    const a = document.createElement('a');
    a.href = url;
    a.download = `noble-advisor-schedule-${fileDate}.xlsx`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  }
  async function copyText() {
    try {
      await navigator.clipboard.writeText(textSchedule);
      setCopied('Copied. Paste it into Discord.');
    } catch {
      setCopied('Could not copy automatically. Select the text below and copy it.');
    }
  }

  return (
    <section className="apx" aria-label="Noble Advisor schedule">
      {error && <p className="event-form-error" role="alert">{error}</p>}
      <div aria-live="polite">{status && <p className="event-form-ok" role="status">{status}</p>}</div>
      {!data && !error && <TableSkeleton rows={6} />}
      {data && (
        <>
          <div className="apx-head">
            <strong>{data.cycle_label || 'No Flamedragon cycle'}</strong>
            <span className="help">{readOnly ? 'Earlier cycle: you can look and share, not change.' : 'Current cycle. One Noble Advisor slot per person on the 30-minute UTC grid.'}</span>
            <span className="apx-spacer" />
            <StatusChip kind={data.published ? 'published' : 'warn'}>{data.published ? 'Published to members' : 'Not published yet'}</StatusChip>
            {gate.open !== null && <span className="help" role="status" data-testid="result-visibility">{visibilityStatusLine('noble', gate.open)}</span>}
          </div>

          <ol className="apx-steps" aria-label="Noble Advisor steps">
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
              <p className="help">Everything members sent in the Noble Advisor form this cycle. Priority: transfers, then T11 promotion, then speedup days. You can fix a value in the table.</p>
              <PrepMinistersTable noble hideSchedule />
            </div>
          )}

          {step === 'build' && (
            <div className="apx-panel" id="apx-build">
              <h3 className="apx-h">Step 2 · Build schedule</h3>
              <p>The schedule ranks everyone who said Yes and gives out 30-minute slots inside the times they picked. Each person gets <strong>one slot</strong>. Slots you placed by hand stay as they are.</p>
              <p className="help">Building again replaces only the automatic slots, so it is safe to repeat after members change their answers.</p>
              <dl className="apx-facts">
                <div><dt>Answers</dt><dd>{rows.length}</dd></div>
                <div><dt>Want a time</dt><dd>{wanting.length}</dd></div>
                <div><dt>Slots booked</dt><dd>{assignments.length}</dd></div>
              </dl>
              <div className="apx-actions">
                <Button disabled={busy || readOnly || wanting.length === 0} onClick={async () => {
                  const out = await act({ action: 'build_schedule' }, (b) => `Schedule built: ${b.assigned} slots booked${b.locked ? `, ${b.locked} placed by hand` : ''}, ${b.unplaced.length} not placed.`);
                  if (out) setStep('adjust');
                }}>{assignments.length ? 'Build again' : 'Build schedule'}</Button>
                {wanting.length === 0 && <span className="help">Nothing to build yet: nobody asked for a time this cycle.</span>}
              </div>
            </div>
          )}

          {step === 'adjust' && (
            <div className="apx-panel" id="apx-adjust">
              <h3 className="apx-h">Step 3 · Adjust</h3>
              <p className="help">Pick a different time for anyone. A person you place or move is locked: building again will not touch them. Choose &quot;No slot&quot; to remove a booking.</p>
              {unplaced.length > 0 ? (
                <div className="apx-unplaced" role="region" aria-label="Members without a slot">
                  <h4>Not placed ({unplaced.length})</h4>
                  <ul>{unplaced.map((u) => <li key={u.member_id}><strong>{u.name || u.member_id}</strong>: {u.reason}</li>)}</ul>
                </div>
              ) : assignments.length > 0 ? <p className="apx-ok">Everyone who asked for a time has a slot.</p> : <p className="ec-empty">Nothing built yet. Go to Build schedule first.</p>}
              {adjustRows.length === 0 ? <p className="ec-empty">Nobody asked for a Noble Advisor time.</p> : (
                <div className="admin-table-wrap">
                  <Table className="stack-table apx-table">
                    <thead><tr><th scope="col">Member</th><th scope="col">Times they picked (UTC)</th><th scope="col">Slot</th></tr></thead>
                    <tbody>
                      {adjustRows.map((r) => {
                        const cur = asgOf(r.member_id);
                        const picked = new Set(r.avail_day4 || []);
                        return (
                          <tr key={r.member_id}>
                            <td><strong>{r.in_game_name || '-'}</strong> <small>{r.member_id}</small></td>
                            <td>{[...picked].join(', ') || 'none'}</td>
                            <td>
                              <label className="sr-only" htmlFor={`noble-slot-${r.member_id}`}>Slot for {r.in_game_name || r.member_id}</label>
                              <Select id={`noble-slot-${r.member_id}`} tone="console" value={cur?.slot || ''} disabled={busy || readOnly}
                                onChange={(e) => (e.target.value
                                  ? act({ action: 'assign', member_id: String(r.member_id), slot: e.target.value }, () => 'Slot saved and locked.')
                                  : act({ action: 'unassign', member_id: String(r.member_id) }, () => 'Slot removed.'))}>
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
              <p>Members see their time in <strong>My Noble Advisor appointment</strong> as soon as you publish, and the full schedule.</p>
              <dl className="apx-facts">
                <div><dt>Slots booked</dt><dd>{assignments.length}</dd></div>
                <div><dt>People</dt><dd>{new Set(assignments.map((a) => String(a.member_id))).size}</dd></div>
                <div className={unplaced.length ? 'is-attn' : ''}><dt>Not placed</dt><dd>{unplaced.length}</dd></div>
              </dl>
              <div className="apx-actions">
                {data.published
                  ? <Button variant="quiet" disabled={busy || readOnly} onClick={() => act({ action: 'publish', published: false }, () => 'Schedule unpublished. Members see that it is not published yet.')}>Unpublish</Button>
                  : <Button disabled={busy || readOnly || assignments.length === 0} onClick={() => setConfirmPublish(true)}>Publish schedule</Button>}
                <span role="status">{data.published ? 'Published: members can see their slots.' : 'Draft: members are told it is not published yet.'}</span>
              </div>
            </div>
          )}

          {step === 'share' && (
            <div className="apx-panel" id="apx-share">
              <h3 className="apx-h">Step 5 · Share</h3>
              <p className="help">Post the schedule where members will see it. Times are UTC (game time); the text says so.</p>
              <div className="apx-actions">
                <Button variant="quiet" onClick={downloadExcel}>Download Excel</Button>
                <ExportToGoogleDrive title={`K710 Noble Advisor Schedule - ${fileDate}`} getSheets={exportSheets} />
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
        title="Publish the Noble Advisor schedule?"
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
        <p className="ec-confirm-line">{assignments.length} slots for {new Set(assignments.map((a) => String(a.member_id))).size} people will be visible to members straight away.</p>
        {unplaced.length > 0 && <p className="ec-confirm-line">{unplaced.length} {unplaced.length === 1 ? 'person has' : 'people have'} no slot and will be told they were not placed.</p>}
        {publishFormClosedWarning('noble', gate.open) && (
          <p className="ec-confirm-line" role="alert">
            <strong>{publishFormClosedWarning('noble', gate.open)}</strong>{' '}
            <Button variant="quiet" disabled={busy} onClick={async () => { try { await gate.openNow(); setStatus('The form is open. Members can now see My Noble Advisor appointment.'); } catch (err) { setError(err.message); } }}>Open the form now</Button>
          </p>
        )}
      </AdminDialog>
    </section>
  );
}

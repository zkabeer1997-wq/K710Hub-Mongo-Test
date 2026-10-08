'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import AdminShell from '../../../../components/admin/AdminShell';
import TableSkeleton from '../../../../components/admin/TableSkeleton';
import { Button, Select, Table } from '../../../../components/ui';
import { APPOINTMENT_TYPES, SLOT_OPTIONS, typeKey, typeTitle, slotRange, CONTRIBUTION_WEIGHTS } from '../../../../lib/kvkAppointments.mjs';

const hasSlot = (assignments, type, slot) => assignments.find((a) => a.day === type.day && a.buff === type.buff && a.slot === slot);

export default function AdminKvkAppointmentsPage() {
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [cycleId, setCycleId] = useState('');
  const [selected, setSelected] = useState(typeKey(APPOINTMENT_TYPES[0]));
  const type = APPOINTMENT_TYPES.find((t) => typeKey(t) === selected);

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
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    await fetch('/api/admin-logout', { method: 'POST' });
    router.push('/admin/login');
    router.refresh();
  }

  const readOnly = data ? data.is_live === false : false;

  function exportCsv() {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Day / buff', 'Member', 'Player ID', 'TG', 'TTG', 'Speedup days', 'Score', 'Preferred hours (UTC)', 'Slot'].map(esc).join(',')];
    APPOINTMENT_TYPES.forEach((t) => {
      data.applications.filter((a) => a.day === t.day && a.buff === t.buff).forEach((a) => {
        const asg = data.assignments.find((x) => x.member_id === a.member_id && x.day === t.day && x.buff === t.buff);
        lines.push([typeTitle(t), a.in_game_name, a.member_id, a.tg, a.ttg, a.speedup_days, a.score, (a.preferred_hours || []).join(' '), asg ? slotRange(asg.slot) : ''].map(esc).join(','));
      });
    });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    link.download = `kvk-appointments-${(data.cycle_label || 'cycle').replace(/\W+/g, '-').toLowerCase()}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  const rows = useMemo(() => (data ? data.applications.filter((a) => a.day === type.day && a.buff === type.buff) : []), [data, type]);
  const assignments = data?.assignments || [];
  const mineFor = (memberId) => assignments.find((a) => a.member_id === memberId && a.day === type.day && a.buff === type.buff);

  return (
    <AdminShell title="KvK Appointments" subtitle="Rank applicants by contribution, give out 30-minute slots, then publish the schedule." onLogout={logout}>
      {error && <p className="event-form-error" role="alert">{error}</p>}
      <div aria-live="polite">{status && <p className="event-form-ok" role="status">{status}</p>}</div>
      {!data && !error && <TableSkeleton rows={6} />}
      {data && (
        <>
          <div className="admin-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 12 }}>
            <label htmlFor="appt-cycle" className="sr-only">KvK cycle</label>
            <Select id="appt-cycle" tone="console" value={data.cycle_id} onChange={(e) => setCycleId(e.target.value)} style={{ maxWidth: 280 }}>
              {(data.cycles || []).map((c) => <option key={c.id} value={c.id}>{c.label}{c.is_current ? ' (current)' : ''}</option>)}
            </Select>
            <span className="help">{readOnly ? 'Earlier cycle: view and export only.' : 'Current cycle.'}</span>
            <span style={{ flex: 1 }} />
            <Button variant="quiet" onClick={exportCsv}>Export all as CSV</Button>
          </div>
          <div className="admin-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <label htmlFor="appt-type" className="sr-only">Day and buff</label>
            <Select id="appt-type" tone="console" value={selected} onChange={(e) => setSelected(e.target.value)} style={{ maxWidth: 320 }}>
              {APPOINTMENT_TYPES.map((t) => <option key={typeKey(t)} value={typeKey(t)}>{typeTitle(t)} ({t.role})</option>)}
            </Select>
            <Button disabled={busy || readOnly} onClick={() => act({ action: 'auto_allocate', day: type.day, buff: type.buff }, (b) => `Allocated ${b.summary[0].assigned} slot(s); ${b.summary[0].unassigned} applicant(s) need a manual slot.`)}>
              Auto-allocate {type.label}
            </Button>
            <Button variant="quiet" disabled={busy || readOnly} onClick={() => act({ action: 'auto_allocate' }, () => 'Allocated every day. Manual placements were kept.')}>
              Auto-allocate all days
            </Button>
            <span style={{ flex: 1 }} />
            <span role="status">{data.published ? 'Published: members can see assignments.' : 'Draft: members only see Pending.'}</span>
            <Button variant={data.published ? 'quiet' : 'solid'} disabled={busy || readOnly} onClick={() => act({ action: 'publish', published: !data.published }, (b) => (b.published ? 'Schedule published.' : 'Schedule unpublished.'))}>
              {data.published ? 'Unpublish' : 'Publish schedule'}
            </Button>
          </div>
          <p className="help appt-help">
            Contribution score = TG x {CONTRIBUTION_WEIGHTS.tg} + TTG x {CONTRIBUTION_WEIGHTS.ttg} + speedup days x {CONTRIBUTION_WEIGHTS.speedup_days}.
            Ties go to the earlier application. Auto-allocate keeps manual placements and fills the rest; nobody is double-booked.
            Showing {data.cycle_label}.
          </p>
          {rows.length === 0 ? (
            <p>No applications for {typeTitle(type)} yet.</p>
          ) : (
            <div className="admin-table-wrap">
            <Table className="stack-table">
              <thead>
                <tr><th scope="col">#</th><th scope="col">Member</th><th scope="col">TG</th><th scope="col">TTG</th><th scope="col">Speedup days</th><th scope="col">Score</th><th scope="col">Preferred hours (UTC)</th><th scope="col">Slot</th></tr>
              </thead>
              <tbody>
                {rows.map((a, i) => {
                  const cur = mineFor(a.member_id);
                  return (
                    <tr key={a.member_id}>
                      <td>{i + 1}</td>
                      <td>{a.in_game_name || '-'} <small>{a.member_id}</small></td>
                      <td>{a.tg}</td><td>{a.ttg}</td><td>{a.speedup_days}</td><td>{a.score}</td>
                      <td>{a.preferred_hours.join(', ')}</td>
                      <td>
                        <label className="sr-only" htmlFor={`slot-${a.member_id}`}>Slot for {a.in_game_name || a.member_id}</label>
                        <Select
                          id={`slot-${a.member_id}`} tone="console" value={cur?.slot || ''} disabled={busy || readOnly}
                          onChange={(e) => (e.target.value
                            ? act({ action: 'assign', day: type.day, buff: type.buff, member_id: a.member_id, slot: e.target.value }, () => 'Slot assigned.')
                            : act({ action: 'unassign', day: type.day, buff: type.buff, member_id: a.member_id }, () => 'Slot cleared.'))}
                        >
                          <option value="">Unassigned</option>
                          {SLOT_OPTIONS.map((s) => {
                            const taken = hasSlot(assignments, type, s.value);
                            const takenByOther = taken && taken.member_id !== a.member_id;
                            return <option key={s.value} value={s.value} disabled={Boolean(takenByOther)}>{slotRange(s.value)}{takenByOther ? ' (booked)' : ''}</option>;
                          })}
                        </Select>
                        {cur?.manual && <small> manual</small>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}

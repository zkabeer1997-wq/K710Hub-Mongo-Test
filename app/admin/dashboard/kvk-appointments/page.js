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
  const [selected, setSelected] = useState(typeKey(APPOINTMENT_TYPES[0]));
  const type = APPOINTMENT_TYPES.find((t) => typeKey(t) === selected);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin-kvk-appointments', { cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) { router.push('/admin/login'); return; }
      if (!res.ok) throw new Error(body.error || 'Could not load appointments.');
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

  const rows = useMemo(() => (data ? data.applications.filter((a) => a.day === type.day && a.buff === type.buff) : []), [data, type]);
  const assignments = data?.assignments || [];
  const mineFor = (memberId) => assignments.find((a) => a.member_id === memberId && a.day === type.day && a.buff === type.buff);

  return (
    <AdminShell title="KvK Appointments" subtitle="Rank applicants by contribution, allocate 30-minute slots, then publish." onLogout={logout}>
      {error && <p className="event-form-error" role="alert">{error}</p>}
      <div aria-live="polite">{status && <p className="event-form-ok" role="status">{status}</p>}</div>
      {!data && !error && <TableSkeleton rows={6} />}
      {data && (
        <>
          <div className="admin-toolbar" style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <label htmlFor="appt-type" className="sr-only">Day and buff</label>
            <Select id="appt-type" tone="console" value={selected} onChange={(e) => setSelected(e.target.value)} style={{ maxWidth: 320 }}>
              {APPOINTMENT_TYPES.map((t) => <option key={typeKey(t)} value={typeKey(t)}>{typeTitle(t)} ({t.role})</option>)}
            </Select>
            <Button disabled={busy} onClick={() => act({ action: 'auto_allocate', day: type.day, buff: type.buff }, (b) => `Allocated ${b.summary[0].assigned} slot(s); ${b.summary[0].unassigned} applicant(s) need a manual slot.`)}>
              Auto-allocate {type.label}
            </Button>
            <Button variant="quiet" disabled={busy} onClick={() => act({ action: 'auto_allocate' }, () => 'Allocated every day. Manual placements were kept.')}>
              Auto-allocate all days
            </Button>
            <span style={{ flex: 1 }} />
            <span role="status">{data.published ? 'Published: members can see assignments.' : 'Draft: members only see Pending.'}</span>
            <Button variant={data.published ? 'quiet' : 'solid'} disabled={busy} onClick={() => act({ action: 'publish', published: !data.published }, (b) => (b.published ? 'Schedule published.' : 'Schedule unpublished.'))}>
              {data.published ? 'Unpublish' : 'Publish schedule'}
            </Button>
          </div>
          <p className="help appt-help">
            Contribution score = TG x {CONTRIBUTION_WEIGHTS.tg} + TTG x {CONTRIBUTION_WEIGHTS.ttg} + speedup days x {CONTRIBUTION_WEIGHTS.speedup_days}.
            Ties go to the earlier application. Auto-allocate keeps manual placements and fills the rest; nobody is double-booked.
            Cycle: {data.cycle_id}.
          </p>
          {rows.length === 0 ? (
            <p>No applications for {typeTitle(type)} yet.</p>
          ) : (
            <Table>
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
                          id={`slot-${a.member_id}`} tone="console" value={cur?.slot || ''} disabled={busy}
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
          )}
        </>
      )}
    </AdminShell>
  );
}

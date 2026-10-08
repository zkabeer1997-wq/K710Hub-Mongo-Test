'use client';

import { useEffect, useId, useState } from 'react';
import { Button, Input, Select } from '../../ui';
import UpsertNotice from '../UpsertNotice';
import HourPicker from './HourPicker';
import { APPOINTMENT_TYPES, PREFERRED_HOUR_COUNT, typeKey, typeTitle } from '../../../lib/kvkAppointments.mjs';
import { refreshMemberFormStatus } from '../../../lib/useMemberFormStatus';

// Apply for a minister / advisor appointment. The form renders even when the
// load fails so the hour picker is always usable; saving still needs the API.
export default function ApplyTab({ appts }) {
  const { data, error: loadError, reload } = appts;
  const uid = useId();
  const [selected, setSelected] = useState(typeKey(APPOINTMENT_TYPES[0]));
  const [name, setName] = useState('');
  const [tg, setTg] = useState('');
  const [ttg, setTtg] = useState('');
  const [speedup, setSpeedup] = useState('');
  const [hours, setHours] = useState([]);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const type = APPOINTMENT_TYPES.find((t) => typeKey(t) === selected);
  const existing = data?.applications?.find((a) => a.day === type.day && a.buff === type.buff) || null;
  // Not applied this cycle: start from the same day/buff's earlier-cycle answer (nothing is saved until Save).
  const carried = existing ? null : data?.previousApplications?.find((a) => a.day === type.day && a.buff === type.buff) || null;
  const selectedTitle = typeTitle(type);
  const closed = data ? !data.window.open : false;

  // Load the saved entry into the form whenever the type (or the data) changes.
  useEffect(() => {
    setMessage({ type: '', text: '' });
    const source = existing || carried;
    if (source) {
      setTg(String(source.tg ?? ''));
      setTtg(String(source.ttg ?? ''));
      setSpeedup(String(source.speedup_days ?? ''));
      setHours(source.preferred_hours || []);
    } else {
      setTg(''); setTtg(''); setSpeedup(''); setHours([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, existing?.updated_at, Boolean(carried), data?.previousApplications]);

  useEffect(() => { if (data?.defaultName && !name) setName(data.defaultName); }, [data?.defaultName, name]);

  async function submit(event) {
    event.preventDefault();
    if (hours.length !== PREFERRED_HOUR_COUNT) {
      setMessage({ type: 'error', text: `Pick exactly ${PREFERRED_HOUR_COUNT} preferred hours (you have ${hours.length}).` });
      return;
    }
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/kvk-appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ day: type.day, buff: type.buff, in_game_name: name, tg, ttg, speedup_days: speedup, preferred_hours: hours }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not save your application.');
      setMessage({ type: 'ok', text: `Saved for ${data?.cycleLabel || 'this KvK'}: ${selectedTitle}. Your earlier answers for this one were replaced.` });
      refreshMemberFormStatus();
      reload();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="event-form-card appt-card">
      {loadError && <p className="event-form-error" role="alert">{loadError}</p>}
      {data && (
        <p className={`event-form-window${closed ? ' is-closed' : ''}`}>
          <span>{closed ? (data.window.note || data.window.message || 'Applications are closed.') : 'Applications are open.'}</span>
        </p>
      )}
      <UpsertNotice known={Boolean(data)} updatedAt={existing?.updated_at || null} cycleLabel={data?.cycleLabel || null} previousLabel={carried ? data.previousLabel : null} subject={selectedTitle} />
      <form onSubmit={submit} noValidate aria-describedby={`${uid}-status`}>
        <div className="event-form-field">
          <label htmlFor={`${uid}-type`}>Day and buff</label>
          <Select id={`${uid}-type`} tone="console" value={selected} onChange={(e) => setSelected(e.target.value)} disabled={saving}>
            {APPOINTMENT_TYPES.map((t) => (
              <option key={typeKey(t)} value={typeKey(t)}>{typeTitle(t)} ({t.role})</option>
            ))}
          </Select>
        </div>
        <div className="event-form-field">
          <label htmlFor={`${uid}-name`}>In-game name</label>
          <Input id={`${uid}-name`} tone="console" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} maxLength={120} />
        </div>
        <div className="appt-numbers">
          <div className="event-form-field">
            <label htmlFor={`${uid}-tg`}>TG</label>
            <Input id={`${uid}-tg`} tone="console" inputMode="numeric" autoComplete="off" placeholder="0" value={tg} onChange={(e) => setTg(e.target.value)} disabled={saving || closed} />
          </div>
          <div className="event-form-field">
            <label htmlFor={`${uid}-ttg`}>TTG</label>
            <Input id={`${uid}-ttg`} tone="console" inputMode="numeric" autoComplete="off" placeholder="0" value={ttg} onChange={(e) => setTtg(e.target.value)} disabled={saving || closed} />
          </div>
          <div className="event-form-field">
            <label htmlFor={`${uid}-su`}>Speedup days</label>
            <Input id={`${uid}-su`} tone="console" inputMode="decimal" autoComplete="off" placeholder="0" value={speedup} onChange={(e) => setSpeedup(e.target.value)} disabled={saving || closed} />
          </div>
        </div>
        <p className="help appt-help">Leadership ranks applicants by contribution (TG, TTG, speedups) and gives the best contributors their preferred hours first.</p>
        <HourPicker value={hours} onChange={setHours} disabled={saving || closed} />
        <div id={`${uid}-status`} aria-live="polite">
          {message.text && <p className={message.type === 'ok' ? 'event-form-ok' : 'event-form-error'} role={message.type === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
        </div>
        <Button type="submit" disabled={saving || closed}>
          {saving ? 'Saving…' : existing ? 'Update my application' : 'Submit my application'}
        </Button>
      </form>
    </div>
  );
}

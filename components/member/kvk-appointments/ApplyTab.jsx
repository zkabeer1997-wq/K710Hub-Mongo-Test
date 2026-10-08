'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Button, Input } from '../../ui';
import UpsertNotice from '../UpsertNotice';
import HourPicker from './HourPicker';
import { APPOINTMENT_TYPES, PREFERRED_HOUR_COUNT, typeKey, typeTitle } from '../../../lib/kvkAppointments.mjs';
import { refreshMemberFormStatus } from '../../../lib/useMemberFormStatus';
import './apply.css';
import '../easy-view-fixes.css';

const blankBuff = { want: '', tg: '', ttg: '', speedup: '', hours: [] };

// Starting values for every buff. This cycle's applications win; with none, last cycle's are offered.
// Once the member has any earlier answer, a buff missing from it starts as "No" (they chose not to
// apply for it). Nothing is saved until Save is pressed.
function startingState(data) {
  const thisCycle = data?.applications || [];
  const source = thisCycle.length ? thisCycle : data?.previousApplications || [];
  const out = {};
  for (const type of APPOINTMENT_TYPES) {
    const found = source.find((a) => a.day === type.day && a.buff === type.buff);
    out[typeKey(type)] = found
      ? { want: 'yes', tg: String(found.tg ?? ''), ttg: String(found.ttg ?? ''), speedup: String(found.speedup_days ?? ''), hours: found.preferred_hours || [] }
      : { ...blankBuff, want: source.length ? 'no' : '' };
  }
  return out;
}

// One form for all three buffs: shared in-game name once, then a section per buff with its own
// Yes/No choice, TG, TTG, speedup days and preferred hours. One Save sends everything.
export default function ApplyTab({ appts }) {
  const { data, error: loadError, reload } = appts;
  const uid = useId();
  const [name, setName] = useState('');
  const [buffs, setBuffs] = useState(() => startingState(null));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });
  const [confirmRemove, setConfirmRemove] = useState(null);
  const messageRef = useRef(null);

  const closed = data ? !data.window.open : false;
  const thisCycle = data?.applications || [];
  const hasSaved = thisCycle.length > 0;
  const carried = !hasSaved && (data?.previousApplications || []).length > 0;
  const updatedAt = thisCycle.map((a) => a.updated_at).filter(Boolean).sort().pop() || null;
  const savedTitles = APPOINTMENT_TYPES.filter((t) => thisCycle.some((a) => a.day === t.day && a.buff === t.buff)).map(typeTitle).join(', ');

  useEffect(() => { if (data) setBuffs(startingState(data)); }, [data]);
  useEffect(() => {
    if (!data) return;
    const known = thisCycle.find((a) => a.in_game_name)?.in_game_name || (data.previousApplications || []).find((a) => a.in_game_name)?.in_game_name || data.defaultName || '';
    setName((current) => current || known);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  function patch(key, change) {
    setConfirmRemove(null);
    setMessage({ type: '', text: '' });
    setBuffs((prev) => ({ ...prev, [key]: { ...prev[key], ...change } }));
  }

  function fail(text) {
    setMessage({ type: 'error', text });
    requestAnimationFrame(() => messageRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
  }

  async function save(event, confirmed = false) {
    event?.preventDefault();
    const wanted = [];
    const removing = [];
    for (const type of APPOINTMENT_TYPES) {
      const state = buffs[typeKey(type)];
      if (!state.want) return fail(`Please choose Yes or No for ${typeTitle(type)}.`);
      if (state.want === 'no') {
        if (thisCycle.some((a) => a.day === type.day && a.buff === type.buff)) removing.push(type);
        continue;
      }
      if (state.hours.length !== PREFERRED_HOUR_COUNT) {
        return fail(`${typeTitle(type)}: pick exactly ${PREFERRED_HOUR_COUNT} preferred hours (you have ${state.hours.length}).`);
      }
      wanted.push(type);
    }
    if (!wanted.length) return fail('Choose Yes for at least one buff, then press Save.');
    if (removing.length && !confirmed) {
      setMessage({ type: '', text: '' });
      setConfirmRemove(removing.map(typeTitle));
      requestAnimationFrame(() => messageRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
      return;
    }
    setConfirmRemove(null);
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/kvk-appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          in_game_name: name,
          applications: wanted.map((type) => {
            const s = buffs[typeKey(type)];
            return { day: type.day, buff: type.buff, tg: s.tg, ttg: s.ttg, speedup_days: s.speedup, preferred_hours: s.hours };
          }),
          withdraw: removing.map((type) => ({ day: type.day, buff: type.buff })),
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || 'Could not save your application.');
      const label = body.cycleLabel || data?.cycleLabel || 'this KvK';
      setMessage({
        type: 'ok',
        text: `Saved for ${label}: ${body.saved || wanted.map(typeTitle).join(', ')}.${body.withdrawn ? ` Removed: ${body.withdrawn}.` : ''}`,
      });
      requestAnimationFrame(() => messageRef.current?.scrollIntoView?.({ block: 'center', behavior: 'smooth' }));
      refreshMemberFormStatus();
      reload();
    } catch (err) {
      fail(err.message);
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
      <UpsertNotice known={Boolean(data)} updatedAt={updatedAt} cycleLabel={data?.cycleLabel || null} previousLabel={carried ? data.previousLabel : null} subject={hasSaved ? savedTitles : null} />
      <form onSubmit={save} noValidate aria-describedby={`${uid}-status`}>
        <p className="appt-intro">One form for all three buffs. For each one, choose Yes or No. Then press Save once at the bottom.</p>
        <div className="event-form-field">
          <label htmlFor={`${uid}-name`}>In-game name</label>
          <Input id={`${uid}-name`} tone="console" autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} disabled={saving} maxLength={120} />
        </div>
        <p className="help appt-help">Leadership ranks applicants by contribution (TG, TTG, speedups) and gives the best contributors their preferred hours first.</p>

        {APPOINTMENT_TYPES.map((type) => {
          const key = typeKey(type);
          const s = buffs[key];
          const title = typeTitle(type);
          const id = `${uid}-${type.day}-${type.buff}`;
          const hadSaved = thisCycle.some((a) => a.day === type.day && a.buff === type.buff);
          return (
            <section key={key} className={`appt-buff${s.want === 'yes' ? ' is-on' : ''}`} aria-labelledby={`${id}-h`}>
              <h3 id={`${id}-h`} className="appt-buff-title">{title}<span>{type.role}</span></h3>
              <fieldset className="appt-choice" disabled={saving || closed}>
                <legend>Do you want the {title} buff?</legend>
                <label className={`appt-choice-opt${s.want === 'yes' ? ' is-picked' : ''}`}>
                  <input type="radio" name={`${id}-want`} value="yes" checked={s.want === 'yes'} onChange={() => patch(key, { want: 'yes' })} />
                  <span>Yes, I want this buff</span>
                </label>
                <label className={`appt-choice-opt${s.want === 'no' ? ' is-picked' : ''}`}>
                  <input type="radio" name={`${id}-want`} value="no" checked={s.want === 'no'} onChange={() => patch(key, { want: 'no' })} />
                  <span>No, I do not want this one</span>
                </label>
              </fieldset>
              {s.want === 'no' && hadSaved && <p className="appt-warn">You applied for this one before. Saving will remove that application{data?.published ? ' and any time you were given' : ''}.</p>}
              {s.want === 'yes' && (
                <div className="appt-buff-body">
                  <div className="appt-numbers">
                    <div className="event-form-field">
                      <label htmlFor={`${id}-tg`}>TG</label>
                      <Input id={`${id}-tg`} tone="console" inputMode="numeric" autoComplete="off" placeholder="0" value={s.tg} onChange={(e) => patch(key, { tg: e.target.value })} disabled={saving || closed} />
                    </div>
                    <div className="event-form-field">
                      <label htmlFor={`${id}-ttg`}>TTG</label>
                      <Input id={`${id}-ttg`} tone="console" inputMode="numeric" autoComplete="off" placeholder="0" value={s.ttg} onChange={(e) => patch(key, { ttg: e.target.value })} disabled={saving || closed} />
                    </div>
                    <div className="event-form-field">
                      <label htmlFor={`${id}-su`}>Speedup days</label>
                      <Input id={`${id}-su`} tone="console" inputMode="decimal" autoComplete="off" placeholder="0" value={s.speedup} onChange={(e) => patch(key, { speedup: e.target.value })} disabled={saving || closed} />
                    </div>
                  </div>
                  <HourPicker value={s.hours} onChange={(hours) => patch(key, { hours })} disabled={saving || closed} label={`Preferred hours for ${title}`} />
                </div>
              )}
            </section>
          );
        })}

        <div id={`${uid}-status`} aria-live="polite" ref={messageRef} className="appt-status-box">
          {confirmRemove && (
            <div className="appt-confirm" role="alertdialog" aria-label="Confirm removing applications">
              <p><strong>Remove {confirmRemove.join(' and ')}?</strong> You said No, but you applied for {confirmRemove.length > 1 ? 'them' : 'it'} before. Saving will remove {confirmRemove.length > 1 ? 'those applications' : 'that application'}{data?.published ? ' and any time you were given' : ''}.</p>
              <div className="appt-confirm-actions">
                <Button type="button" onClick={() => save(null, true)} disabled={saving}>Yes, remove and save</Button>
                <Button type="button" variant="quiet" onClick={() => setConfirmRemove(null)} disabled={saving}>Go back</Button>
              </div>
            </div>
          )}
          {message.text && <p className={message.type === 'ok' ? 'event-form-ok' : 'event-form-error'} role={message.type === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
        </div>
        <Button type="submit" className="appt-save" disabled={saving || closed}>
          {saving ? 'Saving…' : hasSaved ? 'Save my changes' : 'Save my appointments'}
        </Button>
      </form>
    </div>
  );
}

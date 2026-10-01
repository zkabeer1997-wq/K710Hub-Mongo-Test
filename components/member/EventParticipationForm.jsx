'use client';

import { useEffect, useId, useState } from 'react';
import Icon from '../ui/icons';
import DualTime from '../ui/DualTime';
import { Button, Input } from '../ui';
import UpsertNotice from './UpsertNotice';
import { VOTE_OPTIONS } from '../../lib/eventForms.mjs';
import { refreshMemberFormStatus } from '../../lib/useMemberFormStatus';

// Short single-card vote: legion time / flexible / absent + current power.
// The window shown here comes from the API, and the API enforces it again on save.
export default function EventParticipationForm({ form }) {
  const uid = useId();
  const [data, setData] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [vote, setVote] = useState('');
  const [power, setPower] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  useEffect(() => {
    let alive = true;
    fetch(`/api/event-participation?form=${encodeURIComponent(form.slug)}`, { cache: 'no-store' })
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || 'Could not load this form.');
        return body;
      })
      .then((body) => {
        if (!alive) return;
        setData(body);
        if (body.entry) {
          setVote(body.entry.vote);
          setPower(String(body.entry.power));
        }
      })
      .catch((err) => { if (alive) setLoadError(err.message); });
    return () => { alive = false; };
  }, [form.slug]);

  const win = data?.window;
  const open = win?.state === 'open';

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });
    try {
      const res = await fetch('/api/event-participation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ form: form.slug, vote, power }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (body.window) setData((d) => ({ ...d, window: body.window }));
        throw new Error(body.error || 'Could not save your vote.');
      }
      setData((d) => ({ ...d, entry: body.entry }));
      setMessage({ type: 'ok', text: 'Saved. Your previous entry was replaced.' });
      refreshMemberFormStatus();
    } catch (err) {
      setMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="event-form-card">
      {loadError && <p className="event-form-error" role="alert">{loadError}</p>}
      {!data && !loadError && <p role="status">Loading…</p>}
      {data && (
        <>
          <p className={`event-form-window${open ? '' : ' is-closed'}`}>
            <Icon name={open ? 'clock' : 'lock'} size={18} />
            <span>{win.message}</span>
          </p>
          {win.state === 'upcoming' && win.opensAt && (
            <p className="event-form-times">Opens <DualTime value={new Date(win.opensAt).toISOString()} /></p>
          )}
          {open && win.closesAt && (
            <p className="event-form-times">Closes <DualTime value={new Date(win.closesAt).toISOString()} /></p>
          )}
          {win.note && !open && <p className="event-form-times">{win.note}</p>}

          <UpsertNotice known updatedAt={data.entry?.updated_at || null} />

          <form onSubmit={submit} aria-describedby={`${uid}-status`} noValidate>
            <fieldset className="vote-group" disabled={!open || saving}>
              <legend>Your vote</legend>
              {VOTE_OPTIONS.map((option) => (
                <label key={option.value} className="vote-option">
                  <input type="radio" name="vote" value={option.value} checked={vote === option.value} onChange={() => setVote(option.value)} required />
                  <div><b>{option.label}</b><span>{option.hint}</span></div>
                </label>
              ))}
            </fieldset>
            <div className="event-form-field">
              <label htmlFor={`${uid}-power`}>Current power</label>
              <Input
                id={`${uid}-power`} tone="console" inputMode="numeric" autoComplete="off" placeholder="e.g. 48,500,000"
                value={power} onChange={(e) => setPower(e.target.value)} disabled={!open || saving} required
                aria-describedby={`${uid}-power-help`}
              />
              <p className="help" id={`${uid}-power-help`}>Whole number from your governor profile. Commas are fine.</p>
            </div>
            <div id={`${uid}-status`} aria-live="polite">
              {message.text && <p className={message.type === 'ok' ? 'event-form-ok' : 'event-form-error'} role={message.type === 'ok' ? 'status' : 'alert'}>{message.text}</p>}
            </div>
            <Button type="submit" disabled={!open || saving || !vote || !power}>
              {saving ? 'Saving…' : data.entry ? 'Update my vote' : 'Submit my vote'}
            </Button>
          </form>
        </>
      )}
    </div>
  );
}

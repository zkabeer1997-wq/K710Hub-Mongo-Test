'use client';
import { useEffect, useState } from 'react';
import { TIME_SLOTS, NOBLE_TIME_SLOTS } from '../lib/nobleAdvisor.mjs';

// "13:30" UTC -> the viewer's local clock time for today (UTC-only on the server / before mount).
function localSlotTime(slot) {
  const [h, m] = slot.split(':').map(Number);
  const now = new Date();
  const ms = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), h, m);
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(ms));
}

// slots: the grid to show (defaults to the legacy prep grid, so KvK Prep Backpack is unchanged).
// showLocal: also print the viewer's local time under each UTC slot (Noble Advisor).
export function SlotPicker({ label, sublabel, selected, onToggle, slots = TIME_SLOTS, showLocal = false }) {
  const [zone, setZone] = useState('');
  useEffect(() => {
    if (!showLocal) return;
    try { setZone(Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'); } catch { setZone('local'); }
  }, [showLocal]);
  return (
    <div className="prep-slot-group">
      <div className="prep-slot-head">
        <strong>{label}</strong>
        <span className="prep-slot-count">{selected.length} selected</span>
        {sublabel ? <span className="prep-slot-sub">{sublabel} &middot; UTC</span> : null}
        {showLocal && zone ? <span className="prep-slot-sub">Big times are UTC. Small times are your local time ({zone}).</span> : null}
      </div>
      <div className={showLocal ? 'prep-slot-grid prep-slot-grid--local' : 'prep-slot-grid'}>
        {slots.map((slot) => {
          const on = selected.includes(slot);
          return (
            <button
              type="button"
              key={slot}
              className={on ? 'prep-slot on' : 'prep-slot'}
              onClick={() => onToggle(slot)}
              aria-pressed={on}
            >
              {slot}{showLocal ? <span className="prep-slot-utc"> UTC</span> : null}
              {showLocal && zone ? <small className="prep-slot-local">{localSlotTime(slot)} local</small> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}


// slots / showLocal: Noble Advisor passes NOBLE_TIME_SLOTS + showLocal; KvK Prep Backpack passes nothing.
export default function NobleAdvisorFields({ form, updateField, availDay4, onToggle, slots = TIME_SLOTS, showLocal = false }) {
 return (
      <section className="form-block">
        <span className="minister-day-badge">Day 4</span>
        <h3>Noble Advisor &mdash; Troop Training</h3>
        <label>Do you want a Troop Training appointment?
          <select value={form.wantTroopTraining} onChange={(e) => updateField('wantTroopTraining', e.target.value)}>
            <option value="">Select</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </label>
        <label>Are you a transfer?
          <select value={form.isTransfer} onChange={(e) => updateField('isTransfer', e.target.value)}>
            <option value="">Select</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </label>
        <label>How many days of speedups will you use? (600+ days gets more slots)<input value={form.troopSpeedupDays} onChange={(e) => updateField('troopSpeedupDays', e.target.value)} /></label>
        <label>Promoting to T11 troops?
          <select value={form.promotingT11} onChange={(e) => updateField('promotingT11', e.target.value)}>
            <option value="">Select</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </label>
        <SlotPicker label="Available Times &mdash; Day 4 (Troop Training)" sublabel="Every 30 minutes, starting 00:00 UTC" selected={availDay4} onToggle={onToggle} slots={slots} showLocal={showLocal} />
      </section>

 );
}

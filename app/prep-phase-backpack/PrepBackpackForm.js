'use client';

import { useState } from 'react';

import NobleAdvisorFields, { SlotPicker } from '../../components/NobleAdvisorFields';
import { useFormFieldMeta } from '../../lib/useFormFieldMeta';
const CONSTRUCTION_UPGRADES = ['TG5', 'TG6', 'TG7', 'TG8'];
const T11_TROOPS = ['T11 Infantry', 'T11 Cavalry', 'T11 Archers'];

const initialForm = {
  inGameName: '',
  wantConstruction: '',
  constructionUpgrades: [],
  ttgUsed: '',
  tgUsed: '',
  wantResearch: '',
  t11Troops: [],
  tgDust: '',
  researchSpeedupDays: '',
  wantTroopTraining: '',
  isTransfer: '',
  troopSpeedupDays: '',
  promotingT11: '',
  notes: '',
};

export default function PrepBackpackForm({ initialMemberId = '' }) {
  const { intro } = useFormFieldMeta('prep');
  const [form, setForm] = useState(initialForm);
  const [availDay1, setAvailDay1] = useState([]);
  const [availDay2, setAvailDay2] = useState([]);
  const [availDay4, setAvailDay4] = useState([]);
  const [availDay5, setAvailDay5] = useState([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [isError, setIsError] = useState(false);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function toggleInArray(setter) {
    return (value) =>
      setter((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  function toggleCheckbox(key, value) {
    setForm((prev) => {
      const list = prev[key];
      return { ...prev, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setStatus('');
    setIsError(false);
    if (!initialMemberId) {
      setIsError(true);
      setStatus('Missing Member ID. Please return to the hub and unlock again.');
      return;
    }
    if (!String(form.inGameName).trim()) {
      setIsError(true);
      setStatus('Please enter your in-game name.');
      return;
    }
    setLoading(true);
    const payload = {
      member_id: initialMemberId,
      in_game_name: form.inGameName,
      want_construction: form.wantConstruction,
      construction_upgrades: form.constructionUpgrades,
      ttg_used: form.ttgUsed,
      tg_used: form.tgUsed,
      want_research: form.wantResearch,
      t11_troops: form.t11Troops,
      tg_dust: form.tgDust,
      research_speedup_days: form.researchSpeedupDays,
      want_troop_training: form.wantTroopTraining,
      is_transfer: form.isTransfer,
      troop_speedup_days: form.troopSpeedupDays,
      promoting_t11: form.promotingT11,
      avail_day1: availDay1,
      avail_day2: availDay2,
      avail_day4: availDay4,
      avail_day5: availDay5,
      notes: form.notes,
    };
    const response = await fetch('/api/prep-backpack', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) {
      setIsError(true);
      setStatus(result.error || 'Something went wrong. Please try again.');
      return;
    }
    setIsError(false);
    setStatus('Thanks! Your Prep Phase Backpack booking has been received.');
    setForm(initialForm);
    setAvailDay1([]);
    setAvailDay2([]);
    setAvailDay4([]);
    setAvailDay5([]);
  }

  return (
    <form className="public-form-card minister-hall-form" onSubmit={handleSubmit}>
      <div className="form-section-header prep-header-block">
        <span>{intro.kicker}</span>
        <h1>{intro.heading}</h1>
        <p>Booking as Member ID: <strong>{initialMemberId || '(unknown)'}</strong></p>
      </div>

      <section className="identity-grid">
        <label>In-game name<input value={form.inGameName} onChange={(e) => updateField('inGameName', e.target.value)} /></label>
      </section>

      <div className="prep-day-grid">
        <section className="form-block">
        <span className="minister-day-badge">Day 1</span>
        <h3>Chief Minister &mdash; Construction</h3>
        <label>Do you want the Construction Chief Minister buff?
          <select value={form.wantConstruction} onChange={(e) => updateField('wantConstruction', e.target.value)}>
            <option value="">Select</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </label>
        <div className="checkbox-row">
          <span>Construction Upgrades</span>
          {CONSTRUCTION_UPGRADES.map((opt) => (
            <label key={opt} className="chk">
              <input type="checkbox" checked={form.constructionUpgrades.includes(opt)} onChange={() => toggleCheckbox('constructionUpgrades', opt)} />
              {opt}
            </label>
          ))}
        </div>
        <label>How much TTG will you use?<input value={form.ttgUsed} onChange={(e) => updateField('ttgUsed', e.target.value)} /></label>
        <label>How much TG will you use?<input value={form.tgUsed} onChange={(e) => updateField('tgUsed', e.target.value)} /></label>
        <SlotPicker label="Available Times &mdash; Day 1 (Construction)" sublabel="30-minute start times, UTC" selected={availDay1} onToggle={toggleInArray(setAvailDay1)} />
      </section>

      <section className="form-block">
        <span className="minister-day-badge">Day 2</span>
        <h3>Chief Minister &mdash; Research</h3>
        <label>Do you want Chief Minister for research?
          <select value={form.wantResearch} onChange={(e) => updateField('wantResearch', e.target.value)}>
            <option value="">Select</option>
            <option value="Yes">Yes</option>
            <option value="No">No</option>
          </select>
        </label>
        <div className="checkbox-row">
          <span>Which new T11 troop are you unlocking?</span>
          {T11_TROOPS.map((opt) => (
            <label key={opt} className="chk">
              <input type="checkbox" checked={form.t11Troops.includes(opt)} onChange={() => toggleCheckbox('t11Troops', opt)} />
              {opt}
            </label>
          ))}
        </div>
        <label>How much TG Dust will you use?<input value={form.tgDust} onChange={(e) => updateField('tgDust', e.target.value)} /></label>
        <label>How many days of speedups will you use? (Include general speedups)<input value={form.researchSpeedupDays} onChange={(e) => updateField('researchSpeedupDays', e.target.value)} /></label>
        <SlotPicker label="Available Times &mdash; Day 2 (Research)" sublabel="30-minute start times, UTC" selected={availDay2} onToggle={toggleInArray(setAvailDay2)} />
      </section>

      <NobleAdvisorFields form={form} updateField={updateField} availDay4={availDay4} onToggle={toggleInArray(setAvailDay4)} />

      <section className="form-block">
        <span className="minister-day-badge minister-day-badge-overflow">Day 5</span>
        <h3>Overflow &mdash; Construction &amp; Research second chance</h3>
        <p className="prep-slot-sub">If you are not scheduled on Day 1 or Day 2, you may be placed here. Pick any times you are available.</p>
        <SlotPicker label="Available Times &mdash; Day 5 (Overflow)" sublabel="30-minute start times, UTC" selected={availDay5} onToggle={toggleInArray(setAvailDay5)} />
      </section>
        </div>

      <section className="form-block">
        <label>Notes for the planner<textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={3} /></label>
      </section>

      {status ? <div className={isError ? 'status error' : 'status'}>{status}</div> : null}
      <button type="submit" className="submit-btn" disabled={loading}>{loading ? 'Submitting...' : 'Submit booking'}</button>
    </form>
  );
}

'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';

import { SlotPicker } from '../../components/NobleAdvisorFields';
import '../../components/member/easy-view-fixes.css';
import './prep.css';
import { NOBLE_TIME_SLOTS } from '../../lib/nobleAdvisor.mjs';
import { useFormFieldMeta } from '../../lib/useFormFieldMeta';
import { refreshMemberFormStatus } from '../../lib/useMemberFormStatus';
import IdentityFields from '../../components/member/IdentityFields';

const CONSTRUCTION_UPGRADES = ['TG5', 'TG6', 'TG7', 'TG8'];
const T11_TROOPS = ['T11 Infantry', 'T11 Cavalry', 'T11 Archers'];
const ONE_PER_DAY = 'Pick every half hour you can be online. Leadership gives each person at most one time per day.';
const TIME_HELPER = 'Pick every half hour you can be online (times are UTC; your local time is shown).';

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

// The four steps, in order. `want` is the form key that holds the Yes/No for the day (Day 5 has none).
const STEPS = [
  { id: 'day1', day: 1, title: 'Construction', buff: 'Chief Minister buff', want: 'wantConstruction', avail: 'availDay1', ask: 'Do you want the Chief Minister buff for Construction?' },
  { id: 'day2', day: 2, title: 'Research', buff: 'Chief Minister buff', want: 'wantResearch', avail: 'availDay2', ask: 'Do you want the Chief Minister buff for Research?' },
  { id: 'day4', day: 4, title: 'Troop Training', buff: 'Noble Advisor buff', want: 'wantTroopTraining', avail: 'availDay4', ask: 'Do you want the Noble Advisor buff for Troop Training?' },
  { id: 'day5', day: 5, title: 'Overflow', buff: 'second chance for Day 1 and Day 2', want: null, avail: 'availDay5', ask: 'Do you want a second chance on Day 5?' },
];

function YesNo({ id, legend, value, onChange, error }) {
  return (
    <fieldset className="prep-yn" aria-describedby={error ? `${id}-err` : undefined}>
      <legend>{legend}</legend>
      <div className="prep-yn-row">
        {['Yes', 'No'].map((opt) => (
          <label key={opt} className={value === opt ? `prep-yn-opt is-on is-${opt.toLowerCase()}` : 'prep-yn-opt'}>
            <input type="radio" name={id} value={opt} checked={value === opt} onChange={() => onChange(opt)} />
            <span>{opt}</span>
          </label>
        ))}
      </div>
      {error ? <p className="prep-err" id={`${id}-err`}>{error}</p> : null}
    </fieldset>
  );
}

export default function PrepBackpackForm({ identity }) {
  const memberId = identity?.memberId || '';
  const { intro } = useFormFieldMeta('prep');
  const [form, setForm] = useState(() => ({ ...initialForm, inGameName: identity?.name || '' }));
  const [avail, setAvail] = useState({ availDay1: [], availDay2: [], availDay4: [], availDay5: [] });
  const [overflow, setOverflow] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState('');
  const [saved, setSaved] = useState(null);
  const savedRef = useRef(null);
  const formRef = useRef(null);

  // Start from this cycle's saved booking; if there is none yet, start from last cycle's answers
  // (the notice above says so). Nothing is saved until the member presses Save.
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/prep-backpack', { cache: 'no-store', signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const r = data?.record || data?.previous;
        if (!r) {
          // Never filled in: at least start with the name we already know.
          const known = data?.identity?.name || data?.base?.name;
          if (known) setForm((prev) => ({ ...prev, inGameName: prev.inGameName || known }));
          return;
        }
        setForm({
          inGameName: r.in_game_name || data?.identity?.name || identity?.name || '',
          wantConstruction: r.want_construction || '',
          constructionUpgrades: r.construction_upgrades || [],
          ttgUsed: r.ttg_used || '',
          tgUsed: r.tg_used || '',
          wantResearch: r.want_research || '',
          t11Troops: r.t11_troops || [],
          tgDust: r.tg_dust || '',
          researchSpeedupDays: r.research_speedup_days || '',
          wantTroopTraining: r.want_troop_training || '',
          isTransfer: r.is_transfer || '',
          troopSpeedupDays: r.troop_speedup_days || '',
          promotingT11: r.promoting_t11 || '',
          notes: r.notes || '',
        });
        setAvail({ availDay1: r.avail_day1 || [], availDay2: r.avail_day2 || [], availDay4: r.avail_day4 || [], availDay5: r.avail_day5 || [] });
        if ((r.avail_day5 || []).length) setOverflow('Yes');
        else if (data?.record) setOverflow('No');
      })
      .catch(() => {});
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateField(key, value) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] || prev.name ? { ...prev, [key]: undefined, name: key === 'inGameName' ? undefined : prev.name } : prev));
  }
  function toggleCheckbox(key, value) {
    setForm((prev) => {
      const list = prev[key];
      return { ...prev, [key]: list.includes(value) ? list.filter((v) => v !== value) : [...list, value] };
    });
  }
  function toggleSlot(key) {
    return (slot) => {
      setAvail((prev) => ({ ...prev, [key]: prev[key].includes(slot) ? prev[key].filter((v) => v !== slot) : [...prev[key], slot] }));
      setErrors((prev) => (prev[key] ? { ...prev, [key]: undefined } : prev));
    };
  }
  const setAllSlots = (key) => () => setAvail((prev) => ({ ...prev, [key]: [...NOBLE_TIME_SLOTS] }));
  const clearSlots = (key) => () => setAvail((prev) => ({ ...prev, [key]: [] }));

  const answer = (step) => (step.want ? form[step.want] : overflow);
  const counts = useMemo(() => Object.fromEntries(STEPS.map((s) => [s.id, avail[s.avail].length])), [avail]);

  function validate() {
    const next = {};
    if (!String(form.inGameName).trim()) next.name = 'Type your in-game name in the first box, then press Save again.';
    for (const step of STEPS) {
      const a = answer(step);
      if (step.want && !a) next[step.id] = `Day ${step.day}: choose Yes or No under "${step.title}".`;
      else if (a === 'Yes' && counts[step.id] === 0) next[step.avail] = `Day ${step.day}: tap at least one half hour you can be online, or choose No if you do not want this buff.`;
    }
    return next;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError('');
    setSaved(null);
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length) {
      requestAnimationFrame(() => formRef.current?.querySelector('.prep-err')?.scrollIntoView({ block: 'center', behavior: 'auto' }));
      return;
    }
    setLoading(true);
    // A day answered No sends no times, so leadership never schedules someone who said No.
    const times = (step) => (answer(step) === 'Yes' ? avail[step.avail] : []);
    const payload = {
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
      avail_day1: times(STEPS[0]),
      avail_day2: times(STEPS[1]),
      avail_day4: times(STEPS[2]),
      avail_day5: times(STEPS[3]),
      notes: form.notes,
    };
    try {
      const response = await fetch('/api/prep-backpack', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        setServerError(result.error || 'Something went wrong. Please try again.');
        return;
      }
      setSaved({ label: result.cycle?.label || '' });
      refreshMemberFormStatus();
      requestAnimationFrame(() => { savedRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' }); savedRef.current?.focus(); });
    } catch {
      setServerError('We could not reach the website. Check your connection and press Save again.');
    } finally {
      setLoading(false);
    }
  }

  const reviewRows = STEPS.map((step) => {
    const a = answer(step);
    const n = counts[step.id];
    return { step, a, n };
  });
  const errorList = Object.values(errors).filter(Boolean);

  return (
    <form ref={formRef} className="public-form-card minister-hall-form prep2" onSubmit={handleSubmit} noValidate>
      <div className="form-section-header prep-header-block">
        <span>{intro.kicker}</span>
        <h1>{intro.heading || 'KvK Prep & Appointments'}</h1>
        <p className="prep2-lede">{intro.description || 'This one form is how you ask for your buffs on prep days and tell us when you are online.'}</p>
        <p className="prep2-rule">{ONE_PER_DAY}</p>
      </div>

      {saved ? (
        <div className="prep2-saved" role="status" tabIndex={-1} ref={savedRef}>
          <strong>Saved{saved.label ? ` for ${saved.label}` : ''}.</strong>
          <p>Leadership will publish the schedule here: check My appointment.</p>
          <Link className="prep2-btn" href="/forms/kvk-appointments">Go to My appointment</Link>
        </div>
      ) : null}

      <section className="prep2-block">
        <IdentityFields memberId={memberId} name={form.inGameName} onNameChange={(v) => updateField('inGameName', v)} label="Your in-game name" known={Boolean(identity?.name)} invalid={Boolean(errors.name)} describedBy={errors.name ? 'prep-name-err' : undefined} />
        {errors.name ? <p className="prep-err" id="prep-name-err">{errors.name}</p> : null}
      </section>

      {STEPS.map((step, index) => {
        const a = answer(step);
        const wantId = `prep-${step.id}`;
        return (
          <section key={step.id} className="prep2-block prep2-day" aria-labelledby={`${wantId}-h`} data-answer={a || ''}>
            <p className="prep2-step">Step {index + 1} of {STEPS.length}</p>
            <h2 id={`${wantId}-h`}>
              <span className="minister-day-badge">Day {step.day}</span> {step.title}
              <small className="prep2-buff">{step.buff}</small>
            </h2>
            {step.id === 'day5' ? <p className="prep2-note">Only if you wanted the Day 1 or Day 2 buff and leadership could not fit you in. Pick any times you can be online on Day 5.</p> : null}
            <YesNo
              id={wantId}
              legend={step.ask}
              value={a}
              error={errors[step.id]}
              onChange={(v) => {
                if (step.want) updateField(step.want, v); else setOverflow(v);
                setErrors((prev) => ({ ...prev, [step.id]: undefined, [step.avail]: undefined }));
              }}
            />
            {a === 'Yes' ? (
              <div className="prep2-follow">
                {step.id === 'day1' ? (
                  <>
                    <div className="checkbox-row prep2-checks">
                      <span>Which Construction upgrades?</span>
                      {CONSTRUCTION_UPGRADES.map((opt) => (
                        <label key={opt} className="chk">
                          <input type="checkbox" checked={form.constructionUpgrades.includes(opt)} onChange={() => toggleCheckbox('constructionUpgrades', opt)} />
                          {opt}
                        </label>
                      ))}
                    </div>
                    <label className="prep2-field">How much TTG will you use?<input value={form.ttgUsed} inputMode="decimal" onChange={(e) => updateField('ttgUsed', e.target.value)} /></label>
                    <label className="prep2-field">How much TG will you use?<input value={form.tgUsed} inputMode="decimal" onChange={(e) => updateField('tgUsed', e.target.value)} /></label>
                  </>
                ) : null}
                {step.id === 'day2' ? (
                  <>
                    <div className="checkbox-row prep2-checks">
                      <span>Which new T11 troop are you unlocking?</span>
                      {T11_TROOPS.map((opt) => (
                        <label key={opt} className="chk">
                          <input type="checkbox" checked={form.t11Troops.includes(opt)} onChange={() => toggleCheckbox('t11Troops', opt)} />
                          {opt}
                        </label>
                      ))}
                    </div>
                    <label className="prep2-field">How much TG Dust will you use?<input value={form.tgDust} inputMode="decimal" onChange={(e) => updateField('tgDust', e.target.value)} /></label>
                    <label className="prep2-field">How many days of speedups will you use? (include general speedups)<input value={form.researchSpeedupDays} inputMode="decimal" onChange={(e) => updateField('researchSpeedupDays', e.target.value)} /></label>
                  </>
                ) : null}
                {step.id === 'day4' ? (
                  <>
                    <label className="prep2-field">Are you a transfer?
                      <select value={form.isTransfer} onChange={(e) => updateField('isTransfer', e.target.value)}>
                        <option value="">Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </label>
                    <label className="prep2-field">How many days of speedups will you use? (600+ days gets more times)<input value={form.troopSpeedupDays} inputMode="decimal" onChange={(e) => updateField('troopSpeedupDays', e.target.value)} /></label>
                    <label className="prep2-field">Are you promoting to T11 troops?
                      <select value={form.promotingT11} onChange={(e) => updateField('promotingT11', e.target.value)}>
                        <option value="">Select</option>
                        <option value="Yes">Yes</option>
                        <option value="No">No</option>
                      </select>
                    </label>
                  </>
                ) : null}
                <SlotPicker
                  label={`When can you be online on Day ${step.day}?`}
                  helper={TIME_HELPER}
                  showLocal
                  selected={avail[step.avail]}
                  onToggle={toggleSlot(step.avail)}
                  onSelectAll={setAllSlots(step.avail)}
                  onClear={clearSlots(step.avail)}
                />
                {errors[step.avail] ? <p className="prep-err" id={`${wantId}-times-err`}>{errors[step.avail]}</p> : null}
              </div>
            ) : a === 'No' ? (
              <p className="prep2-skip">Okay, no {step.id === 'day5' ? 'second chance' : 'buff'} on Day {step.day}. Scroll down for the next step.</p>
            ) : null}
          </section>
        );
      })}

      <section className="prep2-block">
        <label className="prep2-field">Anything else leadership should know? (optional)
          <textarea value={form.notes} onChange={(e) => updateField('notes', e.target.value)} rows={3} />
        </label>
      </section>

      <section className="prep2-block prep2-review" aria-labelledby="prep-review-h">
        <h2 id="prep-review-h">Check your choices</h2>
        <ul>
          {reviewRows.map(({ step, a, n }) => (
            <li key={step.id}>
              <b>Day {step.day} {step.title}</b>
              <span>{!a ? 'Not answered yet' : a === 'No' ? 'No' : `Yes, ${n} ${n === 1 ? 'time' : 'times'} picked`}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="prep2-actions">
        {errorList.length ? (
          <div className="prep-err-box" role="alert">
            <strong>Please fix this before saving:</strong>
            <ul>{errorList.map((m) => <li key={m}>{m}</li>)}</ul>
          </div>
        ) : null}
        {serverError ? <div className="prep-err-box" role="alert">{serverError}</div> : null}
        <button type="submit" className="submit-btn prep2-save" disabled={loading}>{loading ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

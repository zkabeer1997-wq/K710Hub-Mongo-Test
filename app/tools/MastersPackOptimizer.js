"use client";
import { useCallback, useMemo, useState } from "react";
import { optimizeMastersPacks, MASTER_PACK_RESOURCES } from "../../lib/mastersPackOptimizer.mjs";
import { useToolPersistence } from "../../lib/useToolPersistence";
import { SaveToRoadmap } from "../../components/tools/PlannerExperience";
import { calculateMasterLevelMaterials, createMasterSkillInputs, MASTER_LEVEL_DATA } from "../../lib/mastersLevelCalculator.mjs";
import styles from "./MastersPackOptimizer.module.css";

const EMPTY = { supply: 0, emblems: 0, affinity: 0, manuscripts: 0 };
const COLORS = { supply: "#65a9d8", emblems: "#d9a94e", affinity: "#86a873", manuscripts: "#ef8348" };
const money = value => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value);
const number = value => Math.round(value).toLocaleString();
const createCalculator = (masterName = "Valora") => ({ id: `${masterName}-${Date.now()}-${Math.random()}`, masterName, currentLevel: 0, currentAffinity: 0, targetLevel: 10, skills: createMasterSkillInputs(masterName) });
const DEFAULT_CALCULATORS = [createCalculator("Valora")];

function normalizeResources(value = {}) {
  return Object.fromEntries(Object.keys(MASTER_PACK_RESOURCES).map(key => [key, Math.max(0, Number(value[key]) || 0)]));
}

function migrateMastersPackState(inputs) {
  const legacy = inputs?.calculator ? [inputs.calculator] : [];
  const savedCalculators = Array.isArray(inputs?.calculators) && inputs.calculators.length ? inputs.calculators : legacy;
  return {
    manualNeed: normalizeResources(inputs?.manualNeed || inputs?.need),
    overrideRequirements: Boolean(inputs?.overrideRequirements),
    optionalSupply: Math.max(0, Number(inputs?.optionalSupply) || 0),
    have: normalizeResources(inputs?.have),
    maxMonths: Math.min(6, Math.max(1, Number(inputs?.maxMonths) || 3)),
    calculators: (savedCalculators.length ? savedCalculators : DEFAULT_CALCULATORS).map((entry, entryIndex) => {
      const masterName = MASTER_LEVEL_DATA[entry?.masterName] ? entry.masterName : "Valora";
      return {
        id: entry?.id || `${masterName}-${entryIndex}`,
        masterName,
        currentLevel: Math.min(100, Math.max(0, Number(entry?.currentLevel) || 0)),
        currentAffinity: Math.max(0, Number(entry?.currentAffinity) || 0),
        targetLevel: Math.min(100, Math.max(0, Number(entry?.targetLevel) || 10)),
        skills: createMasterSkillInputs(masterName).map((skill, index) => ({ ...skill, ...entry?.skills?.[index] })),
      };
    }),
  };
}

function EmptyIcon({ type = "idle" }) {
  if (type === "covered") return <svg className={styles.emptyMark} viewBox="0 0 48 48" aria-hidden="true"><path d="m11 25 8 8 18-19" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/><circle cx="24" cy="24" r="20" fill="none" stroke="currentColor" strokeWidth="2"/></svg>;
  if (type === "error") return <svg className={styles.emptyMark} viewBox="0 0 48 48" aria-hidden="true"><path d="M24 15v12m0 7v.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/><path d="M24 5 44 41H4L24 5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/></svg>;
  return <svg className={styles.emptyMark} viewBox="0 0 48 48" aria-hidden="true"><path d="M24 5 42 15v18L24 43 6 33V15L24 5Z" fill="none" stroke="currentColor" strokeWidth="2"/><path d="M16 25h16M24 17v16" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>;
}

function NumberField({ resource, label, value, onChange }) {
  return <label className={styles.field}><span className={styles.fieldLabel}><i className={styles.swatch} style={{ background: COLORS[resource] }}/>{label}</span><input type="number" min="0" step="1" inputMode="numeric" value={value} onChange={event => onChange(Math.max(0, Number(event.target.value) || 0))}/></label>;
}

export default function MastersPackOptimizer({ toolKey = "masters-pack-optimizer" }) {
  const [manualNeed, setManualNeed] = useState(EMPTY);
  const [overrideRequirements, setOverrideRequirements] = useState(false);
  const [optionalSupply, setOptionalSupply] = useState(0);
  const [have, setHave] = useState(EMPTY);
  const [maxMonths, setMaxMonths] = useState(3);
  const [result, setResult] = useState(null);
  const [calculators, setCalculators] = useState(DEFAULT_CALCULATORS);
  const [calculating, setCalculating] = useState(false);
  const persistedInputs = useMemo(() => ({ manualNeed, overrideRequirements, optionalSupply, have, maxMonths, calculators }), [manualNeed, overrideRequirements, optionalSupply, have, maxMonths, calculators]);
  const restore = useCallback(saved => {
    const normalized = migrateMastersPackState(saved);
    setManualNeed(normalized.manualNeed);
    setOverrideRequirements(normalized.overrideRequirements);
    setOptionalSupply(normalized.optionalSupply);
    setHave(normalized.have);
    setMaxMonths(normalized.maxMonths);
    setCalculators(normalized.calculators);
    setResult(null);
  }, []);
  const persistence = useToolPersistence({
    toolKey,
    schemaVersion: 4,
    inputs: persistedInputs,
    restore,
    migrate: migrateMastersPackState,
    autoDetect: true,
  });
  const calculatedRows = useMemo(() => calculators.map(calculateMasterLevelMaterials), [calculators]);
  const calculatedMaterials = useMemo(() => calculatedRows.reduce((total, row) => ({ affinity: total.affinity + row.affinity, emblems: total.emblems + row.emblems, manuscripts: total.manuscripts + row.manuscripts }), { affinity: 0, emblems: 0, manuscripts: 0 }), [calculatedRows]);
  const calculatedNeed = useMemo(() => ({ supply: optionalSupply, ...calculatedMaterials }), [calculatedMaterials, optionalSupply]);
  const need = overrideRequirements ? manualNeed : calculatedNeed;
  const shortfall = useMemo(() => Object.fromEntries(Object.keys(MASTER_PACK_RESOURCES).map(key => [key, Math.max(0, need[key] - have[key])])), [need, have]);
  const updateCalculator = (id, updater) => { setCalculators(current => current.map(entry => entry.id === id ? updater(entry) : entry)); setResult(null); };
  const addMaster = () => {
    const used = new Set(calculators.map(entry => entry.masterName));
    const next = Object.keys(MASTER_LEVEL_DATA).find(name => !used.has(name));
    if (next) setCalculators(current => [...current, createCalculator(next)]);
  };
  const update = (setter, key, value) => { setter(current => ({ ...current, [key]: value })); setResult(null); };
  const calculate = () => {
    setCalculating(true);
    requestAnimationFrame(() => {
      setResult(optimizeMastersPacks({ need, have, maxMonths }));
      setCalculating(false);
    });
  };
  const hasPlan = result && !result.covered && !result.infeasible && !result.timedOut;
  const months = hasPlan ? Array.from({ length: result.months }, (_, index) => {
    const weeks = result.schedule.filter(week => week.month === index + 1);
    return { number: index + 1, weeks, cost: weeks.flatMap(week => [...week.acuity, ...week.regular]).reduce((sum, pack) => sum + pack.price, 0) };
  }) : [];

  return <section className={styles.shell}>
    <div className={styles.inputs}>
      <div className={styles.persistence}><SaveToRoadmap persistence={persistence} compact/></div>
      <section className={styles.levelCalculator}>
        <div className={styles.panelHead}><div><span className={styles.eyebrow}>Start here</span><h2>Choose every Master you are upgrading</h2><p>Add multiple Masters, set each relationship and skill target, then optimize the combined shortfall below.</p></div><span className={styles.limitTag}>Exact game costs</span></div>
        <div className={styles.masterList}>{calculators.map((calculator, calculatorIndex) => <article className={styles.masterCard} key={calculator.id}>
          <header><strong>Master {calculatorIndex + 1}</strong>{calculators.length > 1 && <button type="button" onClick={() => setCalculators(current => current.filter(entry => entry.id !== calculator.id))}>Remove</button>}</header>
          <div className={styles.calculatorGrid}>
            <label className={styles.field}><span className={styles.fieldLabel}>Master</span><select aria-label={`Master ${calculatorIndex + 1}`} value={calculator.masterName} onChange={event => { const masterName = event.target.value; updateCalculator(calculator.id, current => ({ ...current, masterName, skills: createMasterSkillInputs(masterName) })); }}>{Object.keys(MASTER_LEVEL_DATA).map(name => <option key={name} disabled={calculators.some(entry => entry.id !== calculator.id && entry.masterName === name)}>{name}</option>)}</select></label>
            <NumberField resource="affinity" label="Current relationship" value={calculator.currentLevel} onChange={value => updateCalculator(calculator.id, current => ({ ...current, currentLevel: Math.min(100, value), targetLevel: Math.max(Math.min(100, value), current.targetLevel) }))}/>
            <NumberField resource="affinity" label="Progress into current level" value={calculator.currentAffinity} onChange={value => updateCalculator(calculator.id, current => ({ ...current, currentAffinity: value }))}/>
            <NumberField resource="affinity" label="Target relationship" value={calculator.targetLevel} onChange={value => updateCalculator(calculator.id, current => ({ ...current, targetLevel: Math.min(100, Math.max(current.currentLevel, value)) }))}/>
          </div>
          <details className={styles.skillDetails}><summary>Optional skill upgrades</summary><div className={styles.skillPlanner}>{calculator.skills.map((skill, index) => { const max = MASTER_LEVEL_DATA[calculator.masterName].skills[index].costs.length - 1; return <div className={styles.skillRow} key={skill.name}><b>{skill.name}</b><label>Current<select value={skill.current} onChange={event => updateCalculator(calculator.id, current => ({ ...current, skills: current.skills.map((item, itemIndex) => itemIndex === index ? { ...item, current: Number(event.target.value), target: Math.max(Number(event.target.value), item.target) } : item) }))}>{Array.from({ length: max + 1 }, (_, level) => <option key={level}>{level}</option>)}</select></label><span aria-hidden="true">→</span><label>Target<select value={skill.target} onChange={event => updateCalculator(calculator.id, current => ({ ...current, skills: current.skills.map((item, itemIndex) => itemIndex === index ? { ...item, target: Number(event.target.value) } : item) }))}>{Array.from({ length: max - skill.current + 1 }, (_, offset) => skill.current + offset).map(level => <option key={level}>{level}</option>)}</select></label></div>; })}</div></details>
          <div className={styles.masterSubtotal}><span>{number(calculatedRows[calculatorIndex].affinity)} Affinity</span><span>{number(calculatedRows[calculatorIndex].emblems)} Emblems</span><span>{number(calculatedRows[calculatorIndex].manuscripts)} Manuscripts</span></div>
        </article>)}</div>
        <button className={styles.addMaster} type="button" onClick={addMaster} disabled={calculators.length >= Object.keys(MASTER_LEVEL_DATA).length}>+ Add another Master</button>
        <div className={styles.calculatorResult}><span><small>Affinity</small><b>{number(calculatedMaterials.affinity)}</b></span><span><small>Emblems</small><b>{number(calculatedMaterials.emblems)}</b></span><span><small>Manuscripts</small><b>{number(calculatedMaterials.manuscripts)}</b></span><p>Combined amounts automatically feed the pack optimizer below.</p></div>
      </section>
      <div className={styles.panelHead}><div><h2>Inventory and purchase plan</h2><p>Your combined Master targets are the optimizer requirement. Enter only what you already own.</p></div><span className={styles.limitTag}>Monthly + weekly limits</span></div>
      <div className={styles.columns}>
        <div className={styles.column}><h3>Calculated requirement</h3>{Object.entries(MASTER_PACK_RESOURCES).map(([key, resource]) => <div className={styles.readonlyResource} key={key}><span><i className={styles.swatch} style={{ background: COLORS[key] }}/>{resource.label}</span><b>{number(need[key])}</b></div>)}</div>
        <div className={styles.column}><h3>Current inventory</h3>{Object.entries(MASTER_PACK_RESOURCES).map(([key, resource]) => <NumberField key={key} resource={key} label={resource.label} value={have[key]} onChange={value => update(setHave, key, value)}/>)}</div>
      </div>
      <NumberField resource="supply" label="Optional Adventure Supply target" value={optionalSupply} onChange={value => { setOptionalSupply(value); setResult(null); }}/>
      <details className={styles.override}><summary>Advanced: manually override calculated requirements</summary><label><input type="checkbox" checked={overrideRequirements} onChange={event => { setOverrideRequirements(event.target.checked); setResult(null); }}/> Use manual requirements instead</label>{overrideRequirements && <div className={styles.overrideGrid}>{Object.entries(MASTER_PACK_RESOURCES).map(([key, resource]) => <NumberField key={key} resource={key} label={resource.label} value={manualNeed[key]} onChange={value => update(setManualNeed, key, value)}/>)}</div>}</details>
      <div className={styles.settings}>
        <NumberField resource="emblems" label="Maximum months to plan" value={maxMonths} onChange={value => { setMaxMonths(Math.min(6, Math.max(1, value))); setResult(null); }}/>
        <div className={styles.cadence}><b>Planning cadence</b>Four regular-pack weeks per month. Each Acuity tier appears once per month.</div>
      </div>
      <div className={styles.shortfall}><strong>Remaining shortfall</strong>{Object.entries(shortfall).map(([key, value]) => <span key={key}>{MASTER_PACK_RESOURCES[key].label} <b>{number(value)}</b></span>)}</div>
      <button className={styles.calculate} type="button" onClick={calculate} disabled={calculating}>{calculating ? "Optimizing monthly choices…" : "Build cheapest purchase plan"}</button>
      <p className={styles.rule}>Acuity: one purchase at each price point per month, choosing one reward. Regular packs: one purchase per pack family and price point each week. Elite Spices count as 1,000 Affinity and Silver Goblets as 100.</p>
    </div>

    <div className={styles.results} aria-live="polite">
      {!result && <div className={styles.empty}><EmptyIcon/><h2>Your Masters pack plan appears here</h2><p>The optimizer compares every Acuity reward choice with the four weekly pack families and returns the lowest-cost schedule.</p></div>}
      {result?.covered && <div className={`${styles.empty} ${styles.covered}`}><EmptyIcon type="covered"/><h2>Your inventory already covers the target</h2><p>No Masters packs are required.</p></div>}
      {result?.infeasible && <div className={`${styles.empty} ${styles.error}`}><EmptyIcon type="error"/><h2>No plan fits this horizon</h2><p>Increase the maximum months or lower the target amounts.</p></div>}
      {result?.timedOut && <div className={`${styles.empty} ${styles.error}`}><EmptyIcon type="error"/><h2>This search was too large</h2><p>Reduce the planning horizon or enter more current inventory, then calculate again.</p></div>}
      {hasPlan && <>
        {result.partialSearch && <div className={styles.partial}>Best plan found before the search limit; a lower-cost combination may exist.</div>}
        <div className={styles.resultHead}><div className={styles.total}><span>Lowest-cost plan</span><strong>{money(result.cost)}</strong></div><dl className={styles.metrics}><div><dt>Timeline</dt><dd>{result.months} month{result.months === 1 ? "" : "s"}</dd></div><div><dt>Regular weeks</dt><dd>{result.weeks}</dd></div><div><dt>Average / month</dt><dd>{money(result.cost / result.months)}</dd></div></dl></div>
        <div className={styles.summary}><div><h3>Purchase limits applied</h3><p>{result.months} Acuity cycle{result.months === 1 ? "" : "s"} and {result.weeks} regular-pack weeks searched</p></div>{Object.entries(result.shortfall).map(([key, value]) => <span key={key}><b>{number(value)}</b> {MASTER_PACK_RESOURCES[key].label}</span>)}</div>
        <div className={styles.monthList}>{months.map(month => <article className={styles.month} key={month.number}><header className={styles.monthHeader}><span>Month {month.number}</span><strong>{money(month.cost)}</strong></header>{month.weeks.map(week => <div className={styles.week} key={week.week}><div className={styles.weekTitle}>Week {week.week}</div>{week.acuity.length > 0 && <div className={styles.packGroup}><h4>Masters Acuity selections</h4>{week.acuity.map((pack, index) => <div className={styles.pack} key={`${pack.tier}-${index}`}><b>{pack.tier}</b><span>{MASTER_PACK_RESOURCES[pack.resource].label} · +{number(pack.amount)}</span><em>{money(pack.price)}</em></div>)}</div>}{week.regular.length > 0 && <div className={styles.packGroup}><h4>Regular Masters packs</h4>{week.regular.map((pack, index) => <div className={styles.pack} key={`${pack.resource}-${pack.tier}-${index}`}><b>{pack.tier}</b><span>{MASTER_PACK_RESOURCES[pack.resource].label} · +{number(pack.amount)}</span><em>{money(pack.price)}</em></div>)}</div>}{week.acuity.length === 0 && week.regular.length === 0 && <div className={styles.pack}><b>No purchase</b><span>Skip all Masters packs this week.</span><em>{money(0)}</em></div>}</div>)}</article>)}</div>
      </>}
    </div>
  </section>;
}

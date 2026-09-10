"use client";

import { useCallback, useMemo, useState } from "react";
import { useToolPersistence } from "../../lib/useToolPersistence";
import { calculateUpdatedConstruction, exportUpdatedConstructionCsv } from "../../lib/updatedConstruction.mjs";
import { CONSTRUCTION_SOURCE, CONSTRUCTION_TIERS, UPDATED_CONSTRUCTION_BUILDINGS } from "../../lib/updatedConstructionData.mjs";
import { DataLabel, FirstUseGuide, SaveToRoadmap } from "./PlannerExperience";
import styles from "./UpdatedConstructionPlanner.module.css";

const LEVELS = ["30", ...CONSTRUCTION_TIERS];
const today = () => new Date().toISOString().slice(0, 10);
const initialSelections = () => UPDATED_CONSTRUCTION_BUILDINGS.map((building) => ({ id: building.id, current: "30", target: "30" }));
const initialState = () => ({
  selections: initialSelections(),
  inventory: { trueGold: 0, temperedTrueGold: 0 },
  settings: { includePrerequisites: true },
  refinement: {
    dailyIncome: 0,
    reserve: 0,
    refinementState: 1,
    completedToday: 0,
    refinementsPerDay: 1,
    startWeekday: new Date().getUTCDay(),
    horizonDays: 14,
    startDate: today(),
    targetDate: "",
    riskMode: "conservative",
  },
});
const fmt = (value, digits = 0) => Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: digits });
const duration = (seconds) => `${fmt(seconds / 86400, 1)} days`;
const migrateState = (inputs) => inputs;

function download(name, content, type) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

export default function UpdatedConstructionPlanner() {
  const [state, setState] = useState(initialState);
  const restore = useCallback((saved) => setState((current) => ({
    ...current,
    ...saved,
    inventory: { ...current.inventory, ...saved.inventory },
    settings: { ...current.settings, ...saved.settings },
    refinement: { ...current.refinement, ...saved.refinement },
    selections: Array.isArray(saved.selections) ? initialSelections().map((row) => ({ ...row, ...saved.selections.find((item) => item.id === row.id) })) : current.selections,
  })), []);
  const persistence = useToolPersistence({ toolKey: "updated-construction", schemaVersion: 1, inputs: state, restore, migrate: migrateState, autoDetect: true });
  const plan = useMemo(() => calculateUpdatedConstruction(state.selections, state.inventory, state.refinement, state.settings), [state]);
  const updateSelection = (id, key, value) => setState((current) => ({
    ...current,
    selections: current.selections.map((row) => {
      if (row.id !== id) return row;
      const next = { ...row, [key]: value };
      if (key === "current" && LEVELS.indexOf(next.target) < LEVELS.indexOf(value)) next.target = value;
      if (key === "target" && LEVELS.indexOf(value) < LEVELS.indexOf(next.current)) next.current = value;
      return next;
    }),
  }));
  const updateGroup = (group, key, value) => setState((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
  const loadExample = () => setState({
    selections: initialSelections().map((row) => row.id === "town-center" ? { ...row, current: "TG5", target: "TG8" } : row.id === "embassy" ? { ...row, current: "TG5", target: "TG7" } : row),
    inventory: { trueGold: 5000, temperedTrueGold: 40 },
    settings: { includePrerequisites: true },
    refinement: { ...initialState().refinement, dailyIncome: 200, reserve: 500, refinementsPerDay: 3, horizonDays: 21, riskMode: "conservative" },
  });
  const exportJson = () => download("updated-construction-plan.json", JSON.stringify(plan, null, 2), "application/json");
  const exportCsv = () => download("updated-construction-plan.csv", exportUpdatedConstructionCsv(plan), "text/csv;charset=utf-8");
  const firstDay = plan.refining.schedule?.find((day) => day.runs > 0);

  return <div className={styles.shell}>
    <FirstUseGuide
      toolKey="updated-construction"
      title="Build a construction and refining plan"
      steps={["Set the current and target TG tier for each building.", "Enter the True Gold and Tempered True Gold you own.", "Configure the Crucible schedule and follow the ordered plan."]}
      terms={[["TG tier", "One complete tier contains five construction stages."], ["Protected reserve", "True Gold the refining schedule must not spend."], ["Risk mode", "Guaranteed uses minimum output; expected uses probability-weighted output."]]}
      onDemo={loadExample}
    />
    <SaveToRoadmap persistence={persistence} />

    <div className={styles.workspace}>
      <div className={styles.inputs}>
        <section className={styles.panel}>
          <div className={styles.heading}><span>01</span><div><h2>Building targets</h2><p>Each transition represents all five stages in that TG tier.</p></div></div>
          <div className={styles.table} role="table" aria-label="Construction targets">
            <div className={`${styles.row} ${styles.header}`} role="row"><span>Building</span><span>Current</span><span>Target</span><span>Required</span></div>
            {UPDATED_CONSTRUCTION_BUILDINGS.map((building) => {
              const selection = state.selections.find((row) => row.id === building.id);
              const buildingSteps = plan.steps.filter((step) => step.buildingId === building.id);
              return <div className={styles.row} role="row" key={building.id}>
                <strong>{building.name}</strong>
                <select aria-label={`${building.name} current tier`} value={selection.current} onChange={(event) => updateSelection(building.id, "current", event.target.value)}>{LEVELS.map((level) => <option key={level}>{level}</option>)}</select>
                <select aria-label={`${building.name} target tier`} value={selection.target} onChange={(event) => updateSelection(building.id, "target", event.target.value)}>{LEVELS.map((level) => <option key={level}>{level}</option>)}</select>
                <span>{buildingSteps.length ? `${fmt(buildingSteps.reduce((sum, step) => sum + step.trueGold, 0))} TG · ${fmt(buildingSteps.reduce((sum, step) => sum + step.temperedTrueGold, 0))} TTG` : "—"}</span>
              </div>;
            })}
          </div>
          <label className={styles.check}><input type="checkbox" checked={state.settings.includePrerequisites} onChange={(event) => updateGroup("settings", "includePrerequisites", event.target.checked)} />Include known Town Center prerequisites through TG8</label>
        </section>

        <section className={styles.panel}>
          <div className={styles.heading}><span>02</span><div><h2>Inventory</h2><p>Construction requirements are protected before the schedule spends TG on refining.</p></div></div>
          <div className={styles.fields}>
            <label>Current True Gold<input type="number" min="0" inputMode="numeric" value={state.inventory.trueGold} onChange={(event) => updateGroup("inventory", "trueGold", Math.max(0, Number(event.target.value) || 0))} /></label>
            <label>Current Tempered True Gold<input type="number" min="0" inputMode="numeric" value={state.inventory.temperedTrueGold} onChange={(event) => updateGroup("inventory", "temperedTrueGold", Math.max(0, Number(event.target.value) || 0))} /></label>
            <label>Additional protected TG<input type="number" min="0" inputMode="numeric" value={state.refinement.reserve} onChange={(event) => updateGroup("refinement", "reserve", Math.max(0, Number(event.target.value) || 0))} /></label>
            <label>Daily TG income<input type="number" min="0" inputMode="numeric" value={state.refinement.dailyIncome} onChange={(event) => updateGroup("refinement", "dailyIncome", Math.max(0, Number(event.target.value) || 0))} /></label>
          </div>
        </section>

        <section className={styles.panel}>
          <div className={styles.heading}><span>03</span><div><h2>Refining schedule</h2><p>The first refinement each day costs 50% less; the 100-attempt ladder resets Monday.</p></div></div>
          <div className={styles.fields}>
            <label>Next weekly attempt<input type="number" min="1" max="100" value={state.refinement.refinementState} onChange={(event) => updateGroup("refinement", "refinementState", Math.min(100, Math.max(1, Number(event.target.value) || 1)))} /></label>
            <label>Already completed today<input type="number" min="0" value={state.refinement.completedToday} onChange={(event) => updateGroup("refinement", "completedToday", Math.max(0, Number(event.target.value) || 0))} /></label>
            <label>Maximum refinements per day<input type="number" min="1" max="100" value={state.refinement.refinementsPerDay} onChange={(event) => updateGroup("refinement", "refinementsPerDay", Math.min(100, Math.max(1, Number(event.target.value) || 1)))} /></label>
            <label>Planning horizon<input type="number" min="1" max="84" value={state.refinement.horizonDays} onChange={(event) => updateGroup("refinement", "horizonDays", Math.min(84, Math.max(1, Number(event.target.value) || 1)))} /></label>
            <label>Start date<input type="date" value={state.refinement.startDate} onChange={(event) => { const value = event.target.value; updateGroup("refinement", "startDate", value); if (value) updateGroup("refinement", "startWeekday", new Date(`${value}T00:00:00Z`).getUTCDay()); }} /></label>
            <label>Target date<input type="date" value={state.refinement.targetDate} onChange={(event) => updateGroup("refinement", "targetDate", event.target.value)} /></label>
            <label>Output model<select value={state.refinement.riskMode} onChange={(event) => updateGroup("refinement", "riskMode", event.target.value)}><option value="guaranteed">Guaranteed minimum</option><option value="conservative">Conservative midpoint</option><option value="expected">Expected value</option></select></label>
          </div>
        </section>
      </div>

      <aside className={styles.results}>
        <div className={styles.resultHead}><DataLabel type="estimated">supplied workbook tier totals</DataLabel><h2>Construction plan</h2></div>
        <div className={styles.metrics}>
          <div><span>True Gold required</span><strong>{fmt(plan.totals.trueGold)}</strong></div>
          <div><span>Tempered TG required</span><strong>{fmt(plan.totals.temperedTrueGold)}</strong></div>
          <div><span>Current TG shortfall</span><strong>{fmt(plan.shortfall.trueGold)}</strong></div>
          <div><span>Current TTG shortfall</span><strong>{fmt(plan.shortfall.temperedTrueGold)}</strong></div>
        </div>
        <section className={styles.next}>
          <span>Do this next</span>
          <h3>{plan.steps[0] ? `${plan.steps[0].building}: ${plan.steps[0].from} → ${plan.steps[0].to}` : "Choose at least one target tier"}</h3>
          <p>{plan.steps[0] ? `Reserve ${fmt(plan.totals.trueGold)} TG for construction. ${plan.refining.earliestDay === 0 ? "Your current TTG already covers the plan." : firstDay ? `Complete ${firstDay.runs} refinement${firstDay.runs === 1 ? "" : "s"} on schedule day ${firstDay.day}.` : "No affordable refinement is currently scheduled."}` : "Targets update the full cost and refining schedule immediately."}</p>
        </section>
        {plan.approximateTownCenter.seconds ? <section className={styles.approx}><DataLabel type="estimated">Town Center only</DataLabel><h3>Approximate secondary costs</h3><p>{fmt(plan.approximateTownCenter.bread)} Bread · {fmt(plan.approximateTownCenter.wood)} Wood · {fmt(plan.approximateTownCenter.stone)} Stone · {fmt(plan.approximateTownCenter.iron)} Iron</p><p>{duration(plan.approximateTownCenter.seconds)} base construction time</p></section> : null}
        <h3 className={styles.subhead}>Ordered construction</h3>
        {plan.warnings.map((warning) => <p className={styles.warning} key={warning}>{warning}</p>)}
        {plan.steps.length ? <ol className={styles.planList}>{plan.steps.map((step, index) => <li key={`${step.buildingId}-${step.to}`}><span>{index + 1}</span><div><strong>{step.building}</strong><small>{step.from} → {step.to}{step.reason === "Town Center prerequisite" ? " · prerequisite" : ""}</small></div><b>{fmt(step.trueGold)} TG · {fmt(step.temperedTrueGold)} TTG</b></li>)}</ol> : <p className={styles.empty}>No building upgrades selected.</p>}
        <h3 className={styles.subhead}>Tempered True Gold schedule</h3>
        <p className={styles.scheduleStatus}>{!plan.steps.length ? "Choose at least one building target to generate a refining schedule." : plan.refining.earliestDay === 0 ? "Your current Tempered True Gold already covers this construction plan." : plan.refining.status === "achievable" ? `Target reached ${plan.refining.earliestDate || `on day ${plan.refining.earliestDay}`}.` : `Target remains short by ${fmt(Math.max(0, plan.totals.temperedTrueGold - plan.refining.finalTempered), 1)} TTG inside this horizon.`}</p>
        <div className={styles.schedule}>{plan.refining.schedule.map((day) => <div key={day.day}><strong>Day {day.day}</strong><span>{day.runs} runs · {fmt(day.trueGoldSpent)} TG</span><span>+{fmt(day.temperedProduced, 2)} TTG · {fmt(day.trueGoldRemaining)} TG left</span></div>)}</div>
        <p className={styles.source}><strong>{CONSTRUCTION_SOURCE.name}</strong><br />{CONSTRUCTION_SOURCE.limitations}</p>
        <div className={styles.actions}><button type="button" onClick={exportCsv}>Export CSV</button><button type="button" onClick={exportJson}>Export JSON</button></div>
      </aside>
    </div>
  </div>;
}

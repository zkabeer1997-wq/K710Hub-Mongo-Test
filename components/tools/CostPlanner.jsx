"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  calculateCosts,
  calculateReach,
  duration,
  exportPlanCsv,
  levelLabel,
  numberValue,
  RESOURCE_LABELS,
} from "../../lib/costPlanner.mjs";
import styles from "./CostPlanner.module.css";
import DataAssumptions from "./DataAssumptions";
import { useToolPersistence } from "../../lib/useToolPersistence";
import { DataLabel, FirstUseGuide, NextAction, PlannerProgress, SaveToRoadmap } from "./PlannerExperience";
const migrateCostState = (value) => value;
const fmt = (n) =>
  Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
function LevelSelect({ item, value, onChange, label, minimum = "0" }) {
  const min = item.levels.findIndex((l) => l.level === minimum);
  return (
    <select
      aria-label={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="0" disabled={minimum !== "0"}>
        Not started
      </option>
      {item.levels.map((l, i) => (
        <option key={l.level} value={l.level} disabled={i < min}>
          {levelLabel(l.level)}
        </option>
      ))}
    </select>
  );
}
export default function CostPlanner({
  dataset,
  toolKey,
  construction = false,
}) {
  const router = useRouter();
  const first = dataset.items[0];
  const [selections, setSelections] = useState([
    {
      id: first.id,
      current: construction ? "1" : "0",
      target: construction ? "2" : first.levels[0].level,
    },
  ]);
  const [currentLevels, setCurrentLevels] = useState({}),
    [inventory, setInventory] = useState({}),
    [modifiers, setModifiers] = useState({}),
    [includePrerequisites, setIncludePrerequisites] = useState(true),
    [targetDate, setTargetDate] = useState(""),
    [mode, setMode] = useState("cost"),
    [result, setResult] = useState(null),
    [error, setError] = useState(""),
    [category, setCategory] = useState(""),
    [candidate, setCandidate] = useState(""),
    [baselineSearch, setBaselineSearch] = useState("");
  const [presets, setPresets] = useState([]),
    [presetName, setPresetName] = useState(""),
    [compareName, setCompareName] = useState(""),
    [comparison, setComparison] = useState(null),
    [manualResolutions, setManualResolutions] = useState({});
  const resources = construction
    ? ["bread", "wood", "stone", "iron", "truegold", "temperedTruegold"]
    : toolKey === "academy"
      ? ["bread", "wood", "stone", "iron", "gold"]
      : toolKey === "war-academy"
        ? ["truegold_dust", "gold", "bread", "wood", "stone", "iron"]
        : [
            "truegold_dust",
            "temperedTruegold",
            "gold",
            "bread",
            "wood",
            "stone",
            "iron",
          ];
  const categories = [...new Set(dataset.items.map((i) => i.category))];
  const filtered = useMemo(
    () => dataset.items.filter((i) => !category || i.category === category),
    [dataset, category],
  );
  const chosen = filtered.find((i) => i.id === candidate);
  const stateKey = `costs-${toolKey}`;
  const restoreInputs = useCallback(
    (state) => {
      const safe = (state.selections || []).filter((s) => {
        const i = dataset.items.find((x) => x.id === s.id);
        return (
          i &&
          (s.current === "0" || i.levels.some((l) => l.level === s.current)) &&
          i.levels.some((l) => l.level === s.target)
        );
      });
      if (safe.length) setSelections(safe);
      setCurrentLevels(state.currentLevels || {});
      setInventory(state.inventory || {});
      setModifiers(state.modifiers || {});
      setIncludePrerequisites(state.includePrerequisites !== false);
      setTargetDate(
        typeof state.targetDate === "string" ? state.targetDate : "",
      );
      setPresets(
        Array.isArray(state.presets) ? state.presets.slice(0, 10) : [],
      );
      setManualResolutions(state.manualResolutions || {});
    },
    [dataset],
  );
  const persistedInputs = useMemo(
    () => ({
      selections,
      currentLevels,
      inventory,
      modifiers,
      includePrerequisites,
      targetDate,
      presets,
      manualResolutions,
    }),
    [
      selections,
      currentLevels,
      inventory,
      modifiers,
      includePrerequisites,
      targetDate,
      presets,
      manualResolutions,
    ],
  );
  const persistence = useToolPersistence({
    toolKey: stateKey,
    schemaVersion: 1,
    inputs: persistedInputs,
    restore: restoreInputs,
    migrate: migrateCostState,
    autoDetect: true,
  });
  const loading = persistence.status === "loading";
  const saveStatus = persistence.message;
  function changed() {
    setResult(null);
    setError("");
  }
  function updateSelection(id, key, value) {
    changed();
    if (key === "current") setCurrentLevels((c) => ({ ...c, [id]: value }));
    setSelections((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        const item = dataset.items.find((i) => i.id === id),
          next = { ...s, [key]: value };
        if (key === "current") {
          if (
            item.levels.findIndex((l) => l.level === next.target) <
            item.levels.findIndex((l) => l.level === value)
          )
            next.target = value;
        }
        return next;
      }),
    );
  }
  function add() {
    if (!chosen) return;
    changed();
    const current = currentLevels[chosen.id] || "0",
      i = chosen.levels.findIndex((l) => l.level === current),
      next = chosen.levels[Math.min(i + 1, chosen.levels.length - 1)].level;
    setSelections((prev) =>
      prev.some((s) => s.id === chosen.id)
        ? prev
        : [...prev, { id: chosen.id, current, target: next }],
    );
    setCandidate("");
  }
  function modifier(key, value) {
    changed();
    setModifiers((m) => ({ ...m, [key]: value }));
  }
  function moveSelection(index, direction) {
    changed();
    setSelections((previous) => {
      const target = index + direction;
      if (target < 0 || target >= previous.length) return previous;
      const next = [...previous];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }
  function calculate() {
    setError("");
    try {
      const options = {
        selections,
        currentLevels,
        inventory,
        modifiers,
        includePrerequisites,
        kind: construction ? "construction" : "research",
      };
      setResult(
        mode === "reach"
          ? calculateReach(dataset, options)
          : calculateCosts(dataset, options),
      );
      const preset = presets.find((item) => item.name === compareName);
      setComparison(
        preset
          ? calculateCosts(dataset, {
              ...preset.inputs,
              kind: construction ? "construction" : "research",
            })
          : null,
      );
    } catch (e) {
      setError(e.message);
    }
  }
  function savePreset() {
    const name = presetName.trim();
    if (!name) return;
    const snapshot = {
      selections,
      currentLevels,
      inventory,
      modifiers,
      includePrerequisites,
    };
    setPresets((current) =>
      [
        { name, inputs: snapshot },
        ...current.filter((item) => item.name !== name),
      ].slice(0, 10),
    );
    setPresetName("");
    changed();
  }
  function transferRefining() {
    if (!result) return;
    const params = new URLSearchParams({
      truegold: String(result.totals.truegold || 0),
      temperedTruegold: String(result.totals.temperedTruegold || 0),
    });
    router.push(`/tools/construction-costs/refining?${params}`);
  }
  function download() {
    const url = URL.createObjectURL(
      new Blob([exportPlanCsv(result)], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${toolKey}-upgrade-plan.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <div className={styles.planner}>
      <PlannerProgress current={result ? 5 : 3} />
      <FirstUseGuide
        toolKey={stateKey}
        title={`Plan a ${construction ? "building" : "research"} upgrade`}
        steps={[`Choose the current and target ${construction ? "building" : "research"} levels.`, "Enter only resources you are willing to spend and add your active bonuses.", "Calculate, review prerequisites and shortages, then save the result to your account roadmap."]}
        terms={construction ? [["True Gold", "Advanced construction resource."], ["Tempered True Gold", "Refined construction resource; refinement itself does not score in KvK Prep."], ["Prerequisite", "Another building level required before the selected target."]] : [["True Gold Dust", "Advanced research material, separate from construction True Gold."], ["Prerequisite", "Another research node required before the target."], ["Research speed", "The total bonus shown in your account's research overview."]]}
        onDemo={() => { const item = dataset.items[0]; const target = item.levels[Math.min(1, item.levels.length - 1)].level; setSelections([{ id: item.id, current: construction ? "1" : "0", target }]); setInventory(Object.fromEntries(resources.map((key) => [key, 100000]))); setResult(null); }}
      />
      <SaveToRoadmap persistence={persistence} />
      <div className={styles.topline}>
        <div>
          <span className="k-mark">
            {construction ? "Building upgrades" : "Research upgrades"}
          </span>
          <strong>
            {dataset.items.length}{" "}
            {construction ? "buildings" : "research entries"} ·{" "}
            {dataset.items.reduce((n, i) => n + i.levels.length, 0)} level
            records
          </strong>
        </div>
        <span role="status">
          {loading ? "Loading saved plan…" : saveStatus}
        </span>
      </div>
      <div className={styles.layout}>
        <fieldset className={styles.inputs} disabled={loading}>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <div>
                <span className={styles.eyebrow}>01 · Upgrade plan</span>
                <h2>What are you upgrading?</h2>
              </div>
              <div className={styles.mode} aria-label="Calculation mode">
                <button
                  type="button"
                  aria-pressed={mode === "cost"}
                  onClick={() => {
                    changed();
                    setMode("cost");
                  }}
                >
                  Calculate cost
                </button>
                <button
                  type="button"
                  aria-pressed={mode === "reach"}
                  onClick={() => {
                    changed();
                    setMode("reach");
                  }}
                >
                  What can I afford?
                </button>
              </div>
            </div>
            <div className={styles.finder}>
              <label>
                Category
                <select
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setCandidate("");
                  }}
                >
                  <option value="">All categories</option>
                  {categories.map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                Find {construction ? "a building" : "research"}
                <select
                  value={chosen?.id || ""}
                  onChange={(e) => setCandidate(e.target.value)}
                >
                  <option value="">
                    {construction ? "Select a building" : "Select research"}
                  </option>
                  {categories
                    .filter((c) => !category || c === category)
                    .map((c) => (
                      <optgroup key={c} label={c}>
                        {filtered
                          .filter((i) => i.category === c)
                          .map((i) => (
                            <option key={i.id} value={i.id}>
                              {i.name}
                              {selections.some((s) => s.id === i.id)
                                ? " — Added"
                                : ""}
                            </option>
                          ))}
                      </optgroup>
                    ))}
                </select>
              </label>
              <button
                type="button"
                className={styles.quiet}
                onClick={add}
                disabled={!chosen || selections.some((s) => s.id === chosen.id)}
              >
                Add upgrade
              </button>
            </div>
            <div className={styles.selections}>
              {selections.map((s, index) => {
                const item = dataset.items.find((i) => i.id === s.id);
                return (
                  <div className={styles.selection} key={s.id}>
                    <div>
                      <strong>{item.name}</strong>
                      <small>
                        {item.category}
                        {item.levels[0]?.effect?.type
                          ? ` · ${item.levels[0].effect.type}`
                          : ""}
                      </small>
                      <span>
                        <button
                          type="button"
                          className={styles.remove}
                          disabled={index === 0}
                          onClick={() => moveSelection(index, -1)}
                          aria-label={`Move ${item.name} earlier`}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          className={styles.remove}
                          disabled={index === selections.length - 1}
                          onClick={() => moveSelection(index, 1)}
                          aria-label={`Move ${item.name} later`}
                        >
                          ↓
                        </button>
                      </span>
                    </div>
                    <label>
                      Current
                      <LevelSelect
                        item={item}
                        value={s.current}
                        label={`${item.name} (${item.category}) current level`}
                        onChange={(v) => updateSelection(s.id, "current", v)}
                      />
                    </label>
                    <span className={styles.arrow}>→</span>
                    <label>
                      {mode === "reach" ? "Maximum target" : "Target"}
                      <LevelSelect
                        item={item}
                        value={s.target}
                        minimum={s.current}
                        label={`${item.name} (${item.category}) target level`}
                        onChange={(v) => updateSelection(s.id, "target", v)}
                      />
                    </label>
                    <button
                      type="button"
                      className={styles.remove}
                      aria-label={`Remove ${item.name} (${item.category})`}
                      onClick={() => {
                        changed();
                        setSelections((prev) =>
                          prev.filter((x) => x.id !== s.id),
                        );
                      }}
                    >
                      Remove
                    </button>
                  </div>
                );
              })}
            </div>
            {!selections.length && <p>Add an upgrade to begin.</p>}
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={includePrerequisites}
                onChange={(e) => {
                  changed();
                  setIncludePrerequisites(e.target.checked);
                }}
              />
              Include prerequisite {construction ? "buildings" : "research"}
            </label>
            <p className={styles.hint}>
              Set completed levels below so prerequisites you already own are
              not counted. Unset items are treated as not started.
            </p>
            <details className={styles.details}>
              <summary>
                Completed {construction ? "building" : "research"} levels
              </summary>
              <label>
                Find a completed item
                <input
                  type="search"
                  value={baselineSearch}
                  onChange={(e) => setBaselineSearch(e.target.value)}
                  placeholder="Search by name"
                />
              </label>
              <div className={styles.baseline}>
                {dataset.items
                  .filter((i) =>
                    `${i.name} ${i.category}`
                      .toLowerCase()
                      .includes(baselineSearch.toLowerCase()),
                  )
                  .map((i) => (
                    <label key={i.id}>
                      <span>
                        {i.name}
                        <small>{i.category}</small>
                      </span>
                      <LevelSelect
                        item={i}
                        value={
                          selections.find((s) => s.id === i.id)?.current ||
                          currentLevels[i.id] ||
                          "0"
                        }
                        label={`Completed ${i.name} (${i.category}) level`}
                        onChange={(v) => {
                          changed();
                          setCurrentLevels((c) => ({ ...c, [i.id]: v }));
                          if (selections.some((s) => s.id === i.id))
                            updateSelection(i.id, "current", v);
                        }}
                      />
                    </label>
                  ))}
              </div>
            </details>
          </section>
          <div className={styles.settings}>
            <section className={styles.panel}>
              <span className={styles.eyebrow}>02 · Inventory</span>
              <h2>Resources you already have</h2>
              <p className={styles.hint}>
                {mode === "reach"
                  ? "Enter inventory to find the highest affordable level. Use one upgrade target in this mode."
                  : "Optional. These amounts are subtracted from the resources required."}
              </p>
              <div className={styles.fields}>
                {resources.map((k) => (
                  <label key={k}>
                    {RESOURCE_LABELS[k]}
                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={inventory[k] ?? ""}
                      placeholder="0"
                      onChange={(e) => {
                        changed();
                        setInventory((v) => ({ ...v, [k]: e.target.value }));
                      }}
                    />
                  </label>
                ))}
              </div>
            </section>
            <section className={styles.panel}>
              <span className={styles.eyebrow}>03 · Time &amp; bonuses</span>
              <h2>{construction ? "Construction" : "Research"} speed</h2>
              <label>
                Target completion date
                <input
                  type="date"
                  value={targetDate}
                  onChange={(e) => {
                    changed();
                    setTargetDate(e.target.value);
                  }}
                />
              </label>
              <label>
                Total {construction ? "construction" : "research"} speed (%)
                <input
                  type="number"
                  min="0"
                  value={modifiers.speed ?? ""}
                  placeholder="0"
                  onChange={(e) => modifier("speed", e.target.value)}
                />
              </label>
              <p className={styles.hint}>
                Use the total shown in your Power bonus overview. Do not add an
                active bonus twice. Time is divided by 1 + speed ÷ 100; alliance
                helps are excluded.
              </p>
              {construction && (
                <>
                  <div className={styles.fields}>
                    <label>
                      Additional Gray Wolf bonus (%)
                      <input
                        type="number"
                        min="0"
                        value={modifiers.wolf ?? ""}
                        placeholder="0"
                        onChange={(e) => modifier("wolf", e.target.value)}
                      />
                    </label>
                    <label>
                      Saul skill level
                      <select
                        value={modifiers.saul || 0}
                        onChange={(e) => modifier("saul", e.target.value)}
                      >
                        {[0, 1, 2, 3, 4, 5].map((n) => (
                          <option key={n} value={n}>
                            {n === 0
                              ? "None"
                              : `Level ${n} · ${n * 3}% RSS reduction`}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <p className={styles.hint}>
                    Saul reduces Bread, Wood, Stone and Iron costs. True Gold
                    and Tempered True Gold costs stay the same.
                  </p>
                  <strong className={styles.buffHeading}>
                    Planning bonuses not already active
                  </strong>
                  {[
                    ["minister", "Chief Minister (+10%)"],
                    ["highKing", "High King: Chief Minister becomes +15%"],
                    ["groundworks", "Groundworks (+10%)"],
                    ["kvk", "KvK bonus (+5%)"],
                    ["doubleTime", "Double Time (20% time reduction)"],
                  ].map(([key, label]) => (
                    <label className={styles.check} key={key}>
                      <input
                        type="checkbox"
                        checked={!!modifiers[key]}
                        onChange={(e) => modifier(key, e.target.checked)}
                      />
                      {label}
                    </label>
                  ))}
                </>
              )}
            </section>
          </div>
          <section className={styles.panel}>
            <span className={styles.eyebrow}>04 · Saved plans</span>
            <h2>Presets &amp; comparison</h2>
            <div className={styles.fields}>
              <label>
                Preset name
                <input
                  value={presetName}
                  onChange={(event) => setPresetName(event.target.value)}
                  placeholder="e.g. KvK week"
                />
              </label>
              <button
                type="button"
                className={styles.quiet}
                disabled={!presetName.trim()}
                onClick={savePreset}
              >
                Save current preset
              </button>
              <label>
                Compare results with
                <select
                  value={compareName}
                  onChange={(event) => {
                    setCompareName(event.target.value);
                    setComparison(null);
                  }}
                >
                  <option value="">No comparison</option>
                  {presets.map((preset) => (
                    <option key={preset.name} value={preset.name}>
                      {preset.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </section>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.primary}
              disabled={!selections.length}
              onClick={calculate}
            >
              {mode === "reach"
                ? "Find affordable level"
                : "Calculate upgrade plan"}
            </button>
            <span role="status" className={styles.hint}>
              {saveStatus}
            </span>
          </div>
        </fieldset>
        <aside className={styles.resultColumn}>
          <div className={styles.resultTitle}>
            <span className="k-mark">Calculated result</span>
            <h2>Upgrade plan</h2>
          </div>
          {error && (
            <p role="alert" className={styles.warning}>
              {error}
            </p>
          )}
          {result ? (
            <section
              className={styles.results}
              aria-label="Calculation results"
              aria-live="polite"
            >
              <NextAction
                title={result.steps[0] ? `${result.steps[0].name} → ${levelLabel(result.steps[0].level)}` : "No upgrade step required"}
                reason={result.steps[0]?.prerequisite ? "Complete this prerequisite first so the selected target becomes available." : "This is the first direct step in your selected upgrade path."}
                before={result.steps[0] ? "Current saved level" : "Current setup"}
                after={result.steps[0] ? levelLabel(result.steps[0].level) : "Target already reached"}
                resources={result.steps[0] ? resources.filter((key) => result.steps[0].costs[key]).map((key) => `${fmt(result.steps[0].costs[key])} ${RESOURCE_LABELS[key]}`).join(" · ") : "None"}
                remaining={resources.map((key) => `${fmt(Math.max(0, numberValue(inventory[key]) - (result.steps[0]?.costs[key] || 0)))} ${RESOURCE_LABELS[key]}`).join(" · ")}
              />
              <DataLabel type="exact">dataset costs</DataLabel><DataLabel type="input">inventory and bonuses</DataLabel>
              <div className={styles.sectionHead}>
                <div>
                  <span className={styles.eyebrow}>Your results</span>
                  <h2>
                    {result.reachedLevel
                      ? `Affordable through ${levelLabel(result.reachedLevel)}`
                      : "Upgrade requirements"}
                  </h2>
                </div>
                <button
                  type="button"
                  className={styles.quiet}
                  onClick={download}
                >
                  Download CSV
                </button>
                {construction && (
                  <button
                    type="button"
                    className={styles.quiet}
                    onClick={transferRefining}
                  >
                    Send TG / TTG to refining
                  </button>
                )}
              </div>
              {result.steps.filter((s) => s.prerequisite).length > 0 && (
                <p className={styles.prereqNotice}>
                  Includes {result.steps.filter((s) => s.prerequisite).length}{" "}
                  prerequisite upgrade step
                  {result.steps.filter((s) => s.prerequisite).length === 1
                    ? ""
                    : "s"}{" "}
                  because those prerequisite{" "}
                  {construction ? "buildings" : "research entries"} are not
                  marked as completed above. Fill in &quot;Completed{" "}
                  {construction ? "building" : "research"} levels&quot; if you
                  already own some of these.
                </p>
              )}
              <div className={styles.metrics}>
                <div>
                  <span>Upgrade steps</span>
                  <strong>{result.steps.length}</strong>
                  <small>
                    {result.steps.filter((s) => s.prerequisite).length}{" "}
                    prerequisite steps
                  </small>
                </div>
                <div>
                  <span>Adjusted time</span>
                  <strong>{duration(result.seconds)}</strong>
                  <small>Base time: {duration(result.baseSeconds)}</small>
                </div>
                <div>
                  <span>Power gained</span>
                  <strong>{fmt(result.power)}</strong>
                  <small>
                    {construction
                      ? "Where reported by the source"
                      : "Research power increases"}
                  </small>
                </div>
              </div>
              <p className={styles.prereqNotice}>
                Estimated completion:{" "}
                {new Date(Date.now() + result.seconds * 1000).toLocaleString()}.
                {targetDate
                  ? ` Required speedups to finish by ${targetDate}: ${duration(Math.max(0, result.seconds - (new Date(`${targetDate}T23:59:59`).getTime() - Date.now()) / 1000))}.`
                  : ""}
              </p>
              {comparison && (
                <div className={styles.prereqNotice}>
                  <b>Compared with “{compareName}”:</b>{" "}
                  {result.seconds >= comparison.seconds ? "+" : "−"}
                  {duration(Math.abs(result.seconds - comparison.seconds))} time
                  ·{" "}
                  {resources
                    .map(
                      (key) =>
                        `${RESOURCE_LABELS[key]} ${fmt(result.totals[key] - comparison.totals[key])}`,
                    )
                    .join(" · ")}
                </div>
              )}
              <section className={styles.details}>
                <h3>Dependency path</h3>
                <div className={styles.dependencyTree}>
                  {result.steps.map((step, index) => (
                    <span key={step.key}>
                      {index > 0 && <i aria-hidden="true">→</i>}
                      <b>{step.name}</b>
                      <small>
                        {levelLabel(step.level)} ·{" "}
                        {step.prerequisite ? "Prerequisite" : "Direct target"}
                      </small>
                    </span>
                  ))}
                </div>
              </section>
              <div className={styles.tableWrap}>
                <table>
                  <caption>Resources needed for the full plan</caption>
                  <thead>
                    <tr>
                      <th>Resource</th>
                      <th>Required</th>
                      <th>Owned</th>
                      <th>Still needed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {resources.map((k) => (
                      <tr key={k}>
                        <th>{RESOURCE_LABELS[k]}</th>
                        <td>{fmt(result.totals[k])}</td>
                        <td>{fmt(numberValue(inventory[k]))}</td>
                        <td
                          className={
                            result.shortfall[k]
                              ? styles.shortfall
                              : styles.covered
                          }
                        >
                          {fmt(result.shortfall[k])}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {result.buildingRequirements.length > 0 && (
                <p className={styles.warning}>
                  Building requirements:{" "}
                  {result.buildingRequirements.join(", ")}. Building upgrade
                  costs are not included in research totals.
                </p>
              )}
              {result.unverified && (
                <p className={styles.warning}>
                  This plan includes levels the reference dataset has not marked
                  as verified. Check these costs in-game before spending.
                </p>
              )}
              {!!result.warnings.length && (
                <details className={styles.warning} open>
                  <summary>
                    Prerequisites to check ({result.warnings.length})
                  </summary>
                  <ul>
                    {result.warnings.map((w) => (
                      <li key={w}>
                        {w}
                        <label>
                          Manual resolution note{" "}
                          <input
                            value={manualResolutions[w] || ""}
                            onChange={(event) => {
                              changed();
                              setManualResolutions((current) => ({
                                ...current,
                                [w]: event.target.value,
                              }));
                            }}
                            placeholder="Enter verified prerequisite level or resolution"
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <details className={styles.details}>
                <summary>
                  Level-by-level breakdown ({result.steps.length} steps)
                </summary>
                <div className={styles.tableWrap}>
                  <table>
                    <thead>
                      <tr>
                        <th>Upgrade</th>
                        {resources.map((k) => (
                          <th key={k}>{RESOURCE_LABELS[k]}</th>
                        ))}
                        <th>Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.steps.map((s) => (
                        <tr key={s.key}>
                          <th>
                            {s.name}
                            <small>
                              {s.category} · {levelLabel(s.level)}
                              {s.prerequisite ? " · Prerequisite" : ""}
                            </small>
                          </th>
                          {resources.map((k) => (
                            <td key={k}>{fmt(s.costs[k])}</td>
                          ))}
                          <td>{duration(s.adjustedSeconds)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            </section>
          ) : (
            <div className={styles.empty}>
              <h2>Your upgrade plan appears here</h2>
              <p>
                Choose current and target levels, then calculate to see
                materials and time.
              </p>
            </div>
          )}
        </aside>
      </div>
      <footer className={styles.source}>
        Level costs:{" "}
        <a href={dataset.source} target="_blank" rel="noreferrer">
          Kingshot Optimizer reference data
        </a>{" "}
        · Retrieved {dataset.retrievedAt}. Your kingdom must have unlocked the
        selected tiers.
      </footer>
      <DataAssumptions
        datasetId={
          construction
            ? "construction-costs"
            : toolKey === "academy"
              ? "academy-research"
              : toolKey === "war-academy"
                ? "war-academy-research"
                : "advanced-research"
        }
        toolVersion="1.0.0"
      />
    </div>
  );
}

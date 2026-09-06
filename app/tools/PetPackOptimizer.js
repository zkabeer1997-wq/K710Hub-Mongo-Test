"use client";
import { useCallback, useMemo, useRef, useState } from "react";
import {
  createPetPackOptimizer,
  PET_RESOURCES as DEFAULT_RESOURCES,
} from "../../lib/petPackOptimizer.mjs";
import { migratePetPackState } from "../../lib/toolState.mjs";
import { useToolPersistence } from "../../lib/useToolPersistence";
import { SaveToRoadmap, SourceToolOnboarding } from "../../components/tools/PlannerExperience";
import DataAssumptions from "../../components/tools/DataAssumptions";

const EMPTY = { food: 0, manual: 0, potion: 0, medal: 0 };
const DEFAULT_NEED = { food: 150000, manual: 500, potion: 160, medal: 80 };
const money = (value) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(
    value,
  );
const number = (value) => Math.round(value).toLocaleString();
const resourceNames = {
  food: "Pet Food",
  manual: "Growth Manuals",
  potion: "Nutrient Potions",
  medal: "Promotion Medallions",
};

function NumberField({ label, value, onChange, accent }) {
  return (
    <label className="ppo-field">
      <span>
        <i style={{ background: accent }} />
        {label}
      </span>
      <input
        type="number"
        min="0"
        step="1"
        inputMode="numeric"
        value={value}
        onChange={(event) =>
          onChange(Math.max(0, Number(event.target.value) || 0))
        }
      />
    </label>
  );
}

export default function PetPackOptimizer({ configuration }) {
  const PET_RESOURCES = configuration?.resources || DEFAULT_RESOURCES;
  const optimizePetPacks = createPetPackOptimizer(configuration);
  const [need, setNeed] = useState(DEFAULT_NEED);
  const [have, setHave] = useState(EMPTY);
  const [ownedChests, setOwnedChests] = useState(0);
  const [maxWeeks, setMaxWeeks] = useState(8);
  const [budgetCap, setBudgetCap] = useState(0);
  const [maxWeeklySpend, setMaxWeeklySpend] = useState(0);
  const [deadline, setDeadline] = useState("");
  const [result, setResult] = useState(null);
  const [calculating, setCalculating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [resetBackup, setResetBackup] = useState(null);
  const workerRef = useRef(null);
  const inputs = useMemo(
    () => ({
      need,
      have,
      ownedChests,
      maxWeeks,
      budgetCap,
      maxWeeklySpend,
      deadline,
    }),
    [need, have, ownedChests, maxWeeks, budgetCap, maxWeeklySpend, deadline],
  );
  const restore = useCallback((saved) => {
    if (saved.need && typeof saved.need === "object")
      setNeed((previous) => ({ ...previous, ...saved.need }));
    if (saved.have && typeof saved.have === "object")
      setHave((previous) => ({ ...previous, ...saved.have }));
    if (Number.isFinite(saved.ownedChests))
      setOwnedChests(Math.max(0, saved.ownedChests));
    if (Number.isFinite(saved.maxWeeks))
      setMaxWeeks(Math.min(26, Math.max(1, saved.maxWeeks)));
    if (Number.isFinite(saved.budgetCap))
      setBudgetCap(Math.max(0, saved.budgetCap));
    if (Number.isFinite(saved.maxWeeklySpend))
      setMaxWeeklySpend(Math.max(0, saved.maxWeeklySpend));
    if (typeof saved.deadline === "string") setDeadline(saved.deadline);
  }, []);
  const persistence = useToolPersistence({
    toolKey: "pet-pack-optimizer",
    schemaVersion: 1,
    inputs,
    restore,
    migrate: migratePetPackState,
  });
  const shortfall = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(PET_RESOURCES).map((key) => [
          key,
          Math.max(0, need[key] - have[key]),
        ]),
      ),
    [need, have, PET_RESOURCES],
  );
  const update = (setter, key, value) => {
    persistence.markChanged();
    setter((previous) => ({ ...previous, [key]: value }));
    setResult(null);
  };
  const reset = () => {
    if (
      !window.confirm(
        "Reset all Pet Pack inputs? You can undo this until you leave the page.",
      )
    )
      return;
    setResetBackup(inputs);
    persistence.markChanged();
    setNeed(DEFAULT_NEED);
    setHave(EMPTY);
    setOwnedChests(0);
    setMaxWeeks(8);
    setBudgetCap(0);
    setMaxWeeklySpend(0);
    setDeadline("");
    setResult(null);
  };
  const undoReset = () => {
    if (!resetBackup) return;
    persistence.markChanged();
    restore(resetBackup);
    setResetBackup(null);
    setResult(null);
  };
  const effectiveWeeks = useMemo(() => {
    if (!deadline) return maxWeeks;
    const days = Math.ceil(
      (new Date(`${deadline}T23:59:59`).getTime() - Date.now()) / 86400000,
    );
    return Math.max(1, Math.min(maxWeeks, Math.ceil(Math.max(0, days) / 7)));
  }, [deadline, maxWeeks]);
  const calculate = () => {
    workerRef.current?.terminate();
    setCalculating(true);
    setProgress(5);
    if (typeof Worker === "undefined") {
      setResult(
        optimizePetPacks({
          need,
          have,
          ownedChests,
          maxWeeks: effectiveWeeks,
          budgetCap,
          maxWeeklySpend,
        }),
      );
      setProgress(100);
      setCalculating(false);
      return;
    }
    const worker = new Worker(
      new URL("./petOptimizer.worker.js", import.meta.url),
      { type: "module" },
    );
    workerRef.current = worker;
    worker.onmessage = ({ data }) => {
      if (data.type === "progress") setProgress(data.progress);
      if (data.type === "result") {
        setResult(data.result);
        setProgress(100);
        setCalculating(false);
        worker.terminate();
        workerRef.current = null;
      }
      if (data.type === "error") {
        setResult({ error: data.error });
        setCalculating(false);
        worker.terminate();
        workerRef.current = null;
      }
    };
    worker.onerror = () => {
      setResult({ error: "Optimization worker failed." });
      setCalculating(false);
      worker.terminate();
      workerRef.current = null;
    };
    worker.postMessage({
      configuration,
      inputs: {
        need,
        have,
        ownedChests,
        maxWeeks: effectiveWeeks,
        budgetCap,
        maxWeeklySpend,
      },
    });
  };
  const cancel = () => {
    workerRef.current?.terminate();
    workerRef.current = null;
    setCalculating(false);
    setProgress(0);
  };
  const exportCsv = () => {
    if (!result?.schedule) return;
    const rows = [["Week", "Category", "Tier", "Resource", "Amount", "Price"]];
    result.schedule.forEach((week) => {
      week.custom.forEach((pack) =>
        rows.push([
          week.week,
          "Custom",
          pack.tier,
          `${pack.foodSlots} food picks / ${pack.chestSlots} chest picks`,
          "",
          pack.price,
        ]),
      );
      week.singles.forEach((pack) =>
        rows.push([
          week.week,
          "Single",
          pack.tier,
          resourceNames[pack.resource],
          pack.amount,
          pack.price,
        ]),
      );
    });
    const blob = new Blob(
      [
        rows
          .map((row) =>
            row
              .map((cell) => `"${String(cell).replaceAll('"', '""')}"`)
              .join(","),
          )
          .join("\n"),
      ],
      { type: "text/csv" },
    );
    const url = URL.createObjectURL(blob),
      anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "pet-pack-plan.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  const copyDiscord = async () => {
    if (!result?.schedule) return;
    const lines = [
      `**Pet Pack Plan — ${money(result.cost)} / ${result.weeks} week${result.weeks === 1 ? "" : "s"}**`,
      ...result.schedule.map(
        (week) =>
          `Week ${week.week}: ${[...week.custom.map((p) => `${p.tier} custom (${p.foodSlots}F/${p.chestSlots}C)`), ...week.singles.map((p) => `${p.tier} ${resourceNames[p.resource]}`)].join(", ") || "No purchase"}`,
      ),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
  };
  const weeklyAverage = result?.weeks ? result.cost / result.weeks : 0;
  const hasPlan = result?.cost > 0 && !result.covered && !result.infeasible;

  return (
    <section className="ppo-shell">
      <SourceToolOnboarding toolKey="pet-pack-optimizer" current={result ? 4 : 3} />
      <SaveToRoadmap persistence={persistence} />
      <div className="ppo-inputs">
        <div className="ppo-panel-head">
          <div>
            <h2>Set your target</h2>
            <p>Enter the materials required and what is already in your bag.</p>
            <small
              className={`ppo-save ppo-save-${persistence.status}`}
              role="status"
            >
              {persistence.message}
            </small>
          </div>
          <span>Weekly limit enabled</span>
        </div>
        <div className="ppo-columns">
          <div>
            <h3>Materials required</h3>
            {Object.keys(resourceNames).map((key, i) => (
              <NumberField
                key={key}
                label={resourceNames[key]}
                value={need[key]}
                accent={["#86a873", "#ef8348", "#65a9d8", "#d9a94e"][i]}
                onChange={(value) => update(setNeed, key, value)}
              />
            ))}
          </div>
          <div>
            <h3>Current inventory</h3>
            {Object.keys(resourceNames).map((key, i) => (
              <NumberField
                key={key}
                label={resourceNames[key]}
                value={have[key]}
                accent={["#86a873", "#ef8348", "#65a9d8", "#d9a94e"][i]}
                onChange={(value) => update(setHave, key, value)}
              />
            ))}
          </div>
        </div>
        <div className="ppo-settings">
          <NumberField
            label="Advanced Custom Chests owned"
            value={ownedChests}
            accent="#f0c669"
            onChange={(value) => {
              persistence.markChanged();
              setOwnedChests(value);
              setResult(null);
            }}
          />
          <NumberField
            label="Maximum weeks to plan"
            value={maxWeeks}
            accent="#f0c669"
            onChange={(value) => {
              persistence.markChanged();
              setMaxWeeks(Math.min(26, Math.max(1, value)));
              setResult(null);
            }}
          />
          <NumberField
            label="Total budget cap ($, 0 = none)"
            value={budgetCap}
            accent="#f0c669"
            onChange={(value) => {
              persistence.markChanged();
              setBudgetCap(value);
              setResult(null);
            }}
          />
          <NumberField
            label="Maximum weekly spend ($, 0 = none)"
            value={maxWeeklySpend}
            accent="#f0c669"
            onChange={(value) => {
              persistence.markChanged();
              setMaxWeeklySpend(value);
              setResult(null);
            }}
          />
          <label className="ppo-field">
            <span>
              <i style={{ background: "#f0c669" }} />
              Completion deadline
            </span>
            <input
              type="date"
              value={deadline}
              onChange={(event) => {
                persistence.markChanged();
                setDeadline(event.target.value);
                setResult(null);
              }}
            />
          </label>
        </div>
        {deadline && (
          <p className="ppo-deadline">
            Deadline mode allows up to {effectiveWeeks} week
            {effectiveWeeks === 1 ? "" : "s"} within the selected planning
            limit.
          </p>
        )}
        <div className="ppo-shortfall">
          <strong>Remaining shortfall</strong>
          {Object.entries(shortfall).map(([key, value]) => (
            <span key={key}>
              {resourceNames[key]} <b>{number(value)}</b>
            </span>
          ))}
        </div>
        <button
          className="ppo-calculate"
          type="button"
          onClick={calculate}
          disabled={calculating}
        >
          {calculating
            ? "Optimizing weekly sets…"
            : "Build cheapest weekly plan"}
        </button>
        {calculating && (
          <div className="ppo-progress" role="status">
            <progress max="100" value={progress} />
            <span>Searching in the background…</span>
            <button type="button" onClick={cancel}>
              Cancel
            </button>
          </div>
        )}
        <div className="ppo-state-actions">
          <button type="button" onClick={reset}>
            Reset inputs
          </button>
          {resetBackup && (
            <button type="button" onClick={undoReset}>
              Undo reset
            </button>
          )}
        </div>
        <p className="ppo-rule">
          Each Common, Uncommon, Rare, Epic, and Legendary pack may be purchased
          once per week. The plan can repeat those purchases in later weeks.
          {calculating
            ? " Larger targets can take a few seconds to solve."
            : ""}
        </p>
        <DataAssumptions datasetId="pet-pack-contents" toolVersion="1.0.0" />
      </div>

      <div className="ppo-results" aria-live="polite">
        {!result && (
          <div className="ppo-empty">
            <span>◇</span>
            <h2>Your purchase plan appears here</h2>
            <p>
              The optimizer compares custom chests, single-resource packs, owned
              inventory, and every allowed weekly repeat.
            </p>
          </div>
        )}
        {result && result.covered && (
          <div className="ppo-empty ppo-covered">
            <span>✓</span>
            <h2>You already have everything</h2>
            <p>No packs are required for this target.</p>
          </div>
        )}
        {result && result.infeasible && (
          <div className="ppo-empty ppo-infeasible">
            <span>⚠</span>
            <h2>No feasible plan found</h2>
            <p>
              The selected target cannot be completed within {maxWeeks} week
              {maxWeeks === 1 ? "" : "s"}. Try raising the maximum weeks to plan
              or lowering your targets.
            </p>
          </div>
        )}
        {result && result.timedOut && !result.cost && (
          <div className="ppo-empty ppo-infeasible">
            <span>⚠</span>
            <h2>Optimization took too long</h2>
            <p>
              No complete plan was found before the time limit. Try lowering the
              targets, reducing the maximum weeks, or entering more current
              inventory.
            </p>
          </div>
        )}
        {result?.error && (
          <div className="ppo-empty ppo-infeasible">
            <span>⚠</span>
            <h2>Could not calculate this plan</h2>
            <p>{result.error}</p>
          </div>
        )}
        {hasPlan && (
          <>
            <div className="ppo-result-head">
              <div>
                <span>
                  {result.optimal
                    ? "Proven lowest-cost plan"
                    : "Best plan found before time limit"}
                </span>
                <strong>{money(result.cost)}</strong>
              </div>
              <dl>
                <div>
                  <dt>Timeline</dt>
                  <dd>
                    {result.weeks} week{result.weeks === 1 ? "" : "s"}
                  </dd>
                </div>
                <div>
                  <dt>Avg. / week</dt>
                  <dd>{money(weeklyAverage)}</dd>
                </div>
                <div>
                  <dt>Chests bought</dt>
                  <dd>{number(result.boughtChests)}</dd>
                </div>
              </dl>
            </div>
            <div className="ppo-redemption">
              <div>
                <h3>Advanced Chest redemption</h3>
                <p>
                  {number(ownedChests)} owned + {number(result.boughtChests)}{" "}
                  bought
                </p>
              </div>
              {["manual", "potion", "medal"].map((key) => (
                <span key={key}>
                  <b>{number(result.resourcePlan.allocations[key])}</b> →{" "}
                  {resourceNames[key]}
                </span>
              ))}
            </div>
            <div className="ppo-week-list">
              {result.schedule.map((week) => (
                <article key={week.week}>
                  <header>
                    <span>Week {week.week}</span>
                    <strong>
                      {money(
                        [...week.custom, ...week.singles].reduce(
                          (sum, item) => sum + item.price,
                          0,
                        ),
                      )}
                    </strong>
                  </header>
                  {week.custom.length > 0 && (
                    <div className="ppo-pack-group">
                      <h4>Custom Pet Chests</h4>
                      {week.custom.map((pack, index) => (
                        <div className="ppo-pack" key={`${pack.tier}-${index}`}>
                          <b>{pack.tier}</b>
                          <span>
                            {pack.foodSlots} Food pick
                            {pack.foodSlots === 1 ? "" : "s"} ·{" "}
                            {pack.chestSlots} Chest pick
                            {pack.chestSlots === 1 ? "" : "s"}
                          </span>
                          <em>{money(pack.price)}</em>
                        </div>
                      ))}
                    </div>
                  )}
                  {week.singles.length > 0 && (
                    <div className="ppo-pack-group">
                      <h4>Single-resource packs</h4>
                      {week.singles.map((pack, index) => (
                        <div
                          className="ppo-pack"
                          key={`${pack.resource}-${pack.tier}-${index}`}
                        >
                          <b>{pack.tier}</b>
                          <span>
                            {resourceNames[pack.resource]} · +
                            {number(pack.amount)}
                          </span>
                          <em>{money(pack.price)}</em>
                        </div>
                      ))}
                    </div>
                  )}
                </article>
              ))}
            </div>
            <div className="ppo-surplus">
              <strong>Surplus after completion</strong>
              {Object.entries(result.surplus || {}).map(([key, value]) => (
                <span key={key}>
                  {resourceNames[key]} <b>{number(value)}</b>
                </span>
              ))}
            </div>
            <div className="ppo-export">
              <button type="button" onClick={exportCsv}>
                Download CSV
              </button>
              <button type="button" onClick={copyDiscord}>
                Copy for Discord
              </button>
            </div>
          </>
        )}
      </div>
      <style>{`
      .ppo-shell{display:grid;grid-template-columns:minmax(360px,.82fr) minmax(0,1.18fr);gap:20px;align-items:start;font-family:var(--font-body)}
      .ppo-inputs,.ppo-results{border:1px solid var(--edge-strong);border-radius:var(--radius-lg);background:rgba(9,10,18,.86)}
      .ppo-inputs{padding:22px;position:sticky;top:20px}.ppo-panel-head{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding-bottom:18px;border-bottom:1px solid var(--edge)}
      .ppo-panel-head h2,.ppo-empty h2{margin:0;color:var(--parchment);font-size:20px;text-transform:none;letter-spacing:0}.ppo-panel-head p,.ppo-empty p{margin:5px 0 0;color:var(--parchment-dim);font-size:13px;line-height:1.5}.ppo-panel-head>span{flex:none;border:1px solid rgba(134,168,115,.38);border-radius:999px;padding:5px 9px;color:#a8cc96;background:rgba(134,168,115,.1);font-size:10px;font-weight:800;text-transform:uppercase}
      .ppo-save{display:block;margin-top:7px;color:var(--t-secondary);font-size:10px}.ppo-save-dirty,.ppo-save-saving{color:var(--brass-bright)}.ppo-save-error{color:var(--danger)}
      .ppo-columns{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px}.ppo-columns>div{display:flex;flex-direction:column;gap:12px}.ppo-columns h3{margin:0 0 2px;color:var(--brass-bright);font-size:12px;letter-spacing:.04em}
      .ppo-field{gap:6px;color:var(--parchment-dim);font-size:10px;letter-spacing:.04em}.ppo-field>span{display:flex;align-items:center;gap:7px}.ppo-field i{width:7px;height:7px;border-radius:50%}.ppo-field input{width:100%;min-width:0;padding:10px 11px;background:#11141e;border-color:var(--edge-strong);color:var(--parchment);font-family:var(--font-mono);font-size:14px;font-weight:700}
      .ppo-settings{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:20px;padding-top:18px;border-top:1px solid var(--edge)}.ppo-shortfall{display:flex;flex-wrap:wrap;gap:7px;margin-top:18px}.ppo-shortfall>strong{width:100%;font-size:11px;color:var(--brass-bright);text-transform:uppercase}.ppo-shortfall span{border-radius:999px;background:rgba(255,255,255,.045);padding:5px 8px;color:var(--parchment-dim);font-size:10px}.ppo-shortfall b{color:var(--parchment);font-family:var(--font-mono)}
      .ppo-calculate{width:100%;margin-top:18px;border:1px solid var(--gold-hot);border-radius:var(--radius-md);padding:13px 16px;background:var(--gold-aged);color:#171108;font-weight:900;cursor:pointer;transition:background var(--t-fast),transform var(--t-fast)}.ppo-calculate:hover{background:var(--gold-hot);transform:translateY(-1px)}.ppo-calculate:focus-visible{outline:3px solid rgba(243,217,154,.28);outline-offset:2px}.ppo-calculate:disabled{opacity:.65;cursor:wait;transform:none}.ppo-rule{margin:10px 2px 0;color:var(--t-secondary);font-size:10.5px;line-height:1.5}
      .ppo-state-actions{display:flex;justify-content:flex-end;gap:12px;margin-top:10px}.ppo-state-actions button{border:0;background:transparent;color:var(--brass);font-size:11px;text-decoration:underline;cursor:pointer}.tool-data-assumptions{margin-top:18px;padding-top:14px;border-top:1px solid var(--edge);color:var(--parchment-dim);font-size:11px}.tool-data-assumptions summary{color:var(--brass-bright);font-weight:800;cursor:pointer}.tool-data-assumptions dl{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:12px 0}.tool-data-assumptions dl div{min-width:0}.tool-data-assumptions dt{color:var(--t-muted);font-size:9px;text-transform:uppercase}.tool-data-assumptions dd{margin:2px 0 0;color:var(--parchment)}.tool-data-assumptions h3{font-size:11px}.tool-data-assumptions ul{padding-left:18px}
      .ppo-deadline{color:var(--brass-bright);font-size:10px}.ppo-progress{display:grid;grid-template-columns:1fr auto;gap:6px 10px;align-items:center;margin-top:10px;color:var(--parchment-dim);font-size:10px}.ppo-progress progress{width:100%}.ppo-progress span{grid-column:1}.ppo-progress button{grid-column:2;grid-row:1/3;border:1px solid var(--edge-strong);background:transparent;color:var(--parchment);padding:7px 10px;border-radius:6px}.ppo-export{display:flex;gap:8px;padding:0 18px 18px}.ppo-export button{border:1px solid var(--edge-strong);background:rgba(201,164,78,.1);color:var(--brass-bright);padding:9px 12px;border-radius:7px;cursor:pointer}
      .ppo-results{min-height:540px;overflow:hidden}.ppo-empty{min-height:540px;display:flex;align-items:center;justify-content:center;flex-direction:column;text-align:center;padding:40px}.ppo-empty>span{font-size:40px;color:var(--brass)}.ppo-empty p{max-width:48ch}.ppo-covered>span{color:#a8cc96}.ppo-infeasible>span{color:#e28a5f}.ppo-infeasible h2{color:#f0c669}
      .ppo-result-head{display:flex;align-items:stretch;justify-content:space-between;background:rgba(201,164,78,.09);border-bottom:1px solid var(--edge-strong)}.ppo-result-head>div{padding:22px 24px;display:flex;flex-direction:column;justify-content:center}.ppo-result-head>div span{color:var(--brass-bright);font-size:11px;text-transform:uppercase;font-weight:800}.ppo-result-head>div strong{margin-top:2px;color:var(--gold-hot);font-family:var(--font-mono);font-size:34px}.ppo-result-head dl{display:grid;grid-template-columns:repeat(3,1fr);margin:0}.ppo-result-head dl div{display:flex;min-width:110px;flex-direction:column;justify-content:center;padding:16px;border-left:1px solid var(--edge)}.ppo-result-head dt{color:var(--t-secondary);font-size:10px;text-transform:uppercase}.ppo-result-head dd{margin:4px 0 0;color:var(--parchment);font-family:var(--font-mono);font-weight:700;font-size:13px}
      .ppo-redemption{display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid var(--edge)}.ppo-redemption>div{margin-right:auto}.ppo-redemption h3{margin:0;color:var(--parchment);font-size:13px;text-transform:none}.ppo-redemption p{margin:3px 0 0;color:var(--t-secondary);font-size:10px}.ppo-redemption>span{padding:7px 9px;border-radius:var(--radius-sm);background:rgba(255,255,255,.045);color:var(--parchment-dim);font-size:10px}.ppo-redemption>span b{color:var(--gold-hot);font-family:var(--font-mono)}
      .ppo-week-list{padding:18px;display:flex;flex-direction:column;gap:12px}.ppo-week-list article{border:1px solid var(--edge);border-radius:var(--radius-md);overflow:hidden;background:rgba(255,255,255,.02)}.ppo-week-list article>header{display:flex;justify-content:space-between;padding:12px 14px;background:rgba(255,255,255,.035);border-bottom:1px solid var(--edge)}.ppo-week-list article>header span{color:var(--parchment);font-weight:900}.ppo-week-list article>header strong{color:var(--gold-hot);font-family:var(--font-mono)}.ppo-pack-group{padding:11px 14px}.ppo-pack-group+.ppo-pack-group{border-top:1px solid var(--edge)}.ppo-pack-group h4{margin:0 0 7px;color:var(--brass-bright);font-size:10px;letter-spacing:.05em}.ppo-pack{display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:10px;align-items:center;min-height:28px}.ppo-pack b{color:var(--parchment);font-size:11px}.ppo-pack span{color:var(--t-secondary);font-size:11px}.ppo-pack em{color:var(--parchment-dim);font:normal 11px var(--font-mono)}
      @media(max-width:980px){.ppo-shell{grid-template-columns:1fr}.ppo-inputs{position:static}.ppo-result-head{flex-direction:column}.ppo-result-head dl div:first-child{border-left:0}.ppo-redemption{align-items:flex-start;flex-wrap:wrap}.ppo-redemption>div{width:100%}}
      @media(max-width:580px){.ppo-inputs{padding:16px}.ppo-panel-head{flex-direction:column}.ppo-columns,.ppo-settings{grid-template-columns:1fr}.ppo-result-head dl{grid-template-columns:1fr}.ppo-result-head dl div{border-left:0;border-top:1px solid var(--edge)}.ppo-pack{grid-template-columns:74px minmax(0,1fr)}.ppo-pack em{grid-column:2}.ppo-week-list{padding:12px}}
      .ppo-surplus{display:flex;flex-wrap:wrap;gap:8px;padding:0 18px 18px;color:var(--parchment-dim);font-size:11px}.ppo-surplus strong{width:100%;color:var(--brass-bright)}.ppo-surplus span{padding:6px 8px;background:rgba(255,255,255,.04)}.ppo-surplus b{color:var(--parchment)}
      @media(prefers-reduced-motion:reduce){.ppo-calculate{transition:none}}
    `}</style>
    </section>
  );
}

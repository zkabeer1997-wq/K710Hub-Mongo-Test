"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import academy from "../../lib/data/academy.json";
import advancedResearch from "../../lib/data/advanced-research.json";
import construction from "../../lib/data/construction.json";
import warAcademy from "../../lib/data/war-academy.json";
import {
  ACCOUNT_GOAL_PROFILES,
  ACCOUNT_SYSTEMS,
  DEFAULT_ACCOUNT_WEIGHTS,
  accountPlanCsv,
  accountPlanDiscord,
  buildAccountOpportunities,
  rankAccountProgression,
} from "../../lib/accountProgression.mjs";
import { useToolPersistence } from "../../lib/useToolPersistence";
import DataAssumptions from "./DataAssumptions";
import styles from "./AccountProgressionPlanner.module.css";

const SOURCE_KEYS = [
  ...new Set([
    ...ACCOUNT_SYSTEMS.map((system) => system.toolKey),
    "adventure-stall",
  ]),
];
const today = () => new Date().toISOString().slice(0, 10);
const initialInputs = {
  goal: "balanced",
  targetDate: "",
  horizonDays: 28,
  maxRecommendations: 8,
  includeInfeasible: true,
  systemWeights: { ...DEFAULT_ACCOUNT_WEIGHTS },
  manual: [],
};
const fmt = (value) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const queryFor = (memberId) =>
  memberId ? `?member_id=${encodeURIComponent(memberId)}` : "";

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function SaveState({ persistence }) {
  return (
    <p className={styles.save} aria-live="polite">
      {persistence.message}
    </p>
  );
}

export default function AccountProgressionPlanner({ memberId = "" }) {
  const [inputs, setInputs] = useState(initialInputs);
  const [savedStates, setSavedStates] = useState({});
  const [sourceStatus, setSourceStatus] = useState("loading");
  const [sourceMessage, setSourceMessage] = useState(
    "Connecting your saved planners…",
  );
  const [copied, setCopied] = useState(false);

  const restore = useCallback((saved) => {
    setInputs((current) => ({
      ...current,
      ...saved,
      systemWeights: {
        ...DEFAULT_ACCOUNT_WEIGHTS,
        ...(saved.systemWeights || {}),
      },
      manual: Array.isArray(saved.manual) ? saved.manual : [],
    }));
  }, []);
  const persistence = useToolPersistence({
    toolKey: "account-progression",
    schemaVersion: 1,
    inputs,
    restore,
    autoDetect: true,
  });

  const refreshSources = useCallback(async () => {
    setSourceStatus("loading");
    setSourceMessage("Connecting your saved planners…");
    try {
      const responses = await Promise.all(
        SOURCE_KEYS.map(async (key) => {
          const response = await fetch(`/api/tool-state/${key}`, {
            cache: "no-store",
          });
          if (response.status === 401)
            throw new Error("Sign in as a member to connect saved planners.");
          if (!response.ok)
            throw new Error("One or more saved planners could not be loaded.");
          const body = await response.json();
          return [key, body.state];
        }),
      );
      setSavedStates(Object.fromEntries(responses));
      setSourceStatus("ready");
      setSourceMessage("Saved planners connected.");
    } catch (error) {
      setSourceStatus("error");
      setSourceMessage(error.message);
    }
  }, []);

  useEffect(() => {
    refreshSources();
  }, [refreshSources]);

  const opportunities = useMemo(() => {
    try {
      return buildAccountOpportunities({
        savedStates,
        datasets: { construction, academy, warAcademy, advancedResearch },
        manual: inputs.manual,
      });
    } catch {
      return [];
    }
  }, [inputs.manual, savedStates]);
  const plan = useMemo(
    () =>
      rankAccountProgression(opportunities, {
        ...inputs,
        startDate: today(),
      }),
    [inputs, opportunities],
  );

  const connected = useMemo(
    () => new Set(opportunities.map((item) => item.system)),
    [opportunities],
  );
  const update = (key, value) =>
    setInputs((current) => ({ ...current, [key]: value }));
  const chooseGoal = (goal) =>
    setInputs((current) => ({
      ...current,
      goal,
      systemWeights: {
        ...(ACCOUNT_GOAL_PROFILES[goal]?.weights || current.systemWeights),
      },
    }));
  const updateWeight = (system, value) =>
    setInputs((current) => ({
      ...current,
      goal: "custom",
      systemWeights: {
        ...current.systemWeights,
        [system]: Math.max(0, Number(value) || 0),
      },
    }));
  const addManual = () =>
    update("manual", [
      ...inputs.manual,
      {
        system: "heroGear",
        title: "",
        benefit: "",
        days: 1,
        feasible: true,
        notes: "",
      },
    ]);
  const updateManual = (index, key, value) =>
    update(
      "manual",
      inputs.manual.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [key]: value } : item,
      ),
    );

  return (
    <div className={styles.workspace}>
      <section className={styles.intro}>
        <div>
          <span className={styles.eyebrow}>Phase 4 · Unified planning</span>
          <h2>One roadmap from every saved planner</h2>
          <p>
            Connect your Phase 2 plans, choose what matters now, then work
            through a ranked list with costs, timing, and bottlenecks already
            attached.
          </p>
        </div>
        <div className={styles.steps} aria-label="Planner workflow">
          <span className={styles.active}>
            <b>1</b> Connect
          </span>
          <span>
            <b>2</b> Prioritize
          </span>
          <span>
            <b>3</b> Act
          </span>
        </div>
      </section>

      <div className={styles.layout}>
        <aside className={styles.controls}>
          <SaveState persistence={persistence} />
          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <span>01</span>
                <h2>Connected plans</h2>
              </div>
              <button
                type="button"
                onClick={refreshSources}
                disabled={sourceStatus === "loading"}
              >
                Refresh
              </button>
            </header>
            <p className={styles.status} data-status={sourceStatus}>
              {sourceMessage}
            </p>
            <div className={styles.sources}>
              {ACCOUNT_SYSTEMS.map((system) => (
                <Link
                  key={system.id}
                  href={`${system.href}${queryFor(memberId)}`}
                  className={styles.source}
                >
                  <span
                    className={
                      connected.has(system.id) ? styles.dotOn : styles.dotOff
                    }
                  />
                  <span>
                    <strong>{system.label}</strong>
                    <small>
                      {connected.has(system.id)
                        ? "Ready to rank"
                        : "Open and save a target"}
                    </small>
                  </span>
                  <b>→</b>
                </Link>
              ))}
            </div>
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <span>02</span>
                <h2>Set your priority</h2>
              </div>
            </header>
            <label>
              Primary goal
              <select
                value={inputs.goal}
                onChange={(event) => chooseGoal(event.target.value)}
              >
                {Object.entries(ACCOUNT_GOAL_PROFILES).map(([key, profile]) => (
                  <option key={key} value={key}>
                    {profile.label}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.twoCol}>
              <label>
                Plan window
                <select
                  value={inputs.horizonDays}
                  onChange={(event) =>
                    update("horizonDays", Number(event.target.value))
                  }
                >
                  <option value={7}>1 week</option>
                  <option value={14}>2 weeks</option>
                  <option value={28}>4 weeks</option>
                  <option value={56}>8 weeks</option>
                </select>
              </label>
              <label>
                Top actions
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={inputs.maxRecommendations}
                  onChange={(event) =>
                    update("maxRecommendations", Number(event.target.value))
                  }
                />
              </label>
            </div>
            <label>
              Target date <span className={styles.optional}>Optional</span>
              <input
                type="date"
                value={inputs.targetDate}
                onChange={(event) => update("targetDate", event.target.value)}
              />
            </label>
            <label className={styles.check}>
              <input
                type="checkbox"
                checked={inputs.includeInfeasible}
                onChange={(event) =>
                  update("includeInfeasible", event.target.checked)
                }
              />{" "}
              Show actions that still need resources
            </label>
            <details className={styles.advanced}>
              <summary>Fine-tune system weights</summary>
              <p>
                0 excludes a system. 1 is normal priority; values above 1 make
                it more important.
              </p>
              <div className={styles.weights}>
                {ACCOUNT_SYSTEMS.map((system) => (
                  <label key={system.id}>
                    {system.label}
                    <input
                      aria-label={`${system.label} weight`}
                      type="number"
                      min="0"
                      max="5"
                      step="0.25"
                      value={inputs.systemWeights[system.id] ?? 1}
                      onChange={(event) =>
                        updateWeight(system.id, event.target.value)
                      }
                    />
                  </label>
                ))}
              </div>
            </details>
          </section>

          <section className={styles.panel}>
            <header className={styles.panelHead}>
              <div>
                <span>+</span>
                <h2>Add a manual target</h2>
              </div>
              <button type="button" onClick={addManual}>
                Add
              </button>
            </header>
            <p className={styles.help}>
              Use this only when a source planner does not yet cover your next
              action. Manual entries never receive invented costs or stats.
            </p>
            {inputs.manual.map((item, index) => (
              <div className={styles.manual} key={index}>
                <select
                  aria-label="Manual target system"
                  value={item.system}
                  onChange={(event) =>
                    updateManual(index, "system", event.target.value)
                  }
                >
                  {ACCOUNT_SYSTEMS.map((system) => (
                    <option key={system.id} value={system.id}>
                      {system.label}
                    </option>
                  ))}
                </select>
                <input
                  aria-label="Manual target action"
                  placeholder="Next action"
                  value={item.title}
                  onChange={(event) =>
                    updateManual(index, "title", event.target.value)
                  }
                />
                <input
                  aria-label="Manual target benefit"
                  placeholder="Expected benefit (optional)"
                  value={item.benefit}
                  onChange={(event) =>
                    updateManual(index, "benefit", event.target.value)
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    update(
                      "manual",
                      inputs.manual.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    )
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </section>
        </aside>

        <main className={styles.results}>
          <section className={styles.summary}>
            <div>
              <small>Connected systems</small>
              <strong>
                {connected.size}
                <em> / {ACCOUNT_SYSTEMS.length}</em>
              </strong>
            </div>
            <div>
              <small>Rankable actions</small>
              <strong>{plan.ranked.length}</strong>
            </div>
            <div>
              <small>Ready now</small>
              <strong>
                {plan.ranked.filter((item) => item.feasible).length}
              </strong>
            </div>
            <div>
              <small>Bottlenecks</small>
              <strong>{plan.bottlenecks.length}</strong>
            </div>
          </section>

          <section className={styles.planPanel}>
            <header className={styles.resultHead}>
              <div>
                <span className={styles.eyebrow}>Your next best actions</span>
                <h2>Account roadmap</h2>
                <p>Ranked from your saved targets and the priorities above.</p>
              </div>
              <div className={styles.actions}>
                <button
                  type="button"
                  disabled={!plan.selected.length}
                  onClick={() =>
                    download(
                      "k710-account-plan.csv",
                      accountPlanCsv(plan),
                      "text/csv",
                    )
                  }
                >
                  CSV
                </button>
                <button
                  type="button"
                  disabled={!plan.selected.length}
                  onClick={() =>
                    download(
                      "k710-account-plan.json",
                      JSON.stringify(plan, null, 2),
                      "application/json",
                    )
                  }
                >
                  JSON
                </button>
                <button
                  type="button"
                  disabled={!plan.selected.length}
                  onClick={async () => {
                    await navigator.clipboard.writeText(
                      accountPlanDiscord(plan),
                    );
                    setCopied(true);
                    setTimeout(() => setCopied(false), 1800);
                  }}
                >
                  {copied ? "Copied" : "Copy Discord"}
                </button>
              </div>
            </header>
            {!plan.selected.length ? (
              <div className={styles.empty}>
                <b>No saved targets to rank yet.</b>
                <p>
                  Open a planner in Connected plans, enter a target, and let it
                  save. Return here and press Refresh.
                </p>
              </div>
            ) : (
              <ol className={styles.rankList}>
                {plan.selected.map((item, index) => (
                  <li key={item.id} className={styles.rankCard}>
                    <div className={styles.rank}>
                      {String(index + 1).padStart(2, "0")}
                    </div>
                    <div className={styles.rankBody}>
                      <div className={styles.badges}>
                        <span>{item.systemLabel}</span>
                        <span data-ready={item.feasible}>
                          {item.feasible ? "Ready" : "Needs resources"}
                        </span>
                        <span>
                          {item.verifiedStatus === "manual"
                            ? "Manual"
                            : "Source planner"}
                        </span>
                      </div>
                      <h3>{item.title}</h3>
                      <p className={styles.benefit}>{item.benefit}</p>
                      <p>{item.rationale}</p>
                      <div className={styles.resourceLine}>
                        <b>Resources</b>
                        <span>
                          {Object.entries(item.resources || {})
                            .filter(([, value]) => Number(value) > 0)
                            .map(([key, value]) => `${fmt(value)} ${key}`)
                            .join(" · ") || "None entered"}
                        </span>
                      </div>
                      <details className={styles.score}>
                        <summary>
                          Why this rank · score {item.score.toFixed(2)}
                        </summary>
                        <p>
                          Priority {item.scoreBreakdown.memberWeight} × goal fit{" "}
                          {item.scoreBreakdown.goalFit} × feasibility{" "}
                          {item.scoreBreakdown.feasibility} × deadline fit{" "}
                          {item.scoreBreakdown.deadline.toFixed(2)}
                        </p>
                      </details>
                    </div>
                    <Link href={`${item.href}${queryFor(memberId)}`}>
                      Open planner →
                    </Link>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {plan.selected.length ? (
            <div className={styles.detailGrid}>
              <section className={styles.planPanel}>
                <header className={styles.miniHead}>
                  <span>03</span>
                  <h2>Weekly action plan</h2>
                </header>
                {Array.from(
                  { length: Math.max(1, Math.ceil(inputs.horizonDays / 7)) },
                  (_, i) => i + 1,
                ).map((week) => (
                  <div className={styles.week} key={week}>
                    <b>Week {week}</b>
                    <ul>
                      {plan.weekly
                        .filter((item) => item.week === week)
                        .map((item) => (
                          <li key={item.id}>
                            <strong>{item.system}</strong>
                            {item.action}
                            <small>{item.resources}</small>
                          </li>
                        ))}
                    </ul>
                  </div>
                ))}
              </section>
              <section className={styles.planPanel}>
                <header className={styles.miniHead}>
                  <span>!</span>
                  <h2>Bottlenecks</h2>
                </header>
                {plan.bottlenecks.length ? (
                  <ul className={styles.simpleList}>
                    {plan.bottlenecks.map((item, index) => (
                      <li key={`${item.system}-${item.resource}-${index}`}>
                        <strong>
                          {fmt(item.amount)} {item.resource}
                        </strong>
                        <span>{item.system}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.good}>
                    Every selected action is currently funded by its saved
                    planner.
                  </p>
                )}
              </section>
              <section className={styles.planPanel}>
                <header className={styles.miniHead}>
                  <span>↕</span>
                  <h2>Sensitivity check</h2>
                </header>
                <p className={styles.help}>
                  Shows whether a ±25% weight change alters each
                  recommendation’s rank.
                </p>
                <ul className={styles.simpleList}>
                  {plan.sensitivity.map((item) => (
                    <li key={item.id}>
                      <strong>{item.title}</strong>
                      <span>
                        {item.stable
                          ? `Stable at #${item.minRank}`
                          : `Can move #${item.minRank}–${item.maxRank}`}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
              <section className={styles.planPanel}>
                <header className={styles.miniHead}>
                  <span>→</span>
                  <h2>Deferred alternatives</h2>
                </header>
                {plan.deferred.length ? (
                  <ul className={styles.simpleList}>
                    {plan.deferred.slice(0, 8).map((item) => (
                      <li key={item.id}>
                        <strong>{item.title}</strong>
                        <span>
                          {item.systemLabel} · {item.score.toFixed(2)}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className={styles.help}>
                    No additional saved actions are currently deferred.
                  </p>
                )}
              </section>
            </div>
          ) : null}

          <section className={styles.method}>
            <b>How ranking works</b>
            <p>{plan.methodology}</p>
          </section>
          <DataAssumptions
            datasetId="account-progression-scoring"
            toolVersion="1.0.0"
          />
        </main>
      </div>
    </div>
  );
}

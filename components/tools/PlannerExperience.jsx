"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import styles from "./PlannerExperience.module.css";

export const PLANNER_STEPS = [
  "Current setup",
  "Available resources",
  "Goal & priorities",
  "Recommendation",
  "Save to roadmap",
];

export function PlannerProgress({ current = 1, statuses = [] }) {
  return (
    <ol className={styles.progress} aria-label="Planner progress">
      {PLANNER_STEPS.map((label, index) => {
        const step = index + 1;
        const state = statuses[index] || (step < current ? "done" : step === current ? "current" : "next");
        return (
          <li key={label} data-state={state}>
            <span>{state === "done" ? "✓" : step}</span>
            <b>{label}</b>
          </li>
        );
      })}
    </ol>
  );
}

export function SaveToRoadmap({ persistence, compact = false }) {
  return (
    <div className={styles.saveBox} data-status={persistence.status}>
      <div>
        <b>{persistence.status === "saved" ? "Roadmap connected" : "Save this plan"}</b>
        <span aria-live="polite">{persistence.message}</span>
      </div>
      <div className={styles.saveActions}>
        {persistence.hasPrevious ? (
          <button type="button" onClick={persistence.restorePrevious}>Undo last save</button>
        ) : null}
        <button type="button" className={styles.primary} onClick={persistence.saveNow} disabled={persistence.status === "saving"}>
          {persistence.status === "saving" ? "Saving…" : compact ? "Save" : "Save to account roadmap"}
        </button>
      </div>
    </div>
  );
}

export function DataLabel({ type, children }) {
  const labels = {
    exact: "Exact",
    input: "Member input",
    unavailable: "Exact value unavailable",
    subjective: "Subjective priority",
    estimated: "Estimated",
  };
  return <span className={styles.dataLabel} data-type={type}>{labels[type] || type}{children ? ` · ${children}` : ""}</span>;
}

export function FirstUseGuide({ toolKey, title, steps, terms = [], onDemo }) {
  const storageKey = `k710-walkthrough:${toolKey}`;
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try { setOpen(localStorage.getItem(storageKey) !== "seen"); } catch { setOpen(false); }
  }, [storageKey]);

  const dismiss = () => {
    try { localStorage.setItem(storageKey, "seen"); } catch {}
    setOpen(false);
  };

  return (
    <section className={styles.guide}>
      <button type="button" className={styles.guideToggle} onClick={() => setOpen((value) => !value)}>
        {open ? "Hide quick start" : "New here? Show quick start"}
      </button>
      {open ? (
        <div className={styles.guideBody}>
          <div>
            <h2>{title}</h2>
            <ol>{steps.map((step) => <li key={step}>{step}</li>)}</ol>
          </div>
          <div className={styles.guideSide}>
            {terms.length ? (
              <details>
                <summary>Game terms used here</summary>
                <dl>{terms.map(([term, meaning]) => <div key={term}><dt>{term}</dt><dd>{meaning}</dd></div>)}</dl>
              </details>
            ) : null}
            {onDemo ? <button type="button" onClick={onDemo}>Load example account</button> : null}
            <button type="button" onClick={dismiss}>Got it</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

export function SourceToolOnboarding({ toolKey, current = 3 }) {
  return <>
    <PlannerProgress current={current} />
    <FirstUseGuide
      toolKey={toolKey}
      title="Build your recommendation"
      steps={[
        "Confirm what you already own and the resources available to spend.",
        "Choose your goal or reward priorities, then review the calculated recommendation.",
        "Save the result to your account roadmap so Phase 4 can use it.",
      ]}
      terms={[
        ["Recommendation", "The best result supported by the inventory, constraints, and priorities entered here."],
        ["Account roadmap", "The saved plan Phase 4 combines with your other K710 tools."],
      ]}
    />
  </>;
}

export function NextAction({ title, reason, before, after, resources, remaining, href }) {
  return (
    <section className={styles.nextAction}>
      <div className={styles.nextTop}><span>Do this next</span>{href ? <Link href={href}>Open action →</Link> : null}</div>
      <h2>{title}</h2>
      <p>{reason}</p>
      {(before || after) ? <div className={styles.beforeAfter}><div><small>Before</small><b>{before || "Current state"}</b></div><span>→</span><div><small>After</small><b>{after || "Recommended state"}</b></div></div> : null}
      {(resources || remaining) ? <div className={styles.balance}><span><small>Uses</small>{resources || "No resources entered"}</span><span><small>Remaining afterward</small>{remaining || "Calculated in the plan below"}</span></div> : null}
    </section>
  );
}

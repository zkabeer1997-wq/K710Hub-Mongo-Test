"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import academy from "../../lib/data/academy.json";
import advancedResearch from "../../lib/data/advanced-research.json";
import warAcademy from "../../lib/data/war-academy.json";
import { ACCOUNT_SUMMARY_SYSTEMS, accountSummaryCsv, buildAccountSummaries, buildProgressionOverview, resourcesText } from "../../lib/accountProgressionSummary.mjs";
import { useToolPersistence } from "../../lib/useToolPersistence";
import styles from "./AccountProgressionPlanner.module.css";

const DEFAULT_INPUTS = { view: "summary", objective: "summary", kvkStartDate: "", dailyTarget: 200000 };
const dateText = (value) => value ? new Date(value).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Never";
const number = (value) => Number(value || 0).toLocaleString();
const withMember = (route, memberId) => memberId ? `${route}?member_id=${encodeURIComponent(memberId)}` : route;

function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  URL.revokeObjectURL(url);
}

function StatusPill({ summary }) {
  if (summary.status === "missing") return <span className={`${styles.pill} ${styles.missing}`}>Not configured</span>;
  if (summary.legacy) return <span className={`${styles.pill} ${styles.legacy}`}>Legacy plan</span>;
  if (!summary.nextAction) return <span className={styles.pill}>Up to date</span>;
  return <span className={`${styles.pill} ${summary.affordable ? styles.ready : styles.blocked}`}>{summary.affordable ? "Ready now" : "Needs materials"}</span>;
}

function SystemRow({ summary, memberId }) {
  return <article className={styles.systemRow}>
    <div className={styles.systemIdentity}><span className={styles.systemMark} aria-hidden="true">{summary.status === "missing" ? "○" : summary.legacy ? "!" : "●"}</span><div><h3>{summary.label}</h3><p>{summary.targetLabel}</p></div></div>
    <div className={styles.systemMeta}><StatusPill summary={summary} /><span>{summary.updatedAt ? `Updated ${dateText(summary.updatedAt)}` : "No saved data"}</span><Link href={withMember(summary.route, memberId)}>{summary.status === "missing" ? "Set up" : summary.legacy ? "Move to updated tool" : "Open"} →</Link></div>
  </article>;
}

function ActionCard({ action, memberId, rank }) {
  return <article className={styles.actionCard}><span className={styles.rank}>0{rank}</span><div className={styles.actionBody}>
    <div className={styles.actionTop}><div><span>{action.label}</span><h3>{action.targetLabel}</h3></div><StatusPill summary={action} /></div>
    <p><strong>Requires:</strong> {resourcesText(action.requirements)}</p>
    {Object.values(action.shortfall || {}).some(Number) ? <p className={styles.shortfall}><strong>Missing:</strong> {resourcesText(action.shortfall)}</p> : <p className={styles.covered}><strong>Covered by current inventory</strong></p>}
    <div className={styles.actionFooter}><span>{action.scoringStatus === "verified" ? `${number(action.exactKvkPoints)} exact KvK points` : "KvK points unavailable—excluded from exact total"}</span><Link href={withMember(action.route, memberId)}>Review in {action.label} →</Link></div>
  </div></article>;
}

function KvkDay({ day }) {
  return <article className={styles.dayCard}><header><div><span>Day {day.day}</span><h3>{day.items.length ? `${day.items.length} saved action${day.items.length === 1 ? "" : "s"}` : "No saved action"}</h3></div><strong>{number(day.exactPoints)} pts</strong></header>
    <div className={styles.progress} aria-label={`${number(day.exactPoints)} of ${number(day.target)} exact points`}><i style={{ width: `${day.target ? Math.min(100, day.exactPoints / day.target * 100) : 0}%` }} /></div>
    <small>{day.target === 0 ? "No daily target set" : day.covered ? "Daily target covered" : `${number(Math.max(0, day.target - day.exactPoints))} exact points short`}</small>
    {day.items.length ? <ul>{day.items.map((item) => <li key={item.id}><strong>{item.label}</strong><span>{item.targetLabel}</span><em>{item.scoringStatus === "verified" ? `${number(item.exactKvkPoints)} pts` : "Timing only"}</em></li>)}</ul> : <p>Save a relevant target in an Updated Tool to populate this day.</p>}
  </article>;
}

export default function AccountProgressionPlanner({ memberId = "", initialGoal = "" }) {
  const [inputs, setInputs] = useState(() => ({ ...DEFAULT_INPUTS, ...(initialGoal === "kvk" ? { view: "kvk", objective: "kvk" } : {}) }));
  const [sources, setSources] = useState({});
  const [loadState, setLoadState] = useState("loading");
  const [loadMessage, setLoadMessage] = useState("Connecting your Updated Tools…");
  const restore = useCallback((saved) => setInputs((current) => ({ ...current, ...saved })), []);
  const migrate = useCallback((saved) => ({ ...DEFAULT_INPUTS, view: saved.activeView === "calendar" ? "kvk" : "summary", objective: saved.objective === "kvkPoints" ? "kvk" : "summary", kvkStartDate: saved.kvkStartDate || "", dailyTarget: saved.dailyChestTarget ?? 200000 }), []);
  const persistence = useToolPersistence({ toolKey: "account-progression", schemaVersion: 2, inputs, restore, migrate, autoDetect: true });

  const refresh = useCallback(async () => {
    setLoadState("loading");
    try {
      const response = await fetch("/api/tool-state/summary", { cache: "no-store" });
      if (response.status === 401) throw new Error("Sign in as a member to connect saved Updated Tools.");
      if (!response.ok) throw new Error("Saved tool summaries could not be loaded.");
      const body = await response.json();
      setSources(body.sources || {});
      setLoadState("ready");
      setLoadMessage("Updated Tool summaries connected.");
    } catch (error) { setLoadState("error"); setLoadMessage(error.message); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  const summaries = useMemo(() => buildAccountSummaries({ sources, datasets: { academy, warAcademy, advancedResearch } }), [sources]);
  const overview = useMemo(() => buildProgressionOverview(summaries, inputs), [summaries, inputs]);
  const currentActions = overview.actions.filter((item) => !item.legacy);
  const currentConnected = overview.connected.filter((item) => !item.legacy).length;
  const missing = ACCOUNT_SUMMARY_SYSTEMS.length - currentConnected;

  return <div className={styles.shell}>
    <section className={styles.hero}><div><span className={styles.eyebrow}>YOUR SAVED PROGRESSION</span><h2>Everything you need next</h2><p>One read-only view of the targets, inventory, shortfalls, and exact KvK points already saved in Updated Tools.</p></div><div className={styles.heroActions}><button type="button" onClick={refresh} disabled={loadState === "loading"}>{loadState === "loading" ? "Refreshing…" : "Refresh summaries"}</button><button type="button" className={styles.secondary} onClick={() => persistence.saveNow()}>Save preferences</button></div></section>
    <div className={`${styles.connection} ${loadState === "error" ? styles.connectionError : ""}`} role="status"><span>{loadState === "error" ? "!" : "✓"}</span><div><strong>{loadMessage}</strong><small>{currentConnected} current · {overview.legacy.length} legacy · {missing} not configured</small></div></div>
    {overview.legacy.length ? <section className={styles.legacyNotice}><strong>Legacy plans are not included in recommendations.</strong><p>{overview.legacy.map((item) => item.label).join(", ")} still has saved data from a retired tool. Open the Updated Tool and save once to migrate your active plan.</p></section> : null}
    <nav className={styles.tabs} aria-label="Account summary view"><button type="button" aria-pressed={inputs.view === "summary"} onClick={() => setInputs((current) => ({ ...current, view: "summary", objective: "summary" }))}>Account summary</button><button type="button" aria-pressed={inputs.view === "kvk"} onClick={() => setInputs((current) => ({ ...current, view: "kvk", objective: "kvk" }))}>KvK Preparation</button></nav>
    <section className={styles.metrics} aria-label="Account overview"><div><span>Current tools connected</span><strong>{currentConnected}<em> / {ACCOUNT_SUMMARY_SYSTEMS.length}</em></strong><small>Legacy states excluded</small></div><div><span>Actions ready now</span><strong>{overview.actionable.filter((item) => item.affordable && !item.legacy).length}</strong><small>Covered by saved inventory</small></div><div><span>Exact KvK points prepared</span><strong>{number(overview.exactKvkPoints)}</strong><small>Verified source actions only</small></div><div><span>Top material bottlenecks</span><strong>{overview.bottlenecks.length}</strong><small>Across current targets</small></div></section>
    {inputs.view === "summary" ? <div className={styles.summaryLayout}><main>
      <section className={styles.sectionHead}><div><span>DO THIS NEXT</span><h2>Three useful next actions</h2><p>Affordable actions come first. Cross-system ordering is a planning preference, while each source tool remains authoritative.</p></div></section>
      <div className={styles.actions}>{currentActions.length ? currentActions.map((action, index) => <ActionCard key={action.id} action={action} memberId={memberId} rank={index + 1} />) : <div className={styles.empty}><h3>No current actions yet</h3><p>Save a target in any Updated Tool. It will appear here automatically.</p><Link href={`/tools?category=UPDATED+TOOLS${memberId ? `&member_id=${encodeURIComponent(memberId)}` : ""}`}>Open Updated Tools →</Link></div>}</div>
      <section className={styles.sectionHead}><div><span>SAVED SYSTEMS</span><h2>Progress at a glance</h2><p>Status is based on saved data—not whether an optimizer happens to produce an affordable action.</p></div></section><div className={styles.systems}>{summaries.map((summary) => <SystemRow key={summary.id} summary={summary} memberId={memberId} />)}</div>
    </main><aside><section className={styles.sideCard}><span>TOP BOTTLENECKS</span><h2>What is holding plans back</h2>{overview.bottlenecks.length ? <ol>{overview.bottlenecks.map((item) => <li key={`${item.system}-${item.resource}`}><div><strong>{item.resource}</strong><span>{item.system}</span></div><b>{number(item.amount)}</b></li>)}</ol> : <p>Your saved next actions are covered, or no current targets are connected.</p>}</section><details className={styles.settings}><summary>Customize summary</summary><div><label>Default priority<select value={inputs.objective} onChange={(event) => setInputs((current) => ({ ...current, objective: event.target.value }))}><option value="summary">Affordable progression first</option><option value="kvk">Exact KvK points first</option></select></label><p>Only changes cross-system display order. It never changes a source optimizer’s recommendation.</p></div></details><div className={styles.exports}><button type="button" onClick={() => download("account-progression-summary.csv", accountSummaryCsv(overview), "text/csv;charset=utf-8")}>Export CSV</button><button type="button" onClick={() => download("account-progression-summary.json", JSON.stringify({ generatedAt: new Date().toISOString(), summaries, overview }, null, 2), "application/json")}>Export JSON</button></div></aside></div>
    : <main className={styles.kvk}><section className={styles.kvkHead}><div><span>KVK PREPARATION</span><h2>Five-day spending summary</h2><p>Only verified points are included in totals. “Timing only” actions remain visible without invented values.</p></div><div><strong>{number(overview.exactKvkPoints)}</strong><span>exact points prepared</span></div></section><details className={styles.settings}><summary>Dates and daily target</summary><div className={styles.settingsGrid}><label>KvK Prep Day 1<input type="date" value={inputs.kvkStartDate} onChange={(event) => setInputs((current) => ({ ...current, kvkStartDate: event.target.value }))} /></label><label>Daily point target<input type="number" min="0" inputMode="numeric" value={inputs.dailyTarget} onChange={(event) => setInputs((current) => ({ ...current, dailyTarget: Math.max(0, Number(event.target.value) || 0) }))} /></label></div></details><div className={styles.days}>{overview.days.map((day) => <KvkDay key={day.day} day={day} />)}</div><section className={styles.provenance}><strong>Scoring boundary</strong><p>Governor Gear and Charms use the exact upgrade-level points produced by their Updated Tools. Hero Gear uses only Forgehammer and Mithril points from its generated action. Enhancement XP and Mythic Gear contribute zero. Systems without verified event values are excluded from the exact total.</p></section></main>}
  </div>;
}

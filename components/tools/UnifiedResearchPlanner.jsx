"use client";

import { useState } from "react";
import CostPlanner from "./CostPlanner";
import { ACADEMY_WORKBOOK_SUMMARY, ADVANCED_WORKBOOK_SUMMARY, RESEARCH_DATA_COUNTS, RESEARCH_WORKBOOK, WAR_ACADEMY_WORKBOOK_SUMMARY } from "../../lib/updatedResearchData.mjs";
import styles from "./UnifiedResearchPlanner.module.css";

const SYSTEMS = [
  { id: "academy", label: "Academy", count: RESEARCH_DATA_COUNTS.academy },
  { id: "war-academy", label: "War Academy", count: RESEARCH_DATA_COUNTS.warAcademy },
  { id: "advanced-research", label: "Advanced", count: RESEARCH_DATA_COUNTS.advanced },
];

function AcademyReference() {
  const data = ACADEMY_WORKBOOK_SUMMARY;
  return <div className={styles.reference}>
    <div className={styles.referenceHead}><div><span>Workbook context</span><h2>Academy gates and priorities</h2></div><p>Exact research levels are calculated below. Rounded building and tree totals remain reference-only.</p></div>
    <div className={styles.metrics}><div><span>Academy unlock</span><strong>Town Center {data.building.unlockTownCenter}</strong></div><div><span>Academy 30 bonus</span><strong>{data.building.maxResearchSpeed}% research speed</strong></div><div><span>Academy build time</span><strong>{data.building.baseTime}</strong></div></div>
    <details><summary>Full-tree workbook summaries</summary><div className={styles.tableWrap}><table><thead><tr><th>Tree</th><th>Technologies</th><th>Levels</th><th>Base time</th><th>Power</th></tr></thead><tbody>{data.trees.map((row) => <tr key={row.name}><th>{row.name}</th><td>{row.technologies}</td><td>{row.levels}</td><td>{row.baseTime}</td><td>{row.power}</td></tr>)}</tbody></table></div></details>
    <details><summary>Workbook priority guide</summary><div className={styles.priorityList}>{data.priorities.map(([name, effect, note]) => <div key={name}><strong>{name}</strong><span>{effect}</span><p>{note}</p></div>)}</div></details>
  </div>;
}

function WarReference() {
  const data = WAR_ACADEMY_WORKBOOK_SUMMARY;
  return <div className={styles.reference}>
    <div className={styles.referenceHead}><div><span>Workbook context</span><h2>T11 gates and War Academy building</h2></div><p>Use the exact per-level calculator below for selectable research. Path aggregates are disclosed as workbook summaries.</p></div>
    <details><summary>War Academy TG1–TG10 building stages</summary><div className={styles.tableWrap}><table><thead><tr><th>Stage</th><th>Truegold</th><th>TTG</th><th>Research speed</th><th>Gate</th></tr></thead><tbody>{data.buildingStages.map(([stage, tg, ttg, speed, note]) => <tr key={stage}><th>{stage}</th><td>{tg.toLocaleString()}</td><td>{ttg || "—"}</td><td>{speed}</td><td>{note || "—"}</td></tr>)}</tbody></table></div></details>
    <details><summary>T11 path summaries and order</summary><div className={styles.tableWrap}><table><thead><tr><th>Goal</th><th>Dust</th><th>Base time</th><th>Confidence</th></tr></thead><tbody>{data.paths.map((row) => <tr key={row[0]}>{row.map((value, index) => index ? <td key={value}>{value}</td> : <th key={value}>{value}</th>)}</tr>)}</tbody></table></div><ol className={styles.order}>{data.unlockOrder.map((step) => <li key={step}>{step}</li>)}</ol></details>
    <details><summary>Truegold Dust acquisition assumptions</summary><ul>{data.acquisition.map((item) => <li key={item}>{item}</li>)}</ul></details>
  </div>;
}

function AdvancedReference() {
  const data = ADVANCED_WORKBOOK_SUMMARY;
  return <div className={styles.reference}>
    <div className={styles.referenceHead}><div><span>Workbook context</span><h2>Advanced research roadmap</h2></div><p>All 92 technologies and 1,010 verified level records are selectable below; workbook full-tree totals remain estimates.</p></div>
    <div className={styles.metrics}>{data.totals.slice(0, 3).map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
    <details><summary>Full-tree estimates</summary><div className={styles.metricRows}>{data.totals.slice(3).map(([label, value]) => <p key={label}><span>{label}</span><strong>{value}</strong></p>)}</div></details>
    <details><summary>Dependency and priority sequence</summary><div className={styles.tableWrap}><table><thead><tr><th>Stage</th><th>Research group</th><th>Material profile</th></tr></thead><tbody>{data.order.map((row) => <tr key={row[0]}><th>{row[0]}</th><td>{row[1]}</td><td>{row[2]}</td></tr>)}</tbody></table></div><ul>{data.notes.map((note) => <li key={note}>{note}</li>)}</ul></details>
    <div className={styles.discrepancy}><strong>Workbook discrepancy corrected</strong><p>{data.discrepancies[0]}</p></div>
  </div>;
}

const REFERENCES = { academy: AcademyReference, "war-academy": WarReference, "advanced-research": AdvancedReference };

export default function UnifiedResearchPlanner({ datasets }) {
  const [active, setActive] = useState("academy");
  return <div className={styles.shell}>
    <section className={styles.trust}>
      <div><span>Exact-only calculator</span><h2>One planner, three research systems</h2><p>Choose exact current and target levels, include prerequisites, subtract inventory, apply research speed, and export the resulting plan.</p></div>
      <div><strong>1,994</strong><span>verified level records</span><small>{RESEARCH_WORKBOOK.limitations}</small></div>
    </section>
    <nav className={styles.tabs} role="tablist" aria-label="Research system">
      {SYSTEMS.map((system) => <button type="button" role="tab" key={system.id} aria-selected={active === system.id} onClick={() => setActive(system.id)}><strong>{system.label}</strong><span>{system.count.technologies} technologies · {system.count.levels} levels</span></button>)}
    </nav>
    {(() => {
      const system = SYSTEMS.find((item) => item.id === active) || SYSTEMS[0];
      const Reference = REFERENCES[system.id];
      return <section key={system.id} aria-label={`${system.label} planner`}>
        <Reference />
        <CostPlanner dataset={datasets[system.id]} toolKey={system.id} />
      </section>;
    })()}
    <footer className={styles.provenance}><strong>{RESEARCH_WORKBOOK.name}</strong><span>Supplied {RESEARCH_WORKBOOK.suppliedAt}. Exact calculations use the repository’s verified per-level fixtures; the workbook provides cross-check totals, gates, priorities, and strategy.</span></footer>
  </div>;
}

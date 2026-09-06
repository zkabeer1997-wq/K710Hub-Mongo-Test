"use client";

import { useCallback, useMemo, useState } from "react";

import { toolConfiguration } from "../../lib/toolCatalog.mjs";
import { useToolPersistence } from "../../lib/useToolPersistence";
import { SaveToRoadmap } from "../../components/tools/PlannerExperience";
import {
  probabilityAtLeast,
  probabilityExactly,
} from "../../lib/waveboundProbability.mjs";
const DEFAULT_CONFIG = toolConfiguration("wavebound-charms");
const migrateWaveboundState = (value) => value;
const DEFAULT_TARGET_CHARMS = ["Infantry", "Cavalry", "Archer"].flatMap(
  (type) =>
    Array.from({ length: 6 }, (_, index) => ({
      id: `${type}-${index + 1}`,
      type,
      current: 0,
      target: 10,
    })),
);

function fmt(n) {
  return Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function WaveboundCharmOptimizer({
  configuration = DEFAULT_CONFIG,
}) {
  const LEVEL_COSTS = configuration.costs,
    r = configuration.rewards;
  const [currentLevel, setCurrentLevel] = useState(0);
  const [targetLevel, setTargetLevel] = useState(10);
  const [charmCount, setCharmCount] = useState(18);
  const [ownedGuides, setOwnedGuides] = useState(0);
  const [ownedDesigns, setOwnedDesigns] = useState(0);
  const [common, setCommon] = useState(0);
  const [premium, setPremium] = useState(0);
  const [exquisite, setExquisite] = useState(0);
  const [majestic, setMajestic] = useState(0);
  const [confidence, setConfidence] = useState(0.75);
  const [individualTargets, setIndividualTargets] = useState(false);
  const [targetCharms, setTargetCharms] = useState(DEFAULT_TARGET_CHARMS);
  const [importStatus, setImportStatus] = useState("");
  const [calculated, setCalculated] = useState(false);
  const inputs = useMemo(
    () => ({
      currentLevel,
      targetLevel,
      charmCount,
      ownedGuides,
      ownedDesigns,
      common,
      premium,
      exquisite,
      majestic,
      confidence,
      individualTargets,
      targetCharms,
    }),
    [
      currentLevel,
      targetLevel,
      charmCount,
      ownedGuides,
      ownedDesigns,
      common,
      premium,
      exquisite,
      majestic,
      confidence,
      individualTargets,
      targetCharms,
    ],
  );
  const restore = useCallback((s) => {
    if (Number.isFinite(s.currentLevel)) setCurrentLevel(s.currentLevel);
    if (Number.isFinite(s.targetLevel)) setTargetLevel(s.targetLevel);
    if (Number.isFinite(s.charmCount)) setCharmCount(s.charmCount);
    if (Number.isFinite(s.ownedGuides)) setOwnedGuides(s.ownedGuides);
    if (Number.isFinite(s.ownedDesigns)) setOwnedDesigns(s.ownedDesigns);
    if (Number.isFinite(s.common)) setCommon(s.common);
    if (Number.isFinite(s.premium)) setPremium(s.premium);
    if (Number.isFinite(s.exquisite)) setExquisite(s.exquisite);
    if (Number.isFinite(s.majestic)) setMajestic(s.majestic);
    if (Number.isFinite(s.confidence)) setConfidence(s.confidence);
    if (s.individualTargets) setIndividualTargets(true);
    if (Array.isArray(s.targetCharms) && s.targetCharms.length === 18)
      setTargetCharms(s.targetCharms);
  }, []);
  const persistence = useToolPersistence({
    toolKey: "wavebound-charms",
    schemaVersion: 1,
    inputs,
    restore,
    migrate: migrateWaveboundState,
  });
  const change = (setter, value) => {
    persistence.markChanged();
    setter(value);
    setCalculated(false);
  };

  const costs = useMemo(() => {
    let guides = 0,
      designs = 0;
    if (individualTargets) {
      for (const charm of targetCharms)
        for (let level = charm.current + 1; level <= charm.target; level++) {
          guides += LEVEL_COSTS[level]?.[0] || 0;
          designs += LEVEL_COSTS[level]?.[1] || 0;
        }
    } else if (targetLevel > currentLevel) {
      for (let level = currentLevel + 1; level <= targetLevel; level++) {
        guides += LEVEL_COSTS[level][0];
        designs += LEVEL_COSTS[level][1];
      }
    }
    return individualTargets
      ? { guides, designs }
      : { guides: guides * charmCount, designs: designs * charmCount };
  }, [
    currentLevel,
    targetLevel,
    charmCount,
    individualTargets,
    targetCharms,
    LEVEL_COSTS,
  ]);
  const hasUpgrade = costs.guides > 0 || costs.designs > 0;

  const result = useMemo(() => {
    if (!hasUpgrade) return null;
    let plans = [];
    const maxCommonMerges = Math.floor(common / 3);
    for (let cm = 0; cm <= maxCommonMerges; cm++) {
      const premiumAvailable = premium + cm;
      const maxPremiumMerges = Math.floor(premiumAvailable / 3);
      for (let pm = 0; pm <= maxPremiumMerges; pm++) {
        const remainingCommon = common - cm * 3;
        const remainingPremium = premiumAvailable - pm * 3;
        const fixedGuides =
          ownedGuides +
          remainingPremium * r["premium.g"] +
          exquisite * r["exquisite.g"] +
          majestic * r["majestic.g"] +
          pm * r["exquisite.g"];
        const fixedDesigns =
          ownedDesigns +
          remainingCommon * r["common.d"] +
          remainingPremium * r["premium.d"] +
          exquisite * r["exquisite.d"] +
          majestic * r["majestic.d"] +
          pm * r["exquisite.d"];
        const needMajestic = Math.max(
          0,
          Math.ceil(
            (costs.guides - fixedGuides) / (r["majestic.g"] - r["exquisite.g"]),
          ),
          Math.ceil(
            (costs.designs - fixedDesigns) /
              (r["majestic.d"] - r["exquisite.d"]),
          ),
        );
        const success = probabilityAtLeast(pm, needMajestic);
        const expectedGuides =
          fixedGuides + pm * 0.25 * (r["majestic.g"] - r["exquisite.g"]);
        const expectedDesigns =
          fixedDesigns + pm * 0.25 * (r["majestic.d"] - r["exquisite.d"]);
        const expectedShards =
          exquisite * r["exquisite.shards"] +
          majestic * r["majestic.shards"] +
          pm * (0.75 * r["exquisite.shards"] + 0.25 * r["majestic.shards"]);
        const distribution = Array.from(
          { length: pm + 1 },
          (_, majesticCount) => ({
            majesticCount,
            probability: probabilityExactly(pm, majesticCount),
          }),
        );
        plans.push({
          cm,
          pm,
          remainingCommon,
          remainingPremium,
          needMajestic,
          success,
          expectedGuides,
          expectedDesigns,
          expectedShards,
          worstGuides: fixedGuides,
          worstDesigns: fixedDesigns,
          bestGuides: fixedGuides + pm * (r["majestic.g"] - r["exquisite.g"]),
          bestDesigns: fixedDesigns + pm * (r["majestic.d"] - r["exquisite.d"]),
          distribution,
          merges: cm + pm,
        });
      }
    }
    const feasible = plans.filter((p) => p.success + 1e-12 >= confidence);
    if (feasible.length) {
      feasible.sort(
        (a, b) =>
          a.merges - b.merges ||
          b.success - a.success ||
          b.expectedGuides +
            b.expectedDesigns -
            (a.expectedGuides + a.expectedDesigns),
      );
      return { ...feasible[0], feasible: true };
    }
    plans.sort((a, b) => b.success - a.success || b.merges - a.merges);
    return plans.length ? { ...plans[0], feasible: false } : null;
  }, [
    hasUpgrade,
    common,
    premium,
    exquisite,
    majestic,
    ownedGuides,
    ownedDesigns,
    costs,
    confidence,
    r,
  ]);
  const updateTargetCharm = (id, key, value) => {
    persistence.markChanged();
    setTargetCharms((items) =>
      items.map((item) =>
        item.id === id
          ? {
              ...item,
              [key]: key === "target" ? Math.max(item.current, value) : value,
              ...(key === "current" && item.target < value
                ? { target: value }
                : {}),
            }
          : item,
      ),
    );
    setCalculated(false);
  };
  const importCharmPlan = async () => {
    try {
      const response = await fetch("/api/tool-state/charm-pack-optimizer", {
        cache: "no-store",
      });
      const body = await response.json();
      const charms = body?.state?.inputs?.charms;
      if (!response.ok || !Array.isArray(charms) || charms.length !== 18)
        throw Error("No saved 18-charm plan was found.");
      setTargetCharms(
        charms.map(({ id, type, current, target }) => ({
          id,
          type,
          current,
          target,
        })),
      );
      setIndividualTargets(true);
      persistence.markChanged();
      setCalculated(false);
      setImportStatus(
        "Imported current and target levels from the Charm Pack planner.",
      );
    } catch (error) {
      setImportStatus(error.message);
    }
  };

  const field = (label, value, setter, min = 0, max = null) => (
    <label className="wo-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max ?? undefined}
        value={value}
        onChange={(e) =>
          change(setter, Math.max(min, Number(e.target.value) || 0))
        }
      />
    </label>
  );

  return (
    <section className="wavebound-tool">
      <SaveToRoadmap persistence={persistence} />
      <header className="wo-head">
        <span className="wo-eyebrow">Wavebound Voyage</span>
        <h2>Charm Merge Optimizer</h2>
        <p>
          Calculate how many Common and Premium Tidal Treasures to merge while
          accounting for the 75% Exquisite / 25% Majestic high-tier outcome.
        </p>
        <div className="wo-save-status" role="status">
          {persistence.message}
        </div>
      </header>

      <div className="wo-grid">
        <div className="wo-panel">
          <h3>Charm target</h3>
          <div className="wo-target-actions">
            <label>
              <input
                type="checkbox"
                checked={individualTargets}
                onChange={(event) =>
                  change(setIndividualTargets, event.target.checked)
                }
              />{" "}
              Use 18 individual charm targets
            </label>
            <button type="button" onClick={importCharmPlan}>
              Import from Charm planner
            </button>
          </div>
          {importStatus && (
            <p className="wo-import-status" role="status">
              {importStatus}
            </p>
          )}
          {individualTargets ? (
            <div className="wo-individual-targets">
              {targetCharms.map((charm) => (
                <div key={charm.id}>
                  <b>
                    {charm.type} {charm.id.split("-").at(-1)}
                  </b>
                  <label>
                    Current{" "}
                    <select
                      value={charm.current}
                      onChange={(event) =>
                        updateTargetCharm(
                          charm.id,
                          "current",
                          Number(event.target.value),
                        )
                      }
                    >
                      {Array.from({ length: 23 }, (_, level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Target{" "}
                    <select
                      value={charm.target}
                      onChange={(event) =>
                        updateTargetCharm(
                          charm.id,
                          "target",
                          Number(event.target.value),
                        )
                      }
                    >
                      {Array.from({ length: 23 }, (_, level) => (
                        <option key={level} value={level}>
                          {level}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>
          ) : (
            <div className="wo-fields three">
              <label className="wo-field">
                <span>Current level</span>
                <select
                  value={currentLevel}
                  onChange={(e) =>
                    change(setCurrentLevel, Number(e.target.value))
                  }
                >
                  {Array.from({ length: 23 }, (_, i) => (
                    <option key={i} value={i}>
                      Level {i}
                    </option>
                  ))}
                </select>
              </label>
              <label className="wo-field">
                <span>Target level</span>
                <select
                  value={targetLevel}
                  onChange={(e) =>
                    change(setTargetLevel, Number(e.target.value))
                  }
                >
                  {Array.from({ length: 23 }, (_, i) => (
                    <option key={i} value={i}>
                      Level {i}
                    </option>
                  ))}
                </select>
              </label>
              {field(
                "Charms upgrading",
                charmCount,
                (v) => setCharmCount(Math.min(18, v)),
                1,
                18,
              )}
            </div>
          )}

          <h3>Materials owned</h3>
          <div className="wo-fields">
            {field("Charm Guides", ownedGuides, setOwnedGuides)}
            {field("Charm Designs", ownedDesigns, setOwnedDesigns)}
          </div>

          <h3>Tidal Treasures</h3>
          <div className="wo-fields">
            {field("Common", common, setCommon)}
            {field("Premium", premium, setPremium)}
            {field("Exquisite", exquisite, setExquisite)}
            {field("Majestic", majestic, setMajestic)}
          </div>

          <h3>Planning confidence</h3>
          <label className="wo-field">
            <span>Minimum chance of reaching the target</span>
            <select
              value={confidence}
              onChange={(e) => change(setConfidence, Number(e.target.value))}
            >
              <option value={0.5}>50%</option>
              <option value={0.75}>75%</option>
              <option value={0.9}>90%</option>
              <option value={0.95}>95%</option>
              <option value={0.99}>99%</option>
              <option value={1}>100% / worst-case</option>
            </select>
          </label>
          <button className="wo-button" onClick={() => setCalculated(true)}>
            Optimize merges
          </button>
        </div>

        <div className="wo-panel wo-result">
          <h3>Recommended plan</h3>
          {!calculated && (
            <div className="wo-empty">
              Enter your inventory, then optimize the merge plan.
            </div>
          )}
          {calculated && !hasUpgrade && (
            <div className="wo-alert bad">
              Target level must be higher than current level.
            </div>
          )}
          {calculated && result && hasUpgrade && (
            <>
              <div className={`wo-alert ${result.feasible ? "good" : "bad"}`}>
                {result.feasible
                  ? `Minimum merge plan found at ${(result.success * 100).toFixed(result.success === 1 ? 0 : 1)}% modeled success.`
                  : `Current chest inventory cannot reach the selected confidence. Showing the strongest available plan.`}
              </div>
              <div className="wo-metrics">
                <div>
                  <span>Guides required</span>
                  <strong>
                    {fmt(Math.max(0, costs.guides - ownedGuides))}
                  </strong>
                </div>
                <div>
                  <span>Designs required</span>
                  <strong>
                    {fmt(Math.max(0, costs.designs - ownedDesigns))}
                  </strong>
                </div>
                <div>
                  <span>Common merges</span>
                  <strong>{result.cm}</strong>
                </div>
                <div>
                  <span>Premium merges</span>
                  <strong>{result.pm}</strong>
                </div>
              </div>
              <ol className="wo-steps">
                <li>
                  <strong>Common → Premium:</strong> merge {result.cm * 3}{" "}
                  Common chests into {result.cm} Premium chest
                  {result.cm === 1 ? "" : "s"}.
                </li>
                <li>
                  <strong>Premium → High Tier:</strong> merge {result.pm * 3}{" "}
                  Premium chests into {result.pm} Exquisite/Majestic result
                  {result.pm === 1 ? "" : "s"}.
                </li>
                <li>
                  <strong>Open remaining:</strong> {result.remainingCommon}{" "}
                  Common and {result.remainingPremium} Premium, plus all
                  existing and newly-created high-tier chests.
                </li>
              </ol>
              <p className="wo-note">
                Unused Common and Premium chests remain unmerged because another
                three-chest merge would not improve the minimum plan at your
                selected confidence. They are still opened and included in the
                material projection above.
              </p>
              <div className="wo-projection">
                <div>
                  <span>Success chance</span>
                  <strong>
                    {(result.success * 100).toFixed(
                      result.success === 1 ? 0 : 1,
                    )}
                    %
                  </strong>
                </div>
                <div>
                  <span>Expected Guides</span>
                  <strong>{fmt(result.expectedGuides)}</strong>
                </div>
                <div>
                  <span>Expected Designs</span>
                  <strong>{fmt(result.expectedDesigns)}</strong>
                </div>
                <div>
                  <span>Expected Mythic Shards</span>
                  <strong>{fmt(result.expectedShards)}</strong>
                </div>
              </div>
              <div className="wo-range">
                <strong>Possible material range</strong>
                <span>
                  Guaranteed if every result is Exquisite:{" "}
                  {fmt(result.worstGuides)} Guides · {fmt(result.worstDesigns)}{" "}
                  Designs
                </span>
                <span>
                  Expected: {fmt(result.expectedGuides)} Guides ·{" "}
                  {fmt(result.expectedDesigns)} Designs
                </span>
                <span>
                  Best case if every result is Majestic:{" "}
                  {fmt(result.bestGuides)} Guides · {fmt(result.bestDesigns)}{" "}
                  Designs
                </span>
              </div>
              <details className="wo-distribution">
                <summary>Outcome probability distribution</summary>
                {result.distribution.map((row) => (
                  <div key={row.majesticCount}>
                    <span>
                      {row.majesticCount} Majestic /{" "}
                      {result.pm - row.majesticCount} Exquisite
                    </span>
                    <b>{(row.probability * 100).toFixed(2)}%</b>
                  </div>
                ))}
              </details>
              <p className="wo-note">
                A Premium merge needs 3 Premium chests. Each merged result is
                75% Exquisite and 25% Majestic. The calculator models Majestic
                outcomes with a binomial probability and treats 100% confidence
                as requiring the target even if every high-tier result is
                Exquisite.
              </p>
            </>
          )}
        </div>
      </div>

      <style jsx>{`
        .wavebound-tool {
          border: 1px solid rgba(102, 188, 222, 0.25);
          background: linear-gradient(180deg, #0e2331, #091822);
          border-radius: 18px;
          padding: 22px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.28);
        }
        .wo-head {
          margin-bottom: 18px;
        }
        .wo-eyebrow {
          font-size: 10px;
          letter-spacing: 0.18em;
          text-transform: uppercase;
          color: #68d9ff;
          font-weight: 900;
        }
        .wo-head h2 {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 34px;
          margin: 6px 0;
          color: #edf8ff;
          font-weight: 500;
        }
        .wo-head p {
          color: #8ea9b9;
          max-width: 760px;
          line-height: 1.6;
          font-size: 13px;
          margin: 0;
        }
        .wo-save-status {
          margin-top: 10px;
          color: #b7cbd6;
          font-size: 11px;
        }
        .wo-target-actions {
          display: flex;
          justify-content: space-between;
          gap: 10px;
          align-items: center;
          margin-bottom: 10px;
          color: #bdd1dc;
          font-size: 11px;
        }
        .wo-target-actions button {
          border: 1px solid #2a6078;
          background: #102c3b;
          color: #68d9ff;
          border-radius: 7px;
          padding: 7px 9px;
        }
        .wo-import-status {
          color: #9cc9dc;
          font-size: 10px;
        }
        .wo-individual-targets {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 6px;
          max-height: 320px;
          overflow: auto;
        }
        .wo-individual-targets > div {
          display: grid;
          grid-template-columns: 1fr auto auto;
          gap: 6px;
          align-items: center;
          border: 1px solid #1d4255;
          padding: 7px;
          font-size: 9px;
        }
        .wo-individual-targets label {
          display: grid;
          gap: 2px;
          color: #8ea9b9;
        }
        .wo-individual-targets select {
          padding: 4px;
          background: #07151e;
          color: #edf8ff;
          border: 1px solid #2a6078;
        }
        .wo-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 16px;
        }
        .wo-panel {
          border: 1px solid #21485d;
          background: #0a1a25;
          border-radius: 14px;
          padding: 17px;
        }
        .wo-panel h3 {
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.12em;
          color: #bdd1dc;
          margin: 4px 0 10px;
        }
        .wo-panel h3:not(:first-child) {
          margin-top: 18px;
        }
        .wo-fields {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 9px;
        }
        .wo-fields.three {
          grid-template-columns: repeat(3, 1fr);
        }
        .wo-field {
          display: flex;
          flex-direction: column;
          gap: 5px;
          color: #9db5c3;
          font-size: 11px;
          font-weight: 700;
        }
        .wo-field input,
        .wo-field select {
          width: 100%;
          border: 1px solid #28536a;
          border-radius: 9px;
          background: #06141d;
          color: #edf8ff;
          padding: 10px;
          font: inherit;
          font-size: 13px;
        }
        .wo-field input:focus,
        .wo-field select:focus {
          outline: 2px solid rgba(104, 217, 255, 0.3);
          border-color: #68d9ff;
        }
        .wo-button {
          width: 100%;
          margin-top: 16px;
          border: 0;
          border-radius: 10px;
          padding: 12px 14px;
          background: linear-gradient(135deg, #65d8ff, #a1ecff);
          color: #04121a;
          font-weight: 900;
          cursor: pointer;
        }
        .wo-empty {
          display: grid;
          place-items: center;
          min-height: 300px;
          color: #68879a;
          text-align: center;
          border: 1px dashed #25485b;
          border-radius: 12px;
          padding: 20px;
        }
        .wo-alert {
          padding: 11px 12px;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 800;
          margin-bottom: 12px;
        }
        .wo-alert.good {
          color: #aaf3cf;
          background: rgba(90, 220, 156, 0.08);
          border: 1px solid rgba(90, 220, 156, 0.25);
        }
        .wo-alert.bad {
          color: #ffc4b5;
          background: rgba(255, 130, 100, 0.08);
          border: 1px solid rgba(255, 130, 100, 0.24);
        }
        .wo-metrics,
        .wo-projection {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 8px;
        }
        .wo-metrics > div,
        .wo-projection > div {
          border: 1px solid #1d4255;
          border-radius: 10px;
          background: #07151e;
          padding: 11px;
        }
        .wo-metrics span,
        .wo-projection span {
          display: block;
          color: #7898aa;
          font-size: 9px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
        }
        .wo-metrics strong,
        .wo-projection strong {
          display: block;
          margin-top: 4px;
          color: #eef9ff;
          font-size: 20px;
        }
        .wo-steps {
          padding-left: 20px;
          color: #a2b8c4;
          font-size: 12px;
          line-height: 1.65;
          margin: 16px 0;
        }
        .wo-steps strong {
          color: #dcecf4;
        }
        .wo-range {
          display: grid;
          gap: 5px;
          margin-top: 12px;
          padding: 11px;
          border: 1px solid #1d4255;
          color: #8ea9b9;
          font-size: 11px;
        }
        .wo-range strong {
          color: #dcecf4;
        }
        .wo-distribution {
          margin-top: 12px;
          color: #9db5c3;
          font-size: 11px;
        }
        .wo-distribution summary {
          cursor: pointer;
          color: #68d9ff;
        }
        .wo-distribution div {
          display: flex;
          justify-content: space-between;
          padding: 5px 0;
          border-bottom: 1px solid #1d4255;
        }
        .wo-distribution b {
          color: #edf8ff;
        }
        .wo-note {
          color: #6f8b9b;
          font-size: 10px;
          line-height: 1.55;
          margin: 12px 0 0;
        }
        @media (max-width: 900px) {
          .wo-grid {
            grid-template-columns: 1fr;
          }
        }
        @media (max-width: 620px) {
          .wavebound-tool {
            padding: 14px;
          }
          .wo-fields,
          .wo-fields.three {
            grid-template-columns: 1fr;
          }
          .wo-head h2 {
            font-size: 28px;
          }
        }
      `}</style>
    </section>
  );
}

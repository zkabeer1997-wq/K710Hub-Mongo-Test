"use client";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import { CHARM_COSTS } from "../../lib/charmToolData.mjs";
import {
  calculateGovernorGearPlan,
  calculateHeroGearPlan,
  calculateMasterPlan,
  calculatePetProgression,
  planTtgProduction,
  rankCharmUpgrades,
} from "../../lib/progressionPhase2.mjs";
import {
  GOVERNOR_GEAR_LEVELS,
  MASTER_DATA,
  MASTERS,
  PETS,
} from "../../lib/phase2Data.mjs";
import { useToolPersistence } from "../../lib/useToolPersistence";
import styles from "./Phase2Planner.module.css";

const number = (value) => Math.max(0, Number(value) || 0);
const fmt = (value) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
const inventoryKeys = ["food", "manuals", "potions", "medallions"];
const optimizerProfiles = {
  growth: { Infantry: 2.2, Cavalry: 0.6, Archer: 2.1 },
  combat: { Infantry: 2.2, Cavalry: 1.6, Archer: 1.9 },
  future: { Infantry: 2.6, Cavalry: 1.6, Archer: 1.8 },
  unweighted: { Infantry: 1, Cavalry: 1, Archer: 1 },
};
const heroGearProfiles = {
  growth: {
    "Infantry.Health": 1.5,
    "Infantry.Lethality": 0.7,
    "Cavalry.Health": 0.2,
    "Cavalry.Lethality": 0.4,
    "Archer.Health": 0.7,
    "Archer.Lethality": 1.4,
  },
  combat: {
    "Infantry.Health": 1.5,
    "Infantry.Lethality": 0.7,
    "Cavalry.Health": 0.4,
    "Cavalry.Lethality": 1.2,
    "Archer.Health": 0.6,
    "Archer.Lethality": 1.3,
  },
  future: {
    "Infantry.Health": 1.5,
    "Infantry.Lethality": 1.1,
    "Cavalry.Health": 0.4,
    "Cavalry.Lethality": 1.2,
    "Archer.Health": 0.6,
    "Archer.Lethality": 1.2,
  },
  unweighted: Object.fromEntries(
    ["Infantry", "Cavalry", "Archer"].flatMap((troop) =>
      ["Health", "Lethality"].map((stat) => [`${troop}.${stat}`, 1]),
    ),
  ),
};
const defaultCharms = ["Infantry", "Cavalry", "Archer"].flatMap((type) =>
  Array.from({ length: 6 }, (_, index) => ({
    id: `${type.toLowerCase()}-${index + 1}`,
    type,
    number: index + 1,
    current: 0,
    target: 22,
  })),
);
const heroPieces = ["Helmet", "Gloves", "Chest", "Boots"];
const governorPieces = ["Helmet", "Chest", "Ring", "Staff", "Pants", "Boots"];

function ExportButton({ name, data }) {
  const download = () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <button className={styles.button} type="button" onClick={download}>
      Export plan
    </button>
  );
}
function SaveState({ persistence }) {
  return (
    <p className={styles.save} aria-live="polite">
      {persistence.message}
    </p>
  );
}
function Field({
  label,
  value,
  onChange,
  type = "number",
  children,
  hint,
  ...props
}) {
  return (
    <label>
      {label}
      {children || (
        <input
          type={type}
          value={value}
          onChange={(event) =>
            onChange(
              type === "number"
                ? number(event.target.value)
                : event.target.value,
            )
          }
          {...props}
        />
      )}
      {hint ? <span className={styles.hint}>{hint}</span> : null}
    </label>
  );
}

function PlannerGuide({ steps, note }) {
  return (
    <div className={styles.guide}>
      <h2>Start here</h2>
      <ol>
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
      {note ? <p>{note}</p> : null}
    </div>
  );
}

function InputSummary({ items }) {
  return (
    <div className={styles.inputSummary} aria-label="Current input summary">
      <span className={styles.summaryTitle}>Your inputs</span>
      <div className={styles.summaryItems}>
        {items.map(({ label, value }) => (
          <span className={styles.summaryItem} key={label}>
            <small>{label}</small>
            <strong>{value}</strong>
          </span>
        ))}
      </div>
    </div>
  );
}

function SectionHeading({ title, description }) {
  return (
    <header className={styles.sectionHeading}>
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </header>
  );
}

function AdvancedSettings({ title = "Advanced settings", children }) {
  return (
    <details className={styles.advanced}>
      <summary>{title}</summary>
      <div className={styles.advancedBody}>{children}</div>
    </details>
  );
}

export function TtgProductionPlanner({
  importedTrueGold = 0,
  importedTempered = 0,
}) {
  const [inputs, setInputs] = useState({
    trueGold: importedTrueGold,
    temperedTrueGold: 0,
    dailyIncome: 0,
    reserve: 0,
    refinementState: 1,
    completedToday: 0,
    refinementsPerDay: 1,
    startWeekday: new Date().getDay(),
    horizonDays: 7,
    requiredTrueGold: importedTrueGold,
    requiredTempered: importedTempered,
    targetDate: "",
    startDate: new Date().toISOString().slice(0, 10),
    riskMode: "conservative",
  });
  const restore = useCallback(
    (saved) => setInputs((current) => ({ ...current, ...saved })),
    [],
  );
  const persistence = useToolPersistence({
    toolKey: "ttg-production",
    schemaVersion: 1,
    inputs,
    restore,
    autoDetect: true,
  });
  const update = (key, value) =>
    setInputs((current) => ({ ...current, [key]: value }));
  const result = useMemo(() => planTtgProduction(inputs), [inputs]);
  return (
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <SaveState persistence={persistence} />
        <PlannerGuide
          steps={[
            "Enter the True Gold you have now and the amount you refuse to spend.",
            "Set today’s refinement attempt, your daily limit, and the TTG your building or research plan needs.",
            "Read the daily schedule on the right; extend the horizon if the target says Beyond horizon.",
          ]}
          note="The planner protects both your reserve and any True Gold required by the selected construction plan."
        />
        <InputSummary
          items={[
            { label: "True Gold", value: fmt(inputs.trueGold) },
            { label: "Tempered", value: fmt(inputs.temperedTrueGold) },
            { label: "Target", value: `${fmt(inputs.requiredTempered)} TTG` },
            { label: "Window", value: `${inputs.horizonDays} days` },
          ]}
        />
        <div className={styles.section}>
          <SectionHeading
            title="Inventory and safeguards"
            description="Start with what you own and the True Gold that must stay untouched."
          />
          <div className={styles.grid}>
            <Field
              label="Current True Gold"
              value={inputs.trueGold}
              onChange={(v) => update("trueGold", v)}
            />
            <Field
              label="Current Tempered True Gold"
              value={inputs.temperedTrueGold}
              onChange={(v) => update("temperedTrueGold", v)}
            />
            <Field
              label="Daily True Gold income"
              value={inputs.dailyIncome}
              onChange={(v) => update("dailyIncome", v)}
            />
            <Field
              label="Protected TG reserve"
              value={inputs.reserve}
              onChange={(v) => update("reserve", v)}
            />
            <Field
              label="Next weekly refinement attempt"
              value={inputs.refinementState}
              onChange={(v) => update("refinementState", v)}
              min="1"
              max="100"
              hint="Use 1 if you have not refined since Monday; otherwise enter the next attempt number."
            />
            <Field
              label="Completed today"
              value={inputs.completedToday}
              onChange={(v) => update("completedToday", v)}
            />
            <Field
              label="Refinements per day"
              value={inputs.refinementsPerDay}
              onChange={(v) => update("refinementsPerDay", Math.max(1, v))}
            />
            <Field
              label="Starting weekday"
              value={inputs.startWeekday}
              onChange={() => {}}
            >
              <select
                value={inputs.startWeekday}
                onChange={(e) => update("startWeekday", Number(e.target.value))}
              >
                {[
                  "Sunday",
                  "Monday",
                  "Tuesday",
                  "Wednesday",
                  "Thursday",
                  "Friday",
                  "Saturday",
                ].map((day, index) => (
                  <option key={day} value={index}>
                    {day}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </div>
        <div className={styles.section}>
          <SectionHeading
            title="Plan target"
            description="Define the deadline and materials this schedule must cover."
          />
          <div className={styles.grid}>
            <Field
              label="Planning horizon (days)"
              value={inputs.horizonDays}
              onChange={(v) => update("horizonDays", v)}
              min="1"
            />
            <Field
              label="Plan start date"
              type="date"
              value={inputs.startDate}
              onChange={(v) => update("startDate", v)}
            />
            <Field
              label="Required True Gold"
              value={inputs.requiredTrueGold}
              onChange={(v) => update("requiredTrueGold", v)}
            />
            <Field
              label="Required Tempered TG"
              value={inputs.requiredTempered}
              onChange={(v) => update("requiredTempered", v)}
            />
            <Field
              label="Target completion date"
              type="date"
              value={inputs.targetDate}
              onChange={(v) => update("targetDate", v)}
            />
            <Field
              label="Risk mode"
              value={inputs.riskMode}
              onChange={(v) => update("riskMode", v)}
            >
              <select
                value={inputs.riskMode}
                onChange={(e) => update("riskMode", e.target.value)}
              >
                <option value="guaranteed">Guaranteed</option>
                <option value="conservative">Conservative</option>
                <option value="expected">Expected</option>
              </select>
            </Field>
          </div>
        </div>
      </section>
      <aside className={styles.result}>
        <h2>Production schedule</h2>
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <span>Imported TG need</span>
            <b>{fmt(inputs.requiredTrueGold)}</b>
          </div>
          <div className={styles.metric}>
            <span>Imported TTG need</span>
            <b>{fmt(inputs.requiredTempered)}</b>
          </div>
          <div className={styles.metric}>
            <span>Projected TTG</span>
            <b>{fmt(result.finalTempered)}</b>
          </div>
          <div className={styles.metric}>
            <span>Earliest target day</span>
            <b>{result.earliestDate || "Beyond horizon"}</b>
          </div>
        </div>
        <p className={styles.note}>
          The first refinement each day is half-cost. Attempt tiers reset every
          Monday and stop at the weekly 100-attempt cap.
        </p>
        <p className={styles.note}>
          Confidence range: {fmt(result.confidence?.p10)}–
          {fmt(result.confidence?.p90)} TTG (10th–90th percentile).
        </p>
        {inputs.requiredTempered > result.finalTempered ? (
          <p className={styles.status}>
            This target is not reachable inside the current horizon. Increase
            the planning days, daily refinements, or available True Gold.
          </p>
        ) : null}
        <ol className={styles.list}>
          {result.schedule?.map((day) => (
            <li key={day.day}>
              Day {day.day}: {day.runs} refinement{day.runs === 1 ? "" : "s"},
              spend {fmt(day.trueGoldSpent)} TG, produce{" "}
              {fmt(day.temperedProduced)} TTG ({fmt(day.range.min)}–
              {fmt(day.range.max)}), {fmt(day.trueGoldRemaining)} TG remaining
            </li>
          ))}
        </ol>
        <ExportButton name="ttg-production-plan" data={result} />
      </aside>
    </div>
  );
}

export function PetProgressionPlanner({ memberId = "" }) {
  const [inputs, setInputs] = useState({
    pet: PETS[0].name,
    generation: 1,
    currentLevel: 1,
    targetLevel: 1,
    currentAdvancement: 0,
    targetAdvancement: 0,
    budget: 0,
    deadline: "",
    inventory: Object.fromEntries(inventoryKeys.map((key) => [key, 0])),
  });
  const restore = useCallback(
    (saved) =>
      setInputs((current) => ({
        ...current,
        ...saved,
        inventory: { ...current.inventory, ...saved.inventory },
      })),
    [],
  );
  const persistence = useToolPersistence({
    toolKey: "pet-progression",
    schemaVersion: 1,
    inputs,
    restore,
    autoDetect: true,
  });
  const update = (key, value) =>
    setInputs((current) => ({ ...current, [key]: value }));
  const result = useMemo(() => calculatePetProgression(inputs), [inputs]);
  const packQuery = new URLSearchParams(
    [
      ...Object.entries(result.shortfall || {}),
      ...(memberId ? [["member_id", memberId]] : []),
    ].map(([key, value]) => [key, String(value)]),
  ).toString();
  return (
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <SaveState persistence={persistence} />
        <PlannerGuide
          steps={[
            "Choose the pet, then enter its current and desired levels.",
            "Add the Food, Manuals, Potions, and Medallions already in your bag.",
            "Use the roadmap and shortfall on the right, or send the missing materials to the Pet Pack Optimizer.",
          ]}
          note="Advancement materials are included automatically when the level path crosses an advancement milestone."
        />
        <InputSummary
          items={[
            { label: "Pet", value: inputs.pet },
            { label: "Current", value: `Level ${inputs.currentLevel}` },
            { label: "Target", value: `Level ${inputs.targetLevel}` },
            { label: "Reachable", value: `Level ${result.reachableLevel}` },
          ]}
        />
        <div className={styles.section}>
          <SectionHeading
            title="Pet target"
            description="Choose one pet and the exact level range you want to plan."
          />
          <div className={styles.grid}>
            <Field label="Pet name/type" value={inputs.pet} onChange={() => {}}>
              <select
                value={inputs.pet}
                onChange={(e) => {
                  const pet = PETS.find((item) => item.name === e.target.value);
                  setInputs((c) => ({
                    ...c,
                    pet: pet.name,
                    generation: pet.generation,
                    targetLevel: Math.min(c.targetLevel, pet.maxLevel),
                  }));
                }}
              >
                {PETS.map((pet) => (
                  <option key={pet.name}>{pet.name}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Generation"
              value={inputs.generation}
              onChange={() => {}}
            >
              <input value={inputs.generation} readOnly />
            </Field>
            <Field
              label="Current level"
              value={inputs.currentLevel}
              onChange={(v) => update("currentLevel", v)}
              min="1"
            />
            <Field
              label="Target level"
              value={inputs.targetLevel}
              onChange={(v) => update("targetLevel", v)}
              min="1"
            />
          </div>
        </div>
        <div className={styles.section}>
          <SectionHeading
            title="Current materials"
            description="Enter only the materials currently available in your bag."
          />
          <div className={styles.grid}>
            {inventoryKeys.map((key) => (
              <Field
                key={key}
                label={key}
                value={inputs.inventory[key]}
                onChange={(v) =>
                  setInputs((current) => ({
                    ...current,
                    inventory: { ...current.inventory, [key]: v },
                  }))
                }
              />
            ))}
          </div>
        </div>
      </section>
      <aside className={styles.result}>
        <h2>Progression roadmap</h2>
        <div className={styles.metrics}>
          {inventoryKeys.map((key) => (
            <div className={styles.metric} key={key}>
              <span>{key} needed / short</span>
              <b>
                {fmt(result.totals[key])} / {fmt(result.shortfall[key])}
              </b>
            </div>
          ))}
        </div>
        <p className={styles.note}>
          {result.steps.length} level steps · reachable now: level{" "}
          {result.reachableLevel} · Advanced Chests needed:{" "}
          {fmt(result.advancedChestEquivalents)} (
          {fmt(result.advancedChestAllocation?.manuals)} Manuals /{" "}
          {fmt(result.advancedChestAllocation?.potions)} Potions /{" "}
          {fmt(result.advancedChestAllocation?.medallions)} Medallions).
        </p>
        {!result.steps.length ? (
          <p className={styles.status}>
            Choose a target level above the current level to create a roadmap.
          </p>
        ) : null}
        <ol className={styles.list}>
          {result.steps.map((step) => (
            <li key={step.toLevel}>
              Level {step.fromLevel} → {step.toLevel}: {fmt(step.food)} Food
              {step.manuals ? ` · ${step.manuals} Manuals` : ""}
              {step.potions ? ` · ${step.potions} Potions` : ""}
              {step.medallions ? ` · ${step.medallions} Medallions` : ""}
            </li>
          ))}
        </ol>
        <Link
          className={styles.link}
          href={`/tools/pet-pack-optimizer${packQuery ? `?${packQuery}` : ""}`}
        >
          Send shortfall to Pet Pack Optimizer
        </Link>
        <ExportButton name="pet-progression-plan" data={result} />
      </aside>
    </div>
  );
}

export function CharmStatPlanner({ memberId = "" }) {
  const [inputs, setInputs] = useState({
    charms: defaultCharms,
    guides: 0,
    designs: 0,
    optimizationGoal: "stats",
    profile: "growth",
    amplification: 1.25,
    troopWeights: optimizerProfiles.growth,
    statWeights: { Health: 1, Lethality: 1 },
    minimumBalance: 0,
  });
  const restore = useCallback(
    (saved) => setInputs((current) => ({ ...current, ...saved })),
    [],
  );
  const persistence = useToolPersistence({
    toolKey: "governor-charm-stats",
    schemaVersion: 1,
    inputs,
    restore,
    autoDetect: true,
  });
  const ranked = useMemo(
    () =>
      rankCharmUpgrades(
        inputs.charms,
        CHARM_COSTS,
        { guides: inputs.guides, designs: inputs.designs },
        {
          troops: inputs.troopWeights,
          stats: inputs.statWeights,
          amplification: inputs.amplification,
          mode: inputs.optimizationGoal,
        },
        { minimumBalance: inputs.minimumBalance },
      ),
    [inputs],
  );
  const updateCharm = (id, key, value) =>
    setInputs((current) => ({
      ...current,
      charms: current.charms.map((item) =>
        item.id === id
          ? {
              ...item,
              [key]: value,
              ...(key === "current" && value > item.target
                ? { target: value }
                : {}),
            }
          : item,
      ),
    }));
  return (
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <SaveState persistence={persistence} />
        <PlannerGuide
          steps={[
            "Enter the Charm Guides and Designs you can spend.",
            "Choose a build profile, then set each charm’s current and target level.",
            "Follow the ordered upgrades on the right; the sequence never spends more materials than you entered.",
          ]}
          note="Each charm raises Health and Lethality together. Profiles are priorities, not game rules, and every weight remains editable."
        />
        <InputSummary
          items={[
            { label: "Guides", value: fmt(inputs.guides) },
            { label: "Designs", value: fmt(inputs.designs) },
            { label: "Profile", value: inputs.profile.replaceAll("-", " ") },
            { label: "Reachable", value: `${ranked.upgrades.length} upgrades` },
          ]}
        />
        <div className={styles.section}>
          <SectionHeading
            title="Resources and build profile"
            description="Set your spendable inventory, then choose the profile that represents your priorities."
          />
          <div className={styles.grid}>
            <Field
              label="Available Guides"
              value={inputs.guides}
              onChange={(v) => setInputs((c) => ({ ...c, guides: v }))}
            />
            <Field
              label="Available Designs"
              value={inputs.designs}
              onChange={(v) => setInputs((c) => ({ ...c, designs: v }))}
            />
            <Field
              label="Optimization goal"
              value={inputs.optimizationGoal}
              onChange={() => {}}
            >
              <select
                value={inputs.optimizationGoal}
                onChange={(e) =>
                  setInputs((c) => ({ ...c, optimizationGoal: e.target.value }))
                }
              >
                <option value="stats">Optimize stats</option>
                <option value="events">Optimize events</option>
              </select>
            </Field>
            <Field
              label="Build profile"
              value={inputs.profile}
              onChange={() => {}}
            >
              <select
                value={inputs.profile}
                onChange={(e) => {
                  const profile = e.target.value;
                  setInputs((c) => ({
                    ...c,
                    profile,
                    troopWeights: optimizerProfiles[profile] || c.troopWeights,
                  }));
                }}
              >
                <option value="growth">Early Game Growth</option>
                <option value="combat">Early Game Combat</option>
                <option value="future">Future-proofed</option>
                <option value="unweighted">Unweighted</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
          </div>
          <AdvancedSettings title="Advanced priority controls">
            <div className={styles.grid}>
              <Field
                label="Minimum balance constraint"
                value={inputs.minimumBalance}
                onChange={(v) =>
                  setInputs((c) => ({ ...c, minimumBalance: v }))
                }
                hint="Keep every included charm at least this level before specializing. Leave 0 for no minimum."
              />
              <Field
                label="Amplification factor"
                value={inputs.amplification}
                onChange={(v) => setInputs((c) => ({ ...c, amplification: v }))}
                step="0.05"
                min="1"
                max="2"
                hint="Strengthens the difference between troop priorities. 1 means no amplification."
              />
              {Object.keys(inputs.troopWeights).map((key) => (
                <Field
                  key={key}
                  label={`${key} weight`}
                  value={inputs.troopWeights[key]}
                  onChange={(v) =>
                    setInputs((c) => ({
                      ...c,
                      profile: "custom",
                      troopWeights: { ...c.troopWeights, [key]: v },
                    }))
                  }
                />
              ))}
              {Object.keys(inputs.statWeights).map((key) => (
                <Field
                  key={key}
                  label={`${key} weight`}
                  value={inputs.statWeights[key]}
                  onChange={(v) =>
                    setInputs((c) => ({
                      ...c,
                      statWeights: { ...c.statWeights, [key]: v },
                    }))
                  }
                />
              ))}
            </div>
          </AdvancedSettings>
        </div>
        <div className={styles.section}>
          <SectionHeading
            title="Charm levels"
            description="Work through one troop type at a time. Every charm raises Health and Lethality together."
          />
          <div className={styles.groupGrid}>
            {["Infantry", "Cavalry", "Archer"].map((troop) => (
              <section className={styles.equipmentGroup} key={troop}>
                <h3>{troop}</h3>
                {inputs.charms
                  .filter((charm) => charm.type === troop)
                  .map((charm) => (
                    <div className={styles.compactRow} key={charm.id}>
                      <strong>Charm {charm.number}</strong>
                      <Field
                        label="Current"
                        value={charm.current}
                        onChange={(v) =>
                          updateCharm(charm.id, "current", Math.min(22, v))
                        }
                      />
                      <Field
                        label="Target"
                        value={charm.target}
                        onChange={(v) =>
                          updateCharm(
                            charm.id,
                            "target",
                            Math.max(charm.current, Math.min(22, v)),
                          )
                        }
                      />
                    </div>
                  ))}
              </section>
            ))}
          </div>
        </div>
      </section>
      <aside className={styles.result}>
        <h2>Recommended upgrade sequence</h2>
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <span>Upgrades reachable</span>
            <b>{ranked.upgrades.length}</b>
          </div>
          <div className={styles.metric}>
            <span>Guides / Designs left</span>
            <b>
              {fmt(ranked.remaining.guides)} / {fmt(ranked.remaining.designs)}
            </b>
          </div>
        </div>
        {ranked.upgrades.length ? (
          <ol className={styles.list}>
            {ranked.upgrades.map((item) => (
              <li key={`${item.id}-${item.level}`}>
                {item.type} #{item.number} → level {item.level} · {item.guides}{" "}
                Guides · {item.designs} Designs
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.note}>
            Enter inventory and targets to build an exact material-feasible
            sequence.
          </p>
        )}
        <p className={styles.note}>
          Every charm upgrade raises both Health and Lethality; recommendations
          rank combined stat gain per material.
        </p>
        <p className={styles.note}>
          Gain: +{fmt(ranked.totals.health)} Health, +
          {fmt(ranked.totals.lethality)} Lethality, +{fmt(ranked.totals.power)}{" "}
          Power · weighted efficiency {fmt(ranked.totals.weightedValue)}.
        </p>
        {ranked.next ? (
          <p className={styles.note}>
            Bottleneck: next {ranked.next.type} #{ranked.next.number} level{" "}
            {ranked.next.level} needs {ranked.next.guides} Guides and{" "}
            {ranked.next.designs} Designs.
          </p>
        ) : null}
        <Link
          className={styles.link}
          href={`/tools/charm-pack-optimizer${memberId ? `?member_id=${encodeURIComponent(memberId)}` : ""}`}
        >
          Build required pack schedule
        </Link>
        <ExportButton name="charm-upgrade-plan" data={ranked} />
      </aside>
    </div>
  );
}

function EquipmentRows({ rows, setRows, hero = false, showTarget = true }) {
  const groups = hero
    ? ["Infantry", "Cavalry", "Archer"].map((troop) => ({
        name: troop,
        rows: rows
          .map((row, index) => ({ row, index }))
          .filter(({ row }) => row.label.startsWith(troop)),
      }))
    : [
        {
          name: "Governor Gear",
          rows: rows.map((row, index) => ({ row, index })),
        },
      ];
  return (
    <div className={styles.section}>
      <SectionHeading
        title={hero ? "Hero gear" : "Governor Gear"}
        description={
          hero
            ? "Enter the four equipped pieces for each troop type."
            : "Enter all six pieces; target tiers appear only in target-planning mode."
        }
      />
      <div className={hero ? styles.groupGrid : styles.singleGroup}>
        {groups.map((group) => (
          <section className={styles.equipmentGroup} key={group.name}>
            <h3>{group.name}</h3>
            {group.rows.map(({ row, index }) => (
              <div className={styles.compactRow} key={row.id}>
                <strong>{row.label}</strong>
                <Field
                  label="Rarity / tier"
                  type="select"
                  value={row.tier}
                  onChange={() => {}}
                >
                  {hero ? (
                    <select
                      value={row.tier}
                      onChange={(e) =>
                        setRows((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, tier: e.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="Epic">Epic</option>
                      <option value="Mythic">Mythic</option>
                      <option value="Red">Red</option>
                    </select>
                  ) : (
                    <select
                      value={row.tier}
                      onChange={(e) =>
                        setRows((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, tier: e.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">None</option>
                      {GOVERNOR_GEAR_LEVELS.map((item) => (
                        <option key={item.index} value={item.tier}>
                          {item.tier}
                        </option>
                      ))}
                    </select>
                  )}
                </Field>
                {hero ? (
                  <>
                    <Field
                      label="Enhancement"
                      value={row.enhancement}
                      onChange={(v) =>
                        setRows((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, enhancement: v } : item,
                          ),
                        )
                      }
                    />
                    <Field
                      label="Mastery"
                      value={row.mastery}
                      onChange={(v) =>
                        setRows((current) =>
                          current.map((item, i) =>
                            i === index ? { ...item, mastery: v } : item,
                          ),
                        )
                      }
                    />
                  </>
                ) : showTarget ? (
                  <Field
                    label="Target tier"
                    value={row.targetTier}
                    onChange={() => {}}
                  >
                    <select
                      value={row.targetTier}
                      onChange={(e) =>
                        setRows((current) =>
                          current.map((item, i) =>
                            i === index
                              ? { ...item, targetTier: e.target.value }
                              : item,
                          ),
                        )
                      }
                    >
                      <option value="">Choose target</option>
                      {GOVERNOR_GEAR_LEVELS.map((item) => (
                        <option key={item.index} value={item.tier}>
                          {item.tier}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : null}
              </div>
            ))}
          </section>
        ))}
      </div>
    </div>
  );
}

export function HeroGearPlanner() {
  const [rows, setRows] = useState(() =>
    ["Infantry", "Cavalry", "Archer"].flatMap((troop) =>
      heroPieces.map((slot) => ({
        id: `${troop}-${slot}`,
        label: `${troop} ${slot}`,
        tier: "Mythic",
        enhancement: 0,
        mastery: 0,
        ascension: 0,
        imbuement: 0,
        currentStat: 0,
      })),
    ),
  );
  const [inputs, setInputs] = useState({
    role: "rally-leader",
    activity: "growth",
    mode: "inventory",
    xp: 0,
    consumableGear: 0,
    forgehammers: 0,
    mythicPieces: 0,
    mithril: 0,
    safeXpReforging: true,
    troopWeights: { Infantry: 3, Cavalry: 2, Archer: 2 },
    statWeights: { Health: 1, Lethality: 1 },
    gearWeights: heroGearProfiles.growth,
  });
  const saved = useMemo(() => ({ rows, ...inputs }), [rows, inputs]);
  const restore = useCallback((state) => {
    if (Array.isArray(state.rows)) setRows(state.rows);
    setInputs((c) => ({ ...c, ...state, rows: undefined }));
  }, []);
  const persistence = useToolPersistence({
    toolKey: "hero-gear",
    schemaVersion: 1,
    inputs: saved,
    restore,
    autoDetect: true,
  });
  const plan = useMemo(
    () => calculateHeroGearPlan(rows, inputs),
    [rows, inputs],
  );
  return (
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <SaveState persistence={persistence} />
        <PlannerGuide
          steps={[
            "Choose a profile that matches your goal, or edit the six weights for a custom build.",
            "Enter the rarity, Enhancement level, and Mastery level shown on each of your 12 pieces.",
            "Add the resources in your bag, then follow the recommended upgrades on the right.",
          ]}
          note="Safe XP reforging may move XP out of non-Red gear at no loss. It never reforges Red gear, and Mastery reforging is not automatically recommended."
        />
        <InputSummary
          items={[
            { label: "Profile", value: inputs.activity.replaceAll("-", " ") },
            { label: "XP", value: fmt(inputs.xp) },
            { label: "Forgehammers", value: fmt(inputs.forgehammers) },
            {
              label: "Next action",
              value: plan.recommendation?.label || "Add resources",
            },
          ]}
        />
        <div className={styles.section}>
          <SectionHeading
            title="Build profile"
            description="Choose the priority model the optimizer should use when comparing upgrades."
          />
          <div className={styles.grid}>
            <Field label="Profile" value={inputs.activity} onChange={() => {}}>
              <select
                value={inputs.activity}
                onChange={(e) => {
                  const activity = e.target.value;
                  setInputs((c) => ({
                    ...c,
                    activity,
                    gearWeights:
                      activity === "custom"
                        ? c.gearWeights
                        : heroGearProfiles[activity],
                  }));
                }}
              >
                <option value="growth">Early Game Growth</option>
                <option value="combat">Early Game Combat</option>
                <option value="future">Future-proofed (Gen 4+)</option>
                <option value="unweighted">Unweighted</option>
                <option value="custom">Custom</option>
              </select>
            </Field>
          </div>
        </div>
        <EquipmentRows hero rows={rows} setRows={setRows} />
        <AdvancedSettings title="Advanced profile weights">
          <div className={styles.grid}>
            {Object.entries(inputs.gearWeights).map(([key, value]) => (
              <Field
                key={key}
                label={`${key.replace(".", " ")} weight`}
                value={value}
                onChange={(v) =>
                  setInputs((c) => ({
                    ...c,
                    activity: "custom",
                    gearWeights: { ...c.gearWeights, [key]: v },
                  }))
                }
              />
            ))}
          </div>
        </AdvancedSettings>
        <div className={styles.section}>
          <SectionHeading
            title="Available resources"
            description="Enter only resources you are willing to spend in this optimization."
          />
          <div className={styles.grid}>
            {[
              ["xp", "Enhancement XP"],
              ["forgehammers", "Forgehammers"],
              ["mythicPieces", "Mythic pieces"],
              ["mithril", "Mithril"],
            ].map(([key, label]) => (
              <Field
                key={key}
                label={label}
                value={inputs[key]}
                onChange={(v) => setInputs((c) => ({ ...c, [key]: v }))}
              />
            ))}
          </div>
          <label className={styles.note}>
            <input
              type="checkbox"
              checked={inputs.safeXpReforging}
              onChange={(e) =>
                setInputs((c) => ({ ...c, safeXpReforging: e.target.checked }))
              }
            />{" "}
            Include safe XP reforging. Destructive mastery reforging is never
            recommended.
          </label>
        </div>
      </section>
      <aside className={styles.result}>
        <h2>Upgrade plan</h2>
        {plan.recommendation ? (
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Next balanced upgrade</span>
              <b>
                {plan.recommendation.label} → +{plan.recommendation.targetLevel}
              </b>
            </div>
            <div className={styles.metric}>
              <span>Cost</span>
              <b>
                {fmt(plan.recommendation.xp)} XP · {plan.recommendation.mithril}{" "}
                Mithril · {plan.recommendation.mythic} Mythic
              </b>
            </div>
            <div className={styles.metric}>
              <span>Improves</span>
              <b>{plan.recommendation.stat}</b>
            </div>
          </div>
        ) : (
          <p className={styles.status}>
            Add Enhancement XP or upgrade materials to generate a plan. Your
            current gear and selected profile are already included.
          </p>
        )}
        <p className={styles.note}>
          Remaining: {fmt(plan.remaining.xp)} XP ·{" "}
          {fmt(plan.remaining.forgehammers)} Forgehammers ·{" "}
          {fmt(plan.remaining.mythicPieces)} Mythic pieces ·{" "}
          {fmt(plan.remaining.mithril)} Mithril. Bottleneck:{" "}
          {plan.bottleneck || "none"}.
        </p>
        {plan.candidates?.some((item) => item.xp > 0) ? (
          <ol className={styles.list}>
            {plan.candidates
              .filter((item) => item.xp > 0)
              .map((item) => (
                <li key={item.id}>
                  {item.label}: level {item.enhancement} → {item.targetLevel} ·{" "}
                  {fmt(item.xp)} XP · +{fmt(item.statGain)}% {item.stat}
                </li>
              ))}
          </ol>
        ) : null}
        <p className={styles.note}>
          XP reforging is offered only for non-Red gear at 100% recovery.
          Mastery reforging recovers 50% of Forgehammers.
        </p>
        <ExportButton name="hero-gear-plan" data={plan} />
      </aside>
    </div>
  );
}

export function GovernorGearPlanner() {
  const [rows, setRows] = useState(() =>
    governorPieces.map((label, index) => {
      const troop = [
        "Cavalry",
        "Cavalry",
        "Infantry",
        "Infantry",
        "Archer",
        "Archer",
      ][index];
      return {
        id: label.toLowerCase(),
        label,
        troop,
        tier: "",
        targetTier: "",
      };
    }),
  );
  const [inputs, setInputs] = useState({
    mode: "targets",
    satin: 0,
    threads: 0,
    visions: 0,
    balance: 0,
    optimizationGoal: "stats",
    amplification: 1.25,
    troopWeights: optimizerProfiles.growth,
    statWeights: { Health: 1, Lethality: 1 },
  });
  const saved = useMemo(() => ({ rows, ...inputs }), [rows, inputs]);
  const restore = useCallback((state) => {
    if (Array.isArray(state.rows)) setRows(state.rows);
    setInputs((c) => ({ ...c, ...state, rows: undefined }));
  }, []);
  const persistence = useToolPersistence({
    toolKey: "governor-gear",
    schemaVersion: 1,
    inputs: saved,
    restore,
    autoDetect: true,
  });
  const plan = useMemo(
    () => calculateGovernorGearPlan(rows, inputs),
    [rows, inputs],
  );
  return (
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <SaveState persistence={persistence} />
        <PlannerGuide
          steps={[
            "Choose Target cost planner to price specific tiers, or Best use of materials to optimize your inventory.",
            "Set the current tier for all six pieces. In target mode, also choose the tier you want each piece to reach.",
            "Enter your materials and follow the ordered plan on the right.",
          ]}
          note="Matching three-piece tiers unlock Defense set bonuses; matching all six unlocks Attack bonuses."
        />
        <InputSummary
          items={[
            {
              label: "Mode",
              value: inputs.mode === "targets" ? "Target planner" : "Best use",
            },
            { label: "Satin", value: fmt(inputs.satin) },
            { label: "Threads", value: fmt(inputs.threads) },
            { label: "Planned", value: `${plan.steps.length} upgrades` },
          ]}
        />
        <div className={styles.section}>
          <SectionHeading
            title="Mode and inventory"
            description="Choose a planning method, then enter the materials available to this plan."
          />
          <div className={styles.grid}>
            <Field
              label="Planning mode"
              value={inputs.mode}
              onChange={() => {}}
            >
              <select
                value={inputs.mode}
                onChange={(e) =>
                  setInputs((c) => ({ ...c, mode: e.target.value }))
                }
              >
                <option value="targets">Target cost planner</option>
                <option value="inventory">Best use of materials</option>
              </select>
            </Field>
            <Field
              label="Satin"
              value={inputs.satin}
              onChange={(v) => setInputs((c) => ({ ...c, satin: v }))}
            />
            <Field
              label="Gilded Threads"
              value={inputs.threads}
              onChange={(v) => setInputs((c) => ({ ...c, threads: v }))}
            />
            <Field
              label="Artisan’s Visions"
              value={inputs.visions}
              onChange={(v) => setInputs((c) => ({ ...c, visions: v }))}
            />
            <Field
              label="Optimization goal"
              value={inputs.optimizationGoal}
              onChange={() => {}}
            >
              <select
                value={inputs.optimizationGoal}
                onChange={(e) =>
                  setInputs((c) => ({ ...c, optimizationGoal: e.target.value }))
                }
              >
                <option value="stats">Optimize stats</option>
                <option value="events">Optimize events</option>
              </select>
            </Field>
          </div>
        </div>
        <EquipmentRows
          rows={rows}
          setRows={setRows}
          showTarget={inputs.mode === "targets"}
        />
        <AdvancedSettings title="Advanced priority controls">
          <div className={styles.grid}>
            <Field
              label="Minimum balance"
              value={inputs.balance}
              onChange={(v) => setInputs((c) => ({ ...c, balance: v }))}
              hint="Keeps every piece at or above this tier index before specializing. Leave 0 for no minimum."
            />
            <Field
              label="Amplification factor"
              value={inputs.amplification}
              onChange={(v) => setInputs((c) => ({ ...c, amplification: v }))}
              step="0.05"
              min="1"
              max="2"
              hint="Strengthens the difference between troop priorities. 1 means no amplification."
            />
            {Object.entries(inputs.troopWeights).map(([key, value]) => (
              <Field
                key={key}
                label={`${key} weight`}
                value={value}
                onChange={(v) =>
                  setInputs((c) => ({
                    ...c,
                    troopWeights: { ...c.troopWeights, [key]: v },
                  }))
                }
              />
            ))}
          </div>
        </AdvancedSettings>
      </section>
      <aside className={styles.result}>
        <h2>Governor Gear plan</h2>
        <div className={styles.metrics}>
          {["satin", "threads", "visions"].map((key) => (
            <div className={styles.metric} key={key}>
              <span>{key} needed / short</span>
              <b>
                {fmt(plan.totals[key])} / {fmt(plan.shortfall[key])}
              </b>
            </div>
          ))}
          <div className={styles.metric}>
            <span>Power gain</span>
            <b>{fmt(plan.totals.powerGain)}</b>
          </div>
        </div>
        <p className={styles.note}>
          {plan.steps.length} upgrades planned. Matching 3-piece tiers activate
          Defense and matching 6-piece tiers activate Attack.
        </p>
        {!plan.steps.length ? (
          <p className={styles.status}>
            {inputs.mode === "targets"
              ? "Choose a target tier above at least one current tier to calculate its cost."
              : "Add Satin, Gilded Threads, or Artisan’s Visions to generate the best affordable upgrade order."}
          </p>
        ) : null}
        <ol className={styles.list}>
          {plan.steps.map((step, index) => (
            <li key={`${step.piece}-${index}`}>
              {step.piece} → {step.tier}: {fmt(step.satin)} Satin ·{" "}
              {fmt(step.threads)} Threads · {fmt(step.visions)} Visions · +
              {fmt(step.statGain)}% stat
            </li>
          ))}
        </ol>
        <ExportButton name="governor-gear-plan" data={plan} />
      </aside>
    </div>
  );
}

export function MastersPlanner() {
  const [inputs, setInputs] = useState({
    master: "",
    expertLevel: 0,
    relationshipClass: "",
    relationshipProgress: 0,
    targetRelationship: 10,
    talentLevel: 0,
    affinity: 0,
    emblems: 0,
    manuscripts: 0,
    learningSpeed: 0,
    skills: MASTER_DATA.Valora.skills.map((name) => ({
      name,
      level: 0,
      targetLevel: 0,
      partialXp: 0,
    })),
  });
  const restore = useCallback(
    (saved) => setInputs((current) => ({ ...current, ...saved })),
    [],
  );
  const persistence = useToolPersistence({
    toolKey: "masters",
    schemaVersion: 1,
    inputs,
    restore,
    autoDetect: true,
  });
  const update = (key, value) =>
    setInputs((current) => ({ ...current, [key]: value }));
  const plan = useMemo(() => calculateMasterPlan(inputs), [inputs]);
  return (
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <SaveState persistence={persistence} />
        <PlannerGuide
          steps={[
            "Choose a Master and enter your current and target relationship levels.",
            "Add the Affinity, Emblems, and Manuscripts already in your inventory.",
            "For any skill you plan to raise, enter its current level, target level, and XP already learned toward the next level.",
          ]}
          note="Leave a skill target equal to its current level when you do not want to upgrade that skill."
        />
        <InputSummary
          items={[
            { label: "Master", value: inputs.master || "Not selected" },
            {
              label: "Relationship",
              value: `${fmt(inputs.relationshipProgress)} → ${fmt(inputs.targetRelationship)}`,
            },
            { label: "Affinity", value: fmt(inputs.affinity) },
            { label: "Skills", value: `${plan.skillRoadmap.length} planned` },
          ]}
        />
        <div className={styles.section}>
          <SectionHeading
            title="Master progression"
            description="Choose the Master and relationship milestone you want to reach."
          />
          <div className={styles.grid}>
            <Field label="Master" value={inputs.master} onChange={() => {}}>
              <select
                value={inputs.master}
                onChange={(e) => {
                  const master = e.target.value || "Valora";
                  setInputs((current) => ({
                    ...current,
                    master: e.target.value,
                    skills: MASTER_DATA[master].skills.map((name, index) => ({
                      ...current.skills[index],
                      name,
                      level: current.skills[index]?.level || 0,
                      targetLevel: current.skills[index]?.targetLevel || 0,
                      partialXp: current.skills[index]?.partialXp || 0,
                    })),
                  }));
                }}
              >
                <option value="">Choose a Master</option>
                {MASTERS.map((name) => (
                  <option key={name}>{name}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Relationship progress"
              value={inputs.relationshipProgress}
              onChange={(v) => update("relationshipProgress", v)}
            />
            <Field
              label="Target relationship"
              value={inputs.targetRelationship}
              onChange={(v) => update("targetRelationship", Math.min(100, v))}
            />
          </div>
        </div>
        <div className={styles.section}>
          <SectionHeading
            title="Inventory"
            description="Add the progression materials currently available to you."
          />
          <div className={styles.grid}>
            <Field
              label="Affinity"
              value={inputs.affinity}
              onChange={(v) => update("affinity", v)}
            />
            <Field
              label="Emblems"
              value={inputs.emblems}
              onChange={(v) => update("emblems", v)}
            />
            <Field
              label="Manuscripts"
              value={inputs.manuscripts}
              onChange={(v) => update("manuscripts", v)}
            />
          </div>
        </div>
        <div className={styles.section}>
          <SectionHeading
            title="Skill targets"
            description="Set targets only for the skills you intend to raise; partial XP reduces the next cost."
          />
          {inputs.skills.map((skill, index) => (
            <div className={styles.row} key={index}>
              <Field
                label="Skill"
                type="text"
                value={skill.name}
                onChange={(v) =>
                  setInputs((c) => ({
                    ...c,
                    skills: c.skills.map((item, i) =>
                      i === index ? { ...item, name: v } : item,
                    ),
                  }))
                }
              />
              <Field
                label="Level"
                value={skill.level}
                onChange={(v) =>
                  setInputs((c) => ({
                    ...c,
                    skills: c.skills.map((item, i) =>
                      i === index ? { ...item, level: v } : item,
                    ),
                  }))
                }
              />
              <Field
                label="Target level"
                value={skill.targetLevel || 0}
                onChange={(v) =>
                  setInputs((c) => ({
                    ...c,
                    skills: c.skills.map((item, i) =>
                      i === index
                        ? { ...item, targetLevel: Math.max(item.level, v) }
                        : item,
                    ),
                  }))
                }
              />
              <Field
                label="Partial XP"
                value={skill.partialXp}
                onChange={(v) =>
                  setInputs((c) => ({
                    ...c,
                    skills: c.skills.map((item, i) =>
                      i === index ? { ...item, partialXp: v } : item,
                    ),
                  }))
                }
              />
            </div>
          ))}
        </div>
      </section>
      <aside className={styles.result}>
        <h2>Best next investment</h2>
        <div className={styles.metrics}>
          <div className={styles.metric}>
            <span>Next relationship milestone</span>
            <b>
              Level {plan.target.level} · +{plan.target.buff}%
            </b>
          </div>
          <div className={styles.metric}>
            <span>Affinity needed / short</span>
            <b>
              {fmt(plan.affinity)} / {fmt(plan.shortfall.affinity)}
            </b>
          </div>
          <div className={styles.metric}>
            <span>Emblems needed / short</span>
            <b>
              {fmt(plan.emblems)} / {fmt(plan.shortfall.emblems)}
            </b>
          </div>
        </div>
        <p className={styles.note}>
          {plan.title} · {plan.label}. Skill requirements: {fmt(plan.xp)} XP and{" "}
          {fmt(plan.manuscripts)} Manuscripts ({fmt(plan.shortfall.manuscripts)}{" "}
          short).
        </p>
        {plan.skillRoadmap.length ? (
          <ol className={styles.list}>
            {plan.skillRoadmap.map((skill) => (
              <li key={skill.name}>
                {skill.name}: level {skill.from} → {skill.to} · {fmt(skill.xp)}{" "}
                XP · {fmt(skill.manuscripts)} Manuscripts
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.note}>
            No skill upgrades selected. Set a target above a skill’s current
            level to add it to the roadmap.
          </p>
        )}
        <ExportButton name="master-progression-plan" data={plan} />
      </aside>
    </div>
  );
}

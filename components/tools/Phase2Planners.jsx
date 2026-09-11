"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useMemo, useState } from "react";
import CharmPackOptimizer from "../../app/tools/CharmPackOptimizer";
import { CHARM_COSTS } from "../../lib/charmToolData.mjs";
import { optimizeOfferPacks } from "../../lib/offerPackOptimizer.mjs";
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
import {
  DataLabel,
  FirstUseGuide,
  NextAction,
  SaveToRoadmap,
} from "./PlannerExperience";
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
const governorPieces = ["Cap", "Watch", "Coat", "Pants", "Belt", "Weapon"];
const governorTroops = ["Cavalry", "Cavalry", "Infantry", "Infantry", "Archer", "Archer"];
const createGovernorRows = () => governorPieces.map((label, index) => ({
  id: label.toLowerCase(),
  label,
  troop: governorTroops[index],
  tier: "",
  targetTier: "",
}));
const normalizeGovernorRows = (rows) => createGovernorRows().map((base, index) => ({
  ...base,
  ...(rows?.[index] || {}),
  id: base.id,
  label: base.label,
  troop: base.troop,
}));
const heroGearImage = (label) => {
  const [troop, piece] = label.toLowerCase().split(" ");
  return `/images/kingshot/hero-gear/${troop}-${piece === "helmet" ? "helm" : piece}.png`;
};
const isHeroMasteryAction = (action) => action?.actionType === "mastery";
const heroActionTarget = (action) => isHeroMasteryAction(action)
  ? `Mastery ${action.mastery}`
  : `+${action?.level}`;
const governorGearImages = [
  "/images/kingshot/governor-gear/cavalry_gear_1_green_t0_s0.webp",
  "/images/kingshot/governor-gear/cavalry_gear_2_green_t0_s0.webp",
  "/images/kingshot/governor-gear/infantry_gear_1_green_t0_s0.webp",
  "/images/kingshot/governor-gear/infantry_gear_2_green_t0_s0.webp",
  "/images/kingshot/governor-gear/archery_gear_1_green_t0_s0.webp",
  "/images/kingshot/governor-gear/archery_gear_2_green_t0_s0.webp",
];
const petImages = {
  "Gray Wolf": "/images/kingshot/pets/gray-wolf.webp",
  "Grizzly Bear": "/images/kingshot/pets/grizzly-bear.webp",
};

function ExportButton({ name, data }) {
  const download = (format) => {
    const rows = data?.actions || data?.steps || data?.upgrades || data?.candidates || [];
    const keys = [...new Set(rows.flatMap((row) => Object.keys(row).filter((key) => typeof row[key] !== "object")))];
    const escapeCsv = (value) => `"${String(value ?? "").replaceAll('"', '""')}"`;
    const body = format === "csv"
      ? [keys.map(escapeCsv).join(","), ...rows.map((row) => keys.map((key) => escapeCsv(row[key])).join(","))].join("\n")
      : JSON.stringify(data, null, 2);
    const blob = new Blob([body], {
      type: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${name}.${format}`;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <span className={styles.exportActions}>
      <button className={styles.button} type="button" onClick={() => download("csv")}>Export CSV</button>
      <button className={styles.button} type="button" onClick={() => download("json")}>Export JSON</button>
    </span>
  );
}
function SaveState({ persistence }) {
  return <SaveToRoadmap persistence={persistence} />;
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

function PlannerGuide({ steps, note, toolKey = "planner", terms = [], onDemo }) {
  return (
    <>
      <FirstUseGuide
        toolKey={toolKey}
        title="Build a recommendation in three steps"
        steps={steps}
        terms={terms}
        onDemo={onDemo}
      />
      {note ? <p className={styles.guideNote}>{note}</p> : null}
    </>
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

function PackOfferAdvisor({ title, resources, requirements, offers: savedOffers = [], onOffersChange }) {
  const offers = useMemo(() => {
    const emptyOffer = () => ({ name: "", price: 0, limit: 1, ...Object.fromEntries(resources.map(({ key }) => [key, 0])) });
    return savedOffers.length ? savedOffers : [emptyOffer(), emptyOffer(), emptyOffer()];
  }, [savedOffers, resources]);
  const plan = useMemo(() => optimizeOfferPacks(offers, requirements), [offers, requirements]);
  const update = (index, key, value) => onOffersChange(offers.map((offer, offerIndex) => offerIndex === index ? { ...offer, [key]: key === "name" ? value : number(value) } : offer));
  const totalShortfall = resources.reduce((sum, { key }) => sum + (requirements[key] || 0), 0);
  return <details className={styles.packAdvisor} defaultOpen={totalShortfall > 0}>
    <summary><span>Pack optimization · connected to this plan</span><b>{title}</b></summary>
    <p>The material gaps below come directly from the recommended upgrade{resources.length > 1 ? "s" : ""}. Enter the offers visible in your game; pack contents can vary by account and event.</p>
    <div className={styles.packNeed}>{resources.map(({ key, label }) => <span key={key}>{label}<b>{fmt(requirements[key])}</b></span>)}</div>
    <div className={styles.offerTable}>
      {offers.map((offer, index) => <div className={styles.offerRow} key={index}>
        <input aria-label={`Offer ${index + 1} name`} placeholder={`Offer ${index + 1}`} value={offer.name} onChange={(event) => update(index, "name", event.target.value)} />
        <input aria-label={`Offer ${index + 1} price`} type="number" min="0" step=".01" placeholder="Price" value={offer.price || ""} onChange={(event) => update(index, "price", event.target.value)} />
        {resources.map(({ key, label }) => <input key={key} aria-label={`Offer ${index + 1} ${label}`} type="number" min="0" placeholder={label} value={offer[key] || ""} onChange={(event) => update(index, key, event.target.value)} />)}
        <input aria-label={`Offer ${index + 1} purchase limit`} type="number" min="0" max="20" placeholder="Limit" value={offer.limit} onChange={(event) => update(index, "limit", event.target.value)} />
      </div>)}
    </div>
    {!totalShortfall ? <p className={styles.status}>Your current inventory already covers this pack-plan scope.</p> : offers.some((offer) => offer.price > 0) ? plan ? <div className={styles.packAnswer}><strong>Cheapest entered combination: ${plan.cost.toFixed(2)}</strong>{plan.picks.map((pick) => <span key={pick.name}>{pick.quantity} × {pick.name || "Unnamed offer"}</span>)}</div> : <p className={styles.status}>The entered offers cannot cover this material gap within their limits.</p> : <p className={styles.status}>Add the packs shown in your game to compare the cheapest combination.</p>}
  </details>;
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
          toolKey="ttg-production"
          steps={[
            "Enter the True Gold you have now and the amount you refuse to spend.",
            "Set today’s refinement attempt, your daily limit, and the TTG your building or research plan needs.",
            "Read the daily schedule on the right; extend the horizon if the target says Beyond horizon.",
          ]}
          note="The planner protects both your reserve and any True Gold required by the selected construction plan."
          terms={[["True Gold", "The base resource consumed by refinement and eligible construction."], ["Tempered True Gold", "The refined resource required by advanced construction."], ["Risk mode", "Chooses guaranteed, conservative, or expected refinement output."]]}
          onDemo={() => setInputs((current) => ({ ...current, trueGold: 5000, temperedTrueGold: 20, dailyIncome: 200, reserve: 500, requiredTempered: 60, refinementsPerDay: 3, horizonDays: 7 }))}
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
        <NextAction
          title={result.schedule?.[0]?.runs ? `Complete ${result.schedule[0].runs} refinement${result.schedule[0].runs === 1 ? "" : "s"} today` : "Protect more True Gold or extend the plan"}
          reason="Refinement itself does not earn KvK Preparation points; complete it before the event so TTG is ready for an eligible construction day."
          before={`${fmt(inputs.temperedTrueGold)} TTG`}
          after={`${fmt(result.schedule?.[0]?.temperedTotal || inputs.temperedTrueGold)} TTG`}
          resources={`${fmt(result.schedule?.[0]?.trueGoldSpent || 0)} True Gold`}
          remaining={`${fmt(result.schedule?.[0]?.trueGoldRemaining ?? inputs.trueGold)} True Gold`}
        />
        <DataLabel type={inputs.riskMode === "expected" ? "estimated" : "exact"}>{inputs.riskMode} output model</DataLabel>
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
    locked: false,
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
        <div className={styles.subjectBanner}>
          <Image
            src={
              petImages[inputs.pet] || "/images/kingshot/pets/gray-wolf.webp"
            }
            alt=""
            width={92}
            height={92}
          />
          <div>
            <strong>{inputs.pet}</strong>
            <span>
              Generation {inputs.generation} · maximum level{" "}
              {PETS.find((pet) => pet.name === inputs.pet)?.maxLevel}
            </span>
          </div>
        </div>
        <PlannerGuide
          toolKey="pet-progression"
          steps={[
            "Choose the pet, then enter its current and desired levels.",
            "Add the Food, Manuals, Potions, and Medallions already in your bag.",
            "Use the roadmap and shortfall on the right, or send the missing materials to the Pet Pack Optimizer.",
          ]}
          note="Advancement materials are included automatically when the level path crosses an advancement milestone."
          terms={[["Advancement", "The milestone step that unlocks a pet's next level range."], ["Shortfall", "The materials still missing after your current inventory is applied."]]}
          onDemo={() => setInputs((current) => ({ ...current, pet: "Gray Wolf", generation: 1, currentLevel: 30, targetLevel: 40, inventory: { food: 18000, manuals: 25, potions: 10, medallions: 2 }, locked: false }))}
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
            <Field label="Goal preset" value="custom" onChange={() => {}}>
              <select defaultValue="custom" onChange={(event) => {
                const max = PETS.find((pet) => pet.name === inputs.pet)?.maxLevel || 100;
                if (event.target.value === "next") update("targetLevel", Math.min(max, inputs.currentLevel + 1));
                if (event.target.value === "ten") update("targetLevel", Math.min(max, inputs.currentLevel + 10));
                if (event.target.value === "milestone") update("targetLevel", Math.min(max, Math.ceil((inputs.currentLevel + 1) / 10) * 10));
              }}><option value="custom">Custom target</option><option value="next">Next level</option><option value="ten">Next 10 levels</option><option value="milestone">Next advancement milestone</option></select>
            </Field>
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
          <label className={styles.lockControl}><input type="checkbox" checked={inputs.locked} onChange={(event) => update("locked", event.target.checked)} /> Protect this pet from recommendations</label>
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
        <NextAction
          title={result.steps[0] ? `${inputs.pet}: level ${result.steps[0].fromLevel} → ${result.steps[0].toLevel}` : inputs.locked ? `${inputs.pet} is protected` : "Choose a higher target level"}
          reason={result.steps[0] ? "This is the first required level step on the path to your selected target." : "Set a target or remove protection to generate a recommendation."}
          before={`Level ${inputs.currentLevel}`}
          after={`Level ${result.steps[0]?.toLevel || inputs.currentLevel}`}
          resources={result.steps[0] ? `${fmt(result.steps[0].food)} Food` : "None"}
          remaining={`${fmt(Math.max(0, inputs.inventory.food - (result.steps[0]?.food || 0)))} Food`}
        />
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

export function CharmStatPlanner({ memberId = "", packConfiguration, toolKey = "governor-charm-stats" }) {
  const [activeTroop, setActiveTroop] = useState("Infantry");
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
    toolKey,
    schemaVersion: 1,
    inputs,
    restore,
    autoDetect: true,
  });
  const charmCosts = packConfiguration?.costs || CHARM_COSTS;
  const ranked = useMemo(
    () =>
      rankCharmUpgrades(
        inputs.charms,
        charmCosts,
        { guides: inputs.guides, designs: inputs.designs },
        {
          troops: inputs.troopWeights,
          stats: inputs.statWeights,
          amplification: inputs.amplification,
          mode: inputs.optimizationGoal,
        },
        { minimumBalance: inputs.minimumBalance },
      ),
    [inputs, charmCosts],
  );
  const charmTargetCost = useMemo(() => inputs.charms.reduce((total, charm) => {
    for (let level = charm.current + 1; level <= charm.target; level += 1) {
      total.g += charmCosts[level]?.[0] || 0;
      total.d += charmCosts[level]?.[1] || 0;
    }
    return total;
  }, { g: 0, d: 0 }), [inputs.charms, charmCosts]);
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
  const eventMode = inputs.optimizationGoal === "events";
  const charmPointsAreEstimated = ranked.upgrades.some((item) => item.eventPointsProvenance !== "verified");
  return (
    <>
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <SaveState persistence={persistence} />
        <PlannerGuide
          toolKey="governor-charm-stats"
          steps={[
            "Enter the Charm Guides and Designs you can spend.",
            "Choose a build profile, then set each charm’s current and target level.",
            "Follow the ordered upgrades on the right; the sequence never spends more materials than you entered.",
          ]}
          note="Each charm raises Health and Lethality together. Profiles are priorities, not game rules, and every weight remains editable."
          terms={[["Guides", "Charm upgrade material."], ["Designs", "Charm upgrade material consumed alongside Guides."], ["Profile", "An editable priority preset, not a game rule."]]}
          onDemo={() => setInputs((current) => ({ ...current, guides: 900, designs: 900, profile: "growth", charms: current.charms.map((charm) => ({ ...charm, current: charm.type === "Infantry" ? 5 : 4, target: 8, locked: false })) }))}
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
                <option value="events">Optimize KvK Preparation points</option>
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
            description="Use the bulk controls for fast setup, then adjust any individual charm."
          />
          <div className={styles.troopTabs} role="tablist" aria-label="Charm troop type">
            {["Infantry", "Cavalry", "Archer"].map((troop) => <button key={troop} type="button" role="tab" aria-selected={activeTroop === troop} onClick={() => setActiveTroop(troop)}>{troop}<span>{inputs.charms.filter((charm) => charm.type === troop && charm.target > charm.current).length} planned</span></button>)}
          </div>
          <div className={styles.activeBulkActions}><strong>{activeTroop} shortcuts</strong><button type="button" onClick={() => setInputs(current => ({ ...current, charms: current.charms.map(charm => charm.type === activeTroop ? { ...charm, current: Math.min(22, charm.current + 1), target: Math.max(charm.target, Math.min(22, charm.current + 1)) } : charm) }))}>Raise all current +1</button><button type="button" onClick={() => setInputs(current => ({ ...current, charms: current.charms.map(charm => charm.type === activeTroop ? { ...charm, target: Math.min(22, charm.current + 1) } : charm) }))}>Target each next level</button></div>
          <div className={styles.groupGrid}>
            {[activeTroop].map((troop) => (
              <section className={styles.equipmentGroup} key={troop}>
                <h3>
                  <Image
                    src={`/images/kingshot/charms/${troop === "Archer" ? "archery" : troop.toLowerCase()}.webp`}
                    alt=""
                    width={44}
                    height={44}
                  />
                  {troop}
                </h3>
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
                      <label className={styles.miniLock}><input aria-label={`Protect ${charm.type} charm ${charm.number}`} type="checkbox" checked={Boolean(charm.locked)} onChange={(event) => updateCharm(charm.id, "locked", event.target.checked)} /> Protect</label>
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
        <NextAction
          title={ranked.upgrades[0] ? `${ranked.upgrades[0].type} Charm ${ranked.upgrades[0].number} → level ${ranked.upgrades[0].level}` : "Add Guides and Designs"}
          reason={ranked.upgrades[0] ? (eventMode ? "This affordable upgrade has the highest KvK Preparation return under squared scarcity scoring." : "This is the highest weighted Health and Lethality gain that fits your spendable inventory.") : "The optimizer needs spendable inventory and at least one unlocked target."}
          before={ranked.upgrades[0] ? `Level ${ranked.upgrades[0].level - 1}` : "Current charm levels"}
          after={ranked.upgrades[0] ? `Level ${ranked.upgrades[0].level}` : "No affordable upgrade"}
          resources={ranked.upgrades[0] ? `${ranked.upgrades[0].guides} Guides · ${ranked.upgrades[0].designs} Designs` : "None"}
          remaining={`${fmt(ranked.remaining.guides)} Guides · ${fmt(ranked.remaining.designs)} Designs`}
        />
        <DataLabel type="exact">level costs + verified KvK levels 1–11</DataLabel>{charmPointsAreEstimated ? <DataLabel type="estimated">KvK levels 12–22</DataLabel> : null}{!eventMode ? <DataLabel type="subjective">profile weights</DataLabel> : null}
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
          <div className={styles.metric}>
            <span>{eventMode ? "KvK Preparation points" : "Combined stat gain"}</span>
            <b>{fmt(eventMode ? ranked.totals.eventPoints : ranked.totals.health + ranked.totals.lethality)}</b>
          </div>
        </div>
        {ranked.upgrades.length ? (
          <ol className={styles.list}>
            {ranked.upgrades.map((item) => (
              <li key={`${item.id}-${item.level}`}>
                {item.type} #{item.number} → level {item.level} · {item.guides}{" "}
                Guides · {item.designs} Designs{eventMode ? ` · ${fmt(item.eventPoints)} KvK points (${item.eventPointsProvenance})` : ""}
              </li>
            ))}
          </ol>
        ) : (
          <p className={styles.note}>
            Enter inventory and targets to build an exact material-feasible
            sequence.
          </p>
        )}
        <p className={styles.note}>{eventMode ? `KvK Preparation total: ${fmt(ranked.totals.eventPoints)} points. Points are awarded by completed charm level, not by Guides or Designs spent.` : `Stat gain: +${fmt(ranked.totals.health)} Health and +${fmt(ranked.totals.lethality)} Lethality. Profile weights are priorities, not game rules.`}</p>
        {ranked.next ? (
          <p className={styles.note}>
            Bottleneck: next {ranked.next.type} #{ranked.next.number} level{" "}
            {ranked.next.level} needs {ranked.next.guides} Guides and{" "}
            {ranked.next.designs} Designs.
          </p>
        ) : null}
        <ExportButton name="charm-upgrade-plan" data={ranked} />
      </aside>
    </div>
    <div className={styles.connectedPack}><CharmPackOptimizer configuration={packConfiguration} embedded requiredOverride={charmTargetCost} ownedOverride={{ g: inputs.guides, d: inputs.designs }} strictPurchasePlan={toolKey === "updated-charms"} /></div>
    </>
  );
}

function EquipmentRows({ rows, setRows, hero = false, showTarget = true }) {
  const [activeGroup, setActiveGroup] = useState("Infantry");
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
      {hero ? <div className={styles.troopTabs} role="tablist" aria-label="Hero Gear troop type">
        {groups.map((group) => <button key={group.name} type="button" role="tab" aria-selected={activeGroup === group.name} onClick={() => setActiveGroup(group.name)}>{group.name}<span>{group.rows.filter(({ row }) => !row.locked).length} active</span></button>)}
      </div> : null}
      <div className={hero ? styles.groupGrid : styles.singleGroup}>
        {groups.filter((group) => !hero || group.name === activeGroup).map((group) => (
          <section className={styles.equipmentGroup} key={group.name}>
            <h3>{group.name}</h3>
            {group.rows.map(({ row, index }) => (
              <div className={styles.compactRow} key={row.id}>
                <strong className={styles.pieceIdentity}>
                  <Image
                    src={
                      hero
                        ? heroGearImage(row.label)
                        : governorGearImages[index]
                    }
                    alt=""
                    width={48}
                    height={48}
                  />
                  <span>
                    {hero ? row.label.replace(`${group.name} `, "") : row.label}
                  </span>
                </strong>
                <label className={styles.miniLock}><input aria-label={`Protect ${row.label}`} type="checkbox" checked={Boolean(row.locked)} onChange={(event) => setRows((current) => current.map((item, i) => i === index ? { ...item, locked: event.target.checked } : item))} /> Protect</label>
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
                              ? {
                                  ...item,
                                  tier: e.target.value,
                                  enhancement: e.target.value === "Red"
                                    ? Math.max(100, Math.min(200, number(item.enhancement)))
                                    : Math.min(e.target.value === "Epic" ? 80 : 100, number(item.enhancement)),
                                }
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
                            i === index ? { ...item, enhancement: Math.max(item.tier === "Red" ? 100 : 0, Math.min(item.tier === "Epic" ? 80 : item.tier === "Red" ? 200 : 100, v)) } : item,
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
                            i === index ? { ...item, mastery: Math.min(20, v) } : item,
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

export function HeroGearPlanner({ toolKey = "hero-gear" }) {
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
    optimizationGoal: "stats",
    safeXpReforging: true,
    packGoal: "next",
    packOffers: [],
    troopWeights: { Infantry: 3, Cavalry: 2, Archer: 2 },
    statWeights: { Health: 1, Lethality: 1 },
    gearWeights: heroGearProfiles.growth,
  });
  const saved = useMemo(() => ({ rows, ...inputs }), [rows, inputs]);
  const restore = useCallback((state) => {
    if (Array.isArray(state.rows)) setRows(state.rows);
    setInputs((c) => ({ ...c, ...state, mode: "inventory", rows: undefined }));
  }, []);
  const persistence = useToolPersistence({
    toolKey,
    schemaVersion: 1,
    inputs: saved,
    restore,
    autoDetect: true,
  });
  const plan = useMemo(
    () => calculateHeroGearPlan(rows, inputs),
    [rows, inputs],
  );
  const heroPackNeed = useMemo(() => {
    const candidates = (plan.nearMisses || []).slice(0, 1);
    return {
      xp: Math.max(0, candidates.reduce((sum, item) => sum + (item.costs?.xp || 0), 0) - (plan.remaining?.xp || 0)),
      forgehammers: Math.max(0, candidates.reduce((sum, item) => sum + (item.costs?.forgehammers || 0), 0) - (plan.remaining?.forgehammers || 0)),
      mythicPieces: Math.max(0, candidates.reduce((sum, item) => sum + (item.costs?.mythicPieces || 0), 0) - (plan.remaining?.mythicPieces || 0)),
      mithril: Math.max(0, candidates.reduce((sum, item) => sum + (item.costs?.mithril || 0), 0) - (plan.remaining?.mithril || 0)),
    };
  }, [plan]);
  const eventMode = inputs.optimizationGoal === "events";
  const nextHeroAction = plan.nextAction;
  return (
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <SaveState persistence={persistence} />
        <PlannerGuide
          toolKey="hero-gear"
          steps={[
            "Enter the Hero Gear resources you are willing to spend.",
            "Enter the rarity, Enhancement level, and Mastery level shown on each piece.",
            "Choose a profile and follow the exact affordable upgrade order on the right.",
          ]}
          note="Safe XP reforging may move XP out of non-Red gear at no loss. It never reforges Red gear, and Mastery reforging is not automatically recommended."
          terms={[["Enhancement XP", "XP used to raise a Hero Gear piece's enhancement level."], ["Mastery", "A separate track using Forgehammers; levels 11–20 also consume Mythic Gear."], ["Protect", "Excludes a piece from every recommendation and reforge."]]}
          onDemo={() => { setRows((current) => current.map((row, index) => ({ ...row, tier: "Mythic", enhancement: index % 4 === 0 ? 40 : 20, mastery: index % 3, locked: false }))); setInputs((current) => ({ ...current, xp: 180000, forgehammers: 120, mythicPieces: 8, mithril: 4 })); }}
        />
        <div className={styles.section}>
          <SectionHeading
            title="Available resources"
            description="Enter only resources you are willing to spend. The optimizer never recommends an unaffordable step."
          />
          <div className={styles.grid}>
            {[["xp", "Enhancement XP"], ["forgehammers", "Forgehammers"], ["mythicPieces", "Mythic pieces"], ["mithril", "Mithril"]].map(([key, label]) => <Field key={key} label={label} value={inputs[key]} onChange={(v) => setInputs((c) => ({ ...c, [key]: v }))} />)}
            <Field label="Optimization goal" value={inputs.optimizationGoal} onChange={() => {}}><select value={inputs.optimizationGoal} onChange={(event) => setInputs((current) => ({ ...current, optimizationGoal: event.target.value }))}><option value="stats">Optimize weighted stats</option><option value="events">Optimize KvK Preparation points</option></select></Field>
          </div>
          <label className={styles.note}><input type="checkbox" checked={inputs.safeXpReforging} onChange={(e) => setInputs((c) => ({ ...c, safeXpReforging: e.target.checked }))} /> Include safe XP reforging. Destructive mastery reforging is never recommended.</label>
        </div>
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
      </section>
      <aside className={styles.result}>
        <NextAction
          title={nextHeroAction ? `${nextHeroAction.label} → ${heroActionTarget(nextHeroAction)}` : "Add spendable Hero Gear resources"}
          reason={nextHeroAction ? (eventMode ? "This plan prioritizes eligible Forgehammer and Mithril spending for KvK Preparation points." : `This unlocked piece gives the strongest ${nextHeroAction.stat} return for your selected build profile.`) : "Your current setup is saved; inventory is needed to calculate an affordable next action."}
          before={nextHeroAction ? (isHeroMasteryAction(nextHeroAction) ? `Mastery ${nextHeroAction.mastery - 1}` : `Enhancement ${nextHeroAction.fromLevel ?? nextHeroAction.level - 1}`) : "Current gear"}
          after={nextHeroAction ? (isHeroMasteryAction(nextHeroAction) ? `Mastery ${nextHeroAction.mastery}` : `Enhancement ${nextHeroAction.level}`) : "No affordable upgrade"}
          resources={nextHeroAction ? `${fmt(nextHeroAction.xp || 0)} XP · ${fmt(nextHeroAction.forgehammers || 0)} Forgehammers · ${fmt(nextHeroAction.mythic || 0)} Mythic · ${fmt(nextHeroAction.mithril || 0)} Mithril` : "None"}
          remaining={`${fmt(plan.remaining.xp)} XP · ${fmt(plan.remaining.forgehammers)} Forgehammers`}
        />
        <DataLabel type="exact">4,000 / Forgehammer · 40,000 / Mithril</DataLabel>{!eventMode ? <DataLabel type="subjective">build profile</DataLabel> : null}
        <h2>Upgrade plan</h2>
        {nextHeroAction ? (
          <div className={styles.metrics}>
            <div className={styles.metric}>
              <span>Next recommended upgrade</span>
              <b>
                {nextHeroAction.label} → {heroActionTarget(nextHeroAction)}
              </b>
            </div>
            <div className={styles.metric}>
              <span>Cost</span>
              <b>
                {fmt(nextHeroAction.xp || 0)} XP · {fmt(nextHeroAction.forgehammers || 0)} Forgehammers · {fmt(nextHeroAction.mithril || 0)} Mithril · {fmt(nextHeroAction.mythic || 0)} Mythic
              </b>
            </div>
            <div className={styles.metric}>
              <span>Improves</span>
              <b>{eventMode ? `${fmt(nextHeroAction.eventPoints || 0)} KvK Preparation points` : nextHeroAction.stat}</b>
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
        <p className={styles.note}>{eventMode ? `KvK Preparation scoring: ${fmt(plan.used.forgehammers)} Forgehammers × 4,000 + ${fmt(plan.used.mithril)} Mithril × 40,000 = ${fmt(plan.totals.eventPoints)} points. Enhancement XP and Mythic Gear award 0 points.` : `Projected stat gain across the plan: ${fmt(plan.totals.statGain)}.`}</p>
        {eventMode && plan.actions.some((item) => item.eventPoints > 0) ? <ol className={styles.list}>{plan.actions.filter((item) => item.eventPoints > 0).map((item, index) => <li key={`${item.id}-kvk-${index}`}>{item.label} → {heroActionTarget(item)} · {fmt(item.eventPoints)} KvK Preparation points</li>)}</ol> : null}
        {plan.candidates?.some((item) => item.xp > 0) ? (
          <>
          {eventMode ? <p className={styles.note}>Supporting Enhancement steps award 0 KvK points but may be required to reach later eligible milestones.</p> : null}
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
          </>
        ) : null}
        <p className={styles.note}>
          XP reforging is offered only for non-Red gear at 100% recovery.
          Mastery reforging recovers 50% of Forgehammers and returns no Mythic Gear.
        </p>
        <PackOfferAdvisor title="Unlock the next blocked Hero Gear upgrade" resources={[{ key: "xp", label: "XP" }, { key: "forgehammers", label: "Forgehammers" }, { key: "mythicPieces", label: "Mythic pieces" }, { key: "mithril", label: "Mithril" }]} requirements={heroPackNeed} offers={inputs.packOffers} onOffersChange={(packOffers) => setInputs((current) => ({ ...current, packOffers }))} />
        <ExportButton name="hero-gear-plan" data={plan} />
      </aside>
    </div>
  );
}

export function GovernorGearPlanner({ toolKey = "governor-gear" }) {
  const [rows, setRows] = useState(createGovernorRows);
  const [inputs, setInputs] = useState({
    mode: "inventory",
    satin: 0,
    threads: 0,
    visions: 0,
    balance: 0,
    optimizationGoal: "stats",
    amplification: 1.25,
    troopWeights: optimizerProfiles.growth,
    statWeights: { Health: 1, Lethality: 1 },
    packGoal: "next",
    packOffers: [],
  });
  const saved = useMemo(() => ({ rows, ...inputs }), [rows, inputs]);
  const restore = useCallback((state) => {
    if (Array.isArray(state.rows)) setRows(normalizeGovernorRows(state.rows));
    setInputs((c) => ({ ...c, ...state, mode: "inventory", rows: undefined }));
  }, []);
  const persistence = useToolPersistence({
    toolKey,
    schemaVersion: 2,
    inputs: saved,
    restore,
    autoDetect: true,
  });
  const plan = useMemo(
    () => calculateGovernorGearPlan(rows, inputs),
    [rows, inputs],
  );
  const governorPackNeed = useMemo(() => {
    const candidates = (plan.nearMisses || []).slice(0, 1);
    return {
      satin: Math.max(0, candidates.reduce((sum, item) => sum + item.satin, 0) - (plan.remaining?.satin || 0)),
      threads: Math.max(0, candidates.reduce((sum, item) => sum + item.threads, 0) - (plan.remaining?.threads || 0)),
      visions: Math.max(0, candidates.reduce((sum, item) => sum + item.visions, 0) - (plan.remaining?.visions || 0)),
    };
  }, [plan]);
  const eventMode = inputs.optimizationGoal === "events";
  const governorPointsAreEstimated = plan.steps.some((step) => step.eventPointsProvenance !== "verified");
  return (
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <SaveState persistence={persistence} />
        <PlannerGuide
          toolKey="governor-gear"
          steps={[
            "Enter the Satin, Gilded Threads, and Artisan’s Visions you can spend.",
            "Set the current tier for all six pieces and protect anything you do not want changed.",
            "Choose a combat or event goal and follow the affordable upgrade order on the right.",
          ]}
          note="Matching three-piece tiers unlock Defense set bonuses; matching all six unlocks Attack bonuses."
          terms={[["Satin", "Governor Gear upgrade material."], ["Gilded Thread", "Governor Gear upgrade material."], ["Protect", "Keeps a piece out of the upgrade order."]]}
          onDemo={() => { setRows((current) => current.map((row, index) => ({ ...row, tier: index < 2 ? "Purple" : "Blue 3★", targetTier: "Purple 1★", locked: false }))); setInputs((current) => ({ ...current, satin: 900, threads: 180, visions: 12 })); }}
        />
        <div className={styles.section}>
          <SectionHeading
            title="Available inventory"
            description="The optimizer ranks the best use of the materials available to this plan."
          />
          <div className={styles.grid}>
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
                <option value="events">Optimize KvK Preparation points</option>
              </select>
            </Field>
          </div>
        </div>
        <EquipmentRows
          rows={rows}
          setRows={setRows}
          showTarget={false}
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
        <NextAction
          title={plan.steps[0] ? `${plan.steps[0].piece} → ${plan.steps[0].tier}` : "Add Governor Gear materials"}
          reason={plan.steps[0] ? (eventMode ? "This affordable upgrade has the highest KvK Preparation return under squared scarcity scoring." : "This is the highest-priority affordable stat upgrade, including any set-bonus gain.") : "No affordable unlocked upgrade is currently available."}
          before={plan.steps[0] ? rows.find((row) => row.label === plan.steps[0].piece)?.tier || "None" : "Current tiers"}
          after={plan.steps[0]?.tier || "No change"}
          resources={plan.steps[0] ? `${fmt(plan.steps[0].satin)} Satin · ${fmt(plan.steps[0].threads)} Threads · ${fmt(plan.steps[0].visions)} Visions` : "None"}
          remaining={plan.remaining ? `${fmt(plan.remaining.satin)} Satin · ${fmt(plan.remaining.threads)} Threads` : `${fmt(Math.max(0, inputs.satin - plan.totals.satin))} Satin · ${fmt(Math.max(0, inputs.threads - plan.totals.threads))} Threads`}
        />
        <DataLabel type="exact">tier costs + verified KvK rows</DataLabel>{governorPointsAreEstimated ? <DataLabel type="estimated">later KvK tiers</DataLabel> : null}{!eventMode ? <DataLabel type="subjective">troop priorities</DataLabel> : null}
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
            <span>{eventMode ? "KvK Preparation points" : "Power gain"}</span>
            <b>{fmt(eventMode ? plan.totals.eventPoints : plan.totals.powerGain)}</b>
          </div>
        </div>
        <p className={styles.note}>
          {plan.steps.length} upgrades planned. Matching 3-piece tiers activate
          Defense and matching 6-piece tiers activate Attack.
        </p>
        {!plan.steps.length ? (
          <p className={styles.status}>
            Add Satin, Gilded Threads, or Artisan’s Visions to generate the best affordable upgrade order.
          </p>
        ) : null}
        <ol className={styles.list}>
          {plan.steps.slice(0, 6).map((step, index) => (
            <li key={`${step.piece}-${index}`}>
              {step.piece} → {step.tier}: {fmt(step.satin)} Satin ·{" "}
              {fmt(step.threads)} Threads · {fmt(step.visions)} Visions ·{" "}
              {eventMode ? `${fmt(step.eventPoints)} KvK points (${step.eventPointsProvenance})` : `+${fmt(step.statGain + (step.setBonusGain || 0))}% weighted stat/set value`}
            </li>
          ))}
        </ol>
        {plan.steps.length > 6 ? <details className={styles.moreSteps}><summary>Show {plan.steps.length - 6} later upgrades</summary><ol className={styles.list}>{plan.steps.slice(6).map((step, index) => <li key={`${step.piece}-later-${index}`}>{step.piece} → {step.tier}: {fmt(step.satin)} Satin · {fmt(step.threads)} Threads · {fmt(step.visions)} Visions · {eventMode ? `${fmt(step.eventPoints)} KvK points (${step.eventPointsProvenance})` : `+${fmt(step.statGain + (step.setBonusGain || 0))}% weighted stat/set value`}</li>)}</ol></details> : null}
        <PackOfferAdvisor title="Unlock the next blocked Governor Gear upgrade" resources={[{ key: "satin", label: "Satin" }, { key: "threads", label: "Threads" }, { key: "visions", label: "Visions" }]} requirements={governorPackNeed} offers={inputs.packOffers} onOffersChange={(packOffers) => setInputs((current) => ({ ...current, packOffers }))} />
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
    locked: false,
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
        {inputs.master ? (
          <div className={styles.subjectBanner}>
            <Image
              src={`/images/kingshot/masters/${inputs.master.toLowerCase()}.png`}
              alt=""
              width={92}
              height={92}
            />
            <div>
              <strong>{inputs.master}</strong>
              <span>{MASTER_DATA[inputs.master].title} · Kingshot Master</span>
            </div>
          </div>
        ) : null}
        <PlannerGuide
          toolKey="masters"
          steps={[
            "Choose a Master and enter your current and target relationship levels.",
            "Add the Affinity, Emblems, and Manuscripts already in your inventory.",
            "For any skill you plan to raise, enter its current level, target level, and XP already learned toward the next level.",
          ]}
          note="Leave a skill target equal to its current level when you do not want to upgrade that skill."
          terms={[["Affinity", "Relationship progression resource."], ["Emblem", "Relationship milestone resource that can score during KvK Prep."], ["Manuscript", "Master skill resource that can score during KvK Prep."]]}
          onDemo={() => setInputs((current) => ({ ...current, master: "Valora", relationshipProgress: 5, targetRelationship: 10, affinity: 500, emblems: 8, manuscripts: 120, locked: false }))}
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
            <Field label="Goal preset" value="custom" onChange={() => {}}>
              <select defaultValue="custom" onChange={(event) => {
                if (event.target.value === "next") update("targetRelationship", Math.min(100, inputs.relationshipProgress + 1));
                if (event.target.value === "five") update("targetRelationship", Math.min(100, Math.ceil((inputs.relationshipProgress + 1) / 5) * 5));
                if (event.target.value === "ten") update("targetRelationship", Math.min(100, Math.ceil((inputs.relationshipProgress + 1) / 10) * 10));
              }}><option value="custom">Custom target</option><option value="next">Next level</option><option value="five">Next 5-level milestone</option><option value="ten">Next 10-level milestone</option></select>
            </Field>
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
          <label className={styles.lockControl}><input type="checkbox" checked={inputs.locked} onChange={(event) => update("locked", event.target.checked)} /> Protect this Master from recommendations</label>
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
        <NextAction
          title={inputs.locked ? `${inputs.master || "Master"} is protected` : `${inputs.master || "Choose a Master"} → relationship ${plan.target.level}`}
          reason={inputs.locked ? "Remove protection when you want this Master considered again." : `This reaches the next selected relationship milestone and provides ${plan.label}.`}
          before={`Relationship ${fmt(inputs.relationshipProgress)}`}
          after={`Relationship ${inputs.locked ? fmt(inputs.relationshipProgress) : plan.target.level}`}
          resources={`${fmt(plan.affinity)} Affinity · ${fmt(plan.emblems)} Emblems`}
          remaining={`${fmt(Math.max(0, inputs.affinity - plan.affinity))} Affinity · ${fmt(Math.max(0, inputs.emblems - plan.emblems))} Emblems`}
        />
        <DataLabel type="exact">relationship and skill costs</DataLabel>
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

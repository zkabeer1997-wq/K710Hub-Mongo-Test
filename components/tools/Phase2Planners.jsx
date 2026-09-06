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
    </label>
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
        <div className={styles.section}>
          <h2>Inventory and safeguards</h2>
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
              label="Refinement state/day"
              value={inputs.refinementState}
              onChange={(v) => update("refinementState", v)}
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
              label="Starting weekday (0 Sun–6 Sat)"
              value={inputs.startWeekday}
              onChange={(v) => update("startWeekday", Math.min(6, v))}
            />
          </div>
        </div>
        <div className={styles.section}>
          <h2>Plan target</h2>
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

export function PetProgressionPlanner() {
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
    Object.entries(result.shortfall || {}).map(([key, value]) => [
      key,
      String(value),
    ]),
  ).toString();
  return (
    <div className={styles.workspace}>
      <section className={styles.panel}>
        <SaveState persistence={persistence} />
        <div className={styles.section}>
          <h2>Pet target</h2>
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
            <Field
              label="Current advancement"
              value={inputs.currentAdvancement}
              onChange={(v) => update("currentAdvancement", v)}
            />
            <Field
              label="Target advancement"
              value={inputs.targetAdvancement}
              onChange={(v) => update("targetAdvancement", v)}
            />
          </div>
        </div>
        <div className={styles.section}>
          <h2>Current materials</h2>
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
            <Field
              label="Optional budget"
              value={inputs.budget}
              onChange={(v) => update("budget", v)}
            />
            <Field
              label="Optional deadline"
              type="date"
              value={inputs.deadline}
              onChange={(v) => update("deadline", v)}
            />
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

export function CharmStatPlanner() {
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
        <div className={styles.section}>
          <h2>Resources and subjective priorities</h2>
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
              label="Minimum balance constraint"
              value={inputs.minimumBalance}
              onChange={(v) => setInputs((c) => ({ ...c, minimumBalance: v }))}
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
            <Field
              label="Amplification factor"
              value={inputs.amplification}
              onChange={(v) => setInputs((c) => ({ ...c, amplification: v }))}
              step="0.05"
              min="1"
              max="2"
            />
            {Object.keys(inputs.troopWeights).map((key) => (
              <Field
                key={key}
                label={`${key} weight`}
                value={inputs.troopWeights[key]}
                onChange={(v) =>
                  setInputs((c) => ({
                    ...c,
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
        </div>
        <div className={styles.section}>
          <h2>All 18 charms</h2>
          {inputs.charms.map((charm) => (
            <div className={styles.row} key={charm.id}>
              <strong>
                {charm.type} #{charm.number}
              </strong>
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
              <span className={styles.note}>Health + Lethality</span>
            </div>
          ))}
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
        <Link className={styles.link} href="/tools/charm-pack-optimizer">
          Build required pack schedule
        </Link>
        <ExportButton name="charm-upgrade-plan" data={ranked} />
      </aside>
    </div>
  );
}

function EquipmentRows({ pieces, rows, setRows, hero = false }) {
  return (
    <div className={styles.section}>
      <h2>{hero ? "Twelve hero gear pieces" : "Six Governor Gear pieces"}</h2>
      {rows.map((row, index) => (
        <div className={styles.row} key={row.id}>
          <strong>{row.label}</strong>
          <Field
            label="Rarity / tier"
            type={hero ? "text" : "select"}
            value={row.tier}
            onChange={() => {}}
          >
            {hero ? (
              <input
                type="text"
                value={row.tier}
                onChange={(e) =>
                  setRows((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, tier: e.target.value } : item,
                    ),
                  )
                }
                placeholder="Gold"
              />
            ) : (
              <select
                value={row.tier}
                onChange={(e) =>
                  setRows((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, tier: e.target.value } : item,
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
              <Field
                label="Target mastery"
                value={row.targetMastery ?? row.mastery}
                onChange={(v) =>
                  setRows((current) =>
                    current.map((item, i) =>
                      i === index
                        ? { ...item, targetMastery: Math.max(item.mastery, v) }
                        : item,
                    ),
                  )
                }
              />
              <Field
                label="Ascension"
                value={row.ascension}
                onChange={(v) =>
                  setRows((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, ascension: v } : item,
                    ),
                  )
                }
              />
              <Field
                label="Imbuement"
                value={row.imbuement}
                onChange={(v) =>
                  setRows((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, imbuement: v } : item,
                    ),
                  )
                }
              />
              <Field
                label="Current stat contribution"
                value={row.currentStat}
                onChange={(v) =>
                  setRows((current) =>
                    current.map((item, i) =>
                      i === index ? { ...item, currentStat: v } : item,
                    ),
                  )
                }
              />
            </>
          ) : (
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
          )}
        </div>
      ))}
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
    activity: "pvp",
    mode: "inventory",
    xp: 0,
    consumableGear: 0,
    forgehammers: 0,
    mythicPieces: 0,
    mithril: 0,
    safeXpReforging: true,
    troopWeights: { Infantry: 3, Cavalry: 2, Archer: 2 },
    statWeights: { Health: 1, Lethality: 1 },
    gearWeights: {
      "Infantry.Health": 1.5,
      "Infantry.Lethality": 0.7,
      "Cavalry.Health": 0.2,
      "Cavalry.Lethality": 0.4,
      "Archer.Health": 0.7,
      "Archer.Lethality": 1.4,
    },
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
        <div className={styles.section}>
          <h2>Planning controls</h2>
          <div className={styles.grid}>
            <Field label="Role" value={inputs.role} onChange={() => {}}>
              <select
                value={inputs.role}
                onChange={(e) =>
                  setInputs((c) => ({ ...c, role: e.target.value }))
                }
              >
                <option value="rally-leader">Rally leader</option>
                <option value="rally-joiner">Rally joiner</option>
              </select>
            </Field>
            <Field label="Profile" value={inputs.activity} onChange={() => {}}>
              <select
                value={inputs.activity}
                onChange={(e) =>
                  setInputs((c) => ({ ...c, activity: e.target.value }))
                }
              >
                <option value="pvp">PvP</option>
                <option value="pve">PvE</option>
              </select>
            </Field>
            <Field label="Mode" value={inputs.mode} onChange={() => {}}>
              <select
                value={inputs.mode}
                onChange={(e) =>
                  setInputs((c) => ({ ...c, mode: e.target.value }))
                }
              >
                <option value="inventory">Available inventory</option>
                <option value="targets">Target planning</option>
              </select>
            </Field>
          </div>
        </div>
        <EquipmentRows hero rows={rows} setRows={setRows} />
        <div className={styles.section}>
          <h2>Editable priority profile</h2>
          <div className={styles.grid}>
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
            {Object.entries(inputs.statWeights).map(([key, value]) => (
              <Field
                key={key}
                label={`${key} weight`}
                value={value}
                onChange={(v) =>
                  setInputs((c) => ({
                    ...c,
                    statWeights: { ...c.statWeights, [key]: v },
                  }))
                }
              />
            ))}
          </div>
        </div>
        <div className={styles.section}>
          <h2>Available resources</h2>
          <div className={styles.grid}>
            {[
              ["xp", "Enhancement XP"],
              ["consumableGear", "Consumable gear"],
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
        ) : null}
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
    ["Cavalry", "Infantry", "Archer"].flatMap((troop) =>
      [1, 2].map((piece) => ({
        id: `${troop}-${piece}`,
        label: `${troop} ${piece}`,
        troop,
        tier: "",
        targetTier: "",
      })),
    ),
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
        <div className={styles.section}>
          <h2>Mode and inventory</h2>
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
              label="Minimum balance"
              value={inputs.balance}
              onChange={(v) => setInputs((c) => ({ ...c, balance: v }))}
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
              label="Amplification factor"
              value={inputs.amplification}
              onChange={(v) => setInputs((c) => ({ ...c, amplification: v }))}
              step="0.05"
              min="1"
              max="2"
            />
          </div>
        </div>
        <EquipmentRows pieces={governorPieces} rows={rows} setRows={setRows} />
        <div className={styles.section}>
          <h2>Editable priority profile</h2>
          <div className={styles.grid}>
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
            {Object.entries(inputs.statWeights).map(([key, value]) => (
              <Field
                key={key}
                label={`${key} weight`}
                value={value}
                onChange={(v) =>
                  setInputs((c) => ({
                    ...c,
                    statWeights: { ...c.statWeights, [key]: v },
                  }))
                }
              />
            ))}
          </div>
        </div>
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
        <div className={styles.section}>
          <h2>Master progression</h2>
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
              label="Expert level"
              value={inputs.expertLevel}
              onChange={(v) => update("expertLevel", v)}
            />
            <Field
              label="Relationship class"
              type="text"
              value={inputs.relationshipClass}
              onChange={(v) => update("relationshipClass", v)}
            />
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
            <Field
              label="Talent level"
              value={inputs.talentLevel}
              onChange={(v) => update("talentLevel", v)}
            />
            <Field
              label="Learning speed (%)"
              value={inputs.learningSpeed}
              onChange={(v) => update("learningSpeed", v)}
            />
          </div>
        </div>
        <div className={styles.section}>
          <h2>Inventory</h2>
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
          <h2>Skills and partially learned XP</h2>
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
        <ol className={styles.list}>
          {plan.skillRoadmap.map((skill) => (
            <li key={skill.name}>
              {skill.name}: level {skill.from} → {skill.to} · {fmt(skill.xp)} XP
              · {fmt(skill.manuscripts)} Manuscripts
            </li>
          ))}
        </ol>
        <ExportButton name="master-progression-plan" data={plan} />
      </aside>
    </div>
  );
}

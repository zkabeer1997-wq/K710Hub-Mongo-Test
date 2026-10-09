"use client";
import Image from "next/image";
import { useCallback, useMemo, useState } from "react";
import CharmPackOptimizer from "../../app/tools/CharmPackOptimizer";
import { CHARM_COSTS } from "../../lib/charmToolData.mjs";
import { optimizeOfferPacks } from "../../lib/offerPackOptimizer.mjs";
import {
  calculateGovernorGearPlan,
  calculateHeroGearPlan,
  rankCharmUpgrades,
} from "../../lib/progressionPhase2.mjs";
import {
  GOVERNOR_GEAR_LEVELS,
} from "../../lib/phase2Data.mjs";
import { useToolPersistence } from "../../lib/useToolPersistence";
import { useProfileSeed } from "../../lib/useProfileSeed";
import {
  applyProfileCharms,
  applyProfileGearToRows,
  profileCharmsDiffer,
  profileGearDiffers,
  profileHasCharms,
  profileHasGear,
} from "../../lib/profileToTools.mjs";
import ProfileSeedNotice from "./ProfileSeedNotice";
import {
  DataLabel,
  FirstUseGuide,
  NextAction,
  SaveToRoadmap,
} from "./PlannerExperience";
import { InfoTip } from "../ui";
import styles from "./Phase2Planner.module.css";

const number = (value) => Math.max(0, Number(value) || 0);
const fmt = (value) =>
  Number(value || 0).toLocaleString(undefined, { maximumFractionDigits: 2 });
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

function SectionHeading({ title, description, help }) {
  return (
    <header className={styles.sectionHeading}>
      <h2>{title}{help ? <> <InfoTip label={`About ${title}`}>{help}</InfoTip></> : null}</h2>
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
  return <details className={styles.packAdvisor} open={totalShortfall > 0 || undefined}>
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
  const profileSeed = useProfileSeed({
    toolKey,
    enabled: persistence.status !== "loading",
    save: persistence.saveNow,
    hasValues: (profile) => profileHasCharms(profile.charms),
    differs: (profile) => profileCharmsDiffer(inputs.charms, profile.charms),
    apply: (profile) => setInputs((current) => ({ ...current, charms: applyProfileCharms(current.charms, profile.charms) })),
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
        <ProfileSeedNotice seed={profileSeed} what="charm levels" />
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
        help={
          hero
            ? "Set the tier of each equipped piece for every troop type. Lock (protect) any piece you do not want the plan to touch."
            : "Set the current tier of all six pieces. Lock (protect) any piece you want left as-is, and it stays out of the recommended upgrade order."
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
  const profileSeed = useProfileSeed({
    toolKey,
    enabled: persistence.status !== "loading",
    save: persistence.saveNow,
    hasValues: (profile) => profileHasGear(profile.governor_gear),
    differs: (profile) => profileGearDiffers(rows, profile.governor_gear),
    apply: (profile) => setRows((current) => applyProfileGearToRows(current, profile.governor_gear)),
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
        <ProfileSeedNotice seed={profileSeed} what="Governor Gear tiers" />
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
            help="Enter the Satin, Gilded Threads, and Artisan’s Visions you can spend, then choose whether to optimize raw stats or KvK Preparation points. Only upgrades your materials can cover are recommended."
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

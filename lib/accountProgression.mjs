import { CHARM_COSTS } from "./charmToolData.mjs";
import { calculateCosts } from "./costPlanner.mjs";
import { SHOP_ITEMS as ADVENTURE_ITEMS } from "./adventureStall.mjs";
import { SHOP_ITEMS as DRAGON_ITEMS } from "./flamedragonShop.mjs";
import {
  calculateGovernorGearPlan,
  calculateHeroGearPlan,
  calculateMasterPlan,
  calculatePetProgression,
  planTtgProduction,
  rankCharmUpgrades,
} from "./progressionPhase2.mjs";
import { GOVERNOR_GEAR_LEVELS, MASTER_DATA } from "./phase2Data.mjs";

export const KVK_PREP_SOURCE = Object.freeze({
  name: "Kingshot KvK Prep Guide: Day 1 to Day 5 Priorities",
  url: "https://kingshotmastery.com/guides/kingshot-kvk-prep-guide",
  lastVerified: "2026-09-06",
});

export const KVK_PREP_DAYS = Object.freeze([
  {
    day: 1,
    focus: "Construction, True Gold, charms, and intel",
    checklist: [
      "Activate Wolf, Double Time, and coordinated minister buffs before spending",
      "Complete queued Watchtower Intel Missions",
    ],
  },
  {
    day: 2,
    focus: "Hero progression, research, Masters, and gathering",
    checklist: [
      "Use saved Hero Roulette spins and eligible Hero Shards",
      "Send gathering marches before reset",
    ],
  },
  {
    day: 3,
    focus: "Pets, hero progression, charms, Masters, and intel",
    checklist: [
      "Use saved Advanced Taming Marks and pet advancement",
      "Complete Watchtower Intel Missions",
    ],
  },
  {
    day: 4,
    focus: "Mithril, Hero Gear, charms, troops, and gathering",
    checklist: [
      "Train or promote troops at the highest available tier",
      "Use Mithril, Widgets, and Forgehammers only after checking the live event",
    ],
  },
  {
    day: 5,
    focus: "Governor Gear and broad stockpile cleanup",
    checklist: [
      "Use Governor Gear and remaining eligible stockpiles",
      "Complete Watchtower Intel Missions and gathering",
    ],
  },
]);

const KVK_ADDITIONAL_SOURCES = Object.freeze([
  {
    key: "intelMissions",
    title: "Complete Watchtower Intel Missions",
    points: 6000,
    days: [1, 3, 5],
    preferredDay: 1,
  },
  {
    key: "rouletteSpins",
    title: "Play Hero Roulette",
    points: 8000,
    days: [2, 3],
    preferredDay: 2,
  },
  {
    key: "mythicShards",
    title: "Use Mythic Hero Shards",
    points: 3040,
    days: [2, 3],
    preferredDay: 2,
  },
  {
    key: "epicShards",
    title: "Use Epic Hero Shards",
    points: 1220,
    days: [2, 3],
    preferredDay: 2,
  },
  {
    key: "rareShards",
    title: "Use Rare Hero Shards",
    points: 350,
    days: [2, 3],
    preferredDay: 2,
  },
  {
    key: "advancedTamingMarks",
    title: "Use Advanced Taming Marks",
    points: 15000,
    days: [3, 5],
    preferredDay: 3,
  },
  {
    key: "commonTamingMarks",
    title: "Use Common Taming Marks",
    points: 1150,
    days: [3, 5],
    preferredDay: 3,
  },
  {
    key: "widgets",
    title: "Use Hero Widgets",
    points: 8000,
    days: [4, 5],
    preferredDay: 5,
  },
  {
    key: "constructionSpeedupMinutes",
    title: "Use Construction Speedups",
    points: 30,
    days: [1, 2, 5],
    preferredDay: 1,
  },
  {
    key: "researchSpeedupMinutes",
    title: "Use Research Speedups",
    points: 30,
    days: [1, 2, 5],
    preferredDay: 2,
  },
  {
    key: "trainingSpeedupMinutes",
    title: "Use Training Speedups",
    points: 30,
    days: [1, 2, 4, 5],
    preferredDay: 4,
  },
  {
    key: "masterSpeedupMinutes",
    title: "Use Master Skill Speedups",
    points: 30,
    days: [1, 2, 5],
    preferredDay: 2,
  },
  {
    key: "gatheringBatches",
    title: "Gather resource scoring batches",
    points: 2,
    days: [2, 4, 5],
    preferredDay: 2,
  },
]);

const TROOP_KVK_POINTS = Object.freeze({
  1: 3,
  2: 4,
  3: 5,
  4: 8,
  5: 12,
  6: 18,
  7: 25,
  8: 35,
  9: 45,
  10: 60,
  11: 75,
});

export const DEFAULT_STAT_WEIGHTS = Object.freeze({
  attack: 1.25,
  defense: 1,
  health: 1.15,
  lethality: 1.25,
  governorGear: 1,
});

export const ACCOUNT_SYSTEMS = Object.freeze([
  {
    id: "heroGear",
    label: "Hero Gear",
    href: "/tools/hero-gear-optimizer",
    toolKey: "hero-gear",
  },
  {
    id: "governorGear",
    label: "Governor Gear",
    href: "/tools/governor-gear-optimizer",
    toolKey: "governor-gear",
  },
  {
    id: "charms",
    label: "Governor Charms",
    href: "/tools/governor-charm-optimizer",
    toolKey: "governor-charm-stats",
  },
  {
    id: "pets",
    label: "Pets",
    href: "/tools/pet-progression",
    toolKey: "pet-progression",
  },
  {
    id: "masters",
    label: "Masters",
    href: "/tools/masters-planner",
    toolKey: "masters",
  },
  {
    id: "construction",
    label: "Construction",
    href: "/tools/construction-costs/calculator",
    toolKey: "costs-construction",
  },
  {
    id: "academy",
    label: "Academy Research",
    href: "/tools/research-costs/academy",
    toolKey: "costs-academy",
  },
  {
    id: "warAcademy",
    label: "War Academy",
    href: "/tools/research-costs/war-academy",
    toolKey: "costs-war-academy",
  },
  {
    id: "advancedResearch",
    label: "Advanced Research",
    href: "/tools/research-costs/advanced-research",
    toolKey: "costs-advanced-research",
  },
  {
    id: "trueGold",
    label: "TG / TTG",
    href: "/tools/construction-costs/refining",
    toolKey: "ttg-production",
  },
  {
    id: "eventShops",
    label: "Event Shops",
    href: "/tools?category=Special+Event+Shops",
    toolKey: "flamedragon-shop",
  },
]);

// These profiles are planning preferences, never claimed as game formulas.
export const ACCOUNT_GOAL_PROFILES = Object.freeze({
  balanced: {
    label: "Balanced account growth",
    weights: Object.fromEntries(
      ACCOUNT_SYSTEMS.map((system) => [system.id, 1]),
    ),
  },
  rallyLeader: {
    label: "Rally-leader combat",
    weights: {
      heroGear: 2.5,
      governorGear: 2.1,
      charms: 2.1,
      pets: 1.2,
      masters: 1.2,
      construction: 0.6,
      academy: 1.2,
      warAcademy: 1.9,
      advancedResearch: 1.9,
      trueGold: 1.1,
      eventShops: 1.3,
    },
  },
  bearHunt: {
    label: "Bear Hunt improvement",
    weights: {
      heroGear: 2.2,
      governorGear: 1.3,
      charms: 1.6,
      pets: 1.1,
      masters: 1.9,
      construction: 0.5,
      academy: 1.1,
      warAcademy: 1.5,
      advancedResearch: 1.5,
      trueGold: 0.8,
      eventShops: 1.2,
    },
  },
  pvp: {
    label: "PvP improvement",
    weights: {
      heroGear: 2.3,
      governorGear: 2.2,
      charms: 2.2,
      pets: 1.2,
      masters: 1.1,
      construction: 0.7,
      academy: 1.2,
      warAcademy: 2,
      advancedResearch: 2,
      trueGold: 1,
      eventShops: 1.2,
    },
  },
  construction: {
    label: "Construction milestone",
    weights: {
      heroGear: 0.4,
      governorGear: 0.5,
      charms: 0.4,
      pets: 0.8,
      masters: 0.8,
      construction: 3,
      academy: 0.7,
      warAcademy: 0.7,
      advancedResearch: 0.8,
      trueGold: 2.5,
      eventShops: 1.1,
    },
  },
  research: {
    label: "Research milestone",
    weights: {
      heroGear: 0.5,
      governorGear: 0.5,
      charms: 0.5,
      pets: 0.7,
      masters: 0.8,
      construction: 0.8,
      academy: 2.4,
      warAcademy: 2.6,
      advancedResearch: 2.8,
      trueGold: 2.2,
      eventShops: 1.1,
    },
  },
  kvk: {
    label: "Prepare for the next KvK",
    weights: {
      heroGear: 2.2,
      governorGear: 2,
      charms: 2,
      pets: 1.2,
      masters: 1.2,
      construction: 1.1,
      academy: 1.5,
      warAcademy: 2,
      advancedResearch: 2,
      trueGold: 1.5,
      eventShops: 1.6,
    },
  },
  budget: {
    label: "Fixed weekly or monthly budget",
    weights: Object.fromEntries(
      ACCOUNT_SYSTEMS.map((system) => [system.id, 1]),
    ),
  },
  custom: {
    label: "Custom priorities",
    weights: Object.fromEntries(
      ACCOUNT_SYSTEMS.map((system) => [system.id, 1]),
    ),
  },
});

export const DEFAULT_ACCOUNT_WEIGHTS = Object.freeze(
  Object.fromEntries(ACCOUNT_SYSTEMS.map((system) => [system.id, 1])),
);

const asNumber = (value) => Math.max(0, Number(value) || 0);
const unwrap = (raw) =>
  raw?.envelopeVersion === 1 && raw.inputs && typeof raw.inputs === "object"
    ? raw.inputs
    : raw && typeof raw === "object"
      ? raw
      : null;
const hasPositive = (values) =>
  Object.values(values || {}).some((value) => asNumber(value) > 0);
const resourceText = (resources) =>
  Object.entries(resources || {})
    .filter(([, value]) => asNumber(value) > 0)
    .map(([key, value]) => `${asNumber(value).toLocaleString()} ${key}`)
    .join(" · ") || "No additional inventory required";

function governorGearScoreGain(rows, next) {
  const row = rows.find(
    (item) => item.id === next.id || item.label === next.piece,
  );
  const currentIndex = GOVERNOR_GEAR_LEVELS.findIndex(
    (item) => item.tier === row?.tier,
  );
  return Math.max(
    0,
    asNumber(next.power) - asNumber(GOVERNOR_GEAR_LEVELS[currentIndex]?.power),
  );
}

function masterStatDimensions(label, value) {
  const normalized = String(label || "").toLowerCase();
  return [
    ["attack", "Squad Attack"],
    ["defense", "Squad Defense"],
    ["lethality", "Squad Lethality"],
    ["health", "Squad Health"],
  ]
    .filter(([key]) =>
      key === "health"
        ? normalized.includes("health") || normalized.includes("hp")
        : normalized.includes(key),
    )
    .map(([key, statLabel]) => ({
      key,
      label: statLabel,
      value: asNumber(value),
    }));
}

function masterStatGain(masterName, currentRelationship, target) {
  const rows = MASTER_DATA[masterName]?.rows || [];
  const current = rows
    .filter((row) => row.level <= asNumber(currentRelationship))
    .at(-1);
  return Math.max(0, asNumber(target?.buff) - asNumber(current?.buff));
}

function statImpact(item, weights) {
  return (item.statDimensions || []).reduce(
    (sum, stat) =>
      sum + asNumber(stat.value) * asNumber(weights[stat.key] ?? 1),
    0,
  );
}

function bestKvkScoring(item) {
  const scored = (item.kvkScoring || []).filter((entry) =>
    Number.isFinite(entry.points),
  );
  return (
    scored.toSorted(
      (a, b) =>
        b.points - a.points ||
        Number(b.preferred) - Number(a.preferred) ||
        a.day - b.day,
    )[0] || null
  );
}

function opportunity(base) {
  return {
    verifiedStatus: "verified",
    feasible: true,
    days: 1,
    resources: {},
    shortfall: {},
    metric: null,
    statDimensions: [],
    kvkScoring: [],
    kvkTiming: null,
    ...base,
  };
}

function costOpportunity(system, state, dataset, kind) {
  if (!state?.selections?.length || !dataset?.items?.length) return null;
  try {
    const plan = calculateCosts(dataset, { ...state, kind });
    const step = plan.steps.find((item) => !item.prerequisite) || plan.steps[0];
    if (!step) return null;
    const costs = Object.fromEntries(
      Object.entries(step.costs || {}).filter(
        ([, value]) => asNumber(value) > 0,
      ),
    );
    const shortfall = Object.fromEntries(
      Object.entries(costs).map(([key, value]) => [
        key,
        Math.max(0, asNumber(value) - asNumber(state.inventory?.[key])),
      ]),
    );
    const direct = state.selections.find((item) => item.id === step.id);
    const trueGold = kind === "construction" ? asNumber(costs.truegold) : 0;
    const tempered =
      kind === "construction" ? asNumber(costs.temperedTruegold) : 0;
    const dust = kind === "research" ? asNumber(costs.truegold_dust) : 0;
    const pointValue = trueGold * 2000 + tempered * 30000 + dust * 1000;
    const preferredDay = kind === "construction" ? 1 : 2;
    return opportunity({
      id: `${system.id}:${step.key}`,
      system: system.id,
      systemLabel: system.label,
      title: `${step.name} → ${step.level}`,
      benefit: step.effect?.type
        ? `${step.effect.type}${step.effect.value ? ` +${step.effect.value}${step.effect.unit || ""}` : ""}`
        : step.powerGain
          ? `+${step.powerGain.toLocaleString()} power`
          : "Advances the saved milestone",
      resources: costs,
      shortfall,
      feasible: !hasPositive(shortfall),
      days: Math.max(1, Math.ceil(asNumber(step.adjustedSeconds) / 86400)),
      metric: step.powerGain || null,
      kvkScoring:
        pointValue > 0
          ? [1, 2, 5].map((day) => ({
              day,
              points: pointValue,
              preferred: day === preferredDay,
              formula: `${trueGold.toLocaleString()} True Gold × 2,000 + ${tempered.toLocaleString()} Tempered True Gold × 30,000 + ${dust.toLocaleString()} True Gold Dust × 1,000`,
              verifiedStatus: "community-reported",
            }))
          : [],
      kvkTiming:
        pointValue > 0
          ? null
          : {
              when: `day-${preferredDay}`,
              note: `Relevant on KvK Prep Day ${preferredDay}, but exact points require a listed scoring resource or an entered speedup amount.`,
            },
      href: system.href,
      sourceToolKey: system.toolKey,
      datasetIds: [
        system.id === "construction"
          ? "construction-costs"
          : system.id === "academy"
            ? "academy-research"
            : system.id === "warAcademy"
              ? "war-academy-research"
              : "advanced-research",
      ],
      rationale: direct
        ? "This is the next direct step in your saved target."
        : "This prerequisite unlocks the next direct step in your saved target.",
    });
  } catch {
    return null;
  }
}

function shopOpportunity(
  system,
  state,
  items,
  currencyKey,
  ownedKey,
  label,
  href,
) {
  if (!state?.cart) return null;
  const selected = items.filter((item) => asNumber(state.cart[item.key]) > 0);
  if (!selected.length) return null;
  const required = selected.reduce(
    (sum, item) =>
      sum + asNumber(state.cart[item.key]) * asNumber(item[currencyKey]),
    0,
  );
  const owned = asNumber(state[ownedKey]);
  const short = Math.max(0, required - owned);
  return opportunity({
    id: `eventShops:${currencyKey}`,
    system: "eventShops",
    systemLabel: system.label,
    title: `Complete saved ${label} cart`,
    benefit: `${selected.length} selected reward${selected.length === 1 ? "" : "s"}`,
    resources: { [currencyKey]: required },
    shortfall: { [currencyKey]: short },
    feasible: short === 0 || asNumber(state.cashBudget) > 0,
    days: Math.max(1, asNumber(state.daysRemaining) || 1),
    href,
    sourceToolKey:
      label === "Dragon's Caravan" ? "flamedragon-shop" : "adventure-stall",
    datasetIds: [
      label === "Dragon's Caravan" ? "dragons-caravan" : "adventure-stall",
    ],
    verifiedStatus: "incomplete",
    kvkTiming: {
      when: "before-prep",
      note: `Acquire the saved ${label} rewards before KvK, then spend any scoring materials on their listed Prep day. Shop currency itself does not score.`,
    },
    rationale: `Uses the shopping list and priorities saved in ${label}. Pack and shop values retain their own provenance status.`,
  });
}

export function buildAccountOpportunities({
  savedStates = {},
  datasets = {},
  manual = [],
} = {}) {
  const states = Object.fromEntries(
    Object.entries(savedStates).map(([key, value]) => [key, unwrap(value)]),
  );
  const result = [];
  const system = (id) => ACCOUNT_SYSTEMS.find((item) => item.id === id);

  const hero = states["hero-gear"];
  if (hero?.rows?.length) {
    const plan = calculateHeroGearPlan(hero.rows, hero);
    const next = plan.recommendation;
    if (next)
      result.push(
        opportunity({
          id: `heroGear:${next.id}`,
          system: "heroGear",
          systemLabel: system("heroGear").label,
          title: `${next.label} → enhancement ${next.targetLevel}`,
          benefit: `+${asNumber(next.statGain).toLocaleString()}% ${next.stat}`,
          resources: {
            XP: next.xp,
            Forgehammers: next.forgehammers,
            Mithril: next.mithril,
            "Mythic pieces": next.mythic,
          },
          metric: next.statGain,
          statDimensions: [
            {
              key: String(next.stat).toLowerCase(),
              label: `${next.troop || next.label.split(" ")[0]} ${next.stat}`,
              value: asNumber(next.statGain),
            },
          ],
          kvkScoring: [4, 5].map((day) => ({
            day,
            points:
              asNumber(next.mithril) * 40000 +
              asNumber(next.forgehammers) * 4000,
            preferred: day === 5,
            formula: `${asNumber(next.mithril)} Mithril × 40,000 + ${asNumber(next.forgehammers)} Forgehammers × 4,000`,
            verifiedStatus: "community-reported",
          })),
          href: system("heroGear").href,
          sourceToolKey: "hero-gear",
          datasetIds: ["hero-gear-progression"],
          rationale:
            "The Hero Gear optimizer identified this as the next affordable action under your saved build profile.",
        }),
      );
  }

  const charms = states["governor-charm-stats"];
  if (charms?.charms?.length) {
    const plan = rankCharmUpgrades(
      charms.charms,
      CHARM_COSTS,
      { guides: charms.guides, designs: charms.designs },
      {
        troops: charms.troopWeights || {},
        stats: charms.statWeights || {},
        amplification: charms.amplification,
        mode: charms.optimizationGoal,
      },
      { minimumBalance: charms.minimumBalance },
    );
    const next = plan.upgrades[0];
    if (next)
      result.push(
        opportunity({
          id: `charms:${next.id}:${next.level}`,
          system: "charms",
          systemLabel: system("charms").label,
          title: `${next.type} charm ${next.number} → level ${next.level}`,
          benefit: `+${next.health}% Health and +${next.lethality}% Lethality`,
          resources: { Guides: next.guides, Designs: next.designs },
          metric: next.power,
          statDimensions: [
            {
              key: "health",
              label: `${next.type} Health`,
              value: asNumber(next.health),
            },
            {
              key: "lethality",
              label: `${next.type} Lethality`,
              value: asNumber(next.lethality),
            },
          ],
          kvkScoring: [1, 3, 4].map((day) => ({
            day,
            points: asNumber(next.power) * 70,
            preferred: day === 1,
            formula: `${asNumber(next.power).toLocaleString()} Governor Charm max score × 70`,
            verifiedStatus: "community-reported",
          })),
          href: system("charms").href,
          sourceToolKey: "governor-charm-stats",
          datasetIds: ["charm-stats"],
          rationale:
            "This is the first affordable step from the saved charm sequence and respects the saved troop priorities.",
        }),
      );
  }

  const governor = states["governor-gear"];
  if (governor?.rows?.length) {
    const plan = calculateGovernorGearPlan(governor.rows, governor);
    const next = plan.steps?.[0];
    if (next) {
      const resources = {
        Satin: next.satin,
        Threads: next.threads,
        Visions: next.visions,
      };
      const shortfall = {
        Satin: Math.max(0, asNumber(next.satin) - asNumber(governor.satin)),
        Threads: Math.max(
          0,
          asNumber(next.threads) - asNumber(governor.threads),
        ),
        Visions: Math.max(
          0,
          asNumber(next.visions) - asNumber(governor.visions),
        ),
      };
      result.push(
        opportunity({
          id: `governorGear:${next.id || next.piece}:${next.tier}`,
          system: "governorGear",
          systemLabel: system("governorGear").label,
          title: `${next.piece} → ${next.tier}`,
          benefit: `+${asNumber(next.statGain).toLocaleString()}% stat`,
          resources,
          shortfall,
          feasible: !hasPositive(shortfall),
          metric: next.power,
          statDimensions: [
            {
              key: "governorGear",
              label: `${next.troop || String(next.piece).split(" ")[0]} Governor Gear stat`,
              value: asNumber(next.statGain),
            },
          ],
          kvkScoring: [
            {
              day: 5,
              points: governorGearScoreGain(governor.rows, next) * 36,
              preferred: true,
              formula: `${governorGearScoreGain(governor.rows, next).toLocaleString()} Governor Gear max score × 36`,
              verifiedStatus: "community-reported",
            },
          ],
          href: system("governorGear").href,
          sourceToolKey: "governor-gear",
          datasetIds: ["governor-gear-progression"],
          rationale:
            "The Governor Gear optimizer selected this as the next step under your saved balance and troop priorities.",
        }),
      );
    }
  }

  const pet = states["pet-progression"];
  if (pet?.pet && asNumber(pet.targetLevel) > asNumber(pet.currentLevel)) {
    const plan = calculatePetProgression(pet);
    const next = plan.steps?.[0];
    if (next) {
      const resources = {
        Food: next.food,
        Manuals: next.manuals,
        Potions: next.potions,
        Medallions: next.medallions,
      };
      const available = pet.inventory || {};
      const lookup = {
        Food: "food",
        Manuals: "manuals",
        Potions: "potions",
        Medallions: "medallions",
      };
      const shortfall = Object.fromEntries(
        Object.entries(resources).map(([key, value]) => [
          key,
          Math.max(0, asNumber(value) - asNumber(available[lookup[key]])),
        ]),
      );
      result.push(
        opportunity({
          id: `pets:${pet.pet}:${next.toLevel}`,
          system: "pets",
          systemLabel: system("pets").label,
          title: `${pet.pet} → level ${next.toLevel}`,
          benefit: "Advances the saved pet target",
          resources,
          shortfall,
          feasible: !hasPositive(shortfall),
          href: system("pets").href,
          sourceToolKey: "pet-progression",
          datasetIds: ["pet-progression"],
          kvkTiming: {
            when: "day-3",
            note: "Use the pet advancement on Day 3 (or Day 5). Exact KvK points are withheld because the saved pet dataset does not include the advancement-score increase.",
          },
          rationale:
            "This is the next level in the saved pet roadmap; advancement materials are included at milestone levels.",
        }),
      );
    }
  }

  const master = states.masters;
  if (
    master?.master &&
    (asNumber(master.targetRelationship) >
      asNumber(master.relationshipProgress) ||
      master.skills?.some(
        (skill) => asNumber(skill.targetLevel) > asNumber(skill.level),
      ))
  ) {
    const plan = calculateMasterPlan(master);
    const shortfall = plan.shortfall || {};
    const verifiedStatGain = masterStatGain(
      master.master,
      master.relationshipProgress,
      plan.target,
    );
    result.push(
      opportunity({
        id: `masters:${master.master}:${plan.target?.level || "skill"}`,
        system: "masters",
        systemLabel: system("masters").label,
        title: `${master.master} → relationship ${plan.target?.level || master.targetRelationship}`,
        benefit: verifiedStatGain
          ? `+${verifiedStatGain}% ${plan.label}`
          : "Advances the saved Master roadmap",
        resources: {
          Affinity: plan.affinity,
          Emblems: plan.emblems,
          Manuscripts: plan.manuscripts,
        },
        shortfall,
        feasible: !hasPositive(shortfall),
        href: system("masters").href,
        sourceToolKey: "masters",
        datasetIds: ["master-progression"],
        statDimensions: masterStatDimensions(plan.label, verifiedStatGain),
        kvkScoring: [2, 3].map((day) => ({
          day,
          points:
            asNumber(plan.emblems) * 6000 + asNumber(plan.manuscripts) * 60,
          preferred: day === 2,
          formula: `${asNumber(plan.emblems)} Master Emblems × 6,000 + ${asNumber(plan.manuscripts)} Manuscripts × 60`,
          verifiedStatus: "community-reported",
        })),
        rationale:
          "Uses the next relationship milestone and skill targets saved in the Masters planner.",
      }),
    );
  }

  const ttg = states["ttg-production"];
  if (ttg && asNumber(ttg.requiredTempered) > asNumber(ttg.temperedTrueGold)) {
    const plan = planTtgProduction(ttg);
    const next = plan.schedule?.find((day) => day.runs > 0);
    if (next)
      result.push(
        opportunity({
          id: `trueGold:day-${next.day}`,
          system: "trueGold",
          systemLabel: system("trueGold").label,
          title: `Run ${next.runs} TTG refinement${next.runs === 1 ? "" : "s"}`,
          benefit: `${asNumber(next.temperedProduced).toLocaleString()} projected TTG (${asNumber(next.range?.min).toLocaleString()}–${asNumber(next.range?.max).toLocaleString()})`,
          resources: { "True Gold": next.trueGoldSpent },
          days: next.day,
          href: system("trueGold").href,
          sourceToolKey: "ttg-production",
          datasetIds: ["ttg-refinement"],
          kvkTiming: {
            when: "before-prep",
            note: "Refining True Gold does not itself score. Complete this early enough to spend the resulting Tempered True Gold on a building upgrade during Day 1, 2, or 5.",
          },
          rationale: `This is the next funded day in the saved ${ttg.riskMode || "conservative"} refinement schedule while preserving the protected reserve.`,
        }),
      );
  }

  for (const [id, key, datasetKey, kind] of [
    ["construction", "costs-construction", "construction", "construction"],
    ["academy", "costs-academy", "academy", "research"],
    ["warAcademy", "costs-war-academy", "warAcademy", "research"],
    [
      "advancedResearch",
      "costs-advanced-research",
      "advancedResearch",
      "research",
    ],
  ]) {
    const candidate = costOpportunity(
      system(id),
      states[key],
      datasets[datasetKey],
      kind,
    );
    if (candidate) result.push(candidate);
  }

  const dragon = shopOpportunity(
    system("eventShops"),
    states["flamedragon-shop"],
    DRAGON_ITEMS,
    "essence",
    "ownedEssence",
    "Dragon's Caravan",
    "/tools/flamedragon-shop",
  );
  const adventure = shopOpportunity(
    system("eventShops"),
    states["adventure-stall"],
    ADVENTURE_ITEMS,
    "shells",
    "ownedShells",
    "Adventure Stall",
    "/tools/adventure-stall",
  );
  if (dragon) result.push(dragon);
  if (adventure) result.push(adventure);

  for (const [index, item] of (manual || []).entries()) {
    if (
      !item?.title ||
      !ACCOUNT_SYSTEMS.some((entry) => entry.id === item.system)
    )
      continue;
    const meta = system(item.system);
    result.push(
      opportunity({
        id: `manual:${index}:${item.system}`,
        system: item.system,
        systemLabel: meta.label,
        title: String(item.title).slice(0, 120),
        benefit: item.benefit || "Member-entered planning benefit",
        feasible: item.feasible !== false,
        days: Math.max(1, Math.trunc(asNumber(item.days) || 1)),
        href: meta.href,
        sourceToolKey: null,
        datasetIds: [],
        verifiedStatus: "manual",
        rationale:
          item.notes ||
          "Manual override supplied by the member; no game value was inferred.",
      }),
    );
  }
  return result;
}

function rankWithWeights(opportunities, config, weights) {
  const profile =
    ACCOUNT_GOAL_PROFILES[config.goal] || ACCOUNT_GOAL_PROFILES.custom;
  const deadlineDays = config.targetDate
    ? Math.ceil(
        (new Date(`${config.targetDate}T00:00:00Z`) -
          new Date(
            `${config.startDate || new Date().toISOString().slice(0, 10)}T00:00:00Z`,
          )) /
          86400000,
      )
    : null;
  return opportunities
    .map((item) => {
      const memberWeight = Math.max(0, asNumber(weights[item.system]));
      const goalFit = Math.max(0, asNumber(profile.weights[item.system] ?? 1));
      const feasibility = item.feasible ? 1 : 0.55;
      const deadline =
        deadlineDays && deadlineDays > 0
          ? item.days <= deadlineDays
            ? 1
            : Math.max(0.35, deadlineDays / item.days)
          : 1;
      const baseScore = memberWeight * goalFit * feasibility * deadline;
      const statScore = statImpact(item, {
        ...DEFAULT_STAT_WEIGHTS,
        ...(config.statWeights || {}),
      });
      const kvk = bestKvkScoring(item);
      const objective = config.objective || "balanced";
      const objectiveFit =
        objective === "stats"
          ? statScore
          : objective === "kvkPoints"
            ? asNumber(kvk?.points)
            : 1;
      const score = baseScore * objectiveFit;
      return {
        ...item,
        score,
        statScore,
        bestKvkDay: kvk?.day || null,
        kvkPoints: kvk?.points ?? null,
        scoreBreakdown: {
          memberWeight,
          goalFit,
          feasibility,
          deadline,
          objective,
          objectiveFit,
        },
      };
    })
    .filter((item) => config.includeInfeasible !== false || item.feasible)
    .sort(
      (a, b) =>
        b.score - a.score ||
        Number(b.feasible) - Number(a.feasible) ||
        a.days - b.days ||
        a.id.localeCompare(b.id),
    );
}

export function calculateKvkPrepSchedule(opportunities, config = {}) {
  const days = KVK_PREP_DAYS.map((day) => ({ ...day, actions: [], points: 0 }));
  const beforePrep = [];
  const noExactScore = [];
  const additional = config.kvkInventory || {};
  const addAction = (day, action) => {
    const target = days[day - 1];
    if (!target) return;
    target.actions.push(action);
    target.points += asNumber(action.kvkPoints);
  };

  for (const source of KVK_ADDITIONAL_SOURCES) {
    const quantity = asNumber(additional[source.key]);
    if (!quantity) continue;
    addAction(source.preferredDay, {
      id: `kvk:${source.key}`,
      system: "kvkActivity",
      systemLabel: "KvK inventory",
      title: source.title,
      benefit: `${quantity.toLocaleString()} planned`,
      feasible: true,
      resources: { [source.title]: quantity },
      shortfall: {},
      kvkPoints: quantity * source.points,
      kvkFormula: `${quantity.toLocaleString()} × ${source.points.toLocaleString()} points`,
      alternativeDays: source.days.filter((day) => day !== source.preferredDay),
      verifiedStatus: "community-reported",
      href: "/tools/account-progression",
    });
  }

  const troopCount = asNumber(additional.troopCount);
  const troopTier = Math.max(
    1,
    Math.min(11, Math.trunc(asNumber(additional.troopTier) || 1)),
  );
  if (troopCount) {
    const perTroop = TROOP_KVK_POINTS[troopTier];
    addAction(4, {
      id: "kvk:troop-training",
      system: "kvkActivity",
      systemLabel: "KvK inventory",
      title: `Train or promote T${troopTier} troops`,
      benefit: `${troopCount.toLocaleString()} troops planned`,
      feasible: true,
      resources: { [`T${troopTier} troops`]: troopCount },
      shortfall: {},
      kvkPoints: troopCount * perTroop,
      kvkFormula: `${troopCount.toLocaleString()} T${troopTier} troops × ${perTroop} points`,
      alternativeDays: [],
      verifiedStatus: "community-reported",
      href: "/tools/account-progression",
    });
  }

  for (const item of opportunities || []) {
    const preferred = bestKvkScoring(item);
    if (preferred) {
      addAction(preferred.day, {
        ...item,
        kvkPoints: preferred.points,
        kvkFormula: preferred.formula,
        alternativeDays: item.kvkScoring
          .filter((entry) => entry.day !== preferred.day)
          .map((entry) => entry.day),
      });
    } else if (item.kvkTiming?.when === "before-prep") {
      beforePrep.push(item);
    } else if (item.kvkTiming?.when?.startsWith("day-")) {
      const day = Number(item.kvkTiming.when.slice(4));
      if (days[day - 1])
        days[day - 1].actions.push({
          ...item,
          kvkPoints: null,
          kvkFormula: item.kvkTiming.note,
          alternativeDays: [],
        });
      noExactScore.push(item);
    }
  }
  for (const day of days) {
    day.actions.sort(
      (a, b) =>
        Number(b.feasible) - Number(a.feasible) ||
        asNumber(b.kvkPoints) - asNumber(a.kvkPoints) ||
        a.title.localeCompare(b.title),
    );
  }
  const prepStart = config.kvkStartDate
    ? new Date(`${config.kvkStartDate}T00:00:00Z`)
    : null;
  if (prepStart && !Number.isNaN(prepStart.valueOf())) {
    days.forEach((day, index) => {
      const date = new Date(prepStart);
      date.setUTCDate(date.getUTCDate() + index);
      day.date = date.toISOString().slice(0, 10);
    });
  }
  return {
    days,
    beforePrep,
    noExactScore,
    totalExactPoints: days.reduce((sum, day) => sum + day.points, 0),
    dailyChestTarget: Math.max(0, asNumber(config.dailyChestTarget) || 200000),
    source: KVK_PREP_SOURCE,
  };
}

export function rankAccountProgression(opportunities, config = {}) {
  const weights = {
    ...DEFAULT_ACCOUNT_WEIGHTS,
    ...(config.systemWeights || {}),
  };
  const ranked = rankWithWeights(opportunities || [], config, weights);
  const limit = Math.max(
    1,
    Math.min(20, Math.trunc(asNumber(config.maxRecommendations) || 8)),
  );
  const selected = ranked.slice(0, limit);
  const deferred = ranked.slice(limit);
  const ranks = Object.fromEntries(
    ranked.map((item, index) => [item.id, [index + 1]]),
  );
  for (const system of ACCOUNT_SYSTEMS) {
    for (const factor of [0.75, 1.25]) {
      const trial = rankWithWeights(opportunities || [], config, {
        ...weights,
        [system.id]: weights[system.id] * factor,
      });
      trial.forEach((item, index) => ranks[item.id]?.push(index + 1));
    }
  }
  const sensitivity = selected.map((item) => ({
    id: item.id,
    title: item.title,
    minRank: Math.min(...ranks[item.id]),
    maxRank: Math.max(...ranks[item.id]),
    stable: Math.min(...ranks[item.id]) === Math.max(...ranks[item.id]),
  }));
  const horizonWeeks = Math.max(
    1,
    Math.ceil((asNumber(config.horizonDays) || 28) / 7),
  );
  const weekly = selected.map((item) => ({
    week: Math.min(horizonWeeks, Math.max(1, Math.ceil(item.days / 7))),
    id: item.id,
    system: item.systemLabel,
    action: item.title,
    resources: resourceText(item.resources),
  }));
  const bottlenecks = selected
    .filter((item) => !item.feasible)
    .flatMap((item) =>
      Object.entries(item.shortfall || {})
        .filter(([, value]) => asNumber(value) > 0)
        .map(([resource, value]) => ({
          system: item.systemLabel,
          resource,
          amount: value,
        })),
    );
  return {
    ranked,
    selected,
    deferred,
    weekly,
    sensitivity,
    bottlenecks,
    kvkSchedule: calculateKvkPrepSchedule(selected, config),
    exact: false,
    methodology:
      config.objective === "stats"
        ? "Best-stat score = verified percentage-point stat gain × editable stat weight, then adjusted by member system priority, goal fit, feasibility, and deadline fit. Power values are not mixed with percentages."
        : config.objective === "kvkPoints"
          ? "KvK score uses the published per-item or per-max-score Prep values, then applies editable member priorities, feasibility, and deadline fit. Actions without enough source data for exact Prep points remain visible but are not assigned invented points."
          : "Subjective planning score = member system weight × selected-goal fit × feasibility × deadline fit. Verified game calculations remain inside their source planners and are not converted into a universal power value.",
  };
}

export function accountPlanCsv(plan) {
  const rows = [
    [
      "Rank",
      "System",
      "Action",
      "Benefit",
      "Feasible",
      "Planning score",
      "Stat-impact score",
      "Best KvK day",
      "Exact KvK points",
      "Resources",
      "Reason",
    ],
  ];
  plan.selected.forEach((item, index) =>
    rows.push([
      index + 1,
      item.systemLabel,
      item.title,
      item.benefit,
      item.feasible ? "Yes" : "No",
      item.score.toFixed(3),
      item.statScore.toFixed(3),
      item.bestKvkDay || "",
      item.kvkPoints ?? "",
      resourceText(item.resources),
      item.rationale,
    ]),
  );
  return rows
    .map((row) =>
      row
        .map(
          (value) =>
            `"${String(value ?? "")
              .replace(/^[=+@-]/, "'")
              .replaceAll('"', '""')}"`,
        )
        .join(","),
    )
    .join("\r\n");
}

export function accountPlanDiscord(plan) {
  const lines = ["**K710 Account Progression Plan**"];
  plan.selected.forEach((item, index) =>
    lines.push(
      `${index + 1}. **${item.systemLabel}** — ${item.title}\n   ${item.benefit} · ${resourceText(item.resources)}`,
    ),
  );
  if (plan.bottlenecks.length)
    lines.push(
      "",
      `**Bottlenecks:** ${plan.bottlenecks.map((item) => `${item.amount.toLocaleString()} ${item.resource} (${item.system})`).join("; ")}`,
    );
  if (plan.kvkSchedule?.days?.some((day) => day.actions.length)) {
    lines.push("", "**KvK Prep timing**");
    for (const day of plan.kvkSchedule.days) {
      if (!day.actions.length) continue;
      lines.push(
        `Day ${day.day}: ${day.actions.map((item) => `${item.title}${item.kvkPoints == null ? " (points not calculated)" : ` (${item.kvkPoints.toLocaleString()} pts)`}`).join("; ")}`,
      );
    }
  }
  return lines.join("\n");
}

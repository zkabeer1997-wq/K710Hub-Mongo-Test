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

function opportunity(base) {
  return {
    verifiedStatus: "verified",
    feasible: true,
    days: 1,
    resources: {},
    shortfall: {},
    metric: null,
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
    result.push(
      opportunity({
        id: `masters:${master.master}:${plan.target?.level || "skill"}`,
        system: "masters",
        systemLabel: system("masters").label,
        title: `${master.master} → relationship ${plan.target?.level || master.targetRelationship}`,
        benefit: plan.target?.buff
          ? `+${plan.target.buff}% ${plan.label}`
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
      const score = memberWeight * goalFit * feasibility * deadline;
      return {
        ...item,
        score,
        scoreBreakdown: { memberWeight, goalFit, feasibility, deadline },
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
    exact: false,
    methodology:
      "Subjective planning score = member system weight × selected-goal fit × feasibility × deadline fit. Verified game calculations remain inside their source planners and are not converted into a universal power value.",
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
  return lines.join("\n");
}

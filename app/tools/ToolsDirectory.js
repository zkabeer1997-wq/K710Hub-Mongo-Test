"use client";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const CATEGORIES = [
  "Charms",
  "Governor Gear",
  "Hero Gear",
  "Pets",
  "Masters",
  "Special Event Shops",
  "Construction Costs",
  "Research Costs",
];
const TOOLS = {
  Charms: [
    {
      key: "governor-charm-optimizer",
      event: "Account progression",
      title: "Governor Charm Stat Optimizer",
      description:
        "Rank upgrades across all 18 charms using inventory, troop priorities, and Health/Lethality focus.",
      status: "New",
      icon: "/images/kingshot/charms/infantry.webp",
      tags: ["Upgrade planning", "Inventory"],
    },
    {
      key: "charm-pack-optimizer",
      event: "Governor Charms",
      title: "Charm Pack Optimizer",
      description:
        "Set all 18 charms individually, calculate every upgrade material, and build the cheapest week-by-week pack plan.",
      status: "New",
      icon: "/images/kingshot/charms/cavalry.webp",
    },
    {
      key: "wavebound-charms",
      event: "Wavebound Voyage",
      title: "Charms Sailing Optimizer",
      description:
        "Calculate Tidal Treasure merges for a target Charm level, including Exquisite and Majestic outcomes.",
      status: "Available",
      icon: "/images/wavebound-charm-sail.svg",
    },
  ],
  "Governor Gear": [
    {
      key: "governor-gear-optimizer",
      event: "Account progression",
      title: "Governor Gear Optimizer",
      description:
        "Model all six pieces, plan target tiers, and prepare inventory-based upgrade ordering.",
      status: "New",
      icon: "/images/kingshot/governor-gear/infantry_gear_1_green_t0_s0.webp",
      tags: ["Upgrade planning", "Inventory"],
    },
  ],
  "Hero Gear": [
    {
      key: "hero-gear-optimizer",
      event: "Account progression",
      title: "Hero Gear Optimizer",
      description:
        "Track 12 gear pieces, resources, role, and combat priorities in one upgrade workspace.",
      status: "New",
      icon: "/images/kingshot/hero-gear/infantry-helm.png",
      tags: ["Upgrade planning", "Inventory"],
    },
  ],
  Pets: [
    {
      key: "pet-progression",
      event: "Pet progression",
      title: "Pet Progression Planner",
      description:
        "Set pet level and advancement goals, track materials, and send shortfalls into pack planning.",
      status: "New",
      icon: "/images/kingshot/pets/gray-wolf.webp",
      tags: ["Upgrade planning", "Inventory"],
    },
    {
      key: "pet-pack-optimizer",
      event: "Pet Advancement",
      title: "Pet Pack Optimizer",
      description:
        "Enter your material target and inventory, then get the cheapest repeatable week-by-week pack and chest redemption plan.",
      status: "New",
      icon: "/images/kingshot/pets/grizzly-bear.webp",
    },
  ],
  Masters: [
    {
      key: "masters-planner",
      event: "Master progression",
      title: "Masters Planner",
      description:
        "Track relationships, talents, skills, partially learned XP, resources, and learning speed.",
      status: "New",
      icon: "/images/kingshot/masters/valora.png",
      tags: ["Upgrade planning", "Inventory"],
    },
  ],
  "Special Event Shops": [
    {
      key: "flamedragon-shop",
      event: "Flamedragon Tyrant",
      title: "Dragon’s Caravan Optimizer",
      description:
        "Build a reward cart, prioritize the best-value shop items, and calculate the cheapest Dragon Essence pack combination.",
      status: "New",
      icon: "/images/flamedragon-caravan.svg",
    },
    {
      key: "adventure-stall",
      event: "Adventure Stall",
      title: "Adventure Stall Optimizer",
      description:
        "Choose your event rewards and calculate the lowest-cost daily pack plan after using the Shells already in your inventory.",
      status: "New",
      icon: "/images/adventure-stall.svg",
    },
  ],
  "Construction Costs": [],
  "Research Costs": [],
};

const DIRECT_TOOLS = [
  {
    key: "ttg-production",
    category: "Construction Costs",
    event: "True Gold refining",
    title: "Tempered True Gold Production Planner",
    description:
      "Plan refinement around protected True Gold reserves and imported construction or research requirements.",
    status: "New",
    icon: "/images/adventure-stall.svg",
    href: "/tools/construction-costs/refining",
    tags: ["Upgrade planning", "Inventory"],
  },
  {
    key: "construction-costs",
    category: "Construction Costs",
    event: "Construction",
    title: "Construction Calculator",
    description:
      "Plan building costs, prerequisites, resources, and completion time.",
    status: "Available",
    icon: "/images/charm-pack-forge.svg",
    href: "/tools/construction-costs/calculator",
    tags: ["Upgrade planning", "Inventory"],
  },
  {
    key: "research-costs",
    category: "Research Costs",
    event: "Research",
    title: "Research Cost Calculators",
    description:
      "Plan Academy, War Academy, and Advanced Research costs and prerequisites.",
    status: "Available",
    icon: "/images/wavebound-charm-sail.svg",
    href: "/tools/research-costs",
    tags: ["Upgrade planning", "Inventory"],
  },
];
const PLANNED = [
  { title: "Alliance Championship Planner", category: "Alliance operations" },
  { title: "Rally & Formation Planner", category: "Alliance operations" },
  { title: "Account Progression Planner", category: "Cross-system planning" },
];
const FILTERS = [
  "All",
  "Upgrade planning",
  "Inventory",
  "Packs and spending",
  "Events",
  "Alliance operations",
];
const toolTags = (tool) =>
  tool.tags ||
  (["charm-pack-optimizer", "pet-pack-optimizer"].includes(tool.key)
    ? ["Upgrade planning", "Inventory", "Packs and spending"]
    : ["Events", "Packs and spending"]);

const STATUS_TONE = {
  New: "tool-badge-new",
  Available: "tool-badge-available",
};

function CategoryGlyph({ category }) {
  const common = {
    viewBox: "0 0 48 48",
    "aria-hidden": true,
    className: "tools-menu-glyph",
  };
  if (category === "Charms") {
    return (
      <svg {...common}>
        <path
          d="M24 6 L38 16 L33 34 L15 34 L10 16 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (category === "Governor Gear") {
    return (
      <svg {...common}>
        <path
          d="M24 5 L39 11 V23 C39 33 32 40 24 43 C16 40 9 33 9 23 V11 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (category === "Hero Gear") {
    return (
      <svg {...common}>
        <path
          d="M14 8 L34 28 M28 8 L8 28"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        <circle
          cx="34"
          cy="34"
          r="7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
        />
      </svg>
    );
  }
  if (category === "Pets") {
    return (
      <svg {...common}>
        <circle
          cx="24"
          cy="30"
          r="9"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
        />
        <circle
          cx="13"
          cy="16"
          r="4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <circle
          cx="35"
          cy="16"
          r="4.2"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        />
        <circle
          cx="24"
          cy="10"
          r="4"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        />
      </svg>
    );
  }
  if (category === "Masters") {
    return (
      <svg {...common}>
        <path
          d="M9 32 L9 18 L17 25 L24 13 L31 25 L39 18 L39 32 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (category === "Construction Costs") {
    return (
      <svg {...common}>
        <path
          d="M8 38 V22 L24 10 L40 22 V38 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path
          d="M18 38 V28 H30 V38"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinejoin="round"
        />
        <path
          d="M24 10 V6"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (category === "Research Costs") {
    return (
      <svg {...common}>
        <path
          d="M16 8 H32 V20 C32 28 28 32 24 38 C20 32 16 28 16 20 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <path
          d="M20 14 H28 M20 20 H28"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path
        d="M9 18 H39 V36 H9 Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinejoin="round"
      />
      <path
        d="M9 24 H39 M18 18 V13 C18 10 20 8 24 8 C28 8 30 10 30 13 V18"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function ToolBox({ tool, query }) {
  return (
    <Link
      key={tool.key}
      href={`${tool.href || `/tools/${tool.key}`}${query}`}
      className="tool-box"
      role="listitem"
    >
      <span className={`tool-box-badge ${STATUS_TONE[tool.status] || ""}`}>
        {tool.status}
      </span>
      <span className="tool-box-icon" aria-hidden="true">
        <span className="tool-box-icon-glow" />
        <Image
          className="tool-box-icon-art"
          src={tool.icon}
          alt=""
          width={72}
          height={72}
        />
      </span>
      <span className="k-mark tool-box-event">{tool.event}</span>
      <strong className="k-display tool-box-title">{tool.title}</strong>
      <span className="tool-box-desc">{tool.description}</span>
      <span className="tool-box-cta">
        Open tool <b aria-hidden="true">→</b>
      </span>
    </Link>
  );
}

export default function ToolsDirectory({ memberId, category }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All");
  const [saved, setSaved] = useState([]);
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : "";
  const categoryQuery = (name) => {
    const params = new URLSearchParams();
    if (memberId) params.set("member_id", memberId);
    params.set("category", name);
    return `?${params.toString()}`;
  };

  const selected = CATEGORIES.includes(category) ? category : "";
  const allTools = useMemo(
    () => [
      ...Object.entries(TOOLS).flatMap(([toolCategory, items]) =>
        items.map((item) => ({
          ...item,
          category: toolCategory,
          tags: toolTags(item),
        })),
      ),
      ...DIRECT_TOOLS,
    ],
    [],
  );
  const visible = allTools.filter(
    (tool) =>
      (!selected || tool.category === selected) &&
      (!search ||
        `${tool.title} ${tool.description} ${tool.category}`
          .toLowerCase()
          .includes(search.toLowerCase())) &&
      (filter === "All" || tool.tags.includes(filter)),
  );
  useEffect(() => {
    if (!memberId) return;
    fetch("/api/tool-state", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => setSaved(data?.plans || []))
      .catch(() => {});
  }, [memberId]);

  if (!selected) {
    return (
      <section className="tools-catalog">
        <div className="tools-find">
          <label>
            <span>Search tools</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search charms, packs, research…"
            />
          </label>
          <div aria-label="Filter tools">
            {FILTERS.map((name) => (
              <button
                key={name}
                type="button"
                aria-pressed={filter === name}
                onClick={() => setFilter(name)}
              >
                {name}
              </button>
            ))}
          </div>
        </div>
        {saved.length > 0 && (
          <div className="tools-continue">
            <div>
              <span className="k-mark">Member plans</span>
              <h2>Continue your saved plan</h2>
            </div>
            {saved.slice(0, 3).map((plan) => {
              const tool = allTools.find(
                (item) =>
                  item.key === plan.tool_key ||
                  `costs-${item.key}` === plan.tool_key,
              );
              return tool ? (
                <Link
                  key={plan.tool_key}
                  href={`${tool.href || `/tools/${tool.key}`}${query}`}
                >
                  {tool.title}
                  <small>
                    Updated {new Date(plan.updated_at).toLocaleDateString()}
                  </small>
                </Link>
              ) : null;
            })}
          </div>
        )}
        <nav className="tools-menu" aria-label="Tool categories">
          {CATEGORIES.map((name) => {
            const count = allTools.filter(
              (tool) => tool.category === name,
            ).length;
            return (
              <Link
                className="tools-menu-tile"
                href={`/tools${categoryQuery(name)}`}
                key={name}
              >
                <span className="tools-menu-icon">
                  <CategoryGlyph category={name} />
                </span>
                <strong className="k-display tools-menu-title">{name}</strong>
                <span className="tools-menu-count">
                  {count} {count === 1 ? "tool" : "tools"}
                </span>
              </Link>
            );
          })}
        </nav>
        <div className="tools-category-head">
          <span className="k-mark">Available now</span>
          <h2 className="k-display">Calculators</h2>
          <span className="tools-category-count">{visible.length} shown</span>
        </div>
        {visible.length ? (
          <div className="tools-grid" role="list">
            {visible.map((tool) => (
              <ToolBox key={tool.key} tool={tool} query={query} />
            ))}
          </div>
        ) : (
          <div className="tools-empty">
            <h3>No matching tools</h3>
            <p>Try another search or filter.</p>
          </div>

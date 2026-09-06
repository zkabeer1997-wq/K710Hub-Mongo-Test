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
    key: "account-progression",
    category: "Cross-system planning",
    event: "Whole-account roadmap",
    title: "Account Progression Planner",
    description:
      "Combine your saved gear, charm, pet, Master, construction, research, True Gold, and event-shop plans into one ranked weekly roadmap.",
    status: "New",
    icon: "/images/kingshot/hero-gear/infantry-helm.png",
    href: "/tools/account-progression",
    tags: ["Upgrade planning", "Inventory", "Packs and spending"],
  },
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
  const [showBuilder, setShowBuilder] = useState(false);
  const [builderGoal, setBuilderGoal] = useState("kvk");
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

  useEffect(() => {
    try { setShowBuilder(localStorage.getItem("k710-account-builder-seen") !== "yes"); } catch {}
  }, []);

  if (!selected) {
    return (
      <section className="tools-catalog">
        <div className="tools-builder">
          <div>
            <span className="k-mark">New member pathway</span>
            <h2>Build my account plan</h2>
            <p>Tell us what matters most. We will guide you through only the relevant planners, then assemble the results into one roadmap.</p>
          </div>
          <button type="button" onClick={() => setShowBuilder((value) => !value)}>{showBuilder ? "Hide setup" : "Start guided setup"}</button>
          {showBuilder ? <div className="tools-builder-flow">
            <ol><li><b>1</b><span>Review the levels already stored in your Player Profile.</span></li><li><b>2</b><span>Complete the source optimizers relevant to your goal.</span></li><li><b>3</b><span>Open the Account Planner for your ranked upgrades and KvK calendar.</span></li></ol>
            <label>My main goal<select value={builderGoal} onChange={(event) => setBuilderGoal(event.target.value)}><option value="kvk">Prepare for KvK</option><option value="stats">Best combat stat gains</option><option value="balanced">Balanced account growth</option></select></label>
            <div><Link href={`/power-profile${query}`}>1. Review Player Profile</Link><Link href={`/tools/account-progression${query}${query ? "&" : "?"}goal=${builderGoal}`} onClick={() => { try { localStorage.setItem("k710-account-builder-seen", "yes"); } catch {} }}>2. Open guided roadmap →</Link></div>
          </div> : null}
        </div>
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
        )}
        <div className="tools-development">
          <div>
            <span className="k-mark">In development</span>
            <h2>Planned tools</h2>
            <p>
              These are listed separately until their calculators and game data
              are ready.
            </p>
          </div>
          <ul>
            {PLANNED.map((item) => (
              <li key={item.title}>
                <strong>{item.title}</strong>
                <span>{item.category}</span>
              </li>
            ))}
          </ul>
        </div>

        <style>{`
          .tools-catalog{color:var(--parchment);perspective:1200px}
          .tools-builder{display:grid;grid-template-columns:1fr auto;gap:14px;margin-bottom:22px;padding:20px;border:1px solid rgba(201,164,78,.4);border-left:4px solid var(--brass);border-radius:12px;background:linear-gradient(135deg,rgba(201,164,78,.12),rgba(7,12,17,.94));box-shadow:0 16px 38px rgba(0,0,0,.24)}.tools-builder h2{margin:5px 0;font:500 25px var(--font-display)}.tools-builder p{max-width:720px;margin:0;color:var(--parchment-dim);font-size:12px;line-height:1.6}.tools-builder>button,.tools-builder-flow a{align-self:center;padding:10px 13px;border:1px solid var(--brass);background:rgba(201,164,78,.08);color:var(--gold-hot);font:700 10px var(--font-body);letter-spacing:.05em;text-decoration:none;cursor:pointer}.tools-builder-flow{grid-column:1/-1;display:grid;grid-template-columns:1.5fr .7fr;gap:18px;padding-top:14px;border-top:1px solid var(--edge)}.tools-builder-flow ol{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;list-style:none;margin:0;padding:0}.tools-builder-flow li{display:flex;gap:8px;padding:9px;border:1px solid var(--edge);color:var(--parchment-dim);font-size:10px;line-height:1.45}.tools-builder-flow li b{color:var(--brass)}.tools-builder-flow label{display:grid;gap:5px;color:var(--brass);font-size:10px}.tools-builder-flow select{padding:9px;border:1px solid var(--edge);background:#071219;color:var(--parchment)}.tools-builder-flow>div{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end}
          .tools-find{display:flex;flex-direction:column;gap:12px;margin-bottom:26px}.tools-find label span{display:block;margin-bottom:6px;color:var(--brass-bright);font-size:11px;font-weight:800}.tools-find input{width:100%;padding:12px 14px;border:1px solid var(--edge-strong);border-radius:var(--radius-md);background:rgba(7,8,13,.8);color:var(--parchment);font-size:15px}.tools-find>div{display:flex;gap:7px;overflow:auto;padding-bottom:3px}.tools-find button{flex:none;border:1px solid var(--edge);border-radius:var(--radius-pill);padding:7px 10px;background:transparent;color:var(--parchment-dim);cursor:pointer}.tools-find button[aria-pressed=true]{border-color:var(--brass);background:rgba(201,164,78,.12);color:var(--gold-hot)}
          .tools-continue{display:flex;align-items:center;gap:10px;margin-bottom:28px;padding:15px;border:1px solid var(--edge-strong);border-radius:var(--radius-md);background:rgba(201,164,78,.06)}.tools-continue>div{margin-right:auto}.tools-continue h2{margin:4px 0 0;font-size:16px}.tools-continue a{display:flex;flex-direction:column;gap:3px;min-width:160px;padding:10px;border:1px solid var(--edge);border-radius:var(--radius-sm);color:var(--parchment);text-decoration:none}.tools-continue small{color:var(--t-secondary)}
          .tools-development{display:grid;grid-template-columns:minmax(220px,.7fr) 1.3fr;gap:28px;margin-top:38px;padding-top:24px;border-top:1px solid var(--edge)}.tools-development h2{margin:5px 0;font-size:20px}.tools-development p{color:var(--parchment-dim);font-size:12px}.tools-development ul{display:grid;grid-template-columns:1fr 1fr;gap:8px;list-style:none;margin:0;padding:0}.tools-development li{display:flex;justify-content:space-between;gap:12px;padding:10px 12px;border-bottom:1px solid var(--edge);font-size:12px}.tools-development li span{color:var(--t-secondary)}
          .tools-menu-tile{
            display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;
            position:relative;padding:26px 18px 30px;border:1px solid rgba(201,164,78,.42);border-radius:12px;
            background:linear-gradient(155deg,rgba(48,39,21,.9),rgba(12,14,22,.96) 58%);
            text-decoration:none;color:inherit;
            box-shadow:0 12px 24px rgba(0,0,0,.5),inset 0 1px rgba(255,229,157,.2),inset 0 -7px 12px rgba(0,0,0,.3);
            transform:rotateX(3deg);transform-origin:bottom;transition:transform .2s var(--ease-cine,ease),border-color .2s ease,box-shadow .2s ease;
          }
          .tools-menu{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin:4px 0 36px;padding:4px 3px 14px}
          .tools-menu-tile:hover,.tools-menu-tile:focus-visible{
            transform:translateY(-5px) rotateX(0);border-color:rgba(240,194,87,.86);outline:none;
            box-shadow:0 19px 34px rgba(0,0,0,.58),inset 0 1px rgba(255,235,184,.3),inset 0 -5px 10px rgba(0,0,0,.22);
          }
          .tools-menu-tile:active{transform:translateY(3px) rotateX(1deg);box-shadow:0 6px 12px rgba(0,0,0,.46),inset 0 2px 8px rgba(0,0,0,.34)}
          .tools-menu-icon{width:60px;height:60px;display:grid;place-items:center;color:var(--gold-hot)}
          .tools-menu-glyph{width:44px;height:44px}
          .tools-menu-title{font-size:16px;letter-spacing:.06em;color:var(--parchment)}
          .tools-menu-count{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--brass)}
          @media(max-width:900px){.tools-menu{grid-template-columns:repeat(2,minmax(0,1fr))}}
          @media(max-width:700px){.tools-builder,.tools-builder-flow{grid-template-columns:1fr}.tools-builder-flow ol{grid-template-columns:1fr}.tools-builder-flow>div{flex-direction:column}.tools-continue{align-items:stretch;flex-direction:column}.tools-continue>div{margin:0}.tools-development{grid-template-columns:1fr}.tools-development ul{grid-template-columns:1fr}.tools-menu{gap:12px}.tools-menu-tile{padding:20px 12px 24px}}
        `}</style>
      </section>
    );
  }

  const tools = visible;

  return (
    <section className="tools-catalog">
      <Link href={`/tools${query}`} className="tools-category-back">
        ← All categories
      </Link>

      <div className="tools-category-block">
        <div className="tools-category-head">
          <span className="k-mark">Tool category</span>
          <h2 className="k-display">{selected}</h2>
          <span className="tools-category-count">
            {tools.length} tool{tools.length === 1 ? "" : "s"}
          </span>
        </div>

        {tools.length ? (
          <div className="tools-grid" role="list">
            {tools.map((tool) => (
              <ToolBox key={tool.key} tool={tool} query={query} />
            ))}
          </div>
        ) : (
          <div className="tools-empty">
            <span aria-hidden="true">◇</span>
            <h3 className="k-display">No {selected} tools yet</h3>
            <p className="k-narrative">
              Calculators added to this category will appear here.
            </p>
          </div>
        )}
      </div>

      <style>{`
        .tools-catalog{color:var(--parchment);display:flex;flex-direction:column;gap:8px}
        .tools-category-back{display:inline-block;margin-bottom:22px;color:var(--brass);font-family:var(--font-body);font-size:12px;text-decoration:none;letter-spacing:.06em}
        .tools-category-back:hover{color:var(--gold-hot)}

        .tools-category-head{display:flex;flex-direction:column;align-items:flex-start;gap:4px;padding-bottom:20px;position:relative}
        .tools-category-head h2{margin:4px 0 0;color:var(--parchment);font-size:clamp(22px,3.6vw,32px);letter-spacing:.08em}
        .tools-category-count{position:absolute;right:0;top:2px;color:var(--brass);font-family:var(--font-mono);font-size:10.5px;letter-spacing:.08em;text-transform:uppercase}

        .tools-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}

        .tool-box{
          position:relative;display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;
          padding:28px 20px 24px;border:1px solid rgba(201,164,78,.24);border-radius:10px;
          background:linear-gradient(155deg,rgba(35,29,17,.84),rgba(9,10,18,.94) 60%);
          text-decoration:none;color:inherit;
          box-shadow:0 12px 25px rgba(0,0,0,.48),inset 0 1px rgba(255,229,157,.16),inset 0 -7px 12px rgba(0,0,0,.3);
          transform:rotateX(2deg);transform-origin:bottom;
          transition:transform .18s var(--ease-cine,ease),border-color .18s ease,box-shadow .18s ease,background .18s ease;
        }
        .tool-box:hover,.tool-box:focus-visible{
          transform:translateY(-5px) rotateX(0);border-color:rgba(201,164,78,.7);outline:none;
          box-shadow:0 20px 36px rgba(0,0,0,.56),inset 0 1px rgba(255,235,184,.24);
          background:linear-gradient(180deg,rgba(28,23,13,.82),rgba(11,12,21,.92));
        }
        .tool-box-badge{
          position:absolute;top:12px;right:12px;font-family:var(--font-mono);font-size:9.5px;font-weight:700;
          letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
          background:rgba(201,164,78,.14);color:var(--brass);border:1px solid rgba(201,164,78,.3);
        }
        .tool-badge-new{background:rgba(65,164,255,.14);color:#7fbfff;border-color:rgba(65,164,255,.32)}
        .tool-badge-available{background:rgba(201,164,78,.14);color:var(--gold-hot);border-color:rgba(201,164,78,.32)}

        .tool-box-icon{position:relative;width:88px;height:88px;display:grid;place-items:center;margin-top:6px;isolation:isolate}
        .tool-box-icon-art{position:relative;z-index:2;object-fit:contain;filter:drop-shadow(0 10px 10px rgba(0,0,0,.55));transition:transform .2s var(--ease-cine,ease)}
        .tool-box-icon-glow{position:absolute;z-index:1;inset:6px;border-radius:50%;background:radial-gradient(circle,rgba(65,164,255,.2),rgba(201,164,78,.09) 46%,transparent 72%);filter:blur(8px);opacity:.72}
        .tool-box:hover .tool-box-icon-art{transform:translateY(-3px) scale(1.06)}

        .tool-box-event{color:var(--brass);font-size:10px;letter-spacing:.06em}
        .tool-box-title{font-size:clamp(16px,2vw,19px);letter-spacing:.04em;color:var(--parchment);line-height:1.25}
        .tool-box-desc{color:var(--parchment-dim);font-size:13px;line-height:1.55}
        .tool-box-cta{
          margin-top:auto;padding-top:10px;font-family:var(--font-mono);font-size:11px;font-weight:700;
          letter-spacing:.06em;text-transform:uppercase;color:var(--gold-hot);display:inline-flex;align-items:center;gap:6px;
        }
        .tool-box-cta b{font-family:var(--font-body);font-weight:400;font-size:14px;transition:transform .18s var(--ease-cine,ease)}
        .tool-box:hover .tool-box-cta b{transform:translateX(3px)}

        .tools-empty{min-height:160px;border:1px dashed var(--edge);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--t-muted);gap:4px}
        .tools-empty>span{color:var(--brass);font-size:32px}
        .tools-empty h3{color:var(--parchment);margin:6px 0 2px;letter-spacing:.06em;font-size:16px}
        .tools-empty p{margin:0;font-size:13px}

        @media(max-width:700px){
          .tools-category-head{padding-bottom:16px}
          .tools-category-count{position:static;order:-1}
          .tools-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
          .tool-box{padding:22px 14px 18px}
        }
      `}</style>
    </section>
  );
}

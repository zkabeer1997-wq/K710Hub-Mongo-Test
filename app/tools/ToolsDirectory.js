'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import Icon from '../../components/ui/icons';
import { TOOL_CATEGORIES, resolveToolCategory, toolFreshness } from '../../lib/toolCategories.mjs';

const CATEGORY_LABEL = Object.fromEntries(TOOL_CATEGORIES.map((c) => [c.id, c.label]));

const TOOLS = [
  { key: 'hero-gear', category: 'gear', event: 'Stats + KvK Preparation', title: 'Hero Gear Optimizer', description: 'Optimize Enhancement, Mastery, Red ascension, imbuement, reforging, and the exact four-resource shortfall.' },
  { key: 'governor-gear', category: 'gear', event: 'Stats + KvK Preparation', title: 'Governor Gear Optimizer', description: 'Rank all six pieces with squared scarcity, troop priorities, set bonuses, and sourced KvK upgrade points.' },
  { key: 'governor-gear-sailing-tool', category: 'gear', event: "Governor's Expedition", title: 'Governor Gear Sailing Tool', description: 'Calculate Governor Gear chest merges for a target tier, including Exquisite and Majestic outcomes.', status: 'New' },
  { key: 'charms', category: 'charms', event: 'Stats + KvK Preparation', title: 'Charms Optimizer', description: 'Optimize all 18 charms with exact level costs, shared inventory, target planning, and connected weekly packs.' },
  { key: 'charm-sailing-optimizer', category: 'charms', event: 'Wavebound Voyage', title: 'Charm Sailing Optimizer', description: 'Calculate Tidal Treasure merges for a target Charm level, including Exquisite and Majestic outcomes.', status: 'Available' },
  { key: 'pets', category: 'pets-masters', event: 'Progression + weekly packs', title: 'Pets Optimizer', description: 'Plan every pet from the complete dataset and turn the combined shortfall into a weekly pack schedule.' },
  { key: 'masters', category: 'pets-masters', event: 'Progression + monthly packs', title: 'Masters Optimizer', description: 'Combine multiple relationship and skill targets, partial Affinity progress, inventory, and purchase scheduling.' },
  { key: 'construction', category: 'construction-research', event: 'TG1–TG10 + refining', title: 'Construction Planner', description: 'Combine eight building targets, supplied TG and TTG tier totals, inventory shortfalls, and a daily Tempered True Gold schedule.' },
  { key: 'research', category: 'construction-research', event: 'Academy + War Academy', title: 'Unified Research Planner', description: 'Plan exact Academy, War Academy, and Advanced Research levels with prerequisites, inventory shortfalls, adjusted time, and exports.' },
  { key: 'dragons-caravan-optimizer', category: 'event-shops', event: 'Flamedragon Tyrant', title: 'Dragon’s Caravan Optimizer', description: 'Build a reward cart, prioritize the best-value shop items, and calculate the cheapest Dragon Essence pack combination.', status: 'New' },
  { key: 'adventure-stall', category: 'event-shops', event: 'Adventure Stall', title: 'Adventure Stall Optimizer', description: 'Choose your event rewards and calculate the lowest-cost daily pack plan after using the Shells already in your inventory.', status: 'New' },
  { key: 'account-progression', category: 'planning', event: 'Whole-account roadmap', title: 'Account Progression Planner', description: 'Combine your saved gear, charm, pet, Master, construction, research, True Gold, and event-shop plans into one ranked weekly roadmap.', status: 'New' },
];

const TOOL_ICON = {
  'hero-gear': 'gear',
  'governor-gear': 'gear',
  'governor-gear-sailing-tool': 'sail',
  charms: 'charms',
  masters: 'masters',
  pets: 'pets',
  construction: 'construction',
  research: 'research',
  'account-progression': 'roadmap',
  'charm-sailing-optimizer': 'sail',
  'dragons-caravan-optimizer': 'shop',
  'adventure-stall': 'shop',
};

const STATUS_TONE = {
  New: 'tool-badge-new',
  Available: 'tool-badge-available',
  Updated: 'tool-badge-available',
};

function ToolBox({ tool, query, saved }) {
  // Freshness comes from the dataset manifest; tools without a verified date fall back to their status.
  const freshness = toolFreshness(tool.key);
  const badge = freshness ? `Updated ${freshness.label}` : tool.status;
  return (
    <Link key={tool.key} href={`/tools/${tool.key}${query}`} className="tool-box">
      {badge ? <span className={`tool-box-badge ${freshness ? STATUS_TONE.Updated : STATUS_TONE[tool.status] || ''}`}>{badge}</span> : null}
      <span className="tool-box-icon" aria-hidden="true">
        <Icon name={TOOL_ICON[tool.key] || 'gear'} size={26} />
      </span>
      <span className="tool-box-category">{CATEGORY_LABEL[tool.category]}</span>
      <strong className="k-display tool-box-title">{tool.title}</strong>
      <span className="tool-box-desc">{tool.description}</span>
      <span className="tool-box-foot">
        <span className="tool-box-cta">Open tool <b aria-hidden="true">→</b></span>
        {saved ? <span className="tool-box-saved"><span aria-hidden="true">✓</span> Saved plan</span> : null}
      </span>
    </Link>
  );
}

export default function ToolsDirectory({ memberId, category, savedPlans = {} }) {
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState(() => resolveToolCategory(category));

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return TOOLS.filter((tool) => {
      const matchesCategory = selected === null || tool.category === selected;
      const matchesSearch =
        !q ||
        tool.title.toLowerCase().includes(q) ||
        tool.description.toLowerCase().includes(q) ||
        CATEGORY_LABEL[tool.category].toLowerCase().includes(q);
      return matchesCategory && matchesSearch;
    });
  }, [search, selected]);

  return (
    <section className="tools-catalog">
      <div className="tools-toolbar">
        <div className="k-field tools-search">
          <label className="k-label" htmlFor="tools-search">Search tools</label>
          <input
            id="tools-search"
            type="search"
            className="k-input"
            placeholder="Search by name or description…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="tools-categories" role="group" aria-label="Filter by category">
          {[null, ...TOOL_CATEGORIES].map((c) => (
            <button
              key={c?.id ?? 'all-tools'}
              type="button"
              aria-pressed={selected === (c?.id ?? null)}
              className={`tools-category-tab ${selected === (c?.id ?? null) ? 'is-active' : ''}`}
              onClick={() => setSelected(c?.id ?? null)}
            >
              {c?.label ?? 'All'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="tools-empty">
          <span aria-hidden="true">◇</span>
          <h3 className="k-display">No tools match</h3>
          <p className="k-narrative">Try a different search term or category.</p>
        </div>
      ) : (
        <div className="tools-grid">
          {filtered.map((tool) => <ToolBox key={tool.key} tool={tool} query={query} saved={Object.hasOwn(savedPlans, tool.key)} />)}
        </div>
      )}

      <style>{`
        .tools-catalog{color:var(--parchment);display:flex;flex-direction:column;gap:22px}

        .tools-toolbar{display:flex;gap:22px;flex-wrap:wrap;align-items:end}
        .tools-search{flex:1 1 280px;max-width:420px}
        .tools-search .k-label{color:var(--brass)}
        .tools-categories{display:flex;flex-wrap:wrap;gap:7px}
        .tools-category-tab{
          padding:9px 13px;border:1px solid rgba(201,164,78,.24);border-radius:6px;
          background:rgba(20,17,10,.5);color:var(--parchment-dim);
          font-family:var(--font-body);font-size:11px;font-weight:800;letter-spacing:.05em;text-transform:uppercase;cursor:pointer;
          transition:border-color .16s ease,background .16s ease,color .16s ease;
        }
        .tools-category-tab:hover{border-color:rgba(201,164,78,.55);color:var(--parchment)}
        .tools-category-tab.is-active{border-color:var(--gold-aged);background:rgba(201,164,78,.16);color:var(--gold-hot)}
        .tools-category-tab:focus-visible{outline:2px solid var(--gold-hot);outline-offset:2px}

        .tools-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}

        .tool-box{
          position:relative;display:flex;flex-direction:column;align-items:flex-start;text-align:left;gap:10px;
          padding:22px 20px 20px;border:1px solid rgba(201,164,78,.24);border-radius:10px;
          background:linear-gradient(180deg,rgba(20,17,10,.7),rgba(9,10,18,.86));
          text-decoration:none;color:inherit;
          transition:transform .18s var(--ease-cine,ease),border-color .18s ease,box-shadow .18s ease,background .18s ease;
        }
        .tool-box:hover,.tool-box:focus-visible{
          transform:translateY(-4px);border-color:rgba(201,164,78,.7);outline:none;
          box-shadow:0 14px 30px rgba(0,0,0,.4),0 0 0 1px rgba(201,164,78,.2);
          background:linear-gradient(180deg,rgba(28,23,13,.82),rgba(11,12,21,.92));
        }
        .tool-box:focus-visible{outline:2px solid var(--gold-hot);outline-offset:3px}
        .tool-box-badge{
          position:absolute;top:12px;right:12px;font-family:var(--font-mono);font-size:9.5px;font-weight:700;
          letter-spacing:.08em;text-transform:uppercase;padding:3px 9px;border-radius:999px;
          background:rgba(201,164,78,.14);color:var(--brass);border:1px solid rgba(201,164,78,.3);
        }
        .tool-badge-new{background:rgba(65,164,255,.14);color:#7fbfff;border-color:rgba(65,164,255,.32)}
        .tool-badge-available{background:rgba(201,164,78,.14);color:var(--gold-hot);border-color:rgba(201,164,78,.32)}

        .tool-box-icon{width:48px;height:48px;display:grid;place-items:center;border:1px solid rgba(201,164,78,.34);border-radius:var(--radius-md);color:var(--gold-hot);background:rgba(201,164,78,.07);transition:color .18s ease,border-color .18s ease,background .18s ease}
        .tool-box:hover .tool-box-icon,.tool-box:focus-visible .tool-box-icon{border-color:var(--gold-aged);background:rgba(201,164,78,.14)}

        .tool-box-category{
          font-family:var(--font-mono);font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
          color:var(--brass);padding:3px 9px;border:1px solid rgba(201,164,78,.28);border-radius:999px;background:rgba(201,164,78,.08);
        }
        .tool-box-title{font-size:clamp(16px,2vw,19px);letter-spacing:.04em;color:var(--parchment);line-height:1.25}
        .tool-box-desc{color:var(--parchment-dim);font-size:13px;line-height:1.55}
        .tool-box-foot{margin-top:auto;padding-top:10px;display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;flex-wrap:wrap}
        .tool-box-saved{font-family:var(--font-mono);font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:#8fd6a0;padding:3px 9px;border:1px solid rgba(110,200,140,.4);border-radius:999px;background:rgba(110,200,140,.1)}
        .tool-box-cta{
          padding-top:0;font-family:var(--font-mono);font-size:11px;font-weight:700;
          letter-spacing:.06em;text-transform:uppercase;color:var(--gold-hot);display:inline-flex;align-items:center;gap:6px;
        }
        .tool-box-cta b{font-family:var(--font-body);font-weight:400;font-size:14px;transition:transform .18s var(--ease-cine,ease)}
        .tool-box:hover .tool-box-cta b{transform:translateX(3px)}

        .tools-empty{min-height:160px;border:1px dashed var(--edge);border-radius:10px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;color:var(--t-muted);gap:4px}
        .tools-empty>span{color:var(--brass);font-size:32px}
        .tools-empty h3{color:var(--parchment);margin:6px 0 2px;letter-spacing:.06em;font-size:16px}
        .tools-empty p{margin:0;font-size:13px}

        @media(max-width:700px){
          .tools-toolbar{align-items:stretch}
          .tools-search{max-width:none}
          .tools-grid{grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:14px}
          .tool-box{padding:22px 14px 18px}
        }
      `}</style>
    </section>
  );
}

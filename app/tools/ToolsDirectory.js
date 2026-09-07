import Image from 'next/image';
import Link from 'next/link';

const CATEGORIES = ['Account Progression', 'Charms', 'Governor Gear', 'Hero Gear', 'Pets', 'Masters', 'Special Event Shops', 'Construction Costs', 'Research Costs'];
const TOOLS = {
  'Account Progression': [
    { key: 'account-progression', event: 'Whole-account roadmap', title: 'Account Progression Planner', description: 'Combine your saved gear, charm, pet, Master, construction, research, True Gold, and event-shop plans into one ranked weekly roadmap.', status: 'New', icon: '/images/kingshot/hero-gear/infantry-helm.png' },
  ],
  Charms: [
    { key: 'governor-charm-optimizer', event: 'Account progression', title: 'Governor Charm Stat Optimizer', description: 'Rank upgrades across all 18 charms using inventory, troop priorities, and Health/Lethality focus.', status: 'New', icon: '/images/kingshot/charms/infantry.webp' },
    { key: 'charm-pack-optimizer', event: 'Governor Charms', title: 'Charm Pack Optimizer', description: 'Set all 18 charms individually, calculate every upgrade material, and build the cheapest week-by-week pack plan.', status: 'New', icon: '/images/charm-pack-forge.svg' },
    { key: 'wavebound-charms', event: 'Wavebound Voyage', title: 'Charms Sailing Optimizer', description: 'Calculate Tidal Treasure merges for a target Charm level, including Exquisite and Majestic outcomes.', status: 'Available', icon: '/images/wavebound-charm-sail.svg' },
  ],
  'Governor Gear': [
    { key: 'governor-gear-optimizer', event: 'Account progression', title: 'Governor Gear Optimizer', description: 'Model all six pieces, plan target tiers, and prepare inventory-based upgrade ordering.', status: 'New', icon: '/images/kingshot/governor-gear/infantry_gear_1_green_t0_s0.webp' },
  ],
  'Hero Gear': [
    { key: 'hero-gear-optimizer', event: 'Account progression', title: 'Hero Gear Optimizer', description: 'Track 12 gear pieces, resources, role, and combat priorities in one upgrade workspace.', status: 'New', icon: '/images/kingshot/hero-gear/infantry-helm.png' },
    { key: 'hero-gear-planner', event: 'Account progression', title: 'Hero Gear Planner', description: 'Model Enhancement and Mastery investment across Infantry, Cavalry, and Archer gear, then optimize the upgrade order against your resources.', status: 'New', icon: '/images/kingshot/hero-gear/infantry-helm.png' },
  ],
  Pets: [
    { key: 'pet-progression', event: 'Pet progression', title: 'Pet Progression Planner', description: 'Set pet level and advancement goals, track materials, and send shortfalls into pack planning.', status: 'New', icon: '/images/kingshot/pets/gray-wolf.webp' },
    { key: 'pet-pack-optimizer', event: 'Pet Advancement', title: 'Pet Pack Optimizer', description: 'Enter your material target and inventory, then get the cheapest repeatable week-by-week pack and chest redemption plan.', status: 'New', icon: '/images/pet-pack-compass.svg' },
  ],
  Masters: [
    { key: 'masters-planner', event: 'Master progression', title: 'Masters Planner', description: 'Track relationships, talents, skills, partially learned XP, resources, and learning speed.', status: 'New', icon: '/images/kingshot/masters/valora.png' },
  ],
  'Special Event Shops': [
    { key: 'flamedragon-shop', event: 'Flamedragon Tyrant', title: 'Dragon’s Caravan Optimizer', description: 'Build a reward cart, prioritize the best-value shop items, and calculate the cheapest Dragon Essence pack combination.', status: 'New', icon: '/images/flamedragon-caravan.svg' },
    { key: 'adventure-stall', event: 'Adventure Stall', title: 'Adventure Stall Optimizer', description: 'Choose your event rewards and calculate the lowest-cost daily pack plan after using the Shells already in your inventory.', status: 'New', icon: '/images/adventure-stall.svg' },
  ],
  'Construction Costs': [],
  'Research Costs': [],
};

const STATUS_TONE = {
  New: 'tool-badge-new',
  Available: 'tool-badge-available',
};

function CategoryGlyph({ category }) {
  const common = { viewBox: '0 0 48 48', 'aria-hidden': true, className: 'tools-menu-glyph' };
  if (category === 'Charms') {
    return <svg {...common}><path d="M24 6 L38 16 L33 34 L15 34 L10 16 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>;
  }
  if (category === 'Governor Gear') {
    return <svg {...common}><path d="M24 5 L39 11 V23 C39 33 32 40 24 43 C16 40 9 33 9 23 V11 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>;
  }
  if (category === 'Hero Gear') {
    return <svg {...common}><path d="M14 8 L34 28 M28 8 L8 28" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /><circle cx="34" cy="34" r="7" fill="none" stroke="currentColor" strokeWidth="2.4" /></svg>;
  }
  if (category === 'Pets') {
    return <svg {...common}><circle cx="24" cy="30" r="9" fill="none" stroke="currentColor" strokeWidth="2.4" /><circle cx="13" cy="16" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.2" /><circle cx="35" cy="16" r="4.2" fill="none" stroke="currentColor" strokeWidth="2.2" /><circle cx="24" cy="10" r="4" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>;
  }
  if (category === 'Masters') {
    return <svg {...common}><path d="M9 32 L9 18 L17 25 L24 13 L31 25 L39 18 L39 32 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /></svg>;
  }
  if (category === 'Construction Costs') {
    return <svg {...common}><path d="M8 38 V22 L24 10 L40 22 V38 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /><path d="M18 38 V28 H30 V38" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" /><path d="M24 10 V6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>;
  }
  if (category === 'Research Costs') {
    return <svg {...common}><path d="M16 8 H32 V20 C32 28 28 32 24 38 C20 32 16 28 16 20 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /><path d="M20 14 H28 M20 20 H28" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>;
  }
  return <svg {...common}><path d="M9 18 H39 V36 H9 Z" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round" /><path d="M9 24 H39 M18 18 V13 C18 10 20 8 24 8 C28 8 30 10 30 13 V18" fill="none" stroke="currentColor" strokeWidth="2.2" /></svg>;
}

function ToolBox({ tool, query }) {
  return (
    <Link key={tool.key} href={`/tools/${tool.key}${query}`} className="tool-box" role="listitem">
      <span className={`tool-box-badge ${STATUS_TONE[tool.status] || ''}`}>{tool.status}</span>
      <span className="tool-box-icon" aria-hidden="true">
        <span className="tool-box-icon-glow" />
        <Image className="tool-box-icon-art" src={tool.icon} alt="" width={72} height={72} />
      </span>
      <span className="k-mark tool-box-event">{tool.event}</span>
      <strong className="k-display tool-box-title">{tool.title}</strong>
      <span className="tool-box-desc">{tool.description}</span>
      <span className="tool-box-cta">Open tool <b aria-hidden="true">→</b></span>
    </Link>
  );
}

export default function ToolsDirectory({ memberId, category }) {
  const query = memberId ? `?member_id=${encodeURIComponent(memberId)}` : '';
  const categoryQuery = (name) => {
    const params = new URLSearchParams();
    if (memberId) params.set('member_id', memberId);
    params.set('category', name);
    return `?${params.toString()}`;
  };

  const selected = CATEGORIES.includes(category) ? category : '';

  if (!selected) {
    return (
      <section className="tools-catalog">
        <div className="tools-menu-grid" role="list">
          {CATEGORIES.map((name) => {
            const tools = TOOLS[name];
            const count=name==='Research Costs'?3:name==='Construction Costs'?2:tools.length;
            const href=name==='Research Costs'?'/tools/research-costs':name==='Construction Costs'?'/tools/construction-costs':`/tools${categoryQuery(name)}`;
            return (
              <Link key={name} href={href} className="tools-menu-tile" role="listitem">
                <span className="tools-menu-icon"><CategoryGlyph category={name} /></span>
                <strong className="k-display tools-menu-title">{name}</strong>
                <span className="tools-menu-count">
                  {count ? `${count} tool${count === 1 ? '' : 's'}` : 'No tools yet'}
                </span>
              </Link>
            );
          })}
        </div>

        <style>{`
          .tools-catalog{color:var(--parchment)}
          .tools-menu-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:18px}
          .tools-menu-tile{
            display:flex;flex-direction:column;align-items:center;text-align:center;gap:10px;
            padding:32px 20px;border:1px solid rgba(201,164,78,.24);border-radius:10px;
            background:linear-gradient(180deg,rgba(20,17,10,.7),rgba(9,10,18,.86));
            text-decoration:none;color:inherit;
            transition:transform .18s var(--ease-cine,ease),border-color .18s ease,box-shadow .18s ease,background .18s ease;
          }
          .tools-menu-tile:hover,.tools-menu-tile:focus-visible{
            transform:translateY(-4px);border-color:rgba(201,164,78,.7);outline:none;
            box-shadow:0 14px 30px rgba(0,0,0,.4),0 0 0 1px rgba(201,164,78,.2);
            background:linear-gradient(180deg,rgba(28,23,13,.82),rgba(11,12,21,.92));
          }
          .tools-menu-icon{width:60px;height:60px;display:grid;place-items:center;color:var(--gold-hot)}
          .tools-menu-glyph{width:44px;height:44px}
          .tools-menu-title{font-size:16px;letter-spacing:.06em;color:var(--parchment)}
          .tools-menu-count{font-family:var(--font-mono);font-size:10.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--brass)}
          @media(max-width:700px){.tools-menu-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}.tools-menu-tile{padding:24px 14px}}
        `}</style>
      </section>
    );
  }

  const tools = TOOLS[selected];

  return (
    <section className="tools-catalog">
      <Link href={`/tools${query}`} className="tools-category-back">← All categories</Link>

      <div className="tools-category-block">
        <div className="tools-category-head">
          <span className="k-mark">Tool category</span>
          <h2 className="k-display">{selected}</h2>
          <span className="tools-category-count">{tools.length} tool{tools.length === 1 ? '' : 's'}</span>
        </div>

        {tools.length ? (
          <div className="tools-grid" role="list">
            {tools.map((tool) => <ToolBox key={tool.key} tool={tool} query={query} />)}
          </div>
        ) : (
          <div className="tools-empty">
            <span aria-hidden="true">◇</span>
            <h3 className="k-display">No {selected} tools yet</h3>
            <p className="k-narrative">Calculators added to this category will appear here.</p>
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
          background:linear-gradient(180deg,rgba(20,17,10,.7),rgba(9,10,18,.86));
          text-decoration:none;color:inherit;
          transition:transform .18s var(--ease-cine,ease),border-color .18s ease,box-shadow .18s ease,background .18s ease;
        }
        .tool-box:hover,.tool-box:focus-visible{
          transform:translateY(-4px);border-color:rgba(201,164,78,.7);outline:none;
          box-shadow:0 14px 30px rgba(0,0,0,.4),0 0 0 1px rgba(201,164,78,.2);
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

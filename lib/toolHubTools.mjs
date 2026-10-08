// The tools listed on /tools (key, category, copy) and each tool's built-in icon name.
// Shared by the hub, the tool-image admin screen and the tool-image API (valid tool keys).
export const TOOLS = [
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

export const TOOL_ICON = {
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

export const TOOL_KEYS = Object.freeze(TOOLS.map((t) => t.key));
export const toolByKey = (key) => TOOLS.find((t) => t.key === key) || null;

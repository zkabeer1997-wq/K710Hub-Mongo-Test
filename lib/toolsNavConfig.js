/**
 * Sidebar nav config for Console tool pages, consumed by
 * components/tools/ToolsSidebar.jsx.
 *
 * Deliberately separate from app/tools/ToolsDirectory.js's TOOLS map: that
 * one carries directory-card data (icon, description, status badge) for the
 * /tools grid; this one carries only what a nav needs (label + href), plus
 * an optional `subItems` list a tool can expand into when it's the active
 * page. Keeping them apart means adding a subItems list here never risks
 * touching the directory grid's rendering.
 */

export const TOOLS_NAV_SECTIONS = [
  {
    id: 'account-progression',
    label: 'Account Progression',
    items: [{ href: '/tools/account-progression', label: 'Account Progression Planner' }],
  },
  {
    id: 'charms',
    label: 'Charms',
    items: [
      { href: '/tools/governor-charm-optimizer', label: 'Governor Charm Stat Optimizer' },
      { href: '/tools/charm-pack-optimizer', label: 'Charm Pack Optimizer' },
      { href: '/tools/wavebound-charms', label: 'Charms Sailing Optimizer' },
    ],
  },
  {
    id: 'governor-gear',
    label: 'Governor Gear',
    items: [{ href: '/tools/governor-gear-optimizer', label: 'Governor Gear Optimizer' }],
  },
  {
    id: 'hero-gear',
    label: 'Hero Gear',
    items: [
      { href: '/tools/hero-gear-optimizer', label: 'Hero Gear Optimizer' },
      {
        href: '/tools/hero-gear-planner',
        label: 'Hero Gear Planner',
        subItems: [
          { href: '/tools/hero-gear-planner#optimize', label: 'Optimize' },
          { href: '/tools/hero-gear-planner#basics', label: 'The Basics' },
          { href: '/tools/hero-gear-planner#how-it-works', label: 'How It Works' },
          { href: '/tools/hero-gear-planner#reference-data', label: 'Reference Data' },
          { href: '/tools/hero-gear-planner#sensitivity-analysis', label: 'Sensitivity Analysis' },
        ],
      },
    ],
  },
  {
    id: 'pets',
    label: 'Pets',
    items: [
      { href: '/tools/pet-progression', label: 'Pet Progression Planner' },
      { href: '/tools/pet-pack-optimizer', label: 'Pet Pack Optimizer' },
    ],
  },
  {
    id: 'masters',
    label: 'Masters',
    items: [{ href: '/tools/masters-planner', label: 'Masters Planner' }],
  },
  {
    id: 'event-shops',
    label: 'Special Event Shops',
    items: [
      { href: '/tools/flamedragon-shop', label: 'Dragon’s Caravan Optimizer' },
      { href: '/tools/adventure-stall', label: 'Adventure Stall Optimizer' },
    ],
  },
  {
    id: 'costs',
    label: 'Costs',
    items: [
      { href: '/tools/construction-costs', label: 'Construction Costs' },
      { href: '/tools/research-costs', label: 'Research Costs' },
    ],
  },
];

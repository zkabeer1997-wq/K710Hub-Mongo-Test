// Admin navigation: five collapsible groups. `match` is a list of path
// prefixes that make an item active (old routes stay reachable and still
// highlight the item that now owns them). `badge` names a key of
// /api/admin-task-counts; an array sums several keys.
export const ADMIN_NAV = [
  {
    id: 'today',
    label: 'Today',
    items: [{ href: '/admin/dashboard/overview', label: 'Overview', match: ['/admin/dashboard/overview'] }],
  },
  {
    id: 'events',
    label: 'Events',
    items: [
      {
        href: '/admin/dashboard/events/kvk',
        label: 'KvK',
        match: ['/admin/dashboard/events/kvk', '/admin/dashboard/kvk-appointments', '/admin/dashboard/prep-ministers'],
      },
      {
        href: '/admin/dashboard/events/flamedragon',
        label: 'Flamedragon Tyrant',
        match: ['/admin/dashboard/events/flamedragon', '/admin/dashboard/noble-advisor'],
      },
      { href: '/admin/dashboard/alliance-events', label: 'Calendar', match: ['/admin/dashboard/alliance-events'] },
    ],
  },
  {
    id: 'members',
    label: 'Members',
    items: [
      { href: '/admin/dashboard/member-pins', label: 'Members', match: ['/admin/dashboard/member-pins'] },
      {
        href: '/admin/dashboard/interest',
        label: 'Inbox',
        badge: ['transfers', 'website'],
        match: ['/admin/dashboard/interest', '/admin/dashboard/website-requests'],
      },
      { href: '/admin/dashboard/access', label: 'Access', match: ['/admin/dashboard/access'] },
      { href: '/admin/dashboard/gift-codes', label: 'Gift codes', match: ['/admin/dashboard/gift-codes'] },
    ],
  },
  {
    id: 'content',
    label: 'Content',
    items: [
      { href: '/admin/dashboard/guides', label: 'Guides', match: ['/admin/dashboard/guides'] },
      { href: '/admin/dashboard/gallery', label: 'Gallery', match: ['/admin/dashboard/gallery'] },
      { href: '/admin/dashboard/heroes', label: 'Heroes', match: ['/admin/dashboard/heroes'] },
      { href: '/admin/dashboard/help-images', label: 'Help images', match: ['/admin/dashboard/help-images'] },
      { href: '/admin/dashboard/page-text', label: 'Page text', match: ['/admin/dashboard/page-text'] },
      { href: '/admin/dashboard/tool-editing', label: 'Pack editing', match: ['/admin/dashboard/tool-editing'] },
      { href: '/admin/dashboard/tool-database', label: 'Tool database', match: ['/admin/dashboard/tool-database'] },
      { href: '/admin/dashboard/tool-images', label: 'Tool images', match: ['/admin/dashboard/tool-images'] },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { href: '/admin/dashboard/form-gates', label: 'Forms & copy', match: ['/admin/dashboard/form-gates'] },
      { href: '/admin/dashboard/integrations', label: 'Integrations', match: ['/admin/dashboard/integrations'] },
      { href: '/admin/dashboard/page-addresses', label: 'Page addresses', match: ['/admin/dashboard/page-addresses'], superadminOnly: true },
    ],
  },
];

export function isNavActive(pathname, item) {
  return item.match.some((m) => pathname === m || pathname.startsWith(`${m}/`));
}

export function navBadge(item, counts) {
  if (!item.badge) return 0;
  const keys = Array.isArray(item.badge) ? item.badge : [item.badge];
  return keys.reduce((sum, key) => sum + Number(counts?.[key] || 0), 0);
}

// Superadmin-only items are hidden from everyone else (cosmetic: the APIs
// and pages re-check the live role on the server).
export function visibleNav(isSuperadmin) {
  return ADMIN_NAV.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.superadminOnly || isSuperadmin),
  })).filter((group) => group.items.length > 0);
}

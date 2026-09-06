import { guidesTable } from '../lib/guideAccess.mjs';
import { getCollection } from '../lib/mongo';
import { COLLECTIONS } from '../lib/mongoCollections';

const BASE_URL = 'https://k710hub.vercel.app';

const STATIC_ROUTES = [
  { path: '/', priority: 1.0, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/timeline', priority: 0.7, changeFrequency: 'weekly' },
  { path: '/guides', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/events', priority: 0.8, changeFrequency: 'daily' },
  { path: '/gallery', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/interest', priority: 0.9, changeFrequency: 'monthly' },
  { path: '/player-record', priority: 0.5, changeFrequency: 'yearly' },
];

function guidesCollectionName() {
  const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
  return table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES;
}

async function guideEntries() {
  try {
    const coll = await getCollection(guidesCollectionName());
    const data = await coll
      .find({ is_published: true, access_level: 'public' })
      .project({ slug: 1, updated_at: 1, _id: 0 })
      .toArray();
    return (data || []).map((g) => ({
      url: `${BASE_URL}/guides/${g.slug}`,
      lastModified: g.updated_at ? new Date(g.updated_at) : undefined,
      changeFrequency: 'monthly',
      priority: 0.7,
    }));
  } catch {
    return [];
  }
}

async function allianceEntries() {
  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    const data = await coll
      .find({ active: true })
      .project({ tag: 1, updated_at: 1, _id: 0 })
      .toArray();
    return (data || []).map((a) => ({
      url: `${BASE_URL}/alliances/${String(a.tag).toLowerCase()}`,
      lastModified: a.updated_at ? new Date(a.updated_at) : undefined,
      changeFrequency: 'monthly',
      priority: 0.6,
    }));
  } catch {
    return [];
  }
}

export default async function sitemap() {
  const [guides, alliances] = await Promise.all([guideEntries(), allianceEntries()]);

  const staticEntries = STATIC_ROUTES.map((route) => ({
    url: `${BASE_URL}${route.path}`,
    changeFrequency: route.changeFrequency,
    priority: route.priority,
  }));

  return [...staticEntries, ...guides, ...alliances];
}

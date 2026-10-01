import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '../../../lib/ogCard';

export const alt = 'Kingdom 710 Guide';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

async function loadTitleAndCategory(slug) {
  try {
    const coll = await getCollection(COLLECTIONS.KINGDOM_GUIDES);
    const data = await coll.findOne(
      { slug },
      { projection: { title: 1, category: 1, is_published: 1, access_level: 1, _id: 0 } },
    );
    if (!data || !data.is_published || data.access_level === 'members') return null;
    return data;
  } catch {
    return null;
  }
}

export default async function Image({ params }) {
  const { slug } = await params;
  const guide = await loadTitleAndCategory(slug);
  return renderOgCard({
    eyebrow: guide?.category || 'K710 Library',
    title: guide?.title || 'Kingdom Guide',
  });
}

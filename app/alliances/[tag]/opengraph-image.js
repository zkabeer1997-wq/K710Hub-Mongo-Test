import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { renderOgCard, OG_SIZE, OG_CONTENT_TYPE } from '../../../lib/ogCard';

export const alt = 'Kingdom 710 alliance';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

async function loadAlliance(tag) {
  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    return await coll.findOne(
      { tag: String(tag || '').toUpperCase(), active: true },
      { projection: { tag: 1, name: 1, blurb: 1, _id: 0 } },
    );
  } catch {
    return null;
  }
}

export default async function Image({ params }) {
  const { tag } = await params;
  const a = await loadAlliance(tag);
  return renderOgCard({
    eyebrow: a?.tag ? `Alliance ${a.tag} · Kingdom 710` : 'Kingdom 710 · Alliances',
    title: a?.name || 'Kingdom 710 Alliances',
    subtitle: a?.blurb || 'Coordinated alliances with their own Bear Hunt times.',
  });
}

import { guideSummary } from '../../../lib/guideValidation.mjs';
import { readMemberSession } from '../../../lib/memberAuth';
import { isAdminRequest } from '../../../lib/adminAuth';
import { guidesTable } from '../../../lib/guideAccess.mjs';
import { NextResponse } from 'next/server';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const fetchCache = 'force-no-store';

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
};

function collectionName() {
  const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
  return table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES;
}

export async function GET(request) {
  try {
    const allowed =
      Boolean(await readMemberSession(request)) || (await isAdminRequest(request));
    const coll = await getCollection(collectionName());
    const filter = { is_published: true };
    if (!allowed) filter.access_level = 'public';

    const data = await coll
      .find(filter)
      .project({
        slug: 1,
        title: 1,
        category: 1,
        description: 1,
        body: 1,
        access_level: 1,
        position: 1,
        updated_at: 1,
        _id: 0,
      })
      .sort({ position: 1, title: 1 })
      .toArray();

    return NextResponse.json(
      { guides: (data || []).map(guideSummary) },
      { headers: NO_STORE_HEADERS }
    );
  } catch (error) {
    console.error('guides directory GET failed', error);
    return NextResponse.json(
      { error: 'Unable to load guides.' },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}

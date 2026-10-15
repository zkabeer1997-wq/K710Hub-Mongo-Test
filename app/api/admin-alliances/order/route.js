import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { requireRouteSuperadmin } from '../../../../lib/routeAliasesAccess.server';
import { revalidateAlliancePages } from '../../../../lib/revalidateAlliancePages';
import { validateOrderedTags, sortOrderFor } from '../../../../lib/allianceOrder.mjs';

function json(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

// Saves the order alliances show in on the website (Alliances page, Home, Events, forms).
// Superadmin only, and checked against the live role, never the shared admin-password cookie.
export async function PUT(request) {
  const session = await requireRouteSuperadmin(request);
  if (!session) {
    // Signed in as an admin (any kind, including the shared password cookie) but not a superadmin: 403. Nobody: 401.
    return (await isAdminRequest(request))
      ? json({ error: 'Only a superadmin can change the order.' }, { status: 403 })
      : json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    const existing = (await coll.find({}).project({ tag: 1, _id: 0 }).toArray()) || [];
    const { tags, error } = validateOrderedTags(body?.tags, existing.map((r) => r.tag));
    if (error) return json({ error }, { status: 400 });

    const now = new Date();
    const by = String(session.nickname || session.playerId || session.memberId || 'superadmin');
    // Every row gets its number and the marker that switches the public pages to the saved order.
    // Writing the same list again gives the same result, so this is also the one-time initialisation.
    await coll.bulkWrite(
      sortOrderFor(tags).map(({ tag, sort_order }) => ({
        updateOne: { filter: { tag }, update: { $set: { sort_order, order_updated_at: now, order_updated_by: by } } },
      }))
    );
    revalidateAlliancePages(tags[0]);
    return json({ ok: true, tags, updated_at: now.toISOString(), updated_by: by });
  } catch (error) {
    console.error('admin-alliances/order failed', error);
    return json({ error: 'The order could not be saved. Please try again.' }, { status: 500 });
  }
}

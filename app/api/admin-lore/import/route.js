import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { seedLore } from '../../../../lib/loreSeed.mjs';

export const dynamic = 'force-dynamic';

// Adds the first ten stories that are not there yet. Stories that exist are left exactly as they are.
export async function POST(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const coll = await getCollection(COLLECTIONS.LORE_STORIES);
    const result = await seedLore({ coll });
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('admin-lore import failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

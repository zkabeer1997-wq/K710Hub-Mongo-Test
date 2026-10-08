import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../../lib/adminAuth';
import { getCollection } from '../../../../../lib/mongo';
import { COLLECTIONS } from '../../../../../lib/mongoCollections';
import { guidesTable } from '../../../../../lib/guideAccess.mjs';
import { SLUG_RE, validateDraft } from '../../../../../lib/guideValidation.mjs';

// Builder autosave. A draft lives beside the live fields (guide.draft) so
// editing a published guide never changes the public page until it is saved.

function collectionName() {
  const table = typeof guidesTable === 'function' ? guidesTable() : 'kingdom_guides';
  return table === 'guide_content' ? COLLECTIONS.GUIDE_CONTENT : COLLECTIONS.KINGDOM_GUIDES;
}

async function authorize(request, paramsPromise) {
  if (!(await isAdminRequest(request))) return { response: NextResponse.json({ error: 'Admin login required.' }, { status: 401 }) };
  const { slug } = await paramsPromise;
  if (!SLUG_RE.test(slug || '')) return { response: NextResponse.json({ error: 'Invalid guide.' }, { status: 400 }) };
  return { slug };
}

export async function PUT(request, { params }) {
  const { slug, response } = await authorize(request, params);
  if (response) return response;
  let payload;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const { draft, error } = validateDraft(payload);
  if (error) return NextResponse.json({ error }, { status: 400 });
  try {
    const coll = await getCollection(collectionName());
    const savedAt = new Date().toISOString();
    const result = await coll.updateOne({ slug }, { $set: { draft: { ...draft, saved_at: savedAt } } });
    if (!result.matchedCount && !result.modifiedCount) return NextResponse.json({ error: 'Guide not found. Reload the list and try again.' }, { status: 404 });
    return NextResponse.json({ ok: true, saved_at: savedAt }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('admin guide draft PUT failed', err);
    return NextResponse.json({ error: 'Unable to save the draft.' }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  const { slug, response } = await authorize(request, params);
  if (response) return response;
  try {
    const coll = await getCollection(collectionName());
    await coll.updateOne({ slug }, { $unset: { draft: '' } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('admin guide draft DELETE failed', err);
    return NextResponse.json({ error: 'Unable to discard the draft.' }, { status: 500 });
  }
}

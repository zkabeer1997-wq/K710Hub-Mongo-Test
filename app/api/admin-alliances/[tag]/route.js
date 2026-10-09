import { validateAllianceEvents } from '../../../../lib/allianceEvents.mjs';
import { NextResponse } from 'next/server';
import { revalidateAlliancePages } from '../../../../lib/revalidateAlliancePages';
import { validateBearTimes } from '../../../../lib/bearHuntSchedule';
import { validateLeaders } from '../../../../lib/allianceLeaders.mjs';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { checkAllianceImage, parseAllianceImageFields, releaseAllianceImage } from '../../../../lib/allianceImages.mjs';

// Removes the Drive file + record of a no-longer-used alliance photo (best effort).
async function removeAlliancePhoto(id) {
  const { getSiteImages } = await import('../../../../lib/siteImages.server');
  return (await getSiteImages({ requireConnected: false })).remove(id, { folders: ['alliance'] });
}

const STATUSES = ['open', 'selective', 'closed'];

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function PUT(request, { params: paramsPromise }) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const params = await paramsPromise;
  const tag = params?.tag;
  if (!tag) return NextResponse.json({ error: 'Missing alliance tag.' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const update = {};
  if (body.scheduled_events !== undefined) {
    const { events, error: eventError } = validateAllianceEvents(body.scheduled_events);
    if (eventError) return NextResponse.json({ error: eventError }, { status: 400 });
    update.scheduled_events = events;
  }
  if (body.bear_times_utc !== undefined) {
    const { times, error: timeError } = validateBearTimes(body.bear_times_utc);
    if (timeError) return NextResponse.json({ error: timeError }, { status: 400 });
    update.bear_times_utc = times;
  }
  if (body.leaders !== undefined) {
    const { leaders, error: leadersError } = validateLeaders(body.leaders);
    if (leadersError) return NextResponse.json({ error: leadersError }, { status: 400 });
    update.leaders = leaders;
  }
  if (body.name !== undefined) {
    const name = String(body.name).trim();
    if (!name) return NextResponse.json({ error: 'Name is required.' }, { status: 400 });
    update.name = name;
  }
  if (body.blurb !== undefined) update.blurb = String(body.blurb);
  if (body.leader_player_id !== undefined) {
    update.leader_player_id = body.leader_player_id ? String(body.leader_player_id) : null;
  }
  if (body.timezone_focus !== undefined) {
    update.timezone_focus = body.timezone_focus ? String(body.timezone_focus) : null;
  }
  if (body.language !== undefined) {
    update.language = body.language ? String(body.language) : null;
  }
  if (body.roster_size !== undefined) {
    update.roster_size =
      body.roster_size !== '' && Number.isFinite(Number(body.roster_size))
        ? Number(body.roster_size)
        : null;
  }
  if (body.active !== undefined) update.active = Boolean(body.active);
  if (body.sort_order !== undefined) {
    update.sort_order = Number.isFinite(Number(body.sort_order)) ? Number(body.sort_order) : 0;
  }
  if (body.recruiting_status !== undefined) {
    if (!STATUSES.includes(body.recruiting_status)) {
      return NextResponse.json({ error: 'Unsupported recruiting status.' }, { status: 400 });
    }
    update.recruiting_status = body.recruiting_status;
  }
  const { fields: imageFields, error: imageError } = parseAllianceImageFields(body);
  if (imageError) return NextResponse.json({ error: imageError }, { status: 400 });
  update.updated_at = new Date().toISOString();

  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    const upperTag = String(tag).toUpperCase();
    // Omitting image_id leaves the photo alone; sending '' clears it. A photo that no longer exists is dropped and reported.
    let warning = '';
    if (imageFields.image_id) {
      const state = await checkAllianceImage(await getCollection(COLLECTIONS.SITE_IMAGES), imageFields.image_id);
      if (state === 'wrong-folder') return NextResponse.json({ error: 'Alliance photo is invalid.' }, { status: 400 });
      if (state === 'missing') { imageFields.image_id = ''; imageFields.image_alt = ''; warning = 'The alliance photo was no longer available, so the alliance was saved without it.'; }
    }
    Object.assign(update, imageFields);
    const before = imageFields.image_id !== undefined ? await coll.findOne({ tag: upperTag }, { projection: { image_id: 1 } }) : null;
    const result = await coll.findOneAndUpdate(
      { tag: upperTag },
      { $set: update },
      { returnDocument: 'after', projection: { _id: 0 } }
    );
    const data = result?.value || result;
    if (!data || !data.tag) {
      return NextResponse.json({ error: 'Alliance not found.' }, { status: 404 });
    }
    revalidateAlliancePages(tag);
    if (before?.image_id && before.image_id !== data.image_id) await releaseAllianceImage({ alliances: coll, imageId: before.image_id, removeImage: removeAlliancePhoto });
    return NextResponse.json({ alliance: data, ...(warning ? { warning } : {}) });
  } catch (error) {
    console.error('admin-alliances/[tag]' + ' failed', error);
    return NextResponse.json({ error: 'Update failed.' }, { status: 500 });
  }
}

export async function DELETE(request, { params: paramsPromise }) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const params = await paramsPromise;
  const tag = params?.tag;
  if (!tag) return NextResponse.json({ error: 'Missing alliance tag.' }, { status: 400 });

  try {
    const coll = await getCollection(COLLECTIONS.ALLIANCES);
    const existing = await coll.findOne({ tag: String(tag).toUpperCase() }, { projection: { image_id: 1 } });
    const result = await coll.deleteOne({ tag: String(tag).toUpperCase() });
    if (!result.deletedCount) {
      return NextResponse.json({ error: 'Alliance not found.' }, { status: 404 });
    }
    if (existing?.image_id) await releaseAllianceImage({ alliances: coll, imageId: existing.image_id, removeImage: removeAlliancePhoto });
    revalidateAlliancePages(tag);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('admin-alliances/[tag]' + ' failed', error);
    return NextResponse.json({ error: 'Delete failed.' }, { status: 500 });
  }
}

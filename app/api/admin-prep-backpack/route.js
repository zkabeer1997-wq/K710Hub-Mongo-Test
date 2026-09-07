import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const coll = await getCollection(COLLECTIONS.PREP_BACKPACK);
    const data = await coll.find({}).sort({ created_at: 1 }).toArray();
    return NextResponse.json({
      rows: (data || []).map(({ _id, ...r }) => ({ ...r, id: r.id || String(_id) })),
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { id, key, value } = body || {};
    const EDITABLE = [
      'member_id',
      'in_game_name',
      'want_construction',
      'construction_upgrades',
      'ttg_used',
      'tg_used',
      'want_research',
      't11_troops',
      'tg_dust',
      'research_speedup_days',
      'want_troop_training',
      'is_transfer',
      'troop_speedup_days',
      'promoting_t11',
      'avail_day1',
      'avail_day2',
      'avail_day4',
      'avail_day5',
      'notes',
    ];
    if (!id || !key || !EDITABLE.includes(key)) {
      return NextResponse.json({ error: 'Invalid update' }, { status: 400 });
    }
    const coll = await getCollection(COLLECTIONS.PREP_BACKPACK);
    const result = await coll.updateOne(
      { $or: [{ id }, { _id: id }] },
      { $set: { [key]: value, updated_at: new Date() } }
    );
    if (result.matchedCount === 0) {
      // try string id field only
      await coll.updateOne({ id: String(id) }, { $set: { [key]: value, updated_at: new Date() } });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

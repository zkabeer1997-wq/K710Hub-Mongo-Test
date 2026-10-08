import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { listEventCycles, loadCycleFormRows } from '../../../lib/eventCycles.server.js';

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // ?cycle=<KvK cycle id> (default: the current cycle). Ended cycles read the rows tagged with that id.
    const cycleId = new URL(request.url || '', 'http://localhost').searchParams.get('cycle') || null;
    const loaded = await loadCycleFormRows('prep', cycleId);
    if (!loaded) return NextResponse.json({ error: 'Cycle not found.' }, { status: 404 });
    const cycles = (await listEventCycles('kvk')).map((c) => ({ id: c.id, label: c.label, is_current: c.is_current === true }));
    return NextResponse.json({
      rows: loaded.rows.map(({ _id, ...r }) => ({ ...r, id: r.id || String(_id) })),
      cycle: { id: loaded.cycle.id, label: loaded.cycle.label, is_current: loaded.cycle.is_current === true },
      cycles,
    });
  } catch (error) {
    console.error('admin-prep-backpack' + ' failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

export async function PATCH(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    let body;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
    }
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
    console.error('admin-prep-backpack' + ' failed', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
}

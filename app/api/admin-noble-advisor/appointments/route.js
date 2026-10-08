import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { listEventCycles } from '../../../../lib/eventCycles.server.js';
import { isCyclePublished } from '../../../../lib/kvkAppointments.server.js';
import { isValidSlot, slotRange } from '../../../../lib/kvkAppointments.mjs';
import { currentNobleCycle, loadNobleRows, loadNobleAssignments, buildAndSaveNoble } from '../../../../lib/nobleAppointment.server.js';
import { unplacedNoble, nobleFilter } from '../../../../lib/nobleAppointment.mjs';

export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'no-store' };
const json = (body, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

// GET ?cycle=<Flamedragon cycle id> (default current) -> answers, saved Noble slots, who is not placed, published flag.
export async function GET(request) {
  if (!(await isAdminRequest(request))) return json({ error: 'Unauthorized' }, 401);
  try {
    const current = await currentNobleCycle();
    const cycles = (await listEventCycles('flamedragon').catch(() => [])).map((c) => ({ id: String(c.id), label: c.label, is_current: c.is_current === true }));
    const requested = new URL(request.url).searchParams.get('cycle') || '';
    const picked = cycles.find((c) => c.id === requested) || cycles.find((c) => c.is_current) || (current ? { id: String(current.id), label: current.label, is_current: true } : null);
    if (!picked) return json({ cycle_id: null, cycle_label: '', is_live: false, cycles, rows: [], assignments: [], unplaced: [], published: false });
    const [rows, assignments, pub] = await Promise.all([loadNobleRows(picked.id), loadNobleAssignments(picked.id), isCyclePublished(picked.id)]);
    return json({
      cycle_id: picked.id, cycle_label: picked.label, is_live: picked.is_current, cycles,
      rows, assignments, unplaced: unplacedNoble(rows, assignments), ...pub,
    });
  } catch (error) {
    console.error('admin-noble-appointments GET failed', error);
    return json({ error: 'Could not load the Noble Advisor schedule.' }, 500);
  }
}

/**
 * POST { action }  (always the CURRENT Flamedragon cycle)
 *   build_schedule                 rank the answers (transfer, T11 promotion, speedup days), one slot each; hand placements kept
 *   assign   { member_id, slot }   place or move one member (locked from then on)
 *   unassign { member_id }
 *   publish  { published: boolean }
 */
export async function POST(request) {
  if (!(await isAdminRequest(request))) return json({ error: 'Unauthorized' }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request.' }, 400);
  }
  try {
    const cycle = await currentNobleCycle();
    if (!cycle) return json({ error: 'There is no active Flamedragon cycle.' }, 409);
    const cycleId = String(cycle.id);
    const asgColl = await getCollection(COLLECTIONS.KVK_APPOINTMENT_ASSIGNMENTS);

    if (body?.action === 'publish') {
      const coll = await getCollection(COLLECTIONS.KVK_APPOINTMENT_CYCLES);
      const published = body.published === true;
      await coll.updateOne({ cycle_id: cycleId }, { $set: { published, published_at: published ? new Date() : null, updated_at: new Date() }, $setOnInsert: { cycle_id: cycleId } }, { upsert: true });
      return json({ ok: true, published });
    }

    if (body?.action === 'build_schedule') {
      return json({ ok: true, ...(await buildAndSaveNoble(cycleId)) });
    }

    if (body?.action === 'assign') {
      const memberId = String(body.member_id ?? '').trim();
      if (!memberId || memberId.length > 64) return json({ error: 'Choose a member.' }, 400);
      if (!isValidSlot(body.slot)) return json({ error: 'Choose a valid 30-minute slot.' }, 400);
      const answer = (await loadNobleRows(cycleId)).find((r) => String(r.member_id) === memberId);
      if (!answer) return json({ error: 'That member has not sent a Noble Advisor answer this cycle.' }, 404);
      const filter = nobleFilter(cycleId);
      const taken = await asgColl.findOne({ ...filter, slot: body.slot });
      if (taken && String(taken.member_id) !== memberId) return json({ error: `${slotRange(body.slot)} is already booked.` }, 409);
      const now = new Date();
      try {
        await asgColl.updateOne(
          { ...filter, member_id: memberId },
          { $set: { slot: body.slot, name: answer.in_game_name || '', manual: true, updated_at: now }, $setOnInsert: { ...filter, member_id: memberId, created_at: now } },
          { upsert: true },
        );
      } catch (err) {
        if (err?.code === 11000) return json({ error: `${slotRange(body.slot)} is already booked.` }, 409);
        throw err;
      }
      return json({ ok: true });
    }

    if (body?.action === 'unassign') {
      const memberId = String(body.member_id ?? '').trim();
      if (!memberId) return json({ error: 'Choose a member.' }, 400);
      await asgColl.deleteOne({ ...nobleFilter(cycleId), member_id: memberId });
      return json({ ok: true });
    }

    return json({ error: 'Unknown action.' }, 400);
  } catch (error) {
    console.error('admin-noble-appointments POST failed', error);
    return json({ error: 'Could not update the Noble Advisor schedule.' }, 500);
  }
}

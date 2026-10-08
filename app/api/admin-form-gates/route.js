import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { FORM_GATE_KEYS, WINDOWED_GATE_KEYS, VOTE_FORM_KEYS, newRound } from '../../../lib/formGates.mjs';
import { parseGateWindow } from '../../../lib/formGateWindow.mjs';
import { getFormGates } from '../../../lib/formGates.server.js';

const ROUTE_BY_KEY = {
  lead: '/power-profile',
  joiner: '/dashboard/form',
  prep: '/prep-phase-backpack',
  dragon: '/flamedragon',
  noble: '/forms/flamedragon-tyrant/noble-advisor',
  appointments: '/forms/kvk-appointments',
  requests: '/forms/requests',
  swordland: '/forms/swordland-showdown',
  'tri-alliance': '/forms/tri-alliance-clash',
};

async function requireAdmin(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return null;
}

export async function GET(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  const gates = await getFormGates();
  return NextResponse.json({ gates: FORM_GATE_KEYS.map((key) => gates[key]) });
}

export async function PATCH(request) {
  const unauthorized = await requireAdmin(request);
  if (unauthorized) return unauthorized;

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  const formKey = String(body?.form_key || '');
  if (!FORM_GATE_KEYS.includes(formKey)) {
    return NextResponse.json({ error: 'Unknown form key.' }, { status: 400 });
  }

  try {
    const coll = await getCollection(COLLECTIONS.FORM_GATES);

    // Start a new round of a vote form: fresh cycle id so members vote again.
    // Old votes stay in the database under their old cycle id.
    if (body.start_round === true) {
      if (!VOTE_FORM_KEYS.includes(formKey)) {
        return NextResponse.json({ error: 'Only the event vote forms have rounds.' }, { status: 400 });
      }
      const round = newRound(Date.now(), body.round_label);
      const fields = { cycle_id: round.cycle_id, round_label: round.round_label, updated_at: new Date() };
      if (body.clear_window === true) { fields.opens_at = null; fields.closes_at = null; }
      if (body.clear_message === true) fields.message = '';
      await coll.updateOne({ form_key: formKey }, { $set: { form_key: formKey, ...fields } }, { upsert: true });
      revalidatePath(ROUTE_BY_KEY[formKey]);
      const saved = await getFormGates();
      return NextResponse.json({ gate: saved[formKey] });
    }

    const doc = {
      form_key: formKey,
      is_open: body.is_open !== false,
      message: body.message ? String(body.message) : '',
      updated_at: new Date(),
    };

    // Window fields (every form). Absent keys leave the stored window
    // untouched so the open/close toggle never wipes the schedule.
    if (WINDOWED_GATE_KEYS.includes(formKey) && ('opens_at' in body || 'closes_at' in body || 'cycle_id' in body)) {
      const existing = await coll.findOne({ form_key: formKey }, { projection: { opens_at: 1, closes_at: 1, _id: 0 } });
      const parsed = parseGateWindow(body, existing);
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
      Object.assign(doc, parsed.fields);
    }
    if (VOTE_FORM_KEYS.includes(formKey) && 'round_label' in body) {
      doc.round_label = String(body.round_label || '').trim().slice(0, 60);
    }

    await coll.updateOne({ form_key: formKey }, { $set: doc }, { upsert: true });

    revalidatePath('/forms');
    revalidatePath('/forms/kvk');
    revalidatePath('/forms/flamedragon-tyrant');
    revalidatePath(ROUTE_BY_KEY[formKey]);

    const saved = await getFormGates();
    return NextResponse.json({ gate: saved[formKey] || { form_key: doc.form_key, is_open: doc.is_open, message: doc.message } });
  } catch (error) {
    console.error('admin-form-gates PATCH failed', error);
    return NextResponse.json(
      { error: 'Unable to confirm form status. Reload the page before trying again.' },
      { status: 500 }
    );
  }
}

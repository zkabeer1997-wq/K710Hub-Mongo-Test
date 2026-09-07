import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';
import { FORM_GATE_KEYS, getFormGates } from '../../../lib/formGates.mjs';

const ROUTE_BY_KEY = {
  lead: '/power-profile',
  joiner: '/player-record/form',
  prep: '/prep-phase-backpack',
  dragon: '/flamedragon',
  noble: '/forms/flamedragon-tyrant/noble-advisor',
  requests: '/forms/requests',
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
    const supabase = createAdminSupabaseClient();
    const { data, error } = await supabase
      .from('form_gates')
      .upsert({
        form_key: formKey,
        is_open: body.is_open !== false,
        message: body.message ? String(body.message) : '',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'form_key' })
      .select('form_key, is_open, message')
      .single();

    if (error) return NextResponse.json({ error: 'Unable to save form status. Please try again.' }, { status: 500 });

    revalidatePath('/forms');
    revalidatePath('/forms/kvk');
    revalidatePath('/forms/flamedragon-tyrant');
    revalidatePath(ROUTE_BY_KEY[formKey]);

    return NextResponse.json({ gate: data });
  } catch (error) {
    console.error('admin-form-gates PATCH failed', error);
    return NextResponse.json({ error: 'Unable to confirm form status. Reload the page before trying again.' }, { status: 500 });
  }
}

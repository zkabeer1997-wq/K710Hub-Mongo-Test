import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { ControlError, getEventControlState, isControlType, runEventControlAction } from '../../../lib/eventControl.server';

export const dynamic = 'force-dynamic';
const HEADERS = { 'Cache-Control': 'no-store' };
const json = (body, status = 200) => NextResponse.json(body, { status, headers: HEADERS });

// GET /api/admin-event-control?type=kvk|flamedragon -> the whole control state.
export async function GET(request) {
  if (!(await isAdminRequest(request))) return json({ error: 'Unauthorized' }, 401);
  const type = new URL(request.url).searchParams.get('type') || '';
  if (!isControlType(type)) return json({ error: 'Unknown cycle type.' }, 400);
  try {
    return json(await getEventControlState(type));
  } catch (error) {
    console.error('admin-event-control GET failed', error);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

// POST { type, action, ... } -> { ok: true, state }
export async function POST(request) {
  if (!(await isAdminRequest(request))) return json({ error: 'Unauthorized' }, 401);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid request body.' }, 400);
  }
  const type = String(body?.type || '');
  if (!isControlType(type)) return json({ error: 'Unknown cycle type.' }, 400);
  try {
    await runEventControlAction(type, String(body?.action || ''), body);
    try {
      revalidatePath('/forms');
      revalidatePath('/forms/kvk');
      revalidatePath('/forms/flamedragon-tyrant');
    } catch {
      /* revalidation is best effort */
    }
    return json({ ok: true, state: await getEventControlState(type) });
  } catch (error) {
    if (error instanceof ControlError) return json({ error: error.message }, error.status);
    console.error('admin-event-control POST failed', error);
    return json({ error: 'Something went wrong. Please try again.' }, 500);
  }
}

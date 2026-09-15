import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { EVENT_CYCLE_TYPES, createEventCycle, listEventCycles } from '../../../lib/eventCycles.server';

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const type = new URL(request.url).searchParams.get('type') || '';
  if (!EVENT_CYCLE_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Unknown cycle type.' }, { status: 400 });
  }
  try {
    const cycles = await listEventCycles(type);
    return NextResponse.json({ cycles });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to load seasons.' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const type = String(body?.type || '');
  const label = String(body?.label || '').trim();
  if (!EVENT_CYCLE_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Unknown cycle type.' }, { status: 400 });
  }
  if (!label || label.length > 80) {
    return NextResponse.json({ error: 'Season label is required and must be 80 characters or fewer.' }, { status: 400 });
  }
  try {
    const cycle = await createEventCycle(type, {
      label,
      start_date: body?.start_date || null,
      end_date: body?.end_date || null,
      activate: !!body?.activate,
    });
    return NextResponse.json({ cycle });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to create season.' }, { status: 500 });
  }
}

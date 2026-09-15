import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { EVENT_CYCLE_TYPES, archiveEventCycle, setCurrentEventCycle } from '../../../../lib/eventCycles.server';

export async function PATCH(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const params = await paramsPromise;
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }

  try {
    if (body?.is_current === true) {
      const type = String(body?.type || '');
      if (!EVENT_CYCLE_TYPES.includes(type)) {
        return NextResponse.json({ error: 'Unknown cycle type.' }, { status: 400 });
      }
      const cycle = await setCurrentEventCycle(type, id);
      if (!cycle) return NextResponse.json({ error: 'Season not found.' }, { status: 404 });
      return NextResponse.json({ cycle });
    }
    if (body?.archived === true) {
      const cycle = await archiveEventCycle(id);
      if (!cycle) return NextResponse.json({ error: 'Season not found.' }, { status: 404 });
      return NextResponse.json({ cycle });
    }
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to update season.' }, { status: 500 });
  }
}

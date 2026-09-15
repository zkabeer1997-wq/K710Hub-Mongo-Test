import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { setActiveIntakePeriod } from '../../../../lib/transferIntakePeriods.server';

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
  if (body?.is_active !== true) {
    return NextResponse.json({ error: 'Only activating a period is supported here.' }, { status: 400 });
  }
  try {
    const period = await setActiveIntakePeriod(id);
    if (!period) return NextResponse.json({ error: 'Intake period not found.' }, { status: 404 });
    return NextResponse.json({ period });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to update intake period.' }, { status: 500 });
  }
}

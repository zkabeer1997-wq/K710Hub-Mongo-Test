import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { deleteIntakePeriod, setActiveIntakePeriod, updateIntakePeriodSettings } from '../../../../lib/transferIntakePeriods.server';

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
  const editsSettings = ['transfer_status', 'leading_cap', 'ordinary_cap'].some((k) => k in (body || {}));
  if (body?.is_active !== true && !editsSettings) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 });
  }
  try {
    let period = editsSettings ? await updateIntakePeriodSettings(id, body) : null;
    if (body?.is_active === true) period = await setActiveIntakePeriod(id);
    if (!period) return NextResponse.json({ error: 'Intake period not found.' }, { status: 404 });
    return NextResponse.json({ period });
  } catch (error) {
    console.error('admin-intake-periods/[id]' + ' failed', error);
    return NextResponse.json({ error: 'Unable to update intake period.' }, { status: 500 });
  }
}

export async function DELETE(request, { params: paramsPromise }) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const params = await paramsPromise;
  const id = params?.id;
  if (!id) return NextResponse.json({ error: 'Missing id.' }, { status: 400 });
  try {
    const result = await deleteIntakePeriod(id);
    if (result.error) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('admin-intake-periods/[id] DELETE failed', error);
    return NextResponse.json({ error: 'Unable to remove intake period.' }, { status: 500 });
  }
}

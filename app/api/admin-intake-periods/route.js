import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createIntakePeriod, listIntakePeriods } from '../../../lib/transferIntakePeriods.server';

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const periods = await listIntakePeriods();
    return NextResponse.json({ periods });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to load intake periods.' }, { status: 500 });
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
  const label = String(body?.label || '').trim();
  if (!label) {
    return NextResponse.json({ error: 'Label is required.' }, { status: 400 });
  }
  if (label.length > 80) {
    return NextResponse.json({ error: 'Label is too long.' }, { status: 400 });
  }
  try {
    const period = await createIntakePeriod(label, { activate: !!body?.activate });
    return NextResponse.json({ period });
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to create intake period.' }, { status: 500 });
  }
}

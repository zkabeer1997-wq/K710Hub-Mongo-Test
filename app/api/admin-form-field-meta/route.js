import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { FORM_META_KEYS } from '../../../lib/formFieldMeta.mjs';
import { getFormFieldMeta, saveFormFieldMeta } from '../../../lib/formFieldMeta.server';

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const formKey = new URL(request.url).searchParams.get('form_key') || '';
  if (!FORM_META_KEYS.includes(formKey)) {
    return NextResponse.json({ error: 'Unknown form.' }, { status: 400 });
  }
  try {
    const meta = await getFormFieldMeta(formKey);
    return NextResponse.json(meta);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to load form.' }, { status: 500 });
  }
}

export async function PUT(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const formKey = String(body?.form_key || '');
  if (!FORM_META_KEYS.includes(formKey)) {
    return NextResponse.json({ error: 'Unknown form.' }, { status: 400 });
  }
  try {
    const meta = await saveFormFieldMeta(formKey, { intro: body.intro, fields: body.fields });
    return NextResponse.json(meta);
  } catch (error) {
    return NextResponse.json({ error: error.message || 'Unable to save form.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { FORM_META_KEYS } from '../../../lib/formFieldMeta.mjs';
import { getFormFieldMeta } from '../../../lib/formFieldMeta.server';

// Public — every live form reads its label/placeholder/help/intro-copy
// overrides from here so an admin edit in Form Gates takes effect.
export async function GET(request) {
  const formKey = new URL(request.url).searchParams.get('form_key') || '';
  if (!FORM_META_KEYS.includes(formKey)) {
    return NextResponse.json({ error: 'Unknown form.' }, { status: 400 });
  }
  try {
    const meta = await getFormFieldMeta(formKey);
    return NextResponse.json(meta);
  } catch {
    // Fall back to defaults if the collection is unavailable.
    return NextResponse.json({ form_key: formKey, intro: null, fields: [] });
  }
}

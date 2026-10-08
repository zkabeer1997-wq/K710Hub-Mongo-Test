import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { PageTextError, getPageDef, pageList, validatePageUpdate } from '../../../lib/pageText.mjs';
import { readPageTextForAdmin, savePageText } from '../../../lib/pageText.server';

export const dynamic = 'force-dynamic';

const deny = () => NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
function fail(error) {
  if (error instanceof PageTextError) return NextResponse.json({ error: error.message, fields: error.fields }, { status: error.status });
  console.error('admin-page-text failed', error);
  return NextResponse.json({ error: 'The page text could not be loaded or saved right now. Try again in a minute.' }, { status: 503 });
}
const NO_STORE = { 'Cache-Control': 'no-store' };

function payload(def, data) {
  return {
    page: { id: def.id, label: def.label, path: def.path },
    pages: pageList(),
    sections: def.sections,
    fields: def.fields,
    defaults: def.defaults,
    values: data.values,
    overridden: Object.keys(data.saved || {}),
    updated_at: data.updated_at,
    updated_by: data.updated_by,
  };
}

// GET ?page=about: field registry, defaults and the current values.
export async function GET(request) {
  if (!(await isAdminRequest(request))) return deny();
  const page = new URL(request.url).searchParams.get('page') || 'about';
  const def = getPageDef(page);
  if (!def) return NextResponse.json({ error: 'Unknown page.' }, { status: 404 });
  try { return NextResponse.json(payload(def, await readPageTextForAdmin(page)), { headers: NO_STORE }); } catch (e) { return fail(e); }
}

// PUT { page, values: { key: value } }: only the sent keys change. Blank text = back to the default.
export async function PUT(request) {
  if (!(await isAdminRequest(request))) return deny();
  let input = {};
  try { input = await request.json(); } catch { /* handled below */ }
  const page = String(input?.page || 'about');
  const def = getPageDef(page);
  if (!def) return NextResponse.json({ error: 'Unknown page.' }, { status: 404 });
  try {
    const validated = validatePageUpdate(page, input?.values);
    await savePageText(page, validated, 'admin');
    return NextResponse.json({ ok: true, ...payload(def, await readPageTextForAdmin(page)) }, { headers: NO_STORE });
  } catch (e) { return fail(e); }
}

import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { HELP_SECTIONS, isHelpSectionId } from '../../../lib/helpSections.mjs';
import { HelpImageError, publicHelpImage } from '../../../lib/helpImages.mjs';
import { getHelpImageStore, invalidateHelpImages } from '../../../lib/helpImages.server';

export const dynamic = 'force-dynamic';

const deny = () => NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
function fail(error) {
  if (error instanceof HelpImageError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('admin-help-images failed', error);
  return NextResponse.json({ error: 'Help images could not be saved right now. Try again in a minute.' }, { status: 503 });
}
async function body(request) { try { return await request.json(); } catch { return {}; } }

// GET: every help section with its current picture (or null = text only).
export async function GET(request) {
  if (!(await isAdminRequest(request))) return deny();
  try {
    const docs = await (await getHelpImageStore()).list();
    const byId = new Map(docs.map((d) => [d.section_id, d]));
    const sections = HELP_SECTIONS.map((s) => {
      const doc = byId.get(s.id);
      const image = publicHelpImage(doc);
      return { id: s.id, title: s.title, image: image ? { ...image, id: doc.site_image_id } : null, updated_at: doc?.updated_at || null };
    });
    return NextResponse.json({ sections }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return fail(error); }
}

// PUT { section_id, site_image_id, alt, caption?, side? }: set or replace the section picture.
export async function PUT(request) {
  if (!(await isAdminRequest(request))) return deny();
  const input = await body(request);
  try {
    const doc = await (await getHelpImageStore()).set(input);
    invalidateHelpImages();
    return NextResponse.json({ ok: true, image: publicHelpImage(doc) });
  } catch (error) { return fail(error); }
}

// DELETE { section_id } (or ?section_id=): back to text only.
export async function DELETE(request) {
  if (!(await isAdminRequest(request))) return deny();
  const input = await body(request);
  const id = String(input.section_id || new URL(request.url).searchParams.get('section_id') || '');
  if (!isHelpSectionId(id)) return NextResponse.json({ error: 'Unknown help section.' }, { status: 400 });
  try {
    await (await getHelpImageStore()).remove(id);
    invalidateHelpImages();
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error); }
}

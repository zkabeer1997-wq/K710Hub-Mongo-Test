import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { TOOLS } from '../../../lib/toolHubTools.mjs';
import { TOOL_CATEGORIES } from '../../../lib/toolCategories.mjs';
import { ToolImageError, publicToolImage } from '../../../lib/toolImages.mjs';
import { getToolImageStore, invalidateToolImages } from '../../../lib/toolImages.server';

export const dynamic = 'force-dynamic';

const CATEGORY_LABEL = Object.fromEntries(TOOL_CATEGORIES.map((c) => [c.id, c.label]));
const deny = () => NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
function fail(error) {
  if (error instanceof ToolImageError) return NextResponse.json({ error: error.message }, { status: error.status });
  console.error('admin-tool-images failed', error);
  return NextResponse.json({ error: 'Tool images could not be saved right now. Try again in a minute.' }, { status: 503 });
}
async function body(request) { try { return await request.json(); } catch { return {}; } }

// GET: every tool with its current custom image (or null = built-in icon).
export async function GET(request) {
  if (!(await isAdminRequest(request))) return deny();
  try {
    const docs = await (await getToolImageStore()).list();
    const byKey = new Map(docs.map((d) => [d.tool_key, d]));
    const tools = TOOLS.map((t) => {
      const doc = byKey.get(t.key);
      const image = publicToolImage(doc);
      return { key: t.key, title: t.title, category: CATEGORY_LABEL[t.category] || '', image: image ? { ...image, id: doc.site_image_id } : null, updated_at: doc?.updated_at || null };
    });
    return NextResponse.json({ tools }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) { return fail(error); }
}

// PUT { tool_key, site_image_id, alt }: set or replace the tile image.
export async function PUT(request) {
  if (!(await isAdminRequest(request))) return deny();
  const input = await body(request);
  try {
    const doc = await (await getToolImageStore()).set({ toolKey: String(input.tool_key || ''), siteImageId: String(input.site_image_id || ''), alt: input.alt });
    invalidateToolImages();
    return NextResponse.json({ ok: true, image: publicToolImage(doc) });
  } catch (error) { return fail(error); }
}

// DELETE { tool_key } (or ?tool_key=): back to the built-in icon.
export async function DELETE(request) {
  if (!(await isAdminRequest(request))) return deny();
  const input = await body(request);
  const key = String(input.tool_key || new URL(request.url).searchParams.get('tool_key') || '');
  try {
    await (await getToolImageStore()).reset(key);
    invalidateToolImages();
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error); }
}

import { NextResponse } from 'next/server';
import { createAdminSupabaseClient } from '../../../../lib/adminSupabase';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { readMemberSession } from '../../../../lib/memberAuth';
import { guidesTable, canReadGuide } from '../../../../lib/guideAccess.mjs';
export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  const { file } = await params;
  if (!/^[a-f0-9-]{36}\.(jpg|png|webp|gif)$/.test(file)) return new NextResponse(null, { status: 404 });
  const db = createAdminSupabaseClient();
  const admin = await isAdminRequest(request);
  const member = Boolean(await readMemberSession(request));
  if (!admin) {
    const { data, error } = await db.from(guidesTable()).select('is_published,access_level').like('body', `%/api/guide-images/${file}%`).eq('is_published', true);
    if (error || !data?.some(guide => canReadGuide(guide, { member }))) return new NextResponse(null, { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const { data, error } = await db.storage.from('guide-attachments').download(file);
  if (error || !data) return new NextResponse(null, { status: 404 });
  return new NextResponse(await data.arrayBuffer(), { headers: { 'Content-Type': data.type, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}

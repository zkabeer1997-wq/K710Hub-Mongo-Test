import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { readMemberSession } from '../../../../lib/memberAuth';

/**
 * Guide image proxy previously read from Supabase Storage.
 * On Mongo, images should use absolute public URLs in guide body content.
 */
export async function GET(request) {
  const admin = await isAdminRequest(request);
  const member = Boolean(await readMemberSession(request));
  if (!admin && !member) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(
    {
      error: 'Guide image storage proxy is not available on the Mongo stack. Use absolute image URLs.',
      code: 'STORAGE_UNAVAILABLE',
    },
    { status: 501 }
  );
}

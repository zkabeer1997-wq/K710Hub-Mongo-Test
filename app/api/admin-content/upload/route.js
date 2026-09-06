import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';

/**
 * Binary upload previously used Supabase Storage. On the Mongo test stack,
 * host files externally (CDN / existing gallery URL) and paste the public URL
 * into content fields instead.
 */
export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json(
    {
      error:
        'File upload storage is not configured on the Mongo stack. Use an external image URL or the gallery library.',
      code: 'STORAGE_UNAVAILABLE',
    },
    { status: 501 }
  );
}

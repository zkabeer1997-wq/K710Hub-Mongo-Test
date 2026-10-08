import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../../lib/adminAuth';
import { getDriveStorage } from '../../../../../lib/driveStorage.server';
import { streamDriveImage } from '../../../../../lib/siteImages.mjs';

export const dynamic = 'force-dynamic';

// LOCAL DEVELOPMENT ONLY (fake Drive): thumbnails for the fake picker.
export async function GET(request, { params }) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  const { id } = await params;
  const drive = await getDriveStorage();
  if (!drive.fake) return NextResponse.json({ error: 'Not available.' }, { status: 404 });
  const info = await drive.getInfo(id).catch(() => null);
  if (!info || !/^image\//.test(info.mimeType || '')) return NextResponse.json({ error: 'Not found.' }, { status: 404 });
  return streamDriveImage({ fileId: id, mime: info.mimeType, md5: info.md5Checksum, size: info.size, cacheControl: 'private, max-age=60', ifNoneMatch: request.headers.get('if-none-match'), getDrive: async () => drive });
}

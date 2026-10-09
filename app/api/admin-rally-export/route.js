import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getDriveStorage } from '../../../lib/driveStorage.server';
import { getFolderTree } from '../../../lib/siteImages.server';
import { XLSX_MIME } from '../../../lib/styledXlsx.mjs';
import {
  buildSavedRallyExport, isRallyEventType, rememberRallySheet, savedRallySheetId,
} from '../../../lib/rallyExport.server';

export const dynamic = 'force-dynamic';

const denied = () => NextResponse.json({ error: 'Admin login required.' }, { status: 401 });

/** GET ?type=kvk|flamedragon: the same workbook as a .xlsx download. */
export async function GET(request) {
  if (!(await isAdminRequest(request))) return denied();
  const type = new URL(request.url).searchParams.get('type');
  if (!isRallyEventType(type)) return NextResponse.json({ error: 'Unknown event.' }, { status: 400 });
  try {
    const built = await buildSavedRallyExport(type);
    return new Response(built.bytes, {
      headers: {
        'Content-Type': XLSX_MIME,
        'Content-Disposition': `attachment; filename="${built.fileName}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    console.error('admin-rally-export xlsx failed', error);
    return NextResponse.json({ error: 'Could not build the workbook. Please try again.' }, { status: 500 });
  }
}

/**
 * POST { type, mode: 'update' | 'copy' }: writes the workbook to the K710 Website Drive folder as a Google Sheet.
 * 'update' (default) overwrites the cycle's sheet so shared links stay valid and creates it on first use;
 * 'copy' always creates a new sheet and leaves the remembered one alone.
 */
export async function POST(request) {
  if (!(await isAdminRequest(request))) return denied();
  let body;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const type = body?.type;
  if (!isRallyEventType(type)) return NextResponse.json({ error: 'Unknown event.' }, { status: 400 });
  const copy = body?.mode === 'copy';
  try {
    const drive = await getDriveStorage();
    const status = await drive.getStatus();
    if (!status.connected) {
      return NextResponse.json({ error: 'Google Drive is not connected. Connect it in Admin > Gallery first.', needsConnect: true }, { status: 409 });
    }
    const built = await buildSavedRallyExport(type);
    const folderId = await (await getFolderTree(drive)).folderId('rally');
    let file = null;
    let updated = false;
    const existingId = copy ? '' : await savedRallySheetId(built.cycle?.id);
    if (existingId) {
      try {
        file = await drive.uploadSpreadsheet({ name: built.title, bytes: built.bytes, folderId, fileId: existingId });
        updated = true;
      } catch (error) {
        if (error?.code !== 'not_found') throw error; // the sheet was deleted by hand: make a new one
      }
    }
    if (!file) {
      file = await drive.uploadSpreadsheet({ name: built.title, bytes: built.bytes, folderId });
      if (!copy) await rememberRallySheet(built.cycle?.id, file.id);
    }
    return NextResponse.json({ url: file.webViewLink || `https://docs.google.com/spreadsheets/d/${file.id}/edit`, name: file.name || built.title, updated, rallyCount: built.rallyCount });
  } catch (error) {
    if (error?.code === 'reauth') return NextResponse.json({ error: error.message, needsConnect: true }, { status: 409 });
    console.error('admin-rally-export drive failed', error);
    return NextResponse.json({ error: 'Could not write the Google Sheet. Please try again.' }, { status: 500 });
  }
}

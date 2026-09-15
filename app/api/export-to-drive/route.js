import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { google } from 'googleapis';
import { isAdminRequest } from '../../../lib/adminAuth';
import { GOOGLE_DRIVE_TOKEN_COOKIE, isGoogleDriveConfigured } from '../../../lib/googleDrive.server';

const MAX_SHEETS = 20;
const MAX_ROWS_PER_SHEET = 20000;

function validatePayload(body) {
  const title = String(body?.title || '').trim().slice(0, 200);
  if (!title) return { error: 'A title is required.' };
  const sheets = Array.isArray(body?.sheets) ? body.sheets : null;
  if (!sheets || !sheets.length) return { error: 'At least one sheet of data is required.' };
  if (sheets.length > MAX_SHEETS) return { error: `No more than ${MAX_SHEETS} sheets per export.` };
  const cleaned = [];
  for (const sheet of sheets) {
    const name = String(sheet?.name || 'Sheet').trim().slice(0, 90) || 'Sheet';
    const aoa = Array.isArray(sheet?.aoa) ? sheet.aoa : null;
    if (!aoa || !aoa.length) return { error: `Sheet "${name}" has no rows.` };
    if (aoa.length > MAX_ROWS_PER_SHEET) return { error: `Sheet "${name}" has too many rows.` };
    const rows = aoa.map((row) => (Array.isArray(row) ? row.map((cell) => (cell == null ? '' : String(cell))) : []));
    cleaned.push({ name, rows });
  }
  return { title, sheets: cleaned };
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  if (!isGoogleDriveConfigured()) {
    return NextResponse.json(
      { error: 'Google Drive export is not configured on this deployment.' },
      { status: 501 }
    );
  }

  const cookieStore = await cookies();
  const accessToken = cookieStore.get(GOOGLE_DRIVE_TOKEN_COOKIE)?.value;
  if (!accessToken) {
    return NextResponse.json({ needsAuth: true }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const { error: validationError, title, sheets } = validatePayload(body);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const auth = new google.auth.OAuth2();
  auth.setCredentials({ access_token: accessToken });
  const sheetsApi = google.sheets({ version: 'v4', auth });

  try {
    const create = await sheetsApi.spreadsheets.create({
      requestBody: {
        properties: { title },
        sheets: sheets.map((sheet) => ({ properties: { title: sheet.name } })),
      },
    });
    const spreadsheetId = create.data.spreadsheetId;
    const sheetIdByName = new Map(
      (create.data.sheets || []).map((s) => [s.properties.title, s.properties.sheetId])
    );

    await sheetsApi.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: 'RAW',
        data: sheets.map((sheet) => ({
          range: `'${sheet.name}'!A1`,
          values: sheet.rows,
        })),
      },
    });

    const formatRequests = sheets.flatMap((sheet) => {
      const sheetId = sheetIdByName.get(sheet.name);
      if (sheetId == null) return [];
      const columnCount = Math.max(1, ...sheet.rows.map((r) => r.length));
      return [
        {
          repeatCell: {
            range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: 'userEnteredFormat.textFormat.bold',
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
            fields: 'gridProperties.frozenRowCount',
          },
        },
        {
          autoResizeDimensions: {
            dimensions: { sheetId, dimension: 'COLUMNS', startIndex: 0, endIndex: columnCount },
          },
        },
      ];
    });
    if (formatRequests.length) {
      await sheetsApi.spreadsheets.batchUpdate({
        spreadsheetId,
        requestBody: { requests: formatRequests },
      });
    }

    return NextResponse.json({
      url: `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`,
    });
  } catch (error) {
    const status = error?.code === 401 || error?.response?.status === 401 ? 401 : 500;
    if (status === 401) {
      return NextResponse.json({ needsAuth: true }, { status: 401 });
    }
    console.error('export-to-drive failed', error);
    return NextResponse.json({ error: 'Could not create the Google Sheet. Please try again.' }, { status: 500 });
  }
}

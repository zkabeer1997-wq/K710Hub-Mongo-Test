import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import {
  REFERENCE_TABLES, REFERENCE_TABLE_KEYS, builtInRows, differsFromBuiltIn, isReferenceTable, mergeReferenceRows, validateReferenceRows,
} from '../../../lib/toolReferenceTables.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const SERVER_ERROR = 'Something went wrong. Please try again.';

// Admin > Packs/Tools > Tool database: editable charm level / governor gear tier tables.
//   GET                          -> { tables: [{ key, label, columns, rows, defaults, overridden, updated_at, used_by }] }
//   PUT {table, rows}            -> save an override (full table, validated server side)
//   PUT {table, reset: true}     -> delete the override (built-in values apply again)
// The built-in modules (lib/phase2Data.mjs) are the fallback and are never modified.

function respond(body, status = 200) {
  return NextResponse.json(body, { status, headers });
}

function shape(key, doc) {
  const spec = REFERENCE_TABLES[key];
  const rows = mergeReferenceRows(key, doc?.rows);
  return {
    key,
    label: spec.label,
    idLabel: spec.idLabel,
    columns: spec.columns,
    used_by: spec.usedBy,
    rows,
    defaults: builtInRows(key),
    overridden: Boolean(doc) && differsFromBuiltIn(key, rows),
    updated_at: doc?.updated_at ? new Date(doc.updated_at).toISOString() : null,
  };
}

export async function GET(request) {
  if (!(await isAdminRequest(request))) return respond({ error: 'Unauthorized' }, 401);
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_REFERENCE_TABLES);
    const docs = await coll.find({}).toArray();
    return respond({ tables: REFERENCE_TABLE_KEYS.map((key) => shape(key, docs.find((d) => d.key === key))) });
  } catch (error) {
    console.error('admin-tool-reference GET failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

export async function PUT(request) {
  if (!(await isAdminRequest(request))) return respond({ error: 'Unauthorized' }, 401);
  let body;
  try { body = await request.json(); } catch { return respond({ error: 'Invalid request.' }, 400); }
  if (!body || typeof body !== 'object' || !isReferenceTable(body.table)) return respond({ error: 'Choose a supported table.' }, 400);
  const key = body.table;
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_REFERENCE_TABLES);
    if (body.reset === true) {
      await coll.deleteOne({ key });
      revalidateReaders(key);
      return respond({ ok: true, table: shape(key, null) });
    }
    const { rows, error } = validateReferenceRows(key, body.rows);
    if (error) return respond({ error }, 400);
    const now = new Date();
    await coll.updateOne({ key }, { $set: { key, rows, updated_at: now } }, { upsert: true });
    revalidateReaders(key);
    return respond({ ok: true, table: shape(key, { key, rows, updated_at: now }) });
  } catch (error) {
    console.error('admin-tool-reference PUT failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

function revalidateReaders(key) {
  if (key === 'charm-levels') {
    revalidatePath('/tools/charms');
    revalidatePath('/tools/governor-charm-optimizer');
  }
}

import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import {
  MAX_COLUMNS, MAX_DATABASES, MAX_ROWS, isDatabaseId, newDatabaseId, publicDatabase, reorderDatabases, sortDatabases, validateDatabase,
} from '../../../lib/toolDatabases.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const SERVER_ERROR = 'Something went wrong. Please try again.';

// Admin > Packs/Tools > Tool database: admin-created named tables.
//   GET                                   -> { databases, limits }
//   POST   {name, columns, rows}          -> create (max 20, unique names)
//   PUT    {id, name, columns, rows}      -> replace the table
//   PATCH  {id, move: 'up'|'down'}        -> reorder in the list
//   DELETE {id}
// Nothing in the member tools reads these tables yet; they are admin-maintained data.

const respond = (body, status = 200) => NextResponse.json(body, { status, headers });
const limits = { max_databases: MAX_DATABASES, max_columns: MAX_COLUMNS, max_rows: MAX_ROWS };

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export async function GET(request) {
  if (!(await isAdminRequest(request))) return respond({ error: 'Unauthorized' }, 401);
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_DATABASES);
    const docs = await coll.find({}).toArray();
    return respond({ databases: sortDatabases(docs).map(publicDatabase), limits });
  } catch (error) {
    console.error('admin-tool-databases GET failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) return respond({ error: 'Unauthorized' }, 401);
  const body = await readBody(request);
  if (!body) return respond({ error: 'Invalid request.' }, 400);
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_DATABASES);
    const docs = await coll.find({}).toArray();
    if (docs.length >= MAX_DATABASES) return respond({ error: `You can keep at most ${MAX_DATABASES} databases. Delete one first.` }, 400);
    const { value, error } = validateDatabase(body, docs.map((d) => d.name));
    if (error) return respond({ error }, 400);
    const now = new Date();
    const order = docs.reduce((max, d) => Math.max(max, d.order ?? 0), -1) + 1;
    const doc = { id: newDatabaseId(), ...value, order, created_at: now, updated_at: now };
    await coll.insertOne(doc);
    return respond({ ok: true, database: publicDatabase(doc) });
  } catch (error) {
    console.error('admin-tool-databases POST failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

export async function PUT(request) {
  if (!(await isAdminRequest(request))) return respond({ error: 'Unauthorized' }, 401);
  const body = await readBody(request);
  if (!body || !isDatabaseId(body.id)) return respond({ error: 'Invalid request.' }, 400);
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_DATABASES);
    const docs = await coll.find({}).toArray();
    const current = docs.find((d) => d.id === body.id);
    if (!current) return respond({ error: 'That database no longer exists.' }, 404);
    const { value, error } = validateDatabase(body, docs.filter((d) => d.id !== body.id).map((d) => d.name));
    if (error) return respond({ error }, 400);
    const update = { ...value, updated_at: new Date() };
    await coll.updateOne({ id: body.id }, { $set: update });
    return respond({ ok: true, database: publicDatabase({ ...current, ...update }) });
  } catch (error) {
    console.error('admin-tool-databases PUT failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

export async function PATCH(request) {
  if (!(await isAdminRequest(request))) return respond({ error: 'Unauthorized' }, 401);
  const body = await readBody(request);
  if (!body || !isDatabaseId(body.id) || !['up', 'down'].includes(body.move)) return respond({ error: 'Invalid request.' }, 400);
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_DATABASES);
    const docs = await coll.find({}).toArray();
    const moves = reorderDatabases(docs, body.id, body.move);
    if (moves) for (const { id, order } of moves) await coll.updateOne({ id }, { $set: { order } });
    const fresh = await coll.find({}).toArray();
    return respond({ ok: true, databases: sortDatabases(fresh).map(publicDatabase) });
  } catch (error) {
    console.error('admin-tool-databases PATCH failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

export async function DELETE(request) {
  if (!(await isAdminRequest(request))) return respond({ error: 'Unauthorized' }, 401);
  const body = await readBody(request);
  if (!body || !isDatabaseId(body.id)) return respond({ error: 'Invalid request.' }, 400);
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_DATABASES);
    const current = await coll.findOne({ id: body.id });
    if (!current) return respond({ error: 'That database no longer exists.' }, 404);
    await coll.deleteOne({ id: body.id });
    return respond({ ok: true });
  } catch (error) {
    console.error('admin-tool-databases DELETE failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

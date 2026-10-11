import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { TOOL_SLUG_RENAMES } from '../../../lib/toolKeys.mjs';
import {
  CUSTOM_PACK_TOOLS, MAX_CUSTOM_PACKS_PER_TOOL, isCustomPackTool, isPackId, newPackId, publicCustomPack, validateCustomPack,
} from '../../../lib/customPacks.mjs';

export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'no-store' };
const SERVER_ERROR = 'Something went wrong. Please try again.';

// Admin > Packs/Tools > Pack editing: add, edit, disable and delete custom real-money packs.
//   GET    ?tool=adventure-stall|flamedragon-shop   -> { tools: {...spec}, packs: [...] }
//   POST   {tool, name, price, amount, limit}        -> create (max 12 per tool, unique names)
//   PATCH  {id, name?, price?, amount?, limit?, enabled?}
//   DELETE {id}
// Built-in packs are never touched here: they are edited through /api/admin-tool-settings.

function respond(body, status = 200) {
  return NextResponse.json(body, { status, headers });
}

async function guard(request) {
  return (await isAdminRequest(request)) ? null : respond({ error: 'Unauthorized' }, 401);
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

function refresh(tool) {
  revalidatePath(`/tools/${TOOL_SLUG_RENAMES[tool] || tool}`);
}

export async function GET(request) {
  const denied = await guard(request);
  if (denied) return denied;
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_CUSTOM_PACKS);
    const docs = await coll.find({}).toArray();
    docs.sort((a, b) => new Date(a.created_at || 0) - new Date(b.created_at || 0));
    return respond({ tools: CUSTOM_PACK_TOOLS, max_per_tool: MAX_CUSTOM_PACKS_PER_TOOL, packs: docs.filter((d) => isCustomPackTool(d.tool_key)).map(publicCustomPack) });
  } catch (error) {
    console.error('admin-tool-packs GET failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

export async function POST(request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = await readBody(request);
  if (!body) return respond({ error: 'Invalid request.' }, 400);
  if (!isCustomPackTool(body.tool)) return respond({ error: 'Choose a tool that supports extra packs.' }, 400);
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_CUSTOM_PACKS);
    const existing = await coll.find({ tool_key: body.tool }).toArray();
    if (existing.length >= MAX_CUSTOM_PACKS_PER_TOOL) return respond({ error: `You can add at most ${MAX_CUSTOM_PACKS_PER_TOOL} custom packs per tool. Delete one first.` }, 400);
    const { value, error } = validateCustomPack(body.tool, body, existing.map((d) => d.name));
    if (error) return respond({ error }, 400);
    const now = new Date();
    const doc = { id: newPackId(), tool_key: body.tool, ...value, enabled: true, created_at: now, updated_at: now };
    await coll.insertOne(doc);
    refresh(body.tool);
    return respond({ ok: true, pack: publicCustomPack(doc) });
  } catch (error) {
    console.error('admin-tool-packs POST failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

export async function PATCH(request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = await readBody(request);
  if (!body || !isPackId(body.id)) return respond({ error: 'Invalid request.' }, 400);
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_CUSTOM_PACKS);
    const current = await coll.findOne({ id: body.id });
    if (!current) return respond({ error: 'That pack no longer exists.' }, 404);
    const next = {
      name: body.name ?? current.name,
      price: body.price ?? current.price,
      amount: body.amount ?? current.amount,
      limit: body.limit ?? current.limit,
    };
    const siblings = await coll.find({ tool_key: current.tool_key }).toArray();
    const { value, error } = validateCustomPack(current.tool_key, next, siblings.filter((d) => d.id !== current.id).map((d) => d.name));
    if (error) return respond({ error }, 400);
    if (body.enabled !== undefined && typeof body.enabled !== 'boolean') return respond({ error: 'enabled must be true or false.' }, 400);
    const update = { ...value, enabled: body.enabled ?? current.enabled !== false, updated_at: new Date() };
    await coll.updateOne({ id: current.id }, { $set: update });
    refresh(current.tool_key);
    return respond({ ok: true, pack: publicCustomPack({ ...current, ...update }) });
  } catch (error) {
    console.error('admin-tool-packs PATCH failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

export async function DELETE(request) {
  const denied = await guard(request);
  if (denied) return denied;
  const body = await readBody(request);
  if (!body || !isPackId(body.id)) return respond({ error: 'Invalid request.' }, 400);
  try {
    const coll = await getCollection(COLLECTIONS.TOOL_CUSTOM_PACKS);
    const current = await coll.findOne({ id: body.id });
    if (!current) return respond({ error: 'That pack no longer exists.' }, 404);
    await coll.deleteOne({ id: current.id });
    refresh(current.tool_key);
    return respond({ ok: true });
  } catch (error) {
    console.error('admin-tool-packs DELETE failed', error);
    return respond({ error: SERVER_ERROR }, 500);
  }
}

import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { TOOL_CATALOG, defaultQuantities, validateToolQuantities } from '../../../lib/toolCatalog.mjs';

const headers = { 'Cache-Control': 'no-store' };

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  try {
    const coll = await getCollection('tool_settings');
    const data = await coll.find({}).project({ tool_key: 1, quantities: 1, updated_at: 1, _id: 0 }).toArray();
    return NextResponse.json(
      {
        tools: Object.entries(TOOL_CATALOG).map(([key, tool]) => ({
          ...tool,
          key,
          quantities: {
            ...defaultQuantities(key),
            ...(data?.find((r) => r.tool_key === key)?.quantities || {}),
          },
        })),
      },
      { headers }
    );
  } catch {
    return NextResponse.json(
      {
        tools: Object.entries(TOOL_CATALOG).map(([key, tool]) => ({
          ...tool,
          key,
          quantities: defaultQuantities(key),
        })),
      },
      { headers }
    );
  }
}

export async function PUT(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400, headers });
  }
  const { quantities, error } = validateToolQuantities(body?.tool, body?.quantities);
  if (error) return NextResponse.json({ error }, { status: 400, headers });
  try {
    const coll = await getCollection('tool_settings');
    await coll.updateOne(
      { tool_key: body.tool },
      { $set: { tool_key: body.tool, quantities, updated_at: new Date() } },
      { upsert: true }
    );
    revalidatePath(`/tools/${body.tool}`);
    return NextResponse.json({ ok: true, quantities }, { headers });
  } catch {
    return NextResponse.json({ error: 'Unable to save tool settings.' }, { status: 500, headers });
  }
}

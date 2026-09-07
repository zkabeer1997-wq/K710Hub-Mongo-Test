import { NextResponse } from 'next/server';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { readMemberSession } from '../../../../lib/memberAuth';

function validToolKey(tool) {
  return typeof tool === 'string' && /^[a-z0-9-]{1,64}$/.test(tool);
}

export async function GET(request, { params: paramsPromise }) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401 });

  const params = await paramsPromise;
  const tool = params?.tool;
  if (!validToolKey(tool)) return NextResponse.json({ error: 'Invalid tool.' }, { status: 400 });

  try {
    const coll = await getCollection(COLLECTIONS.MEMBER_TOOL_STATE);
    const data = await coll.findOne(
      { member_id: session.memberId, tool_key: tool },
      { projection: { state: 1, updated_at: 1, _id: 0 } }
    );
    return NextResponse.json({ state: data?.state || null, updatedAt: data?.updated_at || null });
  } catch (error) {
    console.error('tool-state GET failed', error);
    return NextResponse.json({ error: 'Unable to load saved tool inputs.' }, { status: 500 });
  }
}

export async function PUT(request, { params: paramsPromise }) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ error: 'Member login required.' }, { status: 401 });

  const params = await paramsPromise;
  const tool = params?.tool;
  if (!validToolKey(tool)) return NextResponse.json({ error: 'Invalid tool.' }, { status: 400 });

  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request.' }, { status: 400 });
  }

  const state = body?.state;
  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return NextResponse.json({ error: 'Invalid tool state.' }, { status: 400 });
  }
  if (JSON.stringify(state).length > 50000) {
    return NextResponse.json({ error: 'Saved tool state is too large.' }, { status: 413 });
  }

  try {
    const coll = await getCollection(COLLECTIONS.MEMBER_TOOL_STATE);
    const now = new Date().toISOString();
    await coll.updateOne(
      { member_id: session.memberId, tool_key: tool },
      {
        $set: {
          member_id: session.memberId,
          tool_key: tool,
          state,
          updated_at: now,
        },
      },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('tool-state PUT failed', error);
    return NextResponse.json({ error: 'Unable to save tool inputs.' }, { status: 500 });
  }
}

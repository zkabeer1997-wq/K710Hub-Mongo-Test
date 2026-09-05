import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const body = await request.json();
    const { page, type, content, position } = body;
    if (!page || !type) {
      return NextResponse.json({ error: 'Missing page or type' }, { status: 400 });
    }
    const coll = await getCollection(COLLECTIONS.CONTENT_BLOCKS);
    const doc = {
      id: randomUUID(),
      page,
      type,
      content: content || {},
      position: position || 0,
      created_at: new Date(),
      updated_at: new Date(),
    };
    await coll.insertOne(doc);
    const { _id, ...block } = doc;
    return NextResponse.json({ block });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

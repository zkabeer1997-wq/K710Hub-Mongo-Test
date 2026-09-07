import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  try {
    const coll = await getCollection('guide_categories');
    const data = await coll.find({}).project({ name: 1, _id: 0 }).sort({ name: 1 }).toArray();
    return NextResponse.json(
      { categories: data || [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  } catch {
    return NextResponse.json({ categories: [] }, { headers: { 'Cache-Control': 'no-store' } });
  }
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  }
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 });
  }
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  if (!name || name.length > 80) {
    return NextResponse.json({ error: 'Category must be 1–80 characters.' }, { status: 400 });
  }
  try {
    const coll = await getCollection('guide_categories');
    const existing = await coll.findOne({ name });
    if (existing) {
      return NextResponse.json({ error: 'That category already exists.' }, { status: 409 });
    }
    await coll.insertOne({ name, created_at: new Date() });
    revalidatePath('/guides');
    return NextResponse.json({ category: { name } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: 'Unable to create category.' }, { status: 500 });
  }
}

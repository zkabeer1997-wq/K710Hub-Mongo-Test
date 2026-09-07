import { NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { isAdminRequest } from '../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

export async function GET(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  const { data, error } = await createAdminSupabaseClient().from('guide_categories').select('name').order('name');
  if (error) return NextResponse.json({ error: 'Unable to load categories.' }, { status: 500 });
  return NextResponse.json({ categories: data }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request) {
  if (!(await isAdminRequest(request))) return NextResponse.json({ error: 'Admin login required.' }, { status: 401 });
  let payload;
  try { payload = await request.json(); }
  catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }); }
  const name = typeof payload?.name === 'string' ? payload.name.trim() : '';
  if (!name || name.length > 80) return NextResponse.json({ error: 'Category must be 1–80 characters.' }, { status: 400 });
  const { data, error } = await createAdminSupabaseClient().from('guide_categories').insert({ name }).select('name').single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'That category already exists.' : 'Unable to create category.' }, { status: error.code === '23505' ? 409 : 500 });
  revalidatePath('/guides');
  return NextResponse.json({ category: data }, { status: 201 });
}

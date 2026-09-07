import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../../lib/adminAuth';
import { createAdminSupabaseClient } from '../../../../lib/adminSupabase';

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const formData = await request.formData();
    const file = formData.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }
    const supabase = createAdminSupabaseClient();
    const arrayBuffer = await file.arrayBuffer();
    const originalName = file.name || 'image.png';
    const ext = originalName.includes('.') ? originalName.split('.').pop() : 'png';
    const path = Date.now() + '-' + Math.random().toString(36).slice(2) + '.' + ext;
    const { error: uploadError } = await supabase.storage
    .from('site-content')
    .upload(path, Buffer.from(arrayBuffer), { contentType: file.type || 'application/octet-stream' });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }
    const { data: publicUrlData } = supabase.storage.from('site-content').getPublicUrl(path);
    return NextResponse.json({ url: publicUrlData.publicUrl });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

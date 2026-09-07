import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import {
  getAdminGiftOverview,
  discoverWikiCodes,
  enrollMemberForGiftCodes,
  queueActiveCodesForAllEnrollments,
} from '../../../lib/giftCodes.mjs';
import { createAdminSupabaseClient } from '../../../lib/adminSupabase';

function noStoreJson(body, init = {}) {
  const response = NextResponse.json(body, init);
  response.headers.set('Cache-Control', 'no-store');
  return response;
}

export async function GET(request) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const overview = await getAdminGiftOverview();
    const url = new URL(request.url);
    const q = url.searchParams.get('q')?.trim();
    let history = [];
    if (q) {
      const client = createAdminSupabaseClient();
      const { data } = await client
        .from('gift_code_redemptions')
        .select('id, player_id, code, status, attempts, last_response, completed_at, created_at')
        .or(`player_id.ilike.%${q}%,code.ilike.%${q}%`)
        .order('created_at', { ascending: false })
        .limit(100);
      history = data || [];
    }
    return noStoreJson({ ok: true, ...overview, history });
  } catch (error) {
    console.error('admin-gift-codes GET failed', error);
    return noStoreJson({ error: 'Unable to load gift codes.' }, { status: 500 });
  }
}

export async function POST(request) {
  if (!(await isAdminRequest(request))) {
    return noStoreJson({ error: 'Unauthorized' }, { status: 401 });
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return noStoreJson({ error: 'Invalid request.' }, { status: 400 });
  }

  const action = String(body?.action || '').trim();
  const client = createAdminSupabaseClient();

  try {
    if (action === 'check_wiki') {
      const discovery = await discoverWikiCodes({ supabase: client });
      return noStoreJson({ ok: true, discovery });
    }

    if (action === 'add_code') {
      // Keep exact casing - codes like "Kingshot888" must match what
      // Century Games expects, not an upper-cased version of it.
      const code = String(body?.code || '').trim();
      if (!code || code.length < 4 || code.length > 32) {
        return noStoreJson({ error: 'Invalid code.' }, { status: 400 });
      }
      const { error } = await client.from('gift_codes').upsert(
        {
          code,
          source: body?.source || 'manual',
          active: true,
          discovered_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          notes: body?.notes || null,
        },
        { onConflict: 'code' }
      );
      if (error) throw error;
      await queueActiveCodesForAllEnrollments(client);
      return noStoreJson({ ok: true, code });
    }

    if (action === 'set_code_active') {
      const code = String(body?.code || '').trim();
      const active = Boolean(body?.active);
      await client
        .from('gift_codes')
        .update({
          active,
          expired_at: active ? null : new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('code', code);
      return noStoreJson({ ok: true });
    }

    if (action === 'enroll_member') {
      const memberId = String(body?.memberId || '').trim();
      const playerId = String(body?.playerId || memberId).trim();
      if (!memberId) return noStoreJson({ error: 'memberId required' }, { status: 400 });
      const id = await enrollMemberForGiftCodes(memberId, playerId, 710);
      return noStoreJson({ ok: true, enrollmentId: id });
    }

    return noStoreJson({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('admin-gift-codes POST failed', error);
    return noStoreJson({ error: error?.message || 'Action failed.' }, { status: 500 });
  }
}

import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';

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
    const coll = await getCollection(COLLECTIONS.GIFT_CODES);
    const codes = await coll.find({}).sort({ discovered_at: -1, created_at: -1 }).toArray();
    const active = codes.filter((c) => c.active !== false);
    return noStoreJson({
      ok: true,
      codes: codes.map(({ _id, ...c }) => ({ ...c, id: c.id || String(_id) })),
      activeCount: active.length,
      totalCount: codes.length,
      enrollments: [],
      history: [],
    });
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

  try {
    const coll = await getCollection(COLLECTIONS.GIFT_CODES);

    if (action === 'check_wiki') {
      return noStoreJson({ ok: true, discovery: { found: [], note: 'Wiki discovery not wired on Mongo test stack yet.' } });
    }

    if (action === 'add_code') {
      const code = String(body?.code || '').trim();
      if (!code || code.length < 4 || code.length > 32) {
        return noStoreJson({ error: 'Invalid code.' }, { status: 400 });
      }
      const now = new Date();
      await coll.updateOne(
        { code },
        {
          $set: {
            code,
            source: body?.source || 'manual',
            active: true,
            discovered_at: now,
            updated_at: now,
            notes: body?.notes || null,
          },
          $setOnInsert: { created_at: now },
        },
        { upsert: true }
      );
      return noStoreJson({ ok: true, code });
    }

    if (action === 'set_code_active') {
      const code = String(body?.code || '').trim();
      const active = Boolean(body?.active);
      await coll.updateOne(
        { code },
        {
          $set: {
            active,
            expired_at: active ? null : new Date(),
            updated_at: new Date(),
          },
        }
      );
      return noStoreJson({ ok: true });
    }

    if (action === 'enroll_member') {
      return noStoreJson({ ok: true, enrollmentId: null, note: 'Enrollment table not in export; no-op on test stack.' });
    }

    return noStoreJson({ error: 'Unknown action.' }, { status: 400 });
  } catch (error) {
    console.error('admin-gift-codes POST failed', error);
    return noStoreJson({ error: error?.message || 'Action failed.' }, { status: 500 });
  }
}

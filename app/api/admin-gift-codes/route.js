import { NextResponse } from 'next/server';
import { isAdminRequest } from '../../../lib/adminAuth';
import { getCollection } from '../../../lib/mongo';
import { COLLECTIONS } from '../../../lib/mongoCollections';
import { addManualCodes, getGiftSourceStatuses, parseCodeList, refreshGiftCodes } from '../../../lib/giftCodeDiscovery.mjs';

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
      sources: await getGiftSourceStatuses(),
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

    if (action === 'check_sources' || action === 'check_wiki') {
      // Respects the 30 minute per-source claim unless the admin explicitly forces it.
      const discovery = await refreshGiftCodes({ force: body?.force === true, coll });
      return noStoreJson({ ok: true, discovery, sources: await getGiftSourceStatuses() });
    }

    if (action === 'add_code' || action === 'add_codes') {
      const { valid, rejected } = parseCodeList(action === 'add_code' ? body?.code : body?.text);
      if (!valid.length) {
        return noStoreJson({ error: 'No valid codes found. Codes are letters and digits only, 4 to 32 characters.', rejected }, { status: 400 });
      }
      if (action === 'add_code' && (valid.length !== 1 || rejected.length)) {
        return noStoreJson({ error: 'Invalid code. Use letters and digits only, 4 to 32 characters.' }, { status: 400 });
      }
      const result = await addManualCodes(coll, valid, { notes: typeof body?.notes === 'string' ? body.notes.slice(0, 200) : null });
      return noStoreJson({ ok: true, code: valid[0], ...result, rejected });
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
            expired_reason: active ? null : 'manual',
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
    return noStoreJson({ error: 'Action failed.' }, { status: 500 });
  }
}

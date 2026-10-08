import { NextResponse } from 'next/server';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';
import { clientIp, isRateLimited } from '../../../../lib/rateLimit.mjs';

/**
 * Public status check for transfer applicants.
 * Accepts ?reference=K710-XXXXXXXX or ?id=<uuid>
 * Returns only safe fields (no screenshots, no admin notes).
 */
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
  if (isRateLimited(`interest-status:${clientIp(request)}`, { windowMs: 10 * 60 * 1000, max: 20 })) {
    return NextResponse.json({ error: 'Too many lookups. Please wait a few minutes and try again.' }, { status: 429, headers });
  }
  try {
    const { searchParams } = new URL(request.url);
    const reference = String(searchParams.get('reference') || '').trim().toUpperCase();
    const id = String(searchParams.get('id') || '').trim();

    if (!reference && !id) {
      return NextResponse.json(
        { error: 'Provide a reference (K710-…) or submission id.' },
        { status: 400, headers }
      );
    }

    const coll = await getCollection(COLLECTIONS.INTEREST_SUBMISSIONS);
    let doc = null;

    if (id) {
      doc = await coll.findOne({ id });
    }
    if (!doc && reference) {
      const hex = reference.replace(/^K710-/, '').toLowerCase();
      // The reference is the first 8 hex chars of the submission id, so an anchored
      // prefix match on the indexed `id` field finds it without scanning the collection.
      if (/^[0-9a-f]{8}$/.test(hex)) {
        doc = await coll.findOne({ id: { $regex: `^${hex}` } });
      }
    }

    if (!doc) {
      return NextResponse.json({ error: 'Submission not found.' }, { status: 404, headers });
    }

    const publicStatus = ['special', 'normal'].includes(doc.status)
      ? 'accepted'
      : doc.status === 'reject'
        ? 'rejected'
        : doc.status === 'waitlist'
          ? 'waitlist'
          : 'pending';

    return NextResponse.json(
      {
        status: publicStatus,
        reference:
          'K710-' + String(doc.id || '').replace(/-/g, '').slice(0, 8).toUpperCase(),
        name: doc.in_game_name || null,
        submitted_at: doc.created_at || null,
        decided_at: doc.decided_at || null,
        target_alliance: publicStatus === 'accepted' ? doc.migrate_alliance || null : null,
        next_step:
          publicStatus === 'accepted'
            ? 'Log in at /dashboard with your Kingshot Player ID. Leadership will assign your alliance.'
            : publicStatus === 'waitlist'
              ? 'You are on the waitlist. Leadership will update this status when an intake window opens.'
              : publicStatus === 'rejected'
                ? 'This application was not accepted at this time.'
                : 'Your application is under review.',
      },
      { headers }
    );
  } catch (error) {
    console.error('interest status lookup failed', error);
    return NextResponse.json({ error: 'Unable to look up status.' }, { status: 500, headers });
  }
}

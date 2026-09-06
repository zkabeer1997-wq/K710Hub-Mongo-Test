import { NextResponse } from 'next/server';
import { getCollection } from '../../../../lib/mongo';
import { COLLECTIONS } from '../../../../lib/mongoCollections';

/**
 * Public status check for transfer applicants.
 * Accepts ?reference=K710-XXXXXXXX or ?id=<uuid>
 * Returns only safe fields (no screenshots, no admin notes).
 */
export async function GET(request) {
  const headers = { 'Cache-Control': 'no-store' };
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
      if (hex.length >= 6) {
        const all = await coll
          .find({})
          .project({
            id: 1,
            status: 1,
            in_game_name: 1,
            created_at: 1,
            decided_at: 1,
            migrate_alliance: 1,
            _id: 0,
          })
          .limit(500)
          .toArray();
        doc =
          all.find((r) => {
            const ref = 'K710-' + String(r.id || '').replace(/-/g, '').slice(0, 8).toUpperCase();
            return ref === reference;
          }) || null;
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
            ? 'Log in at /player-record with your Kingshot Player ID. Leadership will assign your alliance.'
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

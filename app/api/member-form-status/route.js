import { NextResponse } from 'next/server';
import { readMemberSession } from '../../../lib/memberAuth';
import { getOrderedMemberForms, getDeadlineEntries } from '../../../lib/memberFormStatus.server.js';
import { firstIncomplete, stillNeedsSummary } from '../../../lib/memberForms.mjs';
import { describeEntry } from '../../../lib/deadlines.mjs';

const HEADERS = { 'Cache-Control': 'private, no-store' };

// Per-member form status for navigation dots/badges, the sidebar and the
// dashboard card. Computed here (server-side) from submissions + form gates.
export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ signedIn: false, forms: [], entries: [] }, { headers: HEADERS });
  const now = Date.now();
  try {
    const [{ forms, cycles }, entries] = await Promise.all([
      getOrderedMemberForms(session.memberId, now),
      getDeadlineEntries(now),
    ]);
    const first = firstIncomplete(forms);
    return NextResponse.json({
      signedIn: true,
      memberId: session.memberId,
      forms,
      cycles,
      entries: entries.map((entry) => describeEntry(entry, now)),
      summary: stillNeedsSummary(forms),
      firstIncomplete: first ? { key: first.key, label: first.label, href: first.href } : null,
      now,
    }, { headers: HEADERS });
  } catch (error) {
    console.error('member-form-status failed', error);
    return NextResponse.json({ signedIn: true, forms: [], entries: [], degraded: true }, { headers: HEADERS });
  }
}

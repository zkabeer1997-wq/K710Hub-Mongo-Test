import { NextResponse } from 'next/server';
import { readMemberSession } from '../../../lib/memberAuth';
import { getOrderedMemberForms, getDeadlineEntries, getMemberResults } from '../../../lib/memberFormStatus.server.js';
import { firstIncomplete, stillNeedsSummary } from '../../../lib/memberForms.mjs';
import { visibleMemberItems } from '../../../lib/memberResults.mjs';
import { describeEntry } from '../../../lib/deadlines.mjs';

const HEADERS = { 'Cache-Control': 'private, no-store' };

// Per-member form status for navigation dots/badges, the sidebar and the
// dashboard card. Computed here (server-side) from submissions + form gates.
export async function GET(request) {
  const session = await readMemberSession(request);
  if (!session) return NextResponse.json({ signedIn: false, forms: [], entries: [] }, { headers: HEADERS });
  const now = Date.now();
  try {
    const [{ forms: allForms, cycles }, entries] = await Promise.all([
      getOrderedMemberForms(session.memberId, now),
      getDeadlineEntries(now),
    ]);
    // Owner rule: closed / not-yet-open forms are not listed; My appointment follows its form.
    const allResults = await getMemberResults(session.memberId, allForms, now).catch(() => []);
    const { forms, results, hidden } = visibleMemberItems(allForms, allResults);
    const first = firstIncomplete(forms);
    return NextResponse.json({
      signedIn: true,
      memberId: session.memberId,
      forms,
      results,
      hidden,
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

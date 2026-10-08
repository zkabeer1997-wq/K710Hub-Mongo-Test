import { unstable_rethrow } from './rethrowNext.js';
// Server-only data for the logged-in homepage: display name, alliance (for
// the Bear Hunt countdown) and outstanding forms. Every read is defensive;
// a failure degrades to "unknown" rather than breaking the homepage.
import { readKingshotSession } from './memberAuthKingshot.js';
import { findMemberById } from './mongoMembers.js';
import { getMemberFormStatuses } from './memberFormStatus.server.js';
import { displayNameFor, resolveAllianceTag } from './memberHome.mjs';

export async function getMemberHome(cookieStore, allianceTags = []) {
  let session = null;
  try {
    session = await readKingshotSession({ cookies: { get: (name) => cookieStore.get(name) } });
  } catch (error) {
    unstable_rethrow(error);
    session = null;
  }
  if (!session) return null;

  const memberId = session.memberId;
  const name = displayNameFor(session);

  let submissionAlliance = '';
  try {
    const row = await findMemberById(memberId);
    submissionAlliance = row?.current_alliance || '';
  } catch (error) {
    unstable_rethrow(error);
    submissionAlliance = '';
  }
  const allianceTag = resolveAllianceTag([session.allianceAbbr, submissionAlliance], allianceTags);

  let outstanding = [];
  // Same source and same rule as the dashboard "Needs your input" card
  // (/api/member-form-status): open forms this member has not answered this cycle.
  try {
    const forms = await getMemberFormStatuses(memberId);
    outstanding = forms
      .filter((form) => form.needsInput)
      .map((form) => ({
        key: form.key,
        title: form.label,
        href: form.href,
        note: form.carriedOver ? 'Check and save' : 'To do',
      }));
  } catch (error) {
    unstable_rethrow(error);
    outstanding = [];
  }

  return { memberId, name, allianceTag, outstanding };
}

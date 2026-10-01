import { unstable_rethrow } from './rethrowNext.js';
// Server-only data for the logged-in homepage: display name, alliance (for
// the Bear Hunt countdown) and outstanding forms. Every read is defensive;
// a failure degrades to "unknown" rather than breaking the homepage.
import { readKingshotSession } from './memberAuthKingshot.js';
import { findMemberById } from './mongoMembers.js';
import { getMemberFormCompletions } from './formCompletionQueries.server.js';
import { getFormGates } from './formGates.server.js';
import { isCompleted } from './formCompletion.mjs';
import { displayNameFor, resolveAllianceTag } from './memberHome.mjs';

export const HOME_FORMS = [
  { key: 'lead', title: 'Power Profile', href: (id) => `/power-profile?member_id=${id}`, gated: true },
  { key: 'kvk-hub', title: 'KvK Forms', href: (id) => `/forms/kvk?member_id=${id}` },
  { key: 'dragon-hub', title: 'Flamedragon Tyrant Forms', href: (id) => `/forms/flamedragon-tyrant?member_id=${id}` },
];

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
  try {
    const [completions, gates] = await Promise.all([getMemberFormCompletions(memberId), getFormGates()]);
    outstanding = HOME_FORMS.filter((form) => {
      if (form.gated && gates?.[form.key]?.is_open === false) return false;
      return !isCompleted(completions[form.key]);
    }).map((form) => ({ key: form.key, title: form.title, href: form.href(encodeURIComponent(memberId)) }));
  } catch (error) {
    unstable_rethrow(error);
    outstanding = [];
  }

  return { memberId, name, allianceTag, outstanding };
}

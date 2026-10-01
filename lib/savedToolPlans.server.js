import { unstable_rethrow } from './rethrowNext.js';
import { readMemberSession } from './memberAuth';
import { getCollection } from './mongo';
import { COLLECTIONS } from './mongoCollections';
import { ALL_SAVED_PLAN_STORAGE_KEYS, savedPlansBySlug } from './toolKeys.mjs';

/**
 * Which tools does the signed-in member already have a saved plan for?
 * Never throws: logged-out visitors and a missing/failed database both
 * resolve to an empty result so /tools always renders.
 */
export async function getSavedToolPlans(cookieStore) {
  try {
    const session = await readMemberSession({ cookies: cookieStore });
    if (!session) return { signedIn: false, plans: {} };
    try {
      const coll = await getCollection(COLLECTIONS.MEMBER_TOOL_STATE);
      const records = await coll
        .find({ member_id: session.memberId, tool_key: { $in: ALL_SAVED_PLAN_STORAGE_KEYS } })
        .project({ tool_key: 1, updated_at: 1, _id: 0 })
        .toArray();
      return { signedIn: true, plans: savedPlansBySlug(records) };
    } catch (error) {
      unstable_rethrow(error);
      console.error('saved tool plans lookup failed', error);
      return { signedIn: true, plans: {} };
    }
  } catch (error) {
    unstable_rethrow(error);
    return { signedIn: false, plans: {} };
  }
}

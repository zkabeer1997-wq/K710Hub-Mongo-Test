// Server-side rules for what a /interest submission stores, and how a repeat
// submission for the same player in the same intake window is handled.
// Framework-free so it can be unit tested without Next or MongoDB.

export const VERIFIED_SOURCE = 'kingshot_game';

function allianceText(snapshot) {
  const abbr = String(snapshot.allianceAbbr || '').trim();
  const name = String(snapshot.allianceName || '').trim();
  if (abbr && name) return `[${abbr}] ${name}`;
  return abbr || name || 'None';
}

/**
 * Applies a VERIFIED applicant snapshot (already signature-checked by the
 * caller) over the typed answers. Client-sent values for the locked fields are
 * ignored. Returns the fields to store plus which numeric keys come from the
 * game (the caller skips range-checking those) and the self-reported flags.
 */
export function applyVerifiedSnapshot(fields, snapshot) {
  const next = { ...fields };
  const locked = new Set(['current_server']);
  next.player_id = String(snapshot.playerId);
  next.in_game_name = String(snapshot.nickname || `Governor ${snapshot.playerId}`);
  next.current_server = String(snapshot.kingdomId);
  next.current_alliance = allianceText(snapshot);

  let powerSelfReported = true;
  if (snapshot.power !== null && snapshot.power !== undefined) {
    next.total_power = String(snapshot.power);
    locked.add('total_power');
    powerSelfReported = false;
  }
  let mysticSelfReported = true;
  if (snapshot.mysticTrial !== null && snapshot.mysticTrial !== undefined) {
    next.mystic_trial_score = String(snapshot.mysticTrial);
    locked.add('mystic_trial_score');
    mysticSelfReported = false;
  }
  return { fields: next, locked, powerSelfReported, mysticSelfReported };
}

/** Markers stored on every application. `snapshot` is null for the unverified path. */
export function verificationMarkers(snapshot, { powerSelfReported = true, mysticSelfReported = true } = {}) {
  if (!snapshot) {
    return {
      verified: false,
      verified_at: null,
      verified_source: null,
      stats_fetched_at: null,
      power_self_reported: true,
      mystic_self_reported: true,
    };
  }
  const fetchedAt = new Date(snapshot.fetchedAt);
  return {
    verified: true,
    verified_at: fetchedAt,
    verified_source: VERIFIED_SOURCE,
    stats_fetched_at: fetchedAt,
    power_self_reported: Boolean(powerSelfReported),
    mystic_self_reported: Boolean(mysticSelfReported),
  };
}

/**
 * Finds the row a new submission replaces (same player, same intake window).
 *
 *  - no earlier row: insert a new one.
 *  - verified submission: replaces the player's primary row (verified or not).
 *  - unverified submission, primary row unverified: replaces it.
 *  - unverified submission, primary row VERIFIED: never touches it. It is stored
 *    as its own row (flagged `unverified_duplicate_of`), replacing an earlier
 *    such row if there is one. So typing someone's Player ID can never clobber
 *    their verified application, and nothing is lost either.
 *
 * Returns { target, duplicateOf }: `target` is the row to overwrite (or null to
 * insert), `duplicateOf` is the primary row id when the new row is a duplicate.
 */
export async function findResubmitTarget(coll, { playerId, periodId, verified }) {
  if (!playerId || !periodId) return { target: null, duplicateOf: null };
  const base = { player_id: playerId, intake_period_id: periodId, id: { $type: 'string' } };
  const newest = { created_at: -1 };
  const [primary = null] = await coll.find({ ...base, unverified_duplicate_of: { $exists: false } }).sort(newest).limit(1).toArray();
  if (!primary) return { target: null, duplicateOf: null };
  if (verified || primary.verified !== true) return { target: primary, duplicateOf: null };
  const [shadow = null] = await coll.find({ ...base, unverified_duplicate_of: primary.id }).sort(newest).limit(1).toArray();
  return { target: shadow, duplicateOf: primary.id };
}

/**
 * The $set / $unset for replacing `previous` with a new submission. Keeps the
 * row id (so the K710-XXXXXXXX reference stays the same), keeps the admin's
 * note and decision (a REJECTED application becomes pending again because the
 * person is deliberately re-applying), remembers the first submission time and
 * counts the resubmission. Old Drive screenshot metadata is kept in
 * `previous_screenshot_files`; no Drive file is deleted.
 */
export function buildOverwriteUpdate(previous, { fields, markers, clientRequestId, duplicateOf, now = new Date() }) {
  const set = {
    ...fields,
    ...markers,
    created_at: now,
    updated_at: now,
    first_submitted_at: previous.first_submitted_at || previous.created_at || now,
    resubmitted_count: (Number(previous.resubmitted_count) || 0) + 1,
    screenshot_urls: [],
    screenshot_files: [],
    screenshot_state: 'pending',
    previous_screenshot_files: [...(previous.previous_screenshot_files || []), ...(previous.screenshot_files || [])],
  };
  const unset = { mystic_trial_stages: '', screenshot_storage: '' };
  if (clientRequestId) set.client_request_id = clientRequestId;
  else unset.client_request_id = '';
  if (duplicateOf) set.unverified_duplicate_of = duplicateOf;
  if (previous.status === 'reject') {
    set.status = 'pending';
    set.previous_status = 'reject';
    unset.decided_at = '';
  }
  return { $set: set, $unset: unset };
}

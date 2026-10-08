#!/usr/bin/env node
/**
 * Removes ONLY what scripts/dev/seed-test-data.mjs created:
 *  - rows for member ids 920000001-920000030 (roster, power profiles, forms, applications, assignments,
 *    votes, requests, snapshots, tool state, kingshot users/sessions/codes, interest submissions)
 *  - rows flagged is_test:true
 *  - guides/events "qa-test-*", gift codes "QATEST*", gallery "QA Test *", alliances whose blurb starts "[QA test]",
 *    intake periods "QA Test *", the test members' ids inside admin rally rows
 * It does NOT delete event cycles or form-gate rows (shared settings); run an admin "start cycle" if you want a fresh one.
 *   node scripts/dev/clear-test-data.mjs
 */
import { MEMBER_IDS, mongo } from './qa-lib.mjs';

const { client, db } = await mongo();
const out = {};
const del = async (coll, filter) => { const r = await db.collection(coll).deleteMany(filter); if (r.deletedCount) out[coll] = (out[coll] || 0) + r.deletedCount; };
const byMember = ['submissions', 'power_profiles', 'flamedragon_forms', 'prep_backpack', 'noble_advisor_submissions', 'kvk_appointment_applications', 'kvk_appointment_assignments', 'event_participation', 'website_requests', 'event_cycle_snapshots', 'member_tool_state', 'kvk_member_availability'];
for (const c of byMember) await del(c, { $or: [{ member_id: { $in: MEMBER_IDS } }, { is_test: true }] });
for (const c of ['kingshot_users', 'kingshot_sessions', 'kingshot_personal_codes', 'kingshot_login_events', 'interest_submissions']) {
  await del(c, { $or: [{ player_id: { $in: MEMBER_IDS } }, { is_test: true }] });
}
await del('kingdom_guides', { $or: [{ slug: /^qa-test-/ }, { is_test: true }] });
await del('guide_content', { slug: /^qa-test-/ });
await del('events', { $or: [{ slug: /^qa-test-/ }, { is_test: true }] });
await del('gift_codes', { $or: [{ code: /^QATEST/ }, { is_test: true }] });
await del('gallery_images', { $or: [{ title: /^QA Test / }, { is_test: true }] });
await del('alliances', { $or: [{ blurb: /^\[QA test\]/ }, { is_test: true }] });
await del('transfer_intake_periods', { $or: [{ label: /^QA Test/ }, { is_test: true }] });
for (const c of ['admin_rallies', 'flamedragon_admin_rallies']) {
  const r = await db.collection(c).updateMany({}, { $pull: { member_ids: { $in: MEMBER_IDS } } });
  if (r.modifiedCount) out[c + ' (members removed from rallies)'] = r.modifiedCount;
  await db.collection(c).updateMany({ lead_member_id: { $in: MEMBER_IDS } }, { $set: { lead_member_id: null } });
  await del(c, { id: /^qa-rally-/ });
}
console.table(out);
await client.close();

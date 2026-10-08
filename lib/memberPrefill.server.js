import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { KVK_ALLIANCES } from './playerCombatOptions.mjs';
import { resolveTroopPrefill } from './kvkAvailability.mjs';
import { HEROES as DRAGON_HEROES } from './flamedragonForm.mjs';

// Identity details a member has already given somewhere on the site, used to prefill the name /
// member id / alliance of a form they have never filled in (and have no earlier cycle answer for).
// Never returns PIN hashes or any secret. Every read degrades to "nothing known".

const str = (v) => String(v == null ? '' : v).trim();

async function one(name, filter, projection) {
  try {
    const coll = await getCollection(name);
    return await coll.findOne(filter, { projection: { ...projection, _id: 0 } });
  } catch {
    return null;
  }
}

/**
 * @returns {Promise<{name: string, current_alliance: string, from: string|null, profile: object|null}>}
 *   `from` names the first source that supplied anything ('your Power Profile', 'your KvK Availability
 *   answers', 'your Kingshot profile'). `profile` is the member's stored power_profiles row (or null).
 */
export async function loadMemberBase(memberId) {
  const id = str(memberId);
  const empty = { name: '', current_alliance: '', from: null, profile: null };
  if (!id) return empty;
  const [profile, roster, dragon, ks] = await Promise.all([
    one(COLLECTIONS.POWER_PROFILES, { member_id: id }, {}),
    one(COLLECTIONS.SUBMISSIONS, { member_id: id }, { name: 1, current_alliance: 1 }),
    one(COLLECTIONS.FLAMEDRAGON_FORMS, { member_id: id }, { name: 1, current_alliance: 1 }),
    one('kingshot_users', { player_id: id }, { nickname: 1, alliance_abbr: 1 }),
  ]);
  const allianceOk = (v) => (KVK_ALLIANCES.includes(str(v)) ? str(v) : '');
  const nick = str(ks?.nickname) && str(ks?.nickname) !== id ? str(ks.nickname) : '';
  const candidates = [
    { from: 'your Power Profile', name: str(profile?.name), alliance: '' },
    { from: 'your KvK Availability answers', name: str(roster?.name), alliance: allianceOk(roster?.current_alliance) },
    { from: 'your Flamedragon Tyrant answers', name: str(dragon?.name), alliance: allianceOk(dragon?.current_alliance) },
    { from: 'your Kingshot profile', name: nick, alliance: allianceOk(ks?.alliance_abbr) },
  ];
  const name = candidates.find((c) => c.name)?.name || '';
  const alliance = candidates.find((c) => c.alliance)?.alliance || '';
  const from = candidates.find((c) => c.name || c.alliance)?.from || null;
  return { name, current_alliance: alliance, from, profile: profile || null };
}

/**
 * Starting values for the Flamedragon form when the member has no answer in any cycle: identity from
 * loadMemberBase, gear/charms/pets from the Power Profile, troop levels + heroes from their latest
 * KvK Availability answers (falling back to the old Power Profile values). Plain strings, no secrets.
 */
export async function loadDragonFallback(memberId) {
  const id = str(memberId);
  const base = await loadMemberBase(id);
  const roster = id ? await one(COLLECTIONS.SUBMISSIONS, { member_id: id }, {
    infantry_tier: 1, infantry_tg: 1, cavalry_tier: 1, cavalry_tg: 1, archer_tier: 1, archer_tg: 1, heroes: 1,
  }) : null;
  const t = resolveTroopPrefill([{ row: roster, from: 'record' }, { row: base.profile, from: 'profile' }], DRAGON_HEROES);
  const p = base.profile || {};
  const any = base.from || t.troopsFrom || t.heroesFrom;
  if (!any) return null;
  return {
    name: base.name,
    current_alliance: base.current_alliance,
    ...t.troops,
    heroes: t.heroes,
    charms: str(p.charms),
    governor_gear: str(p.governor_gear),
    pet_power: str(p.pet_power),
    masters_power: str(p.masters_power),
    mystic_trial_score: str(p.mystic_trial_score),
  };
}

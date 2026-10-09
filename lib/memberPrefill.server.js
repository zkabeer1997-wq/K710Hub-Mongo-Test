import { getCollection } from './mongo.js';
import { COLLECTIONS } from './mongoCollections.js';
import { getAcceptedAllianceTags } from './allianceTags.server.js';
import { resolveTroopPrefill } from './kvkAvailability.mjs';
import { getActiveHeroNames } from './heroCatalog.server.js';
import * as React from 'react';

// Identity details a member has already given somewhere on the site, used to prefill the name /
// member id / alliance of a form they have never filled in (and have no earlier cycle answer for).
// Never returns PIN hashes or any secret. Every read degrades to "nothing known".

const str = (v) => String(v == null ? '' : v).trim();

// A Kingshot nickname that is just the login id or the 'Governor <id>' stand-in made when the game
// profile could not be read is not a name a member chose: never show it as their name.
export function realNickname(value, memberId) {
  const nick = str(value);
  if (!nick || nick === str(memberId)) return '';
  if (/^governor\s*#?\s*\d+$/i.test(nick)) return '';
  return nick;
}

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
  const [profile, roster, dragon, ks, knownAlliances] = await Promise.all([
    one(COLLECTIONS.POWER_PROFILES, { member_id: id }, {}),
    one(COLLECTIONS.SUBMISSIONS, { member_id: id }, { name: 1, current_alliance: 1 }),
    one(COLLECTIONS.FLAMEDRAGON_FORMS, { member_id: id }, { name: 1, current_alliance: 1 }),
    one('kingshot_users', { player_id: id }, { nickname: 1, alliance_abbr: 1 }),
    getAcceptedAllianceTags(),
  ]);
  const allianceOk = (v) => (knownAlliances.includes(str(v)) ? str(v) : '');
  const nick = realNickname(ks?.nickname, id);
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
    infantry_tier: 1, infantry_tg: 1, cavalry_tier: 1, cavalry_tg: 1, archer_tier: 1, archer_tg: 1, heroes: 1, updated_at: 1,
  }) : null;
  // The profile remembers the latest troops saved on either form; the KvK roster row wins unless the profile is newer.
  const profileNewer = base.profile?.troop_updated_at && new Date(base.profile.troop_updated_at) > new Date(roster?.updated_at || 0);
  const sources = [{ row: roster, from: 'record' }, { row: base.profile, from: 'profile' }];
  const t = resolveTroopPrefill(profileNewer ? sources.reverse() : sources, await getActiveHeroNames());
  const p = base.profile || {};
  const any = base.from || t.troopsFrom || t.heroesFrom;
  if (!any) return null;
  return {
    name: base.name,
    current_alliance: base.current_alliance,
    ...t.troops,
    heroes: t.heroes,
    troop_updated_at: base.profile?.troop_updated_at || null,
    charms: str(p.charms),
    governor_gear: str(p.governor_gear),
    pet_power: str(p.pet_power),
    masters_power: str(p.masters_power),
    mystic_trial_score: str(p.mystic_trial_score),
  };
}

const SAVED_NAME_SOURCES = [
  { coll: COLLECTIONS.POWER_PROFILES, field: 'name', from: 'your Power Profile' },
  { coll: COLLECTIONS.SUBMISSIONS, field: 'name', from: 'your KvK Availability answers' },
  { coll: COLLECTIONS.FLAMEDRAGON_FORMS, field: 'name', from: 'your Flamedragon Tyrant answers' },
  { coll: COLLECTIONS.PREP_BACKPACK, field: 'in_game_name', from: 'your KvK Prep answers' },
  { coll: COLLECTIONS.NOBLE_ADVISOR, field: 'in_game_name', from: 'your Noble Advisor answers' },
];

async function latestSavedName(id) {
  const rows = await Promise.all(SAVED_NAME_SOURCES.map(async (src) => {
    try {
      const coll = await getCollection(src.coll);
      const found = await coll.find({ member_id: id }).project({ [src.field]: 1, updated_at: 1, _id: 0 }).toArray();
      return found.map((row) => ({ name: str(row?.[src.field]), at: new Date(row?.updated_at || 0).getTime() || 0 }));
    } catch {
      return [];
    }
  }));
  const named = rows.flat().filter((r) => r.name && realNickname(r.name, id));
  named.sort((a, b) => b.at - a.at);
  return named[0]?.name || '';
}

async function loadIdentity(memberId) {
  const id = str(memberId);
  const out = { memberId: id, name: '', alliance: '', source: null };
  if (!id) return out;
  const [ks, alliance, knownAlliances] = await Promise.all([
    one(COLLECTIONS.KINGSHOT_USERS, { player_id: id }, { nickname: 1, alliance_abbr: 1 }),
    one(COLLECTIONS.SUBMISSIONS, { member_id: id }, { current_alliance: 1 }),
    getAcceptedAllianceTags(),
  ]);
  const allianceOk = (v) => (knownAlliances.includes(str(v)) ? str(v) : '');
  out.alliance = allianceOk(ks?.alliance_abbr) || allianceOk(alliance?.current_alliance);
  const nick = realNickname(ks?.nickname, id);
  if (nick) return { ...out, name: nick, source: 'kingshot' };
  const saved = await latestSavedName(id);
  if (saved) return { ...out, name: saved, source: 'saved' };
  return out;
}

// One shared lookup for who the signed-in member is, for every member form. The member id is ALWAYS
// the session's (their login); never a client-supplied value. Name: the Kingshot nickname when it is a
// real name, else the newest name saved on any of their forms, else ''. Cached per request (React cache
// where available) so a page and its components never repeat the reads.
const cachedIdentity = typeof React.cache === 'function' ? React.cache(loadIdentity) : loadIdentity;

/** @returns {Promise<{memberId: string, name: string, alliance: string, source: 'kingshot'|'saved'|null}>} */
export async function getMemberIdentity(session) {
  const id = str(session?.memberId);
  if (!id) return { memberId: '', name: '', alliance: '', source: null };
  try {
    return { ...(await cachedIdentity(id)) };
  } catch {
    return { memberId: id, name: '', alliance: '', source: null };
  }
}

/** Server pages: identity of the signed-in member from the request cookies, or null when signed out. */
export async function getPageIdentity() {
  const [{ cookies }, { readMemberSession }] = await Promise.all([import('next/headers'), import('./memberAuth.js')]);
  const session = await readMemberSession({ cookies: await cookies() });
  return session ? getMemberIdentity(session) : null;
}

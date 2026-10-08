export const RALLY_STORAGE_KEY = 'kvk-admin-rallies-v1';
export const DEFAULT_TROOP_WEIGHTS = { infantry: 0, cavalry: 0, archer: 0 };
// A march carries at most four lead hero slots, but the same hero can fill
// more than one of them (e.g. 3x Saul + 1x Thrud). leadHeroes is therefore
// stored as { heroName: count }, with the counts summing to at most this cap.
export const MAX_LEAD_HEROES = 4;

// Explicit troop-level strength order (best first), per kingdom doctrine.
// TG dominates, except T11 at a lower TG can still beat T10 at a higher TG
// for TG7/TG6/TG5 — this table is the source of truth, not a formula.
const TROOP_LEVEL_ORDER = [
  ['TG8', 'T11'],
  ['TG8', 'T10'],
  ['TG7', 'T11'],
  ['TG6', 'T11'],
  ['TG7', 'T10'],
  ['TG5', 'T11'],
  ['TG6', 'T10'],
  ['TG5', 'T10'],
];

const AVAILABILITY_TARGET_PER_RALLY = 8;

export function createNextRally(rallies, id = `rally-${Date.now()}`) {
return [
...rallies,
{
id,
name: `Rally ${rallies.length + 1}`,
memberIds: [],
leadMemberId: '',
troopWeights: { ...DEFAULT_TROOP_WEIGHTS },
leadHeroes: {},
leadHeroAssignments: {},
},
];
}

               export function renameRally(rallies, rallyId, name) {
                 return rallies.map((rally) => (
                   rally.id === rallyId ? { ...rally, name } : rally
                   ));
               }

function normalizeLeadHeroes(value) {
  const counts = {};
  let total = 0;
  const entries = Array.isArray(value)
    ? value.map((hero) => [hero, 1])
    : Object.entries(value && typeof value === 'object' ? value : {});
  entries.forEach(([hero, count]) => {
    const heroName = String(hero || '').trim();
    if (!heroName) return;
    const requested = Math.max(0, Math.floor(Number(count) || 0));
    if (requested <= 0) return;
    const allowed = Math.min(requested, MAX_LEAD_HEROES - total);
    if (allowed <= 0) return;
    counts[heroName] = (counts[heroName] || 0) + allowed;
    total += allowed;
  });
  return counts;
}

function normalizeLeadHeroAssignments(value) {
  const assignments = {};
  if (!value || typeof value !== 'object') return assignments;
  Object.entries(value).forEach(([memberId, hero]) => {
    if (hero) assignments[String(memberId)] = String(hero);
  });
  return assignments;
}

function normalizeRally(rally) {
const leadMemberId = rally.leadMemberId ? String(rally.leadMemberId) : '';
const memberIds = Array.isArray(rally.memberIds) ? rally.memberIds.map(String) : [];
return {
id: rally.id,
name: rally.name,
// A Rally Lead is never also a joiner in their own rally - strip any
// stale overlap (e.g. from data saved before this rule existed) on load.
memberIds: leadMemberId ? memberIds.filter((id) => id !== leadMemberId) : memberIds,
leadMemberId,
troopWeights: {
...DEFAULT_TROOP_WEIGHTS,
...(rally.troopWeights || {}),
},
leadHeroes: normalizeLeadHeroes(rally.leadHeroes),
leadHeroAssignments: normalizeLeadHeroAssignments(rally.leadHeroAssignments),
};
}

/** Every member currently holding a Rally Lead role, across all rallies. */
export function getRallyLeadMemberIds(rallies) {
return new Set(
(rallies || [])
.map((rally) => rally.leadMemberId)
.filter(Boolean)
.map(String),
);
}

/** A Rally Lead cannot also be assigned as a regular joiner - in this rally or any other. */
export function assignMemberToRally(rallies, rallyId, memberId) {
const normalizedMemberId = String(memberId);
if (getRallyLeadMemberIds(rallies).has(normalizedMemberId)) return rallies;
return rallies.map((rally) => {
const memberIds = rally.memberIds.filter((id) => id !== normalizedMemberId);
if (rally.id !== rallyId) {
return { ...rally, memberIds };
}
return {
...rally,
memberIds: [...memberIds, normalizedMemberId],
};
});
}

export function removeMemberFromRallies(rallies, memberId) {
const normalizedMemberId = String(memberId);
return rallies.map((rally) => ({
...rally,
memberIds: rally.memberIds.filter((id) => id !== normalizedMemberId),
}));
}

export function removeRallyById(rallies, rallyId) {
return rallies.filter((rally) => rally.id !== rallyId);
}

/** Setting a Rally Lead also pulls that member out of every rally's joiner list. */
export function setRallyLead(rallies, rallyId, memberId) {
const normalizedMemberId = String(memberId || '');
return rallies.map((rally) => {
const memberIds = normalizedMemberId
? rally.memberIds.filter((id) => id !== normalizedMemberId)
: rally.memberIds;
if (rally.id !== rallyId) return { ...rally, memberIds };
return { ...rally, memberIds, leadMemberId: normalizedMemberId };
});
}

export function setRallyTroopWeight(rallies, rallyId, troopType, value) {
const numberValue = Math.max(0, Math.min(100, Number(value) || 0));
return rallies.map((rally) => (
rally.id === rallyId
? {
...rally,
troopWeights: {
...DEFAULT_TROOP_WEIGHTS,
...(rally.troopWeights || {}),
[troopType]: numberValue,
},
}
: rally
));
}

function leadHeroTotal(leadHeroes) {
  return Object.values(leadHeroes || {}).reduce((sum, count) => sum + count, 0);
}

/** Adds one more copy of `hero` to the rally's lead-hero pool, up to the combined cap of 4. */
export function incrementRallyLeadHero(rallies, rallyId, hero) {
return rallies.map((rally) => {
if (rally.id !== rallyId) return rally;
const leadHeroes = { ...(rally.leadHeroes || {}) };
if (leadHeroTotal(leadHeroes) >= MAX_LEAD_HEROES) return rally;
leadHeroes[hero] = (leadHeroes[hero] || 0) + 1;
return { ...rally, leadHeroes };
});
}

/** Removes one copy of `hero` from the rally's lead-hero pool. */
export function decrementRallyLeadHero(rallies, rallyId, hero) {
return rallies.map((rally) => {
if (rally.id !== rallyId) return rally;
const leadHeroes = { ...(rally.leadHeroes || {}) };
if (!leadHeroes[hero]) return rally;
const nextCount = leadHeroes[hero] - 1;
if (nextCount <= 0) delete leadHeroes[hero];
else leadHeroes[hero] = nextCount;
return { ...rally, leadHeroes };
});
}

export function getLeadHeroTotal(rally) {
  return leadHeroTotal(rally?.leadHeroes);
}

/** Which of this rally's selected lead heroes does this member's hero roster cover. */
export function getMatchingLeadHeroes(member, rally) {
const memberHeroes = new Set((member.heroes || []).map(String));
return Object.keys(rally.leadHeroes || {}).filter((hero) => memberHeroes.has(String(hero)));
}

export function getTroopLevelSummary(member) {
return [
['Inf', member.infantry_tier, member.infantry_tg],
['Cav', member.cavalry_tier, member.cavalry_tg],
['Arch', member.archer_tier, member.archer_tg],
]
.map(([label, tier, tg]) => {
const parts = [tier, tg].filter(Boolean);
return parts.length ? `${label} ${parts.join('/')}` : '';
})
.filter(Boolean);
}

function troopLevelRank(tier, tg) {
  const idx = TROOP_LEVEL_ORDER.findIndex(([rowTg, rowTier]) => rowTg === tg && rowTier === tier);
  if (idx !== -1) return idx;
  if (tg === 'Below TG5') return TROOP_LEVEL_ORDER.length + (tier === 'T11' ? 0 : 1);
  return TROOP_LEVEL_ORDER.length + 2;
}

const WORST_TROOP_RANK = TROOP_LEVEL_ORDER.length + 2;

/** Higher is better. Ranges 0 (no data) .. WORST_TROOP_RANK+1 (TG8+T11). */
function troopLevelScore(tier, tg) {
  return WORST_TROOP_RANK + 1 - troopLevelRank(tier, tg);
}

/**
 * Formation-aware troop score: cavalry-heavy formations (cavalry % >= archer %)
 * weigh infantry + cavalry only; archer-heavy formations weigh all three,
 * per kingdom doctrine on the 60/40/0, 50/1/49-style formations.
 */
function scoreMemberForRally(row, rally) {
const weights = { ...DEFAULT_TROOP_WEIGHTS, ...(rally.troopWeights || {}) };
const infantryScore = troopLevelScore(row.infantry_tier, row.infantry_tg);
const cavalryScore = troopLevelScore(row.cavalry_tier, row.cavalry_tg);
const archerScore = troopLevelScore(row.archer_tier, row.archer_tg);
const archerHeavy = weights.archer >= weights.cavalry;
return archerHeavy
? infantryScore + archerScore + cavalryScore
: infantryScore + cavalryScore;
}

function classifyAvailability(row) {
  const text = String(row.availability || '').toLowerCase();
  if (text.includes('not available')) return 'none';
  if (text.includes('full')) return 'full';
  if (text.includes('first')) return 'first';
  if (text.includes('second')) return 'second';
  return 'none';
}

function sortByScoreDesc(list, rally) {
  return [...list]
    .map((row) => ({ row, score: scoreMemberForRally(row, rally) }))
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.row);
}

/**
 * Assigns each selected lead hero (by count) to an eligible, not-yet-assigned
 * member who has that hero on file. Returns the assignment map plus
 * human-readable lines, including a shortfall note when a hero can't be
 * fully covered by the rally's current members.
 */
export function assignLeadHeroesForRally(rally, members) {
  const leadHeroes = rally.leadHeroes || {};
  const assignments = {};
  const lines = [];
  const takenMemberIds = new Set();
  Object.entries(leadHeroes).forEach(([hero, count]) => {
    const eligible = members.filter((member) => (
      !takenMemberIds.has(String(member.member_id)) && (member.heroes || []).includes(hero)
    ));
    const picked = eligible.slice(0, count);
    picked.forEach((member) => {
      assignments[String(member.member_id)] = hero;
      takenMemberIds.add(String(member.member_id));
      lines.push(`${member.name || member.member_id} has been assigned ${hero}.`);
    });
    if (picked.length < count) {
      lines.push(`${hero}: ${picked.length}/${count} assigned - not enough eligible members in the rally.`);
    }
  });
  return { assignments, lines };
}

/**
 * Fills a rally to 8 members: as many Full Battle members as possible
 * (best troop level for the rally's formation first), then backfills any
 * remaining slots with a First Half + Second Half pair per slot (so a rally
 * short 2 full-timers gains 2 first-half + 2 second-half members, not 2
 * total). Also runs lead-hero assignment across the final roster and
 * returns a summary for the admin.
 */
export function autoAssignRallyMembers(rallies, rallyId, rows) {
const targetRally = rallies.find((rally) => rally.id === rallyId);
if (!targetRally) return { rallies, summary: null };

const assignedElsewhere = new Set();
rallies.forEach((rally) => {
if (rally.id === rallyId) return;
rally.memberIds.forEach((memberId) => assignedElsewhere.add(String(memberId)));
});
const currentMemberIds = new Set(targetRally.memberIds.map(String));
const leadMemberIds = getRallyLeadMemberIds(rallies);

const eligible = rows.filter((row) => (
!assignedElsewhere.has(String(row.member_id))
&& !currentMemberIds.has(String(row.member_id))
&& !leadMemberIds.has(String(row.member_id))
));

const byAvailability = { full: [], first: [], second: [] };
eligible.forEach((row) => {
const bucket = classifyAvailability(row);
if (byAvailability[bucket]) byAvailability[bucket].push(row);
});

const fullSorted = sortByScoreDesc(byAvailability.full, targetRally);
const firstSorted = sortByScoreDesc(byAvailability.first, targetRally);
const secondSorted = sortByScoreDesc(byAvailability.second, targetRally);

const fullPicked = fullSorted.slice(0, AVAILABILITY_TARGET_PER_RALLY);
const remainingSlots = Math.max(0, AVAILABILITY_TARGET_PER_RALLY - fullPicked.length);

const partialPicked = [];
for (let i = 0; i < remainingSlots; i += 1) {
if (firstSorted[i]) partialPicked.push(firstSorted[i]);
if (secondSorted[i]) partialPicked.push(secondSorted[i]);
}

const newMembers = [...fullPicked, ...partialPicked];
const nextMemberIds = [...targetRally.memberIds.map(String), ...newMembers.map((m) => String(m.member_id))];

const rowsById = new Map(rows.map((row) => [String(row.member_id), row]));
const finalMembers = nextMemberIds.map((id) => rowsById.get(String(id))).filter(Boolean);
const { assignments, lines } = assignLeadHeroesForRally(targetRally, finalMembers);

const nextRallies = rallies.map((rally) => (
rally.id === rallyId
? { ...rally, memberIds: nextMemberIds, leadHeroAssignments: assignments }
: rally
));

return {
rallies: nextRallies,
summary: {
addedCount: newMembers.length,
fullCount: fullPicked.length,
firstHalfCount: partialPicked.filter((m) => classifyAvailability(m) === 'first').length,
secondHalfCount: partialPicked.filter((m) => classifyAvailability(m) === 'second').length,
totalMembers: nextMemberIds.length,
leadHeroLines: lines,
},
};
}

export function normalizeRalliesForRows(rallies, rows) {
const rowIds = new Set(rows.map((row) => String(row.member_id)));
return rallies.map((rally) => ({
...rally,
memberIds: rally.memberIds.filter((memberId) => rowIds.has(String(memberId))),
}));
}

export function removeRowsAndAssignments(rows, rallies, memberIds) {
const deletedIds = new Set(memberIds.map(String));
return {
rows: rows.filter((row) => !deletedIds.has(String(row.member_id))),
rallies: rallies.map((rally) => ({
...rally,
memberIds: rally.memberIds.filter((memberId) => !deletedIds.has(String(memberId))),
})),
};
}

export function parseStoredRallies(value) {
if (!value) return [];
try {
const parsed = JSON.parse(value);
if (!Array.isArray(parsed)) return [];
return parsed
.filter((rally) => rally && typeof rally.id === 'string' && typeof rally.name === 'string')
.map(normalizeRally);
} catch {
return [];
}
}

function storedMemberIds(rally) {
  const ids = Array.isArray(rally.memberIds) ? rally.memberIds.map(String) : [];
  const lead = rally.leadMemberId ? String(rally.leadMemberId) : '';
  return lead && !ids.includes(lead) ? [...ids, lead] : ids;
}

/**
 * Normalise rallies that are ALREADY in the in-memory camelCase shape
 * (what GET /api/admin-rallies returns). Never run formatRallyRows over this:
 * it expects raw DB rows (snake_case) and would drop every member.
 */
export function hydrateRallies(rallies) {
  if (!Array.isArray(rallies)) return [];
  return rallies
    .filter((rally) => rally && rally.id != null)
    .map((rally) => normalizeRally({ ...rally, id: String(rally.id), name: typeof rally.name === 'string' ? rally.name : 'Rally' }));
}

const RALLY_DB_DEFAULT_FORMATION = { infantry: 0, cavalry: 0, archer: 0 };

export function serializeRalliesForSave(rallies) {
  if (!Array.isArray(rallies)) return [];
  return rallies.map((rally, index) => {
    const troopWeights = {
      ...RALLY_DB_DEFAULT_FORMATION,
      ...(rally.troopWeights || {}),
    };
    return {
      id: String(rally.id),
      name: typeof rally.name === 'string' ? rally.name : `Rally ${index + 1}`,
      position: index,
      // The stored set includes the lead so server-side "assigned" counts see
      // them; formatRallyRows/normalizeRally strips the lead back out in memory.
      member_ids: storedMemberIds(rally),
      lead_member_id: rally.leadMemberId ? String(rally.leadMemberId) : null,
      formation: {
        ...troopWeights,
        leadHeroes: normalizeLeadHeroes(rally.leadHeroes),
        leadHeroAssignments: normalizeLeadHeroAssignments(rally.leadHeroAssignments),
      },
    };
  });
}

export function formatRallyRows(rows) {
  if (!Array.isArray(rows)) return [];
  return rows.map((row) => {
    const formation = row.formation && typeof row.formation === 'object' ? row.formation : {};
    const { leadHeroes, leadHeroAssignments, ...troopWeights } = formation;
    return normalizeRally({
      id: row.id,
      name: row.name,
      memberIds: row.member_ids,
      leadMemberId: row.lead_member_id,
      troopWeights,
      leadHeroes,
      leadHeroAssignments,
    });
  });
}

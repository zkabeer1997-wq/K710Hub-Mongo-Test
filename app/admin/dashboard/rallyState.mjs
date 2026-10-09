export const RALLY_STORAGE_KEY = 'kvk-admin-rallies-v1';
export const DEFAULT_TROOP_WEIGHTS = { infantry: 0, cavalry: 0, archer: 0 };
// An admin can pick up to six required heroes per rally, and the same hero can
// fill more than one of them (e.g. 3x Saul + 3x Thrud). leadHeroes is therefore
// stored as { heroName: count }, with the counts summing to at most this cap.
export const MAX_LEAD_HEROES = 6;

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

export const RALLY_TYPES = ['attack', 'garrison', 'optional'];
export const RALLY_TYPE_LABELS = { attack: 'Attack', garrison: 'Garrison', optional: 'Optional' };
export const RALLY_FORMATIONS = ['balanced', 'archer', 'cavalry'];
export const RALLY_FORMATION_LABELS = { balanced: 'Balanced', archer: 'Archer-heavy', cavalry: 'Cavalry-heavy' };
export const RALLY_SLOT_MINIMUM = 10;
export const RALLY_JOINER_FLAG_ABOVE = 10;

export function normalizeRallyType(value) {
  return RALLY_TYPES.includes(value) ? value : 'attack';
}

export function normalizeRallyFormation(value) {
  return RALLY_FORMATIONS.includes(value) ? value : 'balanced';
}

export function createNextRally(rallies, id = `rally-${Date.now()}`, rallyType = 'attack') {
return [
...rallies,
{
id,
name: `Rally ${rallies.length + 1}`,
memberIds: [],
leadMemberId: '',
managerName: '',
rallyType: normalizeRallyType(rallyType),
formationKind: 'balanced',
notes: '',
troopWeights: { ...DEFAULT_TROOP_WEIGHTS },
leadHeroes: {},
leadHeroAssignments: {},
},
];
}

/** Sets one plain field (managerName, rallyType, formationKind, notes) on a rally. */
export function setRallyField(rallies, rallyId, field, value) {
  const clean = {
    managerName: (v) => String(v ?? '').slice(0, 80),
    rallyType: normalizeRallyType,
    formationKind: normalizeRallyFormation,
    notes: (v) => String(v ?? '').slice(0, 1000),
  }[field];
  if (!clean) return rallies;
  return rallies.map((rally) => (rally.id === rallyId ? { ...rally, [field]: clean(value) } : rally));
}

/** Moves one joiner to a new position in the same rally's ordered list. */
export function moveRallyJoiner(rallies, rallyId, memberId, toIndex) {
  const id = String(memberId);
  return rallies.map((rally) => {
    if (rally.id !== rallyId) return rally;
    const from = rally.memberIds.map(String).indexOf(id);
    if (from === -1) return rally;
    const ids = rally.memberIds.map(String);
    ids.splice(from, 1);
    ids.splice(Math.max(0, Math.min(ids.length, toIndex)), 0, id);
    return { ...rally, memberIds: ids };
  });
}

/** Cards are shown Attack, Garrison, Optional; creation order is kept inside each type. */
export function sortRalliesByType(rallies) {
  const order = (r) => RALLY_TYPES.indexOf(normalizeRallyType(r.rallyType));
  return rallies.map((r, i) => [r, i]).sort((a, b) => order(a[0]) - order(b[0]) || a[1] - b[1]).map(([r]) => r);
}

export function rallySlotCount(rally) {
  return Math.max(RALLY_SLOT_MINIMUM, (rally?.memberIds || []).length);
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
managerName: typeof rally.managerName === 'string' ? rally.managerName.slice(0, 80) : '',
rallyType: normalizeRallyType(rally.rallyType),
formationKind: normalizeRallyFormation(rally.formationKind),
notes: typeof rally.notes === 'string' ? rally.notes.slice(0, 1000) : '',
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
 * Which pair of troop types a rally's fill should weigh. An explicit
 * formationKind wins. Otherwise it is derived from the old percentage weights:
 * the lower of cavalry / archer decides it (cavalry lowest = archer-heavy).
 */
export function effectiveFormation(rally) {
  const kind = normalizeRallyFormation(rally?.formationKind);
  if (kind !== 'balanced') return kind;
  const weights = { ...DEFAULT_TROOP_WEIGHTS, ...(rally?.troopWeights || {}) };
  if (weights.cavalry < weights.archer) return 'archer';
  if (weights.archer < weights.cavalry) return 'cavalry';
  return 'balanced';
}

/** Archer-heavy weighs infantry + archer, cavalry-heavy infantry + cavalry, otherwise all three. */
function scoreMemberForRally(row, rally) {
  const infantryScore = troopLevelScore(row.infantry_tier, row.infantry_tg);
  const cavalryScore = troopLevelScore(row.cavalry_tier, row.cavalry_tg);
  const archerScore = troopLevelScore(row.archer_tier, row.archer_tg);
  const formation = effectiveFormation(rally);
  if (formation === 'archer') return infantryScore + archerScore;
  if (formation === 'cavalry') return infantryScore + cavalryScore;
  return infantryScore + cavalryScore + archerScore;
}

export function classifyAvailability(row) {
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

/** A hero-holding joiner may replace a stronger non-holder only if their troop score is within this many points. */
export const HERO_SWAP_MAX_SCORE_DROP = 2;

function heroHolders(row, needs) {
  const held = new Set((row.heroes || []).map(String));
  return Object.keys(needs).filter((hero) => needs[hero] > 0 && held.has(hero));
}

/**
 * Picks joiners for one rally. At every moment of the battle the rally needs
 * AVAILABILITY_TARGET_PER_RALLY joiners: Full Battle joiners count in both
 * halves, so the fill takes Full Battle first (best troop level for the
 * formation, then members who hold a required hero) and only then pairs
 * First Half and Second Half joiners until both halves reach the target.
 * A required hero nobody left can supply is skipped rather than leaving a gap.
 */
function pickJoinersForRally(rally, pool, rowsById) {
  const currentRows = rally.memberIds.map((id) => rowsById.get(String(id))).filter(Boolean);
  const count = { full: 0, first: 0, second: 0 };
  currentRows.forEach((row) => {
    const bucket = classifyAvailability(row);
    if (count[bucket] !== undefined) count[bucket] += 1;
  });

  const needs = { ...(rally.leadHeroes || {}) };
  currentRows.forEach((row) => {
    const [hero] = heroHolders(row, needs);
    if (hero) needs[hero] -= 1;
  });

  const buckets = { full: [], first: [], second: [] };
  pool.forEach((row) => {
    const bucket = classifyAvailability(row);
    if (buckets[bucket]) buckets[bucket].push({ row, score: scoreMemberForRally(row, rally) });
  });
  const picked = [];

  function take(bucket) {
    const list = buckets[bucket];
    if (!list.length) return false;
    list.sort((a, b) => (
      b.score - a.score
      || heroHolders(b.row, needs).length - heroHolders(a.row, needs).length
    ));
    const entry = list.shift();
    const [hero] = heroHolders(entry.row, needs);
    if (hero) needs[hero] -= 1;
    picked.push({ ...entry, bucket });
    count[bucket] += 1;
    return true;
  }

  const shortOf = () => ({
    first: count.full + count.first < AVAILABILITY_TARGET_PER_RALLY,
    second: count.full + count.second < AVAILABILITY_TARGET_PER_RALLY,
  });
  for (;;) {
    const short = shortOf();
    if (!short.first && !short.second) break;
    if (take('full')) continue;
    let progress = false;
    if (short.first && take('first')) progress = true;
    if (short.second && take('second')) progress = true;
    if (!progress) break;
  }

  // Hero pass: swap a newly picked non-holder for a better-than-nothing holder from the same availability bucket.
  Object.keys(needs).forEach((hero) => {
    while (needs[hero] > 0) {
      let done = false;
      for (const bucket of ['full', 'first', 'second']) {
        const holder = buckets[bucket]
          .filter((entry) => (entry.row.heroes || []).map(String).includes(hero))
          .sort((a, b) => b.score - a.score)[0];
        if (!holder) continue;
        const victim = picked
          .filter((entry) => entry.bucket === bucket && !heroHolders(entry.row, { ...(rally.leadHeroes || {}) }).length)
          .sort((a, b) => a.score - b.score)[0];
        if (!victim || holder.score < victim.score - HERO_SWAP_MAX_SCORE_DROP) continue;
        picked.splice(picked.indexOf(victim), 1, { ...holder, bucket });
        buckets[bucket] = buckets[bucket].filter((entry) => entry !== holder);
        needs[hero] -= 1;
        done = true;
        break;
      }
      if (!done) break;
    }
  });

  const short = shortOf();
  return { picked: picked.map((entry) => entry.row), complete: !short.first && !short.second, count };
}

/** Fills one rally and reports what was added. Joiners already on the rally are kept. */
export function autoAssignRallyMembers(rallies, rallyId, rows) {
  const targetRally = rallies.find((rally) => rally.id === rallyId);
  if (!targetRally) return { rallies, summary: null };

  const taken = new Set();
  rallies.forEach((rally) => {
    rally.memberIds.forEach((memberId) => taken.add(String(memberId)));
    if (rally.leadMemberId) taken.add(String(rally.leadMemberId));
  });
  const rowsById = new Map(rows.map((row) => [String(row.member_id), row]));
  const pool = rows.filter((row) => !taken.has(String(row.member_id)));

  const { picked, complete } = pickJoinersForRally(targetRally, pool, rowsById);
  const nextMemberIds = [...targetRally.memberIds.map(String), ...picked.map((m) => String(m.member_id))];
  const finalMembers = nextMemberIds.map((id) => rowsById.get(String(id))).filter(Boolean);
  const { assignments, lines } = assignLeadHeroesForRally(targetRally, finalMembers);

  const nextRallies = rallies.map((rally) => (
    rally.id === rallyId ? { ...rally, memberIds: nextMemberIds, leadHeroAssignments: assignments } : rally
  ));
  const fullCount = picked.filter((m) => classifyAvailability(m) === 'full').length;

  return {
    rallies: nextRallies,
    summary: {
      addedCount: picked.length,
      fullCount,
      firstHalfCount: picked.filter((m) => classifyAvailability(m) === 'first').length,
      secondHalfCount: picked.filter((m) => classifyAvailability(m) === 'second').length,
      totalMembers: nextMemberIds.length,
      complete,
      leadHeroLines: lines,
    },
  };
}

/**
 * Plans "Auto-fill all rallies" without saving anything. Attack and Garrison
 * rallies are completed first; Optional rallies are only touched once every
 * other rally is complete. `replace` clears current joiners first (leads stay).
 */
export function planAutoFillAll(rallies, rows, { replace = false } = {}) {
  const placedBefore = rallies.reduce((sum, rally) => sum + rally.memberIds.length, 0);
  let working = replace ? rallies.map((rally) => ({ ...rally, memberIds: [], leadHeroAssignments: {} })) : rallies;
  const order = [
    ...working.filter((rally) => normalizeRallyType(rally.rallyType) !== 'optional'),
    ...working.filter((rally) => normalizeRallyType(rally.rallyType) === 'optional'),
  ];
  const perRally = [];
  let primaryComplete = true;
  order.forEach((rally) => {
    const isOptional = normalizeRallyType(rally.rallyType) === 'optional';
    if (isOptional && !primaryComplete) {
      perRally.push({ id: rally.id, name: rally.name, added: 0, total: rally.memberIds.length, complete: false, skipped: true, leadHeroLines: [] });
      return;
    }
    const result = autoAssignRallyMembers(working, rally.id, rows);
    working = result.rallies;
    if (!isOptional && !result.summary.complete) primaryComplete = false;
    perRally.push({
      id: rally.id,
      name: rally.name,
      added: result.summary.addedCount,
      total: result.summary.totalMembers,
      complete: result.summary.complete,
      skipped: false,
      leadHeroLines: result.summary.leadHeroLines,
    });
  });
  const placedAfter = working.reduce((sum, rally) => sum + rally.memberIds.length, 0);
  const leadIds = getRallyLeadMemberIds(working);
  const assignedIds = new Set(working.flatMap((rally) => rally.memberIds.map(String)));
  const unassigned = rows.filter((row) => !assignedIds.has(String(row.member_id)) && !leadIds.has(String(row.member_id))).length;
  return {
    rallies: working,
    preview: {
      placed: placedAfter - (replace ? 0 : placedBefore),
      totalPlaced: placedAfter,
      replacedCount: replace ? placedBefore : 0,
      keptCount: replace ? 0 : placedBefore,
      unassigned,
      perRally,
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
      manager_name: typeof rally.managerName === 'string' ? rally.managerName.slice(0, 80) : '',
      rally_type: normalizeRallyType(rally.rallyType),
      formation_kind: normalizeRallyFormation(rally.formationKind),
      notes: typeof rally.notes === 'string' ? rally.notes.slice(0, 1000) : '',
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
      managerName: row.manager_name,
      rallyType: row.rally_type,
      formationKind: row.formation_kind,
      notes: row.notes,
      troopWeights,
      leadHeroes,
      leadHeroAssignments,
    });
  });
}

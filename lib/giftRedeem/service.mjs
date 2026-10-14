// Gift redeem service layer: everything the admin and member API routes do, written against the
// store contract so it is unit-tested with the in-memory store. Routes stay thin (auth + JSON).
import { KINGDOM_ID_DEFAULT } from './constants.mjs';
import { redeemConfig } from './config.mjs';
import { collectPendingWork } from './runner.mjs';
import {
  MAX_PLAYERS_PER_REQUEST,
  normalizeKingdom,
  normalizePlayerId,
  parsePlayerLines,
} from './players.mjs';

export const REDEMPTION_SITE_URL = 'https://ks-giftcode.centurygame.com/';

/** The switch only has an effect when the signing secret exists. */
export function autoRedeemEffective(runner, env = process.env) {
  return Boolean(runner?.auto_redeem_enabled) && redeemConfig(env).secretPresent;
}

const STATUS_BUCKETS = { success: 'redeemed', received: 'already_had', expired: 'expired', login_failed: 'login_failed', skipped: 'skipped', unknown: 'skipped' };

/** Sums redemption counts per bucket for the admin counters. */
export function bucketTotals(countsByCode) {
  const t = { redeemed: 0, already_had: 0, expired: 0, login_failed: 0, skipped: 0 };
  for (const counts of Object.values(countsByCode || {})) {
    for (const [status, n] of Object.entries(counts)) {
      const bucket = STATUS_BUCKETS[status];
      if (bucket) t[bucket] += n;
    }
  }
  return t;
}

function runnerState(runner, nowMs, env) {
  const running = Boolean(runner?.lease_owner) && (runner.lease_until || 0) > nowMs;
  return {
    state: running ? 'running' : 'idle',
    progress: running ? runner.progress || null : null,
    last_started_at: runner?.last_started_at || null,
    last_finished_at: runner?.last_finished_at || null,
    last_error: runner?.last_error || null,
    last_summary: runner?.last_summary || null,
    auto_redeem_enabled: Boolean(runner?.auto_redeem_enabled),
    auto_redeem_effective: autoRedeemEffective(runner, env),
  };
}

/** Everything the admin page shows in the status band, counters and codes table. */
export async function adminOverview(store, { env = process.env, nowMs = Date.now() } = {}) {
  const cfg = redeemConfig(env);
  const [runner, counts, work, playerCounts, codes] = await Promise.all([
    store.getRunner(), store.countsByCode(), collectPendingWork(store), store.playerCounts(), store.listCodes(),
  ]);
  const runnable = (await store.listRunnablePlayers()).length;
  const ready = work.reduce((n, w) => n + w.players.length, 0);
  const codeRows = codes.map((c) => {
    const byStatus = counts[c.code] || {};
    const processed = Object.values(byStatus).reduce((a, b) => a + b, 0);
    const pending = work.find((w) => w.code === c.code)?.players.length || 0;
    return {
      ...c,
      processed,
      pending,
      total: processed + (c.active === false ? 0 : pending),
      by_status: byStatus,
    };
  });
  return {
    config: { secret_present: cfg.secretPresent, budget_ms: cfg.budgetMs, cron_secret_present: cfg.cronSecretPresent, endpoint_is_mock: cfg.endpointIsMock },
    runner: runnerState(runner, nowMs, env),
    players: { ...playerCounts, runnable },
    counters: { ready, ...bucketTotals(counts) },
    codes: codeRows,
  };
}

function cleanDetail(text) {
  return String(text || '').slice(0, 200);
}

async function audit(store, actor, action, target, detail, now) {
  await store.addAudit({ at: now, actor: String(actor || 'admin').slice(0, 80), action, target: String(target || '').slice(0, 80), detail: cleanDetail(detail) });
}

const bad = (error, status = 400) => ({ status, body: { error } });
const ok = (body = {}) => ({ status: 200, body: { ok: true, ...body } });

/** Admin mutations on the redeem system (everything except code discovery/adding, which uses the raw collection). */
export async function applyAdminAction(store, action, body, { actor = 'admin', env = process.env, now = new Date() } = {}) {
  switch (action) {
    case 'set_auto_redeem': {
      const enabled = body?.enabled === true;
      if (enabled && !redeemConfig(env).secretPresent) {
        return bad('Automatic redeeming needs GIFT_REDEEM_SIGN_SECRET to be set on the server first.');
      }
      await store.setAutoRedeem(enabled, actor);
      await audit(store, actor, enabled ? 'auto_redeem_on' : 'auto_redeem_off', 'switch', '', now);
      return ok({ auto_redeem_enabled: enabled });
    }
    case 'add_players': {
      const list = Array.isArray(body?.players)
        ? body.players
        : parsePlayerLines(body?.text).valid;
      const rejected = Array.isArray(body?.players) ? [] : parsePlayerLines(body?.text).rejected;
      if (list.length > MAX_PLAYERS_PER_REQUEST) return bad(`At most ${MAX_PLAYERS_PER_REQUEST} players per request.`);
      const players = [];
      const seen = new Set();
      for (const p of list) {
        const player_id = normalizePlayerId(p?.player_id);
        const kingdom_id = normalizeKingdom(p?.kingdom_id ?? p?.kingdom);
        if (!player_id || !kingdom_id) { rejected.push(String(p?.player_id ?? '').slice(0, 30)); continue; }
        if (seen.has(player_id)) continue;
        seen.add(player_id);
        players.push({ player_id, kingdom_id, source: 'admin', enabled: true, added_by: actor });
      }
      if (!players.length) return bad('No valid players found. Use one "Player ID Kingdom" pair per line (ID 4 to 20 digits, kingdom 1 to 4 digits).');
      const res = await store.addPlayers(players, { now });
      await audit(store, actor, 'add_players', `${players.length} player(s)`, `added ${res.added}, already enrolled ${res.existing}`, now);
      return ok({ ...res, rejected: rejected.slice(0, 20) });
    }
    case 'import_players': {
      const list = Array.isArray(body?.players) ? body.players : [];
      if (!list.length) return bad('Nothing to import.');
      if (list.length > 5000) return bad('Too many players in one import (limit 5000).');
      const players = [];
      const seen = new Set();
      let invalid = 0;
      for (const p of list) {
        const player_id = normalizePlayerId(p?.player_id);
        const kingdom_id = normalizeKingdom(p?.kingdom_id ?? p?.kingdom);
        if (!player_id || !kingdom_id) { invalid += 1; continue; }
        if (seen.has(player_id)) continue;
        seen.add(player_id);
        players.push({ player_id, kingdom_id, source: 'bot_import', enabled: true, failed: p?.failed === true, added_by: actor });
      }
      if (!players.length) return bad('No valid players in the file.');
      const res = await store.addPlayers(players, { now });
      await audit(store, actor, 'import_players', `${players.length} player(s)`, `added ${res.added}, already enrolled ${res.existing}, invalid ${invalid}`, now);
      return ok({ ...res, invalid });
    }
    case 'set_player_enabled': {
      const pid = normalizePlayerId(body?.player_id);
      if (!pid) return bad('Invalid player ID.');
      const enabled = body?.enabled === true;
      if (!(await store.setPlayerEnabled(pid, enabled, now))) return bad('Player not found.', 404);
      await audit(store, actor, enabled ? 'enable_player' : 'disable_player', pid, '', now);
      return ok();
    }
    case 'remove_player': {
      const pid = normalizePlayerId(body?.player_id);
      if (!pid) return bad('Invalid player ID.');
      if (!(await store.removePlayer(pid))) return bad('Player not found.', 404);
      await audit(store, actor, 'remove_player', pid, '', now);
      return ok();
    }
    case 'reenable_player': {
      const pid = normalizePlayerId(body?.player_id);
      if (!pid) return bad('Invalid player ID.');
      if (!(await store.reenablePlayer(pid, now))) return bad('Player not found.', 404);
      await audit(store, actor, 'reenable_player', pid, 'cleared the failed mark', now);
      return ok();
    }
    case 'set_code_active': {
      const code = String(body?.code || '').trim();
      const active = body?.active === true;
      if (!code) return bad('Missing code.');
      if (!(await store.setCodeActive(code, active, { reason: 'manual', now }))) return bad('Code not found.', 404);
      await audit(store, actor, active ? 'enable_code' : 'disable_code', code, '', now);
      return ok();
    }
    case 'delete_code': {
      const code = String(body?.code || '').trim();
      if (!code) return bad('Missing code.');
      const res = await store.deleteCode(code);
      if (!res.deleted) return bad('Code not found.', 404);
      await audit(store, actor, 'delete_code', code, `${res.redemption_rows} result row(s) removed`, now);
      return ok(res);
    }
    case 'reprocess_code': {
      const code = String(body?.code || '').trim();
      const c = code ? await store.getCode(code) : null;
      if (!c) return bad('Code not found.', 404);
      if (c.active === false) return bad('This code is switched off or expired. Enable it first.');
      const res = await store.requeueCode(code);
      await audit(store, actor, 'reprocess_code', code, `retrying ${res.removed} skipped/unknown result(s)`, now);
      return ok(res);
    }
    default:
      return bad('Unknown action.');
  }
}

// ---------------------------------------------------------------- member side

const MEMBER_RESULT = {
  success: ['redeemed', 'Redeemed'],
  received: ['already_had', 'Already had it'],
  expired: ['expired', 'Expired'],
  login_failed: ['problem', "Couldn't redeem (player issue)"],
  skipped: ['problem', "Couldn't redeem (skipped)"],
  unknown: ['problem', "Couldn't redeem (skipped)"],
};

/** Safe, member-facing view: only this member's own player and results. */
export async function memberStatus(store, memberId, { env = process.env } = {}) {
  const [player, codes, runner] = await Promise.all([store.getMemberPlayer(memberId), store.listActiveCodes(), store.getRunner()]);
  const mine = player ? await store.redemptionsForPlayer(player.player_id) : [];
  const byCode = new Map(mine.map((r) => [r.code, r]));
  const autoOn = autoRedeemEffective(runner, env);
  const rows = codes.map((c) => {
    const r = byCode.get(c.code);
    const [result, label] = r ? MEMBER_RESULT[r.status] || ['problem', "Couldn't redeem"] : ['waiting', 'Waiting'];
    return { code: c.code, rewards: c.rewards || null, expires_at: c.expires_at || null, result, label };
  });
  return {
    enabled: Boolean(player?.enabled),
    failed: Boolean(player?.failed),
    playerId: player?.player_id || String(memberId),
    kingdom: player?.kingdom_id || KINGDOM_ID_DEFAULT,
    autoRedeemAvailable: autoOn,
    redemptionSite: REDEMPTION_SITE_URL,
    codes: rows,
  };
}

/** Member opt-in: the player id and kingdom come from the session, never from the request. */
export async function setMemberOptIn(store, memberId, enabled, { now = new Date() } = {}) {
  const playerId = normalizePlayerId(memberId);
  if (!playerId) return { ok: false, error: 'Your account does not have a valid Player ID.' };
  await store.setMemberOptIn({ memberId: String(memberId), playerId, kingdomId: KINGDOM_ID_DEFAULT, enabled: Boolean(enabled), now });
  await audit(store, `member:${memberId}`, enabled ? 'member_opt_in' : 'member_opt_out', playerId, '', now);
  return { ok: true };
}

// ------------------------------------------------------- read helpers for admin

export function pageParams(searchParams, { defaultLimit = 25, maxLimit = 100 } = {}) {
  const page = Math.max(1, Math.trunc(Number(searchParams.get('page'))) || 1);
  const limit = Math.min(maxLimit, Math.max(1, Math.trunc(Number(searchParams.get('limit'))) || defaultLimit));
  return { page, limit, skip: (page - 1) * limit };
}

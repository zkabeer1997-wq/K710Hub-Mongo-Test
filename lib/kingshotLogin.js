import crypto from 'node:crypto';

const API_BASE = process.env.KINGSHOT_API_BASE_URL || 'https://cg-vip-mall-wos.centurygame.com/api';
const STORE_URL = 'https://store.centurygames.com/kingshot';
const GAME_ID = '20235';
const WEB_VERSION = 'v2.3.3';
const PLAYER_API = process.env.KINGSHOT_PLAYER_API_URL || 'https://mightpulse.com/api/players';
const PLAYER_SEARCH_API = process.env.KINGSHOT_PLAYER_SEARCH_URL || 'https://mightpulse.com/api/search';
const MIGHTPULSE_ORIGIN = 'https://mightpulse.com';
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:153.0) Gecko/20100101 Firefox/153.0';
const LOGIN_SUPERADMIN_PLAYER_IDS = new Set(['108051086', '106599852']);
const PUBLIC_KEY = Buffer.from(
  'LS0tLS1CRUdJTiBQVUJMSUMgS0VZLS0tLS0KTUlJQklqQU5CZ2txaGtpRzl3MEJBUUVGQUFPQ0FROEFNSUlCQ2dLQ0FRRUF0eVF1bVd0WTcyVlhSY3c4RlhKZwpwcS84SjB5U3lBaUE4S1JwRjl1STc1bHRoMzgvMkJVZ2hJZlgrcmlyZVc0RUVwNjE3UlB3c2puZDBTQXloc2NYCjBBZXhISGpkcVVRaDQzWjBNZTVadUpVUjFmaDJPRkxKZk81OTFYcC9RR2MxMC8zTnZ1R3prbFEvNm5TbkJ2WlQKaWNScVN2cDFFeUdMYzlvWWhIYVFncU0yc1ZsaThFNWx0Y1BwbVZ3b0RNUFkxSnlZdFJOMnBLVEg5cUhMc05kawpDd1ZLQ2NoYXM5UWw1eE9hck9CVFJPSG0xaXdEUFFSZHdCNFU4OFVTeXZHZURvVkp2ODM2UkNsTlRDaE1aOURaCmZpSllZVkFpWHRHd2FwQVFSeUFPbE5XamZIeHV0MGFvbHN3UW9OcUdpZzJqRkxWc1lXUzNyUU1hMlJjSlZMa1gKVHdJREFRQUIKLS0tLS1FTkQgUFVCTElDIEtFWS0tLS0tCg==',
  'base64',
).toString('utf8').trim();

export class KingshotLoginError extends Error {
  constructor(message, status = 400, code = 'LOGIN_ERROR', details = {}) {
    super(message);
    this.name = 'KingshotLoginError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function isLoginSuperadmin(playerId) {
  return LOGIN_SUPERADMIN_PLAYER_IDS.has(String(playerId || '').trim());
}

function numeric(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function credentials() {
  const signingKey = crypto.randomBytes(16).toString('hex');
  const authKey = crypto.publicEncrypt(
    {
      key: PUBLIC_KEY,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha1',
    },
    Buffer.from(signingKey),
  ).toString('base64');
  return { signingKey, authKey };
}

function signed(payload, key) {
  const body = {
    ...payload,
    ts: Date.now(),
    webVersion: WEB_VERSION,
    language_code: 'EN',
  };
  const canonical = Object.keys(body)
    .sort()
    .map((name) => `${name}=${body[name]}`)
    .join('&');
  const hex = crypto.createHmac('sha256', key).update(canonical).digest('hex');
  return { ...body, auth: Buffer.from(hex).toString('base64') };
}

async function readJson(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function postOfficial(state, endpoint, payload, token) {
  const headers = {
    accept: 'application/json, text/plain, */*',
    'accept-language': 'en-US',
    'content-type': 'application/json',
    'auth-key': state.authKey,
    'request-path': STORE_URL,
    origin: 'https://store.centurygames.com',
    referer: 'https://store.centurygames.com/',
    'user-agent': USER_AGENT,
  };
  if (token) headers.token = token;

  let response;
  try {
    response = await fetch(`${API_BASE}${endpoint}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(signed(payload, state.signingKey)),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new KingshotLoginError(
      'The official Kingshot service could not be reached. Please try again.',
      502,
      'UPSTREAM_UNAVAILABLE',
    );
  }

  const result = await readJson(response);
  if (!result) {
    throw new KingshotLoginError(
      'The official Kingshot service returned an invalid response.',
      502,
      'INVALID_RESPONSE',
    );
  }
  if (!response.ok) {
    throw new KingshotLoginError(
      result.msg || 'Kingshot rejected the request.',
      502,
      'UPSTREAM_ERROR',
    );
  }
  return result;
}

export function createLoginFlow(playerId) {
  const clean = String(playerId || '').trim();
  if (!/^\d{4,20}$/.test(clean)) {
    throw new KingshotLoginError('Enter a valid numeric Player ID.', 400, 'INVALID_PLAYER_ID');
  }
  return {
    ...credentials(),
    playerId: clean,
    state: 'awaiting_game_confirmation',
    failedCodeAttempts: 0,
    expiresAt: Date.now() + 15 * 60 * 1000,
  };
}

export async function sendVerificationCode(flow) {
  if (flow.state !== 'awaiting_game_confirmation') {
    throw new KingshotLoginError(
      'This login attempt is not waiting for game confirmation.',
      409,
      'INVALID_LOGIN_STATE',
    );
  }
  const result = await postOfficial(flow, '/auth/get_game_captcha', {
    game_id: GAME_ID,
    role_id: flow.playerId,
  });
  if (result?.code !== 1) {
    if (/code limit|too many|frequent|later|验证码.*(?:上限|稍后)|发送次数/i.test(String(result?.msg || ''))) {
      throw new KingshotLoginError(
        'Too many codes were requested. Please try again tomorrow.',
        429,
        'CODE_LIMIT',
      );
    }
    throw new KingshotLoginError(
      result?.msg || 'The verification code could not be requested.',
      400,
      'CODE_REQUEST_FAILED',
    );
  }
  return { ...flow, state: 'awaiting_code' };
}

export async function verifyLoginCode(flow, code) {
  const cleanCode = String(code || '').trim();
  if (!/^[A-Za-z0-9]{4,12}$/.test(cleanCode)) {
    throw new KingshotLoginError(
      'Enter the verification code shown in the game.',
      400,
      'INVALID_CODE',
    );
  }
  if (flow.state !== 'awaiting_code') {
    throw new KingshotLoginError(
      'This login attempt is not waiting for a code.',
      409,
      'INVALID_LOGIN_STATE',
    );
  }

  const login = await postOfficial(flow, '/auth/login', {
    game_id: GAME_ID,
    login_type: 'role_id_safe',
    role_id: flow.playerId,
    captcha_code: cleanCode,
  });
  if (login?.code !== 1 || !login?.data?.token) {
    throw new KingshotLoginError(
      'The verification code is incorrect. Please try again.',
      401,
      'CODE_ERROR',
    );
  }

  const officialResponse = await postOfficial(flow, '/callback/get_role_info', {
    game_id: GAME_ID,
    channel_from: 'organic',
    tga_os: 'Windows',
    role_id: flow.playerId,
    from_desktop_app: 0,
    web_mail_uid: '',
  }, login.data.token);

  const roles = officialResponse?.data?.user_data;
  const officialProfile = Array.isArray(roles)
    ? roles.find((role) => String(role?.role_id) === flow.playerId) || roles[0]
    : null;
  if (officialResponse?.code !== 1 || !officialProfile) {
    throw new KingshotLoginError(
      officialResponse?.msg || 'Kingshot did not return the player profile.',
      401,
      'PROFILE_UNAVAILABLE',
    );
  }

  return { officialResponse, officialProfile };
}

function mightPulseHeaders(uid = '') {
  return {
    accept: 'application/json',
    origin: MIGHTPULSE_ORIGIN,
    referer: uid
      ? `${MIGHTPULSE_ORIGIN}/player/${encodeURIComponent(uid)}`
      : `${MIGHTPULSE_ORIGIN}/`,
    'user-agent': USER_AGENT,
  };
}

export async function loadPlayerData(playerId) {
  let searchResponse;
  try {
    const response = await fetch(`${PLAYER_SEARCH_API}?q=${encodeURIComponent(playerId)}`, {
      headers: mightPulseHeaders(),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    searchResponse = await readJson(response);
    if (!response.ok || !searchResponse) throw new Error('search failed');
  } catch {
    throw new KingshotLoginError(
      'We could not verify your kingdom right now. Please try again.',
      502,
      'KINGDOM_LOOKUP_FAILED',
    );
  }

  const searchMatch = Array.isArray(searchResponse?.results)
    ? searchResponse.results.find((player) => String(player?.fid) === String(playerId))
    : null;
  const uid = String(searchMatch?.uid ?? '').trim();
  if (!/^\d+$/.test(uid)) {
    throw new KingshotLoginError(
      'We could not find this Player ID in the kingdom registry.',
      404,
      'PLAYER_STATS_NOT_FOUND',
    );
  }

  let profileResponse;
  try {
    const response = await fetch(`${PLAYER_API}/${encodeURIComponent(uid)}`, {
      headers: mightPulseHeaders(uid),
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
    profileResponse = await readJson(response);
    if (!response.ok || !profileResponse || typeof profileResponse !== 'object') {
      throw new Error('profile failed');
    }
  } catch {
    throw new KingshotLoginError(
      'We could not verify your kingdom right now. Please try again.',
      502,
      'KINGDOM_LOOKUP_FAILED',
    );
  }

  return { searchResponse, searchMatch, profileResponse };
}

export function deriveKingdomId({ officialProfile, searchMatch, profileResponse }) {
  const extraInfo = officialProfile?.extra_info;
  const extraKingdom = extraInfo?.key === 'kid' ? extraInfo.value : null;
  const candidates = [
    profileResponse?.kid,
    searchMatch?.kid,
    extraKingdom,
    officialProfile?.section,
  ];
  for (const candidate of candidates) {
    const value = numeric(candidate);
    if (Number.isInteger(value) && value > 0) return value;
  }
  return null;
}

function absoluteAvatar(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  if (/^https?:\/\//i.test(value)) return value;
  return `${MIGHTPULSE_ORIGIN}${value.startsWith('/') ? '' : '/'}${value}`;
}

export function toStoredUser({ playerId, officialProfile, officialResponse, searchResponse, searchMatch, profileResponse, kingdomId }) {
  const avatar = absoluteAvatar(officialProfile?.icon || profileResponse?.avatar_url || searchMatch?.avatar_url);
  return {
    player_id: String(playerId),
    nickname: String(officialProfile?.nickname || profileResponse?.nick_name || searchMatch?.nick_name || `Governor ${playerId}`),
    avatar_url: avatar || null,
    kingdom_id: kingdomId,
    mightpulse_uid: numeric(profileResponse?.uid ?? searchMatch?.uid),
    alliance_id: numeric(profileResponse?.aid ?? searchMatch?.aid),
    alliance_abbr: String(profileResponse?.alliance_abbr ?? searchMatch?.alliance_abbr ?? ''),
    alliance_name: String(profileResponse?.alliance_name ?? searchMatch?.alliance_name ?? ''),
    alliance_rank: numeric(profileResponse?.alliance_rank),
    power: numeric(profileResponse?.power ?? searchMatch?.power),
    kills: numeric(profileResponse?.kills),
    mystic_trial: numeric(profileResponse?.mystic_trial ?? profileResponse?.mystic_trail),
    coordinate_x: numeric(profileResponse?.x ?? searchMatch?.x),
    coordinate_y: numeric(profileResponse?.y ?? searchMatch?.y),
    official_profile: officialProfile,
    official_api_response: officialResponse,
    mightpulse_search_response: searchResponse,
    mightpulse_profile_response: profileResponse,
    last_login_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

export function toPublicProfile(user) {
  if (!user) return null;
  return {
    playerId: String(user.player_id),
    nickname: String(user.nickname || ''),
    avatarUrl: String(user.avatar_url || ''),
    kingdomId: numeric(user.kingdom_id),
    role: String(user.access_role || 'member'),
    allianceId: numeric(user.alliance_id),
    allianceAbbr: String(user.alliance_abbr || ''),
    allianceName: String(user.alliance_name || ''),
    allianceRank: numeric(user.alliance_rank),
    power: numeric(user.power),
    kills: numeric(user.kills),
    mysticTrial: numeric(user.mystic_trial),
    x: numeric(user.coordinate_x),
    y: numeric(user.coordinate_y),
  };
}

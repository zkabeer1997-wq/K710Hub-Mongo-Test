// Local stand-in for the Kingshot official API and MightPulse (DEV / QA ONLY).
// It is a separate process: the app is pointed at it with the env vars that
// lib/kingshotLogin.js already supports, so there is no mock switch inside the
// app and nothing to "enable" in production:
//
//   KINGSHOT_API_BASE_URL=http://127.0.0.1:3999/api
//   KINGSHOT_PLAYER_API_URL=http://127.0.0.1:3999/players
//   KINGSHOT_PLAYER_SEARCH_URL=http://127.0.0.1:3999/search
//
// Run:  node scripts/dev/mock-kingshot-server.mjs   (port MOCK_PORT, default 3999)
//
// The valid verification code is always 123456. The LAST DIGIT of the Player ID
// picks the scenario:
//   0 -> kingdom 523, full data          5 -> kingdom 710 (a member), full data
//   1 -> kingdom 523, power + Mystic Trial missing (null)
//   2 -> kingdom 523, only Mystic Trial missing   3 -> game data service down (500)
//   4 -> kingdom 523, no alliance                 others -> kingdom 523, full data
import http from 'node:http';

const PORT = Number(process.env.MOCK_PORT || 3999);
const CODE = '123456';

function scenario(id) {
  const last = String(id).slice(-1);
  const base = { kid: 523, power: 187_654_321, mystic: 48_250, abbr: 'ABC', name: 'Alpha Crew', down: false };
  if (last === '1') return { ...base, power: null, mystic: null };
  if (last === '2') return { ...base, mystic: null };
  if (last === '3') return { ...base, down: true };
  if (last === '4') return { ...base, abbr: '', name: '' };
  if (last === '5') return { ...base, kid: 710, abbr: 'RED', name: 'Red Banner' };
  return base;
}

function send(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let raw = '';
  req.on('data', (chunk) => { raw += chunk; });
  req.on('end', () => {
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { /* ignore */ }
    if (url.pathname === '/api/auth/get_game_captcha') return send(res, 200, { code: 1 });
    if (url.pathname === '/api/auth/login') {
      return body.captcha_code === CODE ? send(res, 200, { code: 1, data: { token: 'mock-token' } }) : send(res, 200, { code: 0, msg: 'wrong code' });
    }
    if (url.pathname === '/api/callback/get_role_info') {
      const s = scenario(body.role_id);
      return send(res, 200, { code: 1, data: { user_data: [{ role_id: body.role_id, nickname: `Mock ${String(body.role_id).slice(-4)}`, section: s.kid, icon: '' }] } });
    }
    if (url.pathname === '/search') {
      const q = url.searchParams.get('q') || '';
      const s = scenario(q);
      if (s.down) return send(res, 500, { error: 'down' });
      return send(res, 200, { results: [{ fid: q, uid: `9${q}`, kid: s.kid, nick_name: `Mock ${q.slice(-4)}`, aid: 7, alliance_abbr: s.abbr, power: s.power }] });
    }
    if (url.pathname.startsWith('/players/')) {
      const uid = decodeURIComponent(url.pathname.slice('/players/'.length));
      const s = scenario(uid.slice(1));
      if (s.down) return send(res, 500, { error: 'down' });
      return send(res, 200, { uid: Number(uid), kid: s.kid, power: s.power, mystic_trial: s.mystic, alliance_abbr: s.abbr, alliance_name: s.name, kills: 12345 });
    }
    return send(res, 404, { error: 'not found' });
  });
});

server.listen(PORT, '127.0.0.1', () => console.log(`mock kingshot server on http://127.0.0.1:${PORT} (code ${CODE})`));

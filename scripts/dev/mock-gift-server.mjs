// Local stand-in for the game's gift code endpoint (DEV / QA ONLY). The real endpoint is never
// contacted by tests or QA: the app is pointed here with GIFT_REDEEM_ENDPOINT.
//
//   node scripts/dev/mock-gift-server.mjs        (port MOCK_GIFT_PORT, default 3998)
//   GIFT_REDEEM_SIGN_SECRET=<dummy> is used to check the request signature like the real service would.
//
// Scenario by player id (fid) and code (cdk):
//   cdk starting "QAEXPIRED"  -> 40007 expired for everybody
//   fid 920000101             -> 40001 login_failed every time
//   fid 920000102             -> 40008 already received
//   fid 920000103             -> 40017 recharge needed
//   fid 920000104             -> 2 unclear answers (50000), then success
//   anything else             -> 20000 success
// GET /__stats returns every request seen (time, fid, cdk, signature ok); POST /__reset clears it.
import http from 'node:http';
import { createHash } from 'node:crypto';

const PORT = Number(process.env.MOCK_GIFT_PORT || 3998);
const SECRET = process.env.GIFT_REDEEM_SIGN_SECRET || 'qa-dummy-secret';
const seen = [];
const attempts = new Map();

function signOk(fields) {
  const { sign, ...rest } = fields;
  const base = Object.keys(rest).sort().map((k) => `${k}=${rest[k]}`).join('&');
  return sign === createHash('md5').update(base + SECRET).digest('hex');
}

function answer(fid, cdk) {
  const key = `${fid}|${cdk}`;
  const n = (attempts.get(key) || 0) + 1;
  attempts.set(key, n);
  if (cdk.startsWith('QAEXPIRED')) return { err_code: 40007, msg: 'CDK EXPIRED.' };
  if (fid === '920000101') return { err_code: 40001, msg: 'ROLE NOT FOUND.' };
  if (fid === '920000102') return { err_code: 40008, msg: 'RECEIVED.' };
  if (fid === '920000103') return { err_code: 40017, msg: 'RECHARGE NEEDED.' };
  if (fid === '920000104' && n <= 2) return { err_code: 50000, msg: 'TRY AGAIN.' };
  return { err_code: 20000, msg: 'SUCCESS.' };
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  const send = (status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (url.pathname === '/__stats') return send(200, { seen });
  if (url.pathname === '/__reset') { seen.length = 0; attempts.clear(); return send(200, { ok: true }); }
  let raw = '';
  req.on('data', (c) => { raw += c; });
  req.on('end', () => {
    if (url.pathname !== '/api/gift_code' || req.method !== 'POST') return send(404, { error: 'not found' });
    const fields = Object.fromEntries(new URLSearchParams(raw));
    const ok = signOk(fields) && req.headers['content-type'] === 'application/x-www-form-urlencoded';
    seen.push({ at: Date.now(), fid: fields.fid, kid: fields.kid, cdk: fields.cdk, signOk: ok });
    if (!ok) return send(200, { err_code: 40000, msg: 'SIGN ERROR.' });
    return send(200, { code: 1, data: [], ...answer(fields.fid, fields.cdk) });
  });
});
server.listen(PORT, '127.0.0.1', () => console.log(`mock gift server on http://127.0.0.1:${PORT}`));

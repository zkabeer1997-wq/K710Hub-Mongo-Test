// Shared helpers for the QA seed/clear/journey scripts (dev only, never imported by the app).
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const BASE = process.env.QA_BASE || 'http://localhost:3000';
export const FIRST_ID = 920000001;
export const LAST_ID = 920000030;
export const MEMBER_IDS = Array.from({ length: 30 }, (_, i) => String(FIRST_ID + i));
export const NAMES = ['Aria','Bjorn','Cora','Dag','Elin','Freya','Gunnar','Hilde','Ivar','Jora','Kael','Liv','Mira','Njal','Orla','Pax','Quin','Runa','Sten','Tove','Ulf','Vera','Wren','Xan','Yara','Zed','Ansel','Brynn','Cade','Dara'];
export const nameOf = (i) => `Test ${NAMES[i]}`;
export const idOf = (i) => MEMBER_IDS[i];

export function loadEnv() {
  const env = {};
  for (const line of readFileSync(path.join(ROOT, '.env.local'), 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return env;
}

export function memberCookie(memberId, env = loadEnv()) {
  const payload = Buffer.from(JSON.stringify({ memberId, role: 'member', nonce: 'qa-' + memberId, exp: Date.now() + 7 * 864e5 }), 'utf8').toString('base64url');
  const sig = createHash('sha256').update(`k710-member-v2:${payload}:${env.MEMBER_SESSION_SECRET}`).digest('hex');
  return `k710_member_session=${payload}.${sig}`;
}

export async function adminLogin(env = loadEnv()) {
  const res = await fetch(`${BASE}/api/admin-login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: BASE },
    body: JSON.stringify({ password: env.ADMIN_PASSWORD }),
  });
  if (!res.ok) throw new Error(`admin login failed ${res.status}: ${await res.text()}`);
  const set = res.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
  return set;
}

/** tiny HTTP client: api(cookie)(method, path, body) -> {status, json} */
export function client(cookie, extra = {}) {
  return async (method, p, body, { form = false } = {}) => {
    const headers = { origin: BASE, cookie, ...extra };
    let payload;
    if (body !== undefined) {
      if (form) payload = body; else { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
    }
    const res = await fetch(BASE + p, { method, headers, body: payload, redirect: 'manual' });
    let json = null;
    const text = await res.text();
    try { json = JSON.parse(text); } catch { json = { _text: text.slice(0, 300) }; }
    return { status: res.status, json };
  };
}

/** Minimal valid PNG (solid colour) */
export function makePng(w = 64, h = 64, rgb = [180, 120, 40]) {
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buf) => { let c = 0xffffffff; for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.from(Array.from({ length: w }, () => rgb).flat())]);
  const raw = Buffer.concat(Array.from({ length: h }, () => row));
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

export async function mongo() {
  const env = loadEnv();
  const { MongoClient } = await import(path.join(ROOT, 'node_modules/mongodb/lib/index.js'));
  // SAFETY: dev scripts only ever touch a LOCAL mongod. .env.local may point at Atlas; never use that here.
  const uri = process.env.QA_MONGO_URI || 'mongodb://127.0.0.1:27017';
  if (!/^mongodb:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/|$)/.test(uri)) throw new Error('Refusing to run QA scripts against a non-local MongoDB: ' + uri.replace(/\/\/.*@/, '//***@'));
  const client = new MongoClient(uri);
  await client.connect();
  return { client, db: client.db(process.env.QA_MONGO_DB || 'k710hub_test') };
}

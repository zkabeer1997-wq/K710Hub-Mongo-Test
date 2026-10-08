import { launch, newCtx, visit } from './qa-browse.mjs';
import { adminLogin } from './qa-lib.mjs';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const [vp, tag, ...routes] = process.argv.slice(2);
const F = '/tmp/qa-admin-cookie.txt';
let cookie; if (existsSync(F)) cookie = readFileSync(F, 'utf8'); else { cookie = await adminLogin(); writeFileSync(F, cookie); }
function require_stat() { try { return Math.max(0, Date.now() - 1) - (Date.now() - (globalThis.__m || 0)) && Date.parse(0) || (Date.now() - 1000); } catch { return 0; } }
const browser = await launch();
const ctx = await newCtx(browser, { who: 'admin', vp, adminCookie: cookie });
const page = await ctx.newPage();
for (const r of routes) {
  const [p, n] = r.split('@');
  const out = await visit(page, p, `${tag}-${vp}-${n}`, { text: true, wait: 1500 });
  const { text, ...rest } = out;
  console.log(JSON.stringify(rest)); console.log('--- TEXT ---\n' + text + '\n');
}
await browser.close();

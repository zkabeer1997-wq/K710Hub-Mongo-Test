/**
 * Visual regression safety net for the UI consolidation plan (Phase 1).
 *
 * Screenshots every route this plan will touch at 375/768/1440px, and
 * diffs against a saved baseline. Motivated directly by a precedent this
 * codebase already hit once: Card(leather) rendered invisible dark-on-dark
 * under .theme-realm, and it was only caught by screenshotting the page,
 * not by reading the CSS (components/ui/primitives.css:18-28). This
 * script exists so that class of bug gets a "look here" signal instead
 * of relying on someone remembering to screenshot by hand.
 *
 * Point it at a running production build:
 *   npm run build && npm run start -- -p 3111
 *   QA_BASE=http://localhost:3111 node scripts/qa-visual-diff.js [--baseline]
 *
 * --baseline (or no baseline images on disk yet) captures fresh
 * screenshots into qa-screenshots/baseline/ and stops there. Without it,
 * captures into qa-screenshots/current/ and reports a pixel-diff
 * percentage against the matching baseline image for every route+width.
 * A diff is expected and desired once a page migrates onto
 * world-scene.css — this is a report, not a pass/fail gate; review every
 * flagged route by eye and confirm the diff is the intended change.
 *
 * Member- and admin-gated routes are reached with locally-minted session
 * cookies (same HMAC schemes as lib/memberAuth.js / lib/adminAuth.js) via
 * MEMBER_SESSION_SECRET / ADMIN_PASSWORD env vars — no real Supabase
 * credentials needed for the screenshot pass itself, though routes whose
 * *content* comes from Supabase (guides, events, alliances lists) will
 * render their empty/error state without them, same as any local dev run.
 * A route that 5xx's or throws is skipped with a note, not a crash.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');
const { PNG } = require('pngjs');
const pixelmatch = require('pixelmatch').default || require('pixelmatch');

const B = process.env.QA_BASE || 'http://localhost:3111';
const MODE = process.argv.includes('--baseline') ? 'baseline' : 'diff';
const WIDTHS = [375, 768, 1440];
const OUT_DIR = path.join(__dirname, '..', 'qa-screenshots');
const BASELINE_DIR = path.join(OUT_DIR, 'baseline');
const CURRENT_DIR = path.join(OUT_DIR, 'current');
const DIFF_DIR = path.join(OUT_DIR, 'diff');

const MEMBER_ID = 'qa-visual-diff';

function toBase64Url(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function sha256Hex(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

function mintMemberCookie() {
  // Must match lib/memberAuth.js's getSecret() exactly (MEMBER_SESSION_SECRET
  // only, no fallback) or the real app silently rejects this cookie and the
  // "member" QA scenario renders logged-out with no error.
  const secret = process.env.MEMBER_SESSION_SECRET || '';
  if (!secret) return null;
  const nonce = crypto.randomUUID();
  const exp = Date.now() + 12 * 60 * 60 * 1000;
  const payload = toBase64Url(JSON.stringify({ memberId: MEMBER_ID, nonce, exp }));
  const signature = sha256Hex(`k710-member-v2:${payload}:${secret}`);
  return `${payload}.${signature}`;
}

function mintAdminCookie() {
  const secret = process.env.ADMIN_PASSWORD || '';
  if (!secret) return null;
  const nonce = crypto.randomUUID();
  const exp = Date.now() + 8 * 60 * 60 * 1000;
  const payload = toBase64Url(JSON.stringify({ nonce, exp }));
  const signature = sha256Hex(`tff-admin-session-v2:${payload}:${secret}`);
  return `${payload}.${signature}`;
}

// Every route this plan's Phases 1-8 touch, or the theme-realm routes it
// must NOT touch (included as a control group — a diff on one of these
// after a "dark theme only" phase is itself a signal something leaked).
// slugFrom lets a dynamic route resolve a real slug from a list page at
// runtime instead of hardcoding one that may not exist in this environment.
const ROUTES = [
  // theme-realm (bright public) — control group for Phases 2-5
  { path: '/', theme: 'theme-realm' },
  { path: '/about', theme: 'theme-realm' },
  { path: '/timeline', theme: 'theme-realm' },
  { path: '/alliances/710', theme: 'theme-realm' },
  { path: '/alliances/RED', theme: 'theme-realm' },
  { path: '/alliances/SKY', theme: 'theme-realm' },

  // dark, public, no session needed
  { path: '/chronometer', theme: 'chamber' },
  { path: '/interest', theme: 'registry' },
  { path: '/player-record', theme: 'gatehouse' },
  { path: '/admin/login', theme: 'command-hall' },
  { path: '/guides', theme: 'armory' },
  { path: '/guides', theme: 'armory', slugFrom: { list: '/guides', linkSelector: 'a[href^="/guides/"]', template: (href) => href } },
  { path: '/events', theme: 'theme-realm', auth: 'member', query: `?member_id=${MEMBER_ID}`, slugFrom: { list: `/events?member_id=${MEMBER_ID}`, linkSelector: 'a[href^="/events/"]', template: (href) => href } },

  // dark, member-gated
  { path: '/forms', theme: 'muster-hall', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/power-profile', theme: 'armory', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/flamedragon', theme: 'glass', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/prep-phase-backpack', theme: 'glass', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/player-record/form', theme: 'glass', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/events', theme: 'theme-realm', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/tools', theme: 'armory', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/tools/charm-pack-optimizer', theme: 'armory', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/tools/adventure-stall', theme: 'armory', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/tools/flamedragon-shop', theme: 'armory', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/tools/wavebound-charms', theme: 'armory', auth: 'member', query: `?member_id=${MEMBER_ID}` },
  { path: '/tools/pet-pack-optimizer', theme: 'armory', auth: 'member', query: `?member_id=${MEMBER_ID}` },

  // theme-console — AdminShell, already unified structurally
  { path: '/admin/dashboard/overview', theme: 'theme-console', auth: 'admin' },
  { path: '/admin/dashboard/form-gates', theme: 'theme-console', auth: 'admin' },
];

function slugName(route, width) {
  const clean = route.path.replace(/^\//, '').replace(/\//g, '-') || 'home';
  return `${clean}@${width}.png`;
}

async function screenshot(page, route, width) {
  const url = B + route.path + (route.query || '');
  let res;
  try {
    res = await page.goto(url, { waitUntil: 'networkidle', timeout: 20000 });
  } catch (err) {
    console.log(`SKIP  ${route.path}@${width} — navigation failed: ${err.message}`);
    return null;
  }
  if (!res || res.status() >= 500) {
    console.log(`SKIP  ${route.path}@${width} — status ${res ? res.status() : 'none'}`);
    return null;
  }
  await page.waitForTimeout(300); // settle CSS transitions / fonts
  const dir = MODE === 'baseline' ? BASELINE_DIR : CURRENT_DIR;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, slugName(route, width));
  await page.screenshot({ path: file, fullPage: true });
  return file;
}

function diffAgainstBaseline(route, width) {
  const baselineFile = path.join(BASELINE_DIR, slugName(route, width));
  const currentFile = path.join(CURRENT_DIR, slugName(route, width));
  if (!fs.existsSync(baselineFile) || !fs.existsSync(currentFile)) {
    console.log(`NO-BASELINE  ${route.path}@${width} — run with --baseline first`);
    return;
  }
  const before = PNG.sync.read(fs.readFileSync(baselineFile));
  const after = PNG.sync.read(fs.readFileSync(currentFile));
  const w = Math.min(before.width, after.width);
  const h = Math.min(before.height, after.height);
  if (before.width !== after.width || before.height !== after.height) {
    console.log(`DIFF   ${route.path}@${width} — dimensions changed (${before.width}x${before.height} -> ${after.width}x${after.height}), comparing overlap only`);
  }
  fs.mkdirSync(DIFF_DIR, { recursive: true });
  const diffPng = new PNG({ width: w, height: h });
  const changed = pixelmatch(
    croppedData(before, w, h),
    croppedData(after, w, h),
    diffPng.data,
    w,
    h,
    { threshold: 0.1 },
  );
  const pct = ((changed / (w * h)) * 100).toFixed(2);
  fs.writeFileSync(path.join(DIFF_DIR, slugName(route, width)), PNG.sync.write(diffPng));
  const flag = changed === 0 ? 'SAME  ' : 'DIFF  ';
  console.log(`${flag} ${route.path}@${width} — ${pct}% of pixels changed`);
}

function croppedData(png, w, h) {
  if (png.width === w && png.height === h) return png.data;
  const cropped = new PNG({ width: w, height: h });
  PNG.bitblt(png, cropped, 0, 0, w, h, 0, 0);
  return cropped.data;
}

async function resolveDynamicRoutes(page) {
  const resolved = [];
  for (const route of ROUTES) {
    if (!route.slugFrom) {
      resolved.push(route);
      continue;
    }
    try {
      await page.goto(B + route.slugFrom.list, { waitUntil: 'networkidle', timeout: 20000 });
      const href = await page.locator(route.slugFrom.linkSelector).first().getAttribute('href');
      if (href) resolved.push({ ...route, path: route.slugFrom.template(href) });
      else console.log(`SKIP  ${route.slugFrom.list} — no link matching ${route.slugFrom.linkSelector} found (list may be empty without real Supabase data)`);
    } catch (err) {
      console.log(`SKIP  ${route.slugFrom.list} — could not resolve a slug: ${err.message}`);
    }
  }
  return resolved;
}

(async () => {
  const memberCookie = mintMemberCookie();
  const adminCookie = mintAdminCookie();
  if (ROUTES.some((r) => r.auth === 'member') && !memberCookie) {
    console.log('NOTE: MEMBER_SESSION_SECRET not set — member-gated routes will redirect to /player-record and screenshot the login gate instead of their real content.');
  }
  if (ROUTES.some((r) => r.auth === 'admin') && !adminCookie) {
    console.log('NOTE: ADMIN_PASSWORD not set — admin routes will redirect to /admin/login instead of their real content.');
  }

  const b = await chromium.launch({ executablePath: process.env.QA_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const origin = new URL(B).hostname;

  // Skip the first-visit language chooser (components/i18n/LanguageProvider.jsx)
  // on every context - it's a full-screen overlay that would otherwise cover
  // real page content in every screenshot, defeating the point of this tool.
  const skipLanguageChooser = (ctx) => ctx.addInitScript(() => {
    try { window.localStorage.setItem('k710-language-v1', 'en'); } catch { /* private mode */ }
  });

  const probeCtx = await b.newContext();
  await skipLanguageChooser(probeCtx);
  if (memberCookie) await probeCtx.addCookies([{ name: 'k710_member_session', value: memberCookie, domain: origin, path: '/' }]);
  const probe = await probeCtx.newPage();
  const routes = await resolveDynamicRoutes(probe);
  await probeCtx.close();

  for (const width of WIDTHS) {
    const ctx = await b.newContext({ viewport: { width, height: 900 } });
    await skipLanguageChooser(ctx);
    if (memberCookie) await ctx.addCookies([{ name: 'k710_member_session', value: memberCookie, domain: origin, path: '/' }]);
    if (adminCookie) await ctx.addCookies([{ name: 'tff_admin_session', value: adminCookie, domain: origin, path: '/' }]);
    const page = await ctx.newPage();
    for (const route of routes) {
      const saved = await screenshot(page, route, width);
      if (saved && MODE === 'diff') diffAgainstBaseline(route, width);
    }
    await ctx.close();
  }

  await b.close();
  console.log(MODE === 'baseline' ? '\nBaseline captured. Re-run without --baseline after making changes to see diffs.' : '\nDiff pass complete — review every DIFF line above by eye.');
})();

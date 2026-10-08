// Regression: opening the Rallies tab must NOT change stored rally assignments.
// Local dev only. Usage: node scripts/dev/qa-rally-persist.mjs
import { adminLogin, client, mongo } from './qa-lib.mjs';
import { launch, newCtx } from './qa-browse.mjs';

const cookie = await adminLogin();
const api = client(cookie);
const { client: mc, db } = await mongo();
const coll = db.collection('admin_rallies');
const before = await coll.find({}).sort({ position: 1 }).toArray();
const cur = await api('GET', '/api/admin-event-cycles?type=kvk');
const cycleId = (cur.json.cycles || []).find((c) => c.is_current)?.id;
const members = ['920000001', '920000002', '920000003', '920000004'];
const put = await api('PUT', '/api/admin-rallies', { rallies: [
  { id: 'qa-persist-1', name: 'QA Persist', memberIds: members.slice(0, 3), leadMemberId: members[3], troopWeights: { infantry: 50, cavalry: 30, archer: 20 }, leadHeroes: {}, leadHeroAssignments: {} },
] });
if (put.status !== 200) throw new Error('seed rally failed ' + put.status);
const snap = async () => JSON.stringify((await coll.find({ id: 'qa-persist-1' }).project({ _id: 0 }).toArray()));
const seeded = await snap();

const browser = await launch();
const ctx = await newCtx(browser, { who: 'admin', vp: process.argv[2] || 'desktop', adminCookie: cookie });
const page = await ctx.newPage();
await page.goto('http://localhost:3000/admin/dashboard/events/kvk?tab=rallies', { waitUntil: 'networkidle' });
await page.waitForTimeout(3000);
const after = await snap();
const text = await page.locator('.rally-board').innerText().catch(() => '');
await browser.close();
const rendered = /QA Persist|applicants/.test(await Promise.resolve(text));
const ok = rendered && seeded === after && JSON.parse(after).length === 1 && JSON.parse(after)[0].member_ids.length === 4;
console.log(ok ? 'PASS rallies unchanged after open' : 'FAIL rallies changed\n' + seeded + '\n' + after);
console.log(text.slice(0, 300));
await coll.deleteMany({});
if (before.length) await coll.insertMany(before); // restore pre-test rallies
await mc.close();
process.exit(ok ? 0 : 1);

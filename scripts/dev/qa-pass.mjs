// usage: node qa-pass.mjs <memberId> <vp> <easy 0|1> <tag> route[:name] ...
import { launch, newCtx, visit } from './qa-browse.mjs';
const [memberId, vp, easy, tag, ...routes] = process.argv.slice(2);
const browser = await launch();
const ctx = await newCtx(browser, { vp, memberId, easy: easy === '1' });
const page = await ctx.newPage();
for (const r of routes) {
  const [p, n] = r.split('@');
  const out = await visit(page, p, `${tag}-${vp}${easy === '1' ? '-easy' : ''}-${n || p.replace(/[^a-z0-9]+/gi, '_')}`, { text: true });
  const { text, ...rest } = out;
  console.log(JSON.stringify(rest)); console.log('--- TEXT ---\n' + text + '\n');
}
await browser.close();

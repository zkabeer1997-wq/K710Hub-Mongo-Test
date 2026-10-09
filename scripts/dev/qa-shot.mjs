// Dev-only: screenshot a page. Usage: node scripts/dev/qa-shot.mjs /path desktop|phone out-name [anon|member]
import { launch, newCtx, OUT } from './qa-browse.mjs';
import { BASE } from './qa-lib.mjs';

const [target = '/interest', vp = 'desktop', name = 'shot', who = 'anon'] = process.argv.slice(2);
const b = await launch();
const ctx = await newCtx(b, { who, vp });
const page = await ctx.newPage();
await page.goto(`${BASE}${target}`);
await page.waitForTimeout(3500);
await page.screenshot({ path: `${OUT}/${name}.png` });
console.log(`${OUT}/${name}.png`);
await b.close();

// QA journey for Admin > Packs/Tools (dev only). Run against a dev server whose MONGODB_URI is a LOCAL mongod
// with its own MONGODB_DB_NAME, e.g.:
//   MONGODB_URI=mongodb://127.0.0.1:27017 MONGODB_DB_NAME=k710_packs_qa npx next dev -p 3014
//   QA_BASE=http://localhost:3014 node scripts/dev/qa-packs-tools.mjs
// Screenshots go to OUT/packs-*.png. Prints PASS/FAIL lines and exits non-zero on any failure.
import { BASE, adminLogin, memberCookie } from './qa-lib.mjs';
import { launch, newCtx, OUT } from './qa-browse.mjs';

if (!/localhost|127\.0\.0\.1/.test(BASE)) throw new Error('QA runs against a local dev server only');
let failed = 0;
const check = (name, ok, detail = '') => { if (!ok) failed += 1; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); };

const cookie = await adminLogin();
const browser = await launch();
const TABS = [['tool-editing', 'Pack editing'], ['tool-database', 'Tool database'], ['tool-images', 'Tool images']];

for (const vp of ['desktop', 'phone']) {
  const ctx = await newCtx(browser, { who: 'admin', vp, adminCookie: cookie });
  const page = await ctx.newPage();
  const errs = [];
  page.setDefaultTimeout(10000);
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });
  page.on('pageerror', (e) => errs.push('pageerror ' + e.message.slice(0, 200)));
  const shot = (name) => page.screenshot({ path: `${OUT}/packs-${name}-${vp}.png`, fullPage: false });
  const go = async (route) => { await page.goto(`${BASE}/admin/dashboard/${route}`, { waitUntil: 'networkidle' }); };
  const overflowX = () => page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1);

  // ---- nav: one item, highlighted on all three tabs, tabs unchanged
  for (const [route, tab] of TABS) {
    await go(route);
    check(`[${vp}] ${route}: H1 is Packs/Tools`, (await page.locator('h1').first().innerText()).trim() === 'Packs/Tools');
    check(`[${vp}] ${route}: subtitle names the tab`, (await page.locator('main').first().innerText().catch(() => '')).includes(tab) || (await page.content()).includes(tab + ':'));
    const tabLabels = await page.locator('nav[aria-label="Tools sections"] a').allInnerTexts();
    check(`[${vp}] ${route}: in-page tabs unchanged`, JSON.stringify(tabLabels.map((t) => t.trim())) === JSON.stringify(['Pack editing', 'Tool database', 'Tool images']), tabLabels.join('|'));
    check(`[${vp}] ${route}: active tab`, (await page.locator('nav[aria-label="Tools sections"] a[aria-current="page"]').innerText()).trim() === tab);
    if (vp === 'desktop') {
      const items = await page.locator('.admin-sidebar-nav a').allInnerTexts();
      const clean = items.map((t) => t.trim());
      check(`[${vp}] ${route}: sidebar has exactly one Packs/Tools`, clean.filter((t) => t === 'Packs/Tools').length === 1 && !clean.some((t) => /^(Pack editing|Tool database|Tool images)$/.test(t)), clean.join('|'));
      const active = await page.locator('.admin-sidebar-nav a[aria-current="page"]').allInnerTexts();
      check(`[${vp}] ${route}: Packs/Tools highlighted`, active.length === 1 && active[0].trim() === 'Packs/Tools', active.join('|'));
    } else {
      check(`[${vp}] ${route}: mobile here label`, (await page.locator('.admin-mobile-here').innerText()).trim() === 'Packs/Tools');
    }
    await shot(`nav-${route}`);
  }

  // ---- Pack editing: add, edit, disable, member tool shows it, delete
  await go('tool-editing');
  await page.getByRole('button', { name: 'Add a pack' }).click();
  await page.getByLabel('Pack name', { exact: true }).fill('QA Weekend Pack');
  await page.getByLabel('Price (USD)', { exact: true }).fill('7.99');
  await page.getByLabel('Shells in the pack', { exact: true }).fill('7');
  await page.getByLabel('Purchase limit per day', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Add pack' }).click();
  check(`[${vp}] bad contents rejected with a message`, await page.getByRole('status').filter({ hasText: /multiples of 5/ }).count() > 0);
  await shot('add-pack-error');
  await page.getByLabel('Shells in the pack', { exact: true }).fill('150');
  await shot('add-pack-form');
  await page.getByRole('button', { name: 'Add pack' }).click();
  await page.getByRole('status').filter({ hasText: 'Added "QA Weekend Pack"' }).waitFor();
  check(`[${vp}] pack added and listed`, await page.getByRole('row', { name: /QA Weekend Pack/ }).count() === 1);
  await shot('pack-added');

  await page.getByRole('button', { name: 'Edit QA Weekend Pack' }).click();
  await page.getByLabel('Price (USD)', { exact: true }).fill('8.49');
  await page.getByRole('button', { name: 'Save pack' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved "QA Weekend Pack"' }).waitFor();
  check(`[${vp}] pack edited`, await page.getByRole('row', { name: /QA Weekend Pack.*\$8\.49/ }).count() === 1);

  const memberPage = async (slug) => (await fetch(`${BASE}/tools/${slug}`, { headers: { cookie: memberCookie('920000003') } })).text();
  const toolHtml = () => memberPage('adventure-stall');
  check(`[${vp}] Adventure Stall lists the custom pack`, (await toolHtml()).includes('QA Weekend Pack'));
  await page.getByRole('button', { name: 'Disable QA Weekend Pack' }).click();
  await page.getByRole('status').filter({ hasText: 'Disabled' }).waitFor();
  check(`[${vp}] disabled pack is hidden from the tool`, !(await toolHtml()).includes('QA Weekend Pack'));
  check(`[${vp}] disabled pack shows a Disabled tag`, await page.getByRole('row', { name: /QA Weekend Pack/ }).getByText('Disabled').count() === 1);
  await page.getByRole('button', { name: 'Enable QA Weekend Pack' }).click();
  await page.getByRole('status').filter({ hasText: 'Enabled' }).waitFor();

  // Dragon's Caravan pack
  await page.getByRole('button', { name: 'Add a pack' }).click();
  await page.locator('#cp-tool').selectOption('flamedragon-shop');
  await page.getByLabel('Pack name', { exact: true }).fill('QA Essence Pack');
  await page.getByLabel('Price (USD)', { exact: true }).fill('3');
  await page.getByLabel('Dragon Essence in the pack', { exact: true }).fill('300');
  await page.getByLabel('Purchase limit', { exact: true }).fill('4');
  await page.getByRole('button', { name: 'Add pack' }).click();
  await page.getByRole('status').filter({ hasText: 'Added "QA Essence Pack"' }).waitFor();
  check(`[${vp}] Dragon's Caravan lists its custom pack`, (await memberPage('dragons-caravan-optimizer')).includes('QA Essence Pack'));

  // delete dialog: focus lands on Confirm, Escape closes, confirm deletes
  await page.getByRole('button', { name: 'Delete QA Essence Pack' }).click();
  const dialog = page.getByRole('alertdialog');
  await dialog.waitFor();
  check(`[${vp}] delete dialog focuses the confirm button`, await page.evaluate(() => document.activeElement?.textContent) === 'Delete pack');
  await shot('delete-pack-dialog');
  await page.keyboard.press('Escape');
  check(`[${vp}] Escape closes the dialog and keeps the pack`, await dialog.count() === 0 && await page.getByRole('row', { name: /QA Essence Pack/ }).count() === 1);
  await page.getByRole('button', { name: 'Delete QA Essence Pack' }).click();
  await page.getByRole('button', { name: 'Delete pack' }).click();
  await page.getByRole('status').filter({ hasText: 'Deleted "QA Essence Pack"' }).waitFor();
  await page.getByRole('button', { name: 'Delete QA Weekend Pack' }).click();
  await page.getByRole('button', { name: 'Delete pack' }).click();
  await page.getByRole('status').filter({ hasText: 'Deleted "QA Weekend Pack"' }).waitFor();
  check(`[${vp}] custom packs deleted`, await page.getByText('No custom packs yet.').count() === 1);
  check(`[${vp}] pack tab: no horizontal overflow`, !(await overflowX()));
  await shot('packs-final');

  // ---- Tool database: reference table edit / persist / reset
  await go('tool-database');
  const picker = page.locator('#tool-calc-tool');
  await picker.selectOption({ label: 'Charm levels table (editable)' });
  const cell = page.getByLabel('Level 2: Health / Lethality');
  const original = await cell.inputValue();
  await cell.fill('abc').catch(() => {});
  await cell.fill('-5');
  check(`[${vp}] invalid value flagged inline`, await page.locator('[role=alert]').filter({ hasText: /to 100,000/ }).count() > 0);
  await page.getByRole('button', { name: 'Save changes' }).click().catch(() => {});
  await cell.fill('12');
  check(`[${vp}] tool picker locked while unsaved`, await picker.isDisabled());
  await shot('ref-edit');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved Charm levels' }).waitFor();
  check(`[${vp}] last-saved stamp shows`, await page.getByText(/Last saved/).count() > 0);
  await shot('ref-saved');
  await go('tool-database');
  await picker.selectOption({ label: 'Charm levels table (editable)' });
  check(`[${vp}] override persists after reload`, await page.getByLabel('Level 2: Health / Lethality').inputValue() === '12');
  await page.getByRole('button', { name: 'Reset to built-in values' }).click();
  const reset = page.getByRole('alertdialog');
  await reset.waitFor();
  check(`[${vp}] reset dialog focuses confirm`, await page.evaluate(() => document.activeElement?.textContent) === 'Reset to built-in values');
  await shot('ref-reset-dialog');
  await reset.getByRole('button', { name: 'Reset to built-in values' }).click();
  await page.getByRole('status').filter({ hasText: 'was reset' }).waitFor();
  check(`[${vp}] reset restores the built-in value`, await page.getByLabel('Level 2: Health / Lethality').inputValue() === original, `${original}`);
  await picker.selectOption({ label: 'Governor gear tiers table (editable)' });
  await page.getByLabel(/^Red T6 \+3: Satin/).waitFor();
  await shot('ref-gear');
  check(`[${vp}] gear table: no horizontal overflow`, !(await overflowX()));

  // ---- Databases: add, edit values, reorder, delete
  await picker.selectOption({ label: 'Your databases (add and edit)' });
  await page.getByRole('button', { name: 'Add database' }).click();
  await page.getByLabel('Database name').fill('QA Chest odds');
  await page.getByLabel('Column 1 name').fill('Common');
  await page.getByRole('button', { name: 'Add column' }).click();
  await page.getByLabel('Column 2 name').fill('Rare');
  await page.getByLabel('Row 1 label').fill('Chest A');
  await page.getByLabel('Chest A: Common').fill('10');
  await page.getByLabel('Chest A: Rare').fill('2.5');
  await page.getByRole('button', { name: 'Add row' }).click();
  await page.getByLabel('Row 2 label').fill('Chest B');
  await page.getByLabel('Chest B: Common').fill('4');
  await page.getByLabel('Chest B: Rare').fill('1');
  await shot('db-editor');
  await page.getByRole('button', { name: 'Create database' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved "QA Chest odds"' }).waitFor();
  await page.getByLabel('Chest A: Rare').fill('3.25');
  await page.getByRole('button', { name: 'Move row 2 up' }).click();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved "QA Chest odds"' }).waitFor();
  check(`[${vp}] row order saved`, await page.getByLabel('Row 1 label').inputValue() === 'Chest B');
  await shot('db-saved');
  // validation: duplicate row label
  await page.getByLabel('Row 2 label').fill('Chest B');
  check(`[${vp}] duplicate row label shown as a problem`, await page.getByText(/Two rows are called/).count() > 0);
  await page.getByLabel('Row 2 label').fill('Chest A');
  await page.getByRole('button', { name: 'Discard changes' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Discard changes' }).click();
  // second database + reorder
  await page.getByRole('button', { name: 'Add database' }).click();
  await page.getByLabel('Database name').fill('QA Second');
  await page.getByLabel('Column 1 name').fill('Value');
  await page.getByRole('button', { name: 'Create database' }).click();
  check(`[${vp}] incomplete row blocks the save with a reason`, await page.getByRole('status').filter({ hasText: /label for row 1/ }).count() > 0);
  await page.getByRole('button', { name: 'Delete row 1' }).click();
  await page.getByRole('button', { name: 'Create database' }).click();
  await page.getByRole('status').filter({ hasText: 'Saved "QA Second"' }).waitFor();
  await page.getByRole('button', { name: 'Back to list' }).click();
  await page.getByRole('button', { name: 'Move QA Second up' }).click();
  await page.getByRole('status').filter({ hasText: 'Moved "QA Second" up' }).waitFor();
  const names = await page.locator('tbody th[scope=row]').allInnerTexts();
  check(`[${vp}] databases reordered`, names[0].trim().toLowerCase() === 'qa second' && names[1].trim().toLowerCase() === 'qa chest odds', names.join('|'));
  await shot('db-list');
  for (const name of ['QA Second', 'QA Chest odds']) {
    await page.getByRole('button', { name: `Delete ${name}` }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete database' }).click();
    await page.getByRole('status').filter({ hasText: `Deleted "${name}"` }).waitFor();
  }
  check(`[${vp}] databases deleted`, await page.getByText('No databases yet.').count() === 1);
  check(`[${vp}] database view: no horizontal overflow`, !(await overflowX()));

  // ---- Tool images tab still renders
  await go('tool-images');
  await shot('images-tab');
  check(`[${vp}] no console errors`, errs.length === 0, JSON.stringify([...new Set(errs)]));
  await ctx.close();
}
await browser.close();
console.log(failed ? `${failed} check(s) FAILED` : 'ALL PASSED');
process.exit(failed ? 1 : 0);

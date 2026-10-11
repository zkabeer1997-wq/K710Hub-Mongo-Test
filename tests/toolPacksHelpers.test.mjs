import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CUSTOM_PACK_TOOLS, customPackToToolPack, isPackId, newPackId, validateCustomPack, withCustomPacks,
} from '../lib/customPacks.mjs';
import {
  builtInRows, charmLevelsFromRows, differsFromBuiltIn, mergeReferenceRows, validateReferenceRows,
} from '../lib/toolReferenceTables.mjs';
import {
  MAX_COLUMNS, MAX_ROWS, isDatabaseId, newDatabaseId, reorderDatabases, sortDatabases, validateDatabase,
} from '../lib/toolDatabases.mjs';
import { CHARM_LEVELS } from '../lib/phase2Data.mjs';
import { PACKS as ADVENTURE_PACKS, optimizeShellPacks, packLimits } from '../lib/adventureStall.mjs';
import { PACKS as DRAGON_PACKS, optimizeEssencePacks } from '../lib/flamedragonShop.mjs';

const okPack = { name: 'Weekend Deal', price: 7.99, amount: 150, limit: 2 };

test('custom pack validation: price uses the existing money rules', () => {
  assert.ok(validateCustomPack('adventure-stall', okPack).value);
  assert.equal(validateCustomPack('adventure-stall', okPack).value.price, 7.99);
  for (const price of [0, -1, 1.005, 1000, Number.NaN, '4.99', null]) {
    assert.match(validateCustomPack('adventure-stall', { ...okPack, price }).error, /Price/, String(price));
  }
  assert.equal(validateCustomPack('adventure-stall', { ...okPack, price: 999.99 }).value.price, 999.99);
});

test('custom pack validation: contents, limit and name', () => {
  assert.match(validateCustomPack('adventure-stall', { ...okPack, amount: 7 }).error, /multiples of 5/);
  assert.match(validateCustomPack('flamedragon-shop', { ...okPack, amount: 30 }).error, /multiples of 20/);
  assert.ok(validateCustomPack('flamedragon-shop', { ...okPack, amount: 300 }).value);
  assert.match(validateCustomPack('adventure-stall', { ...okPack, amount: 20001 }).error, /from 5 to 20,000/);
  assert.match(validateCustomPack('adventure-stall', { ...okPack, limit: 0 }).error, /Purchase limit per day/);
  assert.match(validateCustomPack('adventure-stall', { ...okPack, limit: 21 }).error, /Purchase limit per day/);
  assert.match(validateCustomPack('adventure-stall', { ...okPack, limit: 1.5 }).error, /whole number/);
  assert.match(validateCustomPack('adventure-stall', { ...okPack, name: '   ' }).error, /name/);
  assert.match(validateCustomPack('adventure-stall', { ...okPack, name: 'x'.repeat(41) }).error, /at most 40/);
  assert.match(validateCustomPack('adventure-stall', { ...okPack, name: '<b>hi' }).error, /cannot contain/);
  assert.equal(validateCustomPack('adventure-stall', { ...okPack, name: '  Spaced   out  ' }).value.name, 'Spaced out');
  assert.match(validateCustomPack('pet-pack-optimizer', okPack).error, /cannot take extra packs/);
  assert.match(validateCustomPack('adventure-stall', null).error, /Invalid/);
});

test('custom pack names are unique among custom and built-in packs, case-insensitively', () => {
  assert.match(validateCustomPack('adventure-stall', { ...okPack, name: 'weekend deal' }, ['Weekend Deal']).error, /already exists/);
  assert.match(validateCustomPack('adventure-stall', { ...okPack, name: '20 shell pack' }).error, /already exists/);
  assert.match(validateCustomPack('flamedragon-shop', { ...okPack, amount: 200, name: 'DAILY CARAVAN PACK' }).error, /already exists/);
  assert.ok(validateCustomPack('adventure-stall', { ...okPack, name: 'Daily Caravan Pack' }).value, 'same name is fine in the other tool');
});

test('stored packs map to the exact shape each tool already consumes', () => {
  const doc = { id: 'abc123xyz', tool_key: 'adventure-stall', name: 'Weekend Deal', price: 7.99, amount: 150, limit: 2, enabled: true, created_at: new Date(1) };
  assert.deepEqual(customPackToToolPack('adventure-stall', doc), { key: 'custom-abc123xyz', name: 'Weekend Deal', shells: 150, cents: 799, perDay: 2, custom: true });
  assert.deepEqual(customPackToToolPack('flamedragon-shop', { ...doc, tool_key: 'flamedragon-shop', amount: 300 }), { key: 'custom-abc123xyz', name: 'Weekend Deal', essence: 300, cents: 799, defaultMax: 2, custom: true });
  assert.ok(Object.keys(customPackToToolPack('adventure-stall', doc)).every((k) => k === 'custom' || k in ADVENTURE_PACKS[0]));
  assert.ok(Object.keys(customPackToToolPack('flamedragon-shop', { ...doc, amount: 300 })).every((k) => k === 'custom' || k in DRAGON_PACKS[1]));
});

test('withCustomPacks appends only enabled packs of that tool, oldest first', () => {
  const base = { items: [], packs: [{ key: '20' }] };
  const mk = (id, extra = {}) => ({ id, tool_key: 'adventure-stall', name: id, price: 1, amount: 5, limit: 1, enabled: true, created_at: new Date(id === 'second00' ? 2 : 1), ...extra });
  const out = withCustomPacks('adventure-stall', base, [mk('second00'), mk('first000'), mk('off00000', { enabled: false }), mk('other000', { tool_key: 'flamedragon-shop' })]);
  assert.deepEqual(out.packs.map((p) => p.key), ['20', 'custom-first000', 'custom-second00']);
  assert.equal(base.packs.length, 1, 'input untouched');
  assert.equal(withCustomPacks('adventure-stall', base, []), base);
  const pet = { tiers: [] };
  assert.equal(withCustomPacks('pet-pack-optimizer', pet, [mk('first000')]), pet, 'unsupported tools are unchanged');
});

test('the member optimizers accept a custom pack through the normal pack list', () => {
  const custom = customPackToToolPack('adventure-stall', { id: 'abc123xyz', name: 'Odd', price: 0.5, amount: 35, limit: 1 });
  const packs = [...ADVENTURE_PACKS, custom];
  assert.equal(packLimits(3, packs)['custom-abc123xyz'], 3);
  const plan = optimizeShellPacks(35, 1, packs);
  assert.equal(plan.quantities['custom-abc123xyz'], 1, 'cheapest exact fit is the custom pack');
  assert.equal(plan.costCents, 50);
  const dragon = customPackToToolPack('flamedragon-shop', { id: 'abc123xyz', name: 'Odd', price: 0.5, amount: 60, limit: 1 });
  const dpack = optimizeEssencePacks(60, { ...Object.fromEntries(DRAGON_PACKS.map((p) => [p.key, p.defaultMax])), [dragon.key]: dragon.defaultMax }, [...DRAGON_PACKS, dragon]);
  assert.equal(dpack.quantities[dragon.key], 1);
});

test('pack ids', () => {
  assert.ok(isPackId(newPackId()));
  assert.ok(!isPackId('x') && !isPackId('has space') && !isPackId(5));
  assert.deepEqual(Object.keys(CUSTOM_PACK_TOOLS), ['adventure-stall', 'flamedragon-shop']);
});

// ---- reference tables
const charmRows = () => builtInRows('charm-levels').map((r) => ({ ...r }));
const gearRows = () => builtInRows('gear-tiers').map((r) => ({ ...r }));

test('reference tables: built-in rows come from the checked-in modules', () => {
  const rows = charmRows();
  assert.equal(rows.length, CHARM_LEVELS.filter(Boolean).length);
  assert.equal(rows[0].id, 1);
  assert.equal(rows[0].guides, CHARM_LEVELS[1].guides);
  assert.ok(gearRows().length > 40);
  assert.ok(validateReferenceRows('charm-levels', charmRows()).rows, 'unchanged table validates');
  assert.ok(validateReferenceRows('gear-tiers', gearRows()).rows);
});

test('reference tables: validation rejects bad numbers, missing, duplicate and unknown rows', () => {
  const edit = (rows, i, patch) => rows.map((r, j) => (i === j ? { ...r, ...patch } : r));
  assert.match(validateReferenceRows('charm-levels', edit(charmRows(), 0, { guides: -1 })).error, /Guides/);
  assert.match(validateReferenceRows('charm-levels', edit(charmRows(), 0, { guides: 1.5 })).error, /whole number/);
  assert.match(validateReferenceRows('charm-levels', edit(charmRows(), 0, { power: Infinity })).error, /number/);
  assert.match(validateReferenceRows('charm-levels', edit(charmRows(), 0, { health: '9' })).error, /number/);
  assert.match(validateReferenceRows('charm-levels', edit(charmRows(), 0, { health: 100001 })).error, /from 0 to 100,000/);
  assert.match(validateReferenceRows('gear-tiers', edit(gearRows(), 3, { statGain: 100.5 })).error, /Stat bonus/);
  assert.match(validateReferenceRows('gear-tiers', edit(gearRows(), 3, { setBonus: 1.234 })).error, /2 decimals/);
  assert.ok(validateReferenceRows('gear-tiers', edit(gearRows(), 3, { setBonus: 2.55 })).rows);
  assert.match(validateReferenceRows('charm-levels', charmRows().slice(1)).error, /exactly/);
  assert.match(validateReferenceRows('charm-levels', edit(charmRows(), 1, { id: 1 })).error, /twice/);
  assert.match(validateReferenceRows('charm-levels', edit(charmRows(), 1, { id: 99 })).error, /missing/);
  assert.match(validateReferenceRows('charm-levels', 'nope').error, /rows/);
  assert.match(validateReferenceRows('nope', []).error, /supported/);
});

test('reference tables: merge falls back to built-ins and ignores malformed overrides', () => {
  assert.deepEqual(mergeReferenceRows('charm-levels', undefined), charmRows());
  assert.deepEqual(mergeReferenceRows('charm-levels', [{ id: 1 }]), charmRows());
  const rows = charmRows();
  rows[1].health = 77;
  const merged = mergeReferenceRows('charm-levels', rows);
  assert.equal(merged[1].health, 77);
  assert.equal(merged[1].label, 'Level 2');
  assert.ok(differsFromBuiltIn('charm-levels', merged));
  assert.ok(!differsFromBuiltIn('charm-levels', charmRows()));
  const levels = charmLevelsFromRows(merged);
  assert.equal(levels[0], null);
  assert.equal(levels[2].lethality, 77);
  assert.deepEqual(Object.keys(levels[1]).sort(), Object.keys(CHARM_LEVELS[1]).sort(), 'same shape as the built-in table');
});

// ---- custom databases
const db = { name: 'Chest odds', columns: ['Common', 'Rare'], rows: [{ label: 'Chest A', values: [1, 2.5] }, { label: 'Chest B', values: [0, -3] }] };

test('database validation accepts a normal table and normalizes text', () => {
  const { value } = validateDatabase({ name: '  Chest   odds ', columns: [' Common', 'Rare '], rows: db.rows });
  assert.equal(value.name, 'Chest odds');
  assert.deepEqual(value.columns, ['Common', 'Rare']);
  assert.ok(validateDatabase({ name: 'Empty', columns: ['A'], rows: [] }).value, 'zero rows is fine');
});

test('database validation: names, columns, rows, values and limits', () => {
  assert.match(validateDatabase({ ...db, name: '' }).error, /name/);
  assert.match(validateDatabase({ ...db, name: 'x'.repeat(61) }).error, /at most 60/);
  assert.match(validateDatabase({ ...db, name: 'chest ODDS' }, ['Chest odds']).error, /already exists/);
  assert.match(validateDatabase({ ...db, columns: [] }).error, /at least one column/);
  assert.match(validateDatabase({ ...db, columns: Array.from({ length: MAX_COLUMNS + 1 }, (_, i) => `c${i}`) }).error, /At most 12 columns/);
  assert.match(validateDatabase({ ...db, columns: ['A', 'a'] }).error, /unique/);
  assert.match(validateDatabase({ ...db, columns: ['A', ''] }).error, /column 2/);
  assert.match(validateDatabase({ ...db, columns: ['A', 'B<'] }).error, /cannot contain/);
  assert.match(validateDatabase({ ...db, rows: Array.from({ length: MAX_ROWS + 1 }, (_, i) => ({ label: `r${i}`, values: [0, 0] })) }).error, /At most 200 rows/);
  assert.match(validateDatabase({ ...db, rows: [db.rows[0], { ...db.rows[0] }] }).error, /unique/);
  assert.match(validateDatabase({ ...db, rows: [{ label: 'A', values: [1] }] }).error, /exactly 2 values/);
  assert.match(validateDatabase({ ...db, rows: [{ label: 'A', values: [1, '2'] }] }).error, /enter a number/);
  assert.match(validateDatabase({ ...db, rows: [{ label: 'A', values: [1, Infinity] }] }).error, /enter a number/);
  assert.match(validateDatabase({ ...db, rows: [{ label: 'A', values: [1, 1e13] }] }).error, /within/);
  assert.match(validateDatabase({ ...db, rows: [{ label: 'A', values: [1, 0.00001] }] }).error, /4 decimals/);
  assert.match(validateDatabase({ ...db, rows: [{ label: '', values: [1, 1] }] }).error, /row 1/);
  assert.match(validateDatabase({ ...db, rows: 'x' }).error, /rows/);
  assert.match(validateDatabase(null).error, /Invalid/);
});

test('database ordering and ids', () => {
  const docs = [{ id: 'db-bbbbbb', order: 1 }, { id: 'db-aaaaaa', order: 0 }, { id: 'db-cccccc', order: 2 }];
  assert.deepEqual(sortDatabases(docs).map((d) => d.id), ['db-aaaaaa', 'db-bbbbbb', 'db-cccccc']);
  assert.deepEqual(reorderDatabases(docs, 'db-cccccc', 'up'), [{ id: 'db-aaaaaa', order: 0 }, { id: 'db-cccccc', order: 1 }, { id: 'db-bbbbbb', order: 2 }]);
  assert.equal(reorderDatabases(docs, 'db-aaaaaa', 'up'), null);
  assert.equal(reorderDatabases(docs, 'db-cccccc', 'down'), null);
  assert.equal(reorderDatabases(docs, 'db-zzzzzz', 'down'), null);
  assert.ok(isDatabaseId(newDatabaseId()));
  assert.ok(!isDatabaseId('db-') && !isDatabaseId('../etc') && !isDatabaseId(1));
});

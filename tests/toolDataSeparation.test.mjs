import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { TOOL_CATALOG, TOOL_KINDS, catalogForKind, defaultQuantities, toolConfiguration, validateToolQuantities } from '../lib/toolCatalog.mjs';
import { createPetPackOptimizer } from '../lib/petPackOptimizer.mjs';
import { optimizeCharmPacks } from '../lib/charmPackOptimizer.mjs';

const golden = JSON.parse(fs.readFileSync(new URL('./fixtures/toolConfigurationGolden.json', import.meta.url), 'utf8'));

test('every field belongs to exactly one page and pack fields are the only ones with prices', () => {
  for (const [tool, def] of Object.entries(TOOL_CATALOG)) {
    for (const f of def.fields) {
      assert.ok(TOOL_KINDS.includes(f.kind), `${tool} ${f.key} has a kind`);
      assert.equal(Boolean(f.usd), f.kind === 'pack' && /price/i.test(f.label), `${tool} ${f.key}: only pack price fields are USD`);
      if (f.kind === 'calc') assert.ok(!/price|\$|usd/i.test(`${f.label} ${f.group}`), `${tool} ${f.key}: no $ data in the tool database`);
    }
  }
});

test('pack editing has no per-level or per-tier requirements; tool database has no packs', () => {
  const pack = catalogForKind('pack'), calc = catalogForKind('calc');
  const sailing = ['wavebound-charms', 'governor-gear-sailing-tool'];
  for (const key of sailing) {
    assert.ok(!pack.some((t) => t.key === key), `${key} has nothing to edit in Pack editing`);
    assert.ok(calc.some((t) => t.key === key));
  }
  for (const t of pack) for (const f of t.fields) assert.ok(!/^cost\.|^shop\./.test(f.key), `${t.key} ${f.key} is not pack data`);
  for (const t of calc) for (const f of t.fields) assert.ok(!/^pack\.|^tier\./.test(f.key), `${t.key} ${f.key} is not calculator data`);
  assert.ok(calc.find((t) => t.key === 'wavebound-charms').fields.some((f) => f.key === 'cost.22.g'));
  assert.ok(pack.find((t) => t.key === 'charm-pack-optimizer').fields.some((f) => f.key === 'pack.0.price'));
});

test('default member tool configuration is identical to the pre-split golden values', () => {
  for (const key of Object.keys(golden.config)) {
    const config = toolConfiguration(key);
    if (key === 'pet-pack-optimizer') {
      assert.deepEqual(config.tiers.map((t) => t.price), [4.99, 9.99, 19.99, 49.99, 99.99]);
      delete config.tiers;
    }
    assert.deepEqual(config, golden.config[key], key);
  }
});

test('optimizer results with default settings match golden values', () => {
  const pet = createPetPackOptimizer(toolConfiguration('pet-pack-optimizer'));
  assert.deepEqual(JSON.parse(JSON.stringify(pet({ need: { food: 60000, manual: 300 }, have: {}, ownedChests: 1, maxWeeks: 4 }))), golden.pet);
  const charm = optimizeCharmPacks({ packs: toolConfiguration('charm-pack-optimizer').packs, required: { g: 1500, d: 1800 }, owned: { g: 100, d: 50 }, maxWeeks: 8 });
  assert.deepEqual(JSON.parse(JSON.stringify(charm)), golden.charmPack);
});

test('governor charm and gear sailing values still come from the stored quantities', () => {
  const charm = toolConfiguration('charm-sailing-optimizer', { 'cost.5.g': 123 });
  assert.equal(charm.costs[5][0], 123);
  assert.equal(charm.rewards['cost.5.g'], 123);
  const gear = toolConfiguration('governor-gear-sailing-tool', { 'cost.5.shards': 7 });
  assert.equal(gear.costs[5][2], 7);
});

test('edited prices and limits flow into the member configuration', () => {
  const charm = toolConfiguration('charm-pack-optimizer', { 'pack.0.price': 5.49, 'pack.0.max': 2 });
  assert.equal(charm.packs[0].price, 5.49);
  assert.equal(charm.packs[0].max, 2);
  assert.equal(optimizeCharmPacks({ packs: charm.packs, required: { g: 20, d: 22 }, maxWeeks: 4 }).costCents, 549);
  const stall = toolConfiguration('adventure-stall', { 'pack.20.price': 1.25, 'pack.20.limit': 3 });
  assert.equal(stall.packs[0].cents, 125);
  assert.equal(stall.packs[0].perDay, 3);
  const dragon = toolConfiguration('flamedragon-shop', { 'pack.200.price': 3.99, 'pack.200.limit': 5 });
  const p = dragon.packs.find((x) => x.key === '200');
  assert.equal(p.cents, 399);
  assert.equal(p.defaultMax, 5);
  const pet = toolConfiguration('pet-pack-optimizer', { 'tier.0.price': 2.5 });
  assert.equal(pet.tiers[0].price, 2.5);
  assert.equal(createPetPackOptimizer(pet)({ need: { food: 9000 }, have: {}, ownedChests: 0, maxWeeks: 1 }).cost, 2.5);
});

test('pack prices must be positive USD with at most 2 decimals; quantities cannot be negative', () => {
  const bad = (q, re) => { const r = validateToolQuantities('charm-pack-optimizer', q); assert.match(r.error || '', re); };
  bad({ 'pack.0.price': 0 }, /more than \$0\.00/);
  bad({ 'pack.0.price': -4.99 }, /more than \$0\.00/);
  bad({ 'pack.0.price': 4.999 }, /2 decimals/);
  bad({ 'pack.0.price': 'abc' }, /enter a number/);
  bad({ 'pack.0.price': 1000 }, /from \$/);
  bad({ 'pack.0.max': -1 }, /negative/);
  assert.equal(validateToolQuantities('charm-pack-optimizer', { 'pack.0.price': 4.5 }).quantities['pack.0.price'], 4.5);
  assert.match(validateToolQuantities('adventure-stall', { 'bogus.key': 1 }).error, /Unknown setting/);
  assert.match(validateToolQuantities('wavebound-charms', { 'cost.3.g': -5 }).error, /negative/);
});

test('defaults stay valid for every tool', () => {
  for (const key of Object.keys(TOOL_CATALOG)) assert.ok(validateToolQuantities(key, defaultQuantities(key)).quantities, key);
});

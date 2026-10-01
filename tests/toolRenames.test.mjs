import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  ALL_SAVED_PLAN_STORAGE_KEYS, SUPPORTED_TOOL_KEYS, TOOL_KEY_ALIASES, TOOL_SAVED_PLAN_KEYS, TOOL_SLUG_RENAMES,
  isSupportedToolKey, resolveToolStorageKey, savedPlansBySlug, toolKeyVariants,
} from '../lib/toolKeys.mjs';
import { createToolStateEnvelope, readToolState } from '../lib/toolState.mjs';
import { TOOL_CATALOG, defaultQuantities, toolConfiguration, validateToolQuantities } from '../lib/toolCatalog.mjs';
import { TOOL_CATEGORIES, resolveToolCategory, toolFreshness } from '../lib/toolCategories.mjs';

test('renamed tool keys alias to the storage key that already holds saved plans', () => {
  assert.equal(resolveToolStorageKey('charm-sailing-optimizer'), 'wavebound-charms');
  assert.equal(resolveToolStorageKey('dragons-caravan-optimizer'), 'flamedragon-shop');
  assert.equal(resolveToolStorageKey('wavebound-charms'), 'wavebound-charms');
  assert.equal(resolveToolStorageKey('updated-charms'), 'updated-charms');
  assert.equal(resolveToolStorageKey('hero-gear'), 'hero-gear', 'legacy hero-gear data must not be redirected');
  assert.deepEqual(toolKeyVariants('wavebound-charms').sort(), ['charm-sailing-optimizer', 'wavebound-charms']);
  assert.equal(isSupportedToolKey('charm-sailing-optimizer'), true);
  assert.equal(isSupportedToolKey('dragons-caravan-optimizer'), true);
  assert.equal(isSupportedToolKey('invented-tool'), false);
  for (const storage of Object.values(TOOL_KEY_ALIASES)) assert.ok(SUPPORTED_TOOL_KEYS.includes(storage));
  assert.equal(resolveToolStorageKey('__proto__'), '__proto__');
});

test('saved plans written under old keys are still found for the renamed tools', () => {
  const rows = [
    { tool_key: 'wavebound-charms', updated_at: '2026-09-20T10:00:00.000Z' },
    { tool_key: 'flamedragon-shop', updated_at: '2026-09-21T10:00:00.000Z' },
    { tool_key: 'updated-charms', updated_at: '2026-09-22T10:00:00.000Z' },
    { tool_key: 'costs-war-academy', updated_at: '2026-09-23T10:00:00.000Z' },
    { tool_key: 'costs-academy', updated_at: '2026-09-24T10:00:00.000Z' },
    { tool_key: 'unrelated-key', updated_at: '2026-09-25T10:00:00.000Z' },
  ];
  const found = savedPlansBySlug(rows);
  assert.deepEqual(Object.keys(found).sort(), ['charm-sailing-optimizer', 'charms', 'dragons-caravan-optimizer', 'research']);
  assert.equal(found['charm-sailing-optimizer'], '2026-09-20T10:00:00.000Z');
  assert.equal(found.research, '2026-09-24T10:00:00.000Z');
  assert.deepEqual(savedPlansBySlug([]), {});
  assert.deepEqual(savedPlansBySlug(null), {});
  assert.ok(Object.keys(TOOL_SAVED_PLAN_KEYS).length >= 12);
});

test('envelopes stored under the old key are readable through the new key', () => {
  const stored = createToolStateEnvelope('wavebound-charms', 1, { target: 7 });
  assert.deepEqual(readToolState(stored, { toolKey: 'charm-sailing-optimizer', schemaVersion: 1 }), { target: 7 });
  assert.equal(readToolState(stored, { toolKey: 'dragons-caravan-optimizer', schemaVersion: 1 }), null);
});

test('admin catalog accepts old and new keys and keeps existing overrides valid', () => {
  assert.ok(TOOL_CATALOG['wavebound-charms'] && TOOL_CATALOG['flamedragon-shop'], 'storage keys stay the catalog keys');
  assert.equal(TOOL_CATALOG['wavebound-charms'].label, 'Charm Sailing Optimizer');
  assert.equal(TOOL_CATALOG['flamedragon-shop'].label, "Dragon's Caravan Optimizer");
  assert.deepEqual(defaultQuantities('charm-sailing-optimizer'), defaultQuantities('wavebound-charms'));
  const override = { 'majestic.g': 80 };
  assert.deepEqual(validateToolQuantities('charm-sailing-optimizer', override), validateToolQuantities('wavebound-charms', override));
  assert.ok(validateToolQuantities('charm-sailing-optimizer', { 'majestic.g': 1 }).error);
  assert.deepEqual(toolConfiguration('dragons-caravan-optimizer'), toolConfiguration('flamedragon-shop'));
});

test('next.config redirects every old tool slug permanently, including nested paths', async () => {
  const require = createRequire(import.meta.url);
  const config = require('../next.config.js');
  const redirects = await config.redirects();
  for (const [from, to] of Object.entries(TOOL_SLUG_RENAMES)) {
    assert.ok(redirects.some((r) => r.source === `/tools/${from}` && r.destination === `/tools/${to}` && r.permanent === true), from);
    assert.ok(redirects.some((r) => r.source === `/tools/${from}/:path*` && r.destination === `/tools/${to}/:path*` && r.permanent === true), from);
    assert.ok(!to.startsWith('updated-'));
  }
});

test('tool categories resolve new ids, labels and legacy ?category= values', () => {
  assert.deepEqual(TOOL_CATEGORIES.map((c) => c.label), ['Gear', 'Charms', 'Pets & Masters', 'Construction & Research', 'Event Shops', 'Planning']);
  assert.equal(resolveToolCategory('gear'), 'gear');
  assert.equal(resolveToolCategory('Pets & Masters'), 'pets-masters');
  assert.equal(resolveToolCategory('Special Event Shops'), 'event-shops');
  assert.equal(resolveToolCategory('Special+Event+Shops'), 'event-shops');
  assert.equal(resolveToolCategory('Account Progression'), 'planning');
  assert.equal(resolveToolCategory('Charms'), 'charms');
  assert.equal(resolveToolCategory('Masters'), 'pets-masters');
  assert.equal(resolveToolCategory('UPDATED TOOLS'), null);
  assert.equal(resolveToolCategory('nonsense'), null);
  assert.equal(resolveToolCategory(undefined), null);
});

test('freshness badge dates come from the dataset manifest', () => {
  assert.deepEqual(toolFreshness('charms'), { iso: '2026-09-06', label: 'Sep 2026' });
  assert.deepEqual(toolFreshness('research'), { iso: '2026-09-03', label: 'Sep 2026' });
  assert.equal(toolFreshness('adventure-stall'), null);
  assert.equal(toolFreshness('charms', { 'charm-stats': { lastVerified: null } }), null);
});

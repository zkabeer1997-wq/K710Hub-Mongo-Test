import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import {
  checkRateLimit,
  isRateLimited,
  resetInMemoryRateLimits,
  setRateLimitCollectionProvider,
} from '../lib/rateLimit.mjs';
import { createFakeMongo } from './helpers/fakeMongo.mjs';

const tables = {};
const fake = createFakeMongo(tables);

beforeEach(() => {
  resetInMemoryRateLimits();
  for (const k of Object.keys(tables)) delete tables[k];
  setRateLimitCollectionProvider(() => fake.getCollection('rate_limits'));
});

test('shared limiter counts atomically in Mongo and trips after max', async () => {
  const opts = { windowMs: 60_000, max: 3 };
  const results = [];
  for (let i = 0; i < 5; i += 1) results.push(await checkRateLimit('t:1.1.1.1', opts));
  assert.deepEqual(results, [false, false, false, true, true]);
  assert.equal(tables.rate_limits.length, 1);
  assert.equal(tables.rate_limits[0].count, 5);
  assert.ok(tables.rate_limits[0].expires_at instanceof Date);
  // A different key has its own budget.
  assert.equal(await checkRateLimit('t:2.2.2.2', opts), false);
});

test('Mongo failure: strict callers fall back to the in-memory limiter, failOpen callers allow', async () => {
  setRateLimitCollectionProvider(async () => { throw new Error('mongo down'); });
  const strict = { windowMs: 60_000, max: 2 };
  assert.deepEqual(
    [await checkRateLimit('s', strict), await checkRateLimit('s', strict), await checkRateLimit('s', strict)],
    [false, false, true]
  );
  const open = { windowMs: 60_000, max: 1, failOpen: true };
  for (let i = 0; i < 5; i += 1) assert.equal(await checkRateLimit('o', open), false);
});

test('legacy synchronous isRateLimited still works', () => {
  const o = { windowMs: 1000, max: 1 };
  assert.equal(isRateLimited('legacy', o), false);
  assert.equal(isRateLimited('legacy', o), true);
});

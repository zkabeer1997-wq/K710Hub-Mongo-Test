import assert from 'node:assert/strict';
import { test } from 'node:test';
import { isSameOriginRequest, rejectCrossOriginMutation } from '../lib/sameOrigin.js';

const req = (method, headers = {}) => new Request('https://k710.example/api/x', { method, headers });

test('same-origin and non-browser requests pass', () => {
  assert.equal(isSameOriginRequest(req('POST', { origin: 'https://k710.example', host: 'k710.example' })), true);
  assert.equal(isSameOriginRequest(req('POST', { host: 'k710.example' })), true); // curl / server-to-server
  assert.equal(isSameOriginRequest(req('POST', { 'sec-fetch-site': 'same-origin', origin: 'https://k710.example', host: 'k710.example' })), true);
  assert.equal(isSameOriginRequest(req('POST', { origin: 'https://k710.example', 'x-forwarded-host': 'k710.example', host: 'internal:3000' })), true);
  assert.equal(isSameOriginRequest({ method: 'POST' }), true); // header-less test doubles
});

test('cross-origin browser requests are rejected', () => {
  assert.equal(isSameOriginRequest(req('POST', { origin: 'https://evil.example', host: 'k710.example' })), false);
  assert.equal(isSameOriginRequest(req('POST', { origin: 'null', host: 'k710.example' })), false);
  assert.equal(isSameOriginRequest(req('POST', { origin: 'not a url', host: 'k710.example' })), false);
  assert.equal(isSameOriginRequest(req('POST', { 'sec-fetch-site': 'cross-site', host: 'k710.example' })), false);
  assert.equal(isSameOriginRequest(req('POST', { 'sec-fetch-site': 'same-site', host: 'k710.example' })), false);
});

test('guard only blocks mutating methods and exempts cron', async () => {
  const evil = { origin: 'https://evil.example', host: 'k710.example' };
  assert.equal(rejectCrossOriginMutation(req('GET', evil), '/api/x'), null);
  const res = rejectCrossOriginMutation(req('POST', evil), '/api/x');
  assert.equal(res.status, 403);
  assert.match((await res.json()).error, /Cross-origin/);
  for (const m of ['PUT', 'PATCH', 'DELETE']) assert.equal(rejectCrossOriginMutation(req(m, evil), '/api/x').status, 403);
  assert.equal(rejectCrossOriginMutation(req('POST', evil), '/api/cron/gift-codes'), null);
  assert.equal(rejectCrossOriginMutation(req('POST', { origin: 'https://k710.example', host: 'k710.example' }), '/api/x'), null);
});

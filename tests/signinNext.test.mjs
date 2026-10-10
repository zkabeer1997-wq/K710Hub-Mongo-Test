import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  MEMBER_ROUTE_PREFIXES,
  isSafeNext,
  nextPageKey,
  routeNeedsSignIn,
  safeNextPath,
} from '../lib/signinNext.mjs';

test('safe next accepts ordinary same-origin paths', () => {
  for (const next of ['/forms', '/forms?tab=2', '/tools/cost#top', '/dashboard/form/kvk', '/power-profile', '/a%20b']) {
    assert.equal(isSafeNext(next), true, next);
    assert.equal(safeNextPath(next), next);
  }
});

test('safe next rejects open-redirect shapes', () => {
  const bad = [
    '', undefined, null, 42, {},
    '//evil.com', '//evil.com/forms', '///evil.com',
    '/\\evil.com', '\\\\evil.com', '/\\/evil.com', '/forms\\..\\evil',
    'https://evil.com', 'http://evil.com/forms', 'javascript:alert(1)', 'JaVaScRiPt:alert(1)', 'data:text/html,hi',
    'forms', 'evil.com',
    '/\t/evil.com', '/\n/evil.com', '/ /evil.com', '/\r/evil.com', '/\u0000/evil.com',
    '/%2f%2fevil.com', '/%5Cevil.com', '/%5cevil.com', '/%255Cevil.com', '/%252f%252fevil.com',
    '/%09/evil.com', '/%0a/evil.com', '/%E0%A4%A',
    `/${'a'.repeat(3000)}`,
  ];
  for (const next of bad) {
    assert.equal(isSafeNext(next), false, String(next));
    assert.equal(safeNextPath(next), '');
  }
});

test('next pages map to friendly catalog keys and never expose the raw path', () => {
  assert.equal(nextPageKey('/forms'), 'signin.next.forms');
  assert.equal(nextPageKey('/forms/kvk-prep?x=1'), 'signin.next.forms');
  assert.equal(nextPageKey('/power-profile'), 'signin.next.powerProfile');
  assert.equal(nextPageKey('/tools/cost-planner'), 'signin.next.tools');
  assert.equal(nextPageKey('/events'), 'signin.next.events');
  assert.equal(nextPageKey('/prep-phase-backpack'), 'signin.next.prep');
  assert.equal(nextPageKey('/flamedragon'), 'signin.next.flamedragon');
  assert.equal(nextPageKey('/dashboard/form/availability'), 'signin.next.kvkAvailability');
  assert.equal(nextPageKey('/formsx'), 'signin.next.other');
  assert.equal(nextPageKey('/admin/dashboard'), 'signin.next.other');
  assert.equal(nextPageKey('/something-else?x=/forms'), 'signin.next.other');
  assert.equal(nextPageKey(''), 'signin.next.other');
});

test('every banner key exists in the English catalog with a note', () => {
  const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8'));
  for (const key of ['forms', 'powerProfile', 'tools', 'events', 'prep', 'flamedragon', 'kvkAvailability', 'other']) {
    const entry = en[`signin.next.${key}`];
    assert.ok(entry?.text && entry.note, key);
    assert.ok(!entry.text.includes('/'), `${key} must not show a path`);
  }
});

test('member route list stays in sync with proxy.js', () => {
  const proxy = readFileSync(new URL('../proxy.js', import.meta.url), 'utf8');
  const block = /const MEMBER_PREFIXES = \[([\s\S]*?)\];/.exec(proxy)[1];
  const fromProxy = [...block.matchAll(/'([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...MEMBER_ROUTE_PREFIXES].sort(), fromProxy.sort());
});

test('routeNeedsSignIn follows the member prefixes only', () => {
  for (const href of ['/tools', '/tools/cost', '/power-profile', '/forms', '/forms/x?y=1', '/flamedragon', '/prep-phase-backpack']) {
    assert.equal(routeNeedsSignIn(href), true, href);
  }
  for (const href of ['/events', '/guides', '/help', '/', '/toolsx', '/dashboard', '/interest']) {
    assert.equal(routeNeedsSignIn(href), false, href);
  }
});

import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventBlurb } from '../lib/eventBlurb.mjs';

test('eventBlurb passes through an existing event.description', () => {
  const event = { title: 'Castle Battle', kind: 'custom', description: 'Alliance PvP event. Prep: fill your march queues.' };
  assert.equal(eventBlurb(event), 'Alliance PvP event. Prep: fill your march queues.');
});

test('eventBlurb collapses whitespace/newlines in a description', () => {
  const event = { title: 'Castle Battle', kind: 'custom', description: '  Alliance PvP\n  event.  ' };
  assert.equal(eventBlurb(event), 'Alliance PvP event.');
});

test('eventBlurb derives a line for a known kind when no description is set', () => {
  const event = { title: 'KvK Season 3', kind: 'kvk' };
  const blurb = eventBlurb(event);
  assert.match(blurb, /Kingdom vs Kingdom/);
  assert.match(blurb, /Prep:/);
});

test('eventBlurb falls back to a neutral, title-based line for an unknown kind', () => {
  const event = { title: 'Mystery Festival', kind: 'some-future-kind' };
  assert.equal(eventBlurb(event), 'Mystery Festival — kingdom event. Check the event details for prep guidance.');
});

test('eventBlurb falls back cleanly with no title at all', () => {
  const event = { kind: 'unknown-kind' };
  assert.equal(eventBlurb(event), 'This event — kingdom event. Check the event details for prep guidance.');
});

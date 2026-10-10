import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  LORE_BODY_MAX, LORE_TITLE_MAX, checkLoreImage, fitWithin, loreExcerpt, loreFirstSentence, loreImageUrl, loreNeighbours, loreSlug,
  nextStoryNumber, normalizeLoreBody, parseLoreSlug, publicStory, releaseLoreImage, sortStories, splitLoreParagraphs, validateLoreInput,
} from '../lib/lore.mjs';
import { SITE_FOLDERS } from '../lib/driveFolders.mjs';
import { PUBLIC_SITE_FOLDERS } from '../lib/siteImages.mjs';
import { INDEXES, COLLECTIONS } from '../lib/mongoCollections.js';
import { NOT_LOCAL_FLAG, STORIES, assertSafeTarget, isLocalMongoUri, seedLore } from '../scripts/seed-lore.mjs';

const ID = '123e4567-e89b-42d3-a456-426614174000';
const OTHER_ID = '223e4567-e89b-42d3-a456-426614174000';

test('slug round trip and strict slug parsing', () => {
  assert.equal(loreSlug(7), 'story-7');
  assert.equal(parseLoreSlug('story-7'), 7);
  for (const bad of ['story-0', 'story-01', 'story-', 'story-10000', 'Story-1', 'story-1/', 'story-1.5', '', null, undefined, '../story-1']) assert.equal(parseLoreSlug(bad), null, String(bad));
});

test('the Lore photo folder is registered and public', () => {
  assert.equal(SITE_FOLDERS.lore, 'Lore images');
  assert.ok(PUBLIC_SITE_FOLDERS.includes('lore'));
  assert.equal(COLLECTIONS.LORE_STORIES, 'lore_stories');
  assert.ok(INDEXES.lore_stories.some((i) => i.options.unique && i.keys.number === 1));
});

test('body keeps line breaks, drops trailing spaces and extra blank lines, stays plain text', () => {
  const text = normalizeLoreBody('  She: "Hi"  \r\nHe: "Yo"\r\n\r\n\r\n\r\nNext paragraph \n');
  assert.equal(text, 'She: "Hi"\nHe: "Yo"\n\nNext paragraph');
  assert.deepEqual(splitLoreParagraphs(text), ['She: "Hi"\nHe: "Yo"', 'Next paragraph']);
  // markup is never interpreted: it stays characters (React escapes it when rendering)
  assert.equal(normalizeLoreBody('<script>alert(1)</script>'), '<script>alert(1)</script>');
  assert.equal(normalizeLoreBody('a\u0000b'), 'ab');
  assert.deepEqual(splitLoreParagraphs(''), []);
});

test('first sentence and excerpt', () => {
  assert.equal(loreFirstSentence('I\'m from the Badlands of 716. I left.'), 'I\'m from the Badlands of 716.');
  assert.equal(loreFirstSentence('No full stop here'), 'No full stop here');
  assert.equal(loreFirstSentence('A'.repeat(300), 50).length <= 50, true);
  const ex = loreExcerpt('word '.repeat(100), 60);
  assert.ok(ex.length <= 60 && ex.endsWith('…'));
  assert.equal(loreExcerpt('short', 60), 'short');
});

test('stories read oldest first and numbers are suggested after the highest', () => {
  const list = [{ number: 3 }, { number: 1 }, { number: 10 }, { number: 2 }];
  assert.deepEqual(sortStories(list).map((s) => s.number), [1, 2, 3, 10]);
  assert.equal(nextStoryNumber(list), 11);
  assert.equal(nextStoryNumber([]), 1);
  assert.equal(nextStoryNumber([{ number: 9999 }]), 9999);
  const { prev, next } = loreNeighbours(list, 3);
  assert.equal(prev.number, 2);
  assert.equal(next.number, 10);
  assert.deepEqual(loreNeighbours(list, 1), { prev: null, next: { number: 2 } });
  assert.deepEqual(loreNeighbours(list, 42), { prev: null, next: null });
});

test('resize keeps the aspect ratio and never enlarges', () => {
  assert.deepEqual(fitWithin(4000, 3000), { width: 1400, height: 1050 });
  assert.deepEqual(fitWithin(3000, 4000), { width: 1050, height: 1400 });
  assert.deepEqual(fitWithin(800, 600), { width: 800, height: 600 });
  assert.deepEqual(fitWithin(1000, 1000, 500), { width: 500, height: 500 });
});

test('validation: number, title, text, lengths', () => {
  const ok = validateLoreInput({ number: 3, title: '  Hello   world ', body: 'Text', published: true });
  assert.deepEqual(ok.value, { number: 3, title: 'Hello world', body: 'Text', published: true });
  assert.equal(validateLoreInput({ number: '12', title: 'T', body: 'B' }).value.number, 12);
  for (const number of [0, -1, 10000, 1.5, 'abc', '', null, undefined]) assert.ok(validateLoreInput({ number, title: 'T', body: 'B' }).error, String(number));
  assert.ok(validateLoreInput({ number: 1, title: '   ', body: 'B' }).error);
  assert.ok(validateLoreInput({ number: 1, title: 'x'.repeat(LORE_TITLE_MAX + 1), body: 'B' }).error);
  assert.ok(validateLoreInput({ number: 1, title: 'x'.repeat(LORE_TITLE_MAX), body: 'B' }).value);
  assert.ok(validateLoreInput({ number: 1, title: 'T', body: '  \n ' }).error);
  assert.ok(validateLoreInput({ number: 1, title: 'T', body: 'x'.repeat(LORE_BODY_MAX + 1) }).error);
  assert.ok(validateLoreInput({ number: 1, title: 'T', body: 'x'.repeat(LORE_BODY_MAX) }).value);
  assert.ok(validateLoreInput({ number: 1, title: 'T', body: 'B', published: 'yes' }).error);
  assert.equal(validateLoreInput({ number: 1, title: 'T', body: 'B' }).value.published, true);
  assert.equal(validateLoreInput({ number: 1, title: 'T', body: 'B', published: false }).value.published, false);
  assert.ok(validateLoreInput(null).error);
  assert.ok(validateLoreInput({ number: 1, title: 42, body: 'B' }).error);
});

test('validation: photo fields are only returned when sent; blank description defaults to the title', () => {
  const none = validateLoreInput({ number: 1, title: 'T', body: 'B' }).value;
  assert.ok(!('image_id' in none) && !('image_alt' in none));
  const withPhoto = validateLoreInput({ number: 1, title: 'My title', body: 'B', image_id: ID, image_alt: '  ' }).value;
  assert.equal(withPhoto.image_id, ID);
  assert.equal(withPhoto.image_alt, 'My title');
  assert.equal(validateLoreInput({ number: 1, title: 'T', body: 'B', image_id: ID, image_alt: 'A dog' }).value.image_alt, 'A dog');
  const cleared = validateLoreInput({ number: 1, title: 'T', body: 'B', image_id: '', image_alt: 'stale' }).value;
  assert.equal(cleared.image_id, '');
  assert.equal(cleared.image_alt, '');
  assert.ok(validateLoreInput({ number: 1, title: 'T', body: 'B', image_id: '../etc/passwd' }).error);
  assert.ok(validateLoreInput({ number: 1, title: 'T', body: 'B', image_id: 5 }).error);
  assert.ok(validateLoreInput({ number: 1, title: 'T', body: 'B', image_id: ID, image_alt: 'x'.repeat(241) }).error);
});

test('photo url goes through the site-image proxy without the placeholder fallback', () => {
  assert.equal(loreImageUrl(ID), `/api/site-image/${ID}?fallback=none`);
  assert.equal(loreImageUrl(''), '');
  assert.equal(loreImageUrl('nope'), '');
  assert.equal(loreImageUrl(undefined), '');
});

test('publicStory exposes only what visitors need', () => {
  const story = publicStory({ _id: 'x', number: 2, title: 'T', body: 'B', image_id: ID, image_alt: '', image_width: 1400, image_height: 933, published: true, created_at: 1 });
  assert.deepEqual(story, {
    number: 2, slug: 'story-2', title: 'T', body: 'B', updated_at: null,
    image: { url: `/api/site-image/${ID}?fallback=none`, alt: 'T', width: 1400, height: 933 },
  });
  assert.equal(publicStory({ number: 2, title: 'T', body: 'B' }).image, null);
  assert.equal(publicStory(null), null);
});

test('checkLoreImage accepts only the lore folder', async () => {
  const images = { findOne: async ({ _id }) => ({ ok: { _id, folder: 'lore', width: 10, height: 5 }, wrong: { _id, folder: 'alliance' } }[_id] || null) };
  assert.equal((await checkLoreImage(images, 'ok')).state, 'ok');
  assert.equal((await checkLoreImage(images, 'ok')).doc.width, 10);
  assert.equal((await checkLoreImage(images, 'wrong')).state, 'wrong-folder');
  assert.equal((await checkLoreImage(images, 'gone')).state, 'missing');
  assert.equal((await checkLoreImage(images, '')).state, 'missing');
});

test('releaseLoreImage deletes only when no other story uses the photo, and never throws', async () => {
  const removed = [];
  const removeImage = async (id) => { removed.push(id); return true; };
  assert.equal(await releaseLoreImage({ stories: { findOne: async () => ({ number: 2 }) }, imageId: ID, removeImage }), false);
  assert.deepEqual(removed, []);
  assert.equal(await releaseLoreImage({ stories: { findOne: async () => null }, imageId: ID, removeImage }), true);
  assert.deepEqual(removed, [ID]);
  assert.equal(await releaseLoreImage({ stories: { findOne: async () => null }, imageId: 'bad', removeImage }), false);
  assert.equal(await releaseLoreImage({ stories: { findOne: async () => null }, imageId: '', removeImage }), false);
  const quiet = console.error; console.error = () => {};
  try { assert.equal(await releaseLoreImage({ stories: { findOne: async () => null }, imageId: OTHER_ID, removeImage: async () => { throw new Error('drive down'); } }), false); }
  finally { console.error = quiet; }
});

test('seed: ten stories, numbered 1..10, valid, no hashtags or handles, verbatim line breaks kept', () => {
  assert.deepEqual(STORIES.map((s) => s.number), [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  for (const s of STORIES) {
    const { value, error } = validateLoreInput({ number: s.number, title: s.title, body: s.body });
    assert.ok(!error, `${s.number}: ${error}`);
    assert.equal(value.body, s.body, `story ${s.number} body must already be in normal form`);
    assert.ok(!/(^|\s)[#@]\w/.test(s.body), `story ${s.number} has a tag`);
  }
  assert.ok(STORIES[6].body.includes('She: "Ah, yes! Very Korean!"\nHe: "Why do you eat fries'));
  assert.equal(splitLoreParagraphs(STORIES[9].body).length, 9);
  assert.equal(STORIES[2].title, 'Looked for Mithril, but found ...');
});

test('seed refuses non-local databases unless explicitly allowed', () => {
  assert.equal(isLocalMongoUri('mongodb://127.0.0.1:27017'), true);
  assert.equal(isLocalMongoUri('mongodb://localhost/k710'), true);
  assert.equal(isLocalMongoUri('mongodb://user:pw@127.0.0.1:27017/?x=1'), true);
  assert.equal(isLocalMongoUri('mongodb+srv://u:p@cluster0.example.mongodb.net/db'), false);
  assert.equal(isLocalMongoUri('mongodb://u:p@cluster0.example.mongodb.net:27017/db'), false);
  assert.equal(isLocalMongoUri('mongodb://127.0.0.1@evil.example.com/db'), false);
  assert.equal(isLocalMongoUri(''), false);
  assert.throws(() => assertSafeTarget('mongodb+srv://u:p@x.mongodb.net/db', []), /Refusing/);
  assert.throws(() => assertSafeTarget('', []), /not set/);
  assert.doesNotThrow(() => assertSafeTarget('mongodb://127.0.0.1:27017', []));
  assert.doesNotThrow(() => assertSafeTarget('mongodb+srv://u:p@x.mongodb.net/db', [NOT_LOCAL_FLAG]));
});

test('seed is idempotent and leaves edited stories and photos alone', async () => {
  const docs = new Map();
  const coll = {
    createIndex: async () => {},
    updateOne: async ({ number }, update, { upsert }) => {
      const existing = docs.get(number);
      if (existing) { if (update.$set) Object.assign(existing, update.$set); return { upsertedCount: 0 }; }
      if (!upsert) return { upsertedCount: 0 };
      docs.set(number, { ...(update.$setOnInsert || {}), ...(update.$set || {}) });
      return { upsertedCount: 1 };
    },
  };
  assert.deepEqual(await seedLore({ coll }), { inserted: 10, updated: 0, kept: 0 });
  docs.get(4).title = 'Edited in admin';
  docs.get(4).image_id = ID;
  assert.deepEqual(await seedLore({ coll }), { inserted: 0, updated: 0, kept: 10 });
  assert.equal(docs.get(4).title, 'Edited in admin');
  assert.deepEqual(await seedLore({ coll, overwrite: true }), { inserted: 0, updated: 10, kept: 0 });
  assert.equal(docs.get(4).title, 'CR7 or not to be?');
  assert.equal(docs.get(4).image_id, ID);
  assert.equal(docs.size, 10);
});

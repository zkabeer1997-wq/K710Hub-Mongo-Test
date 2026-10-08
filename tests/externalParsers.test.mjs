import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { parseTimelineResponse, describeMilestone, humanizeSlug, slugifyTitle } from '../lib/external/timelineParse.mjs';
import { parseKingdomResponse, parseMatchupsResponse } from '../lib/external/rankingsParse.mjs';
import { parseAtlasPage } from '../lib/external/atlasParse.mjs';
import { parseRobots, isAllowed } from '../lib/external/robots.mjs';
import { cleanText, isoDate, safeUrl, toInt, toNum } from '../lib/external/sanitize.mjs';
import { fixture, fixtureJson } from './helpers/externalFakes.mjs';

describe('timeline parser (saved real response)', () => {
  const t = parseTimelineResponse(fixtureJson('optimizer-timeline-710.json'));
  it('reads kingdom, open date and sorted milestones', () => {
    assert.equal(t.kingdom, 710);
    assert.equal(t.createdDate, '2025-07-26');
    assert.ok(t.milestones.length >= 40);
    assert.deepEqual(t.milestones[0], { slug: 'gen1-heroes', date: '2025-07-26' });
    const dates = t.milestones.map((m) => m.date);
    assert.deepEqual([...dates].sort(), dates);
  });
  it('maps known slugs to our hand-written titles, categories and notes', () => {
    const d = describeMilestone('gen2-heroes');
    assert.equal(d.title, 'Generation 2 Heroes');
    assert.equal(d.category, 'Heroes');
    assert.match(d.notes, /Zoe/);
    assert.equal(describeMilestone('first-sanctuary-battle').title, 'First Sanctuary Competition');
    assert.equal(describeMilestone('first-flamedragon-tyrant-battle').category, 'PvP');
    for (const m of t.milestones) assert.ok(describeMilestone(m.slug).title.length > 0);
  });
  it('humanizes unknown slugs instead of failing', () => {
    assert.equal(humanizeSlug('gen10-heroes'), 'Generation 10 Heroes');
    const d = describeMilestone('first-kvk-castle-battle-2');
    assert.equal(d.category, 'PvP');
    assert.equal(describeMilestone('7th-and-8th-masters-unlocked').title, '7th and 8th Masters Unlocked');
    assert.equal(slugifyTitle('Generation 3 Pets'), 'gen3-pets');
  });
  it('drops garbage entries but keeps the valid ones', () => {
    const out = parseTimelineResponse({ success: true, result: { kingdomNumber: '710', createdDate: 'nope', unlocks: { 'gen1-heroes': '2025-07-26', '<script>': '2025-01-01', bad: '2025-13-40', ok: 5, 'x y': '2026-01-01', 'gen2-pets': '2026-02-30' } } });
    assert.deepEqual(out.milestones, [{ slug: 'gen1-heroes', date: '2025-07-26' }]);
    assert.equal(out.createdDate, null);
  });
  it('treats a changed shape as an error (caller keeps the snapshot)', () => {
    for (const bad of [null, [], {}, { success: false }, { result: {} }, { result: { unlocks: {} } }, { result: { unlocks: { a: 'x' } } }, 'html']) {
      assert.throws(() => parseTimelineResponse(bad), (e) => e.code === 'shape');
    }
  });
});

describe('kingdom + matchups parsers (saved real responses)', () => {
  const k = parseKingdomResponse(fixtureJson('optimizer-kingdom-710.json'));
  it('keeps the validated KvK history and latest ratings', () => {
    assert.equal(k.id, 710);
    assert.equal(k.history.length, 13);
    assert.deepEqual(k.history.at(-1), { kvk: 18, date: '2026-09-12', opponent: 652, prep: 'L', battle: 'L' });
    assert.equal(k.ratingTime.rank, 260);
    assert.equal(k.ratingStatic.rank, 183);
    assert.equal(k.ratingTime.rating, 1.6452);
  });
  it('rejects a missing or empty history, ignores junk rows', () => {
    assert.throws(() => parseKingdomResponse({ success: true, result: { id: '710' } }), (e) => e.code === 'shape');
    assert.throws(() => parseKingdomResponse({ success: true, result: { history: [{ kvk: 'x' }, null, 4] } }), (e) => e.code === 'shape');
    const ok = parseKingdomResponse({ success: true, result: { history: [{ kvk: 3, opponent: 5, battle: 'W', prep: 'draw' }, { kvk: 'a' }], rating_history_time: [{ kvk: 3, rating: 'abc', rank: -4 }] } });
    assert.equal(ok.history.length, 1);
    assert.equal(ok.history[0].prep, null);
    assert.equal(ok.ratingTime.rating, null);
    assert.equal(ok.ratingTime.rank, null);
  });
  it('reads matchup metadata', () => {
    const m = parseMatchupsResponse(fixtureJson('optimizer-matchups.json'));
    assert.equal(m.totalKingdoms, 2263);
    assert.equal(m.totalKvks, 18);
    assert.equal(m.kvkDates[18], '2026-09-12');
    assert.throws(() => parseMatchupsResponse({ success: true, result: { metadata: {} } }), (e) => e.code === 'shape');
    assert.throws(() => parseMatchupsResponse('x'), (e) => e.code === 'shape');
  });
});

describe('atlas page parser', () => {
  it('reports unavailable for the real client-rendered shell (no numbers in the HTML)', () => {
    const a = parseAtlasPage(fixture('atlas-kingdom-710.html'));
    assert.equal(a.available, false);
    assert.equal(a.rank, null);
  });
  it('picks numbers up if Atlas ever server-renders them, and ignores markup', () => {
    const html = `<html><head><title>K710</title></head><body>${'x'.repeat(200)}<div>Atlas Score <b>57.59</b></div><p>Rank #107 &mdash; S-Tier, Top 5.0%</p><script>rank 3</script></body></html>`;
    const a = parseAtlasPage(html);
    assert.deepEqual([a.available, a.score, a.rank, a.tier, a.topPercent], [true, 57.59, 107, 'S-Tier', '5.0%']);
  });
  it('rejects empty pages', () => {
    assert.throws(() => parseAtlasPage(''), (e) => e.code === 'shape');
  });
});

describe('sanitize + robots', () => {
  it('coerces untrusted values', () => {
    assert.equal(cleanText('<img src=x onerror=alert(1)>  hi\u0000there', 20), 'img src=x onerror=al');
    assert.equal(toInt('1,234'), 1234);
    assert.equal(toNum('abc'), null);
    assert.equal(toNum(Infinity), null);
    assert.equal(toInt(true), null);
    assert.equal(isoDate('2026-02-30'), null);
    assert.equal(isoDate('2026-10-08'), '2026-10-08');
    assert.equal(safeUrl('https://kingshotoptimizer.com/x', ['kingshotoptimizer.com']), 'https://kingshotoptimizer.com/x');
    assert.equal(safeUrl('http://kingshotoptimizer.com/x', ['kingshotoptimizer.com']), '');
    assert.equal(safeUrl('https://evil.com/', ['kingshotoptimizer.com']), '');
    assert.equal(safeUrl('javascript:alert(1)', ['kingshotoptimizer.com']), '');
  });
  const groups = parseRobots(`User-agent: *\nAllow: /\nDisallow: /api/\nAllow: /api/public$\n\nUser-agent: GPTBot\nDisallow: /\n`);
  it('applies longest-match rules and agent groups', () => {
    assert.equal(isAllowed(groups, '/kvk-rankings'), true);
    assert.equal(isAllowed(groups, '/api/x'), false);
    assert.equal(isAllowed(groups, '/api/public'), true);
    assert.equal(isAllowed(parseRobots('User-agent: K710Hub-KingdomSite\nDisallow: /\n'), '/a'), false);
    assert.equal(isAllowed([], '/a'), true);
  });
  it('matches the real robots.txt of both sites for the paths we use', () => {
    const opt = parseRobots('User-agent: ClaudeBot\nDisallow: /\n\nUser-agent: *\nContent-Signal: search=yes\nAllow: /\n');
    assert.equal(isAllowed(opt, '/api/kvk-rankings'), true);
    const atlas = parseRobots('User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin\n');
    assert.equal(isAllowed(atlas, '/kingdom/710'), true);
    assert.equal(isAllowed(atlas, '/api/kingdoms/710'), false);
  });
});

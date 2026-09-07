import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';
import { mintAdminToken } from '../lib/adminAuth.js';
import { ALLIANCE_EVENT_TYPES, validateAllianceEvents, currentAllianceEvents } from '../lib/allianceEvents.mjs';
import { validateBearTimes, huntsFromAlliances, nextHunt } from '../lib/bearHuntSchedule.js';

const state = {
  tables: {
    alliances: [{ tag: 'RED', name: 'RED', active: true, sort_order: 0, bear_times_utc: ['11:05', '19:00', '23:20'], leader_player_id: 'private-test-field', updated_at: '2026-09-03' }],
  },
  paths: [],
  failRead: false,
};
globalThis.__bearScheduleTest = state;
registerHooks({
  resolve(specifier, context, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(specifier)) return { url: 'test:bear-mongo', shortCircuit: true };
    if (specifier === 'next/cache') return { url: 'test:bear-cache', shortCircuit: true };
    if (specifier === 'next/server') return next('next/server.js', context);
    if (/\/(adminAuth|memberAuth|bearHuntSchedule|publicBearSchedule|publicAllianceEvents|revalidateAlliancePages|mongoCollections|ics)$/.test(specifier)) return next(`${specifier}.js`, context);
    return next(specifier, context);
  },
  load(url, context, next) {
    if (url === 'test:bear-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return {
        format: 'module',
        shortCircuit: true,
        source: `
          import { createFakeMongo } from ${JSON.stringify(helperUrl)};
          const base = createFakeMongo(globalThis.__bearScheduleTest.tables, { alliances: ['tag'] });
          export async function getCollection(name) {
            const coll = await base.getCollection(name);
            if (name === 'alliances') {
              const originalFind = coll.find.bind(coll);
              coll.find = (...args) => {
                if (globalThis.__bearScheduleTest.failRead) throw new Error('Database unavailable');
                return originalFind(...args);
              };
            }
            return coll;
          }
          export const ensureIndexes = base.ensureIndexes;
        `,
      };
    }
    if (url === 'test:bear-cache') return { format: 'module', shortCircuit: true, source: 'export const revalidatePath = path => globalThis.__bearScheduleTest.paths.push(path);' };
    return next(url, context);
  },
});
const { PUT, DELETE } = await import('../app/api/admin-alliances/[tag]/route.js');
const { POST } = await import('../app/api/admin-alliances/route.js');
const { GET: publicGet } = await import('../app/api/bear-schedule/route.js');
const { GET: allianceEventsGet } = await import('../app/api/alliance-events/route.js');
const { proxy, config: proxyConfig } = await import('../proxy.js');
const { GET: calendarGet } = await import('../app/api/events/bear-hunt.ics/route.js');
process.env.ADMIN_PASSWORD = 'bear-test-only';
const token = await mintAdminToken();
const request = (body, admin = true) => ({ cookies: { get: () => admin ? { value: token } : undefined }, json: async () => body });
const params = { params: Promise.resolve({ tag: 'RED' }) };
const snapshot = () => JSON.parse(JSON.stringify(state.tables.alliances));

test('times validate, deduplicate by rejection, and sort without mutating input', () => {
  const input = ['23:20', '00:00', '12:45'];
  assert.deepEqual(validateBearTimes(input).times, ['00:00', '12:45', '23:20']);
  assert.equal(input[0], '23:20');
  for (const value of [['24:00'], ['12:60'], ['1:00'], [''], ['10:00', '10:00'], '10:00', null]) assert.ok(validateBearTimes(value).error);
  assert.deepEqual(validateBearTimes([]).times, []);
});
test('admin authentication gates all alliance writes', async () => {
  const before = snapshot();
  assert.equal((await PUT(request({}, false), params)).status, 401);
  assert.equal((await POST(request({}, false))).status, 401);
  assert.equal((await DELETE(request({}, false), params)).status, 401);
  assert.deepEqual(snapshot(), before);
});
test('invalid times do not modify stored data', async () => {
  const before = snapshot();
  assert.equal((await PUT(request({ bear_times_utc: ['25:00'] }), params)).status, 400);
  assert.deepEqual(snapshot(), before);
});
test('save flows through public schedule, clock helpers, and calendar with no old times', async () => {
  const result = await PUT(request({ bear_times_utc: ['22:15', '03:40'] }), params);
  assert.equal(result.status, 200);
  const response = await publicGet();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { alliances } = await response.json();
  assert.deepEqual(alliances[0].bear_times_utc, ['03:40', '22:15']);
  assert.equal(alliances[0].leader_player_id, undefined);
  const hunts = huntsFromAlliances(alliances);
  assert.deepEqual(nextHunt(23 * 60, hunts), { band: 'RED', utc: '03:40', inMin: 280 });
  const ics = await (await calendarGet()).text();
  assert.match(ics, /034000Z/); assert.match(ics, /221500Z/);
  assert.doesNotMatch(ics, /11:05|19:00|23:20/);
  for (const path of ['/', '/about', '/alliances', '/alliances/red', '/events', '/chronometer', '/api/bear-schedule', '/api/events/bear-hunt.ics']) assert.ok(state.paths.includes(path), path);
});
test('partial alliance edits preserve saved times', async () => {
  await PUT(request({ language: 'English' }), params);
  assert.deepEqual(state.tables.alliances.find(a => a.tag === 'RED').bear_times_utc, ['03:40', '22:15']);
});
test('hidden alliances vanish from public data and downloads', async () => {
  await PUT(request({ active: false }), params);
  assert.deepEqual((await (await publicGet()).json()).alliances, []);
  assert.doesNotMatch(await (await calendarGet()).text(), /BEGIN:VEVENT/);
  await PUT(request({ active: true }), params);
});
test('removing all times is intentional and never restores hardcoded defaults', async () => {
  await PUT(request({ bear_times_utc: [] }), params);
  const { alliances } = await (await publicGet()).json();
  assert.deepEqual(huntsFromAlliances(alliances), []);
  assert.equal(nextHunt(100, []), null);
  assert.doesNotMatch(await (await calendarGet()).text(), /BEGIN:VEVENT/);
});
test('new alliances can publish their own hunt times', async () => {
  assert.equal((await POST(request({ tag: 'NEW', name: 'New alliance', bear_times_utc: ['14:10'], active: true }))).status, 200);
  assert.match(await (await calendarGet()).text(), /Bear Hunt — NEW/);
});
test('database failure returns unavailable instead of an outdated fallback', async () => {
  state.failRead = true;
  assert.equal((await publicGet()).status, 503);
  assert.equal((await calendarGet()).status, 503);
  state.failRead = false;
});
test('deletion removes that alliance from the shared schedule', async () => {
  await DELETE(request({}), params);
  const { alliances } = await (await publicGet()).json();
  assert.ok(alliances.every(alliance => alliance.tag !== 'RED'));
});

const newParams = { params: Promise.resolve({ tag: 'NEW' }) };
const eventDates = Object.keys(ALLIANCE_EVENT_TYPES).map((type, index) => ({ type, date: '2030-04-20', time_utc: `0${index}:15` }));
test('Events is public while admin and member forms remain gated', async () => {
  for (const path of ['/events', '/events/example']) {
    const url = new URL(`https://example.com${path}`);
    const response = await proxy({ url: url.href, nextUrl: url, cookies: { get: () => undefined } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('location'), null);
  }
  assert.ok(proxyConfig.matcher.every(path => !path.startsWith('/events')));
  for (const path of ['/admin/dashboard/alliances', '/tools', '/forms', '/player-record/form']) {
    const url = new URL(`https://example.com${path}`);
    const response = await proxy({ url: url.href, nextUrl: url, cookies: { get: () => undefined } });
    assert.equal(response.status, 307);
  }
});
test('all seven event types accept valid UTC dates; malformed and duplicate entries are rejected', () => {
  assert.equal(validateAllianceEvents(eventDates).events.length, 7);
  const valid = eventDates[0];
  for (const entries of [null, {}, [{ ...valid, type: 'unknown' }], [{ ...valid, type: 'toString' }], [{ ...valid, date: '2030-02-30' }], [{ ...valid, date: '' }], [{ ...valid, date: '2027-02-29' }], [{ ...valid, time_utc: '24:00' }], [{ ...valid, time_utc: '' }], [valid, valid], Array(101).fill(valid)]) assert.ok(validateAllianceEvents(entries).error);
  assert.ok(validateAllianceEvents([{ ...valid, date: '2028-02-29', time_utc: '00:00' }]).events);
  assert.equal(validateAllianceEvents([valid, { ...valid, date: '2030-04-21' }]).events.length, 2);
});
test('invalid or unauthorized event writes leave saved data unchanged', async () => {
  const before = snapshot();
  assert.equal((await PUT(request({ scheduled_events: eventDates }, false), newParams)).status, 401);
  assert.equal((await PUT(request({ scheduled_events: [{ ...eventDates[0], date: '2030-02-30' }] }), newParams)).status, 400);
  assert.equal((await POST(request({ tag: 'BAD', name: 'Bad', scheduled_events: [{ type: 'unknown' }] }))).status, 400);
  assert.deepEqual(snapshot(), before);
});
test('saving all event types makes dates and alliance labels public without private fields', async () => {
  assert.equal((await PUT(request({ scheduled_events: eventDates }), newParams)).status, 200);
  const response = await allianceEventsGet();
  assert.equal(response.headers.get('cache-control'), 'no-store');
  const { events } = await response.json();
  assert.equal(events.length, 7);
  assert.deepEqual(events.map(event => event.title), Object.values(ALLIANCE_EVENT_TYPES));
  assert.equal(events[0].starts_at, '2030-04-20T00:15:00.000Z');
  assert.equal(events[0].alliance_tag, 'NEW');
  assert.ok(events.every(event => event.leader_player_id === undefined));
  assert.ok(state.paths.includes('/api/alliance-events'));
});
test('editing event dates replaces old values and partial edits preserve schedules and Bear times', async () => {
  await PUT(request({ language: 'English' }), newParams);
  assert.equal((await (await allianceEventsGet()).json()).events.length, 7);
  const revised = [{ ...eventDates[0], date: '2030-05-01', time_utc: '23:59' }];
  await PUT(request({ scheduled_events: revised }), newParams);
  const { events } = await (await allianceEventsGet()).json();
  assert.equal(events.length, 1);
  assert.equal(events[0].starts_at, '2030-05-01T23:59:00.000Z');
  assert.deepEqual(state.tables.alliances.find(row => row.tag === 'NEW').bear_times_utc, ['14:10']);
});
test('hidden and removed alliance schedules disappear; clearing is persisted', async () => {
  await PUT(request({ active: false }), newParams);
  assert.deepEqual((await (await allianceEventsGet()).json()).events, []);
  await PUT(request({ active: true }), newParams);
  assert.equal((await (await allianceEventsGet()).json()).events.length, 1);
  await PUT(request({ scheduled_events: [] }), newParams);
  assert.deepEqual((await (await allianceEventsGet()).json()).events, []);
  await PUT(request({ scheduled_events: eventDates }), newParams);
  await DELETE(request({}), newParams);
  assert.deepEqual((await (await allianceEventsGet()).json()).events, []);
});
test('new alliance can save event dates on creation and database outages report errors', async () => {
  assert.equal((await POST(request({ tag: 'ADD', name: 'Added alliance', scheduled_events: eventDates }))).status, 200);
  assert.equal((await (await allianceEventsGet()).json()).events.length, 7);
  state.failRead = true;
  assert.equal((await allianceEventsGet()).status, 503);
  state.failRead = false;
});
test('public schedule keeps today and future UTC dates and retires older events at midnight', () => {
  const dates = ['2030-04-19', '2030-04-20', '2030-04-21'].map(date => ({ date }));
  assert.deepEqual(currentAllianceEvents(dates, Date.parse('2030-04-20T23:59:00Z')).map(event => event.date), ['2030-04-20', '2030-04-21']);
  assert.deepEqual(currentAllianceEvents(dates, Date.parse('2030-04-21T00:00:00Z')).map(event => event.date), ['2030-04-21']);
});

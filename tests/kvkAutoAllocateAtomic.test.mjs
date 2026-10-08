import assert from 'node:assert/strict';
import { test } from 'node:test';
import { registerHooks } from 'node:module';

const state = { tables: {} };
globalThis.__kvkAtomicTest = state;
registerHooks({
  resolve(s, c, next) {
    if (/\/(lib\/)?mongo(\.js)?$/.test(s)) return { url: 'test:atomic-mongo', shortCircuit: true };
    if (/\/(mongoCollections|formGates\.server|deadlines\.mjs|kvkAppointments\.mjs)$/.test(s) && !/\.m?js$/.test(s)) return next(s + '.js', c);
    return next(s, c);
  },
  load(u, c, next) {
    if (u === 'test:atomic-mongo') {
      const helperUrl = new URL('./helpers/fakeMongo.mjs', import.meta.url).href;
      return { format: 'module', shortCircuit: true, source: `import {createFakeMongo} from ${JSON.stringify(helperUrl)}; export const {getCollection,ensureIndexes}=createFakeMongo(globalThis.__kvkAtomicTest.tables);` };
    }
    return next(u, c);
  },
});

const { replaceAutoAssignments } = await import('../lib/kvkAppointments.server.js');
const { createFakeMongo } = await import('./helpers/fakeMongo.mjs');

const F = { cycle_id: 'c1', day: 1, buff: 'construction' };
let seq = 0;
const row = (member_id, slot, manual = false) => ({ _id: `r${seq += 1}`, ...F, member_id, slot, manual, name: member_id });
const slots = (coll) => Object.fromEntries(state.tables.asg.map((r) => [r.slot, r.member_id]).sort());

test('swapping members between slots works without ever emptying the schedule', async () => {
  state.tables.asg = [row('a', '05:00'), row('b', '05:30'), row('m', '06:00', true), row('old', '07:00')];
  const coll = await createFakeMongo(state.tables).getCollection('asg');
  await replaceAutoAssignments(coll, F, [
    { member_id: 'b', slot: '05:00', score: 2 },
    { member_id: 'a', slot: '05:30', score: 1 },
    { member_id: 'c', slot: '08:00', score: 1 },
  ]);
  assert.deepEqual(slots(), { '05:00': 'b', '05:30': 'a', '06:00': 'm', '08:00': 'c' }); // manual kept, stale 07:00 removed
  assert.equal(state.tables.asg.filter((r) => r.manual).length, 1);
});

test('a failing bulk write leaves the previous schedule intact', async () => {
  state.tables.asg = [row('a', '05:00'), row('b', '05:30'), row('old', '07:00')];
  const before = JSON.stringify(state.tables.asg.map((r) => [r.member_id, r.slot]).sort());
  const coll = await createFakeMongo(state.tables).getCollection('asg');
  const failing = Object.create(coll);
  failing.bulkWrite = async () => { throw new Error('write failed'); };
  failing.find = coll.find.bind(coll);
  failing.deleteMany = coll.deleteMany.bind(coll);
  failing.insertMany = coll.insertMany.bind(coll);
  await assert.rejects(() => replaceAutoAssignments(failing, F, [
    { member_id: 'b', slot: '05:00' }, { member_id: 'a', slot: '05:30' },
  ]), /write failed/);
  assert.equal(JSON.stringify(state.tables.asg.map((r) => [r.member_id, r.slot]).sort()), before);
});

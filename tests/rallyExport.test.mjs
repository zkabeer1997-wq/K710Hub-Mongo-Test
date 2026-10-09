import assert from 'node:assert/strict';
import test from 'node:test';
import { createNextRally, setRallyField } from '../app/admin/dashboard/rallyState.mjs';
import {
  COLUMN_WIDTHS, buildRallyWorkbook, ordinal, sheetNames, timeFill, timeLabel, troopCell,
} from '../lib/rallyExport.mjs';
import { buildStyledXlsx, columnName } from '../lib/styledXlsx.mjs';

const KVK_FULL = 'Full battle (12-17 UTC)';
const KVK_FIRST = 'First half (12-14:30 UTC)';
const KVK_SECOND = 'Second half (14:30-17 UTC)';

function member(id, name, availability, extra = {}) {
  return {
    member_id: id, name, availability, current_alliance: '710',
    infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'Below TG5', archer_tier: '', archer_tg: 'TG7',
    ...extra,
  };
}

test('sheet names and ordinals', () => {
  assert.equal(ordinal(1), '1st'); assert.equal(ordinal(2), '2nd'); assert.equal(ordinal(11), '11th');
  assert.equal(ordinal(14), '14th'); assert.equal(ordinal(22), '22nd');
  assert.deepEqual(sheetNames('kvk', 14), { participants: 'Participants (14th KvK)', rallies: 'Rally Teams (14th KvK)' });
  const fd = sheetNames('flamedragon', 7);
  assert.equal(fd.rallies, 'Rally Teams (Flamedragon S7)');
  assert.ok(fd.participants.length <= 31);
});

test('time labels and colours follow the availability answer', () => {
  assert.equal(timeLabel(KVK_FULL), 'Full battle');
  assert.equal(timeLabel(KVK_FIRST), '12:00-14:30');
  assert.equal(timeLabel(KVK_SECOND), '14:30-17:00');
  assert.equal(timeLabel('Not Available'), 'Not Available');
  assert.equal(timeLabel('12-18 UTC (Full Battle)'), 'Full battle');
  assert.equal(timeLabel('12-15 UTC (First Half)'), '12:00-15:00');
  assert.equal(timeLabel('Intermittent'), 'Intermittent');
  assert.equal(timeFill(KVK_FULL), '#CCCCCC');
  assert.equal(timeFill(KVK_FIRST), '#FFF2CC');
  assert.equal(timeFill(KVK_SECOND), '#C9DAF8');
  assert.equal(timeFill('Not Available'), '#FF00FF');
  assert.equal(timeFill('Intermittent'), '#FF00FF');
});

test('troop cells', () => {
  assert.equal(troopCell('T11', 'TG8'), 'T11 / TG8');
  assert.equal(troopCell('T10', 'Below TG5'), 'T10 / Below TG5');
  assert.equal(troopCell('', 'TG7'), 'TG7');
  assert.equal(troopCell('', ''), '');
});

const rows = [
  member('1', 'Aizen', KVK_FULL), member('2', 'Bear', KVK_FIRST), member('3', 'Cara', KVK_SECOND, { current_alliance: 'RED' }),
  member('4', 'Dax', 'Not Available'), member('5', 'Eve', KVK_FULL, { current_alliance: 'SKY' }), member('6', 'Danko', KVK_FULL),
];
let rallies = createNextRally(createNextRally(createNextRally(createNextRally([], 'a', 'optional'), 'b', 'garrison'), 'c', 'attack'), 'd', 'attack');
rallies = rallies.map((r) => (r.id === 'c' ? { ...r, name: 'Danko', memberIds: ['1', '2', '3', '4'], managerName: 'Zain', notes: 'Reinforce & Pass Castle\nFill late first' } : r));
for (let i = 7; i <= 18; i += 1) rows.push(member(String(i), `Filler ${i}`, KVK_FULL));
rallies = rallies.map((r) => (r.id === 'd' ? { ...r, name: 'Second', memberIds: Array.from({ length: 12 }, (_, i) => String(i + 7)) } : r));
rallies = setRallyField(rallies, 'a', 'rallyType', 'optional');

const [participants, teams] = buildRallyWorkbook({ eventType: 'kvk', cycleNumber: 14, rallies, rows });

test('Participants tab lists every row, sorted by alliance then name, with the rally name', () => {
  assert.equal(participants.name, 'Participants (14th KvK)');
  assert.deepEqual(participants.rows[0].map((c) => c.v), ['Name', 'Player ID', 'Alliance', 'Inf', 'Cav', 'Arc', 'Time', 'Rally']);
  assert.equal(participants.frozenRows, 1);
  assert.equal(participants.rows[0][0].bg, '#FFFF00');
  const names = participants.rows.slice(1).map((r) => r[0].v);
  assert.deepEqual(names.slice(0, 4), ['Aizen', 'Bear', 'Danko', 'Dax'], '710 first, alphabetical');
  assert.deepEqual(names.slice(-2), ['Cara', 'Eve'], 'then RED, then SKY');
  const dax = participants.rows.slice(1).find((r) => r[0].v === 'Dax');
  assert.equal(dax[7].v, 'Danko', 'Dax is on Danko');
  assert.equal(dax[6].bg, '#FF00FF');
  const eve = participants.rows.slice(1).find((r) => r[0].v === 'Eve');
  assert.equal(eve[7].v, '', 'unassigned stays blank');
});

test('Rally Teams: three blocks of 7 columns, widths repeat, attack before garrison before optional', () => {
  assert.equal(teams.name, 'Rally Teams (14th KvK)');
  assert.equal(teams.widths.length, 21);
  assert.deepEqual(teams.widths.slice(0, 7), COLUMN_WIDTHS);
  assert.deepEqual(teams.widths.slice(14), COLUMN_WIDTHS);
  const names = [0, 7, 14].map((c) => teams.rows[0][c].v);
  assert.deepEqual(names, ['Danko', 'Second', 'Rally 2']);
  assert.equal(teams.rows[0][0].bg, '#FF0000');
  assert.equal(teams.rows[0][0].size, 12);
  assert.equal(teams.rows[1][0].v, 'Manager : Zain');
  assert.equal(teams.rows[1][7].v, ' Manager :  ');
  assert.deepEqual(teams.rows[2].slice(0, 7).map((c) => c.v), ['', 'Inf', 'Cav', 'Arc', 'Ali', 'Name', 'T i m e']);
  assert.ok(teams.rows[2].slice(0, 7).every((c) => c.bg === '#FFFF00' && c.bold));
});

test('Rally Teams: joiner rows are filled by time window and empty slots stay white', () => {
  const first = teams.rows[3];
  assert.deepEqual(first.slice(0, 7).map((c) => c.v), [1, 'T11 / TG8', 'T10 / Below TG5', 'TG7', '710', 'Aizen', 'Full battle']);
  assert.ok(first.slice(0, 7).every((c) => c.bg === '#CCCCCC'), 'whole row incl. slot number is grey');
  assert.equal(first[0].size, 8); assert.equal(first[1].size, 7); assert.equal(first[1].font, 'Arial');
  assert.equal(teams.rows[4][6].v, '12:00-14:30'); assert.equal(teams.rows[4][0].bg, '#FFF2CC');
  assert.equal(teams.rows[5][6].v, '14:30-17:00'); assert.equal(teams.rows[5][0].bg, '#C9DAF8');
  assert.equal(teams.rows[6][6].bg, '#FF00FF');
  const empty = teams.rows[7];
  assert.equal(empty[0].v, 5); assert.equal(empty[0].bg, undefined); assert.equal(empty[1], '');
});

test('slots are not capped at 10 and a band is as tall as its longest rally; notes sit under the block', () => {
  // Second rally has 12 joiners: slots 1..12; Danko has 10 slots + 2 note lines.
  assert.equal(teams.rows[3 + 11][7].v, 12);
  const danko = teams.rows.map((r) => r[0]);
  const lastSlotRow = 3 + 9;
  assert.equal(danko[lastSlotRow].v, 10);
  assert.equal(danko[lastSlotRow + 1].v, 'Reinforce & Pass Castle');
  assert.equal(danko[lastSlotRow + 2].v, 'Fill late first');
  assert.equal(danko[lastSlotRow + 1].bg, undefined);
  assert.ok(teams.merges.some(([r1, c1, r2, c2]) => r1 === lastSlotRow + 1 && c1 === 0 && r2 === lastSlotRow + 1 && c2 === 6), 'note row merged across the block');
  assert.deepEqual(teams.rows[15], [], 'band 1 is 3 + 12 rows, then one blank row');
  assert.equal(teams.rows.length, 15 + 1 + 13, 'band 2 holds the optional rally: 3 + 10 rows');
});

test('name and manager rows are merged across each block', () => {
  for (const col of [0, 7, 14]) {
    assert.ok(teams.merges.some(([r1, c1, r2, c2]) => r1 === 0 && c1 === col && r2 === 0 && c2 === col + 6));
    assert.ok(teams.merges.some(([r1, c1, r2, c2]) => r1 === 1 && c1 === col && r2 === 1 && c2 === col + 6));
  }
});

test('a second band starts after one blank row; empty rallies export as 10 numbered rows', () => {
  const many = Array.from({ length: 4 }, (_, i) => ({ ...createNextRally([], `r${i}`)[0], name: `R${i}` }));
  const [, sheet] = buildRallyWorkbook({ eventType: 'kvk', cycleNumber: 14, rallies: many, rows: [] });
  assert.equal(sheet.rows.length, 13 + 1 + 13, 'two bands of 13 rows with a blank row between');
  assert.deepEqual(sheet.rows[13], []);
  assert.equal(sheet.rows[14][0].v, 'R3');
  assert.equal(sheet.rows[12][0].v, 10);
});

// --- .xlsx ---------------------------------------------------------------------

function readStoredZip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const files = {};
  let pos = 0;
  while (view.getUint32(pos, true) === 0x04034b50) {
    const size = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const name = new TextDecoder().decode(bytes.subarray(pos + 30, pos + 30 + nameLen));
    const start = pos + 30 + nameLen + extraLen;
    files[name] = new TextDecoder().decode(bytes.subarray(start, start + size));
    pos = start + size;
  }
  return files;
}

test('xlsx has both tabs, merges, widths, fills and values for the first band', () => {
  const xlsx = readStoredZip(buildStyledXlsx([participants, teams]));
  assert.match(xlsx['xl/workbook.xml'], /<sheet name="Participants \(14th KvK\)" sheetId="1"/);
  assert.match(xlsx['xl/workbook.xml'], /<sheet name="Rally Teams \(14th KvK\)" sheetId="2"/);
  const sheet = xlsx['xl/worksheets/sheet2.xml'];
  assert.match(sheet, /<mergeCell ref="A1:G1"\/>/);
  assert.match(sheet, /<mergeCell ref="H2:N2"\/>/);
  assert.match(sheet, /<mergeCell ref="O1:U1"\/>/);
  assert.match(sheet, /<col min="1" max="1" width="3.2" customWidth="1"\/>/);
  assert.match(sheet, /<col min="3" max="3" width="13" customWidth="1"\/>/);
  assert.match(sheet, /<col min="21" max="21" width="8.9" customWidth="1"\/>/);
  assert.match(sheet, />Danko</);
  assert.match(sheet, />Manager : Zain</);
  assert.match(sheet, />T i m e</);
  assert.match(sheet, />T11 \/ TG8</);
  const styles = xlsx['xl/styles.xml'];
  for (const fill of ['FFFF0000', 'FFFFFF00', 'FFCCCCCC', 'FFFFF2CC', 'FFC9DAF8', 'FFFF00FF']) assert.match(styles, new RegExp(`rgb="${fill}"`));
  assert.match(styles, /<name val="Arial"\/>/);
  assert.match(xlsx['xl/worksheets/sheet1.xml'], /state="frozen"/);
  // Alliance tags stay text, slot numbers are numbers.
  assert.match(sheet, /<c r="E4"[^>]*t="inlineStr"><is><t xml:space="preserve">710</);
  assert.match(sheet, /<c r="A4"[^>]*><v>1<\/v>/);
});

test('column names', () => {
  assert.equal(columnName(1), 'A'); assert.equal(columnName(21), 'U'); assert.equal(columnName(27), 'AA');
});

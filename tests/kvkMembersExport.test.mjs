import test from 'node:test';
import assert from 'node:assert/strict';
import { buildKvkMembersWorkbook, kvkMemberExportRows, KVK_MEMBER_HEADERS } from '../lib/kvkMembersExport.mjs';

const member = {
  name: '雪 & <Knight>', member_id: '0001234567890123456789',
  infantry_tier: 'T11', infantry_tg: 'TG8', cavalry_tier: 'T10', cavalry_tg: 'TG7',
  archer_tier: 'T11', archer_tg: 'TG6', heroes: ['Hilde', 'Saul', 'Petra', 'Eric'],
  availability: 'Full battle (12-17 UTC)', current_alliance: 'RED', updated_at: '2026-09-03T12:00:00Z',
};

test('exports nine independent columns, both troop levels, and the complete hero list', () => {
  assert.deepEqual(KVK_MEMBER_HEADERS, ['Player Name', 'Player ID', 'Infantry Level', 'Cavalry Level', 'Archer Level', 'Heroes', 'Availability', 'Alliance', 'Updated']);
  assert.deepEqual(kvkMemberExportRows([member]), [[
    '雪 & <Knight>', '0001234567890123456789', 'T11 / TG8', 'T10 / TG7', 'T11 / TG6',
    'Hilde, Saul, Petra, Eric', 'Full battle (12-17 UTC)', 'RED', '2026-09-03T12:00:00.000Z',
  ]]);
});

test('writes an OOXML ZIP workbook and keeps player IDs and formula-like names as text', async () => {
  const blob = buildKvkMembersWorkbook([member, { name: '=1+1', member_id: '02' }]);
  assert.equal(blob.type, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  const bytes = new Uint8Array(await blob.arrayBuffer());
  assert.deepEqual([...bytes.slice(0, 4)], [80, 75, 3, 4]);
  const entries = new Map();
  const view = new DataView(bytes.buffer);
  for (let offset = 0; view.getUint32(offset, true) === 0x04034b50;) {
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const name = new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + nameLength));
    const start = offset + 30 + nameLength + extraLength;
    entries.set(name, new TextDecoder().decode(bytes.slice(start, start + size)));
    offset = start + size;
  }
  assert.equal(entries.size, 5);
  assert.match(entries.get('xl/workbook.xml'), /sheet name="KvK Members"/);
  const sheet = entries.get('xl/worksheets/sheet1.xml');
  assert.match(sheet, /雪 &amp; &lt;Knight&gt;/);
  assert.match(sheet, /<c r="B2" t="inlineStr"><is><t xml:space="preserve">0001234567890123456789<\/t>/);
  assert.match(sheet, /<c r="A3" t="inlineStr"><is><t xml:space="preserve">=1\+1<\/t>/);
  assert.equal((sheet.match(/<c /g) || []).length, 27);
});

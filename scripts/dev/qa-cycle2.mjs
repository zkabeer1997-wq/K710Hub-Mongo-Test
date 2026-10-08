import { client, adminLogin } from './qa-lib.mjs';
import { readFileSync } from 'node:fs';
const a = client(readFileSync('/tmp/qa-admin-cookie.txt', 'utf8'));
for (const [type, label] of [['kvk', 'KvK Season 2'], ['flamedragon', 'Flamedragon Season 2']]) {
  const r = await a('POST', '/api/admin-event-control', { type, action: 'start_cycle', label });
  console.log(type, r.status, r.json.state?.cycle?.label, JSON.stringify(r.json.state?.counts), r.json.error || '');
}

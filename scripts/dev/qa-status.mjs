import { client, memberCookie } from './qa-lib.mjs';
for (const id of process.argv.slice(2)) {
  const r = await client(memberCookie(id))('GET', '/api/member-form-status');
  console.log(id, r.json.forms.map((f) => `${f.key}:${f.submitted ? 'DONE' : 'todo'}${f.carriedOver ? '(carried)' : ''}${f.cycleLabel ? '[' + f.cycleLabel + ']' : ''}${f.previousLabel ? '<' + f.previousLabel : ''}`).join('  '));
  console.log('  summary:', JSON.stringify(r.json.summary), 'first:', r.json.firstIncomplete?.label);
}

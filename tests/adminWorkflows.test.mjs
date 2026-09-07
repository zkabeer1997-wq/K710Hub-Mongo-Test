import assert from 'node:assert/strict';
import {test} from 'node:test';
import {registerHooks} from 'node:module';
import {mintAdminToken} from '../lib/adminAuth.js';
import {createMemberToken} from '../lib/memberAuth.js';
import {TOOL_CATALOG,defaultQuantities,validateToolQuantities,toolConfiguration} from '../lib/toolCatalog.mjs';
import {optimizeShellPacks} from '../lib/adventureStall.mjs';
import {optimizeEssencePacks} from '../lib/flamedragonShop.mjs';
import {createPetPackOptimizer} from '../lib/petPackOptimizer.mjs';
import {searchRow,compareValues} from '../lib/adminTable.mjs';
import {profileSummary} from '../lib/memberProfiles.mjs';
import {TIME_SLOTS,validateNobleAdvisor} from '../lib/nobleAdvisor.mjs';
import {schedule} from '../app/admin/dashboard/prepScheduler.mjs';

const state={tables:{},writes:[],paths:[],downloads:0};globalThis.__workflowTest=state;
registerHooks({
 resolve(s,c,next){
  if(s.endsWith('/adminSupabase'))return {url:'test:workflow-db',shortCircuit:true};
  if(s==='next/cache')return {url:'test:workflow-cache',shortCircuit:true};
  if(s==='next/server')return next('next/server.js',c);
  if(/\/(adminAuth|memberAuth)$/.test(s))return next(s+'.js',c);
  return next(s,c);
 },
 load(u,c,next){
  if(u==='test:workflow-db')return {format:'module',shortCircuit:true,source:'export const createAdminSupabaseClient=()=>globalThis.__workflowTest.client;'};
  if(u==='test:workflow-cache')return {format:'module',shortCircuit:true,source:'export const revalidatePath=p=>{if(typeof p!=="string")throw Error("Invalid revalidation path");globalThis.__workflowTest.paths.push(p);};'};
  return next(u,c);
 }
});
 state.client={from(table){const q={filters:[],fields:'*',options:{},changes:null,insertValue:null,upsertValue:null,
 select(fields,options={}){this.fields=fields;this.options=options;return this;},
 eq(k,v){this.filters.push(r=>r[k]===v);return this;},
 like(k,v){this.filters.push(r=>String(r[k]).includes(v.slice(1,-1)));return this;},
 or(value){const statuses=value.includes('pending')?['pending','waitlist']:['new'];this.filters.push(r=>r.status==null||statuses.includes(r.status));return this;},
 order(){return this;},update(v){this.changes=v;return this;},insert(v){this.insertValue=v;return this;},
 upsert(v,{onConflict}){this.upsertValue=v;this.conflict=onConflict;return this;},
 execute(single=false){
  if(state.fail)return {data:null,error:{message:'fixture unavailable'}};
  const rows=state.tables[table] ||= [];
  if(this.insertValue){rows.push({id:`${table}-${rows.length+1}`,created_at:new Date().toISOString(),...this.insertValue});state.writes.push({table,value:this.insertValue});}
  if(this.upsertValue){const old=rows.find(r=>r[this.conflict]===this.upsertValue[this.conflict]);if(old)Object.assign(old,this.upsertValue);else rows.push({id:'booking-1',...this.upsertValue});state.writes.push({table,value:this.upsertValue});}
  const filtered=rows.filter(r=>(!this.upsertValue || r[this.conflict]===this.upsertValue[this.conflict]) && this.filters.every(f=>f(r)));
  if(this.changes){filtered.forEach(r=>Object.assign(r,this.changes));state.writes.push({table,value:this.changes});}
  const data=filtered.map(r=>this.fields==='*'?{...r}:Object.fromEntries(this.fields.split(',').map(k=>[k.trim(),r[k.trim()]])));
  return {data:this.options.head?null:single?data[0]||null:data,error:null,count:filtered.length};
 },maybeSingle(){return Promise.resolve(this.execute(true));},single(){return this.maybeSingle();},then(a,b){return Promise.resolve(this.execute()).then(a,b);}};return q;},
 storage:{from(){return {async download(){state.downloads++;return {data:new Blob(['image'],{type:'image/png'})};}}}}
};
const gates=await import('../app/api/admin-form-gates/route.js');
const badges=await import('../app/api/admin-task-counts/route.js');
const settings=await import('../app/api/admin-tool-settings/route.js');
const noble=await import('../app/api/noble-advisor/route.js');
const adminNoble=await import('../app/api/admin-noble-advisor/route.js');
const guides=await import('../app/api/guides/route.js');
const detail=await import('../app/api/guides/[slug]/route.js');
const images=await import('../app/api/guide-images/[file]/route.js');
const profiles=await import('../app/api/admin-member-pins/route.js');
process.env.ADMIN_PASSWORD='workflow-test-only';process.env.MEMBER_SESSION_SECRET='workflow-members-only';
const adminToken=await mintAdminToken(),memberToken=await createMemberToken('member-a');
const req=(body={},role='anonymous')=>({json:async()=>body,cookies:{get:key=>key==='tff_admin_session'&&role==='admin'?{value:adminToken}:key==='k710_member_session'&&role==='member'?{value:memberToken}:undefined}});
const params=slug=>({params:Promise.resolve({slug})});
const booking={in_game_name:'Test member',want_troop_training:'Yes',is_transfer:'No',promoting_t11:'Yes',troop_speedup_days:'650',avail_day4:['00:15','00:45']};

test('new admin endpoints require signed admin access before reading or changing data',async()=>{
 const before=state.writes.length;
 for(const handler of [badges.GET,settings.GET,settings.PUT,adminNoble.GET,adminNoble.PATCH,profiles.GET])for(const role of ['anonymous','member'])assert.equal((await handler(req({},role))).status,401);
 assert.equal(state.writes.length,before);
});
test('sidebar counts include new, undecided and waitlisted requests; decisions remove counts',async()=>{
 state.tables.website_requests=[{status:'new'},{status:null},{status:'reviewed'}];
 state.tables.interest_submissions=[{status:'pending'},{status:'waitlist'},{status:null},{status:'normal'},{status:'special'},{status:'reject'}];
 assert.deepEqual(await (await badges.GET(req({},'admin'))).json(),{website:2,transfers:3});
 state.tables.website_requests[0].status='reviewed';state.tables.interest_submissions[0].status='normal';
 assert.deepEqual(await (await badges.GET(req({},'admin'))).json(),{website:1,transfers:2});
 state.fail=true;assert.equal((await badges.GET(req({},'admin'))).status,503);state.fail=false;
});
test('guide directory and direct URL enforce public/member/draft visibility without leaking text',async()=>{
 state.tables.kingdom_guides=[{slug:'public',title:'Public',body:'PUBLIC TEXT',is_published:true,access_level:'public'},{slug:'private',title:'Secret title',body:'SECRET TEXT',is_published:true,access_level:'members'},{slug:'draft',body:'DRAFT TEXT',is_published:false,access_level:'members'}];
 const anon=await (await guides.GET(req())).json();assert.deepEqual(anon.guides.map(g=>g.slug),['public']);assert.ok(anon.guides.every(g=>!('body' in g)));
 assert.equal((await (await guides.GET(req({},'member'))).json()).guides.length,2);
 for(const role of ['anonymous','member','admin']){
  assert.equal((await detail.GET(req({},role),params('public'))).status,200);
  const privateResponse=await detail.GET(req({},role),params('private'));
  assert.equal(privateResponse.status,role==='anonymous'?401:200);
  if(role==='anonymous')assert.doesNotMatch(await privateResponse.text(),/SECRET TEXT|Secret title/);
  assert.equal((await detail.GET(req({},role),params('draft'))).status,role==='admin'?200:404);
 }
 process.env.VERCEL_ENV='preview';state.tables.kingdom_guides_preview=[];
 assert.deepEqual((await (await guides.GET(req({},'admin'))).json()).guides,[]);delete process.env.VERCEL_ENV;
});
test('private guide attachments require member access and unpublished attachments require admin',async()=>{
 const file='11111111-1111-4111-8111-111111111111.png',p={params:Promise.resolve({file})};
 const guide=state.tables.kingdom_guides.find(g=>g.slug==='private');guide.body=`![image](/api/guide-images/${file})`;
 const before=state.downloads;assert.equal((await images.GET(req(),p)).status,404);assert.equal(state.downloads,before);
 assert.equal((await images.GET(req({},'member'),p)).status,200);
 guide.is_published=false;assert.equal((await images.GET(req({},'member'),p)).status,404);assert.equal((await images.GET(req({},'admin'),p)).status,200);
});
test('member bookings are session-owned, persist, update, and honor form closure',async()=>{
 assert.equal((await noble.POST(req(booking))).status,401);
 assert.equal((await noble.GET(req())).status,401);
 assert.equal((await noble.POST(req({...booking,member_id:'another-member'},'member'))).status,200);
 assert.equal(state.tables.noble_advisor_submissions[0].member_id,'member-a');
 assert.equal((await (await noble.GET(req({},'member'))).json()).record.in_game_name,booking.in_game_name);
 assert.equal((await noble.POST(req({...booking,troop_speedup_days:'700'},'member'))).status,200);
 assert.equal(state.tables.noble_advisor_submissions.length,1);assert.equal(state.tables.noble_advisor_submissions[0].troop_speedup_days,'700');
 state.tables.form_gates=[{form_key:'noble',is_open:false}];assert.equal((await noble.POST(req(booking,'member'))).status,403);state.tables.form_gates=[];
 assert.equal((await adminNoble.PATCH(req({id:'booking-1',key:'member_id',value:'other'},'admin'))).status,400);
 assert.equal((await adminNoble.PATCH(req({id:'booking-1',key:'troop_speedup_days',value:'1200'},'admin'))).status,200);
 const rows=(await (await adminNoble.GET(req({},'admin'))).json()).rows;
 assert.equal(rows[0].troop_speedup_days,'1200');assert.deepEqual(rows[0].avail_day4,booking.avail_day4);
 const day4=schedule(rows).days.find(day=>day.day===4);assert.ok(day4.rows.some(r=>r.member.includes('Test member')));
});
test('Noble validation rejects invalid slots, missing answers, negative days; accepts zero and deduplicates',()=>{
 assert.equal(TIME_SLOTS.length,48);
 for(const bad of [{avail_day4:['12:00']},{troop_speedup_days:'-1'},{promoting_t11:''},{avail_day4:[]}])assert.ok(validateNobleAdvisor({...booking,...bad}).error);
 assert.deepEqual(validateNobleAdvisor({...booking,troop_speedup_days:'0',avail_day4:['00:15','00:15']}).record.avail_day4,['00:15']);
});
test('tool settings preserve fixed rules, validate bounds and apply to optimizer inputs',async()=>{
 for(const key of Object.keys(TOOL_CATALOG))assert.ok(validateToolQuantities(key,defaultQuantities(key)).quantities,key);
 for(const [tool,q] of [['adventure-stall',{algorithm:'changed'}],['wavebound-charms',{'majestic.g':1}],['charm-pack-optimizer',{'pack.0.g':40}],['pet-pack-optimizer',{'custom.food':-1}]])assert.ok(validateToolQuantities(tool,q).error);
 const tool='adventure-stall',quantities={...defaultQuantities(tool),'pack.20.shells':100};
 assert.equal((await settings.PUT(req({tool,quantities},'admin'))).status,200);
 assert.equal(state.tables.tool_settings_history.length,1);
 assert.equal(state.tables.tool_settings_history[0].verification_status,'community-reported');
 assert.equal((await settings.PUT(req({tool,quantities,verificationStatus:'verified'},'admin'))).status,400);
 assert.equal((await settings.PUT(req({tool,quantities,verificationStatus:'verified',sourceNote:'In-game screenshot',lastVerified:'2026-09-05'},'admin'))).status,200);
 assert.equal(state.tables.tool_settings_history.at(-1).verification_status,'verified');
 const saved=(await (await settings.GET(req({},'admin'))).json()).tools.find(t=>t.key===tool);
 const config=toolConfiguration(tool,saved.quantities),normal=toolConfiguration(tool);
 assert.equal(optimizeShellPacks(100,1,config.packs).costCents,99);
 assert.ok(optimizeShellPacks(100,1,normal.packs).costCents>99);
 assert.equal(config.packs[0].cents,normal.packs[0].cents);assert.equal(config.packs[0].perDay,normal.packs[0].perDay);
 assert.ok(state.paths.includes('/tools/adventure-stall'));
 const dragon=toolConfiguration('flamedragon-shop'),first=dragon.packs[0];
 const changed=toolConfiguration('flamedragon-shop',{[`pack.${first.key}.essence`]:first.essence*2});
 const limits=Object.fromEntries(dragon.packs.map(p=>[p.key,1]));
 assert.ok(optimizeEssencePacks(first.essence*2,limits,changed.packs).costCents<=optimizeEssencePacks(first.essence*2,limits,dragon.packs).costCents);
 const pet=createPetPackOptimizer(toolConfiguration('pet-pack-optimizer',{'resource.manual.chestYield':100}));
 assert.equal(pet({need:{manual:100},have:{},ownedChests:1,maxWeeks:1}).cost,0);
});
test('member profiles merge submitted stats and never expose PIN hashes',async()=>{
 state.tables.submissions=[{name:'Old name',member_id:'member-a',pin_hash:'$2b$12$private',current_alliance:'RED'}];
 state.tables.power_profiles=[{name:'Current name',member_id:'member-a',pet_power:'1.5M',masters_power:'800K',mystic_trial_score:'1234',governor_gear:'gear',charms:'charms',infantry_tier:'T11',cavalry_tier:'T10',archer_tier:'T9'}];
 const response=await profiles.GET(req({},'admin')),text=await response.text(),row=JSON.parse(text).rows[0];
 assert.equal(row.name,'Current name');assert.equal(row.mystic_trial_score,'1234');assert.equal(row.pin_status,'secured');assert.doesNotMatch(text,/pin_hash|\$2b\$/);
 assert.equal(compareValues('1.5M','900,000',true)>0,true);
 assert.equal(searchRow(row,'current member-a',['name','member_id']),true);assert.equal(searchRow(row,'missing member-a',['name','member_id']),false);
 assert.equal(profileSummary({}).gear_min,0);assert.equal(profileSummary({}).charm_min,0);
});


test('every form can close and reopen with valid refresh paths and JSON confirmations',async()=>{
 for(const form_key of ['lead','joiner','prep','dragon','noble','requests']) {
  for(const is_open of [false,true]) {
   const response=await gates.PATCH(req({form_key,is_open,message:'Bookings paused'},'admin'));
   assert.equal(response.status,200,form_key);
   const result=await response.json();assert.equal(result.gate.is_open,is_open);
   assert.equal(state.tables.form_gates.find(g=>g.form_key===form_key).is_open,is_open);
   if(form_key==='noble') assert.equal((await noble.POST(req(booking,'member'))).status,is_open?200:403);
  }
 }
 assert.ok(state.paths.includes('/forms/flamedragon-tyrant/noble-advisor'));
 assert.ok(state.paths.includes('/forms/flamedragon-tyrant'));
 assert.equal((await gates.PATCH(req({form_key:'noble',is_open:false}))).status,401);
 assert.equal((await gates.PATCH(req(null,'admin'))).status,400);
 state.fail=true;
 const failed=await gates.PATCH(req({form_key:'noble',is_open:false},'admin'));
 assert.equal(failed.status,500);assert.ok((await failed.json()).error);state.fail=false;
});

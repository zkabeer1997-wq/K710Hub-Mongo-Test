import { SHOP_ITEMS as ADVENTURE_ITEMS, PACKS as ADVENTURE_PACKS } from './adventureStall.mjs';
import { SHOP_ITEMS as DRAGON_ITEMS, PACKS as DRAGON_PACKS } from './flamedragonShop.mjs';
import { PET_RESOURCES, PET_PACK_TIERS } from './petPackOptimizer.mjs';
import { CHARM_COSTS, CHARM_PACKS } from './charmToolData.mjs';
import { GOVERNOR_GEAR_TIER_COSTS } from './governorGearToolData.mjs';
import { GOVERNOR_GEAR_OPTIONS } from './equipmentOptions.mjs';
import { resolveToolStorageKey } from './toolKeys.mjs';
// Every editable value belongs to exactly one admin page, recorded in `kind`:
//   'pack' -> Admin > Tools > Pack editing: real-money packs only (USD price, what the pack
//             contains, purchase limit).
//   'calc' -> Admin > Tools > Tool database: raw calculator data (per-level / per-tier
//             upgrade requirements, sailing chest rewards, in-game shop rates). No $ values.
// Both kinds are stored together under the same tool_settings document (keyed by tool), so
// moving an editor between pages never needs a data migration.
export const TOOL_KINDS = Object.freeze(['pack', 'calc']);
const field = (kind,section,key,label,value,group,min=1,step=1,max=1000000) => ({kind,section,key,label,value,group,min,step,max});
const price = (section,key,value,group) => ({...field('pack',section,key,'Price (USD)',value,group,0.01,0.01,999.99),usd:true});
const calc = (...a) => field('calc',...a);
const pack = (...a) => field('pack',...a);
const costs = () => CHARM_COSTS.flatMap((cost,level)=>cost ? [calc('Upgrade cost per charm level',`cost.${level}.g`,'Guides',cost[0],`Level ${level}`,0),calc('Upgrade cost per charm level',`cost.${level}.d`,'Designs',cost[1],`Level ${level}`,0)] : []);
const gearCosts = () => GOVERNOR_GEAR_TIER_COSTS.flatMap((cost,tier)=>{
 if(!cost) return [];
 const group=`Tier ${tier} — ${GOVERNOR_GEAR_OPTIONS[tier]}`,sec='Upgrade cost per gear tier';
 return [calc(sec,`cost.${tier}.g`,'Satin',cost[0],group,0),calc(sec,`cost.${tier}.d`,'Gilded Threads',cost[1],group,0),...(tier>=4 ? [calc(sec,`cost.${tier}.shards`,"Artisan's Visions",cost[2] || 0,group,0)] : [])];
});
const chest = (sec) => (spec) => spec.map(([group,key,label,value,min])=>calc(sec,key,label,value,group,min));
const charmChests = chest('Sailing chest rewards')([['Common chest','common.d','Designs',5],['Premium chest','premium.g','Guides',5],['Premium chest','premium.d','Designs',10],['Exquisite chest','exquisite.g','Guides',15],['Exquisite chest','exquisite.d','Designs',15],['Exquisite chest','exquisite.shards','Mythic shards',2,0],['Majestic chest','majestic.g','Guides',50],['Majestic chest','majestic.d','Designs',50],['Majestic chest','majestic.shards','Mythic shards',6,0]]);
const gearChests = chest('Sailing chest rewards')([['Common chest','common.g','Satin',1300],['Common chest','common.d','Gilded Threads',20],['Premium chest','premium.g','Satin',5000],['Premium chest','premium.d','Gilded Threads',50],['Exquisite chest','exquisite.g','Satin',4400],['Exquisite chest','exquisite.d','Gilded Threads',44],['Exquisite chest','exquisite.shards',"Artisan's Visions",22,0],['Majestic chest','majestic.g','Satin',13200],['Majestic chest','majestic.d','Gilded Threads',132],['Majestic chest','majestic.shards',"Artisan's Visions",66,0]]);
const shop = (items,packs,currency) => [
 ...items.flatMap(item=>[calc('Shop items',`shop.${item.key}.reward`,'Items per set',item.reward,item.name),calc('Shop items',`shop.${item.key}.${currency}`,`${currency === 'shells' ? 'Shells' : 'Essence'} per set`,item[currency],item.name),calc('Shop items',`shop.${item.key}.max`,'Maximum sets',item.max,item.name,0,1,5000)]),
 ...packs.flatMap(p=>[
  price('Packs',`pack.${p.key}.price`,p.cents/100,p.name),
  pack('Packs',`pack.${p.key}.${currency}`,`${currency === 'shells' ? 'Shells' : 'Essence'} per pack`,p[currency],p.name,currency==='shells'?5:20,currency==='shells'?5:20,20000),
  pack('Packs',`pack.${p.key}.limit`,currency==='shells'?'Purchase limit per day':'Purchase limit',currency==='shells'?p.perDay:p.defaultMax,p.name,1,1,currency==='shells'?20:999),
 ]),
];
export const TOOL_CATALOG = {
 'charm-pack-optimizer': { label:'Charm Pack Optimizer',fields:CHARM_PACKS.flatMap((p,i)=>[price('Charm packs',`pack.${i}.price`,p.price,`Pack ${i+1}`),pack('Charm packs',`pack.${i}.g`,'Guides per choice (multiples of 20)',p.g,`Pack ${i+1}`,20,20,4000),pack('Charm packs',`pack.${i}.d`,'Designs per choice (1.1 × Guides)',p.d,`Pack ${i+1}`,22,22,4400),pack('Charm packs',`pack.${i}.max`,'Purchase limit',p.max,`Pack ${i+1}`,1,1,99)]) },
 'wavebound-charms': {label:'Charm Sailing Optimizer',fields:[...costs(),...charmChests]},
 'governor-gear-sailing-tool': {label:'Governor Gear Sailing Tool',fields:[...gearCosts(),...gearChests]},
 'pet-pack-optimizer': {label:'Pet Pack Optimizer',fields:[...PET_PACK_TIERS.map((t,i)=>price('Pack tiers',`tier.${i}.price`,t.price,`${t.name} pack`)),...Object.entries(PET_RESOURCES).flatMap(([key,r])=>[pack('Single-pack contents',`resource.${key}.singleBase`,'Base single-pack quantity',r.singleBase,r.label),...(r.chestYield ? [pack('Single-pack contents',`resource.${key}.chestYield`,'Items per chest',r.chestYield,r.label)] : [])]),pack('Custom pack contents','custom.food','Food per base choice',5000,'Custom pet pack'),pack('Custom pack contents','custom.chests','Chests per base choice',6,'Custom pet pack')]},
 'adventure-stall': {label:'Adventure Stall',fields:shop(ADVENTURE_ITEMS,ADVENTURE_PACKS,'shells')},
 'flamedragon-shop': {label:"Dragon's Caravan Optimizer",fields:shop(DRAGON_ITEMS,DRAGON_PACKS,'essence')},
};
/** Fields of one kind for one tool (null kind = every field). */
export function toolFields(tool, kind=null) { tool=resolveToolStorageKey(tool); return (TOOL_CATALOG[tool]?.fields || []).filter(f=>!kind || f.kind===kind); }
/** Tool list for one admin page: only tools with at least one field of that kind, with only those fields. */
export function catalogForKind(kind) { return Object.entries(TOOL_CATALOG).map(([key,t])=>({key,label:t.label,fields:t.fields.filter(f=>f.kind===kind)})).filter(t=>t.fields.length); }
export function defaultQuantities(tool) { tool=resolveToolStorageKey(tool); return Object.fromEntries((TOOL_CATALOG[tool]?.fields || []).map(f=>[f.key,f.value])); }
export function validateToolQuantities(tool, values) {
 tool=resolveToolStorageKey(tool);
 const catalog=TOOL_CATALOG[tool];
 if(!catalog || !values || Array.isArray(values) || typeof values!=='object') return {error:'Choose a supported tool and valid quantities.'};
 const allowed=new Set(catalog.fields.map(f=>f.key));
 const unknown=Object.keys(values).filter(key=>!allowed.has(key));
 if(unknown.length) return {error:`Unknown setting${unknown.length>1?'s':''}: ${unknown.slice(0,3).join(', ')}${unknown.length>3?'…':''}. Only the listed values can be changed.`};
 const quantities={...defaultQuantities(tool),...values};
 for(const f of catalog.fields){
  const n=quantities[f.key],name=`${f.group} — ${f.label}`;
  if(typeof n!=='number' || !Number.isFinite(n)) return {error:`${name}: enter a number.`};
  if(f.usd){
   if(n<=0) return {error:`${name}: the price must be more than $0.00.`};
   if(Math.abs(n*100-Math.round(n*100))>1e-6) return {error:`${name}: use at most 2 decimals (for example 4.99).`};
   if(n<f.min || n>f.max) return {error:`${name}: enter an amount from $${f.min.toFixed(2)} to $${f.max.toFixed(2)}.`};
   quantities[f.key]=Math.round(n*100)/100;
   continue;
  }
  if(n<0) return {error:`${name}: cannot be negative.`};
  if(!Number.isInteger(n) || n<f.min || n>f.max || n%f.step!==0) return {error:`${name}: enter a whole number from ${f.min} to ${f.max}${f.step>1?` in multiples of ${f.step}`:''}.`};
 }
 if(tool==='charm-pack-optimizer' && CHARM_PACKS.some((_,i)=>Math.abs(quantities[`pack.${i}.d`]-quantities[`pack.${i}.g`]*1.1)>.001)) return {error:'Charm pack quantities must keep the existing 10:11 Guide-to-Design ratio.'};
 if((tool==='wavebound-charms' || tool==='governor-gear-sailing-tool') && ['g','d'].some(k=>quantities[`majestic.${k}`]<=quantities[`exquisite.${k}`])) return {error:'Majestic chests must contain more of each resource than Exquisite chests.'};
 return {quantities};
}
export function toolConfiguration(tool, values={}) {
 tool=resolveToolStorageKey(tool);
 const {quantities:q,error}=validateToolQuantities(tool,values);if(error)throw Error(error);
 if(tool==='adventure-stall' || tool==='flamedragon-shop'){
  const adventure=tool==='adventure-stall',currency=adventure?'shells':'essence';
  return {items:(adventure?ADVENTURE_ITEMS:DRAGON_ITEMS).map(i=>({...i,reward:q[`shop.${i.key}.reward`],max:q[`shop.${i.key}.max`],[currency]:q[`shop.${i.key}.${currency}`]})),packs:(adventure?ADVENTURE_PACKS:DRAGON_PACKS).map(p=>({...p,[currency]:q[`pack.${p.key}.${currency}`],cents:Math.round(q[`pack.${p.key}.price`]*100),...(adventure?{perDay:q[`pack.${p.key}.limit`]}:{defaultMax:q[`pack.${p.key}.limit`]}),...(adventure?{name:`${q[`pack.${p.key}.${currency}`].toLocaleString()} Shell Pack`}:{})}))};
 }
 if(tool==='pet-pack-optimizer')return {resources:Object.fromEntries(Object.entries(PET_RESOURCES).map(([key,r])=>[key,{...r,singleBase:q[`resource.${key}.singleBase`],...(r.chestYield?{chestYield:q[`resource.${key}.chestYield`]}:{})}])),customFood:q['custom.food'],customChests:q['custom.chests'],tiers:PET_PACK_TIERS.map((t,i)=>({...t,price:q[`tier.${i}.price`]}))};
 if(tool==='governor-gear-sailing-tool')return {costs:GOVERNOR_GEAR_TIER_COSTS.map((c,i)=>c?[q[`cost.${i}.g`],q[`cost.${i}.d`],q[`cost.${i}.shards`] ?? 0]:null),rewards:q};
 if(tool==='charm-pack-optimizer')return {costs:CHARM_COSTS,packs:CHARM_PACKS.map((p,i)=>({...p,price:q[`pack.${i}.price`],g:q[`pack.${i}.g`],d:q[`pack.${i}.d`],max:q[`pack.${i}.max`]}))};
 const costs=CHARM_COSTS.map((c,i)=>c?[q[`cost.${i}.g`],q[`cost.${i}.d`]]:null);
 return {costs,rewards:q};
}

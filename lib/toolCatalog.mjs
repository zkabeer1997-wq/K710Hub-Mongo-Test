import { SHOP_ITEMS as ADVENTURE_ITEMS, PACKS as ADVENTURE_PACKS } from './adventureStall.mjs';
import { SHOP_ITEMS as DRAGON_ITEMS, PACKS as DRAGON_PACKS } from './flamedragonShop.mjs';
import { PET_RESOURCES } from './petPackOptimizer.mjs';
import { CHARM_COSTS, CHARM_PACKS } from './charmToolData.mjs';
import { GOVERNOR_GEAR_TIER_COSTS } from './governorGearToolData.mjs';
import { GOVERNOR_GEAR_OPTIONS } from './equipmentOptions.mjs';
const field = (key,label,value,group,min=1,step=1,max=1000000) => ({key,label,value,group,min,step,max});
const costs = () => CHARM_COSTS.flatMap((cost,level)=>cost ? [field(`cost.${level}.g`,'Guides',cost[0],`Level ${level}`,0),field(`cost.${level}.d`,'Designs',cost[1],`Level ${level}`,0)] : []);
const gearCosts = () => GOVERNOR_GEAR_TIER_COSTS.flatMap((cost,tier)=>{
 if(!cost) return [];
 const group=`Tier ${tier} — ${GOVERNOR_GEAR_OPTIONS[tier]}`;
 return [field(`cost.${tier}.g`,'Satin',cost[0],group,0),field(`cost.${tier}.d`,'Gilded Threads',cost[1],group,0),...(tier>=4 ? [field(`cost.${tier}.shards`,"Artisan's Visions",cost[2] || 0,group,0)] : [])];
});
const shop = (items,packs,currency) => [
 ...items.flatMap(item=>[field(`shop.${item.key}.reward`,'Items per set',item.reward,item.name),field(`shop.${item.key}.${currency}`,`${currency === 'shells' ? 'Shells' : 'Essence'} per set`,item[currency],item.name),field(`shop.${item.key}.max`,'Maximum sets',item.max,item.name,0,1,5000)]),
 ...packs.map(pack=>field(`pack.${pack.key}.${currency}`,`${currency === 'shells' ? 'Shells' : 'Essence'} per pack`,pack[currency],pack.name,currency==='shells'?5:20,currency==='shells'?5:20,20000)),
];
export const TOOL_CATALOG = {
 'charm-pack-optimizer': { label:'Charm Pack Optimizer',fields:[...CHARM_PACKS.flatMap((pack,i)=>[field(`pack.${i}.g`,'Guides per choice (multiples of 20)',pack.g,`$${pack.price} pack`,20,20,4000),field(`pack.${i}.d`,'Designs per choice (1.1 × Guides)',pack.d,`$${pack.price} pack`,22,22,4400)]),...costs()] },
 'wavebound-charms': {label:'Wavebound Charm Merge Optimizer',fields:[...costs(),field('common.d','Designs',5,'Common chest'),field('premium.g','Guides',5,'Premium chest'),field('premium.d','Designs',10,'Premium chest'),field('exquisite.g','Guides',15,'Exquisite chest'),field('exquisite.d','Designs',15,'Exquisite chest'),field('exquisite.shards','Mythic shards',2,'Exquisite chest',0),field('majestic.g','Guides',50,'Majestic chest'),field('majestic.d','Designs',50,'Majestic chest'),field('majestic.shards','Mythic shards',6,'Majestic chest',0)]},
 'governor-gear-sailing-tool': {label:'Governor Gear Sailing Tool',fields:[...gearCosts(),field('common.g','Satin',1300,'Common chest'),field('common.d','Gilded Threads',20,'Common chest'),field('premium.g','Satin',5000,'Premium chest'),field('premium.d','Gilded Threads',50,'Premium chest'),field('exquisite.g','Satin',4400,'Exquisite chest'),field('exquisite.d','Gilded Threads',44,'Exquisite chest'),field('exquisite.shards',"Artisan's Visions",22,'Exquisite chest',0),field('majestic.g','Satin',13200,'Majestic chest'),field('majestic.d','Gilded Threads',132,'Majestic chest'),field('majestic.shards',"Artisan's Visions",66,'Majestic chest',0)]},
 'pet-pack-optimizer': {label:'Pet Pack Optimizer',fields:[...Object.entries(PET_RESOURCES).flatMap(([key,r])=>[field(`resource.${key}.singleBase`,'Base single-pack quantity',r.singleBase,r.label),...(r.chestYield ? [field(`resource.${key}.chestYield`,'Items per chest',r.chestYield,r.label)] : [])]),field('custom.food','Food per base choice',5000,'Custom pet pack'),field('custom.chests','Chests per base choice',6,'Custom pet pack')]},
 'adventure-stall': {label:'Adventure Stall',fields:shop(ADVENTURE_ITEMS,ADVENTURE_PACKS,'shells')},
 'flamedragon-shop': {label:'Flamedragon Tyrant Shop',fields:shop(DRAGON_ITEMS,DRAGON_PACKS,'essence')},
};
export function defaultQuantities(tool) { return Object.fromEntries((TOOL_CATALOG[tool]?.fields || []).map(f=>[f.key,f.value])); }
export function validateToolQuantities(tool, values) {
 const catalog=TOOL_CATALOG[tool];
 if(!catalog || !values || Array.isArray(values) || typeof values!=='object') return {error:'Choose a supported tool and valid quantities.'};
 const allowed=new Set(catalog.fields.map(f=>f.key));
 if(Object.keys(values).some(key=>!allowed.has(key))) return {error:'Only the listed item quantities can be changed.'};
 const quantities={...defaultQuantities(tool),...values};
 for(const f of catalog.fields){const n=quantities[f.key];if(typeof n!=='number' || !Number.isInteger(n) || n<f.min || n>f.max || n%f.step!==0) return {error:`${f.group} — ${f.label}: enter a whole number from ${f.min} to ${f.max}${f.step>1?` in multiples of ${f.step}`:''}.`};}
 if(tool==='charm-pack-optimizer' && CHARM_PACKS.some((_,i)=>Math.abs(quantities[`pack.${i}.d`]-quantities[`pack.${i}.g`]*1.1)>.001)) return {error:'Charm pack quantities must keep the existing 10:11 Guide-to-Design ratio.'};
 if((tool==='wavebound-charms' || tool==='governor-gear-sailing-tool') && ['g','d'].some(k=>quantities[`majestic.${k}`]<=quantities[`exquisite.${k}`])) return {error:'Majestic chests must contain more of each resource than Exquisite chests.'};
 return {quantities};
}
export function toolConfiguration(tool, values={}) {
 const {quantities:q,error}=validateToolQuantities(tool,values);if(error)throw Error(error);
 if(tool==='adventure-stall' || tool==='flamedragon-shop'){
  const adventure=tool==='adventure-stall',currency=adventure?'shells':'essence';
  return {items:(adventure?ADVENTURE_ITEMS:DRAGON_ITEMS).map(i=>({...i,reward:q[`shop.${i.key}.reward`],max:q[`shop.${i.key}.max`],[currency]:q[`shop.${i.key}.${currency}`]})),packs:(adventure?ADVENTURE_PACKS:DRAGON_PACKS).map(p=>({...p,[currency]:q[`pack.${p.key}.${currency}`],...(adventure?{name:`${q[`pack.${p.key}.${currency}`].toLocaleString()} Shell Pack`}:{})}))};
 }
 if(tool==='pet-pack-optimizer')return {resources:Object.fromEntries(Object.entries(PET_RESOURCES).map(([key,r])=>[key,{...r,singleBase:q[`resource.${key}.singleBase`],...(r.chestYield?{chestYield:q[`resource.${key}.chestYield`]}:{})}])),customFood:q['custom.food'],customChests:q['custom.chests']};
 if(tool==='governor-gear-sailing-tool')return {costs:GOVERNOR_GEAR_TIER_COSTS.map((c,i)=>c?[q[`cost.${i}.g`],q[`cost.${i}.d`],q[`cost.${i}.shards`] ?? 0]:null),rewards:q};
 const costs=CHARM_COSTS.map((c,i)=>c?[q[`cost.${i}.g`],q[`cost.${i}.d`]]:null);
 return tool==='charm-pack-optimizer'?{costs,packs:CHARM_PACKS.map((p,i)=>({...p,g:q[`pack.${i}.g`],d:q[`pack.${i}.d`]}))}:{costs,rewards:q};
}

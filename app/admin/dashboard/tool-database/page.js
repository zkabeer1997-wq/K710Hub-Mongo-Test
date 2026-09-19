'use client';
import {useRouter} from 'next/navigation';
import {useState} from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import {GOVERNOR_GEAR_LEVELS, CHARM_LEVELS} from '../../../../lib/phase2Data.mjs';

const RARITY_COLORS={
 Green:'#3fbf6a',Blue:'#3f8fe0',Purple:'#a866e0',Gold:'#d9a94e',Red:'#e0554f',
};

function fmt(n){return Number(n).toLocaleString();}
function pct(n,digits=2){return `${Number(n).toFixed(digits)}%`;}

function parseGearTier(tierStr){
 const [rarity,...rest]=tierStr.split(' ');
 let remainder=rest.join(' ');
 let tGroup='';
 const tMatch=remainder.match(/^T(\d+)/);
 if(tMatch){tGroup=`T${tMatch[1]} `;remainder=remainder.slice(tMatch[0].length).trim();}
 const romanMap={I:0,II:1,III:2,IV:3};
 let stars=0;
 const plusMatch=remainder.match(/^\+(\d+)/);
 if(plusMatch) stars=Number(plusMatch[1]);
 else if(remainder && romanMap[remainder]!==undefined) stars=romanMap[remainder];
 return {rarity,tierLabel:`${tGroup}${stars}★`};
}

function buildGearRows(){
 let cumulative=0;
 return GOVERNOR_GEAR_LEVELS.map((row)=>{
  const {rarity,tierLabel}=parseGearTier(row.tier);
  cumulative+=row.statGain;
  return {...row,rarity,tierLabel,cumulative};
 });
}
const GEAR_ROWS=buildGearRows();

const CHARM_ROWS=CHARM_LEVELS.filter(Boolean);

const DATASETS=[
 {key:'charms',label:'Charms Database'},
 {key:'governor-gear',label:'Governor Gear Database'},
];

export default function ToolDatabasePage(){
 const router=useRouter();
 async function logout(){await fetch('/api/admin-logout',{method:'POST'});router.push('/admin/login');router.refresh();}
 const [dataset,setDataset]=useState(DATASETS[0].key);

 return <AdminShell onLogout={logout} title="Tool Database" subtitle="Reference tables for each tool's per-level and per-tier requirements">
  <p>Read-only lookup tables pulled from the same verified data the Charms Sailing Optimizer and Governor Gear Sailing Tool planners use.</p>
  <div className="tool-db-toolbar">
   <label>Data set<select value={dataset} onChange={e=>setDataset(e.target.value)}>{DATASETS.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select></label>
  </div>

  {dataset==='charms' && (
   <div className="tool-db-table-wrap">
    <table className="tool-db-table">
     <thead><tr><th>Level</th><th>Guides</th><th>Designs</th><th>Health / Lethality</th><th>Power</th></tr></thead>
     <tbody>
      {CHARM_ROWS.map(row=>(
       <tr key={row.level}>
        <td>Level {row.level}</td>
        <td>{fmt(row.guides)}</td>
        <td>{fmt(row.designs)}</td>
        <td>{fmt(row.health)}</td>
        <td>{fmt(row.power)}</td>
       </tr>
      ))}
     </tbody>
    </table>
   </div>
  )}

  {dataset==='governor-gear' && (
   <div className="tool-db-table-wrap">
    <table className="tool-db-table">
     <thead><tr><th>Rarity</th><th>Tier</th><th>Satin</th><th>Gilded Threads</th><th>Artisan&apos;s Vision</th><th>Stat Bonus</th><th>Cumulative</th><th>Set Bonus</th></tr></thead>
     <tbody>
      {GEAR_ROWS.map(row=>(
       <tr key={row.index}>
        <td><span className="tool-db-badge" style={{'--badge-color':RARITY_COLORS[row.rarity] || '#8ea9b9'}}>{row.rarity}</span></td>
        <td>{row.tierLabel}</td>
        <td>{fmt(row.satin)}</td>
        <td>{fmt(row.threads)}</td>
        <td>{row.visions ? fmt(row.visions) : '–'}</td>
        <td>+{pct(row.statGain)}</td>
        <td>{pct(row.cumulative)}</td>
        <td>+{pct(row.setBonus,1)}</td>
       </tr>
      ))}
     </tbody>
    </table>
   </div>
  )}

  <style>{`
   .tool-db-toolbar{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0}
   .tool-db-toolbar label{flex:1;min-width:220px;max-width:320px}
   .tool-db-table-wrap{border:1px solid var(--edge);border-radius:10px;overflow:auto;max-height:70vh}
   .tool-db-table{width:100%;border-collapse:collapse;font-size:13px}
   .tool-db-table thead th{position:sticky;top:0;background:var(--panel,#0e1620);text-align:left;padding:12px 14px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#8ea9b9;border-bottom:1px solid var(--edge);white-space:nowrap}
   .tool-db-table tbody td{padding:10px 14px;border-bottom:1px solid var(--edge);font-variant-numeric:tabular-nums;white-space:nowrap}
   .tool-db-table tbody tr:hover{background:rgba(255,255,255,.03)}
   .tool-db-badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:11px;font-weight:700;color:var(--badge-color);background:color-mix(in srgb, var(--badge-color) 16%, transparent);border:1px solid color-mix(in srgb, var(--badge-color) 40%, transparent)}
  `}</style>
 </AdminShell>;
}

'use client';
import {useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import {Button} from '../../../../components/ui';
import {validateToolQuantities,defaultQuantities} from '../../../../lib/toolCatalog.mjs';

const DATASETS=[
 {key:'wavebound-charms',label:'Charms Database',unit:'Level'},
 {key:'governor-gear-sailing-tool',label:'Governor Gear Database',unit:'Tier'},
];

function levelNumber(group){return Number(group.match(/\d+/)?.[0] ?? 0);}

export default function ToolDatabasePage(){
 const router=useRouter();
 async function logout(){await fetch('/api/admin-logout',{method:'POST'});router.push('/admin/login');router.refresh();}
 const [tools,setTools]=useState([]),[dataset,setDataset]=useState(DATASETS[0].key),[values,setValues]=useState({}),[group,setGroup]=useState(''),[status,setStatus]=useState('Loading…'),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false);

 useEffect(()=>{fetch('/api/admin-tool-settings',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setTools(d.tools);setStatus('');}).catch(e=>setStatus(e.message));},[]);

 const tool=tools.find(t=>t.key===dataset);
 const costFields=(tool?.fields || []).filter(f=>f.key.startsWith('cost.'));
 const groups=[...new Set(costFields.map(f=>f.group))].sort((a,b)=>levelNumber(a)-levelNumber(b));
 const config=DATASETS.find(d=>d.key===dataset);

 useEffect(()=>{
  const t=tools.find(x=>x.key===dataset);
  if(!t) return;
  setValues(t.quantities);
  setDirty(false);
  setStatus('');
  const gs=[...new Set(t.fields.filter(f=>f.key.startsWith('cost.')).map(f=>f.group))].sort((a,b)=>levelNumber(a)-levelNumber(b));
  setGroup(gs[0] || '');
 },[dataset,tools]);

 function chooseDataset(key){setDataset(key);}

 async function save(){
  const {quantities,error}=validateToolQuantities(dataset,values);
  if(error){setStatus(error);return;}
  setSaving(true);
  try{
   const r=await fetch('/api/admin-tool-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool:dataset,quantities})});
   const d=await r.json();
   if(!r.ok) throw Error(d.error);
   setTools(prev=>prev.map(t=>t.key===dataset?{...t,quantities:d.quantities}:t));
   setDirty(false);
   setStatus('Saved. The tool will use these amounts when members open or reload it.');
  }catch(e){setStatus(e.message);}finally{setSaving(false);}
 }

 function discard(){
  const t=tools.find(x=>x.key===dataset);
  setValues(t?.quantities || {});
  setDirty(false);
  setStatus('');
 }

 function restoreGroupDefaults(){
  const defaults=defaultQuantities(dataset);
  setValues(prev=>{
   const next={...prev};
   costFields.filter(f=>f.group===group).forEach(f=>{next[f.key]=defaults[f.key];});
   return next;
  });
  setDirty(true);
  setStatus(`Defaults restored for ${group} in the editor. Save to apply.`);
 }

 const groupFields=costFields.filter(f=>f.group===group);

 return <AdminShell onLogout={logout} title="Tool Database" subtitle="Browse every level or tier of a tool's required material amounts">
  <p>These are the same required-amount fields used by each tool&apos;s calculator, organized here as a lookup database instead of a full editor.</p>
  <div className="tool-db-toolbar">
   <label>Data set<select value={dataset} disabled={saving || dirty} onChange={e=>chooseDataset(e.target.value)}>{DATASETS.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select></label>
   <label>{config?.unit || 'Level'}<select value={group} disabled={saving} onChange={e=>setGroup(e.target.value)}>{groups.map(g=><option key={g} value={g}>{g}</option>)}</select></label>
  </div>
  {status&&<p role="status">{status}</p>}
  {dirty&&<p>Unsaved changes. Save or discard before changing data sets.</p>}
  <div className="tool-edit-actions">
   <Button onClick={save} disabled={!tool || saving || !dirty}>{saving?'Saving…':'Save amounts'}</Button>
   <Button variant="quiet" disabled={!dirty || saving} onClick={discard}>Discard changes</Button>
   <Button variant="quiet" disabled={!tool || saving || !group} onClick={restoreGroupDefaults}>Restore this {config?.unit?.toLowerCase() || 'level'}&apos;s defaults</Button>
  </div>
  <fieldset disabled={saving} className="tool-edit-grid">
   {group && <section className="tool-edit-card"><h2>{group}</h2>{groupFields.map(f=><label key={f.key}>{f.label}<input aria-label={`${group}: ${f.label}`} type="number" min={f.min} max={f.max} step={f.step} value={values[f.key] ?? ''} onChange={e=>{setValues(prev=>({...prev,[f.key]:e.target.value===''?'':Number(e.target.value)}));setDirty(true);}}/></label>)}</section>}
  </fieldset>
  <style>{`.tool-db-toolbar,.tool-edit-actions{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0}.tool-db-toolbar label{flex:1;min-width:220px}.tool-edit-grid{border:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:16px}.tool-edit-card{padding:18px;border:1px solid var(--edge);border-radius:10px}.tool-edit-card h2{font-size:17px;margin:0 0 14px}.tool-edit-card label{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:12px;margin:10px 0}.tool-edit-card input{max-width:130px}`}</style>
 </AdminShell>;
}

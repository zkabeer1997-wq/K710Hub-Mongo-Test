'use client';
import {useRouter} from 'next/navigation';
import {useEffect,useState} from 'react';
import AdminShell from '../../../../components/admin/AdminShell';
import {Button} from '../../../../components/ui';
import {validateToolQuantities,defaultQuantities} from '../../../../lib/toolCatalog.mjs';
export default function ToolEditingPage(){
 const router=useRouter();
 async function logout(){await fetch('/api/admin-logout',{method:'POST'});router.push('/admin/login');router.refresh();}
 const [tools,setTools]=useState([]),[selected,setSelected]=useState(''),[values,setValues]=useState({}),[status,setStatus]=useState(''),[saving,setSaving]=useState(false),[dirty,setDirty]=useState(false),[query,setQuery]=useState('');
 useEffect(()=>{fetch('/api/admin-tool-settings',{cache:'no-store'}).then(async r=>{const d=await r.json();if(!r.ok)throw Error(d.error);setTools(d.tools);setSelected(d.tools[0]?.key || '');setValues(d.tools[0]?.quantities || {});}).catch(e=>setStatus(e.message));},[]);
 const tool=tools.find(t=>t.key===selected);
 function choose(key){setSelected(key);setValues(tools.find(t=>t.key===key)?.quantities || {});setDirty(false);setStatus('');setQuery('');}
 async function save(){const {quantities,error}=validateToolQuantities(selected,values);if(error){setStatus(error);return;}setSaving(true);try{const r=await fetch('/api/admin-tool-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({tool:selected,quantities})});const d=await r.json();if(!r.ok)throw Error(d.error);setTools(prev=>prev.map(t=>t.key===selected?{...t,quantities:d.quantities}:t));setDirty(false);setStatus('Saved. Members will use these quantities when they open or reload the tool.');}catch(e){setStatus(e.message);}finally{setSaving(false);}}
 const fields=tool?.fields.filter(f=>`${f.group} ${f.label}`.toLowerCase().includes(query.toLowerCase())) || [];
 const groups=[...new Set(fields.map(f=>f.group))];
 return <AdminShell onLogout={logout} title="Tool Editing" subtitle="Update item quantities used by the calculators">
  <p>Pack prices, merge chances, purchase rules, and calculation methods stay fixed. Changes apply to the selected tool.</p>
  <div className="tool-edit-toolbar"><label>Tool<select value={selected} disabled={saving || dirty} onChange={e=>choose(e.target.value)}>{tools.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}</select></label><label>Find an item<input type="search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Item, pack, or charm level"/></label></div>
  {status&&<p role="status">{status}</p>}
  {dirty&&<p>Unsaved changes. Save or discard before changing tools.</p>}
  <div className="tool-edit-actions"><Button onClick={save} disabled={!tool || saving || !dirty}>{saving?'Saving…':'Save quantities'}</Button><Button variant="quiet" disabled={!dirty || saving} onClick={()=>choose(selected)}>Discard changes</Button><Button variant="quiet" disabled={!tool || saving} onClick={()=>{setValues(defaultQuantities(selected));setDirty(true);setStatus('Defaults restored in the editor. Save to apply.');}}>Restore defaults</Button></div>
  <fieldset disabled={saving} className="tool-edit-grid">{groups.map(group=><section className="tool-edit-card" key={group}><h2>{group}</h2>{fields.filter(f=>f.group===group).map(f=><label key={f.key}>{f.label}<input aria-label={`${group}: ${f.label}`} type="number" min={f.min} max={f.max} step={f.step} value={values[f.key] ?? ''} onChange={e=>{setValues(prev=>({...prev,[f.key]:e.target.value===''?'':Number(e.target.value)}));setDirty(true);}}/></label>)}</section>)}</fieldset>
  <style>{`.tool-edit-toolbar,.tool-edit-actions{display:flex;gap:16px;flex-wrap:wrap;margin:18px 0}.tool-edit-toolbar label{flex:1;min-width:220px}.tool-edit-grid{border:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(min(280px,100%),1fr));gap:16px}.tool-edit-card{padding:18px;border:1px solid var(--edge);border-radius:10px}.tool-edit-card h2{font-size:17px;margin:0 0 14px}.tool-edit-card label{display:flex;justify-content:space-between;gap:12px;align-items:center;font-size:12px;margin:10px 0}.tool-edit-card input{max-width:130px}`}</style>
 </AdminShell>;
}

'use client';
import { useEffect,useState } from 'react';
import NobleAdvisorFields from '../../../../components/NobleAdvisorFields';
import { validateNobleAdvisor } from '../../../../lib/nobleAdvisor.mjs';
import { refreshMemberFormStatus } from '../../../../lib/useMemberFormStatus';
const EMPTY={inGameName:'',wantTroopTraining:'',isTransfer:'',troopSpeedupDays:'',promotingT11:''};
export default function NobleAdvisorForm({memberId}){
 const [form,setForm]=useState(EMPTY),[slots,setSlots]=useState([]),[status,setStatus]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch('/api/noble-advisor',{cache:'no-store',signal:controller.signal}).then(async res=>{const data=await res.json();if(!res.ok)throw Error(data.error);const r=data.record||data.previous||{};setForm({inGameName:r.in_game_name || data.profile_name || '',wantTroopTraining:r.want_troop_training || '',isTransfer:r.is_transfer || '',troopSpeedupDays:r.troop_speedup_days || '',promotingT11:r.promoting_t11 || ''});setSlots(r.avail_day4 || []);}).catch(e=>{if(e.name!=='AbortError')setStatus(e.message);}).finally(()=>setLoading(false));return()=>controller.abort();},[]);
 const updateField=(key,value)=>setForm(prev=>({...prev,[key]:value}));
 async function submit(e){e.preventDefault();const payload={in_game_name:form.inGameName,want_troop_training:form.wantTroopTraining,is_transfer:form.isTransfer,troop_speedup_days:form.troopSpeedupDays,promoting_t11:form.promotingT11,avail_day4:slots};const {error}=validateNobleAdvisor(payload);if(error){setStatus(error);return;}setSaving(true);try{const res=await fetch('/api/noble-advisor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok)throw Error(data.error);setStatus('Saved. Your Noble Advisor booking is done for this cycle. You can come back and change it.');refreshMemberFormStatus();}catch(e){setStatus(e.message || 'Unable to save.');}finally{setSaving(false);}}
 if(loading)return <p>Loading your booking…</p>;
 return <form className="public-form-card minister-hall-form" onSubmit={submit}><p>Player ID: {memberId}</p><label>In-game name<input value={form.inGameName} onChange={e=>updateField('inGameName',e.target.value)} required maxLength={120}/></label><fieldset disabled={saving} style={{border:0,padding:0,minWidth:0}}><NobleAdvisorFields form={form} updateField={updateField} availDay4={slots} onToggle={slot=>setSlots(prev=>prev.includes(slot)?prev.filter(t=>t!==slot):[...prev,slot])}/></fieldset>{status&&<p role="status">{status}</p>}<button className="submit-btn" type="submit" disabled={saving}>{saving?'Saving…':'Save Noble Advisor booking'}</button></form>;
}

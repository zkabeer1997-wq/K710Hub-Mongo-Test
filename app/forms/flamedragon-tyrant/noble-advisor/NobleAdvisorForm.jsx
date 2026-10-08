'use client';
import { useEffect,useState } from 'react';
import NobleAdvisorFields from '../../../../components/NobleAdvisorFields';
import '../../../../components/member/easy-view-fixes.css';
import { validateNobleAdvisor, normalizeNobleSlots, NOBLE_TIME_SLOTS } from '../../../../lib/nobleAdvisor.mjs';
import Link from 'next/link';
import IdentityFields from '../../../../components/member/IdentityFields';
import { refreshMemberFormStatus } from '../../../../lib/useMemberFormStatus';
const EMPTY={inGameName:'',wantTroopTraining:'',isTransfer:'',troopSpeedupDays:'',promotingT11:''};
export default function NobleAdvisorForm({identity}){
 const [form,setForm]=useState({...EMPTY,inGameName:identity?.name||''}),[slots,setSlots]=useState([]),[status,setStatus]=useState(''),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[saved,setSaved]=useState(false);
 useEffect(()=>{const controller=new AbortController();fetch('/api/noble-advisor',{cache:'no-store',signal:controller.signal}).then(async res=>{const data=await res.json();if(!res.ok)throw Error(data.error);const r=data.record||data.previous||{};setForm({inGameName:r.in_game_name || identity?.name || data.identity?.name || '',wantTroopTraining:r.want_troop_training || '',isTransfer:r.is_transfer || '',troopSpeedupDays:r.troop_speedup_days || '',promotingT11:r.promoting_t11 || ''});setSlots(normalizeNobleSlots(r.avail_day4));}).catch(e=>{if(e.name!=='AbortError')setStatus(e.message);}).finally(()=>setLoading(false));return()=>controller.abort();
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[]);

 const updateField=(key,value)=>setForm(prev=>({...prev,[key]:value}));
 async function submit(e){e.preventDefault();const payload={in_game_name:form.inGameName,want_troop_training:form.wantTroopTraining,is_transfer:form.isTransfer,troop_speedup_days:form.troopSpeedupDays,promoting_t11:form.promotingT11,avail_day4:slots};const {error}=validateNobleAdvisor(payload);if(error){setStatus(error);return;}setSaving(true);try{const res=await fetch('/api/noble-advisor',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const data=await res.json();if(!res.ok)throw Error(data.error);setStatus('Saved. Your Noble Advisor booking is done for this cycle. You can come back and change it.');setSaved(true);refreshMemberFormStatus();}catch(e){setStatus(e.message || 'Unable to save.');}finally{setSaving(false);}}
 if(loading)return <p>Loading your booking…</p>;
 return <form className="public-form-card minister-hall-form" onSubmit={submit}><IdentityFields memberId={identity?.memberId||''} name={form.inGameName} onNameChange={v=>updateField('inGameName',v)} label="In-game name" known={Boolean(identity?.name)} inputProps={{required:true}}/><fieldset disabled={saving} style={{border:0,padding:0,minWidth:0}}><NobleAdvisorFields form={form} updateField={updateField} availDay4={slots} slots={NOBLE_TIME_SLOTS} showLocal onToggle={slot=>setSlots(prev=>prev.includes(slot)?prev.filter(t=>t!==slot):[...prev,slot])}/></fieldset>{status&&<p role="status">{status}</p>}{saved&&<p><Link href="/forms/flamedragon-tyrant/my-appointment">See My Noble Advisor appointment</Link></p>}<button className="submit-btn" type="submit" disabled={saving}>{saving?'Saving…':'Save Noble Advisor booking'}</button></form>;
}

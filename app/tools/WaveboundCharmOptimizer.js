'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import { toolConfiguration } from '../../lib/toolCatalog.mjs';
const DEFAULT_CONFIG=toolConfiguration('wavebound-charms');

function choose(n,k){
  if(k<0||k>n) return 0;
  k=Math.min(k,n-k);
  let out=1;
  for(let i=1;i<=k;i++) out=out*(n-k+i)/i;
  return out;
}

function probabilityAtLeast(n,k,p=.25){
  if(k<=0) return 1;
  if(k>n) return 0;
  let total=0;
  for(let i=k;i<=n;i++) total += choose(n,i)*(p**i)*((1-p)**(n-i));
  return Math.min(1,total);
}

function fmt(n){
  return Number(n).toLocaleString(undefined,{maximumFractionDigits:2});
}

export default function WaveboundCharmOptimizer({configuration=DEFAULT_CONFIG}){
  const LEVEL_COSTS=configuration.costs, r=configuration.rewards;
  const [currentLevel,setCurrentLevel]=useState(0);
  const [targetLevel,setTargetLevel]=useState(10);
  const [charmCount,setCharmCount]=useState(18);
  const [ownedGuides,setOwnedGuides]=useState(0);
  const [ownedDesigns,setOwnedDesigns]=useState(0);
  const [common,setCommon]=useState(0);
  const [premium,setPremium]=useState(0);
  const [exquisite,setExquisite]=useState(0);
  const [majestic,setMajestic]=useState(0);
  const [confidence,setConfidence]=useState(.75);
  const [calculated,setCalculated]=useState(false);
  const [hydrated,setHydrated]=useState(false);
  const [saveStatus,setSaveStatus]=useState('Loading your last entry…');
  const saveTimer=useRef(null);

  useEffect(()=>{
    let cancelled=false;
    async function loadSaved(){
      try{
        const response=await fetch('/api/tool-state/wavebound-charms',{cache:'no-store'});
        if(!response.ok){
          setSaveStatus(response.status===401?'Log in to restore saved inputs.':'Could not load saved inputs.');
          return;
        }
        const data=await response.json();
        const s=data?.state;
        if(s && typeof s==='object'){
          if(Number.isFinite(s.currentLevel)) setCurrentLevel(s.currentLevel);
          if(Number.isFinite(s.targetLevel)) setTargetLevel(s.targetLevel);
          if(Number.isFinite(s.charmCount)) setCharmCount(s.charmCount);
          if(Number.isFinite(s.ownedGuides)) setOwnedGuides(s.ownedGuides);
          if(Number.isFinite(s.ownedDesigns)) setOwnedDesigns(s.ownedDesigns);
          if(Number.isFinite(s.common)) setCommon(s.common);
          if(Number.isFinite(s.premium)) setPremium(s.premium);
          if(Number.isFinite(s.exquisite)) setExquisite(s.exquisite);
          if(Number.isFinite(s.majestic)) setMajestic(s.majestic);
          if(Number.isFinite(s.confidence)) setConfidence(s.confidence);
          if(typeof s.calculated==='boolean') setCalculated(s.calculated);
          setSaveStatus('Last saved entry restored.');
        }else{
          setSaveStatus('No saved entry yet. Your inputs will save automatically.');
        }
      }catch{
        setSaveStatus('Could not load saved inputs.');
      }finally{
        if(!cancelled) setHydrated(true);
      }
    }
    loadSaved();
    return()=>{cancelled=true;if(saveTimer.current) clearTimeout(saveTimer.current);};
  },[]);

  useEffect(()=>{
    if(!hydrated) return;
    if(saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus('Saving…');
    saveTimer.current=setTimeout(async()=>{
      try{
        const response=await fetch('/api/tool-state/wavebound-charms',{
          method:'PUT',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({state:{currentLevel,targetLevel,charmCount,ownedGuides,ownedDesigns,common,premium,exquisite,majestic,confidence,calculated}}),
        });
        setSaveStatus(response.ok?'Saved to your member profile.':response.status===401?'Log in to save inputs.':'Save failed.');
      }catch{
        setSaveStatus('Save failed.');
      }
    },700);
    return()=>{if(saveTimer.current) clearTimeout(saveTimer.current);};
  },[hydrated,currentLevel,targetLevel,charmCount,ownedGuides,ownedDesigns,common,premium,exquisite,majestic,confidence,calculated]);

  const costs=useMemo(()=>{
    let guides=0,designs=0;
    if(targetLevel>currentLevel){
      for(let level=currentLevel+1;level<=targetLevel;level++){
        guides += LEVEL_COSTS[level][0];
        designs += LEVEL_COSTS[level][1];
      }
    }
    return {guides:guides*charmCount,designs:designs*charmCount};
  },[currentLevel,targetLevel,charmCount,LEVEL_COSTS]);

  const result=useMemo(()=>{
    if(targetLevel<=currentLevel) return null;
    let plans=[];
    const maxCommonMerges=Math.floor(common/3);
    for(let cm=0;cm<=maxCommonMerges;cm++){
      const premiumAvailable=premium+cm;
      const maxPremiumMerges=Math.floor(premiumAvailable/3);
      for(let pm=0;pm<=maxPremiumMerges;pm++){
        const remainingCommon=common-(cm*3);
        const remainingPremium=premiumAvailable-(pm*3);
        const fixedGuides=ownedGuides+(remainingPremium*r['premium.g'])+(exquisite*r['exquisite.g'])+(majestic*r['majestic.g'])+(pm*r['exquisite.g']);
        const fixedDesigns=ownedDesigns+(remainingCommon*r['common.d'])+(remainingPremium*r['premium.d'])+(exquisite*r['exquisite.d'])+(majestic*r['majestic.d'])+(pm*r['exquisite.d']);
        const needMajestic=Math.max(0,Math.ceil((costs.guides-fixedGuides)/(r['majestic.g']-r['exquisite.g'])),Math.ceil((costs.designs-fixedDesigns)/(r['majestic.d']-r['exquisite.d'])));
        const success=probabilityAtLeast(pm,needMajestic);
        const expectedGuides=fixedGuides+(pm*.25*(r['majestic.g']-r['exquisite.g']));
        const expectedDesigns=fixedDesigns+(pm*.25*(r['majestic.d']-r['exquisite.d']));
        const expectedShards=(exquisite*r['exquisite.shards'])+(majestic*r['majestic.shards'])+(pm*(.75*r['exquisite.shards']+.25*r['majestic.shards']));
        plans.push({cm,pm,remainingCommon,remainingPremium,needMajestic,success,expectedGuides,expectedDesigns,expectedShards,merges:cm+pm});
      }
    }
    const feasible=plans.filter(p=>p.success+1e-12>=confidence);
    if(feasible.length){
      feasible.sort((a,b)=>a.merges-b.merges || b.success-a.success || (b.expectedGuides+b.expectedDesigns)-(a.expectedGuides+a.expectedDesigns));
      return {...feasible[0],feasible:true};
    }
    plans.sort((a,b)=>b.success-a.success || b.merges-a.merges);
    return plans.length ? {...plans[0],feasible:false} : null;
  },[targetLevel,currentLevel,common,premium,exquisite,majestic,ownedGuides,ownedDesigns,costs,confidence,r]);

  const field=(label,value,setter,min=0,max=null)=>(
    <label className="wo-field">
      <span>{label}</span>
      <input type="number" min={min} max={max ?? undefined} value={value} onChange={e=>setter(Math.max(min,Number(e.target.value)||0))}/>
    </label>
  );

  return (
    <section className="wavebound-tool">
      <header className="wo-head">
        <span className="wo-eyebrow">Wavebound Voyage</span>
        <h2>Charm Merge Optimizer</h2>
        <p>Calculate how many Common and Premium Tidal Treasures to merge while accounting for the 75% Exquisite / 25% Majestic high-tier outcome.</p>
        <div className="wo-save-status" role="status">{saveStatus}</div>
      </header>

      <div className="wo-grid">
        <div className="wo-panel">
          <h3>Charm target</h3>
          <div className="wo-fields three">
            <label className="wo-field"><span>Current level</span><select value={currentLevel} onChange={e=>setCurrentLevel(Number(e.target.value))}>{Array.from({length:23},(_,i)=><option key={i} value={i}>Level {i}</option>)}</select></label>
            <label className="wo-field"><span>Target level</span><select value={targetLevel} onChange={e=>setTargetLevel(Number(e.target.value))}>{Array.from({length:23},(_,i)=><option key={i} value={i}>Level {i}</option>)}</select></label>
            {field('Charms upgrading',charmCount,v=>setCharmCount(Math.min(18,v)),1,18)}
          </div>

          <h3>Materials owned</h3>
          <div className="wo-fields">{field('Charm Guides',ownedGuides,setOwnedGuides)}{field('Charm Designs',ownedDesigns,setOwnedDesigns)}</div>

          <h3>Tidal Treasures</h3>
          <div className="wo-fields">{field('Common',common,setCommon)}{field('Premium',premium,setPremium)}{field('Exquisite',exquisite,setExquisite)}{field('Majestic',majestic,setMajestic)}</div>

          <h3>Planning confidence</h3>
          <label className="wo-field"><span>Minimum chance of reaching the target</span><select value={confidence} onChange={e=>setConfidence(Number(e.target.value))}><option value={.5}>50%</option><option value={.75}>75%</option><option value={.9}>90%</option><option value={.95}>95%</option><option value={.99}>99%</option><option value={1}>100% / worst-case</option></select></label>
          <button className="wo-button" onClick={()=>setCalculated(true)}>Optimize merges</button>
        </div>

        <div className="wo-panel wo-result">
          <h3>Recommended plan</h3>
          {!calculated && <div className="wo-empty">Enter your inventory, then optimize the merge plan.</div>}
          {calculated && targetLevel<=currentLevel && <div className="wo-alert bad">Target level must be higher than current level.</div>}
          {calculated && result && targetLevel>currentLevel && <>
            <div className={`wo-alert ${result.feasible?'good':'bad'}`}>{result.feasible ? `Minimum merge plan found at ${(result.success*100).toFixed(result.success===1?0:1)}% modeled success.` : `Current chest inventory cannot reach the selected confidence. Showing the strongest available plan.`}</div>
            <div className="wo-metrics">
              <div><span>Guides required</span><strong>{fmt(Math.max(0,costs.guides-ownedGuides))}</strong></div>
              <div><span>Designs required</span><strong>{fmt(Math.max(0,costs.designs-ownedDesigns))}</strong></div>
              <div><span>Common merges</span><strong>{result.cm}</strong></div>
              <div><span>Premium merges</span><strong>{result.pm}</strong></div>
            </div>
            <ol className="wo-steps">
              <li><strong>Common → Premium:</strong> merge {result.cm*3} Common chests into {result.cm} Premium chest{result.cm===1?'':'s'}.</li>
              <li><strong>Premium → High Tier:</strong> merge {result.pm*3} Premium chests into {result.pm} Exquisite/Majestic result{result.pm===1?'':'s'}.</li>
              <li><strong>Open remaining:</strong> {result.remainingCommon} Common and {result.remainingPremium} Premium, plus all existing and newly-created high-tier chests.</li>
            </ol>
            <div className="wo-projection">
              <div><span>Success chance</span><strong>{(result.success*100).toFixed(result.success===1?0:1)}%</strong></div>
              <div><span>Expected Guides</span><strong>{fmt(result.expectedGuides)}</strong></div>
              <div><span>Expected Designs</span><strong>{fmt(result.expectedDesigns)}</strong></div>
              <div><span>Expected Mythic Shards</span><strong>{fmt(result.expectedShards)}</strong></div>
            </div>
            <p className="wo-note">A Premium merge needs 3 Premium chests. Each merged result is 75% Exquisite and 25% Majestic. The calculator models Majestic outcomes with a binomial probability and treats 100% confidence as requiring the target even if every high-tier result is Exquisite.</p>
          </>}
        </div>
      </div>

      <style jsx>{`
        .wavebound-tool{border:1px solid rgba(102,188,222,.25);background:linear-gradient(180deg,#0e2331,#091822);border-radius:18px;padding:22px;box-shadow:0 20px 60px rgba(0,0,0,.28)}
        .wo-head{margin-bottom:18px}.wo-eyebrow{font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#68d9ff;font-weight:900}.wo-head h2{font-family:Georgia,'Times New Roman',serif;font-size:34px;margin:6px 0;color:#edf8ff;font-weight:500}.wo-head p{color:#8ea9b9;max-width:760px;line-height:1.6;font-size:13px;margin:0}.wo-save-status{margin-top:10px;color:#b7cbd6;font-size:11px}
        .wo-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px}.wo-panel{border:1px solid #21485d;background:#0a1a25;border-radius:14px;padding:17px}.wo-panel h3{font-size:11px;text-transform:uppercase;letter-spacing:.12em;color:#bdd1dc;margin:4px 0 10px}.wo-panel h3:not(:first-child){margin-top:18px}
        .wo-fields{display:grid;grid-template-columns:1fr 1fr;gap:9px}.wo-fields.three{grid-template-columns:repeat(3,1fr)}.wo-field{display:flex;flex-direction:column;gap:5px;color:#9db5c3;font-size:11px;font-weight:700}.wo-field input,.wo-field select{width:100%;border:1px solid #28536a;border-radius:9px;background:#06141d;color:#edf8ff;padding:10px;font:inherit;font-size:13px}.wo-field input:focus,.wo-field select:focus{outline:2px solid rgba(104,217,255,.3);border-color:#68d9ff}
        .wo-button{width:100%;margin-top:16px;border:0;border-radius:10px;padding:12px 14px;background:linear-gradient(135deg,#65d8ff,#a1ecff);color:#04121a;font-weight:900;cursor:pointer}.wo-empty{display:grid;place-items:center;min-height:300px;color:#68879a;text-align:center;border:1px dashed #25485b;border-radius:12px;padding:20px}.wo-alert{padding:11px 12px;border-radius:10px;font-size:12px;font-weight:800;margin-bottom:12px}.wo-alert.good{color:#aaf3cf;background:rgba(90,220,156,.08);border:1px solid rgba(90,220,156,.25)}.wo-alert.bad{color:#ffc4b5;background:rgba(255,130,100,.08);border:1px solid rgba(255,130,100,.24)}
        .wo-metrics,.wo-projection{display:grid;grid-template-columns:repeat(2,1fr);gap:8px}.wo-metrics>div,.wo-projection>div{border:1px solid #1d4255;border-radius:10px;background:#07151e;padding:11px}.wo-metrics span,.wo-projection span{display:block;color:#7898aa;font-size:9px;letter-spacing:.08em;text-transform:uppercase}.wo-metrics strong,.wo-projection strong{display:block;margin-top:4px;color:#eef9ff;font-size:20px}.wo-steps{padding-left:20px;color:#a2b8c4;font-size:12px;line-height:1.65;margin:16px 0}.wo-steps strong{color:#dcecf4}.wo-note{color:#6f8b9b;font-size:10px;line-height:1.55;margin:12px 0 0}
        @media(max-width:900px){.wo-grid{grid-template-columns:1fr}}@media(max-width:620px){.wavebound-tool{padding:14px}.wo-fields,.wo-fields.three{grid-template-columns:1fr}.wo-head h2{font-size:28px}}
      `}</style>
    </section>
  );
}

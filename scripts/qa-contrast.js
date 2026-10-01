/**
 * Pixel-sampled WCAG contrast check (axe cannot score text over gradients/images).
 * Hides all text, screenshots the page, samples the real background behind each
 * text node and reports AA failures (4.5:1, or 3:1 for large text).
 *
 *   QA_CHROMIUM=... [MEMBER=1] node scripts/qa-contrast.js /,/about,/interest
 *
 * Known false positives: the off-screen skip link and gradient-clip (.k-engraved) headings.
 */
// Pixel-sampled contrast check: hides all text, screenshots, samples bg under each text element.
const { chromium } = require('playwright');
const routes=(process.argv[2]||'/').split(',');
(async()=>{
 const b=await chromium.launch({executablePath:process.env.QA_CHROMIUM||undefined,args:['--no-sandbox']});
 for(const vw of (process.env.VW||'1440,390').split(',').map(Number)){
 const ctx=await b.newContext({viewport:{width:vw,height:900},reducedMotion:'reduce'});
 await ctx.addInitScript(()=>{try{sessionStorage.setItem('k710-forge-seen','1');localStorage.setItem('k710-language-v1','en')}catch{}});
 if(process.env.MEMBER){const crypto=require('crypto');const b64=s=>Buffer.from(s).toString('base64url');const pl=b64(JSON.stringify({memberId:'qa-member',role:'member',nonce:'qa',exp:Date.now()+3600e3}));const sig=crypto.createHash('sha256').update(`k710-member-v2:${pl}:qa-smoke-secret`).digest('hex');await ctx.addCookies([{name:'k710_member_session',value:pl+'.'+sig,url:'http://localhost:3111'}]);}
 const p=await ctx.newPage();
 for(const r of routes){
  await p.goto('http://localhost:3111'+r,{waitUntil:'networkidle'});
  await p.evaluate(()=>window.scrollTo(0,0));
  const items=await p.evaluate(()=>{
   const out=[];const w=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
   const seen=new Set();let n;
   while(n=w.nextNode()){const t=n.textContent.trim();if(!t)continue;const el=n.parentElement;if(seen.has(el))continue;
    const cs=getComputedStyle(el);if(cs.visibility==='hidden'||cs.display==='none')continue;
    if(el.closest('[aria-hidden="true"],script,style,noscript,[inert]'))continue;
    if(el.closest('button:disabled,input:disabled,[aria-disabled="true"]'))continue;
    const dt=el.closest('details:not([open])');if(dt&&!el.closest('summary'))continue;
    const r=document.createRange();r.selectNodeContents(n);const rc=r.getBoundingClientRect();if(rc.width<2||rc.height<2)continue;
    let op=1,e=el;while(e){op*=parseFloat(getComputedStyle(e).opacity);e=e.parentElement}
    if(op<0.05)continue;
    seen.add(el);
    out.push({t:t.slice(0,50),c:cs.color,fs:parseFloat(cs.fontSize),fw:parseInt(cs.fontWeight),op,x:rc.left+scrollX,y:rc.top+scrollY,w:rc.width,h:rc.height,cls:(el.className&&el.className.baseVal===undefined?el.className:'')+'',tag:el.tagName});}
   return out;});
  await p.addStyleTag({content:'*,*::before,*::after{color:transparent!important;-webkit-text-fill-color:transparent!important;text-shadow:none!important;caret-color:transparent!important}::placeholder{color:transparent!important}'});
  const h=await p.evaluate(()=>document.documentElement.scrollHeight);
  const buf=await p.screenshot({fullPage:true,animations:'disabled'});
  const res=await p.evaluate(async({b64,items})=>{
   const img=new Image();img.src='data:image/png;base64,'+b64;await img.decode();
   const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const g=c.getContext('2d');g.drawImage(img,0,0);
   const lum=([r,g,b])=>{const f=v=>{v/=255;return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4)};return .2126*f(r)+.7152*f(g)+.0722*f(b)};
   const bad=[];
   for(const it of items){
    const m=it.c.match(/[\d.]+/g).map(Number);const a=(m[3]===undefined?1:m[3])*it.op;
    const x=Math.max(0,Math.floor(it.x)),y=Math.max(0,Math.floor(it.y)),w=Math.min(Math.ceil(it.w),img.width-x),hh=Math.min(Math.ceil(it.h),img.height-y);
    if(w<1||hh<1||y>=img.height)continue;
    const d=g.getImageData(x,y,w,hh).data;let worst=99;
    const step=Math.max(1,Math.floor(d.length/4/60));
    for(let i=0;i<d.length;i+=4*step){const bg=[d[i],d[i+1],d[i+2]];const fg=[0,1,2].map(k=>m[k]*a+bg[k]*(1-a));
     const l1=lum(fg),l2=lum(bg);const cr=(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05);if(cr<worst)worst=cr;}
    const large=it.fs>=24||(it.fs>=18.66&&it.fw>=700);const need=large?3:4.5;
    if(worst<need)bad.push({t:it.t,cr:worst.toFixed(2),need,fs:it.fs,c:it.c,cls:it.cls.slice(0,40),tag:it.tag});
   }
   return {n:items.length,bad};},{b64:buf.toString('base64'),items});
  console.log(`== ${vw} ${r} texts=${res.n} fail=${res.bad.length}`);
  res.bad.slice(0,+(process.env.MAX||25)).forEach(x=>console.log(`  ${x.cr}<${x.need} ${x.tag}.${x.cls} "${x.t}" ${x.c} ${x.fs}px`));
 }
 await ctx.close();}
 await b.close();
})();

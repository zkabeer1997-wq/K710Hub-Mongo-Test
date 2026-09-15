// Full route-by-route visual audit for the sitewide redesign branch.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { chromium } = require('playwright');

const BASE = process.env.QA_BASE || 'http://127.0.0.1:3111';
const OUT = path.join(process.cwd(), 'qa-sitewide');
const SHOTS = path.join(OUT, 'screenshots');
const WIDTHS = [375, 768, 1440];
const MEMBER_ID = 'qa-sitewide-member';
const ROUTES = [
  '/', '/about', '/timeline', '/alliances', '/alliances/710', '/alliances/red', '/alliances/sky',
  '/chronometer', '/gate', '/guides', '/guides/rally-joiner', '/guides/kvk-preparation', '/guides/rally-lead',
  '/events', '/events/castle-battle', '/events/flamedragon-tyrant-battle', '/interest', '/player-record',
  '/forms', '/player-record/form', '/power-profile', '/flamedragon', '/prep-phase-backpack', '/tools',
  '/tools/adventure-stall', '/tools/charm-pack-optimizer', '/tools/flamedragon-shop', '/tools/pet-pack-optimizer', '/tools/wavebound-charms',
  '/admin', '/admin/login', '/admin/dashboard', '/admin/dashboard/guides', '/admin/dashboard/events',
  '/admin/dashboard/alliances', '/admin/dashboard/form-gates', '/admin/dashboard/member-pins', '/admin/dashboard/interest',
  '/admin/dashboard/prep-ministers', '/admin/dashboard/flamedragon',
  '/design-lab/homepage', '/design-lab/homepage-fusion'
];
const MEMBER_PREFIXES = ['/forms','/player-record/form','/power-profile','/flamedragon','/prep-phase-backpack','/tools'];
const ADMIN_PREFIX = '/admin/dashboard';

function b64(v){return Buffer.from(v,'utf8').toString('base64url')}
function sha(v){return crypto.createHash('sha256').update(v).digest('hex')}
function mintMember(){const secret=process.env.MEMBER_SESSION_SECRET||process.env.ADMIN_PASSWORD||'';if(!secret)return null;const payload=b64(JSON.stringify({memberId:MEMBER_ID,nonce:crypto.randomUUID(),exp:Date.now()+12*60*60*1000}));return `${payload}.${sha(`k710-member-v2:${payload}:${secret}`)}`}
function mintAdmin(){const secret=process.env.ADMIN_PASSWORD||'';if(!secret)return null;const payload=b64(JSON.stringify({nonce:crypto.randomUUID(),exp:Date.now()+8*60*60*1000}));return `${payload}.${sha(`tff-admin-session-v2:${payload}:${secret}`)}`}
function safeName(route,width){return `${(route.replace(/^\//,'').replace(/\//g,'-')||'home')}@${width}.png`}
function needsMember(route){return MEMBER_PREFIXES.some(p=>route===p||route.startsWith(p+'/'))}
function needsAdmin(route){return route===ADMIN_PREFIX||route.startsWith(ADMIN_PREFIX+'/')}
async function setRouteAuth(ctx,route,host,member,admin){
  await ctx.clearCookies();
  const cookies=[];
  if(needsMember(route)&&member) cookies.push({name:'k710_member_session',value:member,domain:host,path:'/'});
  if(needsAdmin(route)&&admin) cookies.push({name:'tff_admin_session',value:admin,domain:host,path:'/'});
  if(cookies.length) await ctx.addCookies(cookies);
}

(async()=>{
  fs.rmSync(OUT,{recursive:true,force:true}); fs.mkdirSync(SHOTS,{recursive:true});
  const browser=await chromium.launch({args:['--no-sandbox']});
  const report=[];
  const member=mintMember(); const admin=mintAdmin();
  for(const width of WIDTHS){
    const ctx=await browser.newContext({viewport:{width,height:900}});
    await ctx.addInitScript(()=>{try{localStorage.setItem('k710-language-v1','en')}catch{}});
    const host=new URL(BASE).hostname;
    const page=await ctx.newPage();
    for(const route of ROUTES){
      await setRouteAuth(ctx,route,host,member,admin);
      const errors=[]; const failed=[];
      const onConsole=(msg)=>{if(msg.type()==='error') errors.push(msg.text())};
      const onPageError=(err)=>errors.push(`pageerror: ${err.message}`);
      const onFailed=(req)=>failed.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText||'failed'}`);
      page.on('console',onConsole); page.on('pageerror',onPageError); page.on('requestfailed',onFailed);
      let status=null, finalUrl='', navError='';
      try{
        const res=await page.goto(BASE+route,{waitUntil:'domcontentloaded',timeout:15000});
        status=res?.status()??null; finalUrl=page.url();
        await page.waitForTimeout(700);
        await page.evaluate(()=>document.fonts?.ready).catch(()=>{});
      }catch(err){navError=err.message; finalUrl=page.url()}
      const metrics=await page.evaluate(()=>{
        const main=document.querySelector('#main')||document.querySelector('main');
        const h1=document.querySelector('h1');
        const body=document.body;
        return {
          title:document.title,
          h1:(h1?.textContent||'').trim().slice(0,160),
          hasMain:!!main,
          bodyText:(body?.innerText||'').trim().length,
          scrollWidth:document.documentElement.scrollWidth,
          clientWidth:document.documentElement.clientWidth,
          overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth,
          header:!!document.querySelector('.site-header'),
          footer:!!document.querySelector('.site-footer'),
          adminShell:!!document.querySelector('.admin-shell'),
          atmosphere:!!document.querySelector('.site-atmosphere'),
          adminEditControls:document.querySelectorAll('[class*="edit"],[data-edit]').length
        }
      }).catch(()=>({}));
      const screenshot=path.join(SHOTS,safeName(route,width));
      await page.screenshot({path:screenshot,fullPage:true}).catch(()=>{});
      const relevantErrors=errors.filter(e=>!e.includes('favicon')&&!e.includes('Failed to load resource: the server responded with a status of 404'));
      report.push({route,width,status,finalUrl,navError,...metrics,consoleErrors:relevantErrors.slice(0,20),requestFailures:failed.slice(0,20),expectedAuth:needsAdmin(route)?'admin':needsMember(route)?'member':'public'});
      page.off('console',onConsole); page.off('pageerror',onPageError); page.off('requestfailed',onFailed);
    }
    await ctx.close();
  }
  await browser.close();
  fs.writeFileSync(path.join(OUT,'report.json'),JSON.stringify(report,null,2));
  const findings=report.filter(r=>r.navError||!r.hasMain||r.bodyText<20||(r.overflow||0)>2||(r.status&&r.status>=500)||r.consoleErrors.length);
  const lines=['# K710 Sitewide Playwright Audit','',`Routes tested: ${ROUTES.length}`,`Viewports: ${WIDTHS.join(', ')}`,`Checks: ${report.length}`,'',`Flagged checks: ${findings.length}`,''];
  for(const r of findings){lines.push(`- ${r.route} @ ${r.width}px — status=${r.status ?? 'n/a'}, overflow=${r.overflow ?? 'n/a'}, h1=${JSON.stringify(r.h1||'')}${r.navError?`, nav=${r.navError}`:''}${r.consoleErrors.length?`, console=${r.consoleErrors.join(' | ')}`:''}`)}
  fs.writeFileSync(path.join(OUT,'summary.md'),lines.join('\n'));
  console.log(lines.join('\n'));
  if(report.some(r=>r.navError||(r.status&&r.status>=500)||!r.hasMain||(r.overflow||0)>12)) process.exitCode=1;
})().catch(err=>{console.error(err);process.exit(1)});

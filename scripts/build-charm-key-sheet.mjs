// Builds a self-contained HTML "level key sheet" for labelling real charm gems.
//   node scripts/build-charm-key-sheet.mjs <folder of account images> <out.html>
// Real gems from the images are grouped by shape; the owner picks the level of each group (or of single
// gems), then copies/downloads the answers as JSON. Nothing leaves the browser.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import sharp from 'sharp';
import { observeGem } from '../lib/scan/readers/charmReader.mjs';
import { charmWindows, readGovernorCharms } from '../lib/scan/kinds/governorProfile/charms.mjs';
import { crop } from '../lib/scan/normalize.mjs';

const [dir, out] = process.argv.slice(2);
if (!dir || !out) { console.error('usage: node scripts/build-charm-key-sheet.mjs <images folder> <out.html>'); process.exit(1); }
const ROOT = path.resolve(import.meta.dirname, '..');
const K = 46;
const MIN_WIDTH = 600; // smaller images are too low-resolution to read

// distinct images only (some are byte-identical copies)
const seen = new Set();
const files = fs.readdirSync(dir).filter((f) => /\.(webp|png|jpe?g)$/i.test(f)).sort().filter((f) => {
  const h = crypto.createHash('md5').update(fs.readFileSync(path.join(dir, f))).digest('hex');
  if (seen.has(h)) return false; seen.add(h); return true;
});

const gems = [];
const skipped = [];
for (const f of files) {
  const { data, info } = await sharp(path.join(dir, f)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  if (info.width < MIN_WIDTH) { skipped.push(f.slice(0, 2)); continue; }
  const px = { width: info.width, height: info.height, data: new Uint8ClampedArray(data) };
  const reads = new Map(readGovernorCharms(px).map((r) => [r.slot, r.level]));
  for (const w of charmWindows(px)) {
    const win = crop(px, w.rect);
    const o = observeGem(win, w.troop);
    if (!o.ok) continue;
    const s = o.summary;
    gems.push({ id: f.slice(0, 2), slot: w.slot, troop: w.troop, vec: Float32Array.from([...s.mask, ...s.core]), win, read: reads.get(w.slot) });
  }
}

// k-means (kmeans++ start, fixed seed) on silhouette + body shape: colour-agnostic
let seed = 5; const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const D = gems[0].vec.length;
const dist = (a, b) => { let s = 0; for (let i = 0; i < D; i += 1) { const e = a[i] - b[i]; s += e * e; } return s; };
let cent = [Float32Array.from(gems[Math.floor(rnd() * gems.length)].vec)];
while (cent.length < K) {
  const d = gems.map((g) => Math.min(...cent.map((c) => dist(g.vec, c))));
  let r = rnd() * d.reduce((a, b) => a + b, 0); let i = 0;
  for (; i < d.length - 1; i += 1) { r -= d[i]; if (r <= 0) break; }
  cent.push(Float32Array.from(gems[i].vec));
}
const asg = new Array(gems.length).fill(0);
for (let it = 0; it < 40; it += 1) {
  gems.forEach((g, gi) => { let b = 0; let bd = Infinity; cent.forEach((c, ci) => { const d = dist(g.vec, c); if (d < bd) { bd = d; b = ci; } }); asg[gi] = b; });
  cent = cent.map((c, ci) => {
    const m = new Float32Array(D); let n = 0;
    gems.forEach((g, gi) => { if (asg[gi] === ci) { n += 1; for (let i = 0; i < D; i += 1) m[i] += g.vec[i]; } });
    return n ? m.map((v) => v / n) : c;
  });
}
const groups = cent.map((c, ci) => ({
  members: gems.map((g, gi) => ({ g, d: dist(g.vec, c), gi })).filter((x) => asg[x.gi] === ci).sort((a, b) => a.d - b.d),
})).filter((g) => g.members.length).sort((a, b) => b.members.length - a.members.length);

const thumb = async (win, size) => `data:image/webp;base64,${(await sharp(Buffer.from(win.data), { raw: { width: win.width, height: win.height, channels: 4 } }).resize(size, size, { fit: 'contain', background: '#0000' }).webp({ quality: 82 }).toBuffer()).toString('base64')}`;

const refArt = {};
for (const troop of ['cavalry', 'infantry', 'archer']) {
  refArt[troop] = [];
  for (let l = 1; l <= 22; l += 1) {
    const b = await sharp(path.join(ROOT, `public/images/loadout/charms/${troop}/level-${l}.webp`)).resize(72, 72, { fit: 'contain', background: '#0000' }).webp({ quality: 85 }).toBuffer();
    refArt[troop].push(`data:image/webp;base64,${b.toString('base64')}`);
  }
}

const SAMPLE = 14;
const cards = [];
for (const [gi, grp] of groups.entries()) {
  const step = Math.max(1, Math.floor(grp.members.length / SAMPLE));
  const picks = grp.members.filter((_, i) => i % step === 0).slice(0, SAMPLE);
  const votes = {};
  for (const m of grp.members) if (m.g.read?.value) votes[m.g.read.value] = (votes[m.g.read.value] || 0) + 1;
  const top = Object.entries(votes).sort((a, b) => b[1] - a[1])[0];
  cards.push({
    id: `g${gi + 1}`,
    n: grp.members.length,
    suggested: top ? Number(top[0]) : null,
    suggestedShare: top ? Number((top[1] / grp.members.length).toFixed(2)) : 0,
    members: grp.members.map((m) => `${m.g.id}:${m.g.slot}`),
    samples: await Promise.all(picks.map(async (m) => ({ key: `${m.g.id}:${m.g.slot}`, img: await thumb(m.g.win, 76) }))),
  });
}

const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Charm level key sheet</title>
<style>
:root{color-scheme:dark;--bg:#12161c;--panel:#1b222c;--line:#2e3948;--text:#e8edf3;--muted:#9fb0c3;--ok:#3fb27f;--warn:#e0a030;--accent:#7cc4ff}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:15px/1.45 system-ui,sans-serif}
header{position:sticky;top:0;z-index:5;background:#0e1217;border-bottom:1px solid var(--line);padding:10px 16px}
h1{font-size:18px;margin:0 0 4px}p{margin:4px 0;color:var(--muted)}
.bar{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px}
button{background:var(--accent);color:#04121f;border:0;border-radius:6px;padding:8px 12px;font-weight:600;cursor:pointer}button.sec{background:#2a3545;color:var(--text)}
.ref{display:none;margin-top:8px;max-height:46vh;overflow:auto}.ref.open{display:block}
.ref h3{font-size:13px;margin:8px 0 2px;color:var(--muted)}.refrow{display:flex;flex-wrap:wrap;gap:4px}
.refc{width:64px;text-align:center;font-size:12px}.refc img{width:56px;height:56px;display:block;margin:0 auto;background:#8fb0cc;border-radius:6px}
main{padding:12px 16px;display:grid;gap:12px;max-width:1100px;margin:0 auto}
.card{background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:10px 12px}.card.done{border-color:var(--ok)}
.top{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.top b{font-size:16px}
select{background:#0e1217;color:var(--text);border:1px solid var(--line);border-radius:6px;padding:6px 8px;font-size:15px}
.sug{color:var(--muted);font-size:13px}
.samples{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.s{position:relative;width:82px}.s img{width:76px;height:76px;display:block;background:#8fb0cc;border-radius:6px}
.s select{width:76px;margin-top:2px;font-size:12px;padding:2px}.s.over img{outline:3px solid var(--warn)}
.note{font-size:12px;color:var(--muted)}
</style></head><body>
<header>
<h1>Charm level key sheet</h1>
<p>Each card is a group of real gems with a similar shape. Pick the level (1 to 22) for the whole group. If one gem in a card is a different level, change just that gem under its picture (it turns orange). Use "mixed" if the card is a jumble.</p>
<div class="bar"><span id="progress"></span><button id="toggleRef" class="sec">Show / hide reference art</button><button id="copy">Copy answers</button><button id="download" class="sec">Download answers (.json)</button><span class="note" id="msg"></span></div>
<div class="ref" id="ref"></div>
</header>
<main id="cards"></main>
<script>
const CARDS=${JSON.stringify(cards)};
const REF=${JSON.stringify(refArt)};
const KEY='charm-key-sheet-v1';
let state={};try{state=JSON.parse(localStorage.getItem(KEY)||'{}')}catch{}
const save=()=>{try{localStorage.setItem(KEY,JSON.stringify(state))}catch{}};
const levels=Array.from({length:22},(_,i)=>i+1);
const opt=(sel,extra=[])=>'<option value="">?</option>'+extra.map(e=>'<option value="'+e[0]+'"'+(sel===e[0]?' selected':'')+'>'+e[1]+'</option>').join('')+levels.map(l=>'<option value="'+l+'"'+(String(sel)===String(l)?' selected':'')+'>'+l+'</option>').join('');
document.getElementById('ref').innerHTML=Object.entries(REF).map(([t,a])=>'<h3>'+t+' (levels 1 to 22)</h3><div class="refrow">'+a.map((s,i)=>'<div class="refc"><img src="'+s+'" alt="level '+(i+1)+'">'+(i+1)+'</div>').join('')+'</div>').join('');
document.getElementById('toggleRef').onclick=()=>document.getElementById('ref').classList.toggle('open');
function render(){
  const root=document.getElementById('cards');root.innerHTML='';let done=0;
  for(const c of CARDS){
    const g=state[c.id]||{};if(g.level)done++;
    const el=document.createElement('section');el.className='card'+(g.level?' done':'');
    el.innerHTML='<div class="top"><b>Group '+c.id.slice(1)+'</b><span class="note">'+c.n+' gems</span><label>Level <select data-g="'+c.id+'">'+opt(g.level,[['mixed','mixed / unsure'],['none','not a charm']])+'</select></label>'+(c.suggested?'<span class="sug">my guess: '+c.suggested+' (reader agrees on '+Math.round(c.suggestedShare*100)+'%)</span>':'')+'</div><div class="samples">'+c.samples.map(s=>{const o=(g.over||{})[s.key];return '<div class="s'+(o?' over':'')+'"><img src="'+s.img+'" alt=""><select data-k="'+s.key+'" data-g="'+c.id+'" title="level of this gem only">'+opt(o,[['group','as group']])+'</select></div>'}).join('')+'</div>';
    root.appendChild(el);
  }
  root.querySelectorAll('select').forEach(s=>s.onchange=()=>{const id=s.dataset.g;const st=state[id]=state[id]||{over:{}};st.over=st.over||{};
    if(s.dataset.k){if(s.value&&s.value!=='group')st.over[s.dataset.k]=s.value;else delete st.over[s.dataset.k]}else st.level=s.value||undefined;save();render()});
  document.getElementById('progress').textContent=done+' of '+CARDS.length+' groups answered';
}
function answers(){
  const out={_note:'level per gem key "<image>:<slot>"; null = mixed/unsure/not a charm',labels:{}};
  for(const c of CARDS){const g=state[c.id]||{};for(const m of c.members){const o=(g.over||{})[m];let v=o||g.level;if(!v||v==='group'||v==='mixed'||v==='none')v=null;else v=Number(v);out.labels[m]=v}}
  return JSON.stringify(out,null,1);
}
document.getElementById('copy').onclick=async()=>{try{await navigator.clipboard.writeText(answers());msg('Copied. Paste it into the chat.')}catch{msg('Copy failed: use Download instead.')}};
document.getElementById('download').onclick=()=>{const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([answers()],{type:'application/json'}));a.download='charm-key-answers.json';a.click();msg('Saved charm-key-answers.json to your Downloads folder.')};
function msg(t){document.getElementById('msg').textContent=t}
render();
</script></body></html>`;
fs.writeFileSync(out, page);
console.log(`wrote ${out}: ${cards.length} groups, ${gems.length} gems from ${files.length - skipped.length} images (skipped as too small: ${skipped.join(', ') || 'none'}; duplicates removed), ${(fs.statSync(out).size / 1048576).toFixed(1)} MB`);

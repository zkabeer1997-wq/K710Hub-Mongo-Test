// ONE-OFF / MANUAL TOOL: not part of the build or any scheduled job. Run by hand only when needed.
// Extract factual level records from the reference site's public data modules.
// Usage: node scripts/import-kingshot-costs.cjs <directory-of-downloaded-modules>
// Only literal data is read; external JavaScript is never executed.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {parse}=require('acorn');
const input=process.argv[2];if(!input)throw Error('Supply the downloaded data directory.');
function readModule(file){
 const source=fs.readFileSync(path.join(input,file),'utf8'),vars={};
 function literal(n){
  if(n.type==='Literal')return n.value;
  if(n.type==='TemplateLiteral' && n.expressions.length===0)return n.quasis[0].value.cooked;
  if(n.type==='Identifier' && Object.hasOwn(vars,n.name))return vars[n.name];
  if(n.type==='ArrayExpression')return n.elements.map(literal);
  if(n.type==='ObjectExpression')return Object.fromEntries(n.properties.map(p=>{if(p.type!=='Property'||p.computed)throw Error('Non-literal property');return [p.key.name??p.key.value,literal(p.value)];}));
  if(n.type==='UnaryExpression' && n.operator==='!')return !literal(n.argument);
  if(n.type==='UnaryExpression' && n.operator==='-')return -literal(n.argument);
  if(n.type==='CallExpression' && n.callee.type==='MemberExpression' && n.callee.object.name==='JSON' && n.callee.property.name==='parse' && n.arguments.length===1)return JSON.parse(literal(n.arguments[0]));
  throw Error(`Unsupported data expression: ${n.type} in ${file}`);
 }
 let result;
 for(const node of parse(source,{ecmaVersion:'latest',sourceType:'module'}).body){
  if(node.type==='VariableDeclaration')for(const d of node.declarations)vars[d.id.name]=literal(d.init);
  else if(node.type==='ExportNamedDeclaration'){for(const s of node.specifiers)if(s.exported.name==='default')result=vars[s.local.name];}
  else throw Error(`Unexpected statement in data module ${file}`);
 }
 if(!result)throw Error(`No dataset in ${file}`);
 return {data:result,sha256:crypto.createHash('sha256').update(source).digest('hex')};
}
const slug=s=>s.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');
const sets={
 academy:{source:'https://kingshotoptimizer.com/data/academy-research/',files:{Growth:'growth-CN_OhJsI.js',Economy:'economy-DAWRLVNC.js',Battle:'battle-CYlXqZ2J.js'}},
 'war-academy':{source:'https://kingshotoptimizer.com/data/war-academy-research/',files:{Infantry:'infantry-DbzjxFNt.js',Cavalry:'cavalry-C_4ccmKM.js',Archer:'archer-CnVZaFBs.js'}},
 'advanced-research':{source:'https://kingshotoptimizer.com/data/advanced-truegold-research/',files:{Capacity:'capacity-KOqZI-WQ.js',Combat:'combat-BGRow4gq.js',Economy:'economy-DoDqBbLu.js',Special:'special-wc0Gn-21.js'}}
};
function write(key,source,items,sources){
 const output={source,retrievedAt:'2026-09-03',sources,items};
 fs.writeFileSync(path.join('lib/data',key+'.json'),JSON.stringify(output));
 console.log(key,items.length,'items',items.reduce((n,i)=>n+i.levels.length,0),'levels');
}
for(const [key,set] of Object.entries(sets)){
 const items=[],sources=[];
 for(const [category,file] of Object.entries(set.files)){
  const {data,sha256}=readModule(file);sources.push({url:'https://kingshotoptimizer.com/assets/'+file,sha256});
  for(const [name,value] of Object.entries(data))items.push({id:slug(category+'-'+name),name,category,levels:value.levels.map(l=>({level:String(l.level),costs:l.costs,seconds:l.timeSeconds,power:l.power,requirements:l.prerequisites||[],effect:l.buff,verified:l.verified===true}))});
 }
 write(key,set.source,items,sources);
}
const buildingFiles=['town-center-DzF3cvol.js','command-center-CWq-wFZ0.js','barracks-HE-kZrAX.js','stable-DEo7_-LU.js','range-yinKd01A.js','infirmary-DXSYLjv0.js','embassy-DBS43X06.js','academy-CYYdy0df.js','war-academy-KVFbTsS9.js','guard-station-hEwnYB1L.js','storehouse-DqzbuOhV.js','mill-BX2sd1bI.js','sawmill-DZqOG7Tc.js','quarry-CjM45F0c.js','iron-mine-BfrZFsfv.js'];
const items=[],sources=[];
for(const file of buildingFiles){const {data:b,sha256}=readModule(file);sources.push({url:'https://kingshotoptimizer.com/assets/'+file,sha256});items.push({id:b.id,name:b.name,category:b.category,levels:b.levels.map(l=>({level:l.levelId,type:l.levelType,costs:l.costs,seconds:l.upgradeTimeSeconds,power:l.stats?.power,requirements:l.requires||[],townCenter:l.tcRequired,stats:l.stats}))});}
write('construction','https://kingshotoptimizer.com/calculators/buildings/',items,sources);

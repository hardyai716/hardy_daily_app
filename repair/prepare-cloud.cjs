// Offline WorkBuddy payload generator. No network, credentials, or production writes.
// --output DIR [--schemas DIR] [--definitions JSON --checkins JSON --mapping JSON]
// Schema files: money.json, planner.json, fitness.json, home.json, media.json, checkin.json.
// Definitions: exact saved habit objects; mapping: { "<legacy record_id>": "<habit id>" }.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const argv=process.argv.slice(2),args={};
for(let i=0;i<argv.length;i+=2){if(!argv[i].startsWith('--')||!argv[i+1])throw Error('Expected --option value');args[argv[i].slice(2)]=argv[i+1];}
if(!args.output)throw Error('Pass --output DIR. Use private_work/ for payloads containing personal data.');
const baseline=fs.readFileSync(path.join(__dirname,'../backup/日常集_v14_2026-10-07.html'),'utf8');
const constants=Object.fromEntries([...baseline.matchAll(/var (DB_\w+) = '([^']+)'/g)].map(m=>[m[1],m[2]]));
const context=vm.createContext({...constants,window:{}});
vm.runInContext(fs.readFileSync(path.join(__dirname,'v15-sync.js'),'utf8'),context);
const tables=context.SYNC_TABLES,common=context.COMMON_FIELDS,extra=context.EXTRA_FIELDS;
const json=value=>JSON.stringify(value,null,2)+'\n';
const read=file=>JSON.parse(fs.readFileSync(file,'utf8'));
const output=path.resolve(args.output);fs.mkdirSync(output,{recursive:true,mode:0o700});
const write=(name,value)=>fs.writeFileSync(path.join(output,name),json(value),{mode:0o600});
const config=type=>({[type]:type==='text'?'':type==='number'?0:type==='checkbox'?false:{format:'yyyy-mm-dd'}});
const fields=kind=>Object.entries({...common,...extra[kind]}).map(([name,type])=>({name,config:config(type)}));
const requirements={};
for(const kind of Object.keys(tables))requirements[kind]={database_id:tables[kind]||null,fields:fields(kind)};
write('schema-requirements.json',requirements);
for(const kind of ['habit','settings'])write(`create-${kind}.json`,{
  title:kind==='habit'?'日常集 · 习惯定义':'日常集 · 个人设置',space_id:'pHFugBpWhfhSI7GT5Gssex',properties:fields(kind)
});
if(args.schemas){
  const additions=[],mismatches=[];
  for(const [kind,id] of Object.entries(tables).filter(([,id])=>id)){
    const schema=read(path.join(args.schemas,kind+'.json'));
    if(schema.error||schema.id!==id||!Array.isArray(schema.properties))throw Error(`Invalid schema for ${kind}`);
    const existing=Object.fromEntries(schema.properties.map(p=>[p.name,p]));
    for(const field of fields(kind)){
      const type=Object.keys(field.config)[0];
      if(!existing[field.name])additions.push({database_id:id,property:field});
      else if(existing[field.name].type!==type)mismatches.push({database_id:id,name:field.name,expected:type,actual:existing[field.name].type});
    }
  }
  write('add-fields.json',additions);write('schema-mismatches.json',mismatches);
  if(mismatches.length)throw Error('Existing field types differ. No destructive type conversions generated.');
}
if(args.definitions||args.checkins||args.mapping){
  if(!args.definitions||!args.checkins||!args.mapping)throw Error('Migration requires definitions, checkins, and record-ID mapping together.');
  const definitions=read(args.definitions),query=read(args.checkins),mapping=read(args.mapping);
  const rows=Array.isArray(query)?query:query.results;
  if(!Array.isArray(definitions)||!Array.isArray(rows)||query.has_more)throw Error('Export all pages and supply arrays of definitions and check-ins.');
  const ids=new Set(),defValues=definitions.map(h=>{
    if(typeof h.id!=='string'||!h.id||ids.has(h.id))throw Error('Habit IDs must be unique strings');
    if(!['check','number','counter'].includes(h.type)||!(Number(h.target)>0)||!h.name||!h.unit)throw Error('Habit definition is incomplete; recover it from the original device');
    ids.add(h.id);
    return {id:h.id,key:h.key||'custom-'+h.id,name:h.name,type:h.type,target:Number(h.target),unit:h.unit,tone:h.tone||'sage',archived:Boolean(h.archived)};
  });
  function commonProps(value,deleted=false){
    return {'稳定ID':{text:value.id},'变更ID':{text:'migration-v15:'+value.id},'完整数据':{text:JSON.stringify(value)},'已删除':{checkbox:deleted}};
  }
  const addDefinitions=defValues.map(v=>({...commonProps(v),'名称':{text:v.name},'类型':{text:v.type},'目标':{number:v.target},'单位':{text:v.unit},'主题色':{text:v.tone},'已归档':{checkbox:v.archived}}));
  const updates=[],unresolved=[],seen=new Map(),duplicates=[];
  for(const row of rows){
    const rid=row.record_id||row._id;
    if(typeof rid!=='string'||!rid)throw Error('Every exported row needs a string record_id');
    const id=row['习惯ID']||mapping[rid];
    if(!id||!ids.has(id)){unresolved.push({record_id:rid,habit_name:row['习惯']||'',reason:'Missing exact habit definition mapping'});continue;}
    const date=String(row['日期']||'').slice(0,10),value=Number(row['数值']);
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(value)||value<0){unresolved.push({record_id:rid,reason:'Invalid check-in date/value'});continue;}
    const def=defValues.find(d=>d.id===id),key=id+'/'+date;
    if(seen.has(key)){duplicates.push({key,record_ids:[seen.get(key),rid]});continue;}seen.set(key,rid);
    const v={id:key,habitId:id,date,value,name:def.name,unit:def.unit};
    updates.push({record_id:rid,properties:{...commonProps(v,value===0),'习惯ID':{text:id}}});
  }
  write('migration-unresolved.json',unresolved);write('migration-duplicates.json',duplicates);
  if(unresolved.length||duplicates.length)throw Error('Migration blocked: resolve missing mappings/duplicate dates before generating write batches.');
  // These are intended only for an empty new definition table. On resume, query by 稳定ID first.
  for(let i=0;i<addDefinitions.length;i+=100)write(`habit-definitions-${i/100+1}.json`,addDefinitions.slice(i,i+100));
  for(let i=0;i<updates.length;i+=100)write(`checkins-update-${i/100+1}.json`,updates.slice(i,i+100));
  write('migration-summary.json',{definitions:addDefinitions.length,checkins:updates.length,zero_tombstones:updates.filter(u=>u.properties['已删除'].checkbox).length,requires_empty_definition_table:true,requires_readback:true});
}
console.log('Offline payloads prepared. No WorkBuddy changes were made.');

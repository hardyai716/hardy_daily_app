// Integration checks for the offline migration generator; uses synthetic files in the OS temp dir.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'richangji-cloud-plan-'));
const write=(name,value)=>{const p=path.join(dir,name);fs.writeFileSync(p,JSON.stringify(value));return p;};
const defs=write('defs.json',[{id:'stable-habit-1',key:'custom-1',name:'同名习惯',type:'counter',target:3,unit:'页',tone:'sage'},{id:'stable-habit-2',key:'custom-2',name:'同名习惯',type:'check',target:1,unit:'次',tone:'plum'}]);
const rows=write('rows.json',[
  {record_id:'row-1',日期:'2026-10-06',习惯:'同名习惯',数值:2},
  {record_id:'row-2',日期:'2026-10-06',习惯:'同名习惯',数值:0}
]);
const mapping=write('mapping.json',{'row-1':'stable-habit-1','row-2':'stable-habit-2'});
const run=(out,map=mapping)=>spawnSync(process.execPath,[path.join(__dirname,'prepare-cloud.cjs'),'--output',path.join(dir,out),'--definitions',defs,'--checkins',rows,'--mapping',map],{encoding:'utf8'});
try{
  let result=run('valid');assert.equal(result.status,0,result.stderr);
  const updates=JSON.parse(fs.readFileSync(path.join(dir,'valid/checkins-update-1.json')));
  assert.equal(updates[0].properties['稳定ID'].text,'stable-habit-1/2026-10-06');
  assert.equal(updates[1].properties['已删除'].checkbox,true);
  assert.equal(updates[0].record_id,'row-1');
  const incomplete=write('incomplete.json',{'row-1':'stable-habit-1'});
  result=run('unmapped',incomplete);assert.notEqual(result.status,0);assert.equal(fs.existsSync(path.join(dir,'unmapped/checkins-update-1.json')),false);
  const duplicate=write('duplicate.json',{'row-1':'stable-habit-1','row-2':'stable-habit-1'});
  result=run('duplicate',duplicate);assert.notEqual(result.status,0);assert.equal(fs.existsSync(path.join(dir,'duplicate/checkins-update-1.json')),false);
  const report={method:'Offline command integration with synthetic inputs',passed:3,checks:['exact record-ID mapping keeps same-name habits separate and zero as tombstone','missing mapping fails without producing write batches','duplicate habit/day fails without producing write batches']};
  fs.writeFileSync(path.join(__dirname,'cloud-tool-results.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{fs.rmSync(dir,{recursive:true,force:true});}

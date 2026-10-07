// Whole-page JavaScript + synthetic SDK integration regression. Never connects to WorkBuddy.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto'),path=require('node:path');
const html=fs.readFileSync(process.argv[2]||path.join(__dirname,'../candidate/v15/index.html'),'utf8');
const resultPath=process.argv[3]||path.join(__dirname,'regression-results.json');
const scripts=[...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(m=>m[1]);
const source=scripts.find(s=>s.includes('Database SDK Integration')).replace(/\r+\n/g,'\n');
const clone=v=>JSON.parse(JSON.stringify(v));
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const results=[];
function fakeCloud(){
  const tables={},schemas={},calls=[];
  let serial=0;
  const cloud={tables,schemas,calls,failQuery:false,loseResponse:false,pauseAdd:null,pauseQuery:null,
    db:{
      async getSchema({databaseId}){return {properties:schemas[databaseId]};},
      async query(p){
        calls.push({method:'query',...clone(p)});
        if(cloud.failQuery)throw Error('synthetic offline');
        let rows=clone(tables[p.databaseId]||[]);
        if(p.filter){const f=p.filter.property;rows=rows.filter(r=>r[f.property]===f.text.equals);}
        if(cloud.pauseQuery){const f=cloud.pauseQuery;cloud.pauseQuery=null;await f();}
        const start=p.startCursor?Number(p.startCursor):0,page=rows.slice(start,start+100);
        return {results:page,hasMore:start+100<rows.length,nextCursor:String(start+100)};
      },
      async addRecord(p){
        calls.push({method:'add',...clone(p)});
        if(cloud.pauseAdd){const f=cloud.pauseAdd;cloud.pauseAdd=null;await f();}
        const id='remote-'+(++serial),row={_id:id,...unwrap(p.properties)};
        (tables[p.databaseId]||=[]).push(row);
        if(cloud.loseResponse){cloud.loseResponse=false;throw Error('synthetic response lost');}
        return {id};
      },
      async updateRecord(p){
        calls.push({method:'update',...clone(p)});
        const row=tables[p.databaseId].find(r=>r._id===p.recordId);assert.ok(row);
        Object.assign(row,unwrap(p.properties));return {id:p.recordId};
      },
      async getRecord(p){return {result:clone((tables[p.databaseId]||[]).find(r=>r._id===p.recordId)||null)};},
      async deleteRecord(){throw Error('Physical deletes must never be used');}
    }
  };
  return cloud;
}
function unwrap(p){return Object.fromEntries(Object.entries(p).map(([k,v])=>[k,Object.values(v)[0]]));}
function env({cloud=fakeCloud(),storage={},sdk=true,bind=true,quota=false}={}){
  const nodes=new Map();
  function node(id){if(!nodes.has(id))nodes.set(id,{textContent:'',style:{},disabled:false,hidden:false,innerHTML:'',value:'',classList:{toggle(){},add(){},remove(){}},animate(){}});return nodes.get(id);}
  const context=vm.createContext({
    URL,Date,Math,Intl,JSON,Promise,Set,Map,Number,String,Boolean,Object,Array,RegExp,Error,crypto,
    console,location:'https://local.test/',navigator:{onLine:true},
    window:{__SMART_PAGE__:sdk?{database:cloud.db}:null,addEventListener(){},confirm:()=>true},
    document:{documentElement:{lang:''},getElementById:id=>id==='syncConflicts'?null:node(id),querySelector:()=>node('save-state'),querySelectorAll:()=>[],addEventListener(){}},
    localStorage:{getItem:k=>storage[k]??null,setItem:(k,v)=>{if(quota)throw Error('quota');storage[k]=v;}},
    setTimeout:()=>1,clearTimeout(){},
  });
  const tail="  startI18n();\n  document.addEventListener('DOMContentLoaded',()=>acquireWorkbenchEditor(init));";
  assert.ok(source.includes(tail));
  const exposed=`
    renderAll=()=>{};renderHabitManageList=()=>{};toast=()=>{};
    globalThis.api={
      get state(){return state},set state(s){state=s},
      get runtime(){return syncRuntime},get corrupted(){return dataCorrupted},
      prepareSync,saveState,runSync,collectEntities,mergeThree,propertiesFor,decode,
      SYNC_TABLES,COMMON_FIELDS,EXTRA_FIELDS,legacyValue,normalizeState,
      normalizeWeeklyPlan:typeof normalizeWeeklyPlan==='function'?normalizeWeeklyPlan:(items=>items),
      coverStorageError:typeof coverStorageError==='function'?coverStorageError:(()=>''),
      storageSummary:typeof storageSummary==='function'?storageSummary:(()=>''),
      storageDiagnostics:typeof storageDiagnostics==='function'?storageDiagnostics:(()=>''),
      removeHabitCustom,restoreHabit,pushHabit,resolveSyncConflict,
      autoConfirm(){askConfirm=()=>Promise.resolve(true)}
    };`;
  vm.runInContext(source.replace(tail,exposed),context,{timeout:3000});
  const api=context.api;
  if(bind){
    api.SYNC_TABLES.habit='test-definitions';api.SYNC_TABLES.settings='test-settings';
  }else{
    // 候选已写入真实新表 ID；要模拟"未绑定"必须显式清空，而不是依赖源码里的空常量。
    api.SYNC_TABLES.habit='';api.SYNC_TABLES.settings='';
  }
  for(const [kind,id] of Object.entries(api.SYNC_TABLES)){
    const old={
      money:{日期:'date',分类:'text',金额:'number',备注:'text'},
      planner:{日期:'date',内容:'text',类型:'text',状态:'text'},
      fitness:{日期:'date',体重:'number',体脂率:'number',备注:'text'},
      home:{物品名称:'text',数量:'number',预估价格:'number',是否已买:'text',备注:'text'},
      media:{标题:'text',类型:'text',状态:'text',评分:'number',短评:'text'},
      checkin:{日期:'date',习惯:'text',数值:'number',备注:'text'}
    }[kind]||{};
    cloud.schemas[id]=Object.entries({...old,...api.COMMON_FIELDS,...api.EXTRA_FIELDS[kind]}).map(([name,type])=>({name,type}));
    cloud.tables[id]||=[];
  }
  api.state.settings.weeklyPlan=api.normalizeWeeklyPlan(api.state.settings.weeklyPlan);
  api.prepareSync();
  return {api,cloud,storage,node};
}
function record(id,type,data){return {id,type,date:'2026-10-06',createdAt:1,sample:false,data};}
async function test(name,fn){await fn();results.push({name,passed:true});console.log('PASS '+name);}
function pending(e){return Object.keys(e.api.state.sync.queue);}
function writes(e){return e.cloud.calls.filter(c=>['add','update'].includes(c.method));}
async function seed(e){e.api.runtime.forcePull=true;await e.api.runSync();assert.equal(e.api.runtime.error,'');assert.deepEqual(pending(e),[]);}
async function main(){
  for(const script of scripts)new vm.Script(script);
  await test('normal field round trip, including nulls, units, date, dropped media and settings',async()=>{
    const e=env();await seed(e);
    const entries=[
      record('money-1','money',{flow:'income',amount:12.34,category:'奖金',note:'奖金到账'}),
      record('plan-1','planner',{title:'测试事项',list:'生活',time:'09:30',priority:'high',note:'详细备注',remind:true,done:false}),
      record('fitness-1','fitness',{weight:70,bodyFat:null,calories:1800,duration:45,note:'测试'}),
      record('home-1','home',{name:'测试物品',quantity:'2 盒',category:'食品',price:18,priority:'high',note:'规格',bought:true,boughtDate:'2026-10-05'}),
    ];
    e.api.state.records.push(...entries);
    const media={id:'media-1',name:'测试作品',type:'书',status:'弃了',rating:3,review:'测试短评',date:'2025-12-31',cover:'data:image/jpeg;base64,TEST',sample:false};
    e.api.state.mediaItems.push(media);e.api.state.settings.budget=6789;
    e.api.saveState();await e.api.runSync();assert.equal(e.api.runtime.error,'');
    const second=env({cloud:e.cloud});await seed(second);
    for(const r of entries)assert.deepEqual(clone(second.api.state.records.find(x=>x.id===r.id).data),r.data);
    assert.deepEqual(clone(second.api.state.mediaItems.find(x=>x.id===media.id)),{...media,remoteId:e.api.state.mediaItems[0].remoteId});
    assert.equal(second.api.state.settings.budget,6789);
    const restarted=env({cloud:e.cloud,storage:clone(e.storage)});await seed(restarted);
    assert.equal(restarted.api.state.records.find(r=>r.id==='fitness-1').data.bodyFat,null);
  });
  await test('updates explicitly clear stale optional cloud columns while new records omit nulls',async()=>{
    const e=env();await seed(e);
    const value={id:'fitness-null',type:'fitness',date:'2026-10-06',createdAt:1,data:{weight:70,bodyFat:null,calories:null,duration:0,note:''}};
    const update=e.api.propertiesFor({kind:'fitness',id:value.id,value,opId:'op-update',base:{remoteId:'remote-fitness',value}});
    assert.deepEqual(clone(update['体脂率']),{number:null});
    assert.deepEqual(clone(update['摄入热量']),{number:null});
    assert.deepEqual(clone(update['运动分钟']),{number:0});
    const add=e.api.propertiesFor({kind:'fitness',id:value.id,value,opId:'op-add',base:null});
    assert.equal('体脂率' in add,false);assert.equal('摄入热量' in add,false);
  });
  await test('offline create, reload and retry preserve local records and accurate status',async()=>{
    const e=env();await seed(e);e.cloud.failQuery=true;
    e.api.state.records.push(record('offline-1','money',{flow:'expense',amount:12,category:'吃饭',note:'离线'}));e.api.saveState();
    await e.api.runSync();assert.ok(e.node('saveText').textContent.includes('待同步'));assert.equal(pending(e).length,1);
    const reloaded=env({cloud:e.cloud,storage:clone(e.storage)});assert.equal(reloaded.api.state.records.length,1);
    e.cloud.failQuery=false;await seed(reloaded);assert.equal(reloaded.api.state.records.length,1);
    assert.equal(e.cloud.tables[e.api.SYNC_TABLES.money].length,1);
  });
  await test('missing SDK/table/schema never reports synced and never writes malformed properties',async()=>{
    const local=env({sdk:false});local.api.saveState();await local.api.runSync();assert.ok(local.node('saveText').textContent.includes('未连接云端'));
    const missing=env({bind:false});await missing.api.runSync();assert.ok(missing.api.runtime.error.includes('尚未绑定'));assert.equal(writes(missing).length,0);
    const schema=env();schema.cloud.schemas[schema.api.SYNC_TABLES.money]=[];
    await schema.api.runSync();assert.ok(schema.api.runtime.error.includes('字段'));assert.equal(writes(schema).length,0);
  });
  await test('recent local writes query only the changed entity; forced refresh still pulls all tables',async()=>{
    const e=env();await seed(e);e.cloud.calls.length=0;
    assert.match(e.api.coverStorageError('x'.repeat(260001)),/过大/);
    assert.match(e.api.storageSummary(),/本机缓存约.*同步正常/);
    assert.doesNotMatch(e.api.storageSummary(),/删除标记/);
    assert.match(e.api.storageDiagnostics(),/删除标记 0 项.*无需处理/);
    e.api.state.records.push(record('targeted-1','money',{flow:'expense',amount:9,category:'其他',note:'定向读取'}));
    e.api.saveState();await e.api.runSync();
    const targeted=e.cloud.calls.filter(call=>call.method==='query');
    assert.equal(targeted.length,1);assert.equal(targeted[0].databaseId,e.api.SYNC_TABLES.money);
    assert.equal(targeted[0].filter.property.text.equals,'targeted-1');
    e.cloud.calls.length=0;e.api.runtime.forcePull=true;await e.api.runSync();
    const full=e.cloud.calls.filter(call=>call.method==='query'&&!call.filter);
    assert.equal(full.length,Object.keys(e.api.SYNC_TABLES).length);
  });
  await test('legacy weekly completion is migrated to a week-keyed cloud setting',async()=>{
    const e=env();await seed(e);
    const table=e.cloud.tables[e.api.SYNC_TABLES.settings];
    const row=table.find(item=>item['稳定ID']==='weeklyPlan');
    const legacy={id:'weekly-legacy',group:'运动',title:'旧计划',note:'',done:true};
    row['完整数据']=JSON.stringify({id:'weeklyPlan',value:[legacy]});
    row['设置内容']=JSON.stringify([legacy]);row['变更ID']='legacy-week';
    const second=env({cloud:e.cloud});await seed(second);
    const saved=JSON.parse(row['完整数据']).value[0];
    assert.equal('done' in saved,false);
    assert.equal(Object.values(saved.doneByWeek).filter(Boolean).length,1);
  });
  await test('late initial query cannot overwrite an edit created during the read',async()=>{
    const e=env();await seed(e);
    let resume,started;const wait=new Promise(r=>started=r);
    e.cloud.pauseQuery=()=>{started();return new Promise(r=>resume=r);};
    e.api.runtime.forcePull=true;
    const run=e.api.runSync();await wait;
    e.api.state.records.push(record('late-1','money',{flow:'expense',amount:9,category:'其他',note:'读取中新增'}));e.api.saveState();resume();await run;
    assert.equal(e.api.state.records.length,1);assert.equal(e.api.runtime.error,'');assert.equal(pending(e).length,0);
  });
  await test('response lost after successful add is reconciled by stable ID with no second add',async()=>{
    const e=env();await seed(e);e.cloud.loseResponse=true;
    e.api.state.records.push(record('lost-1','money',{flow:'expense',amount:9,category:'其他',note:''}));e.api.saveState();await e.api.runSync();
    assert.equal(pending(e).length,1);
    const retry=env({cloud:e.cloud,storage:clone(e.storage)});await seed(retry);
    assert.equal(e.cloud.tables[e.api.SYNC_TABLES.money].length,1);
    assert.equal(e.cloud.calls.filter(c=>c.method==='add'&&c.databaseId===e.api.SYNC_TABLES.money).length,1);
  });
  await test('habit add then rapid decrement to zero finishes as a tombstone, not an active zero row',async()=>{
    const e=env();await seed(e);const h=e.api.state.habits[0],date='2026-10-06';
    h.entries[date]=1;e.api.saveState();
    let resume,started;const wait=new Promise(r=>started=r);
    e.cloud.pauseAdd=()=>{started();return new Promise(r=>resume=r);};
    const run=e.api.runSync();await wait;
    h.entries[date]=0;e.api.saveState();resume();await run;await seed(e);
    const rows=e.cloud.tables[e.api.SYNC_TABLES.checkin];assert.equal(rows.length,1);assert.equal(rows[0]['已删除'],true);
    const second=env({cloud:e.cloud});await seed(second);assert.equal(second.api.state.habits[0].entries[date],undefined);
  });
  await test('custom same-name habits stay separate; archive/restore preserves definitions and check-ins',async()=>{
    const e=env();await seed(e);
    e.api.state.habits.push(...['custom-a','custom-b'].map((id,i)=>({id,key:id,name:'同名习惯',type:'counter',target:i+2,unit:'页',tone:'sage',entries:{'2026-10-06':i+1},sample:false})));
    e.api.saveState();await seed(e);
    const second=env({cloud:e.cloud});await seed(second);
    assert.equal(second.api.state.habits.find(h=>h.id==='custom-a').entries['2026-10-06'],1);
    assert.equal(second.api.state.habits.find(h=>h.id==='custom-b').entries['2026-10-06'],2);
    second.api.autoConfirm();await second.api.removeHabitCustom('custom-a');await seed(second);
    await seed(e);assert.equal(e.api.state.habits.some(h=>h.id==='custom-a'),false);
    assert.equal(e.api.state.archivedHabits.find(h=>h.id==='custom-a').entries['2026-10-06'],1);
    e.api.restoreHabit('custom-a');await seed(e);await seed(second);
    assert.equal(second.api.state.habits.find(h=>h.id==='custom-a').target,2);
  });
  await test('independent edits merge; competing edits keep both and require a visible choice',async()=>{
    const a=env();await seed(a);
    a.api.state.records.push(record('conflict-1','planner',{title:'原始',list:'生活',time:'09:30',priority:'normal',note:'原始备注',remind:false,done:false}));
    a.api.saveState();await seed(a);
    const b=env({cloud:a.cloud});await seed(b);
    a.api.state.records[0].data.title='设备A';a.api.saveState();await seed(a);
    b.api.state.records[0].data.note='设备B';b.api.saveState();await seed(b);
    assert.equal(b.api.state.records[0].data.title,'设备A');assert.equal(b.api.state.records[0].data.note,'设备B');
    await seed(a);
    a.api.state.records[0].data.title='再次A';a.api.saveState();await seed(a);
    b.api.state.records[0].data.title='再次B';b.api.saveState();await b.api.runSync();
    const key='planner:conflict-1',c=b.api.state.sync.conflicts[key];assert.ok(c);
    assert.equal(c.local.data.title,'再次B');assert.equal(c.remote.value.data.title,'再次A');
    b.api.resolveSyncConflict(key,'local');await seed(b);assert.equal(b.api.state.records[0].data.title,'再次B');
  });
  await test('delete while offline remains deleted after reload and second-device reads',async()=>{
    const e=env();await seed(e);
    e.api.state.records.push(record('delete-1','money',{flow:'expense',amount:8,category:'其他',note:''}));e.api.saveState();await seed(e);
    e.cloud.failQuery=true;e.api.state.records=[];e.api.saveState();await e.api.runSync();
    const second=env({cloud:e.cloud,storage:clone(e.storage)});assert.equal(second.api.state.records.length,0);
    e.cloud.failQuery=false;await seed(second);assert.equal(second.api.state.records.length,0);
    const fresh=env({cloud:e.cloud});await seed(fresh);assert.equal(fresh.api.state.records.length,0);
  });
  await test('legacy income note, unknown dates and recoverable local-only fields survive migration',async()=>{
    const e=env();
    e.cloud.tables[e.api.SYNC_TABLES.money].push({_id:'legacy-money',日期:'2026-01-02',金额:100,分类:'奖金',备注:'奖金到账'});
    e.cloud.tables[e.api.SYNC_TABLES.home].push({_id:'legacy-home',物品名称:'旧物品',数量:2,预估价格:3,是否已买:'待买',备注:''});
    e.cloud.tables[e.api.SYNC_TABLES.planner].push({_id:'legacy-plan',日期:'2026-01-02',内容:'旧日程',类型:'生活',状态:'待完成'});
    e.api.state.records.push({...record('legacy-plan','planner',{title:'旧日程',list:'生活',done:false,time:'18:20',priority:'high',note:'仅本地备注',remind:true}),remoteId:'legacy-plan'});
    // Model the old cache as its first load, before any v15 local changes.
    e.api.state.sync=null;e.api.prepareSync();await seed(e);
    assert.equal(e.api.state.records.find(r=>r.id==='legacy-money').data.note,'奖金到账');
    assert.equal(e.api.state.records.find(r=>r.id==='legacy-home').date,'');
    assert.equal(e.api.state.records.find(r=>r.id==='legacy-plan').data.time,'18:20');
    const reloaded=env({cloud:e.cloud,storage:clone(e.storage)});await seed(reloaded);
    assert.equal(reloaded.api.state.records.find(r=>r.id==='legacy-home').date,'');
    assert.equal(reloaded.api.state.records.find(r=>r.id==='legacy-plan').data.note,'仅本地备注');
  });
  await test('quota failure never sends unpersisted mutation; damaged local data is preserved',async()=>{
    const e=env({quota:true});e.api.state.records.push(record('quota-1','money',{flow:'expense',amount:1,category:'其他',note:''}));
    assert.equal(e.api.saveState(),false);await e.api.runSync();assert.equal(writes(e).length,0);
    const storage={'richangji-state-v1':'{broken'};
    const bad=env({storage});assert.equal(bad.api.corrupted,true);bad.api.saveState();await bad.api.runSync();
    assert.equal(storage['richangji-state-v1'],'{broken');assert.equal(writes(bad).length,0);
  });
  await test('duplicate stable IDs block writes instead of silently choosing a record',async()=>{
    const e=env();await seed(e);
    const table=e.cloud.tables[e.api.SYNC_TABLES.habit];table.push({...clone(table[0]),_id:'duplicate'});
    const before=writes(e).length;e.api.runtime.forcePull=true;await e.api.runSync();assert.ok(e.api.runtime.error.includes('重复'));assert.equal(writes(e).length,before);
  });
  await test('malformed complete payload blocks the entire read before replacing local state',async()=>{
    const e=env();await seed(e);
    e.cloud.tables[e.api.SYNC_TABLES.money].push({_id:'malformed','稳定ID':'bad','变更ID':'v1','完整数据':'{"id":"bad"}','已删除':false});
    const before=writes(e).length;e.api.runtime.forcePull=true;await e.api.runSync();
    assert.ok(e.api.runtime.error.includes('格式不完整'));assert.equal(e.api.state.records.length,0);assert.equal(writes(e).length,before);
  });
  await test('legacy pendingAdd is removed and failed check-in can sync after reload',async()=>{
    const e=env();await seed(e);
    const stored=clone(e.api.state),h=stored.habits[0];h.pendingAdd={'2026-10-06':true};h.entries['2026-10-06']=2;stored.sync=null;
    const reloaded=env({cloud:e.cloud,storage:{'richangji-state-v1':JSON.stringify(stored)}});
    assert.equal(reloaded.api.state.habits[0].pendingAdd,undefined);await seed(reloaded);
    assert.equal(reloaded.api.state.habits[0].entries['2026-10-06'],2);
    assert.equal(e.cloud.tables[e.api.SYNC_TABLES.checkin].length,1);
  });
  fs.writeFileSync(resultPath,JSON.stringify({method:'Full page JS in isolated VM; synthetic SDK only; no production requests',passed:results.length,results},null,2)+'\n');
}
main().catch(e=>{console.error(e);process.exitCode=1;});

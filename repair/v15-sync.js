  // v15 repair module. Embedded into a fresh WorkBuddy transaction baseline by build_v15.py.
  // Empty IDs are intentional: only successful WorkBuddy create responses may fill them.
  var DB_HABIT_DEFS = '';
  var DB_SETTINGS = '';
  var db = window.__SMART_PAGE__ && window.__SMART_PAGE__.database;
  var ONLINE = Boolean(db);
  var syncRuntime = {busy:false, ready:false, error:'', timer:null, saved:true, failures:0};
  var FIELD_TYPES = {}, FIELD_OPTIONS = {}, syncPrevious = null, syncDirty = false;
  var SYNC_TABLES = {
    money:DB_MONEY, planner:DB_PLAN, fitness:DB_FITNESS, home:DB_SHOPPING,
    media:DB_MEDIA, habit:DB_HABIT_DEFS, checkin:DB_HABIT, settings:DB_SETTINGS
  };
  var COMMON_FIELDS = {'稳定ID':'text','变更ID':'text','完整数据':'text','已删除':'checkbox'};
  var EXTRA_FIELDS = {
    money:{'收支方向':'text'},
    planner:{'时间':'text','优先级':'text','备注':'text','提醒设置':'checkbox'},
    fitness:{'摄入热量':'number','运动分钟':'number'},
    home:{'记录日期':'date','数量描述':'text','分类':'text','优先级':'text','购入日期':'date'},
    media:{'记录日期':'date','封面内容':'text','观看状态':'text'},
    habit:{'名称':'text','类型':'text','目标':'number','单位':'text','主题色':'text','已归档':'checkbox'},
    checkin:{'习惯ID':'text'},
    settings:{'设置项':'text','设置内容':'text'}
  };
  var SYNC_LABELS = {money:'记账',planner:'日程',fitness:'健身',home:'待买',media:'书影音',habit:'习惯定义',checkin:'每日打卡',settings:'个人设置'};
  // Writes per sync pass. Small enough to keep the page responsive, large enough to converge.
  var SYNC_BATCH = 40;
  function copy(value){return value == null ? value : JSON.parse(JSON.stringify(value));}
  function stable(value){
    if(value===undefined)return 'undefined';
    if(value===null || typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(stable).join(',')+']';
    return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+stable(value[k])).join(',')+'}';
  }
  function same(a,b){return stable(a)===stable(b);}
  function syncState(){
    if(!state.sync)state.sync={version:1,base:{},queue:{},conflicts:{},lastSync:null};
    return state.sync;
  }
  function syncKey(kind,id){return kind+':'+String(id);}
  function allHabits(){return state.habits.concat(state.archivedHabits||[]);}
  function collectEntities(){
    var result={};
    function put(kind,value,remoteId){
      result[syncKey(kind,value.id)]={kind,id:String(value.id),value:copy(value),remoteId:remoteId?String(remoteId):null};
    }
    state.records.filter(r=>!r.sample).forEach(r=>put(r.type,{id:String(r.id),type:r.type,date:r.date||'',createdAt:r.createdAt||0,data:r.data},r.remoteId));
    state.mediaItems.filter(r=>!r.sample).forEach(r=>put('media',{id:String(r.id),name:r.name,type:r.type,status:r.status,rating:r.rating,review:r.review,date:r.date||'',cover:r.cover||''},r.remoteId));
    allHabits().forEach(h=>{
      put('habit',{id:String(h.id),key:h.key,name:h.name,type:h.type,target:h.target,unit:h.unit,tone:h.tone,archived:Boolean(h.archived)},h.remoteId);
      if(!h.sample)Object.entries(h.entries||{}).forEach(([date,value])=>{
        if(Number(value)>0)put('checkin',{id:String(h.id)+'/'+date,habitId:String(h.id),date,value:Number(value),name:h.name,unit:h.unit},h.remoteIds&&h.remoteIds[date]);
      });
    });
    ['budget','brand','fitnessProfile','weeklyPlan'].forEach(id=>put('settings',{id,value:copy(state.settings[id])}));
    return result;
  }
  function newTask(entity,value,base){
    return {kind:entity.kind,id:entity.id,value:copy(value),base:copy(base||null),opId:uid(),attempted:false};
  }
  function prepareSync(){
    var s=syncState(),current=collectEntities();
    // Upgrade local caches. A missing remote ID never means a pending record may be discarded.
    if(!s.initialized){
      Object.entries(current).forEach(([key,e])=>{
        if(e.remoteId)s.base[key]={value:copy(e.value),remoteId:e.remoteId,revision:'',deleted:false};
        else if(['money','planner','fitness','home','media','checkin'].includes(e.kind))s.queue[key]=newTask(e,e.value,null);
      });
      s.initialized=true;
    }
    syncPrevious=current;
  }
  function captureChanges(){
    if(!syncPrevious)prepareSync();
    var current=collectEntities(),s=syncState();
    new Set([...Object.keys(syncPrevious),...Object.keys(current)]).forEach(key=>{
      var before=syncPrevious[key],after=current[key];
      if(same(before&&before.value,after&&after.value))return;
      var e=after||before,base=s.base[key]||null,old=s.queue[key];
      // If a write is already in flight, keep its identity for reconciliation after a reload.
      var task=newTask(e,after?after.value:null,old?old.base:base);
      if(old&&old.attempted)task.predecessor=copy(old.predecessor||{opId:old.opId,value:old.value});
      s.queue[key]=task;
      if(s.conflicts[key])s.conflicts[key].local=copy(task.value);
    });
    syncPrevious=current;
  }
  function persistSync(capture){
    try{
      if(capture)captureChanges();
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      syncRuntime.saved=true;
      renderSyncStatus();
      return true;
    }catch(error){
      syncRuntime.saved=false;
      renderSyncStatus();
      return false;
    }
  }
  function saveState(showSaved=false){
    if(dataCorrupted){syncRuntime.saved=false;renderSyncStatus();return false;}
    var saved=persistSync(true);
    if(saved){
      if(showSaved)pulseSaved();
      if(Object.keys(syncState().queue).some(k=>!syncState().conflicts[k]))scheduleSync(0);
    }
    else toast('本机保存失败，请保留此页并导出备份');
    return saved;
  }
  function scheduleSync(delay){
    clearTimeout(syncRuntime.timer);
    syncRuntime.continuing=false;
    if(!ONLINE||syncRuntime.busy||!syncRuntime.saved||dataCorrupted)return;
    syncRuntime.timer=setTimeout(()=>runSync(),delay);
  }
  function safeError(error){
    return error && error.userMessage ? error.userMessage : '云端请求失败，已保留本机内容，请重试';
  }
  function syncError(message){var e=new Error(message);e.userMessage=message;return e;}
  function renderSyncStatus(){
    var node=document.getElementById('saveText');
    if(!node)return;
    var s=syncState(),count=Object.keys(s.queue).length,conflicts=Object.keys(s.conflicts).length;
    node.textContent=!syncRuntime.saved?'本机保存失败'
      :dataCorrupted?'本机数据损坏，请先导出恢复副本'
      :conflicts?'已存本机 · '+conflicts+' 项冲突待处理'
      :syncRuntime.busy?'已存本机 · 正在同步'
      :!ONLINE?'已存本机 · 未连接云端'+(count?'（'+count+' 项待同步）':'')
      :syncRuntime.error?'已存本机 · '+(count?count+' 项待同步':'云端未就绪')
      :count?'已存本机 · '+count+' 项待同步'
      :s.lastSync?'记录已同步 · 草稿在本机':'已存本机 · 等待云端';
    document.querySelector('.save-state')?.classList.toggle('error',!syncRuntime.saved||Boolean(syncRuntime.error)||conflicts>0);
    var summary=document.getElementById('syncSummary');if(summary)summary.textContent=node.textContent;
    var detail=document.getElementById('syncDetail');
    if(detail)detail.textContent=syncRuntime.error||'草稿和筛选条件只保存在当前设备。';
    var button=document.getElementById('syncRetry');
    if(button){button.disabled=syncRuntime.busy||!ONLINE;button.textContent=syncRuntime.busy?'正在同步':'重试同步';}
    var list=document.getElementById('syncConflicts');
    if(list){
      list.replaceChildren();
      Object.entries(s.conflicts).forEach(([key,c])=>{
        var row=document.createElement('details'),summary=document.createElement('summary');
        summary.textContent=SYNC_LABELS[c.kind]+' · '+(c.reason||'两端内容不同');row.appendChild(summary);
        var values=document.createElement('pre');
        values.style.cssText='white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto';
        values.textContent='本机：\n'+JSON.stringify(c.local,null,2)+'\n云端：\n'+JSON.stringify(c.remote&&c.remote.value,null,2);
        row.appendChild(values);
        if(!c.duplicate)['local','remote'].forEach(choice=>{
          var b=document.createElement('button');b.type='button';b.className='btn ghost';
          b.textContent=choice==='local'?'保留本机内容':'采用云端内容';
          b.onclick=()=>resolveSyncConflict(key,choice);row.appendChild(b);
        });
        list.appendChild(row);
      });
      Object.entries(s.queue).filter(([key,q])=>q.attempted&&!q.base&&!s.conflicts[key]).forEach(([key,q])=>{
        var row=document.createElement('div'),label=document.createElement('span'),b=document.createElement('button');
        label.textContent=SYNC_LABELS[q.kind]+' · 新增结果待确认 ';
        b.type='button';b.className='btn ghost';b.disabled=syncRuntime.busy;b.textContent='核对后重新新增';
        b.onclick=async()=>{
          if(!await askConfirm('请先在云端核对这条记录。若确认没有保存，可重新新增；原请求延迟完成时仍可能重复。','确认重新新增'))return;
          q.attempted=false;delete q.predecessor;
          if(persistSync(false))scheduleSync(0);
        };
        row.append(label,b);list.appendChild(row);
      });
    }
  }
  function pv(dbId,field,value){
    var type=FIELD_TYPES[dbId]&&FIELD_TYPES[dbId][field];
    if(!type)throw syncError('数据表缺少字段“'+field+'”，请先完成表结构升级');
    if(type==='text')return {text:value==null?'':String(value)};
    if(type==='date')return {date:value||''};
    if(type==='number'){
      if(!Number.isFinite(Number(value)))throw syncError('“'+field+'”不是有效数值');
      return {number:Number(value)};
    }
    if(type==='checkbox')return {checkbox:Boolean(value)};
    if(type==='select'){
      var options=FIELD_OPTIONS[dbId][field]||[],hit=options.find(o=>o.text===String(value)||o.id===String(value));
      if(!hit)throw syncError('数据表“'+field+'”缺少选项“'+value+'”');
      return {select:hit.id};
    }
    throw syncError('数据表“'+field+'”类型不受支持：'+type);
  }
  async function loadSchemaTypes(){
    if(!ONLINE)throw syncError('未连接 WorkBuddy 云端');
    for(var [kind,id] of Object.entries(SYNC_TABLES)){
      if(!id)throw syncError('尚未绑定“'+SYNC_LABELS[kind]+'”数据表');
      var schema=await db.getSchema({databaseId:id}),types={},options={};
      if(!schema||!Array.isArray(schema.properties))throw syncError('数据表结构返回异常');
      schema.properties.forEach(p=>{types[p.name]=p.type;options[p.name]=p.config&&p.config.options||[];});
      FIELD_TYPES[id]=types;FIELD_OPTIONS[id]=options;
      for(var [field,type] of Object.entries({...COMMON_FIELDS,...EXTRA_FIELDS[kind]})){
        if(types[field]!==type)throw syncError(SYNC_LABELS[kind]+'表需要“'+field+'”字段（'+type+'）');
      }
    }
    syncRuntime.ready=true;
  }
  async function queryRows(databaseId,filter){
    var rows=[],cursor,seen=new Set();
    do{
      var args={databaseId,pageSize:100};if(cursor)args.startCursor=cursor;if(filter)args.filter=filter;
      var result=await db.query(args);
      if(!result||!Array.isArray(result.results))throw syncError('云端查询返回异常，未替换本机内容');
      rows.push(...result.results);
      if(!result.hasMore)break;
      if(!result.nextCursor||seen.has(result.nextCursor))throw syncError('云端分页异常，未替换本机内容');
      cursor=result.nextCursor;seen.add(cursor);
    }while(true);
    return rows;
  }
  function num(value){return value==null||value===''?null:Number(value);}
  function day(value){return value?String(value).slice(0,10):'';}
  function validateEntity(kind,v){
    var ok=v&&typeof v.id==='string'&&v.id.length>0;
    var validDate=date=>typeof date==='string'&&(date===''||/^\d{4}-\d{2}-\d{2}$/.test(date));
    var object=value=>value&&typeof value==='object'&&!Array.isArray(value);
    if(['money','planner','fitness','home'].includes(kind))ok=ok&&v.type===kind&&validDate(v.date)&&object(v.data);
    if(kind==='money')ok=ok&&['expense','income'].includes(v.data?.flow)&&Number.isFinite(v.data?.amount);
    if(kind==='planner')ok=ok&&typeof v.data?.title==='string';
    if(kind==='home')ok=ok&&typeof v.data?.name==='string';
    if(kind==='media')ok=ok&&typeof v.name==='string'&&validDate(v.date)&&['想看','在看','看完','弃了'].includes(v.status)&&Number.isInteger(v.rating)&&v.rating>=0&&v.rating<=5;
    if(kind==='habit')ok=ok&&typeof v.name==='string'&&['check','counter','number'].includes(v.type)&&Number(v.target)>0;
    if(kind==='checkin')ok=ok&&typeof v.habitId==='string'&&Boolean(v.date)&&validDate(v.date)&&v.id===v.habitId+'/'+v.date&&Number.isFinite(v.value)&&v.value>=0;
    if(kind==='settings')ok=ok&&(v.id==='budget'?Number.isFinite(v.value):v.id==='weeklyPlan'?Array.isArray(v.value):['brand','fitnessProfile'].includes(v.id)&&object(v.value));
    if(!ok)throw syncError(SYNC_LABELS[kind]+'记录格式不完整，未覆盖本机内容');
  }
  function legacyValue(kind,r){
    var id=String(r['稳定ID']||r._id),date=day(r['日期']),d={};
    if(kind==='money'){
      var note=r['备注']||'',income=Number(r['金额'])>0||note.startsWith('收入：');
      d={flow:r['收支方向']||(income?'income':'expense'),amount:Math.abs(Number(r['金额'])||0),category:r['分类']||'',note:note.startsWith('收入：')?note.slice(3):note};
    }
    if(kind==='planner')d={title:r['内容']||'',list:r['类型']||'',done:r['状态']==='已完成',time:r['时间']||'',priority:r['优先级']||'',note:r['备注']||'',remind:r['提醒设置']??null};
    if(kind==='fitness')d={weight:num(r['体重']),bodyFat:num(r['体脂率']),calories:num(r['摄入热量']),duration:num(r['运动分钟']),note:r['备注']||''};
    if(kind==='home'){
      date=day(r['记录日期']);
      d={name:r['物品名称']||'',quantity:r['数量描述']??String(r['数量']??''),category:r['分类']||'',price:num(r['预估价格']),priority:r['优先级']||'',note:r['备注']||'',bought:r['是否已买']==='已买',boughtDate:day(r['购入日期'])||null};
    }
    if(kind==='media')return {id,name:r['标题']||'',type:({'书籍':'书','电影':'电影','电视剧':'剧','动漫':'番'})[r['类型']]||'电影',status:r['观看状态']||({'看过':'看完'})[r['状态']]||r['状态']||'想看',rating:num(r['评分'])||0,review:r['短评']||'',date:day(r['记录日期']),cover:r['封面内容']||''};
    if(kind==='checkin'){
      if(!r['习惯ID'])throw syncError('历史打卡尚未关联稳定习惯 ID，请先完成迁移');
      return {id:String(r['习惯ID'])+'/'+date,habitId:String(r['习惯ID']),date,value:Number(r['数值'])||0,name:r['习惯']||'',unit:r['备注']||''};
    }
    if(kind==='habit'||kind==='settings')throw syncError('新数据表存在不完整记录，请核对迁移结果');
    return {id,type:kind,date,createdAt:0,data:d};
  }
  function decode(kind,row){
    if(!row||!row._id)throw syncError('云端记录缺少主键');
    var value,legacy=!row['完整数据'];
    if(legacy)value=legacyValue(kind,row);
    else{
      try{value=JSON.parse(row['完整数据']);}catch(e){throw syncError('云端完整数据无法解析，已保留本机副本');}
      if(!value||String(value.id)!==String(row['稳定ID']))throw syncError('云端记录 ID 不一致');
    }
    validateEntity(kind,value);
    return {kind,id:String(value.id),value:row['已删除']?null:value,remoteId:String(row._id),revision:String(row['变更ID']||''),deleted:Boolean(row['已删除']),legacy};
  }
  function propertiesFor(task){
    var id=SYNC_TABLES[task.kind],v=task.value||task.base?.value||{id:task.id},d=v.data||{},fields={};
    function put(field,value){if(value!==null&&value!==undefined)fields[field]=pv(id,field,value);}
    put('稳定ID',task.id);put('变更ID',task.opId);put('完整数据',JSON.stringify(v));put('已删除',task.value===null);
    if(task.value===null)return fields;
    validateEntity(task.kind,v);
    if(task.kind==='money'){
      put('日期',v.date);put('分类',d.category);put('金额',(d.flow==='income'?1:-1)*d.amount);put('备注',(d.flow==='income'?'收入：':'')+(d.note||''));put('收支方向',d.flow);
    }
    if(task.kind==='planner'){
      put('日期',v.date);put('内容',d.title);put('类型',d.list);put('状态',d.done?'已完成':'待完成');
      put('时间',d.time);put('优先级',d.priority);put('备注',d.note);put('提醒设置',d.remind);
    }
    if(task.kind==='fitness'){
      put('日期',v.date);put('体重',d.weight);put('体脂率',d.bodyFat);put('摄入热量',d.calories);put('运动分钟',d.duration);put('备注',d.note);
    }
    if(task.kind==='home'){
      put('物品名称',d.name);put('数量',parseFloat(d.quantity)||0);put('数量描述',d.quantity);put('分类',d.category);put('优先级',d.priority);
      put('预估价格',d.price);put('是否已买',d.bought?'已买':'待买');put('备注',d.note);put('记录日期',v.date);put('购入日期',d.boughtDate);
    }
    if(task.kind==='media'){
      put('标题',v.name);put('类型',({'书':'书籍','电影':'电影','剧':'电视剧','番':'动漫'})[v.type]);
      // Keep the old status column compatible; the new field and snapshot preserve "弃了".
      put('状态',v.status==='看完'?'看过':v.status==='弃了'?'在看':v.status);put('观看状态',v.status);
      put('评分',v.rating);put('短评',v.review);put('记录日期',v.date);put('封面内容',v.cover);
    }
    if(task.kind==='habit'){
      put('名称',v.name);put('类型',v.type);put('目标',v.target);put('单位',v.unit);put('主题色',v.tone);put('已归档',v.archived);
    }
    if(task.kind==='checkin'){
      put('习惯ID',v.habitId);put('日期',v.date);put('习惯',v.name);put('数值',v.value);put('备注',v.unit);
    }
    if(task.kind==='settings'){put('设置项',v.id);put('设置内容',JSON.stringify(v.value));}
    return fields;
  }
  // Three-way merge: independent field edits combine; competing edits remain explicit conflicts.
  function mergeThree(base,local,remote){
    if(same(local,remote))return {value:copy(local)};
    if(same(local,base))return {value:copy(remote)};
    if(same(remote,base))return {value:copy(local)};
    if([base,local,remote].every(v=>v&&typeof v==='object'&&!Array.isArray(v))){
      var value={};
      for(var key of new Set([...Object.keys(base),...Object.keys(local),...Object.keys(remote)])){
        var merged=mergeThree(base[key],local[key],remote[key]);
        if(merged.conflict)return {conflict:true};
        if(merged.value!==undefined)value[key]=merged.value;
      }
      return {value};
    }
    return {conflict:true};
  }
  function applyEntity(kind,id,value,remoteId){
    if(['money','planner','fitness','home'].includes(kind)){
      state.records=state.records.filter(r=>!(r.type===kind&&String(r.id)===id));
      if(value)state.records.push({...copy(value),sample:false,remoteId});
    }else if(kind==='media'){
      state.mediaItems=state.mediaItems.filter(r=>String(r.id)!==id);
      if(value)state.mediaItems.push({...copy(value),sample:false,remoteId});
    }else if(kind==='habit'){
      var old=allHabits().find(h=>String(h.id)===id);
      state.habits=state.habits.filter(h=>String(h.id)!==id);
      state.archivedHabits=(state.archivedHabits||[]).filter(h=>String(h.id)!==id);
      if(value){
        var h={...copy(value),entries:old?.sample?{}:old?.entries||{},remoteIds:old?.remoteIds||{},sample:false,remoteId};
        (value.archived?state.archivedHabits:state.habits).push(h);
      }
    }else if(kind==='checkin'){
      var cut=id.lastIndexOf('/'),habitId=id.slice(0,cut),date=id.slice(cut+1);
      var h=allHabits().find(h=>String(h.id)===habitId);
      if(!h)throw syncError('打卡对应的习惯定义缺失，请核对数据迁移');
      if(h.sample){h.entries={};h.sample=false;}
      if(!h.remoteIds)h.remoteIds={};
      if(value&&value.value>0){h.entries[date]=value.value;h.remoteIds[date]=remoteId;}
      else{delete h.entries[date];delete h.remoteIds[date];}
    }else if(kind==='settings'&&value){
      if(!['budget','brand','fitnessProfile','weeklyPlan'].includes(id))throw syncError('未知的个人设置项');
      state.settings[id]=copy(value.value);
    }
  }
  function addConflict(key,task,remote,reason,duplicate){
    syncState().conflicts[key]={kind:task.kind,local:copy(task.value),remote:copy(remote),reason,duplicate:Boolean(duplicate)};
  }
  function legacyEnrich(kind,remote,local,row){
    // Only fill fields absent in the legacy cloud record. Known cloud fields stay authoritative.
    var v=copy(remote),data=v.data||v,ld=local&&(local.data||local);
    if(!ld)return v;
    var map={
      planner:{time:'时间',priority:'优先级',note:'备注',remind:'提醒设置'},
      fitness:{calories:'摄入热量',duration:'运动分钟'},
      home:{quantity:'数量描述',category:'分类',priority:'优先级',boughtDate:'购入日期'},
      media:{date:'记录日期',cover:'封面内容',status:'观看状态'}
    }[kind]||{};
    Object.entries(map).forEach(([field,column])=>{if(row[column]==null&&ld[field]!==undefined)data[field]=copy(ld[field]);});
    if(kind==='home'&&!row['记录日期']&&local.date)v.date=local.date;
    return v;
  }
  function mergeRemoteRow(kind,row,currentMap){
    var remote=decode(kind,row),key=syncKey(kind,remote.id),s=syncState(),task=s.queue[key],current=currentMap[key];
    if(remote.legacy&&current){
      var enriched=legacyEnrich(kind,remote.value,current.value,row);
      // Only upgrade a legacy row when the local copy actually adds information.
      // Rewriting every historical row would queue one write per record on every load.
      if(!task&&!same(enriched,remote.value))task=s.queue[key]=newTask(current,enriched,remote);
      else if(task&&!task.base)task.base=copy(remote);
    }
    if(task){
      // The cloud copy already holds exactly what this task intends: nothing is left to write.
      // This also clears conflicts raised by an over-strict read-back that later matched.
      if(same(remote.value,task.value)){
        delete s.queue[key];delete s.conflicts[key];applyEntity(kind,remote.id,remote.value,remote.remoteId);
      }else{
        if(task.predecessor&&remote.revision===task.predecessor.opId){
          task.base=copy(remote);delete task.predecessor;task.attempted=false;
        }
        var merged=mergeThree(task.base?.value??null,task.value,remote.value);
        if(merged.conflict){addConflict(key,task,remote,'同一内容在两端发生修改');return;}
        if(!same(task.value,merged.value)){task.value=merged.value;task.opId=uid();task.attempted=false;}
        task.base=copy(remote);
        applyEntity(kind,remote.id,task.value,remote.remoteId);
      }
    }else applyEntity(kind,remote.id,remote.value,remote.remoteId);
    s.base[key]=copy(remote);
  }
  async function pullAllRemote(){
    // Collect everything before applying: partial reads must not erase definitions or settings.
    var rowsByKind={};
    for(var kind of ['habit','money','planner','fitness','home','media','settings','checkin']){
      rowsByKind[kind]=await queryRows(SYNC_TABLES[kind]);
      var ids=new Set();
      for(var row of rowsByKind[kind]){
        var parsed=decode(kind,row);
        if(ids.has(parsed.id))throw syncError(SYNC_LABELS[kind]+'存在重复稳定 ID，请核对后再同步');
        ids.add(parsed.id);
      }
    }
    captureChanges();
    var currentMap=collectEntities();
    for(var [kind,rows] of Object.entries(rowsByKind)){
      // Samples are never cloud data, and do not survive a successful cloud load.
      if(['money','planner','fitness','home'].includes(kind))state.records=state.records.filter(r=>r.type!==kind||!r.sample);
      if(kind==='media')state.mediaItems=state.mediaItems.filter(r=>!r.sample);
      rows.forEach(row=>mergeRemoteRow(kind,row,currentMap));
    }
    var s=syncState(),current=collectEntities();
    // New defaults/custom definitions and local-only records are seeded only after a full read.
    Object.entries(current).forEach(([key,e])=>{
      if(!s.base[key]&&!s.queue[key])s.queue[key]=newTask(e,e.value,null);
    });
    // A conflict with no pending write whose two sides already agree is stale: drop it.
    Object.keys(s.conflicts).forEach(key=>{
      if(s.queue[key])return;
      var c=s.conflicts[key],base=s.base[key];
      if(base&&same(base.value,c.local))delete s.conflicts[key];
    });
    syncPrevious=collectEntities();
    if(!persistSync(false))throw syncError('本机保存失败，已暂停云端写入');
  }
  async function lookupTask(task){
    var databaseId=SYNC_TABLES[task.kind];
    var rows=await queryRows(databaseId,{property:{property:'稳定ID',text:{equals:task.id}}});
    if(rows.length>1)throw syncError(SYNC_LABELS[task.kind]+'存在重复记录，已停止写入');
    if(rows.length)return decode(task.kind,rows[0]);
    if(task.base?.remoteId){
      var result=await db.getRecord({databaseId,recordId:task.base.remoteId});
      if(!result?.result)throw syncError('原云端记录已不存在，请检查后处理');
      return decode(task.kind,result.result);
    }
    return null;
  }
  async function flushTask(key){
    var s=syncState(),task=s.queue[key];
    if(!task||s.conflicts[key])return;
    var remote=await lookupTask(task);
    // UI may change this record while its query is pending. Use the latest persisted task.
    task=s.queue[key];if(!task||s.conflicts[key])return;
    if(remote&&remote.revision===task.opId&&same(remote.value,task.value)){
      acknowledgeTask(key,task,remote);return;
    }
    if(task.predecessor){
      if(!remote)throw syncError('此前新增结果待确认；重试会先查询，暂不重复新增');
      if(remote.revision===task.predecessor.opId){task.base=copy(remote);delete task.predecessor;task.attempted=false;}
    }
    if(remote){
      var merged=mergeThree(task.base?.value??null,task.value,remote.value);
      if(merged.conflict){addConflict(key,task,remote,'云端已有不同内容');persistSync(false);return;}
      if(!same(task.value,merged.value)){task.value=merged.value;task.opId=uid();task.attempted=false;}
      task.base=copy(remote);
      applyEntity(task.kind,task.id,task.value,remote.remoteId);
      syncDirty=true;
    }
    if(!remote&&task.attempted)throw syncError('新增结果待确认；重试会先查询，暂不重复新增');
    if(!remote&&task.value===null){delete s.queue[key];persistSync(false);return;}
    var sent=copy(task),properties=propertiesFor(sent);
    task.attempted=true;
    if(!persistSync(false))throw syncError('本机保存失败，已暂停云端写入');
    var result=remote
      ?await db.updateRecord({databaseId:SYNC_TABLES[sent.kind],recordId:remote.remoteId,properties})
      :await db.addRecord({databaseId:SYNC_TABLES[sent.kind],properties});
    var rid=remote?.remoteId||result?.id||result?._id||result?.record_id;
    if(!rid){
      // The write may still have landed: reconcile by stable ID before declaring the result unknown.
      var found=await lookupTask(sent);
      if(found&&found.revision===sent.opId&&same(found.value,sent.value)){acknowledgeTask(key,sent,found);return;}
      throw syncError('云端未返回记录主键，将在重试时核对结果');
    }
    // Read back the version and complete payload before reporting cloud success.
    var verified=await db.getRecord({databaseId:SYNC_TABLES[sent.kind],recordId:String(rid)});
    var saved=decode(sent.kind,verified?.result);
    // Only a real content difference is a conflict. A stale change marker on its own means the
    // write landed but the read-back lagged: trust the content and keep the cloud marker.
    if(!same(saved.value,sent.value)){
      addConflict(key,s.queue[key]||sent,saved,'写入后发现其他修改');persistSync(false);return;
    }
    acknowledgeTask(key,sent,saved);
  }
  function acknowledgeTask(key,sent,saved){
    var s=syncState(),current=s.queue[key];
    s.base[key]=copy(saved);
    // Content equality also completes a task: replayed writes must not linger as pending.
    if(current&&(current.opId===sent.opId||same(current.value,sent.value))){
      delete s.queue[key];delete s.conflicts[key];
      applyEntity(sent.kind,sent.id,sent.value,saved.remoteId);
    }else if(current){
      current.base=copy(saved);delete current.predecessor;current.attempted=false;
    }
    syncDirty=true;
    if(!persistSync(false))throw syncError('云端已写入，本机确认保存失败；请保留页面并重试');
  }
  async function runSync(){
    if(syncRuntime.busy||!ONLINE||dataCorrupted||!syncRuntime.saved)return;
    syncRuntime.busy=true;syncRuntime.error='';renderSyncStatus();
    try{
      if(!syncRuntime.ready)await loadSchemaTypes();
      // Continuation passes skip the full pull: their own writes are verified by read-back,
      // and re-pulling thousands of rows between batches would keep the page frozen.
      if(!syncRuntime.continuing)await pullAllRemote();
      var keys=Object.keys(syncState().queue).filter(k=>!syncState().conflicts[k]).slice(0,SYNC_BATCH);
      for(var key of keys)await flushTask(key);
      if(syncDirty){syncPrevious=collectEntities();syncDirty=false;}
      if(!Object.keys(syncState().queue).length)syncState().lastSync=new Date().toISOString();
      syncRuntime.failures=0;
      persistSync(false);
    }catch(error){
      syncRuntime.error=safeError(error);syncRuntime.failures++;syncRuntime.continuing=false;
    }finally{
      syncRuntime.busy=false;
      try{renderAll();}catch(renderError){}
      renderSyncStatus();
      var pending=Object.keys(syncState().queue).filter(k=>!syncState().conflicts[k]);
      // Bounded retries; manual retry and online events remain available.
      if(syncRuntime.failures>0&&syncRuntime.failures<=3)scheduleSync(1000*Math.pow(2,syncRuntime.failures));
      else if(!syncRuntime.error&&pending.length){syncRuntime.continuing=true;syncRuntime.timer=setTimeout(()=>runSync(),30);}
    }
  }
  function resolveSyncConflict(key,choice){
    var s=syncState(),c=s.conflicts[key],task=s.queue[key];if(!c||c.duplicate)return;
    if(!task){
      // Keep the conflict actionable even if its queue entry was already retired.
      var cut=key.indexOf(':'),id=String((c.remote&&c.remote.id)||(c.local&&c.local.id)||key.slice(cut+1));
      task=s.queue[key]={kind:c.kind||key.slice(0,cut),id,value:copy(c.local),base:copy(s.base[key]||null),opId:uid(),attempted:false};
    }
    if(choice==='remote'){
      applyEntity(task.kind,task.id,c.remote.value,c.remote.remoteId);
      s.base[key]=copy(c.remote);delete s.queue[key];
    }else{
      task.base=copy(c.remote);task.opId=uid();task.attempted=false;delete task.predecessor;
    }
    delete s.conflicts[key];syncPrevious=collectEntities();
    if(persistSync(false)){renderAll();scheduleSync(0);}
  }
  function exportRecovery(){
    var raw=localStorage.getItem(STORAGE_KEY);
    downloadBlob(JSON.stringify({format:'richangji-recovery-v15',exportedAt:new Date().toISOString(),state,corruptedOriginal:dataCorrupted?raw:null},null,2),'application/json','日常集-完整备份-'+isoDate()+'.json');
  }
  function startSync(){
    prepareSync();
    document.getElementById('syncRetry')?.addEventListener('click',()=>{
      syncRuntime.ready=false;syncRuntime.failures=0;
      if(persistSync(true))runSync();
    });
    document.getElementById('syncExport')?.addEventListener('click',exportRecovery);
    window.addEventListener('online',()=>{syncRuntime.failures=0;scheduleSync(0);});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleSync(0);});
    renderSyncStatus();
    if(!dataCorrupted&&saveState())scheduleSync(0);
  }
  function acquireWorkbenchEditor(init){
    if(!navigator.locks){
      document.body.textContent='当前浏览器无法安全协调本机数据。请使用最新版 Chrome、Edge 或 Safari 打开工作台。';
      return;
    }
    navigator.locks.request('richangji-single-editor-v15',{ifAvailable:true},lock=>{
      if(!lock){
        document.body.textContent='另一个工作台页面正在使用此设备的数据。请关闭另一个页面后刷新，避免两页互相覆盖。';
        return;
      }
      init();
      return new Promise(()=>{});
    }).catch(()=>{document.body.textContent='无法锁定本机数据，请关闭其他工作台页面后重试。';});
  }
  // Existing UI mutation entry points remain compatible. saveState captures the final desired state.
  function pushMoney(){} function pushPlan(){} function pushFitness(){} function pushShopping(){} function pushMedia(){}
  function updateRemoteMoney(){} function updateRemotePlan(){} function updateRemoteFitness(){} function updateRemoteShopping(){}
  function updateRemoteMedia(){} function deleteRemoteMoney(){} function deleteRemotePlan(){} function deleteRemoteFitness(){}
  function deleteRemoteShopping(){} function deleteRemoteMedia(){}
  function pushHabit(h,date){
    // Sample history is never uploaded when the first real check-in is made.
    if(h.sample){var value=h.entries[date];h.entries={};h.entries[date]=value;h.sample=false;}
    delete h.pendingAdd;
  }

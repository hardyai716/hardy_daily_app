#!/usr/bin/env python3
"""Build v34 hardening candidate from the deployed v33 snapshot."""

import argparse
import hashlib
import json
from pathlib import Path


def patch(source: bytes) -> bytes:
    text = source.decode("utf-8").replace("\r\n", "\n").replace("\r", "\n")

    def replace(old: str, new: str, count: int = 1) -> None:
        nonlocal text
        actual = text.count(old)
        if actual != count:
            raise ValueError(
                f"Baseline changed: expected {count} occurrences of {old!r}, got {actual}"
            )
        text = text.replace(old, new)

    def replace_all(old: str, new: str, minimum: int = 1) -> None:
        nonlocal text
        actual = text.count(old)
        if actual < minimum:
            raise ValueError(
                f"Baseline changed: expected at least {minimum} occurrences of {old!r}, got {actual}"
            )
        text = text.replace(old, new)

    replace(
        "var syncRuntime = {busy:false, ready:false, error:'', timer:null, fullPullTimer:null, saved:true, failures:0, forcePull:true, lastFullPullAt:0};",
        "var syncRuntime = {busy:false, restoring:false, ready:false, error:'', timer:null, fullPullTimer:null, saved:true, failures:0, forcePull:true, lastFullPullAt:0};",
    )
    replace(
        "  function syncKey(kind,id){return kind+':'+String(id);}",
        """  function syncKey(kind,id){return kind+':'+String(id);}
  var SAFE_ENTITY_ID=/^[A-Za-z0-9._:/-]{1,160}$/;
  function isSafeEntityId(value){return typeof value==='string'&&SAFE_ENTITY_ID.test(value);}""",
    )
    replace(
        "    if(!ONLINE||syncRuntime.busy||!syncRuntime.saved||dataCorrupted)return;",
        "    if(!ONLINE||syncRuntime.busy||syncRuntime.restoring||!syncRuntime.saved||dataCorrupted)return;",
    )
    replace(
        "    var ok=v&&typeof v.id==='string'&&v.id.length>0;",
        "    var ok=v&&isSafeEntityId(v.id);",
    )
    replace(
        "    if(kind==='habit')ok=ok&&typeof v.name==='string'&&['check','counter','number','time'].includes(v.type)&&['day','week','month'].includes(v.period||'day')&&Number(v.target)>0;",
        "    if(kind==='habit')ok=ok&&typeof v.name==='string'&&['check','counter','number','time'].includes(v.type)&&['day','week','month'].includes(v.period||'day')&&['sage','plum','terracotta','sand'].includes(v.tone)&&Number(v.target)>0;",
    )
    replace(
        "    if(kind==='settings')ok=ok&&(v.id==='budget'?Number.isFinite(v.value):['weeklyPlan','toolFavorites','toolIdeas'].includes(v.id)?Array.isArray(v.value):['brand','fitnessProfile'].includes(v.id)&&object(v.value));",
        """    if(kind==='settings')ok=ok&&(v.id==='budget'?Number.isFinite(v.value):['weeklyPlan','toolFavorites','toolIdeas'].includes(v.id)?Array.isArray(v.value):['brand','fitnessProfile'].includes(v.id)&&object(v.value));
    if(kind==='settings'&&v.id==='weeklyPlan')ok=ok&&v.value.every(item=>item&&isSafeEntityId(String(item.id||''))&&typeof item.title==='string');
    if(kind==='settings'&&v.id==='toolIdeas')ok=ok&&v.value.every(item=>item&&isSafeEntityId(String(item.id||''))&&typeof item.title==='string');""",
    )
    replace(
        "  async function flushTask(key){",
        """  async function recheckRemoteBeforeWrite(key,remote){
    if(!remote)return {remote,task:syncState().queue[key]};
    var latestResult=await db.getRecord({databaseId:SYNC_TABLES[remote.kind],recordId:remote.remoteId});
    var latest=decode(remote.kind,latestResult?.result),s=syncState(),task=s.queue[key];
    if(!task||s.conflicts[key])return null;
    if(latest.revision===remote.revision&&same(latest.value,remote.value))return {remote:latest,task};
    var merged=mergeThree(task.base?.value??null,task.value,latest.value);
    if(merged.conflict){
      addConflict(key,task,latest,'写入前发现云端已有新修改');
      persistSync(false);
      return null;
    }
    if(!same(task.value,merged.value)){task.value=merged.value;task.opId=uid();task.attempted=false;}
    task.base=copy(latest);
    applyEntity(task.kind,task.id,task.value,latest.remoteId);
    syncDirty=true;
    return {remote:latest,task};
  }
  async function flushTask(key){""",
    )
    replace(
        "    if(!remote&&task.value===null){delete s.queue[key];persistSync(false);return;}\n    var sent=copy(task),properties=propertiesFor(sent);",
        """    if(!remote&&task.value===null){delete s.queue[key];persistSync(false);return;}
    var checked=await recheckRemoteBeforeWrite(key,remote);
    if(!checked)return;
    remote=checked.remote;task=checked.task;
    var sent=copy(task),properties=propertiesFor(sent);""",
    )
    replace(
        "    if(syncRuntime.busy||!ONLINE||dataCorrupted||!syncRuntime.saved)return;",
        "    if(syncRuntime.busy||syncRuntime.restoring||!ONLINE||dataCorrupted||!syncRuntime.saved)return;",
    )

    old_validation = """  function validateRecoveryState(value){
    if(value.records.length>100000||value.mediaItems.length>10000||
      value.habits.length+(value.archivedHabits||[]).length>1000||
      value.assetAccounts.length>10000||value.assetSnapshots.length>100000||value.assetSnapshotItems.length>1000000)throw new Error('备份数据量异常');
    ensureUnique(value.records,r=>r.type+':'+String(r.id),'生活记录');
    ensureUnique(value.mediaItems,r=>String(r.id),'书影音');
    ensureUnique([...(value.habits||[]),...(value.archivedHabits||[])],h=>String(h.id),'习惯');
    ensureUnique(value.assetAccounts,item=>String(item.id),'资产账户');
    ensureUnique(value.assetSnapshots,item=>String(item.id),'资产快照');
    ensureUnique(value.assetSnapshotItems,item=>String(item.id),'资产快照明细');
    [...(value.habits||[]),...(value.archivedHabits||[])].forEach(function(habit){
      Object.entries(habit.entries||{}).forEach(function(entry){
        if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(entry[0])||!Number.isFinite(Number(entry[1]))||Number(entry[1])<0)
          throw new Error('习惯打卡日期或数值无效');
      });
    });
  }"""
    new_validation = """  function recoveryArray(value,key,required){
    var result=value&&value[key];
    if(result==null&&!required)return [];
    if(!Array.isArray(result))throw new Error('备份字段“'+key+'”必须是数组');
    return result;
  }
  function recoveryObject(value,label){
    if(!value||typeof value!=='object'||Array.isArray(value))throw new Error(label+'格式无效');
    return value;
  }
  function recoveryId(value,label){
    if(!isSafeEntityId(value))throw new Error(label+' ID 含有非法字符');
    return value;
  }
  function recoveryDate(value,label,allowEmpty){
    if((allowEmpty&&(value==null||value===''))||/^\\d{4}-\\d{2}-\\d{2}$/.test(value||''))return;
    throw new Error(label+'日期格式无效');
  }
  function validateAssetSnapshotIntegrity(accounts,snapshots,items){
    var accountIds=new Set(accounts.map(item=>String(item.id)));
    var snapshotIds=new Set(snapshots.map(item=>String(item.id))),grouped={};
    items.forEach(function(item){
      if(!snapshotIds.has(String(item.snapshotId)))throw new Error('资产快照明细引用了不存在的快照');
      if(!accountIds.has(String(item.accountId)))throw new Error('资产快照明细引用了不存在的账户');
      (grouped[item.snapshotId]||=[]).push(item);
    });
    snapshots.filter(item=>item.status==='complete').forEach(function(snapshot){
      var rows=grouped[snapshot.id]||[];
      var totalAssets=rows.filter(item=>item.nature==='asset').reduce((sum,item)=>sum+Number(item.balance),0);
      var totalDebt=rows.filter(item=>item.nature==='debt').reduce((sum,item)=>sum+Math.abs(Number(item.balance)),0);
      var close=(left,right)=>Math.abs(Number(left)-Number(right))<0.005;
      if(!close(snapshot.totalAssets,totalAssets)||!close(snapshot.totalDebt,totalDebt)||
        !close(snapshot.netWorth,totalAssets-totalDebt))
        throw new Error('完整资产快照的汇总金额与账户明细不一致');
    });
  }
  function validateRawRecoveryState(value){
    recoveryObject(value,'备份状态');
    var records=recoveryArray(value,'records',true);
    var mediaItems=recoveryArray(value,'mediaItems',false);
    var habits=recoveryArray(value,'habits',false);
    var archivedHabits=recoveryArray(value,'archivedHabits',false);
    var assetAccounts=recoveryArray(value,'assetAccounts',false);
    var assetSnapshots=recoveryArray(value,'assetSnapshots',false);
    var assetSnapshotItems=recoveryArray(value,'assetSnapshotItems',false);
    records.forEach(function(record){
      recoveryObject(record,'生活记录');recoveryId(record.id,'生活记录');
      if(!['money','planner','fitness','home'].includes(record.type))throw new Error('生活记录类型无效');
      recoveryDate(record.date,'生活记录',true);recoveryObject(record.data,'生活记录内容');
      if(record.type==='money'&&(!['expense','income'].includes(record.data.flow)||!Number.isFinite(record.data.amount)||record.data.amount<0))
        throw new Error('记账记录格式无效');
      if(record.type==='planner'&&(typeof record.data.title!=='string'||!['low','normal','high'].includes(record.data.priority||'normal')))
        throw new Error('日程记录格式无效');
      if(record.type==='fitness'&&!Number.isFinite(Number(record.data.weight)))throw new Error('健身记录格式无效');
      if(record.type==='home'&&(typeof record.data.name!=='string'||!['low','normal','high'].includes(record.data.priority||'normal')||
        (record.data.price!=null&&(!Number.isFinite(record.data.price)||record.data.price<0))))throw new Error('待买记录格式无效');
    });
    mediaItems.forEach(function(item){
      recoveryObject(item,'书影音');recoveryId(item.id,'书影音');
      if(typeof item.name!=='string'||!item.name.trim()||!['电影','剧','书','番'].includes(item.type)||
        !['想看','在看','看完','弃了'].includes(item.status)||!Number.isInteger(item.rating)||item.rating<0||item.rating>5)
        throw new Error('书影音记录格式无效');
      recoveryDate(item.date,'书影音',true);
    });
    [...habits,...archivedHabits].forEach(function(habit){
      recoveryObject(habit,'习惯');recoveryId(habit.id,'习惯');
      if(typeof habit.name!=='string'||!habit.name.trim()||!['check','counter','number','time'].includes(habit.type||'check')||
        !['day','week','month'].includes(habit.period||'day')||!['sage','plum','terracotta','sand'].includes(habit.tone||'sage'))
        throw new Error('习惯定义格式无效');
      recoveryObject(habit.entries||{},'习惯打卡');
      Object.entries(habit.entries||{}).forEach(function(entry){
        recoveryDate(entry[0],'习惯打卡',false);
        if(!Number.isFinite(entry[1])||entry[1]<0)throw new Error('习惯打卡数值无效');
      });
    });
    assetAccounts.forEach(function(item){
      recoveryObject(item,'资产账户');recoveryId(item.id,'资产账户');
      if(typeof item.name!=='string'||!item.name.trim()||!['asset','debt'].includes(item.nature)||
        typeof item.category!=='string'||!Number.isFinite(item.balance)||!['active','archived'].includes(item.status))
        throw new Error('资产账户格式无效');
    });
    assetSnapshots.forEach(function(item){
      recoveryObject(item,'资产快照');recoveryId(item.id,'资产快照');
      if(typeof item.createdAt!=='string'||Number.isNaN(new Date(item.createdAt).getTime())||
        !Number.isFinite(item.totalAssets)||!Number.isFinite(item.totalDebt)||!Number.isFinite(item.netWorth)||
        !['writing','complete'].includes(item.status))throw new Error('资产快照格式无效');
    });
    assetSnapshotItems.forEach(function(item){
      recoveryObject(item,'资产快照明细');recoveryId(item.id,'资产快照明细');
      recoveryId(item.snapshotId,'资产快照');recoveryId(item.accountId,'资产账户');
      if(typeof item.accountName!=='string'||!['asset','debt'].includes(item.nature)||!Number.isFinite(item.balance))
        throw new Error('资产快照明细格式无效');
    });
    var weeklyPlan=value.settings&&value.settings.weeklyPlan;
    if(weeklyPlan!=null){
      if(!Array.isArray(weeklyPlan))throw new Error('周计划格式无效');
      weeklyPlan.forEach(item=>{recoveryObject(item,'周计划');recoveryId(String(item.id||''),'周计划');});
    }
    var toolIdeas=value.settings&&value.settings.toolIdeas;
    if(toolIdeas!=null){
      if(!Array.isArray(toolIdeas))throw new Error('工具想法格式无效');
      toolIdeas.forEach(item=>{recoveryObject(item,'工具想法');recoveryId(String(item.id||''),'工具想法');});
    }
    ensureUnique(records,r=>r.type+':'+r.id,'生活记录');
    ensureUnique(mediaItems,r=>r.id,'书影音');
    ensureUnique([...habits,...archivedHabits],h=>h.id,'习惯');
    ensureUnique(assetAccounts,item=>item.id,'资产账户');
    ensureUnique(assetSnapshots,item=>item.id,'资产快照');
    ensureUnique(assetSnapshotItems,item=>item.id,'资产快照明细');
    validateAssetSnapshotIntegrity(assetAccounts,assetSnapshots,assetSnapshotItems);
  }
  function validateRecoveryState(value){
    if(value.records.length>100000||value.mediaItems.length>10000||
      value.habits.length+(value.archivedHabits||[]).length>1000||
      value.assetAccounts.length>10000||value.assetSnapshots.length>100000||value.assetSnapshotItems.length>1000000)throw new Error('备份数据量异常');
    validateRawRecoveryState(value);
  }"""
    replace(old_validation, new_validation)
    replace(
        "    var normalized=normalizeState(copy(packet.state));",
        "    validateRawRecoveryState(packet.state);\n    var normalized=normalizeState(copy(packet.state));",
    )

    replace(
        """    next.assetSnapshots=mergeRecords(current.assetSnapshots||[],backup.assetSnapshots||[],item=>String(item.id),(old,item)=>{
      var value={...old,...copy(item)};if(old.remoteId)value.remoteId=old.remoteId;return value;
    });
    next.assetSnapshotItems=mergeRecords(current.assetSnapshotItems||[],backup.assetSnapshotItems||[],item=>String(item.id),(old,item)=>{
      var value={...old,...copy(item)};if(old.remoteId)value.remoteId=old.remoteId;return value;
    });""",
        """    function mergeImmutable(currentItems,incomingItems,label){
      return mergeRecords(currentItems,incomingItems,item=>String(item.id),(old,item)=>{
        var oldValue=cleanRecordForRestore(old),incomingValue=cleanRecordForRestore(item);
        delete oldValue.cloudStatus;delete incomingValue.cloudStatus;
        if(!same(oldValue,incomingValue))throw new Error(label+'存在相同 ID 但内容不同的历史记录');
        return old;
      });
    }
    next.assetSnapshots=mergeImmutable(current.assetSnapshots||[],backup.assetSnapshots||[],'资产快照');
    next.assetSnapshotItems=mergeImmutable(current.assetSnapshotItems||[],backup.assetSnapshotItems||[],'资产快照明细');""",
    )

    old_apply = """  async function applyRecovery(mode){
    if(!pendingRestore)return;
    if(syncRuntime.busy){toast('正在同步，请稍后再恢复');return;}
    if(mode==='replace'){
      if(!exportRecovery('日常集-恢复前备份'))return;
      var ok=await askConfirm(
        restoreText('完全替换会删除当前有、备份中没有的记录。恢复前快照已开始下载，确认继续吗？',
          'Replace removes records not present in the backup. A pre-restore snapshot is downloading. Continue?'),
        restoreText('完全替换','Replace')
      );
      if(!ok)return;
    }
    var previousState=state,previousSyncPrevious=syncPrevious,previousCorrupted=dataCorrupted;
    var before=collectEntities(),next=mode==='merge'
      ?mergeRecoveryState(state,pendingRestore.state)
      :replaceRecoveryState(state,pendingRestore.state);
    next.sync=copy(syncState());
    next.sync.conflicts={};
    pendingRestore.deletions.forEach(intent=>removeRecoveryEntity(next,intent));
    try{
      state=next;syncPrevious=before;dataCorrupted=false;
      captureChanges();
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      syncRuntime.saved=true;syncPrevious=collectEntities();syncDirty=false;
    }catch(error){
      state=previousState;syncPrevious=previousSyncPrevious;dataCorrupted=previousCorrupted;
      toast('恢复失败，本机原数据未改变');return;
    }
    closeRestoreDialog();renderAll();renderSyncStatus();scheduleSync(0);
    toast(mode==='merge'?'备份已合并，正在同步':'备份已替换，正在同步');
  }"""
    new_apply = """  async function applyRecovery(mode){
    if(!pendingRestore)return;
    if(syncRuntime.busy||syncRuntime.restoring){toast('正在同步，请稍后再恢复');return;}
    if(mode==='replace'){
      if(!exportRecovery('日常集-恢复前备份'))return;
      var ok=await askConfirm(
        restoreText('完全替换会删除当前有、备份中没有的记录。恢复前快照已开始下载，确认继续吗？',
          'Replace removes records not present in the backup. A pre-restore snapshot is downloading. Continue?'),
        restoreText('完全替换','Replace')
      );
      if(!ok)return;
      if(syncRuntime.busy){toast('确认期间开始了同步，请等待同步完成后重试');return;}
    }
    syncRuntime.restoring=true;
    clearTimeout(syncRuntime.timer);clearTimeout(syncRuntime.fullPullTimer);
    var previousState=state,previousSyncPrevious=syncPrevious,previousCorrupted=dataCorrupted;
    try{
      var before=collectEntities(),next=mode==='merge'
        ?mergeRecoveryState(state,pendingRestore.state)
        :replaceRecoveryState(state,pendingRestore.state);
      next.sync=copy(syncState());
      next.sync.conflicts={};
      pendingRestore.deletions.forEach(intent=>removeRecoveryEntity(next,intent));
      state=next;syncPrevious=before;dataCorrupted=false;
      captureChanges();
      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
      syncRuntime.saved=true;syncPrevious=collectEntities();syncDirty=false;
    }catch(error){
      state=previousState;syncPrevious=previousSyncPrevious;dataCorrupted=previousCorrupted;
      syncRuntime.restoring=false;renderSyncStatus();
      toast(error&&error.message?error.message:'恢复失败，本机原数据未改变');return;
    }
    syncRuntime.restoring=false;
    closeRestoreDialog();renderAll();renderSyncStatus();scheduleSync(0);
    toast(mode==='merge'?'备份已合并，正在同步':'备份已替换，正在同步');
  }"""
    replace(old_apply, new_apply)

    replace(
        "      appVersion:33,",
        "      appVersion:34,",
    )
    replace(
        "  const escapeHtml = value => String(value??'').replace(/[&<>'\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',\"'\":'&#39;','\"':'&quot;'}[c]));",
        """  const escapeHtml = value => String(value??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const escapeAttr = value => escapeHtml(value);""",
    )
    replace_all('data-id="${record.id}"', 'data-id="${escapeAttr(record.id)}"', 3)
    replace_all('data-id="${h.id}"', 'data-id="${escapeAttr(h.id)}"', 8)
    replace_all('data-id="${item.id}"', 'data-id="${escapeAttr(item.id)}"', 5)
    replace_all('data-id="${r.id}"', 'data-id="${escapeAttr(r.id)}"', 2)
    replace_all('data-id="${tool.id}"', 'data-id="${escapeAttr(tool.id)}"', 2)
    replace(
        'data-id="${escapeHtml(id)}"',
        'data-id="${escapeAttr(id)}"',
    )
    replace(
        'name="${escapeHtml(item.id)}"',
        'name="${escapeAttr(item.id)}"',
    )
    replace(
        "select.innerHTML=categories.map(c=>`<option ${c===current?'selected':''}>${c}</option>`).join('');",
        "select.innerHTML=categories.map(c=>`<option ${c===current?'selected':''}>${escapeHtml(c)}</option>`).join('');",
    )

    replace(
        "  var activeLocalDate=isoDate();\n  var dayRolloverTimer=null;",
        "  var activeLocalDate=isoDate();\n  var activeHabitDaySignature='';\n  var dayRolloverTimer=null;",
    )
    replace(
        "      dayBoundary:Number.isInteger(Number(clean.dayBoundary))?clamp(Number(clean.dayBoundary),0,12):HABIT_DAY_BOUNDARY,entries};",
        "      dayBoundary:Number.isInteger(Number(clean.dayBoundary))?clamp(Number(clean.dayBoundary),0,12):HABIT_DAY_BOUNDARY,\n"
        "      tone:['sage','plum','terracotta','sand'].includes(clean.tone)?clean.tone:(def.tone||'sage'),entries};",
    )
    old_rollover = """  function scheduleDayRollover(){
    clearTimeout(dayRolloverTimer);
    var now=new Date(),next=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,1);
    dayRolloverTimer=setTimeout(function(){
      refreshCurrentDay();
      scheduleDayRollover();
    },Math.max(1000,next-now));
  }
  function refreshCurrentDay(){
    var nextDate=isoDate();
    if(nextDate===activeLocalDate)return false;
    var previousDate=activeLocalDate;
    activeLocalDate=nextDate;
    updateTodayLabel();
    updateBlankFormDates(previousDate,nextDate);
    renderAll();
    scheduleDayRollover();
    return true;
  }
  function setupCalendarRollover(){
    state.settings.weeklyPlan=normalizeWeeklyPlan(state.settings.weeklyPlan);
    activeLocalDate=isoDate();
    updateTodayLabel();
    scheduleDayRollover();
    window.addEventListener('focus',refreshCurrentDay);
  }"""
    new_rollover = """  function habitDaySignature(now=new Date()){
    var boundaries=new Set([HABIT_DAY_BOUNDARY]);
    state.habits.filter(h=>h.type==='time').forEach(h=>boundaries.add(Number(h.dayBoundary??HABIT_DAY_BOUNDARY)));
    return Array.from(boundaries).sort((a,b)=>a-b).map(boundary=>boundary+':'+logicalHabitDate(now,boundary)).join('|');
  }
  function scheduleDayRollover(){
    clearTimeout(dayRolloverTimer);
    var now=new Date(),candidates=[new Date(now.getFullYear(),now.getMonth(),now.getDate()+1,0,0,1)];
    var boundaries=new Set([HABIT_DAY_BOUNDARY]);
    state.habits.filter(h=>h.type==='time').forEach(h=>boundaries.add(Number(h.dayBoundary??HABIT_DAY_BOUNDARY)));
    boundaries.forEach(function(boundary){
      var next=new Date(now.getFullYear(),now.getMonth(),now.getDate(),boundary,0,1);
      if(next<=now)next.setDate(next.getDate()+1);
      candidates.push(next);
    });
    var next=new Date(Math.min(...candidates.map(value=>value.getTime())));
    dayRolloverTimer=setTimeout(function(){refreshCurrentDay();},Math.max(1000,next-now));
  }
  function refreshCurrentDay(){
    var now=new Date(),nextDate=isoDate(now),nextHabitSignature=habitDaySignature(now);
    if(nextDate===activeLocalDate&&nextHabitSignature===activeHabitDaySignature){
      scheduleDayRollover();return false;
    }
    var previousDate=activeLocalDate,naturalDayChanged=nextDate!==activeLocalDate;
    activeLocalDate=nextDate;activeHabitDaySignature=nextHabitSignature;
    updateTodayLabel();
    if(naturalDayChanged)updateBlankFormDates(previousDate,nextDate);
    renderAll();scheduleDayRollover();
    return true;
  }
  function setupCalendarRollover(){
    state.settings.weeklyPlan=normalizeWeeklyPlan(state.settings.weeklyPlan);
    activeLocalDate=isoDate();activeHabitDaySignature=habitDaySignature();
    updateTodayLabel();scheduleDayRollover();
    window.addEventListener('focus',refreshCurrentDay);
  }"""
    replace(old_rollover, new_rollover)

    return text.replace("\n", "\r\n").encode("utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    source = args.baseline.read_bytes()
    result = patch(source)
    args.output.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "life-all-in-one.html"):
        (args.output / name).write_bytes(result)

    digest = hashlib.sha256(result).hexdigest()
    manifest = {
        "status": "local-candidate-not-deployed",
        "version": 34,
        "change": "Harden backup restore, DOM IDs, logical-day rollover, and pre-write conflict detection",
        "source": str(args.baseline),
        "generated_by": "repair/build_v34.py",
        "baseline_sha256": hashlib.sha256(source).hexdigest(),
        "candidate_sha256": digest,
        "bytes": len(result),
        "two_paths_identical": True,
        "schema_version": 6,
        "app_version": 34,
        "database_bindings": 11,
        "cloud_schema_changes": False,
        "publish_requires_explicit_instruction": True,
    }
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()

  /* ================= Backup Restore v22 ================= */
  var RESTORE_MAX_BYTES = 20 * 1024 * 1024;
  var pendingRestore = null;

  function restoreText(zh, en){ return LANG === 'en' ? en : zh; }
  function recoveryCounts(value){
    var records=value.records||[];
    return {
      money:records.filter(r=>r.type==='money').length,
      planner:records.filter(r=>r.type==='planner').length,
      fitness:records.filter(r=>r.type==='fitness').length,
      home:records.filter(r=>r.type==='home').length,
      habits:(value.habits||[]).length,
      archivedHabits:(value.archivedHabits||[]).length,
      media:(value.mediaItems||[]).length
    };
  }
  function exportRecovery(prefix){
    var raw=localStorage.getItem(STORAGE_KEY),counts=recoveryCounts(state);
    var packet={
      format:'richangji-recovery-v22',
      schemaVersion:3,
      appVersion:22,
      exportedAt:new Date().toISOString(),
      counts:counts,
      state:state,
      corruptedOriginal:dataCorrupted?raw:null
    };
    var base=typeof prefix==='string'&&prefix?prefix:'日常集-完整备份';
    return downloadBlob(JSON.stringify(packet,null,2),'application/json',base+'-'+isoDate()+'.json');
  }
  function rejectUnsafeBackupKeys(value,depth){
    if(depth>30)throw new Error('备份嵌套层级异常');
    if(!value||typeof value!=='object')return;
    Object.keys(value).forEach(function(key){
      if(key==='__proto__'||key==='prototype'||key==='constructor')throw new Error('备份包含不安全字段');
      rejectUnsafeBackupKeys(value[key],depth+1);
    });
  }
  function ensureUnique(items,keyOf,label){
    var seen=new Set();
    items.forEach(function(item){
      var key=keyOf(item);
      if(!key||seen.has(key))throw new Error(label+'存在空 ID 或重复 ID');
      seen.add(key);
    });
  }
  function cleanRecordForRestore(record){
    var value=copy(record);delete value.remoteId;return value;
  }
  function cleanHabitForRestore(habit){
    var value=copy(habit);
    delete value.remoteId;delete value.remoteIds;delete value.pendingAdd;
    value.entries=copy(value.entries||{});
    return value;
  }
  function validateRecoveryState(value){
    if(value.records.length>100000||value.mediaItems.length>10000||
      value.habits.length+(value.archivedHabits||[]).length>1000)throw new Error('备份数据量异常');
    ensureUnique(value.records,r=>r.type+':'+String(r.id),'生活记录');
    ensureUnique(value.mediaItems,r=>String(r.id),'书影音');
    ensureUnique([...(value.habits||[]),...(value.archivedHabits||[])],h=>String(h.id),'习惯');
    [...(value.habits||[]),...(value.archivedHabits||[])].forEach(function(habit){
      Object.entries(habit.entries||{}).forEach(function(entry){
        if(!/^\d{4}-\d{2}-\d{2}$/.test(entry[0])||!Number.isFinite(Number(entry[1]))||Number(entry[1])<0)
          throw new Error('习惯打卡日期或数值无效');
      });
    });
  }
  function backupDeletionIntents(rawState){
    var allowed=new Set(['money','planner','fitness','home','media','habit','checkin']);
    var queue=rawState&&rawState.sync&&rawState.sync.queue;
    if(!queue||typeof queue!=='object')return [];
    var result=[],seen=new Set();
    Object.values(queue).forEach(function(task){
      if(!task||task.value!==null||!allowed.has(task.kind)||typeof task.id!=='string'||!task.id)return;
      var key=task.kind+':'+task.id;
      if(!seen.has(key)){seen.add(key);result.push({kind:task.kind,id:task.id});}
    });
    return result;
  }
  function parseRecoveryBackup(text){
    var packet;
    try{packet=JSON.parse(text);}catch(error){throw new Error('备份不是有效的 JSON 文件');}
    rejectUnsafeBackupKeys(packet,0);
    if(!packet||!['richangji-recovery-v15','richangji-recovery-v22'].includes(packet.format)||!packet.state)
      throw new Error('不是日常集完整备份');
    var normalized=normalizeState(copy(packet.state));
    normalized.records=normalized.records.map(cleanRecordForRestore);
    normalized.mediaItems=normalized.mediaItems.map(cleanRecordForRestore);
    normalized.habits=normalized.habits.map(cleanHabitForRestore);
    normalized.archivedHabits=(normalized.archivedHabits||[]).map(cleanHabitForRestore);
    normalized.sync=null;
    validateRecoveryState(normalized);
    return {
      state:normalized,
      deletions:backupDeletionIntents(packet.state),
      exportedAt:packet.exportedAt||'',
      sourceFormat:packet.format,
      counts:recoveryCounts(normalized)
    };
  }
  function mapBy(items,keyOf){var map=new Map();items.forEach(item=>map.set(keyOf(item),item));return map;}
  function preserveRecordRemote(current,incoming,keyOf){
    var existing=mapBy(current,keyOf);
    return incoming.map(function(item){
      var old=existing.get(keyOf(item)),value=copy(item);
      if(old&&old.remoteId)value.remoteId=old.remoteId;
      return value;
    });
  }
  function preserveHabitRemote(current,incoming){
    var existing=mapBy(current,h=>String(h.id));
    return incoming.map(function(item){
      var old=existing.get(String(item.id)),value=cleanHabitForRestore(item);
      if(old&&old.remoteId)value.remoteId=old.remoteId;
      value.remoteIds=copy(old&&old.remoteIds||{});
      return value;
    });
  }
  function mergeRecords(current,incoming,keyOf,merge){
    var result=current.map(copy),indexes=new Map();
    result.forEach((item,index)=>indexes.set(keyOf(item),index));
    incoming.forEach(function(item){
      var key=keyOf(item),index=indexes.get(key);
      if(index===undefined){indexes.set(key,result.length);result.push(copy(item));}
      else result[index]=merge?merge(result[index],item):copy(item);
    });
    return result;
  }
  function mergeRecoveryState(current,backup){
    var next=copy(current);
    next.records=mergeRecords(current.records,backup.records,r=>r.type+':'+String(r.id),(old,item)=>{
      var value={...old,...copy(item)};if(old.remoteId)value.remoteId=old.remoteId;return value;
    });
    next.mediaItems=mergeRecords(current.mediaItems,backup.mediaItems,r=>String(r.id),(old,item)=>{
      var value={...old,...copy(item)};if(old.remoteId)value.remoteId=old.remoteId;return value;
    });
    var currentHabits=[...(current.habits||[]),...(current.archivedHabits||[])];
    var importedHabits=[...(backup.habits||[]),...(backup.archivedHabits||[])];
    var importedArchived=new Set((backup.archivedHabits||[]).map(h=>String(h.id)));
    var merged=mergeRecords(currentHabits,importedHabits,h=>String(h.id),(old,item)=>{
      var value={...old,...cleanHabitForRestore(item),entries:{...(old.entries||{}),...(item.entries||{})}};
      if(old.remoteId)value.remoteId=old.remoteId;value.remoteIds=copy(old.remoteIds||{});return value;
    });
    next.habits=merged.filter(h=>!importedArchived.has(String(h.id))&&!h.archived);
    next.archivedHabits=merged.filter(h=>importedArchived.has(String(h.id))||h.archived);
    next.drafts={...(current.drafts||{}),...(backup.drafts||{})};
    next.settings={
      ...(current.settings||{}),...(backup.settings||{}),
      brand:{...(current.settings&&current.settings.brand||{}),...(backup.settings&&backup.settings.brand||{})},
      fitnessProfile:{...(current.settings&&current.settings.fitnessProfile||{}),...(backup.settings&&backup.settings.fitnessProfile||{})},
      weeklyPlan:copy(backup.settings&&backup.settings.weeklyPlan||current.settings.weeklyPlan||[])
    };
    next.version=3;
    return next;
  }
  function replaceRecoveryState(current,backup){
    var next=copy(backup);
    next.records=preserveRecordRemote(current.records,next.records,r=>r.type+':'+String(r.id));
    next.mediaItems=preserveRecordRemote(current.mediaItems,next.mediaItems,r=>String(r.id));
    var currentHabits=[...(current.habits||[]),...(current.archivedHabits||[])];
    next.habits=preserveHabitRemote(currentHabits,next.habits||[]);
    next.archivedHabits=preserveHabitRemote(currentHabits,next.archivedHabits||[]);
    next.version=3;
    return next;
  }
  function removeRecoveryEntity(target,intent){
    if(['money','planner','fitness','home'].includes(intent.kind))
      target.records=target.records.filter(r=>!(r.type===intent.kind&&String(r.id)===intent.id));
    if(intent.kind==='media')target.mediaItems=target.mediaItems.filter(r=>String(r.id)!==intent.id);
    if(intent.kind==='habit'){
      target.habits=target.habits.filter(h=>String(h.id)!==intent.id);
      target.archivedHabits=target.archivedHabits.filter(h=>String(h.id)!==intent.id);
    }
    if(intent.kind==='checkin'){
      var cut=intent.id.lastIndexOf('/'),habitId=intent.id.slice(0,cut),date=intent.id.slice(cut+1);
      [...target.habits,...target.archivedHabits].forEach(function(h){
        if(String(h.id)===habitId){delete h.entries[date];if(h.remoteIds)delete h.remoteIds[date];}
      });
    }
  }
  function restorePreviewText(info){
    var c=info.counts,date=info.exportedAt?new Date(info.exportedAt).toLocaleString():'未知';
    return restoreText(
      `备份时间：${date}\n记账 ${c.money} 条 · 日程 ${c.planner} 条 · 健身 ${c.fitness} 条 · 待买 ${c.home} 条\n习惯 ${c.habits} 个 · 已归档 ${c.archivedHabits} 个 · 书影音 ${c.media} 条\n待恢复删除操作 ${info.deletions.length} 项`,
      `Backup: ${date}\nMoney ${c.money} · Planner ${c.planner} · Fitness ${c.fitness} · Shopping ${c.home}\nHabits ${c.habits} · Archived ${c.archivedHabits} · Media ${c.media}\nPending deletions ${info.deletions.length}`
    );
  }
  function closeRestoreDialog(){
    var dialog=document.getElementById('restoreBackdrop');if(dialog)dialog.hidden=true;
    pendingRestore=null;
    var input=document.getElementById('syncImportFile');if(input)input.value='';
  }
  async function applyRecovery(mode){
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
  }
  function ensureRestoreDialog(){
    if(document.getElementById('restoreBackdrop'))return;
    var backdrop=document.createElement('div');backdrop.id='restoreBackdrop';
    backdrop.className='settings-backdrop';backdrop.hidden=true;
    backdrop.innerHTML='<section class="settings-sheet" role="dialog" aria-modal="true" aria-labelledby="restoreTitle">'
      +'<div class="settings-head"><div><p class="eyebrow">BACKUP RESTORE</p><h2 id="restoreTitle">恢复完整备份</h2></div>'
      +'<button type="button" class="sheet-close" id="restoreClose" aria-label="关闭">×</button></div>'
      +'<p id="restoreSummary" style="white-space:pre-line;line-height:1.8"></p>'
      +'<p style="color:var(--muted);font-size:12px">合并恢复保留当前独有内容；完全替换会让备份成为目标状态。</p>'
      +'<div class="sheet-actions" style="flex-wrap:wrap">'
      +'<button type="button" class="btn ghost" id="restoreExportCurrent">导出当前数据</button>'
      +'<button type="button" class="btn ghost" id="restoreCancel">取消</button>'
      +'<button type="button" class="btn primary" id="restoreMerge">合并恢复</button>'
      +'<button type="button" class="btn danger" id="restoreReplace">完全替换</button>'
      +'</div></section>';
    document.body.appendChild(backdrop);
    ['restoreClose','restoreCancel'].forEach(id=>document.getElementById(id).addEventListener('click',closeRestoreDialog));
    document.getElementById('restoreExportCurrent').addEventListener('click',()=>exportRecovery('日常集-恢复前备份'));
    document.getElementById('restoreMerge').addEventListener('click',()=>applyRecovery('merge'));
    document.getElementById('restoreReplace').addEventListener('click',()=>applyRecovery('replace'));
    backdrop.addEventListener('click',event=>{if(event.target===backdrop)closeRestoreDialog();});
  }
  function readRecoveryFile(file){
    if(file.size>RESTORE_MAX_BYTES)return Promise.reject(new Error('备份文件超过 20MB'));
    if(file.text)return file.text();
    return new Promise(function(resolve,reject){
      var reader=new FileReader();reader.onload=()=>resolve(String(reader.result||''));reader.onerror=()=>reject(new Error('备份读取失败'));reader.readAsText(file);
    });
  }
  function setupRecoveryImport(){
    if(document.getElementById('syncImport'))return;
    ensureRestoreDialog();
    var exportButton=document.getElementById('syncExport');if(!exportButton)return;
    var button=document.createElement('button');button.id='syncImport';button.type='button';button.className='btn ghost';
    button.textContent=restoreText('导入备份','Import backup');
    var input=document.createElement('input');input.id='syncImportFile';input.type='file';
    input.accept='.json,application/json';input.hidden=true;
    exportButton.insertAdjacentElement('afterend',button);button.insertAdjacentElement('afterend',input);
    button.addEventListener('click',()=>input.click());
    input.addEventListener('change',async function(){
      var file=input.files&&input.files[0];if(!file)return;
      try{
        var parsed=parseRecoveryBackup(await readRecoveryFile(file));
        pendingRestore=parsed;
        document.getElementById('restoreSummary').textContent=restorePreviewText(parsed);
        document.getElementById('restoreBackdrop').hidden=false;
        document.getElementById('restoreMerge').focus();
      }catch(error){
        pendingRestore=null;input.value='';
        toast(error&&error.message?error.message:'备份校验失败');
      }
    });
  }

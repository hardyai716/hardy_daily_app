  /* ================= Runtime Governance v26 ================= */
  var SYNC_FULL_PULL_MS=5*60*1000;
  var COVER_MAX_CHARS=260000;
  var LOCAL_STATE_WARN_BYTES=4*1024*1024;

  function approximateStateBytes(extraChars){
    try{return JSON.stringify(state).length*2+Number(extraChars||0)*2;}
    catch(error){return 0;}
  }
  function storageSizeText(bytes){
    if(bytes<1024)return bytes+' B';
    if(bytes<1024*1024)return (bytes/1024).toFixed(1)+' KB';
    return (bytes/1024/1024).toFixed(2)+' MB';
  }
  function storageSummary(){
    var bytes=approximateStateBytes();
    var tombstones=Object.values(syncState().base||{}).filter(item=>item&&item.deleted).length;
    var warning=bytes>=LOCAL_STATE_WARN_BYTES
      ?editText('，已接近浏览器本机容量，请导出备份并清理不需要的封面','; near browser storage capacity, export a backup and remove unused covers')
      :'';
    var deleted=tombstones
      ?(LANG==='en'?` · ${tombstones} cloud deletion markers retained`:` · 保留 ${tombstones} 个云端删除标记`)
      :'';
    return LANG==='en'
      ?`Local data ${storageSizeText(bytes)}${deleted}${warning}`
      :`本机数据约 ${storageSizeText(bytes)}${deleted}${warning}`;
  }
  function coverStorageError(dataUrl){
    if(String(dataUrl||'').length>COVER_MAX_CHARS)
      return editText('封面压缩后仍过大，请先裁剪图片再上传','The compressed cover is still too large; crop it before uploading');
    var existingChars=0;
    if(editSession&&editSession.kind==='media'){
      var item=findEditableRecord('media',editSession.id);
      existingChars=String(item&&item.cover||'').length;
    }
    if(approximateStateBytes(String(dataUrl||'').length-existingChars)>=LOCAL_STATE_WARN_BYTES)
      return editText('本机数据已接近容量上限，请先导出备份并移除不需要的封面','Local storage is near capacity; export a backup and remove unused covers first');
    return '';
  }
  function compactSyncMetadata(){
    var s=syncState();
    Object.values(s.base||{}).forEach(function(item){
      if(item&&item.deleted){item.value=null;delete item.legacy;}
    });
  }
  function requestFullSync(delay){
    syncRuntime.forcePull=true;
    scheduleSync(delay==null?0:delay);
  }
  function scheduleBackgroundPull(){
    clearTimeout(syncRuntime.fullPullTimer);
    if(!ONLINE||document.hidden)return;
    syncRuntime.fullPullTimer=setTimeout(function(){requestFullSync(0);},SYNC_FULL_PULL_MS);
  }

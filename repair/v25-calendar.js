  /* ================= Calendar Rollover v25 ================= */
  var activeLocalDate=isoDate();
  var dayRolloverTimer=null;
  var weeklyPlanNeedsCloudMigration=false;

  function isoWeekKey(value){
    var source=value instanceof Date?value:new Date(value||Date.now());
    var date=new Date(Date.UTC(source.getFullYear(),source.getMonth(),source.getDate()));
    var day=date.getUTCDay()||7;
    date.setUTCDate(date.getUTCDate()+4-day);
    var yearStart=new Date(Date.UTC(date.getUTCFullYear(),0,1));
    var week=Math.ceil((((date-yearStart)/86400000)+1)/7);
    return date.getUTCFullYear()+'-W'+String(week).padStart(2,'0');
  }
  function weeklyPlanHasLegacy(items){
    return Array.isArray(items)&&items.some(item=>
      item&&Object.prototype.hasOwnProperty.call(item,'done')&&!item.doneByWeek
    );
  }
  function normalizeWeeklyPlan(items,weekKey){
    var currentWeek=weekKey||isoWeekKey();
    return (Array.isArray(items)?items:[]).map(function(item){
      var value={...item},source=item&&item.doneByWeek;
      var doneByWeek=source&&typeof source==='object'&&!Array.isArray(source)?{...source}:{};
      if(!source&&item&&item.done)doneByWeek[currentWeek]=true;
      var keys=Object.keys(doneByWeek).filter(key=>doneByWeek[key]).sort().slice(-104);
      value.doneByWeek=Object.fromEntries(keys.map(key=>[key,true]));
      delete value.done;
      return value;
    });
  }
  function planIsDone(item,weekKey){
    if(item&&item.doneByWeek&&typeof item.doneByWeek==='object')
      return Boolean(item.doneByWeek[weekKey||isoWeekKey()]);
    return Boolean(item&&item.done);
  }
  function setPlanDone(item,value,weekKey){
    if(!item)return;
    var key=weekKey||isoWeekKey();
    item.doneByWeek=normalizeWeeklyPlan([item],key)[0].doneByWeek;
    if(value)item.doneByWeek[key]=true;
    else delete item.doneByWeek[key];
    delete item.done;
  }
  function updateTodayLabel(){
    var now=new Date(),weekdays=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];
    document.getElementById('todayLabel').textContent=LANG==='en'
      ?new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',weekday:'long'}).format(now)
      :`${now.getMonth()+1} 月 ${now.getDate()} 日 · ${weekdays[now.getDay()]}`;
  }
  function updateBlankFormDates(previousDate,nextDate){
    document.querySelectorAll('form[data-draft]').forEach(function(form){
      if(editSession&&editSession.form===form)return;
      if(Object.prototype.hasOwnProperty.call(state.drafts,form.dataset.draft))return;
      var hasContent=Array.from(form.elements).some(function(field){
        if(!field.name||field.type==='date'||field.type==='time'||field.type==='radio'||
          field.type==='submit'||field.tagName==='SELECT')return false;
        if(field.type==='checkbox')return field.checked;
        if(field.type==='file')return Boolean(field.files&&field.files.length);
        return String(field.value||'').trim()!=='';
      });
      if(form.id==='mediaForm'&&pendingMediaCover)hasContent=true;
      if(hasContent)return;
      form.querySelectorAll('input[type="date"][name="date"]').forEach(function(input){
        if(!input.value||input.value===previousDate){input.value=nextDate;dtSync(input);}
      });
    });
  }
  function scheduleDayRollover(){
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
  }

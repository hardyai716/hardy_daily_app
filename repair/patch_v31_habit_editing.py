#!/usr/bin/env python3
"""Add history-safe habit editing with scheduled rule versions."""
import argparse
import hashlib
import json
from pathlib import Path


def patch(source: bytes) -> bytes:
    data = source

    def replace(old: str, new: str, count: int = 1) -> None:
        nonlocal data
        old_bytes = old.encode("utf-8")
        new_bytes = new.encode("utf-8")
        actual = data.count(old_bytes)
        if actual == 0 and "\n" in old:
            old_bytes = old.replace("\n", "\r\n").encode("utf-8")
            new_bytes = new.replace("\n", "\r\n").encode("utf-8")
            actual = data.count(old_bytes)
        if actual != count:
            raise ValueError(
                f"Baseline changed: expected {count} occurrences of {old!r}, got {actual}"
            )
        data = data.replace(old_bytes, new_bytes)

    replace(
        ".habit-time-clear svg{width:15px;height:15px}",
        ".habit-time-clear svg{width:15px;height:15px}"
        ".habit-card-edit{position:absolute;right:42px;top:9px;width:28px;height:28px;padding:0;border:0;border-radius:9px;background:rgba(255,255,255,.75);color:#9b8e84;opacity:0}"
        ".daily-habit:hover .habit-card-edit{opacity:1}.habit-card-edit:hover{background:var(--plum-soft);color:var(--plum)}"
        ".habit-manage-actions{display:flex;align-items:center;gap:4px}.habit-manage-actions button{flex:0 0 auto}"
        ".habit-edit-note{padding:12px;border:1px solid var(--line);border-radius:11px;background:#f6f1ea;color:var(--muted);font-size:11px;line-height:1.6}"
        ".habit-edit-note strong{display:block;color:var(--ink);font-size:12px}"
        ".habit-edit-note.pending{border-color:#d8c49a;background:#f7efdf}"
        ".habit-locked{opacity:.68}.habit-locked select,.habit-locked input{cursor:not-allowed}"
        ".habit-edit-secondary{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}"
        ".habit-edit-secondary .btn{min-height:36px}.habit-edit-secondary .btn[hidden]{display:none}",
    )
    replace(
        ".daily-habit .habit-card-delete,.plan-item .plan-delete,.media-card .media-delete{opacity:1}",
        ".daily-habit .habit-card-delete,.daily-habit .habit-card-edit,.plan-item .plan-delete,.media-card .media-delete{opacity:1}",
    )

    habit_settings_end = """    </section>
  </div>

  <div data-page-node-id="xXgwzovfTdWqSOVDn6bP7z" class="settings-backdrop" hidden id="planSettings">"""
    habit_edit_modal = """    </section>
  </div>

  <div class="settings-backdrop" hidden id="habitEditSettings">
    <section aria-labelledby="habitEditTitle" aria-modal="true" class="settings-sheet" role="dialog">
      <div class="settings-head"><div><p class="eyebrow">编辑习惯</p><h2 id="habitEditTitle">修改习惯</h2></div><button aria-label="关闭" class="sheet-close" data-action="close-habit-edit">×</button></div>
      <form id="habitEditForm">
        <label class="field"><span>习惯名称</span><input maxlength="18" name="name" required></label>
        <div class="form-row" id="habitEditStructureFields"><label class="field"><span>目标周期</span><select name="period"><option value="day">每天</option><option value="week">每周</option><option value="month">每月</option></select></label><label class="field"><span>记录方式</span><select name="type"><option value="check">完成一次</option><option value="counter">计数累加</option><option value="number">填写数值</option><option value="time">指定时间前</option></select></label></div>
        <div class="form-row habit-number-fields" id="habitEditTargetFields"><label class="field"><span id="habitEditTargetLabel">每天目标</span><input max="9999" min="0.1" name="target" required step="0.1" type="number"></label><label class="field" id="habitEditUnitField"><span>单位</span><input maxlength="6" name="unit"></label></div>
        <div class="habit-time-fields" id="habitEditTimeFields" hidden><label class="field"><span>目标：最晚完成时间</span><input name="targetTime" type="time"></label></div>
        <label class="field"><span>主题色</span><select name="tone"><option value="sage">鼠尾草绿</option><option value="plum">暮色紫</option><option value="terracotta">陶土橙</option><option value="sand">燕麦色</option></select></label>
        <div class="habit-edit-note" id="habitEditNotice"></div>
        <div class="habit-edit-secondary"><button class="btn ghost" data-action="cancel-habit-rule" id="habitCancelRuleBtn" type="button" hidden>撤销待生效修改</button><button class="btn ghost" data-action="replace-habit" id="habitReplaceBtn" type="button" hidden>按新规则创建</button></div>
        <div class="sheet-actions"><button class="btn ghost" data-action="close-habit-edit" type="button">取消</button><button class="btn primary" id="habitEditSubmit" type="submit">保存修改</button></div>
      </form>
    </section>
  </div>

  <div data-page-node-id="xXgwzovfTdWqSOVDn6bP7z" class="settings-backdrop" hidden id="planSettings">"""
    replace(habit_settings_end, habit_edit_modal)

    replace("      schemaVersion:4,", "      schemaVersion:5,")
    replace("      appVersion:30,", "      appVersion:31,")
    replace("    next.version=4;", "    next.version=5;", 2)
    replace(
        "      version:4,records,habits,mediaItems,archivedHabits,sync:candidate.sync||null,",
        "      version:5,records,habits,mediaItems,archivedHabits,sync:candidate.sync||null,",
    )
    replace(
        "    const s=makeInitialState();s.version=3;s.records=[];s.mediaItems=[];",
        "    const s=makeInitialState();s.version=5;s.records=[];s.mediaItems=[];",
    )

    replace(
        "put('habit',{id:String(h.id),key:h.key,name:h.name,type:h.type,period:h.period,rule:h.rule,target:h.target,targetTime:h.targetTime||'',dayBoundary:h.dayBoundary,unit:h.unit,tone:h.tone,archived:Boolean(h.archived)},h.remoteId);",
        "put('habit',{id:String(h.id),key:h.key,name:h.name,nameCustomized:Boolean(h.nameCustomized),type:h.type,period:h.period,rule:h.rule,target:h.target,targetTime:h.targetTime||'',goalVersions:copy(h.goalVersions||[]),dayBoundary:h.dayBoundary,unit:h.unit,tone:h.tone,archived:Boolean(h.archived)},h.remoteId);",
    )
    replace(
        "state.habits.push({id:uid(),key:`custom-${uid()}`,name:data.name.trim(),type:data.type,period,rule:isTime?'beforeTime':'atLeast',target,targetTime:isTime?data.targetTime:'',dayBoundary:HABIT_DAY_BOUNDARY,unit:isTime?'时间':data.type==='check'?'次':data.unit.trim()||'次',tone:data.tone,entries:{},sample:false});",
        "state.habits.push({id:uid(),key:`custom-${uid()}`,name:data.name.trim(),nameCustomized:true,type:data.type,period,rule:isTime?'beforeTime':'atLeast',target,targetTime:isTime?data.targetTime:'',goalVersions:[{effectiveFrom:'0001-01-01',target,targetTime:isTime?data.targetTime:'01:00'}],dayBoundary:HABIT_DAY_BOUNDARY,unit:isTime?'时间':data.type==='check'?'次':data.unit.trim()||'次',tone:data.tone,entries:{},sample:false});",
    )
    replace(
        "    if(kind==='habit'&&v.type==='time')ok=ok&&(v.period||'day')==='day'&&/^([01]\\d|2[0-3]):[0-5]\\d$/.test(v.targetTime||'');",
        "    if(kind==='habit'&&v.type==='time')ok=ok&&(v.period||'day')==='day'&&/^([01]\\d|2[0-3]):[0-5]\\d$/.test(v.targetTime||'');\r\n"
        "    if(kind==='habit'&&v.goalVersions!==undefined)ok=ok&&Array.isArray(v.goalVersions)&&v.goalVersions.every(g=>g&&/^\\d{4}-\\d{2}-\\d{2}$/.test(g.effectiveFrom||'')&&Number(g.target)>0&&/^([01]\\d|2[0-3]):[0-5]\\d$/.test(g.targetTime||'01:00'));",
    )

    old_progress = """  function habitProgress(habit,date=isoDate()){
    const period=habit.period||'day',bounds=habitPeriodBounds(period,date),dates=habitPeriodDates(bounds);
    if(habit.type==='time'){
      const value=Number(habit.entries?.[date]||0),target=timeToHabitMinutes(habit.targetTime,habit.dayBoundary);
      return {value,target,done:value>0&&value<=target,bounds,dates};
    }
    const value=sum(dates,d=>Number(habit.entries?.[d]||0)),target=Number(habit.target||1);
    return {value,target,done:value>=target,bounds,dates};
  }"""
    new_progress = """  function normalizeHabitGoalVersions(habit){
    const fallback={effectiveFrom:'0001-01-01',target:Math.max(.1,Number(habit.target||1)),targetTime:/^([01]\\d|2[0-3]):[0-5]\\d$/.test(habit.targetTime||'')?habit.targetTime:'01:00'};
    const versions=(Array.isArray(habit.goalVersions)?habit.goalVersions:[]).filter(v=>v&&/^\\d{4}-\\d{2}-\\d{2}$/.test(v.effectiveFrom||'')&&Number(v.target)>0).map(v=>({effectiveFrom:v.effectiveFrom,target:Math.max(.1,Number(v.target)),targetTime:/^([01]\\d|2[0-3]):[0-5]\\d$/.test(v.targetTime||'')?v.targetTime:fallback.targetTime})).sort((a,b)=>a.effectiveFrom.localeCompare(b.effectiveFrom));
    if(!versions.some(v=>v.effectiveFrom==='0001-01-01'))versions.unshift(fallback);
    return versions.filter((v,i,list)=>i===list.length-1||v.effectiveFrom!==list[i+1].effectiveFrom);
  }
  function habitRuleAt(habit,date=isoDate()){const versions=normalizeHabitGoalVersions(habit);return versions.filter(v=>v.effectiveFrom<=date).at(-1)||versions[0];}
  function habitPendingRule(habit,date=isoDate()){return normalizeHabitGoalVersions(habit).find(v=>v.effectiveFrom>date)||null;}
  function habitHasEntries(habit){return Object.values(habit.entries||{}).some(value=>Number(value)>0);}
  function habitRuleDate(habit){return habit.type==='time'?logicalHabitDate(new Date(),habit.dayBoundary):isoDate();}
  function nextHabitRuleDate(habit,date=habitRuleDate(habit)){const bounds=habitPeriodBounds(habit.period||'day',date);return addLocalDays(bounds.end,1);}
  function habitRuleTargetText(habit,rule){return habit.type==='time'?`${rule.targetTime} 前`:`${rule.target} ${habit.type==='check'?'次':habit.unit}`;}
  function habitProgress(habit,date=isoDate()){
    const period=habit.period||'day',bounds=habitPeriodBounds(period,date),dates=habitPeriodDates(bounds),rule=habitRuleAt(habit,bounds.start);
    if(habit.type==='time'){
      const value=Number(habit.entries?.[date]||0),target=timeToHabitMinutes(rule.targetTime,habit.dayBoundary);
      return {value,target,done:value>0&&value<=target,bounds,dates,rule};
    }
    const value=sum(dates,d=>Number(habit.entries?.[d]||0)),target=Number(rule.target||1);
    return {value,target,done:value>=target,bounds,dates,rule};
  }"""
    replace(old_progress, new_progress)

    old_normalize = """  function normalizeHabit(habit,index) {
    const def=HABIT_DEFS.find(item=>item.key===habit.key) || {key:`custom-${index}`,name:habit.name||'习惯',type:'check',target:1,unit:'次',tone:habit.tone||'sage'};
    const entries={...(habit.entries||{})};
    (habit.completedDates||[]).forEach(date=>{entries[date]=1;});
    const {pendingAdd,...clean}=habit;
    const type=['check','counter','number','time'].includes(clean.type||def.type)?(clean.type||def.type):'check';
    const period=['day','week','month'].includes(clean.period)?clean.period:'day';
    return {...def,...clean,id:String(habit.id||`habit-${def.key}`),type,period:type==='time'?'day':period,
      rule:type==='time'?'beforeTime':'atLeast',target:Math.max(.1,Number(clean.target||def.target||1)),
      targetTime:/^([01]\\d|2[0-3]):[0-5]\\d$/.test(clean.targetTime||'')?clean.targetTime:'01:00',
      dayBoundary:Number.isInteger(Number(clean.dayBoundary))?clamp(Number(clean.dayBoundary),0,12):HABIT_DAY_BOUNDARY,entries};
  }"""
    new_normalize = """  function normalizeHabit(habit,index) {
    const def=HABIT_DEFS.find(item=>item.key===habit.key) || {key:`custom-${index}`,name:habit.name||'习惯',type:'check',target:1,unit:'次',tone:habit.tone||'sage'};
    const entries={...(habit.entries||{})};
    (habit.completedDates||[]).forEach(date=>{entries[date]=1;});
    const {pendingAdd,...clean}=habit;
    const type=['check','counter','number','time'].includes(clean.type||def.type)?(clean.type||def.type):'check';
    const period=['day','week','month'].includes(clean.period)?clean.period:'day';
    const normalized={...def,...clean,id:String(habit.id||`habit-${def.key}`),type,period:type==='time'?'day':period,
      rule:type==='time'?'beforeTime':'atLeast',target:Math.max(.1,Number(clean.target||def.target||1)),
      targetTime:/^([01]\\d|2[0-3]):[0-5]\\d$/.test(clean.targetTime||'')?clean.targetTime:'01:00',
      dayBoundary:Number.isInteger(Number(clean.dayBoundary))?clamp(Number(clean.dayBoundary),0,12):HABIT_DAY_BOUNDARY,entries};
    normalized.goalVersions=normalizeHabitGoalVersions(normalized);
    return normalized;
  }"""
    replace(old_normalize, new_normalize)

    replace(
        "  function habitNameHtml(habit){const def=HABIT_DEFS.find(d=>d.key===habit.key);if(def)return escapeHtml(resolveHabitName(def));return habit.sample?localizedHtml(habit.name):userHtml(habit.name);}",
        "  function habitNameHtml(habit){const def=HABIT_DEFS.find(d=>d.key===habit.key);if(def&&!habit.nameCustomized)return escapeHtml(resolveHabitName(def));return habit.sample&&!habit.nameCustomized?localizedHtml(habit.name):userHtml(habit.name);}",
    )
    old_goal_text = """  function habitGoalText(habit){
    if(habit.type==='time')return `${habitPeriodLabel(habit)} ${habit.targetTime} 前`;
    return `${habitPeriodLabel(habit)}目标 ${habit.target} ${habit.type==='check'?'次':habit.unit}`;
  }"""
    new_goal_text = """  function habitGoalText(habit,date=habitRuleDate(habit)){
    const rule=habitRuleAt(habit,habitPeriodBounds(habit.period||'day',date).start);
    if(habit.type==='time')return `${habitPeriodLabel(habit)} ${rule.targetTime} 前`;
    return `${habitPeriodLabel(habit)}目标 ${rule.target} ${habit.type==='check'?'次':habit.unit}`;
  }
  function habitPendingText(habit,date=habitRuleDate(habit)){const pending=habitPendingRule(habit,habitPeriodBounds(habit.period||'day',date).start);return pending?`${pending.effectiveFrom} 起改为 ${habitRuleTargetText(habit,pending)}`:'';}"""
    replace(old_goal_text, new_goal_text)

    replace(
        """        return`<div class="daily-habit ${h.type==='time'?'time-habit':''} ${isDone?'done':''} ${pulse?'pulse':''}"><button class="habit-card-delete" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('归档习惯')}">${icon('i-trash')}</button><div><h3>${habitNameHtml(h)}</h3><p>${escapeHtml(habitGoalText(h))} · 连续 ${habitStreak(h,entryDate)} ${habitStreakUnit(h)}</p><div class="habit-progress"><div class="habit-progress-track"><span style="width:${percent}%"></span></div><div class="habit-progress-label"><span>${escapeHtml(progressText)}</span><span>${progressState}</span></div></div></div><div class="habit-action ${h.type==='time'?'habit-time-action':''}"><span class="habit-state">${habitState}</span>${control}</div></div>`;""",
        """        const pendingText=habitPendingText(h,entryDate);
        return`<div class="daily-habit ${h.type==='time'?'time-habit':''} ${isDone?'done':''} ${pulse?'pulse':''}"><button class="habit-card-edit" data-action="edit-habit" data-id="${h.id}" aria-label="编辑习惯">${icon('i-edit')}</button><button class="habit-card-delete" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('归档习惯')}">${icon('i-trash')}</button><div><h3>${habitNameHtml(h)}</h3><p>${escapeHtml(habitGoalText(h,entryDate))} · 连续 ${habitStreak(h,entryDate)} ${habitStreakUnit(h)}</p>${pendingText?`<p title="${escapeHtml(pendingText)}">${escapeHtml(pendingText)}</p>`:''}<div class="habit-progress"><div class="habit-progress-track"><span style="width:${percent}%"></span></div><div class="habit-progress-label"><span>${escapeHtml(progressText)}</span><span>${progressState}</span></div></div></div><div class="habit-action ${h.type==='time'?'habit-time-action':''}"><span class="habit-state">${habitState}</span>${control}</div></div>`;""",
    )

    old_manage = """  function renderActiveHabitManageList(){const list=document.getElementById('habitManageList');list.innerHTML=state.habits.length?state.habits.map(h=>`<div class="custom-manage-row"><span><strong>${habitNameHtml(h)}</strong><small>${escapeHtml(habitGoalText(h))} · ${t(h.type==='check'?'完成一次':h.type==='counter'?'计数累加':h.type==='time'?'指定时间前':'填写数值')}</small></span><button type="button" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('归档习惯')}">${icon('i-trash')}</button></div>`).join(''):empty('还没有习惯');}"""
    new_manage = """  function renderActiveHabitManageList(){const list=document.getElementById('habitManageList');list.innerHTML=state.habits.length?state.habits.map(h=>{const pending=habitPendingText(h);return`<div class="custom-manage-row"><span><strong>${habitNameHtml(h)}</strong><small>${escapeHtml(habitGoalText(h))} · ${t(h.type==='check'?'完成一次':h.type==='counter'?'计数累加':h.type==='time'?'指定时间前':'填写数值')}${pending?` · 待生效：${escapeHtml(pending)}`:''}</small></span><span class="habit-manage-actions"><button type="button" data-action="edit-habit" data-id="${h.id}" aria-label="编辑习惯">${icon('i-edit')}</button><button type="button" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('归档习惯')}">${icon('i-trash')}</button></span></div>`;}).join(''):empty('还没有习惯');}"""
    replace(old_manage, new_manage)

    edit_functions_anchor = """  function openHabitSettings(){renderHabitManageList();document.getElementById('habitSettings').hidden=false;setTimeout(()=>document.getElementById('habitSettingsForm').elements.name.focus(),80);}
  function closeHabitSettings(){document.getElementById('habitSettings').hidden=true;}"""
    edit_functions = """  function openHabitSettings(){renderHabitManageList();document.getElementById('habitSettings').hidden=false;setTimeout(()=>document.getElementById('habitSettingsForm').elements.name.focus(),80);}
  function closeHabitSettings(){document.getElementById('habitSettings').hidden=true;}
  let editingHabitId='',habitEditMode='edit';
  function refreshHabitEditFields(){
    const form=document.getElementById('habitEditForm'),habit=state.habits.find(h=>h.id===editingHabitId);if(!habit)return;
    const hasEntries=habitHasEntries(habit),replacing=habitEditMode==='replace',locked=hasEntries&&!replacing,type=form.elements.type.value,isTime=type==='time',period=isTime?'day':form.elements.period.value,fixedDaily=type==='check'&&period==='day';
    if(isTime)form.elements.period.value='day';
    form.elements.type.disabled=locked;form.elements.period.disabled=locked||isTime;form.elements.unit.disabled=locked||isTime;
    document.getElementById('habitEditStructureFields').classList.toggle('habit-locked',locked);
    document.getElementById('habitEditUnitField').classList.toggle('habit-locked',locked);
    document.getElementById('habitEditTargetFields').hidden=isTime;document.getElementById('habitEditTimeFields').hidden=!isTime;
    form.elements.target.disabled=isTime;form.elements.target.required=!isTime;form.elements.target.readOnly=fixedDaily;if(fixedDaily)form.elements.target.value='1';if(type==='check')form.elements.unit.value='次';
    document.getElementById('habitEditTargetLabel').textContent=period==='week'?'每周目标':period==='month'?'每月目标':'每天目标';
    const current=habitRuleAt(habit,habitRuleDate(habit)),pending=habitPendingRule(habit,habitRuleDate(habit)),notice=document.getElementById('habitEditNotice');
    notice.classList.toggle('pending',Boolean(pending)&&!replacing);
    notice.innerHTML=replacing?'<strong>创建替代习惯</strong>保存后会建立一个没有历史记录的新习惯，并归档旧习惯。':locked?(pending?`<strong>已有待生效修改</strong>${escapeHtml(habitPendingText(habit))}。名称和主题色立即生效；目标修改仍从下个周期生效。`:`<strong>已有历史记录</strong>名称和主题色立即生效；目标修改从 ${nextHabitRuleDate(habit)} 起生效。记录方式、周期和单位需要创建替代习惯。`):'<strong>尚无历史记录</strong>所有字段都可以直接修改并立即生效。';
    document.getElementById('habitReplaceBtn').hidden=!locked||replacing;document.getElementById('habitCancelRuleBtn').hidden=!pending||replacing;
    document.getElementById('habitEditTitle').textContent=replacing?'创建替代习惯':'修改习惯';
    document.getElementById('habitEditSubmit').textContent=replacing?'创建并归档旧习惯':'保存修改';
  }
  function openHabitEdit(id){
    const habit=state.habits.find(h=>h.id===id);if(!habit)return;editingHabitId=id;habitEditMode='edit';
    const form=document.getElementById('habitEditForm'),date=habitRuleDate(habit),pending=habitPendingRule(habit,date),rule=pending||habitRuleAt(habit,date);
    form.elements.name.value=habit.name;form.elements.tone.value=habit.tone;form.elements.type.value=habit.type;form.elements.period.value=habit.period||'day';form.elements.target.value=rule.target;form.elements.targetTime.value=rule.targetTime||habit.targetTime||'01:00';form.elements.unit.value=habit.unit;
    refreshHabitEditFields();document.getElementById('habitEditSettings').hidden=false;enhanceDateTime();setTimeout(()=>form.elements.name.focus(),80);
  }
  function closeHabitEdit(){document.getElementById('habitEditSettings').hidden=true;editingHabitId='';habitEditMode='edit';}
  function startHabitReplacement(){if(!editingHabitId)return;habitEditMode='replace';refreshHabitEditFields();}
  function cancelHabitPendingRule(){
    const habit=state.habits.find(h=>h.id===editingHabitId);if(!habit)return;const date=habitRuleDate(habit);
    habit.goalVersions=normalizeHabitGoalVersions(habit).filter(v=>v.effectiveFrom<=date);
    if(saveState()){renderAll();renderHabitManageList();openHabitEdit(habit.id);toast('已撤销待生效修改');}
  }
  function habitFromEditForm(form){const type=form.elements.type.value,isTime=type==='time',period=isTime?'day':form.elements.period.value;return{name:form.elements.name.value.trim(),tone:form.elements.tone.value,type,period,rule:isTime?'beforeTime':'atLeast',target:isTime?1:Math.max(.1,Number(form.elements.target.value||1)),targetTime:isTime?form.elements.targetTime.value:'',dayBoundary:HABIT_DAY_BOUNDARY,unit:isTime?'时间':type==='check'?'次':form.elements.unit.value.trim()||'次'};}
  function saveHabitEdit(){
    const habit=state.habits.find(h=>h.id===editingHabitId),form=document.getElementById('habitEditForm');if(!habit)return;
    const values=habitFromEditForm(form);
    if(values.type==='time'&&!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(values.targetTime||''))return toast('请选择有效的目标时间');
    if(habitEditMode==='replace'){
      const replacement={...values,id:uid(),key:`custom-${uid()}`,nameCustomized:true,goalVersions:[{effectiveFrom:'0001-01-01',target:values.target,targetTime:values.targetTime||'01:00'}],entries:{},sample:false};
      state.habits=state.habits.filter(h=>h.id!==habit.id);habit.archived=true;(state.archivedHabits||=[]).push(habit);state.habits.push(replacement);
      if(saveState()){closeHabitEdit();renderAll();renderHabitManageList();toast('新习惯已创建，旧习惯已归档');}return;
    }
    habit.name=values.name;habit.nameCustomized=true;habit.tone=values.tone;
    if(!habitHasEntries(habit)){
      Object.assign(habit,values);habit.goalVersions=[{effectiveFrom:'0001-01-01',target:values.target,targetTime:values.targetTime||'01:00'}];
    }else{
      const date=habitRuleDate(habit),effectiveFrom=nextHabitRuleDate(habit,date),current=habitRuleAt(habit,date);
      habit.goalVersions=normalizeHabitGoalVersions(habit).filter(v=>v.effectiveFrom<effectiveFrom);
      if(values.target!==current.target||(habit.type==='time'&&values.targetTime!==current.targetTime))habit.goalVersions.push({effectiveFrom,target:values.target,targetTime:values.targetTime||current.targetTime});
    }
    if(saveState()){closeHabitEdit();renderAll();renderHabitManageList();toast(habitHasEntries(habit)?'习惯已更新，目标修改将在下个周期生效':'习惯已更新');}
  }"""
    replace(edit_functions_anchor, edit_functions)

    replace(
        "    document.getElementById('fitnessProfileSettings').addEventListener('click',event=>{if(event.target.id==='fitnessProfileSettings')closeFitnessProfile();});",
        "    document.getElementById('fitnessProfileSettings').addEventListener('click',event=>{if(event.target.id==='fitnessProfileSettings')closeFitnessProfile();});\r\n"
        "    document.getElementById('habitEditSettings').addEventListener('click',event=>{if(event.target.id==='habitEditSettings')closeHabitEdit();});",
    )
    replace(
        "    document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeBrandSettings();closeHabitSettings();closePlanSettings();closeFitnessProfile();}});",
        "    document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeBrandSettings();closeHabitSettings();closeHabitEdit();closePlanSettings();closeFitnessProfile();}});",
    )
    replace(
        "      if(type==='delete-habit-custom')removeHabitCustom(id);",
        "      if(type==='delete-habit-custom')removeHabitCustom(id);if(type==='edit-habit')openHabitEdit(id);if(type==='close-habit-edit')closeHabitEdit();if(type==='replace-habit')startHabitReplacement();if(type==='cancel-habit-rule')cancelHabitPendingRule();",
    )
    replace(
        "    document.addEventListener('change',event=>{if(event.target.dataset.action==='habit-number')updateHabit(event.target.dataset.id,'number',event.target.value);});",
        "    document.addEventListener('change',event=>{if(event.target.dataset.action==='habit-number')updateHabit(event.target.dataset.id,'number',event.target.value);if(event.target.closest?.('#habitEditForm')&&['type','period'].includes(event.target.name))refreshHabitEditFields();});",
    )
    replace(
        "    document.addEventListener('input',event=>{if(event.target.dataset.action!=='habit-time-input')return;const save=event.target.closest('.habit-time-entry')?.querySelector('[data-action=\"habit-time-save\"]');if(save)save.disabled=!event.target.value;});",
        "    document.addEventListener('input',event=>{if(event.target.dataset.action!=='habit-time-input')return;const save=event.target.closest('.habit-time-entry')?.querySelector('[data-action=\"habit-time-save\"]');if(save)save.disabled=!event.target.value;});\r\n"
        "    document.getElementById('habitEditForm').addEventListener('submit',event=>{event.preventDefault();saveHabitEdit();});",
    )

    return data


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
    manifest = {
        "status": "local-candidate-not-deployed",
        "version": 31,
        "change": "Add history-safe habit editing and scheduled goal changes",
        "baseline_sha256": hashlib.sha256(source).hexdigest(),
        "candidate_sha256": hashlib.sha256(result).hexdigest(),
        "bytes": len(result),
        "two_paths_identical": True,
        "cloud_schema_changes": False,
        "publish_requires_explicit_instruction": True,
    }
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()

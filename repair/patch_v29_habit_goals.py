#!/usr/bin/env python3
"""Add daily, weekly, monthly, and before-time habit goals without schema changes."""
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
        ".sleep-control input{width:62px;height:38px;border:1px solid var(--line);border-radius:10px;background:white;text-align:center}",
        ".sleep-control input{width:82px;height:38px;border:1px solid var(--line);border-radius:10px;background:white;text-align:center}"
        ".habit-time-fields[hidden],.habit-number-fields[hidden]{display:none}"
        ".habit-progress{margin-top:10px}.habit-progress-track{height:5px;border-radius:6px;background:#e5ddd2;overflow:hidden}"
        ".habit-progress-track span{display:block;height:100%;border-radius:inherit;background:var(--sage);transition:width .25s}"
        ".habit-progress-label{display:flex;justify-content:space-between;gap:8px;margin-top:5px;color:var(--muted);font-size:9px}"
        ".habit-period-groups{display:flex;flex-direction:column;gap:18px}.habit-period-group{display:flex;flex-direction:column;gap:10px}"
        ".habit-period-title{margin:2px 0 0;color:#766d63;font-size:11px;font-weight:750}",
    )

    old_form = """        <div data-page-node-id="84kQntutJs8qW2G9Y10BxU" class="form-row"><label data-page-node-id="I580GN52WPbUWdasdj1Sct" class="field"><span data-page-node-id="SGip7eALq1g7lBc8sT2pXB"><!--pnid:ODPHLm9VDJIMuxK0v6shMW-->打卡方式</span><select data-page-node-id="11zl1LPXtVixVLgp4RHf1d" id="habitTypeSelect" name="type"><option data-page-node-id="vt2h0RRqfjNjhEgT7iL6H9" value="check"><!--pnid:ebDBFNy4JPd33M1bwIZFKM-->完成 / 未完成</option><option data-page-node-id="YIp3stn3ktr7a4bthV3riw" value="counter"><!--pnid:jzRtotiNwVqzUS2D9H0Wuh-->计数累加</option><option data-page-node-id="W76NYNuWLGnjFiGcInQLwk" value="number"><!--pnid:fYjDFb8D6AkF81NPhNcze2-->填写数值</option></select></label><label data-page-node-id="IQGgnfai5LWvaS9gJ6OsDW" class="field"><span data-page-node-id="WEmdV4X2aeBEiWeTbo2e1E"><!--pnid:hieeHNDNLbaGttsZT9z54L-->主题色</span><select data-page-node-id="9keb45e4e92KkHVYxUTt4F" name="tone"><option data-page-node-id="5v7fcbF95bGXaYyx4by0p6" value="sage"><!--pnid:IIGu6tvdjoFkOU8ZLuFJjK-->鼠尾草绿</option><option data-page-node-id="RIfpTNQUnJVtbBRoIln1Wi" value="plum"><!--pnid:AdkfH3ZG2UWKeZWtG5Tvat-->暮色紫</option><option data-page-node-id="5rzej9Trf2MDWlJrVL9W4F" value="terracotta"><!--pnid:1h57ib1WOg6blbH5JkYxJO-->陶土橙</option><option data-page-node-id="Bv4N135iT25CtMVzfjhfUa" value="sand"><!--pnid:LE8nmHqLPcCaTnKo3zIeKD-->燕麦色</option></select></label></div>
        <div data-page-node-id="KbfJCKlKMuO0AjJA4YdBz4" class="form-row" id="habitTargetFields"><label data-page-node-id="kos5PNjpN5aHQO9KvKBHwb" class="field"><span data-page-node-id="TTqF7Xr8MBMeDSLIhsx1JT"><!--pnid:dtwyGcATHu8O5J2uEOa19i-->每日目标</span><input data-page-node-id="ixTOD9IYQ77JHa3vYJ6g9M" max="999" min="0.1" name="target" required step="0.1" type="number" value="1"></label><label data-page-node-id="7Qb7nkanEyI0PYHLbHKFbj" class="field"><span data-page-node-id="6oLRiP1oF4g8hspWir5CuD"><!--pnid:sstLFpDbQ5HorI422d72kE-->单位</span><input data-page-node-id="7lMkVBdGUZNQBtmU8uS2j1" maxlength="6" name="unit" placeholder="次 / 分钟 / 页" value="次"></label></div>"""
    new_form = """        <div class="form-row"><label class="field"><span>目标周期</span><select id="habitPeriodSelect" name="period"><option value="day">每天</option><option value="week">每周</option><option value="month">每月</option></select></label><label class="field"><span>记录方式</span><select id="habitTypeSelect" name="type"><option value="check">完成一次</option><option value="counter">计数累加</option><option value="number">填写数值</option><option value="time">指定时间前</option></select></label></div>
        <div class="form-row habit-number-fields" id="habitTargetFields"><label class="field"><span id="habitTargetLabel">每天目标</span><input max="9999" min="0.1" name="target" required step="0.1" type="number" value="1"></label><label class="field"><span>单位</span><input maxlength="6" name="unit" placeholder="次 / 分钟 / 页" value="次"></label></div>
        <div class="habit-time-fields" id="habitTimeFields" hidden><label class="field"><span>每天最晚完成时间</span><input name="targetTime" type="time" value="01:00"></label><p class="mini-note">凌晨 04:00 前的记录归入前一天，例如 00:30 计作前一晚。</p></div>
        <label class="field"><span>主题色</span><select name="tone"><option value="sage">鼠尾草绿</option><option value="plum">暮色紫</option><option value="terracotta">陶土橙</option><option value="sand">燕麦色</option></select></label>"""
    replace(old_form, new_form)
    replace("-->今日完成</span>", "-->当前达标</span>")
    replace("-->近 30 天完成率</span>", "-->近 30 天记录率</span>")
    replace(
        '"今日完成":"Completed today","最佳连续":"Best streak"',
        '"今日完成":"Completed today","当前达标":"Goals met","最佳连续":"Best streak"',
    )
    replace(
        '"近 30 天完成率":"30-day completion","30 天热力图"',
        '"近 30 天完成率":"30-day completion","近 30 天记录率":"30-day activity","30 天热力图"',
    )

    replace(
        "put('habit',{id:String(h.id),key:h.key,name:h.name,type:h.type,target:h.target,unit:h.unit,tone:h.tone,archived:Boolean(h.archived)},h.remoteId);",
        "put('habit',{id:String(h.id),key:h.key,name:h.name,type:h.type,period:h.period,rule:h.rule,target:h.target,targetTime:h.targetTime||'',dayBoundary:h.dayBoundary,unit:h.unit,tone:h.tone,archived:Boolean(h.archived)},h.remoteId);",
    )
    replace(
        "if(kind==='habit')ok=ok&&typeof v.name==='string'&&['check','counter','number'].includes(v.type)&&Number(v.target)>0;",
        "if(kind==='habit')ok=ok&&typeof v.name==='string'&&['check','counter','number','time'].includes(v.type)&&['day','week','month'].includes(v.period||'day')&&Number(v.target)>0;\r\n"
        "    if(kind==='habit'&&v.type==='time')ok=ok&&(v.period||'day')==='day'&&/^([01]\\d|2[0-3]):[0-5]\\d$/.test(v.targetTime||'');",
    )

    replace(
        "  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;",
        """  const uid = () => crypto.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const HABIT_DAY_BOUNDARY = 4;
  function parseLocalDate(value){const parts=String(value||isoDate()).split('-').map(Number);return new Date(parts[0],parts[1]-1,parts[2]);}
  function addLocalDays(value,days){const date=parseLocalDate(value);date.setDate(date.getDate()+days);return isoDate(date);}
  function logicalHabitDate(date=new Date(),boundary=HABIT_DAY_BOUNDARY){const logical=new Date(date);if(logical.getHours()<Number(boundary||0))logical.setDate(logical.getDate()-1);return isoDate(logical);}
  function timeToHabitMinutes(value,boundary=HABIT_DAY_BOUNDARY){const match=/^(\\d{2}):(\\d{2})$/.exec(String(value||''));if(!match)return 0;const minutes=Number(match[1])*60+Number(match[2]);return minutes<Number(boundary||0)*60?minutes+1440:minutes;}
  function habitMinutesToTime(value){const minutes=((Number(value)||0)%1440+1440)%1440;return `${String(Math.floor(minutes/60)).padStart(2,'0')}:${String(minutes%60).padStart(2,'0')}`;}
  function habitPeriodBounds(period='day',date=isoDate()){
    const start=parseLocalDate(date);
    if(period==='week')start.setDate(start.getDate()-((start.getDay()+6)%7));
    if(period==='month')start.setDate(1);
    const startKey=isoDate(start),end=new Date(start);
    if(period==='week')end.setDate(end.getDate()+6);
    else if(period==='month')end.setMonth(end.getMonth()+1,0);
    return {start:startKey,end:isoDate(end),key:period==='day'?startKey:period==='week'?startKey:`${start.getFullYear()}-${String(start.getMonth()+1).padStart(2,'0')}`};
  }
  function previousHabitPeriod(period,bounds){return habitPeriodBounds(period,addLocalDays(bounds.start,-1));}
  function habitPeriodDates(bounds){const dates=[];for(let date=bounds.start;date<=bounds.end;date=addLocalDays(date,1))dates.push(date);return dates;}
  function habitProgress(habit,date=isoDate()){
    const period=habit.period||'day',bounds=habitPeriodBounds(period,date),dates=habitPeriodDates(bounds);
    if(habit.type==='time'){
      const value=Number(habit.entries?.[date]||0),target=timeToHabitMinutes(habit.targetTime,habit.dayBoundary);
      return {value,target,done:value>0&&value<=target,bounds,dates};
    }
    const value=sum(dates,d=>Number(habit.entries?.[d]||0)),target=Number(habit.target||1);
    return {value,target,done:value>=target,bounds,dates};
  }""",
    )

    old_normalize = """  function normalizeHabit(habit,index) {
    const def=HABIT_DEFS.find(item=>item.key===habit.key) || {key:`custom-${index}`,name:habit.name||'习惯',type:'check',target:1,unit:'次',tone:habit.tone||'sage'};
    const entries={...(habit.entries||{})};
    (habit.completedDates||[]).forEach(date=>{entries[date]=1;});
    const {pendingAdd,...clean}=habit;return {...def,...clean,id:String(habit.id||`habit-${def.key}`),entries};
  }"""
    new_normalize = """  function normalizeHabit(habit,index) {
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
    replace(old_normalize, new_normalize)
    replace(
        "type:['check','counter','number'].includes(h.type)?h.type:'check',target:Number(h.target||1)",
        "type:['check','counter','number','time'].includes(h.type)?h.type:'check',period:['day','week','month'].includes(h.period)?h.period:'day',target:Number(h.target||1)",
    )
    replace("      version:3,records,habits,mediaItems,archivedHabits,sync:candidate.sync||null,", "      version:4,records,habits,mediaItems,archivedHabits,sync:candidate.sync||null,")
    replace("    next.version=3;", "    next.version=4;", 2)
    replace("      schemaVersion:3,", "      schemaVersion:4,")
    replace("      appVersion:28,", "      appVersion:29,")

    old_habit_logic = """  function habitDone(habit,date=isoDate()){return Number(habit.entries?.[date]||0)>=Number(habit.target||1);}
  function habitStreak(habit){let streak=0;const cursor=new Date();while(habitDone(habit,isoDate(cursor))){streak++;cursor.setDate(cursor.getDate()-1);}return streak;}
  function habitBestStreak(habit){let best=0,current=0;Object.keys(habit.entries||{}).sort().forEach((date,index,dates)=>{if(!habitDone(habit,date)){current=0;return;}const previous=dates[index-1];current=previous&&Math.round((new Date(date)-new Date(previous))/86400000)===1?current+1:1;best=Math.max(best,current);});return best;}"""
    new_habit_logic = """  function habitDone(habit,date=isoDate()){return habitProgress(habit,date).done;}
  function habitStreak(habit,date=isoDate()){let streak=0,bounds=habitPeriodBounds(habit.period||'day',date);while(habitProgress(habit,bounds.start).done){streak++;bounds=previousHabitPeriod(habit.period||'day',bounds);}return streak;}
  function habitBestStreak(habit){
    const dates=Object.keys(habit.entries||{}).sort();if(!dates.length)return 0;
    let bounds=habitPeriodBounds(habit.period||'day',dates[0]),last=habitPeriodBounds(habit.period||'day',dates.at(-1)),best=0,current=0;
    while(bounds.start<=last.start){if(habitProgress(habit,bounds.start).done){current++;best=Math.max(best,current);}else current=0;bounds=habitPeriodBounds(habit.period||'day',addLocalDays(bounds.end,1));}
    return best;
  }
  function habitPeriodLabel(habit){return habit.period==='week'?'本周':habit.period==='month'?'本月':'今天';}
  function habitStreakUnit(habit){return habit.period==='week'?'周':habit.period==='month'?'月':'天';}
  function habitUnitHtml(habit){const def=HABIT_DEFS.find(d=>d.key===habit.key),builtIn=Boolean(def)||habit.sample;if(habit.type==='time')return localizedHtml('时间');if(habit.type==='check')return localizedHtml('次');return def?escapeHtml(resolveHabitUnit(def)):builtIn?localizedHtml(habit.unit):userHtml(habit.unit);}
  function habitGoalText(habit){
    if(habit.type==='time')return `${habitPeriodLabel(habit)} ${habit.targetTime} 前`;
    return `${habitPeriodLabel(habit)}目标 ${habit.target} ${habit.type==='check'?'次':habit.unit}`;
  }"""
    replace(old_habit_logic, new_habit_logic)

    old_dashboard_habits = """    document.getElementById('dashboardHabits').innerHTML=state.habits.slice(0,5).map(h=>`<div class="habit-pill"><span class="habit-dot ${h.tone}"></span><strong>${habitNameHtml(h)}</strong><small>${t(habitDone(h)?'已完成':'待打卡')}</small><button class="check-btn ${habitDone(h)?'checked':''}" data-action="habit-quick" data-id="${h.id}">${habitDone(h)?icon('i-check'):''}</button></div>`).join('');"""
    new_dashboard_habits = """    document.getElementById('dashboardHabits').innerHTML=state.habits.slice(0,5).map(h=>{const progress=habitProgress(h,h.type==='time'?logicalHabitDate(new Date(),h.dayBoundary):today),canQuick=h.type==='check';return`<div class="habit-pill"><span class="habit-dot ${h.tone}"></span><strong>${habitNameHtml(h)}</strong><small>${t(progress.done?'已完成':'待打卡')}</small>${canQuick?`<button class="check-btn ${Number(h.entries?.[today]||0)>0?'checked':''}" data-action="habit-quick" data-id="${h.id}">${Number(h.entries?.[today]||0)>0?icon('i-check'):''}</button>`:''}</div>`;}).join('');"""
    replace(old_dashboard_habits, new_dashboard_habits)
    replace(
        "    const completed=state.habits.filter(h=>habitDone(h)).length;",
        "    const completed=state.habits.filter(h=>habitDone(h,h.type==='time'?logicalHabitDate(new Date(),h.dayBoundary):today)).length;",
    )

    start = data.index(b"  function renderHabits(){")
    end = data.index(b"\r\n  function fitnessStats()", start)
    if start < 0 or end < 0:
        raise ValueError("Could not locate renderHabits")
    new_render = """  function renderHabits(){
    const today=isoDate(),done=state.habits.filter(h=>habitDone(h,h.type==='time'?logicalHabitDate():today)).length,streaks=state.habits.map(h=>({habit:h,value:habitBestStreak(h)})).sort((a,b)=>b.value-a.value),bestStreak=streaks[0];
    const dates=Array.from({length:30},(_,i)=>shiftDate(i-29));let activeCells=0,totalCells=state.habits.length*dates.length;
    state.habits.forEach(h=>dates.forEach(date=>{if(Number(h.entries?.[date]||0)>0)activeCells++;}));
    document.getElementById('habitsDone').textContent=`${done} / ${state.habits.length}`;document.getElementById('habitsStreak').textContent=`${bestStreak?.value||0} ${bestStreak?habitStreakUnit(bestStreak.habit):'天'}`;document.getElementById('habitRate').textContent=totalCells?`${Math.round(activeCells/totalCells*100)}%`:'0%';
    const groups=[['day','每日目标'],['week','每周目标'],['month','每月目标']];
    const habitList=document.getElementById('dailyHabitList');habitList.className='habit-period-groups';habitList.innerHTML=groups.map(([period,title])=>{
      const habits=state.habits.filter(h=>(h.period||'day')===period);if(!habits.length)return'';
      return`<section class="habit-period-group"><h3 class="habit-period-title">${title}</h3><div class="daily-habits">${habits.map(h=>{
        const entryDate=h.type==='time'?logicalHabitDate(new Date(),h.dayBoundary):today,value=Number(h.entries?.[entryDate]||0),progress=habitProgress(h,entryDate),isDone=progress.done,pulse=!isDone&&new Date().getHours()>=20,unit=habitUnitHtml(h);
        let control='';if(h.type==='counter')control=`<div class="counter-control"><button data-action="habit-minus" data-id="${h.id}">${icon('i-minus')}</button><strong>${value}</strong><button data-action="habit-plus" data-id="${h.id}">${icon('i-plus')}</button></div>`;
        else if(h.type==='number')control=`<div class="sleep-control"><input data-action="habit-number" data-id="${h.id}" type="number" min="0" max="9999" step="0.1" value="${value||''}" placeholder="0"><span>${unit}</span></div>`;
        else if(h.type==='time')control=`<div class="sleep-control"><input data-action="habit-time" data-id="${h.id}" type="time" value="${value?habitMinutesToTime(value):habitMinutesToTime(timeToHabitMinutes(`${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`,h.dayBoundary))}"></div>`;
        else control=`<button class="habit-check ${value>0?'checked':''}" data-action="habit-toggle" data-id="${h.id}">${value>0?icon('i-check'):''}</button>`;
        const percent=h.type==='time'?(isDone?100:0):clamp(progress.value/progress.target*100,0,100),progressText=h.type==='time'?(value?habitMinutesToTime(value):'未记录'):`${progress.value} / ${progress.target} ${h.type==='check'?'次':h.unit}`;
        return`<div class="daily-habit ${isDone?'done':''} ${pulse?'pulse':''}"><button class="habit-card-delete" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('归档习惯')}">${icon('i-trash')}</button><div><h3>${habitNameHtml(h)}</h3><p>${escapeHtml(habitGoalText(h))} · 连续 ${habitStreak(h,entryDate)} ${habitStreakUnit(h)}</p><div class="habit-progress"><div class="habit-progress-track"><span style="width:${percent}%"></span></div><div class="habit-progress-label"><span>${escapeHtml(progressText)}</span><span>${isDone?'已达标':'进行中'}</span></div></div></div><div class="habit-action"><span class="habit-state">${t(isDone?'已完成':'待完成')}</span>${control}</div></div>`;
      }).join('')}</div></section>`;
    }).join('');
    const header=`<div class="heatmap-header"><span></span>${dates.map((d,i)=>`<span>${i%5===0?new Date(`${d}T00:00:00`).getDate():''}</span>`).join('')}</div>`;
    document.getElementById('habitHeatmap').innerHTML=header+state.habits.map(h=>`<div class="heatmap-row"><span class="heatmap-name">${habitNameHtml(h)}<i class="streak-badge">${habitStreak(h,h.type==='time'?logicalHabitDate(new Date(),h.dayBoundary):today)} ${habitStreakUnit(h)}</i></span>${dates.map(date=>{const value=Number(h.entries?.[date]||0),dayDone=(h.period||'day')==='day'&&habitDone(h,date);return`<span class="heat-cell ${dayDone||((h.period||'day')!=='day'&&value>0)?'done':value?'partial':''}" title="${date}${LANG==='en'?': ':'：'}${h.type==='time'&&value?habitMinutesToTime(value):value||t('未完成')}"></span>`;}).join('')}</div>`).join('');
  }""".replace("\n", "\r\n").encode("utf-8")
    data = data[:start] + new_render + data[end:]

    old_manage = """  function renderActiveHabitManageList(){const list=document.getElementById('habitManageList');list.innerHTML=state.habits.length?state.habits.map(h=>{const isBuiltIn=HABIT_DEFS.some(def=>def.key===h.key)||h.sample,hdef=HABIT_DEFS.find(d=>d.key===h.key),unit=h.type==='check'?localizedHtml('次'):hdef?escapeHtml(resolveHabitUnit(hdef)):isBuiltIn?localizedHtml(h.unit):userHtml(h.unit);return`<div class="custom-manage-row"><span><strong>${habitNameHtml(h)}</strong><small>${t(h.type==='check'?'完成 / 未完成':h.type==='counter'?'计数累加':'填写数值')} · ${LANG==='en'?'Target':'目标'} ${h.target} ${unit}</small></span><button type="button" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('归档习惯')}">${icon('i-trash')}</button></div>`;}).join(''):empty('还没有习惯');}"""
    new_manage = """  function renderActiveHabitManageList(){const list=document.getElementById('habitManageList');list.innerHTML=state.habits.length?state.habits.map(h=>`<div class="custom-manage-row"><span><strong>${habitNameHtml(h)}</strong><small>${escapeHtml(habitGoalText(h))} · ${t(h.type==='check'?'完成一次':h.type==='counter'?'计数累加':h.type==='time'?'指定时间前':'填写数值')}</small></span><button type="button" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('归档习惯')}">${icon('i-trash')}</button></div>`).join(''):empty('还没有习惯');}"""
    replace(old_manage, new_manage)

    old_form_binding = """    document.getElementById('habitTypeSelect').addEventListener('change',e=>{const form=document.getElementById('habitSettingsForm'),isCheck=e.target.value==='check';form.elements.target.value=isCheck?'1':form.elements.target.value;form.elements.unit.value=isCheck?'次':form.elements.unit.value;document.getElementById('habitTargetFields').classList.toggle('is-check',isCheck);});
    document.getElementById('habitSettingsForm').addEventListener('submit',e=>{e.preventDefault();const data=Object.fromEntries(new FormData(e.currentTarget)),isCheck=data.type==='check';state.habits.push({id:uid(),key:`custom-${uid()}`,name:data.name.trim(),type:data.type,target:isCheck?1:Math.max(.1,Number(data.target||1)),unit:isCheck?'次':data.unit.trim()||'次',tone:data.tone,entries:{},sample:false});const saved=saveState();renderAll();renderHabitManageList();if(saved){e.currentTarget.reset();document.getElementById('habitTypeSelect').dispatchEvent(new Event('change'));toast('新习惯已加入');}});"""
    new_form_binding = """    function refreshHabitGoalFields(){const form=document.getElementById('habitSettingsForm'),type=form.elements.type.value,period=form.elements.period.value,isTime=type==='time',fixedDaily=type==='check'&&period==='day';if(isTime){form.elements.period.value='day';form.elements.period.disabled=true;}else form.elements.period.disabled=false;document.getElementById('habitTargetFields').hidden=isTime;document.getElementById('habitTimeFields').hidden=!isTime;form.elements.target.required=!isTime;form.elements.target.disabled=isTime;form.elements.unit.disabled=isTime;form.elements.target.readOnly=fixedDaily;if(fixedDaily)form.elements.target.value='1';if(type==='check')form.elements.unit.value='次';document.getElementById('habitTargetLabel').textContent=form.elements.period.value==='week'?'每周目标':form.elements.period.value==='month'?'每月目标':'每天目标';}
    document.getElementById('habitTypeSelect').addEventListener('change',refreshHabitGoalFields);
    document.getElementById('habitPeriodSelect').addEventListener('change',refreshHabitGoalFields);
    document.getElementById('habitSettingsForm').addEventListener('submit',e=>{e.preventDefault();const form=e.currentTarget;if(form.elements.period.disabled)form.elements.period.disabled=false;const data=Object.fromEntries(new FormData(form)),isTime=data.type==='time',period=isTime?'day':data.period,target=isTime?1:Math.max(.1,Number(data.target||1));state.habits.push({id:uid(),key:`custom-${uid()}`,name:data.name.trim(),type:data.type,period,rule:isTime?'beforeTime':'atLeast',target,targetTime:isTime?data.targetTime:'',dayBoundary:HABIT_DAY_BOUNDARY,unit:isTime?'时间':data.type==='check'?'次':data.unit.trim()||'次',tone:data.tone,entries:{},sample:false});const saved=saveState();renderAll();renderHabitManageList();if(saved){form.reset();refreshHabitGoalFields();toast('新习惯已加入');}});"""
    replace(old_form_binding, new_form_binding)

    old_update = """  function updateHabit(id,operation,value){const h=state.habits.find(x=>x.id===id);if(!h)return;const today=isoDate(),current=Number(h.entries[today]||0);if(operation==='plus')h.entries[today]=current+1;if(operation==='minus')h.entries[today]=Math.max(0,current-1);if(operation==='toggle')h.entries[today]=habitDone(h)?0:1;if(operation==='quick')h.entries[today]=habitDone(h)?0:Number(h.target||1);if(operation==='number')h.entries[today]=clamp(Number(value||0),0,9999);pushHabit(h,today);const justDone=habitDone(h),saved=saveState();renderAll();if(saved&&justDone){celebrate();const name=HABIT_DEFS.some(def=>def.key===h.key)||h.sample?translateText(h.name):h.name;toast(LANG==='en'?`${name} completed — nicely done`:`${h.name}，完成得漂亮`);}}"""
    new_update = """  function updateHabit(id,operation,value){const h=state.habits.find(x=>x.id===id);if(!h)return;const date=h.type==='time'?logicalHabitDate(new Date(),h.dayBoundary):isoDate(),current=Number(h.entries[date]||0),wasDone=habitDone(h,date);if(operation==='plus')h.entries[date]=current+1;if(operation==='minus')h.entries[date]=Math.max(0,current-1);if(operation==='toggle'||operation==='quick')h.entries[date]=current>0?0:1;if(operation==='number')h.entries[date]=clamp(Number(value||0),0,9999);if(operation==='time')h.entries[date]=timeToHabitMinutes(value,h.dayBoundary);pushHabit(h,date);const justDone=!wasDone&&habitDone(h,date),saved=saveState();renderAll();if(saved&&justDone){celebrate();const name=HABIT_DEFS.some(def=>def.key===h.key)||h.sample?translateText(h.name):h.name;toast(LANG==='en'?`${name} completed — nicely done`:`${h.name}，完成得漂亮`);}}"""
    replace(old_update, new_update)
    replace(
        "if(event.target.dataset.action==='habit-number')updateHabit(event.target.dataset.id,'number',event.target.value);",
        "if(event.target.dataset.action==='habit-number')updateHabit(event.target.dataset.id,'number',event.target.value);if(event.target.dataset.action==='habit-time')updateHabit(event.target.dataset.id,'time',event.target.value);",
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
        "version": 29,
        "change": "Add daily, weekly, monthly, and before-time habit goals",
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

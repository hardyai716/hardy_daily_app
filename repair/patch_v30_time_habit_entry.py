#!/usr/bin/env python3
"""Make before-time habits explicit to record, evaluate, update, and clear."""
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
        ".habit-period-title{margin:2px 0 0;color:#766d63;font-size:11px;font-weight:750}",
        ".habit-period-title{margin:2px 0 0;color:#766d63;font-size:11px;font-weight:750}"
        ".daily-habit.time-habit{min-height:190px}"
        ".habit-time-action{align-items:stretch;flex-direction:column;gap:7px}"
        ".habit-time-entry{width:100%;display:grid;grid-template-columns:minmax(74px,1fr) 42px 36px;align-items:end;gap:4px}"
        ".habit-time-field{min-width:0;display:flex;flex-direction:column;gap:4px}"
        ".habit-time-field>span{color:var(--muted);font-size:9px;font-weight:700}"
        ".habit-time-entry .dt-display{height:38px;padding:0 9px;font-size:12px}"
        ".habit-time-entry .dt-display svg{width:15px;height:15px}"
        ".habit-time-save{width:42px;height:38px;padding:0;border:0;border-radius:10px;background:var(--plum);color:white;font-size:11px;font-weight:700;white-space:nowrap}"
        ".habit-time-save:disabled{cursor:not-allowed;opacity:.42}"
        ".habit-time-clear{width:36px;height:38px;padding:0;display:grid;place-items:center;border:1px solid var(--line);border-radius:10px;background:white;color:#958a7e}"
        ".habit-time-clear:hover{background:#f3e3dc;color:var(--terra)}"
        ".habit-time-clear svg{width:15px;height:15px}",
    )
    replace(
        "<span>每天最晚完成时间</span><input name=\"targetTime\" type=\"time\" value=\"01:00\"></label><p class=\"mini-note\">凌晨 04:00 前的记录归入前一天，例如 00:30 计作前一晚。</p>",
        "<span>目标：最晚完成时间</span><input name=\"targetTime\" type=\"time\" value=\"01:00\"></label><p class=\"mini-note\">创建后，每天记录实际完成时间，系统自动判断是否达标。凌晨 04:00 前计作前一天。</p>",
    )
    replace("      appVersion:29,", "      appVersion:30,")

    old_time_control = """        else if(h.type==='time')control=`<div class="sleep-control"><input data-action="habit-time" data-id="${h.id}" type="time" value="${value?habitMinutesToTime(value):habitMinutesToTime(timeToHabitMinutes(`${String(new Date().getHours()).padStart(2,'0')}:${String(new Date().getMinutes()).padStart(2,'0')}`,h.dayBoundary))}"></div>`;
        else control=`<button class="habit-check ${value>0?'checked':''}" data-action="habit-toggle" data-id="${h.id}">${value>0?icon('i-check'):''}</button>`;
        const percent=h.type==='time'?(isDone?100:0):clamp(progress.value/progress.target*100,0,100),progressText=h.type==='time'?(value?habitMinutesToTime(value):'未记录'):`${progress.value} / ${progress.target} ${h.type==='check'?'次':h.unit}`;
        return`<div class="daily-habit ${isDone?'done':''} ${pulse?'pulse':''}"><button class="habit-card-delete" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('归档习惯')}">${icon('i-trash')}</button><div><h3>${habitNameHtml(h)}</h3><p>${escapeHtml(habitGoalText(h))} · 连续 ${habitStreak(h,entryDate)} ${habitStreakUnit(h)}</p><div class="habit-progress"><div class="habit-progress-track"><span style="width:${percent}%"></span></div><div class="habit-progress-label"><span>${escapeHtml(progressText)}</span><span>${isDone?'已达标':'进行中'}</span></div></div></div><div class="habit-action"><span class="habit-state">${t(isDone?'已完成':'待完成')}</span>${control}</div></div>`;"""
    new_time_control = """        else if(h.type==='time')control=`<div class="habit-time-entry"><label class="habit-time-field"><span>${LANG==='en'?'Actual time':'实际时间'}</span><input data-action="habit-time-input" data-id="${h.id}" type="time" value="${value?habitMinutesToTime(value):''}"></label><button type="button" class="habit-time-save" data-action="habit-time-save" data-id="${h.id}" ${value?'':'disabled'}>${value?(LANG==='en'?'Update':'更新'):(LANG==='en'?'Log':'记录')}</button>${value?`<button type="button" class="habit-time-clear" data-action="habit-time-clear" data-id="${h.id}" aria-label="${LANG==='en'?'Clear today’s entry':'撤销今天的记录'}" title="${LANG==='en'?'Clear today’s entry':'撤销今天的记录'}">${icon('i-trash')}</button>`:''}</div>`;
        else control=`<button class="habit-check ${value>0?'checked':''}" data-action="habit-toggle" data-id="${h.id}">${value>0?icon('i-check'):''}</button>`;
        const percent=h.type==='time'?(isDone?100:0):clamp(progress.value/progress.target*100,0,100),progressText=h.type==='time'?(value?habitMinutesToTime(value):(LANG==='en'?'Not logged':'未记录')):`${progress.value} / ${progress.target} ${h.type==='check'?'次':h.unit}`,progressState=h.type==='time'?(value?(isDone?(LANG==='en'?'Met':'达标'):(LANG==='en'?'Not met':'未达标')):(LANG==='en'?'Awaiting entry':'等待记录')):(isDone?'已达标':'进行中'),habitState=h.type==='time'?(value?(isDone?(LANG==='en'?'Logged · met':'已记录 · 达标'):(LANG==='en'?'Logged · not met':'已记录 · 未达标')):(LANG==='en'?'Not logged':'未记录')):t(isDone?'已完成':'待完成');
        return`<div class="daily-habit ${h.type==='time'?'time-habit':''} ${isDone?'done':''} ${pulse?'pulse':''}"><button class="habit-card-delete" data-action="delete-habit-custom" data-id="${h.id}" aria-label="${t('归档习惯')}">${icon('i-trash')}</button><div><h3>${habitNameHtml(h)}</h3><p>${escapeHtml(habitGoalText(h))} · 连续 ${habitStreak(h,entryDate)} ${habitStreakUnit(h)}</p><div class="habit-progress"><div class="habit-progress-track"><span style="width:${percent}%"></span></div><div class="habit-progress-label"><span>${escapeHtml(progressText)}</span><span>${progressState}</span></div></div></div><div class="habit-action ${h.type==='time'?'habit-time-action':''}"><span class="habit-state">${habitState}</span>${control}</div></div>`;"""
    replace(old_time_control, new_time_control)

    old_update = """  function updateHabit(id,operation,value){const h=state.habits.find(x=>x.id===id);if(!h)return;const date=h.type==='time'?logicalHabitDate(new Date(),h.dayBoundary):isoDate(),current=Number(h.entries[date]||0),wasDone=habitDone(h,date);if(operation==='plus')h.entries[date]=current+1;if(operation==='minus')h.entries[date]=Math.max(0,current-1);if(operation==='toggle'||operation==='quick')h.entries[date]=current>0?0:1;if(operation==='number')h.entries[date]=clamp(Number(value||0),0,9999);if(operation==='time')h.entries[date]=timeToHabitMinutes(value,h.dayBoundary);pushHabit(h,date);const justDone=!wasDone&&habitDone(h,date),saved=saveState();renderAll();if(saved&&justDone){celebrate();const name=HABIT_DEFS.some(def=>def.key===h.key)||h.sample?translateText(h.name):h.name;toast(LANG==='en'?`${name} completed — nicely done`:`${h.name}，完成得漂亮`);}}"""
    new_update = """  function updateHabit(id,operation,value){const h=state.habits.find(x=>x.id===id);if(!h)return;const date=h.type==='time'?logicalHabitDate(new Date(),h.dayBoundary):isoDate(),current=Number(h.entries[date]||0),wasDone=habitDone(h,date);if(operation==='plus')h.entries[date]=current+1;if(operation==='minus')h.entries[date]=Math.max(0,current-1);if(operation==='toggle'||operation==='quick')h.entries[date]=current>0?0:1;if(operation==='number')h.entries[date]=clamp(Number(value||0),0,9999);if(operation==='time'){if(!/^([01]\\d|2[0-3]):[0-5]\\d$/.test(String(value||'')))return;h.entries[date]=timeToHabitMinutes(value,h.dayBoundary);}if(operation==='clear-time'){if(!current)return;delete h.entries[date];}if(operation!=='clear-time')pushHabit(h,date);const justDone=!wasDone&&habitDone(h,date),saved=saveState();renderAll();if(saved&&operation==='clear-time')toast(LANG==='en'?'Today’s time entry cleared':'已撤销今天的时间记录');if(saved&&justDone){celebrate();const name=HABIT_DEFS.some(def=>def.key===h.key)||h.sample?translateText(h.name):h.name;toast(LANG==='en'?`${name} completed — nicely done`:`${h.name}，完成得漂亮`);}}"""
    replace(old_update, new_update)

    replace(
        "if(type==='habit-plus')updateHabit(id,'plus');if(type==='habit-minus')updateHabit(id,'minus');if(type==='habit-toggle')updateHabit(id,'toggle');if(type==='habit-quick')updateHabit(id,'quick');",
        "if(type==='habit-plus')updateHabit(id,'plus');if(type==='habit-minus')updateHabit(id,'minus');if(type==='habit-toggle')updateHabit(id,'toggle');if(type==='habit-quick')updateHabit(id,'quick');if(type==='habit-time-save'){const input=action.closest('.habit-time-entry')?.querySelector('[data-action=\"habit-time-input\"]');if(input?.value)updateHabit(id,'time',input.value);}if(type==='habit-time-clear')updateHabit(id,'clear-time');",
    )
    replace(
        "    document.addEventListener('change',event=>{if(event.target.dataset.action==='habit-number')updateHabit(event.target.dataset.id,'number',event.target.value);if(event.target.dataset.action==='habit-time')updateHabit(event.target.dataset.id,'time',event.target.value);});",
        "    document.addEventListener('change',event=>{if(event.target.dataset.action==='habit-number')updateHabit(event.target.dataset.id,'number',event.target.value);});\r\n"
        "    document.addEventListener('input',event=>{if(event.target.dataset.action!=='habit-time-input')return;const save=event.target.closest('.habit-time-entry')?.querySelector('[data-action=\"habit-time-save\"]');if(save)save.disabled=!event.target.value;});",
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
        "version": 30,
        "change": "Make before-time habits explicit to record, evaluate, update, and clear",
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

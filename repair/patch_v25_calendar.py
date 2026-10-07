#!/usr/bin/env python3
"""Add cross-day refresh and ISO-week-scoped plan completion."""
import argparse
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def patch(source: bytes) -> bytes:
    data = source

    def replace(old: str, new: str, count: int = 1) -> None:
        nonlocal data
        old_bytes = old.encode("utf-8")
        new_bytes = new.encode("utf-8")
        actual = data.count(old_bytes)
        if actual != count:
            raise ValueError(
                f"Baseline changed: expected {count} occurrences of {old!r}, got {actual}"
            )
        data = data.replace(old_bytes, new_bytes)

    replace(
        "weeklyPlan:Array.isArray(candidate.settings?.weeklyPlan)?candidate.settings.weeklyPlan:DEFAULT_PLAN.map(x=>({...x}))",
        "weeklyPlan:normalizeWeeklyPlan(Array.isArray(candidate.settings?.weeklyPlan)?candidate.settings.weeklyPlan:DEFAULT_PLAN.map(x=>({...x})))",
    )
    replace(
        "      state.settings[id]=copy(value.value);",
        "      state.settings[id]=id==='weeklyPlan'?normalizeWeeklyPlan(value.value):copy(value.value);",
    )
    replace(
        "  async function pullAllRemote(){\r\n    // Collect everything before applying: partial reads must not erase definitions or settings.",
        "  async function pullAllRemote(){\r\n"
        "    weeklyPlanNeedsCloudMigration=false;\r\n"
        "    // Collect everything before applying: partial reads must not erase definitions or settings.",
    )
    replace(
        "    var s=syncState(),current=collectEntities();\r\n"
        "    // New defaults/custom definitions and local-only records are seeded only after a full read.",
        "    var s=syncState(),current=collectEntities();\r\n"
        "    if(weeklyPlanNeedsCloudMigration){\r\n"
        "      var weeklyKey=syncKey('settings','weeklyPlan'),weeklyEntity=current[weeklyKey];\r\n"
        "      if(weeklyEntity&&!s.queue[weeklyKey])s.queue[weeklyKey]=newTask(weeklyEntity,weeklyEntity.value,s.base[weeklyKey]||null);\r\n"
        "      weeklyPlanNeedsCloudMigration=false;\r\n"
        "    }\r\n"
        "    // New defaults/custom definitions and local-only records are seeded only after a full read.",
    )
    replace(
        "    }else if(kind==='settings'&&value){\r\n"
        "      if(!['budget','brand','fitnessProfile','weeklyPlan'].includes(id))throw syncError('未知的个人设置项');\r\n"
        "      state.settings[id]=id==='weeklyPlan'?normalizeWeeklyPlan(value.value):copy(value.value);\r\n"
        "    }",
        "    }else if(kind==='settings'&&value){\r\n"
        "      if(!['budget','brand','fitnessProfile','weeklyPlan'].includes(id))throw syncError('未知的个人设置项');\r\n"
        "      if(id==='weeklyPlan'&&weeklyPlanHasLegacy(value.value))weeklyPlanNeedsCloudMigration=true;\r\n"
        "      state.settings[id]=id==='weeklyPlan'?normalizeWeeklyPlan(value.value):copy(value.value);\r\n"
        "    }",
    )

    replace(
        "state.settings.weeklyPlan.filter(x=>!x.done).length",
        "state.settings.weeklyPlan.filter(x=>!planIsDone(x)).length",
    )
    replace(
        "state.settings.weeklyPlan.filter(x=>x.done).length",
        "state.settings.weeklyPlan.filter(x=>planIsDone(x)).length",
    )
    replace("item.done?'done':''", "planIsDone(item)?'done':''")
    replace("item.done?'checked':''", "planIsDone(item)?'checked':''")
    replace("item.done?icon('i-check'):''", "planIsDone(item)?icon('i-check'):''")
    replace(
        "if(type==='toggle-plan'){const item=state.settings.weeklyPlan.find(x=>x.id===id);if(item){item.done=!item.done;const saved=saveState();renderFitness();if(saved&&item.done)celebrate();}}",
        "if(type==='toggle-plan'){const item=state.settings.weeklyPlan.find(x=>x.id===id);if(item){const done=!planIsDone(item);setPlanDone(item,done);const saved=saveState();renderFitness();if(saved&&done)celebrate();}}",
    )
    replace(
        "state.settings.weeklyPlan.push({id:uid(),group:data.group,title:data.title.trim(),note:data.note.trim()||'按自己的节奏完成',done:false});",
        "state.settings.weeklyPlan.push({id:uid(),group:data.group,title:data.title.trim(),note:data.note.trim()||'按自己的节奏完成',doneByWeek:{}});",
    )
    replace(
        "state.settings.weeklyPlan=DEFAULT_PLAN.map(x=>({...x}));",
        "state.settings.weeklyPlan=normalizeWeeklyPlan(DEFAULT_PLAN.map(x=>({...x})));",
    )

    module = (ROOT / "v25-calendar.js").read_text()
    marker = "  function bindForms(){"
    replace(marker, module.replace("\n", "\r\n") + "\r\n" + marker)
    old_init = (
        "  function init(){const now=new Date(),weekdays=['星期日','星期一','星期二','星期三','星期四','星期五','星期六'];"
        "document.getElementById('todayLabel').textContent=LANG==='en'?new Intl.DateTimeFormat('en-US',{month:'long',day:'numeric',weekday:'long'}).format(now)"
        ":`${now.getMonth()+1} 月 ${now.getDate()} 日 · ${weekdays[now.getDay()]}`;setDateDefaults();"
    )
    replace(old_init, "  function init(){setupCalendarRollover();setDateDefaults();")
    replace(
        "document.addEventListener('visibilitychange',()=>{if(!document.hidden)scheduleSync(0);});",
        "document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshCurrentDay();scheduleSync(0);}});",
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
        "version": 25,
        "change": "Refresh across local-day rollover and scope weekly-plan completion by ISO week",
        "baseline_sha256": hashlib.sha256(source).hexdigest(),
        "candidate_sha256": hashlib.sha256(result).hexdigest(),
        "bytes": len(result),
        "two_paths_identical": True,
        "public_publish_allowed": False,
    }
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()

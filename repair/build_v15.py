#!/usr/bin/env python3
"""Apply the v15 repair to a byte-preserved WorkBuddy transaction baseline.

Local preview: python3 repair/build_v15.py --baseline backup/日常集_v14_2026-10-07.html
Cloud candidate: supply a freshly downloaded baseline and successful create responses.
Never uploads, commits or publishes.
"""
import argparse
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent


def apply(source: bytes, definitions_id="", settings_id="") -> bytes:
    data = source

    def replace(old, new, count=1):
        nonlocal data
        old = old.encode() if isinstance(old, str) else old
        new = new.encode() if isinstance(new, str) else new
        actual = data.count(old)
        if actual != count:
            raise ValueError(f"Baseline changed: expected {count} occurrences of {old[:100]!r}, got {actual}. Rebase manually.")
        data = data.replace(old, new)

    def block(start, end, text):
        nonlocal data
        a, b = data.index(start.encode()), data.index(end.encode())
        data = data[:a] + text.encode().replace(b"\n", b"\r\n") + data[b:]

    module = (ROOT / "v15-sync.js").read_text()
    for name, value in [("DB_HABIT_DEFS", definitions_id), ("DB_SETTINGS", settings_id)]:
        if value:
            if not re.fullmatch(r"[A-Za-z0-9_-]+", value):
                raise ValueError("Database ID must come from a successful WorkBuddy create response.")
            module = module.replace(f"var {name} = '';", f"var {name} = '{value}';")
    block("  function saveState(showSaved=false){", "  function pulseSaved()", "")
    block("  var ONLINE = false, LOCAL_ONLY = false;", "  const LANG_PARAM", module + "\n")

    # Migrations preserve metadata, exact IDs, unknown dates, and the durable outbox.
    replace("|| HABIT_DEFS[index] ||", "||")
    replace("return {...def,...habit,id:habit.id||`habit-${def.key}`,entries};",
            "const {pendingAdd,...clean}=habit;return {...def,...clean,id:String(habit.id||`habit-${def.key}`),entries};")
    replace(r"/^\d{4}-\d{2}-\d{2}$/.test(record.date)", r"(record.date===''||/^\d{4}-\d{2}-\d{2}$/.test(record.date))")
    replace("const hiddenHabitKeys=new Set(Array.isArray(candidate.settings?.hiddenHabitKeys)?candidate.settings.hiddenHabitKeys:[]);",
            "const archivedHabits=(candidate.archivedHabits||[]).map(normalizeHabit);const hiddenHabitKeys=new Set([...(candidate.settings?.hiddenHabitKeys||[]),...archivedHabits.map(h=>h.key)]);")
    replace("existing.find(h=>h.key===def.key || h.name===def.name || (def.key==='reading'&&h.name?.includes('阅读')) || (def.key==='water'&&h.name?.includes('水')))",
            "existing.find(h=>h.key===def.key || h.id===`habit-${def.key}`)")
    replace("return {...record,id:record.id||uid(),data};", "return {...record,id:String(record.id||uid()),data};")
    replace("data.category=map[data.category]||data.category||'其他';", "data.category=data.category||'';")
    replace("data.category=data.category||data.location||'其他'; data.price=Number(data.price||0);", "data.category=data.category||data.location||''; data.price=data.price==null?null:Number(data.price);")
    replace("data.list=data.list||'生活';data.note=data.note||'';data.remind=Boolean(data.remind);", "data.list=data.list||'';data.note=data.note||'';data.remind=data.remind==null?null:Boolean(data.remind);")
    replace(".map(item=>({id:item.id||uid(),name:String(item.name)", ".map(item=>({...item,id:String(item.id||uid()),name:String(item.name)")
    replace(r"date:/^\d{4}-\d{2}-\d{2}$/.test(item.date||'')?item.date:isoDate()", r"date:/^\d{4}-\d{2}-\d{2}$/.test(item.date||'')?item.date:''")
    replace("version:2,records,habits,mediaItems,", "version:3,records,habits,mediaItems,archivedHabits,sync:candidate.sync||null,")
    replace("if(!raw) return makeInitialState();", "if(!raw) return makeBlankState();")
    replace("catch(error){dataCorrupted=true;return makeInitialState();}", "catch(error){dataCorrupted=true;return makeBlankState();}")
    # Fresh private workbench starts blank; legacy sample data remains locally recognizable.
    insert = """  function makeBlankState(){
    const s=makeInitialState();s.version=3;s.records=[];s.mediaItems=[];
    s.habits.forEach(h=>{h.entries={};h.sample=false;});s.archivedHabits=[];return s;
  }
"""
    replace("  let dataCorrupted=false;", insert.replace("\n", "\r\n") + "  let dataCorrupted=false;")
    replace("calories:Number(data.calories||0),duration:Number(data.duration||0)", "calories:data.calories===''?null:Number(data.calories),duration:data.duration===''?null:Number(data.duration)")

    # Archive keeps history and has a visible restore operation on every device.
    start = data.index(b"  async function removeHabitCustom(id){")
    end = data.index(b"  async function removePlanItem(id){")
    archive = """  async function removeHabitCustom(id){
    const habit=state.habits.find(h=>h.id===id);if(!habit)return;
    if(!await askConfirm(`归档习惯“${habit.name}”？历史打卡会保留，可在此处恢复。`,'归档'))return;
    state.habits=state.habits.filter(h=>h.id!==id);
    habit.archived=true;(state.archivedHabits||=[]).push(habit);
    const saved=saveState();renderAll();renderHabitManageList();if(saved)toast('习惯已归档，历史已保留');
  }
  function restoreHabit(id){
    const h=(state.archivedHabits||[]).find(h=>h.id===id);if(!h)return;
    state.archivedHabits=state.archivedHabits.filter(h=>h.id!==id);h.archived=false;state.habits.push(h);
    if(saveState()){renderAll();renderHabitManageList();}
  }
"""
    data = data[:start] + archive.encode().replace(b"\n", b"\r\n") + data[end:]
    replace("删除后历史打卡也会一起移除", "归档后历史打卡保留，可随时恢复", count=2)
    replace("${t('删除习惯')}", "${t('归档习惯')}", count=2)
    replace("function renderHabitManageList(){", "function renderActiveHabitManageList(){")
    manager = """  function renderHabitManageList(){
    renderActiveHabitManageList();
    const list=document.getElementById('habitManageList');
    (state.archivedHabits||[]).forEach(h=>{
      const row=document.createElement('div');row.className='custom-manage-row';
      const label=document.createElement('span');label.textContent=h.name+' · 已归档';
      const button=document.createElement('button');button.type='button';button.textContent='恢复';button.onclick=()=>restoreHabit(h.id);
      row.append(label,button);list.appendChild(row);
    });
  }
"""
    replace("  function openHabitSettings()", manager.replace("\n", "\r\n")+"  function openHabitSettings()")

    # One date display sync path for reset, draft restore, and already enhanced inputs.
    replace("if(inp.getAttribute('data-dtui')) return;", "if(inp.getAttribute('data-dtui')){dtSync(inp);return;}")
    replace("function clearDraft(form){delete state.drafts[form.dataset.draft];form.reset();setDateDefaults();updateMoneyCategories();saveState();}",
            "function clearDraft(form){delete state.drafts[form.dataset.draft];dtClose();form.reset();setDateDefaults();updateMoneyCategories();enhanceDateTime();saveState();}")
    replace("function formatDateHeading(value){", "function formatDateHeading(value){if(!value)return t('日期未填写');")
    replace("${d.duration||0} ${LANG==='en'?'min exercise':'分钟运动'}", "${d.duration==null?'未填写':d.duration} ${LANG==='en'?'min exercise':'分钟运动'}")
    replace("r.date<today&&!r.data.done", "r.date&&r.date<today&&!r.data.done")
    replace("const overdue=!d.done&&record.date<isoDate()", "const overdue=!d.done&&record.date&&record.date<isoDate()")
    # Cover contents come from user's upload; escape attribute syntax before rendering.
    replace('<img src="${item.cover}"', '<img src="${escapeHtml(item.cover)}"')
    # Avoid falsely identifying the reminder flag as delivered notifications.
    replace("到时间提醒我", "记录提醒意愿（暂不推送）", count=2)
    replace("toast('已立即保存');", "toast('已保存到本机，云端状态见页面顶部');")

    # One editable tab per origin: no wholesale storage-event state replacement.
    old = "window.addEventListener('storage',e=>{if(e.key!==STORAGE_KEY||!e.newValue)return;try{state=normalizeState(JSON.parse(e.newValue));renderAll();toast('另一个页面的数据已同步');}catch{}});"
    replace(old, "// The lifetime Web Lock prevents concurrent editors on this origin.")
    replace("loadSchemaTypes();if(!dataCorrupted)saveState();pullAllRemote(function(ok){ if(ok){ saveState(); renderAll(); } });", "startSync();")
    replace("document.addEventListener('DOMContentLoaded',init);", "document.addEventListener('DOMContentLoaded',()=>acquireWorkbenchEditor(init));")
    replace(".top-actions .save-state{display:none}", ".top-actions .save-state{display:none}#clearSamplesBtn[hidden]{display:none}")

    # Compact status panel in the existing warm layout, visible on mobile too.
    panel = """<section aria-label="保存与同步" style="margin:12px 0;padding:12px 16px;border:1px solid var(--line);border-radius:14px;background:var(--paper)">
      <strong id="syncSummary" role="status" style="display:block;font-size:13px;margin-bottom:6px"></strong>
      <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
        <span id="syncDetail" role="status" style="flex:1;min-width:180px;font-size:13px">正在准备本机数据</span>
        <button class="btn ghost" type="button" id="syncRetry">重试同步</button>
        <button class="btn ghost" type="button" id="syncExport">导出完整备份</button>
      </div><div id="syncConflicts"></div>
    </section>"""
    needle = re.search(rb'<section[^>]*id="view-dashboard"', data)
    if not needle:
        raise ValueError("Cannot find dashboard insertion point")
    data = data[:needle.start()] + panel.encode().replace(b"\n", b"\r\n") + b"\r\n" + data[needle.start():]
    return data


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--baseline", type=Path, required=True)
    parser.add_argument("--output", type=Path, default=ROOT.parent / "candidate/v15")
    parser.add_argument("--habit-create-result", type=Path)
    parser.add_argument("--settings-create-result", type=Path)
    args = parser.parse_args()

    def created_id(path):
        if not path:
            return ""
        result = json.loads(path.read_text())
        if result.get("error") or not result.get("database_id"):
            raise ValueError("Expected successful WorkBuddy create_database.py JSON")
        if result.get("space_id") != "pHFugBpWhfhSI7GT5Gssex":
            raise ValueError("New table is not in the workbench's private space")
        return result["database_id"]

    source = args.baseline.read_bytes()
    output = apply(source, created_id(args.habit_create_result), created_id(args.settings_create_result))
    args.output.mkdir(parents=True, exist_ok=True)
    for name in ("index.html", "life-all-in-one.html"):
        (args.output / name).write_bytes(output)
    manifest = {
        "status": "local-candidate-not-deployed",
        "baseline_sha256": hashlib.sha256(source).hexdigest(),
        "candidate_sha256": hashlib.sha256(output).hexdigest(),
        "bytes": len(output),
        "two_paths_identical": True,
        "tables_bound": bool(args.habit_create_result and args.settings_create_result),
        "public_publish_allowed": False,
    }
    (args.output / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2)+"\n")
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()

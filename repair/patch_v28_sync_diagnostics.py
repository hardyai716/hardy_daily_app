#!/usr/bin/env python3
"""Move deletion-marker counts out of the primary sync status into diagnostics."""
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
        if actual != count:
            raise ValueError(
                f"Baseline changed: expected {count} occurrences of {old!r}, got {actual}"
            )
        data = data.replace(old_bytes, new_bytes)

    old_summary = """  function storageSummary(){
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
"""
    new_summary = """  function storageSummary(){
    var bytes=approximateStateBytes(),s=syncState();
    var pending=Object.keys(s.queue||{}).length,conflicts=Object.keys(s.conflicts||{}).length;
    var status=!syncRuntime.saved?editText('本机保存失败','Local save failed')
      :dataCorrupted?editText('本机数据损坏','Local data is damaged')
      :conflicts?(LANG==='en'?`${conflicts} conflicts`:`${conflicts} 项冲突`)
      :syncRuntime.busy?editText('正在同步','Syncing')
      :!ONLINE?editText('未连接云端','Cloud disconnected')
      :pending?(LANG==='en'?`${pending} pending`:`${pending} 项待同步`)
      :editText('同步正常','Synced');
    var warning=bytes>=LOCAL_STATE_WARN_BYTES
      ?editText(' · 接近本机容量上限',' · Near local storage capacity')
      :'';
    return LANG==='en'
      ?`Local cache ${storageSizeText(bytes)} · ${status}${warning}`
      :`本机缓存约 ${storageSizeText(bytes)} · ${status}${warning}`;
  }
  function storageDiagnostics(){
    var s=syncState(),base=Object.values(s.base||{});
    var tombstones=base.filter(item=>item&&item.deleted).length;
    var pending=Object.keys(s.queue||{}).length,conflicts=Object.keys(s.conflicts||{}).length;
    var last=s.lastSync?new Date(s.lastSync).toLocaleString():'-';
    return LANG==='en'
      ?`Sync baseline ${base.length} · Deletion markers ${tombstones} · Pending ${pending} · Conflicts ${conflicts} · Last sync ${last}. Deletion markers prevent stale devices from restoring deleted records; no action is needed.`
      :`同步基线 ${base.length} 项 · 删除标记 ${tombstones} 项 · 待同步 ${pending} 项 · 冲突 ${conflicts} 项 · 最近同步 ${last}。删除标记用于防止旧设备恢复已删除记录，无需处理。`;
  }
  function setupSyncDiagnostics(){
    if(document.getElementById('syncDiagnosticsPanel'))return;
    var host=document.getElementById('syncConflicts');if(!host)return;
    var panel=document.createElement('details');panel.id='syncDiagnosticsPanel';
    panel.style.cssText='margin-top:10px;color:var(--muted);font-size:11px';
    var summary=document.createElement('summary');summary.textContent=editText('诊断详情','Diagnostics');
    summary.style.cssText='cursor:pointer;width:max-content;font-weight:700';
    var text=document.createElement('p');text.id='syncDiagnosticsText';
    text.style.cssText='margin:8px 0 0;line-height:1.7';
    panel.append(summary,text);host.insertAdjacentElement('afterend',panel);
  }
"""
    replace(old_summary.replace("\n", "\r\n"), new_summary.replace("\n", "\r\n"))
    replace(
        "    if(detail)detail.textContent=syncRuntime.error||storageSummary();",
        "    if(detail)detail.textContent=syncRuntime.error||storageSummary();\r\n"
        "    var diagnostics=document.getElementById('syncDiagnosticsText');"
        "if(diagnostics)diagnostics.textContent=storageDiagnostics();",
    )
    replace(
        "  function startSync(){\r\n    prepareSync();",
        "  function startSync(){\r\n    setupSyncDiagnostics();\r\n    prepareSync();",
    )
    replace("      appVersion:27,", "      appVersion:28,")
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
        "version": 28,
        "change": "Simplify the main sync status and move deletion counts into diagnostics",
        "baseline_sha256": hashlib.sha256(source).hexdigest(),
        "candidate_sha256": hashlib.sha256(result).hexdigest(),
        "bytes": len(result),
        "two_paths_identical": True,
        "publish_requires_explicit_instruction": True,
    }
    (args.output / "manifest.json").write_text(
        json.dumps(manifest, ensure_ascii=False, indent=2) + "\n"
    )
    print(json.dumps(manifest, ensure_ascii=False))


if __name__ == "__main__":
    main()

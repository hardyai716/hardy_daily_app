#!/usr/bin/env python3
"""Apply backup restore and null-clearing fixes to a v21 transaction baseline."""
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

    old_export = """  function exportRecovery(){
    var raw=localStorage.getItem(STORAGE_KEY);
    downloadBlob(JSON.stringify({format:'richangji-recovery-v15',exportedAt:new Date().toISOString(),state,corruptedOriginal:dataCorrupted?raw:null},null,2),'application/json','日常集-完整备份-'+isoDate()+'.json');
  }
"""
    module = (ROOT / "v22-recovery.js").read_text()
    replace(old_export.replace("\n", "\r\n"), module.replace("\n", "\r\n"))

    old_put = """    function put(field,value){if(value!==null&&value!==undefined)fields[field]=pv(id,field,value);}"""
    new_put = """    function put(field,value){
      if(value!==null&&value!==undefined){fields[field]=pv(id,field,value);return;}
      // New records may omit optional values. Existing records must explicitly clear stale display columns.
      if(!task.base?.remoteId)return;
      var type=FIELD_TYPES[id]&&FIELD_TYPES[id][field];
      if(type==='number'||type==='currency')fields[field]={[type]:null};
      else if(type==='date')fields[field]={date:''};
      else if(type==='text')fields[field]={text:''};
      else if(type==='checkbox')fields[field]={checkbox:false};
    }"""
    replace(old_put, new_put.replace("\n", "\r\n"))
    replace(
        "    document.getElementById('syncExport')?.addEventListener('click',exportRecovery);",
        "    document.getElementById('syncExport')?.addEventListener('click',()=>exportRecovery());\r\n"
        "    setupRecoveryImport();",
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
        "version": 22,
        "change": "Add validated backup restore and explicit clearing of stale cloud columns",
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

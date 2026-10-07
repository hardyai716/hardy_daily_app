#!/usr/bin/env python3
"""Reduce full-table sync reads and add local-storage safeguards."""
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
        "var syncRuntime = {busy:false, ready:false, error:'', timer:null, saved:true, failures:0};",
        "var syncRuntime = {busy:false, ready:false, error:'', timer:null, fullPullTimer:null, saved:true, failures:0, forcePull:true, lastFullPullAt:0};",
    )
    replace(
        "      if(capture)captureChanges();\r\n      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));",
        "      if(capture)captureChanges();\r\n      compactSyncMetadata();\r\n      localStorage.setItem(STORAGE_KEY,JSON.stringify(state));",
    )
    replace(
        "    if(detail)detail.textContent=syncRuntime.error||'草稿和筛选条件只保存在当前设备。';",
        "    if(detail)detail.textContent=syncRuntime.error||storageSummary();",
    )
    replace(
        "      if(!syncRuntime.continuing)await pullAllRemote();",
        "      if(!syncRuntime.continuing&&(syncRuntime.forcePull||!syncRuntime.lastFullPullAt||Date.now()-syncRuntime.lastFullPullAt>=SYNC_FULL_PULL_MS)){\r\n"
        "        await pullAllRemote();syncRuntime.lastFullPullAt=Date.now();syncRuntime.forcePull=false;\r\n"
        "      }",
    )
    replace(
        "      if(syncRuntime.failures>0&&syncRuntime.failures<=3)scheduleSync(1000*Math.pow(2,syncRuntime.failures));\r\n"
        "      else if(!syncRuntime.error&&pending.length){syncRuntime.continuing=true;syncRuntime.timer=setTimeout(()=>runSync(),30);}",
        "      if(syncRuntime.failures>0&&syncRuntime.failures<=3)scheduleSync(1000*Math.pow(2,syncRuntime.failures));\r\n"
        "      else if(!syncRuntime.error&&pending.length){syncRuntime.continuing=true;syncRuntime.timer=setTimeout(()=>runSync(),30);}\r\n"
        "      else if(!syncRuntime.error)scheduleBackgroundPull();",
    )
    replace(
        "      syncRuntime.ready=false;syncRuntime.failures=0;\r\n"
        "      if(persistSync(true))runSync();",
        "      syncRuntime.ready=false;syncRuntime.failures=0;syncRuntime.forcePull=true;\r\n"
        "      if(persistSync(true))runSync();",
    )
    replace(
        "    window.addEventListener('online',()=>{syncRuntime.failures=0;scheduleSync(0);});",
        "    window.addEventListener('online',()=>{syncRuntime.failures=0;requestFullSync(0);});",
    )
    replace(
        "document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshCurrentDay();scheduleSync(0);}});",
        "document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshCurrentDay();requestFullSync(0);}});",
    )
    replace(
        "function compressCover(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('封面读取失败'));reader.onload=()=>{const image=new Image();image.onerror=()=>reject(new Error('封面格式不支持'));image.onload=()=>{const maxWidth=360,maxHeight=480,ratio=Math.min(maxWidth/image.width,maxHeight/image.height,1),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);resolve(canvas.toDataURL('image/jpeg',.72));};image.src=reader.result;};reader.readAsDataURL(file);});}",
        "function compressCover(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onerror=()=>reject(new Error('封面读取失败'));reader.onload=()=>{const image=new Image();image.onerror=()=>reject(new Error('封面格式不支持'));image.onload=()=>{const maxWidth=360,maxHeight=480,ratio=Math.min(maxWidth/image.width,maxHeight/image.height,1),canvas=document.createElement('canvas');canvas.width=Math.round(image.width*ratio);canvas.height=Math.round(image.height*ratio);canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);var output=canvas.toDataURL('image/jpeg',.72);if(output.length>COVER_MAX_CHARS)output=canvas.toDataURL('image/jpeg',.5);resolve(output);};image.src=reader.result;};reader.readAsDataURL(file);});}",
    )
    replace(
        "try{pendingMediaCover=await compressCover(file);const preview=document.getElementById('mediaCoverPreview');",
        "try{var nextCover=await compressCover(file),coverError=coverStorageError(nextCover);if(coverError)throw new Error(coverError);pendingMediaCover=nextCover;const preview=document.getElementById('mediaCoverPreview');",
    )

    module = (ROOT / "v26-runtime.js").read_text()
    marker = "  function bindForms(){"
    replace(marker, module.replace("\n", "\r\n") + "\r\n" + marker)
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
        "version": 26,
        "change": "Use targeted sync reads between periodic full pulls and enforce cover/storage safeguards",
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

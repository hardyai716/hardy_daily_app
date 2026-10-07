#!/usr/bin/env python3
"""Create a v20 candidate whose downloads work from WorkBuddy's sandbox iframe."""
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

    old = """  function downloadBlob(content,type,name){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}"""
    new = """  function downloadBlob(content,type,name){
    const blob=new Blob([content],{type}),url=URL.createObjectURL(blob);
    var popup=null;
    try{popup=window.open('about:blank','_blank');}catch(error){}
    if(!popup){
      URL.revokeObjectURL(url);
      toast('浏览器阻止了下载窗口，请允许弹出窗口后重试');
      return false;
    }
    try{
      popup.document.title='正在下载';
      var message=popup.document.createElement('p');
      message.textContent='正在准备下载 '+name;
      message.style.cssText='font:16px -apple-system,sans-serif;padding:24px;color:#333';
      popup.document.body.appendChild(message);
      var link=popup.document.createElement('a');
      link.href=url;link.download=name;link.rel='noopener';
      popup.document.body.appendChild(link);
      setTimeout(function(){
        link.click();
        setTimeout(function(){
          URL.revokeObjectURL(url);
          try{popup.close();}catch(error){}
        },1500);
      },0);
      return true;
    }catch(error){
      URL.revokeObjectURL(url);
      try{popup.close();}catch(closeError){}
      toast('下载启动失败，请重试');
      return false;
    }
  }"""
    replace(old, new)
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
        "version": 20,
        "change": "Start downloads in an unsandboxed popup allowed by the WorkBuddy iframe",
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

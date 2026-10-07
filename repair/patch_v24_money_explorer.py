#!/usr/bin/env python3
"""Add searchable, date-filtered, incrementally rendered money history."""
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
        '    <symbol id="i-edit" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></symbol>',
        '    <symbol id="i-edit" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></symbol>\r\n'
        '    <symbol id="i-search" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></symbol>\r\n'
        '    <symbol id="i-x" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>',
    )

    styles = """  <style>
    .money-explorer{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:10px;margin:-2px 0 14px}
    .money-search{height:42px;padding:0 11px;display:flex;align-items:center;gap:8px;border:1px solid var(--line);border-radius:11px;background:#fbf8f3}
    .money-search:focus-within{border-color:#92748a;box-shadow:0 0 0 3px rgba(77,48,69,.07);background:white}
    .money-search svg{flex:0 0 auto;width:17px;height:17px;color:var(--muted)}
    .money-search input{min-width:0;width:100%;border:0;outline:0;background:transparent}
    .money-dates{display:grid;grid-template-columns:repeat(2,minmax(124px,1fr));gap:8px}
    .money-dates>label{height:42px;display:flex;align-items:center;gap:6px;color:var(--muted);font-size:10px}
    .money-dates .dt-wrap{min-width:124px}
    .money-dates .dt-display{height:42px}
    .money-result-row{grid-column:1/-1;min-height:28px;display:flex;align-items:center;justify-content:space-between;gap:12px;color:var(--muted);font-size:10px}
    .money-result-row .text-btn{display:inline-flex;align-items:center;gap:5px}
    .money-result-row svg{width:13px;height:13px}
    .money-load-more{width:100%;margin-top:12px}
    .money-load-more[hidden]{display:none}
    @media(max-width:560px){
      .money-explorer{grid-template-columns:1fr}
      .money-dates{grid-template-columns:1fr 1fr}
      .money-result-row{grid-column:auto}
      .money-dates .dt-wrap{min-width:0}
    }
  </style>
"""
    replace("</head>", styles.replace("\n", "\r\n") + "</head>")

    old_render = (
        "    const filtered=records.filter(r=>state.settings.moneyFilter==='all'||"
        "r.data.category===state.settings.moneyFilter);document.getElementById('moneyList').innerHTML="
        "filtered.length?filtered.slice(0,60).map(recordRow).join(''):empty('这个分类还没有流水');"
    )
    new_render = (
        "    const filtered=records.filter(r=>state.settings.moneyFilter==='all'||"
        "r.data.category===state.settings.moneyFilter);renderMoneyRecords(filtered);"
    )
    replace(old_render, new_render)

    module = (ROOT / "v24-money-explorer.js").read_text()
    marker = "  function bindForms(){"
    replace(marker, module.replace("\n", "\r\n") + "\r\n" + marker)
    replace(
        "restoreDrafts();setupRecordEditing();bindForms();enhanceDateTime();bindEvents();",
        "restoreDrafts();setupRecordEditing();bindForms();setupMoneyExplorer();enhanceDateTime();bindEvents();",
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
        "version": 24,
        "change": "Add money search, inclusive date range, result counts, and incremental loading",
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

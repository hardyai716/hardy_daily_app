#!/usr/bin/env python3
"""Create a byte-preserved v19 candidate with standards-compliant CSV exports."""
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

    replace("-->导出 Excel</button>", "-->导出 CSV</button>", count=2)
    replace('"导出 Excel":"Export Excel"', '"导出 CSV":"Export CSV"')
    replace('"Excel 已导出":"Excel file exported"', '"CSV 已导出":"CSV file exported"')

    old_export = """  function exportExcel(kind){
    let headers=[],rows=[],name=LANG==='en'?'daily-atlas':'日常集';
    if(kind==='money'){headers=LANG==='en'?['Date','Type','Category','Amount','Note']:['日期','类型','分类','金额','备注'];rows=sortedRecords('money').map(r=>[r.date,t(r.data.flow==='income'?'收入':'支出'),t(r.data.category),r.data.amount,r.sample?translateText(r.data.note||''):r.data.note||'']);name=LANG==='en'?'transactions':'记账流水';}
    else{headers=LANG==='en'?['Date','Weight (kg)','Body fat (%)','Calories (kcal)','Exercise (min)','Note']:['日期','体重(kg)','体脂率(%)','摄入热量(kcal)','运动分钟','备注'];rows=sortedRecords('fitness').map(r=>[r.date,r.data.weight||'',r.data.bodyFat||'',r.data.calories||'',r.data.duration||'',r.sample?translateText(r.data.note||''):r.data.note||'']);name=LANG==='en'?'fitness-log':'减脂记录';}
    const html=`<html><head><meta charset="UTF-8"></head><body><table border="1"><tr>${headers.map(h=>`<th>${escapeHtml(h)}</th>`).join('')}</tr>${rows.map(row=>`<tr>${row.map(v=>`<td>${escapeHtml(v)}</td>`).join('')}</tr>`).join('')}</table></body></html>`;downloadBlob(html,'application/vnd.ms-excel',`${name}-${isoDate()}.xls`);toast('Excel 已导出');
  }
"""
    new_export = """  function csvCell(value){
    if(value===null||value===undefined)return '';
    var text=String(value);
    // Prevent spreadsheet applications from evaluating user-entered text as a formula.
    if(typeof value==='string'&&/^[=+\\-@\\t\\r]/.test(text))text=\"'\"+text;
    return '\"'+text.replace(/\"/g,'\"\"')+'\"';
  }
  function exportCsv(kind){
    let headers=[],rows=[],name=LANG==='en'?'daily-atlas':'日常集';
    if(kind==='money'){headers=LANG==='en'?['Date','Type','Category','Amount','Note']:['日期','类型','分类','金额','备注'];rows=sortedRecords('money').map(r=>[r.date,t(r.data.flow==='income'?'收入':'支出'),t(r.data.category),r.data.amount,r.sample?translateText(r.data.note||''):r.data.note||'']);name=LANG==='en'?'transactions':'记账流水';}
    else{headers=LANG==='en'?['Date','Weight (kg)','Body fat (%)','Calories (kcal)','Exercise (min)','Note']:['日期','体重(kg)','体脂率(%)','摄入热量(kcal)','运动分钟','备注'];rows=sortedRecords('fitness').map(r=>[r.date,r.data.weight,r.data.bodyFat,r.data.calories,r.data.duration,r.sample?translateText(r.data.note||''):r.data.note||'']);name=LANG==='en'?'fitness-log':'减脂记录';}
    const csv='\\ufeff'+[headers,...rows].map(row=>row.map(csvCell).join(',')).join('\\r\\n');
    downloadBlob(csv,'text/csv;charset=utf-8',`${name}-${isoDate()}.csv`);toast('CSV 已导出');
  }
"""
    replace(old_export.replace("\n", "\r\n"), new_export.replace("\n", "\r\n"))
    replace("exportExcel('money')", "exportCsv('money')")
    replace("exportExcel('fitness')", "exportCsv('fitness')")
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
        "version": 19,
        "change": "Replace legacy HTML .xls exports with UTF-8 CSV and preserve numeric zero values",
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

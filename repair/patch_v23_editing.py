#!/usr/bin/env python3
"""Add stable-ID record editing to the v22 candidate."""
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
        '    <symbol data-page-node-id="HarnfIwtR3JMLl8awa8TgL" id="i-trash" viewBox="0 0 24 24"><path data-page-node-id="Qapo14OZhx01EI3aC8qatm" d="M4 7h16M9 3h6l1 4H8zM7 7l1 14h8l1-14"/></symbol>',
        '    <symbol data-page-node-id="HarnfIwtR3JMLl8awa8TgL" id="i-trash" viewBox="0 0 24 24"><path data-page-node-id="Qapo14OZhx01EI3aC8qatm" d="M4 7h16M9 3h6l1 4H8zM7 7l1 14h8l1-14"/></symbol>\r\n'
        '    <symbol id="i-edit" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></symbol>',
    )

    styles = """  <style>
    .record-actions{display:flex;align-items:center;justify-content:flex-end;gap:2px}
    .edit-btn{width:32px;height:32px;padding:0;border:0;border-radius:9px;background:transparent;color:#8f8579;opacity:0}
    .edit-btn svg{width:15px;height:15px}
    .record-row:hover .edit-btn,.task-row:hover .edit-btn,.shopping-row:hover .edit-btn,.media-card:hover .edit-btn{opacity:1}
    .edit-btn:hover{background:var(--plum-soft);color:var(--plum)}
    .record-row{grid-template-columns:42px minmax(0,1fr) auto 68px}
    .task-row:has(.record-actions){grid-template-columns:26px minmax(0,1fr) auto 6px 68px}
    .shopping-row{grid-template-columns:30px minmax(0,1fr) auto 68px}
    .media-actions{display:flex;align-items:center;gap:2px}
    .media-actions .media-delete,.media-actions .edit-btn{position:static}
    .media-list .media-actions .edit-btn{opacity:1}
    .edit-remove-cover{align-self:flex-start}
    @media(max-width:860px){
      .edit-btn{opacity:1}
      .record-row{grid-template-columns:38px minmax(0,1fr) auto 68px}
      .shopping-row{grid-template-columns:28px minmax(0,1fr) auto 68px}
    }
    @media(max-width:560px){
      .record-row,.shopping-row{column-gap:6px}
      .task-row:has(.record-actions){grid-template-columns:26px minmax(0,1fr) auto 68px}
      .task-row:has(.record-actions) .priority-flag{display:none}
      .record-actions{gap:0}
    }
  </style>
"""
    replace("</head>", styles.replace("\n", "\r\n") + "</head>")

    replace(
        "${deletable?`<button class=\"delete-btn\" data-action=\"delete\" data-id=\"${record.id}\" aria-label=\"${t('删除')}\">${icon('i-trash')}</button>`:''}</div>`;}",
        "${deletable?`<span class=\"record-actions\">${editRecordButton(record.id)}<button class=\"delete-btn\" data-action=\"delete\" data-id=\"${record.id}\" aria-label=\"${t('删除')}\">${icon('i-trash')}</button></span>`:''}</div>`;}",
    )
    replace(
        "<button class=\"delete-btn\" data-action=\"delete\" data-id=\"${record.id}\" aria-label=\"${t('删除')}\">${icon('i-trash')}</button></div>`;}",
        "<span class=\"record-actions\">${editRecordButton(record.id)}<button class=\"delete-btn\" data-action=\"delete\" data-id=\"${record.id}\" aria-label=\"${t('删除')}\">${icon('i-trash')}</button></span></div>`;}",
    )
    replace(
        "<button class=\"delete-btn\" data-action=\"delete\" data-id=\"${r.id}\" aria-label=\"${t('删除')}\">${icon('i-trash')}</button></div>`;}).join('')",
        "<span class=\"record-actions\">${editRecordButton(r.id)}<button class=\"delete-btn\" data-action=\"delete\" data-id=\"${r.id}\" aria-label=\"${t('删除')}\">${icon('i-trash')}</button></span></div>`;}).join('')",
    )
    replace(
        "<button class=\"media-delete\" data-action=\"delete-media\" data-id=\"${item.id}\" aria-label=\"${t('删除')}\">${icon('i-trash')}</button></article>`;}).join('')",
        "<span class=\"media-actions\">${editRecordButton(item.id)}<button class=\"media-delete\" data-action=\"delete-media\" data-id=\"${item.id}\" aria-label=\"${t('删除')}\">${icon('i-trash')}</button></span></article>`;}).join('')",
    )

    module = (ROOT / "v23-editing.js").read_text()
    marker = "  function bindForms(){"
    replace(marker, module.replace("\n", "\r\n") + "\r\n" + marker)
    replace(
        "restoreDrafts();bindForms();enhanceDateTime();bindEvents();",
        "restoreDrafts();setupRecordEditing();bindForms();enhanceDateTime();bindEvents();",
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
        "version": 23,
        "change": "Add in-place editing for money, planner, fitness, shopping, and media records",
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

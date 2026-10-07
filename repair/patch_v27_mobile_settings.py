#!/usr/bin/env python3
"""Expose brand settings on mobile and finalize v27 metadata."""
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

    replace(
        '    <symbol id="i-x" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>',
        '    <symbol id="i-x" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>\r\n'
        '    <symbol id="i-settings" viewBox="0 0 24 24"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/></symbol>',
    )
    replace(
        '          <span data-page-node-id="3McTBQocwXJjjokPXGEE8C" class="save-state">',
        '          <span data-page-node-id="3McTBQocwXJjjokPXGEE8C" class="save-state">',
    )
    clear_button = (
        '          <button data-page-node-id="cOKgUHgNxJftm90nPa43ay" class="btn ghost" '
        'id="clearSamplesBtn" title="清空示例">'
    )
    replace(
        clear_button,
        '          <button class="btn ghost mobile-brand-settings" id="mobileBrandSettingsBtn" '
        'type="button" aria-label="自定义工作台外观" title="外观设置">'
        '<svg aria-hidden="true"><use href="#i-settings"/></svg></button>\r\n'
        + clear_button,
    )
    styles = """  <style>
    .mobile-brand-settings{display:none}
    @media(max-width:860px){
      .top-actions{grid-template-columns:48px minmax(0,1fr)}
      .top-actions:has(#clearSamplesBtn[hidden]){grid-template-columns:48px;justify-content:end}
      .mobile-brand-settings{display:inline-flex;width:48px;padding:0}
    }
  </style>
"""
    replace("</head>", styles.replace("\n", "\r\n") + "</head>")
    replace(
        "document.getElementById('brandSettingsBtn').addEventListener('click',openBrandSettings);",
        "document.getElementById('brandSettingsBtn').addEventListener('click',openBrandSettings);\r\n"
        "    document.getElementById('mobileBrandSettingsBtn')?.addEventListener('click',openBrandSettings);",
    )
    replace("      appVersion:22,", "      appVersion:27,")
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
        "version": 27,
        "change": "Expose appearance settings on mobile and finalize backup metadata",
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

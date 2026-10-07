#!/usr/bin/env python3
"""Create a v21 candidate with readable, unclipped heatmap header labels."""
import argparse
import hashlib
import json
from pathlib import Path


def patch(source: bytes) -> bytes:
    marker = (
        b".habit-layout .panel{border-color:transparent;background:transparent;"
        b"box-shadow:none;padding:0}"
    )
    addition = (
        marker
        + b".heatmap-panel .panel-head{padding-inline:6px}"
        + b".heatmap-panel .eyebrow,.heatmap-panel .mini-note{"
        b"color:#6f655b;font-size:11px;line-height:1.6}"
        + b".heatmap-panel .mini-note{flex:0 0 auto;white-space:nowrap}"
    )
    actual = source.count(marker)
    if actual != 1:
        raise ValueError(f"Baseline changed: expected heatmap style marker once, got {actual}")
    return source.replace(marker, addition)


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
        "version": 21,
        "change": "Preserve sandbox downloads and make heatmap edge labels readable",
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

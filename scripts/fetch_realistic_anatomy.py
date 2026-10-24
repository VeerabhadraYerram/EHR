"""Fetch pinned official anatomy assets, verifying SHA-256 before accepting files."""

import hashlib
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def main():
    assets = []
    for version in ("v2", "v3"):
        lock = (
            ROOT
            / f"frontend/doctor-review-ui/public/anatomy/{version}/source-lock.json"
        )
        if lock.exists():
            assets.extend(json.loads(lock.read_text(encoding="utf8"))["assets"])
    target = (ROOT / "data/anatomy/source").resolve()
    for asset in assets:
        path = (target / asset["destination"]).resolve()
        if not path.is_relative_to(target):
            raise ValueError("Invalid source destination")
        if (
            path.exists()
            and hashlib.sha256(path.read_bytes()).hexdigest() == asset["sha256"]
        ):
            continue
        with urllib.request.urlopen(asset["url"], timeout=120) as response:
            raw = response.read()
        if hashlib.sha256(raw).hexdigest() != asset["sha256"]:
            raise ValueError(f"Source hash mismatch: {path.name}")
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(raw)
        print(path.name, flush=True)


if __name__ == "__main__":
    main()

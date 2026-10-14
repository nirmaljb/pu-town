#!/usr/bin/env python3
"""Restore ignored original textures from locally downloaded, hash-pinned packs."""

import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import zipfile


ROOT = Path(__file__).resolve().parents[2]
MANIFEST = Path(__file__).with_name("large-textures.json")


def digest(path):
    result = hashlib.sha256()
    with path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            result.update(chunk)
    return result.hexdigest()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Check local textures without writing files.")
    parser.add_argument("--force", action="store_true", help="Restore even files that already match.")
    args = parser.parse_args()
    if args.check and args.force:
        parser.error("--check and --force cannot be combined")
    verified_archives = set()
    missing = []
    entries = json.loads(MANIFEST.read_text())["files"]
    for entry in entries:
        target = (ROOT / entry["path"]).resolve()
        if not target.is_relative_to(ROOT / "native/Assets"):
            raise ValueError("Texture destination must be inside native/Assets")
        valid = target.is_file() and target.stat().st_size == entry["byteLength"] and digest(target) == entry["sha256"]
        if args.check:
            if not valid:
                missing.append(entry["path"])
            continue
        if valid and not args.force:
            continue
        archive = (ROOT / entry["archive"]).resolve()
        if not any(archive.is_relative_to(ROOT / directory) for directory in ("campus/assets/sources", "towns/assets/sources")):
            raise ValueError("Archive must be inside the local source workspace")
        if not archive.is_file():
            raise FileNotFoundError("Download the recorded Standard archive first: " + entry["archive"])
        if archive not in verified_archives:
            if digest(archive) != entry["archiveSha256"]:
                raise ValueError("Archive hash differs from the recorded release: " + entry["archive"])
            verified_archives.add(archive)
        with zipfile.ZipFile(archive) as source:
            payload = source.read(entry["member"])
        if len(payload) != entry["byteLength"] or hashlib.sha256(payload).hexdigest() != entry["sha256"]:
            raise ValueError("Texture bytes differ from the recorded source: " + entry["path"])
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=target.parent, delete=False) as output:
                temporary = Path(output.name)
                output.write(payload)
            os.replace(temporary, target)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        print("Restored " + entry["path"])
    if missing:
        raise SystemExit("Missing or changed local textures; run restore.py after downloading the recorded packs:\n" + "\n".join(missing))
    print(f"All {len(entries)} local textures match the original source hashes.")


if __name__ == "__main__":
    main()

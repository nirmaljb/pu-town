#!/usr/bin/env python3
"""Refuse new Git blobs or LFS payloads over 5 MiB before committing/pushing."""

import argparse
import io
from pathlib import Path
import subprocess


ROOT = Path(__file__).resolve().parents[1]
LIMIT = 5 * 1024 * 1024


def git(*arguments, data=None):
    return subprocess.run(["git", *arguments], cwd=ROOT, input=data, capture_output=True, check=True).stdout


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default="origin/HEAD", help="Remote baseline whose existing objects are already uploaded.")
    parser.add_argument("--staged", action="store_true", help="Check staged changes instead of all new committed objects.")
    args = parser.parse_args()
    objects = {}
    if args.staged:
        changed = set(git("diff", "--cached", "--name-only", "-z").split(b"\0"))
        for entry in git("ls-files", "-s", "-z").split(b"\0"):
            if not entry:
                continue
            header, path = entry.split(b"\t", 1)
            _, oid, stage = header.split()
            if path in changed:
                if stage != b"0":
                    raise ValueError("Resolve unmerged paths before checking uploads")
                objects[oid] = path.decode()
    else:
        git("rev-parse", "--verify", args.base + "^{commit}")
        for entry in git("rev-list", "--objects", args.base + "..HEAD").splitlines():
            oid, _, path = entry.partition(b" ")
            objects[oid] = path.decode()
    if not objects:
        print("No new objects to check.")
        return
    result = git("cat-file", "--batch-check=%(objectname) %(objecttype) %(objectsize)", data=b"\n".join(objects) + b"\n")
    blobs = []
    large = []
    for line in result.splitlines():
        oid, kind, raw_size = line.split()
        if kind != b"blob":
            continue
        size = int(raw_size)
        if size > LIMIT:
            large.append((size, objects[oid]))
        elif size <= 1024:
            blobs.append(oid)
    # An LFS pointer is small, but its declared payload is still an upload.
    if blobs:
        stream = io.BytesIO(git("cat-file", "--batch", data=b"\n".join(blobs) + b"\n"))
        for oid in blobs:
            _, _, raw_size = stream.readline().split()
            content = stream.read(int(raw_size))
            stream.read(1)
            if content.startswith(b"version https://git-lfs.github.com/spec/v1\n"):
                size = next((int(line[5:]) for line in content.splitlines() if line.startswith(b"size ")), 0)
                if size > LIMIT:
                    large.append((size, objects[oid] + " (LFS payload)"))
    if large:
        details = "\n".join(f"{size / 1024 / 1024:.2f} MiB  {path}" for size, path in sorted(large, reverse=True))
        raise SystemExit("Upload refused: new files must be at most 5 MiB. Ignore/localize them and remove them from unpushed history.\n" + details)
    print(f"Checked {len(objects)} new objects: no Git blob or LFS payload exceeds 5 MiB.")


if __name__ == "__main__":
    main()

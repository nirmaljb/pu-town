#!/usr/bin/env python3
"""Record the exact source and package bytes used for a local desktop preview."""

import configparser
import hashlib
import json
from pathlib import Path
import subprocess
import sys


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def main():
    project, stage = (Path(argument).resolve() for argument in sys.argv[1:3])
    platform, mode, engine = sys.argv[3:6]
    sources = sorted(
        path for path in project.rglob("*")
        if path.relative_to(project).parts[0] not in {".godot", "build", "exports"}
        and (path.suffix in {".gd", ".gdshader", ".tscn"}
             or path.name in {"project.godot", "export_presets.cfg"})
    )
    packages = sorted(path for path in stage.rglob("*") if path.is_file() and path.name != "export.log")
    settings = configparser.ConfigParser()
    settings.read_string("[file]\n" + (project / "project.godot").read_text(encoding="utf-8"))
    renderer = settings["rendering"]["renderer/rendering_method"].strip('"')
    if renderer != "gl_compatibility":
        raise ValueError("The desktop snow preview requires the Compatibility renderer")
    revision = subprocess.run(
        ["git", "rev-parse", "HEAD"], cwd=project, capture_output=True, text=True, check=True
    ).stdout.strip()
    dirty = subprocess.run(
        ["git", "status", "--porcelain", "--", "."], cwd=project,
        capture_output=True, text=True, check=True
    ).stdout != ""
    record = {
        "engine": engine,
        "renderer": renderer,
        "configured_viewport": [
            settings.getint("display", "window/size/viewport_width"),
            settings.getint("display", "window/size/viewport_height"),
        ],
        "platform": platform,
        "build_mode": mode,
        "git_revision": revision,
        "godot_source_dirty": dirty,
        "sources_sha256": {str(path.relative_to(project)): sha256(path) for path in sources},
        "package_sha256": {str(path.relative_to(stage)): sha256(path) for path in packages},
    }
    (stage / "build-info.json").write_text(json.dumps(record, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

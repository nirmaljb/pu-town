#!/usr/bin/env python3
"""Install repository upload guards, chaining any existing local Git hooks."""

import os
from pathlib import Path
import shutil
import subprocess
import tempfile


ROOT = Path(__file__).resolve().parents[1]
MARKER = "# PU Town upload size guard"


def main():
    configured = subprocess.run(["git", "config", "--get", "core.hooksPath"], cwd=ROOT, capture_output=True, text=True)
    if configured.returncode == 0:
        raise SystemExit("Custom core.hooksPath is configured; integrate the size checker into those hooks explicitly.")
    raw_path = subprocess.check_output(["git", "rev-parse", "--git-path", "hooks"], cwd=ROOT, text=True).strip()
    hooks = Path(raw_path)
    if not hooks.is_absolute():
        hooks = ROOT / hooks
    hooks = hooks.resolve()
    hooks.mkdir(parents=True, exist_ok=True)
    for name, arguments in (("pre-commit", "--staged"), ("pre-push", "--base origin/HEAD")):
        target = hooks / name
        previous = hooks / ("." + name + ".before-putown-size-guard")
        if target.is_symlink():
            raise SystemExit("Refusing to replace a symlink hook: " + name)
        already_guarded = target.exists() and MARKER in target.read_text()
        if not already_guarded:
            if previous.exists():
                raise SystemExit("Existing hook backup requires manual review: " + str(previous))
            if target.exists():
                shutil.copy2(target, previous)
        content = f'''#!/bin/sh
{MARKER}
repository=$(git rev-parse --show-toplevel) || exit 1
checker="$repository/tools/check-upload-size.py"
if [ -f "$checker" ]; then
    python3 "$checker" {arguments} || exit $?
fi
hook_directory=$(git rev-parse --git-path hooks) || exit 1
previous_hook="$hook_directory/.{name}.before-putown-size-guard"
if [ -x "$previous_hook" ]; then
    exec "$previous_hook" "$@"
fi
exit 0
'''
        if target.exists() and target.read_text() == content:
            print(name + " guard already installed.")
            continue
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(mode="w", dir=hooks, delete=False) as output:
                temporary = Path(output.name)
                output.write(content)
            temporary.chmod(0o755)
            os.replace(temporary, target)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
        print("Installed " + name + " size guard; existing hook preserved and chained.")


if __name__ == "__main__":
    main()

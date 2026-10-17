#!/usr/bin/env bash
# Build and review the snow pine. BLENDER_BIN overrides the macOS default.
# Usage: tools/scenery/pine/run.sh BUILD_DIR [REFERENCE_DIR]
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
build="${1:?usage: run.sh BUILD_DIR [REFERENCE_DIR]}"
blender="${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
"$blender" -b --factory-startup --python "$here/make.py" -- "$build"
"$blender" -b "$build/pine.blend" --python "$here/review.py" -- "$build"
python3 "$here/compare.py" "${2:-$here/reference}" "$build"

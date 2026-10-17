#!/usr/bin/env bash
# Build, review, check and export the snow pine. BLENDER_BIN overrides the macOS default.
# Usage: tools/scenery/pine/run.sh BUILD_DIR [REFERENCE_DIR]
# The near tree and the distance version reach godot/scenery/pine/ only if every
# check in budget.py passes.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
build="${1:?usage: run.sh BUILD_DIR [REFERENCE_DIR]}"
blender="${BLENDER_BIN:-/Applications/Blender.app/Contents/MacOS/Blender}"
godot="$here/../../../godot/scenery/pine"
"$blender" -b --factory-startup --python "$here/make.py" -- "$build"
"$blender" -b "$build/pine.blend" --python "$here/review.py" -- "$build"
python3 "$here/compare.py" "${2:-$here/reference}" "$build"
mkdir -p "$godot"
cp "$build/pine.glb" "$build/pine_far.glb" "$godot/"
echo "Exported pine.glb and pine_far.glb to godot/scenery/pine/"

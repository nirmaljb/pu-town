#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
target="${1:-}"
mode=release

case "$target" in
  macos|windows|all) ;;
  --help|-h)
    printf '%s\n' 'Usage: ./godot/export.sh {macos|windows|all} [--debug]' \
      'Set GODOT_BIN to Godot 4.7.2 (executable, command name, or macOS .app).' \
      'Install the standard 4.7.2 export templates in Godot first.' \
      'Release builds are the default; generated packages remain in godot/build/.'
    exit 0
    ;;
  *) printf '%s\n' 'Expected macos, windows, or all. See --help.' >&2; exit 2 ;;
esac
if [[ "${2:-}" == --debug ]]; then
  mode=debug
elif [[ -n "${2:-}" ]]; then
  printf 'Unknown argument: %s\n' "$2" >&2
  exit 2
fi
if (( $# > 2 )); then
  printf '%s\n' 'Expected at most two arguments. See --help.' >&2
  exit 2
fi

source "$project_dir/resolve-godot.sh"
resolve_godot
if ! command -v python3 >/dev/null 2>&1; then
  printf '%s\n' 'Python 3 is required to record the exported package hashes.' >&2
  exit 1
fi

GODOT_BIN="$godot_bin" "$project_dir/run.sh" --check
mkdir -p "$project_dir/build"
stage_dir=""
trap 'if [[ -n "$stage_dir" ]]; then rm -rf -- "$stage_dir"; fi' EXIT

targets=("$target")
if [[ "$target" == all ]]; then targets=(macos windows); fi
for platform in "${targets[@]}"; do
  case "$platform" in
    macos) preset='macOS Preview'; package_name=PU-Town-Snow-Walk.app ;;
    windows) preset='Windows Preview'; package_name=PU-Town-Snow-Walk.exe ;;
  esac
  stage_dir="$(mktemp -d "$project_dir/build/.export-$platform-XXXXXX")"
  export_log="$stage_dir/export.log"
  printf 'Exporting %s (%s), Godot %s\n' "$preset" "$mode" "$godot_version"
  if ! "$godot_bin" --headless --path "$project_dir" "--export-$mode" "$preset" "$stage_dir/$package_name" >"$export_log" 2>&1; then
    cat "$export_log"
    printf '%s\n' 'Export failed. Check that the standard 4.7.2 export templates are installed.' >&2
    exit 1
  fi
  cat "$export_log"
  if grep -Eq '(^|[[:space:]])(SCRIPT ERROR:|ERROR:|Parse Error:)' "$export_log" || [[ ! -e "$stage_dir/$package_name" ]]; then
    printf '%s\n' 'Godot reported an export error or did not create the package.' >&2
    exit 1
  fi
  python3 "$project_dir/write-build-manifest.py" "$project_dir" "$stage_dir" "$platform" "$mode" "$godot_version"
  output_dir="$project_dir/build/$platform/$mode"
  mkdir -p "$(dirname -- "$output_dir")"
  # Publish only a completed package; a failed export leaves the prior build intact.
  rm -rf -- "$output_dir"
  mv -- "$stage_dir" "$output_dir"
  stage_dir=""
  printf 'Package: %s\nBuild record: %s\n' "$output_dir/$package_name" "$output_dir/build-info.json"
done

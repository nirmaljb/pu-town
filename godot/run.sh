#!/usr/bin/env bash
set -euo pipefail

project_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
check_only=false

case "${1:-}" in
  "") ;;
  --check) check_only=true ;;
  --help|-h)
    printf '%s\n' 'Usage: ./godot/run.sh [--check]' \
      'Set GODOT_BIN to Godot 4.7.2 (executable, command name, or macOS .app).' \
      '--check imports and validates the standalone project without opening it.'
    exit 0
    ;;
  *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
esac
if (( $# > 1 )); then
  printf '%s\n' 'Expected at most one argument. See --help.' >&2
  exit 2
fi

godot_bin="${GODOT_BIN:-}"
if [[ -z "$godot_bin" ]]; then
  if command -v godot >/dev/null 2>&1; then
    godot_bin="$(command -v godot)"
  elif command -v godot4 >/dev/null 2>&1; then
    godot_bin="$(command -v godot4)"
  elif [[ -d /Applications/Godot.app ]]; then
    godot_bin=/Applications/Godot.app
  else
    printf '%s\n' 'Godot 4.7.2 was not found. Set GODOT_BIN to its executable or macOS .app.' >&2
    exit 1
  fi
fi

if [[ "$godot_bin" == *.app || "$godot_bin" == *.app/ ]]; then
  godot_bin="${godot_bin%/}/Contents/MacOS/Godot"
elif [[ "$godot_bin" != */* ]]; then
  godot_bin="$(command -v "$godot_bin" || true)"
fi
if [[ -z "$godot_bin" || ! -x "$godot_bin" ]]; then
  printf 'Godot executable is unavailable: %s\n' "${GODOT_BIN:-$godot_bin}" >&2
  exit 1
fi

version="$("$godot_bin" --version)"
case "$version" in
  4.7.2.stable|4.7.2.stable.*) ;;
  *) printf 'Godot 4.7.2 stable is required; found %s.\n' "$version" >&2; exit 1 ;;
esac

printf 'Importing snow prototype with Godot %s\n' "$version"
import_log="$(mktemp "${TMPDIR:-/tmp}/pu-town-godot-import.XXXXXX")"
trap 'rm -f "$import_log"' EXIT
if ! "$godot_bin" --headless --editor --path "$project_dir" --import >"$import_log" 2>&1; then
  cat "$import_log"
  exit 1
fi
cat "$import_log"
# Godot can report a script parse failure while its editor process exits zero.
if grep -Eq '(^|[[:space:]])(SCRIPT ERROR:|ERROR:|Parse Error:)' "$import_log"; then
  printf '%s\n' 'Godot reported an import error; see the output above.' >&2
  exit 1
fi

# Import scanning alone may omit scripts without a registered global class.
for script in "$project_dir"/*.gd "$project_dir"/tests/*.gd; do
  script_path="res://${script#"$project_dir/"}"
  if ! "$godot_bin" --headless --path "$project_dir" --script "$script_path" --check-only >"$import_log" 2>&1; then
    cat "$import_log"
    exit 1
  fi
  if grep -Eq '(^|[[:space:]])(SCRIPT ERROR:|ERROR:|Parse Error:)' "$import_log"; then
    cat "$import_log"
    exit 1
  fi
done

if [[ "$check_only" == true ]]; then
  printf '%s\n' 'Snow prototype import check completed.'
  exit 0
fi
rm -f "$import_log"
trap - EXIT
exec "$godot_bin" --path "$project_dir"

#!/usr/bin/env bash
# Shared by run.sh and export.sh. Sets godot_bin and godot_version on success.

resolve_godot() {
  local candidate="${GODOT_BIN:-}"
  if [[ -z "$candidate" ]]; then
    if command -v godot >/dev/null 2>&1; then
      candidate="$(command -v godot)"
    elif command -v godot4 >/dev/null 2>&1; then
      candidate="$(command -v godot4)"
    elif [[ -d /Applications/Godot.app ]]; then
      candidate=/Applications/Godot.app
    else
      printf '%s\n' 'Godot 4.7.2 was not found. Set GODOT_BIN to its executable or macOS .app.' >&2
      return 1
    fi
  fi

  if [[ "$candidate" == *.app || "$candidate" == *.app/ ]]; then
    candidate="${candidate%/}/Contents/MacOS/Godot"
  elif [[ "$candidate" != */* ]]; then
    candidate="$(command -v "$candidate" || true)"
  fi
  if [[ -z "$candidate" || ! -x "$candidate" ]]; then
    printf 'Godot executable is unavailable: %s\n' "${GODOT_BIN:-$candidate}" >&2
    return 1
  fi

  godot_bin="$candidate"
  godot_version="$("$godot_bin" --version)" || return "$?"
  case "$godot_version" in
    4.7.2.stable|4.7.2.stable.*) ;;
    *) printf 'Godot 4.7.2 stable is required; found %s.\n' "$godot_version" >&2; return 1 ;;
  esac
}

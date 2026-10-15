#!/usr/bin/env bash
# Runs the 60 s F6 release benchmark with the retained input script.
# Usage: run_benchmark.sh WORK_DIR REPO
# WORK_DIR/bin/osinput is docs/verification/godot-snow-town/osinput.swift compiled with swiftc.
# REPO holds the exported package (godot/build/macos/release) and the input script.
# Launches the package normally, waits for its window, posts the script's OS events at the
# window's content origin, refocuses the package if another application takes the front,
# and samples top before and during the walk. Output goes to WORK_DIR/run-HHMMSS.
set -uo pipefail
S="$1"; REPO="$2"; OUT="$S/run-$(date +%H%M%S)"; mkdir -p "$OUT"
APP="$REPO/godot/build/macos/release/PU-Town-Snow-Walk.app"
UD="$HOME/Library/Application Support/Godot/app_userdata/PU Town · Snow Walk"
ls "$UD" > "$OUT/userdata-before.txt"
top -l 2 -s 1 -o cpu -n 15 -stats pid,command,cpu,mem | awk "/^Processes:/{n++} n==2" > "$OUT/workload-before.txt"; pmset -g batt >> "$OUT/workload-before.txt"
open -n "$APP"
pid=""
for i in $(seq 1 60); do pid=$(pgrep -f "PU-Town-Snow-Walk.app/Contents/MacOS" | head -1); [[ -n "$pid" ]] && break; sleep 0.5; done
echo "pid $pid" > "$OUT/launch.txt"
geom=""
for i in $(seq 1 60); do
  geom=$(osascript -e "tell application \"System Events\" to tell (first process whose unix id is $pid) to get {position, size} of window 1" 2>/dev/null)
  [[ -n "$geom" ]] && break; sleep 0.5
done
[[ -z "$geom" ]] && { echo "no window" >> "$OUT/launch.txt"; kill $pid; echo "$OUT"; exit 1; }
sleep 2
osascript -e "tell application \"System Events\" to set frontmost of (first process whose unix id is $pid) to true"
sleep 1
echo "window $geom" >> "$OUT/launch.txt"
IFS=', ' read -r wx wy ww wh <<< "$geom"
title=$(( wh - 800 )); (( title < 0 )) && title=0
ox=$wx; oy=$(( wy + title ))
echo "content origin $ox $oy (title bar $title)" >> "$OUT/launch.txt"
# focus watcher
( while kill -0 $pid 2>/dev/null; do
    f=$(osascript -e 'tell application "System Events" to get unix id of first process whose frontmost is true' 2>/dev/null)
    if [[ -n "$f" && "$f" != "$pid" ]]; then
      echo "$(date +%H:%M:%S) frontmost pid $f ($(ps -p $f -o comm= 2>/dev/null)); refocusing" >> "$OUT/focus-watcher.log"
      osascript -e "tell application \"System Events\" to set frontmost of (first process whose unix id is $pid) to true" 2>/dev/null
    fi
    sleep 0.5
  done ) &
watcher=$!
touch "$OUT/focus-watcher.log"
( sleep 35; top -l 2 -s 1 -o cpu -n 15 -stats pid,command,cpu,mem | awk "/^Processes:/{n++} n==2" > "$OUT/workload-during.txt"; pmset -g batt >> "$OUT/workload-during.txt" ) &
"$S/bin/osinput" $ox $oy < "$REPO/docs/verification/godot-snow-town/benchmark-input-script.txt" > "$OUT/input-driver.log" 2>&1
sleep 3
ls "$UD" > "$OUT/userdata-after.txt"
kill $pid 2>/dev/null; sleep 1; kill $watcher 2>/dev/null
wait 2>/dev/null
echo "$OUT"

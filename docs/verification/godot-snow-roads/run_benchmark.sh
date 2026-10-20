#!/usr/bin/env bash
# Runs the 60 s F6 release benchmark with an input script posted as ordinary macOS events.
# Usage: run_benchmark.sh OSINPUT APP SCRIPT OUT_DIR
# Launches the package through Launch Services (which brings its window to the front),
# waits for its window, rests the cursor on the figure, posts the script's events at the
# window's content origin, logs any other application taking the front, and samples top.
set -uo pipefail
OSINPUT="$1"; APP="$2"; SCRIPT="$3"; OUT="$4/run-$(date +%H%M%S)"; mkdir -p "$OUT"
UD="$HOME/Library/Application Support/Godot/app_userdata/PU Town · Snow Walk"
ls "$UD" > "$OUT/userdata-before.txt"
top -l 2 -s 1 -o cpu -n 12 -stats pid,command,cpu,mem | awk "/^Processes:/{n++} n==2" > "$OUT/workload-before.txt"; pmset -g batt >> "$OUT/workload-before.txt"
open -n -a "$APP" --stdout "$OUT/package-stdout.log" --stderr "$OUT/package-stderr.log"
pid=""
for i in $(seq 1 60); do pid=$(pgrep -f "PU-Town-Snow-Walk.app/Contents/MacOS" | head -1); [[ -n "$pid" ]] && break; sleep 0.5; done
echo "pid $pid" > "$OUT/launch.txt"
geom=""
for i in $(seq 1 60); do
  geom=$(osascript -e "tell application \"System Events\" to tell (first process whose unix id is $pid) to get {position, size} of window 1" 2>/dev/null)
  [[ -n "$geom" ]] && break; sleep 0.5
done
[[ -z "$geom" ]] && { echo "no window" >> "$OUT/launch.txt"; kill $pid; echo "$OUT"; exit 1; }
sleep 3
echo "window $geom" >> "$OUT/launch.txt"
IFS=', ' read -r wx wy ww wh <<< "$geom"
# Content is 16:9 below the title bar.
content_h=$(( ww * 9 / 16 )); title=$(( wh - content_h )); (( title < 0 )) && title=0
ox=$wx; oy=$(( wy + title ))
fx=$(( ww / 2 )); fy=$(( content_h * 58 / 100 ))
echo "content origin $ox $oy (title bar $title), content ${ww}x${content_h}, figure at $fx $fy" >> "$OUT/launch.txt"
front=$(osascript -e 'tell application "System Events" to get unix id of first process whose frontmost is true' 2>/dev/null)
echo "frontmost before input: $front" >> "$OUT/launch.txt"
# Never post keys to another application.
[[ "$front" != "$pid" ]] && { echo "package not frontmost; aborted" >> "$OUT/launch.txt"; kill $pid; echo "$OUT"; exit 1; }
( while kill -0 $pid 2>/dev/null; do
    f=$(osascript -e 'tell application "System Events" to get unix id of first process whose frontmost is true' 2>/dev/null)
    if [[ -n "$f" && "$f" != "$pid" ]]; then
      echo "$(date +%H:%M:%S) frontmost pid $f ($(ps -p $f -o comm= 2>/dev/null))" >> "$OUT/focus-watcher.log"
    fi
    sleep 0.5
  done ) &
watcher=$!
touch "$OUT/focus-watcher.log"
( sleep 35; top -l 2 -s 1 -o cpu -n 12 -stats pid,command,cpu,mem | awk "/^Processes:/{n++} n==2" > "$OUT/workload-during.txt"; pmset -g batt >> "$OUT/workload-during.txt" ) &
sed "s/^move FIGURE$/move $fx $fy/" "$SCRIPT" | "$OSINPUT" $ox $oy $pid > "$OUT/input-driver.log" 2>&1
sleep 3
ls "$UD" > "$OUT/userdata-after.txt"
kill $pid 2>/dev/null; sleep 1; kill $watcher 2>/dev/null
wait 2>/dev/null
new=$(comm -13 "$OUT/userdata-before.txt" "$OUT/userdata-after.txt" | grep '^frames-' | tail -1)
echo "trace $new" >> "$OUT/launch.txt"
[[ -n "$new" ]] && cp "$UD/$new" "$OUT/frames.csv"
echo "$OUT"

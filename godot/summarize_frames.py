#!/usr/bin/env python3
"""Summarize the F6 rendered-frame CSV without filtering inconvenient intervals."""

import argparse
import csv
import json
import math
from pathlib import Path


def summarize(path: Path) -> dict:
    with path.open(newline="", encoding="utf-8") as source:
        rows = list(csv.DictReader(source))
    if not rows:
        raise ValueError("frame trace has no complete intervals")

    intervals = []
    unfocused_usec = 0
    stationary_usec = 0
    focused_moving_usec = 0
    unfocused_frames = 0
    stationary_frames = 0
    resolutions = set()
    previous_end = None
    for index, row in enumerate(rows, start=1):
        start = int(row["interval_start_usec"])
        end = int(row["interval_end_usec"])
        interval = end - start
        if int(row["frame"]) != index or interval <= 0:
            raise ValueError(f"invalid frame or interval at CSV row {index + 1}")
        if previous_end is not None and start != previous_end:
            raise ValueError(f"noncontiguous interval at CSV row {index + 1}")
        if not math.isclose(float(row["frame_ms"]), interval / 1000, abs_tol=0.001):
            raise ValueError(f"frame duration disagrees with timestamps at CSV row {index + 1}")
        previous_end = end
        intervals.append(interval / 1000)
        focused = row["focused"] == "true"
        moving = row["moving"] == "true"
        if not focused:
            unfocused_frames += 1
            unfocused_usec += interval
        if not moving:
            stationary_frames += 1
            stationary_usec += interval
        if focused and moving:
            focused_moving_usec += interval
        resolutions.add(tuple(int(float(row[field])) for field in (
            "viewport_width", "viewport_height", "window_width", "window_height"
        )))

    started = int(rows[0]["interval_start_usec"])
    ended = int(rows[-1]["interval_end_usec"])
    elapsed_usec = ended - started
    if not math.isclose(float(rows[-1]["elapsed_ms"]), elapsed_usec / 1000, abs_tol=0.001):
        raise ValueError("terminal elapsed time disagrees with the timestamp span")
    ordered = sorted(intervals)
    percentile = lambda fraction: ordered[math.ceil(len(ordered) * fraction) - 1]
    warnings = []
    if elapsed_usec < 60_000_000:
        warnings.append("Interrupted trace: less than 60 real seconds were recorded.")
    if unfocused_frames:
        warnings.append("The window lost focus; all affected intervals remain in the results.")
    if stationary_frames:
        warnings.append("Stationary intervals are present; inspect traversal coverage before accepting a walking run.")
    if resolutions != {(1280, 800, 1280, 800)}:
        warnings.append("The viewport or window differed from the 1280 by 800 measurement target.")

    return {
        "source": str(path.resolve()),
        "frame_count": len(rows),
        "interval_start_usec": started,
        "interval_end_usec": ended,
        "elapsed_seconds": elapsed_usec / 1_000_000,
        "duration_complete": elapsed_usec >= 60_000_000,
        "average_fps": len(rows) * 1_000_000 / elapsed_usec,
        "mean_frame_ms": sum(intervals) / len(rows),
        "p95_frame_ms": percentile(0.95),
        "p99_frame_ms": percentile(0.99),
        "max_frame_ms": ordered[-1],
        "percentile_method": "nearest rank; every recorded interval included",
        "unfocused_frames": unfocused_frames,
        "unfocused_seconds": unfocused_usec / 1_000_000,
        "stationary_frames": stationary_frames,
        "stationary_seconds": stationary_usec / 1_000_000,
        "focused_moving_seconds": focused_moving_usec / 1_000_000,
        "focused_moving_fraction": focused_moving_usec / elapsed_usec,
        "position_range_m": {
            axis: [min(float(row[field]) for row in rows), max(float(row[field]) for row in rows)]
            for axis, field in (("x", "x_m"), ("z", "z_m"))
        },
        "ortho_range_m": [min(float(row["ortho_m"]) for row in rows), max(float(row["ortho_m"]) for row in rows)],
        "resolutions": [
            {"viewport_width": width, "viewport_height": height, "window_width": window_width, "window_height": window_height}
            for width, height, window_width, window_height in sorted(resolutions)
        ],
        "max_observation_age_ms": max(float(row["observation_age_ms"]) for row in rows),
        "warnings": warnings,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("trace", type=Path, help="CSV written by F6 in the running scene")
    args = parser.parse_args()
    try:
        result = summarize(args.trace)
    except (OSError, ValueError, KeyError) as error:
        parser.exit(2, f"Cannot summarize frame trace: {error}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()

---
status: accepted
---

# Build the replacement client in Godot around one snow map

Issue #89 chooses Godot and one continuous snow-covered Town Map for the next
client direction; #91 starts with a standalone walkable ground slice. Use the
standard GDScript edition of Godot 4.7.2 with its Compatibility renderer to keep
this macOS and Windows prototype lightweight and reproducible. Generate the
terrain mesh and its collision from the same deterministic surface, so the
temporary figure can follow visible slopes without a separate height model.

This supersedes the Unity engine choice in ADR 0023 and the two-town content
direction in ADR 0024. It trades reuse of the existing Unity client and its
authored towns for a smaller ground-first prototype in the chosen engine. The
existing Java, browser and Unity consumers continue to work until their
replacements are integrated. Java authority, recipient privacy, ordered delivery,
recovery and queued application of network events at frame boundaries remain the
requirements for that integration; this offline slice establishes none of those
connections.

The scene is the inspection seam: run it, walk the terrain and inspect its
observations and captures. Final reference palette and lighting, content and
Game integration, and packaged macOS/Windows export and performance acceptance
belong to later slices. A successful editor import or local run does not establish
those later acceptance results.

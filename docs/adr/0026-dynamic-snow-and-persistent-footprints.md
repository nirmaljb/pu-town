---
status: accepted
---

# Keep changing snow local in detail and footprints fixed in the world

Extend the offline Godot prototype with a flat underlying ground, initially
uneven Snow Depth, and a detailed snow surface that follows the controlled
figure. Reevaluate its height as footsteps compress snow and wind builds drifts;
the initial mesh height is not permanent terrain. Keep the existing 64 × 64 m
world and use a 12.8 × 12.8 m detailed patch: one fifth of each side, replacing the
initial 120 m proposal. The broader snow surface remains visible beyond that
patch. Moving rendering detail does not move the world or its obstacles.

Accumulate footsteps in one fixed-size, world-anchored image covering the town,
rather than retaining an expanding list of steps. The snow surface reads that
image, both inspection figures contribute anonymous bootprints to it, and repeated traffic produces
Packed Paths that permit faster movement. Moving the detailed surface does not
erase old tracks: returning to a location restores its current impressions until
wind erases them. This separates bounded rendering detail from the lifetime of
evidence in the world, at the cost of a fixed spatial resolution for the image.

WASD walks at 2.25 m/s and Shift requests running at 4.5 m/s. Snow at or below
10 cm permits full running; deeper snow smoothly limits speed to walking.
Repeated traffic permits faster movement by compressing the same snow that
determines movement. Feet settle below the surrounding loose snow into that
compressed surface. Compression is bounded rather than cutting indefinitely
through the underlying ground.

Steady, adjustable wind softens Footprints, refills depressions and builds
Snowdrifts with obstacle influence. The default track-erasure timescale is
120 seconds. The world retains tracks when the controlled figure leaves a
location; only wind erases them during a run. A fresh launch resets the snow.

The retained `docs/art/snow-reference/reference.png` guides the obstacle layout:
a large lodge behind an open yard, smaller outbuildings around it, utility
clusters beside buildings, and trees, rocks and fence segments around the edge.
Represent these as solid, non-enterable rectangular boxes with distinguishable
sizes and colours, anchored to the flat substrate. Leave broad connecting
passages and an open yard without flattening its snow. The image establishes
composition, not measured dimensions. Generators have no interaction in this
slice; boxes block horizontal movement and their roofs are not walking surfaces.

Keep this slice offline and demonstrate overlapping trails with a second test
figure. Tab switches the controlled figure while the other remains idle; both
leave trails in the same world image. This does not establish multiplayer
synchronization or server authority.
Preserve ADR 0025's requirement that visible snow and foot contact agree, now
against the changing surface, and its requirements for later Java integration.
This extends the static first milestone deliberately while leaving the existing
Java, browser and Unity contracts unchanged. Validate through the running scene,
ordinary movement input, visible trails and exported observations; imports,
exports and hardware performance remain separate evidence.

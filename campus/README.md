# Shared Kalapet campus layout

`layout.json` is the authored source for the native `campus` Town Map. Publish from the repository root:

```sh
python3 tools/campus/publish.py
python3 tools/campus/publish.py --check
```

The publisher generates byte-identical Java and Unity data at `backend/src/main/resources/maps/campus.json` and `native/Assets/PUtown/Resources/Campus/campus.json`. It derives continuous doorway openings, wall and furnishing collision, named interior rectangles, Task sites and retained Seats together. Unity loads the resource as `Campus/campus`. Existing `village`, `horror` and `cyberpunk` maps remain available to their consumers; Rooms select `campus` in the Lobby and retain that immutable packaged map throughout their Game and recovery.

The source represents the academic core, Ananda Rangapillai Library, administration, Silver Jubilee, men’s and women’s hostels, mess, sports grounds, staff quarters, green energy and gate approaches in one compressed 4800 × 3600 layout. This is the whole main-campus district interpretation, distinct from the prior Silver Jubilee section. The retained Meeting Area is centred at (2400, 1800), with the existing ten Seat offsets and inward Facing. Every Day begins at that Seat; Townhall returns to it.

## Coordinates and authority

100 authoritative coordinate units equal one Unity unit. An accepted feet point `(x, y)` maps to Unity ground position `(x / 100, 0, y / 100)`. North is negative authoritative `y`; visual height never creates another gameplay floor. The coordinate conversion is published as metadata. The existing 14-unit feet radius becomes 0.14 Unity units, the 240-unit/s accepted speed is 2.4 Unity units/s, the 225-unit/s predicted walk is 2.25 Unity units/s and 160-unit Hearing is 1.6 Unity units. The Game still accepts only reachable moves and sends corrections; local Unity physics never authorizes movement.

Interiors use the same half-open rectangles as the existing server: top/left belong to the interior; bottom/right do not. Crossing a real open doorway changes the accepted feet area continuously, with no teleport, new visibility rule or line-of-sight test. Vision remains unlimited within the authorized area; Ghost visibility stays server controlled. Furnishings with footprint collision appear in the same obstacle list as their wall geometry.

## Grounding and authored interpretation

The university’s [Roadmap to Net Zero Carbon by 2035](https://www.pondiuni.edu.in/wp-content/uploads/2025/11/UNESCO-PondicherryUniversityRoadmaptoNetZeroCarbonby2035.pdf) was inspected on 13 October 2026, especially Figure 1 (master plan, printed page 8), Figure 2 (Silver Jubilee, page 9), Figure 3 (stadium and hostels, page 9) and Figure 4 (quarters and hostels, page 10). The master plan’s north arrow points to the right of its printed drawing. This authored north-up interpretation preserves the broad relationship between the academic/gate area, northern sports and hostels, western quarters and the separate Silver Jubilee district to the northeast. The plan is layout evidence; it does not establish these compressed distances or indoor floorplans.

Footprints, road shortening, Meeting Area, door widths, interior floorplans, furniture and maintenance Task sites are gameplay interpretations. They are not surveyed dimensions or university indoor plans. The adjacent technological university and off-site campuses are excluded. No Google or university map imagery is distributed as a terrain asset.

## Reachability and evidence

`reachability.json` records checked routes from the Meeting Area to all ten Seats, sixteen Task sites, the inside and outside of twelve doorways, and eight district entries. The checker uses the authoritative feet radius, obstacle edges and a 16-unit grid, checks complete route segments and confirms all declared doorway crossings are clear. It rejects blocked sites, disconnected sites, overlapping interiors, invalid doorway geometry, stale exports and a Meeting Area round trip that exceeds the unchanged 180-second Day.

The longest measured shortest-grid route from the Meeting Area takes 15.63 seconds at the current predicted speed, or 31.25 seconds for a round trip. Those estimates exclude Task work, pauses and conversations. Task durations and persistent banks remain unchanged; compression creates travel allowance rather than guaranteeing that a Player completes all work within one Day. The report is deterministic authoring evidence, separate from actual packaged-client movement, camera and visual acceptance.

`RoomRulesTest` checks the Java/Unity publication, coordinate metadata, Seats, a real library doorway and indexed collision against native geometry. `MafiaGameTest` exercises map selection/pinning, refused and accepted moves, corrections, recovery and Day Seat resets through the WebSocket boundary. Its campus doorway scenario observes real per-connection field and chat deliveries, unlimited Vision in each area and unseen Ghost positions. These tests do not substitute for two packaged Unity clients crossing doors.

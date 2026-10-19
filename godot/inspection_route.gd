extends Node
## Drive the running scene through ordinary keyboard, wheel and mouse-movement
## events and public CSV.
## Headless event replay is explicitly labelled; it is not OS input or visual QA.
## Destinations and bounds come from the town layout definition, not the running scene.
## The camera is north-up, so W walks north, S south, D east and A west.

const TownLayout = preload("res://town_layout.gd")
const LANDMARKS := TownLayout.LANDMARKS
# Specified values: a figure keeps its 0.3 m radius inside the map, and the
# footprint image covers the whole map at 31.25 mm per texel. The ground is one
# flat level; contact stays within today's 2 mm bound.
const FIGURE_RADIUS_M := 0.3
const FOOTPRINT_TEXEL_M := 0.03125
const CONTACT_BOUND_M := 0.002
# The detail region follows the camera focus with its edges on the 0.8 m coarse
# grid, and blends into the coarse surface over a 1.6 m border on every side. It
# has two parts meeting at a seam: a near part, where every footstep of the
# controlled figure lands (a boot lands within 0.65 m of its centre), and a far part
# north of it, up the view. Bootprints are crisp, in full detail, wherever the
# oblique view shows snow within 20 m of the figure without lean, and along the
# bottom of the view at any lean.
# One footstep touches at most 2 × 2 tiles of the Footprint picture's GPU copy.
const COARSE_STEP_M := 0.8
const DETAIL_BORDER_M := 1.6
const STEP_REACH_M := 0.65
const CRISP_REACH_M := 20.0
# The 20 m outline is checked along this many rays; between two of them the circle
# bulges out by at most CRISP_SAG_M, allowed for.
const CRISP_RAYS := 48
const CRISP_SAG_M := 0.05
const MAX_TILES_PER_STEP := 4
# Running is full at or below 10 cm of loose snow and falls to walking at 40 cm.
const FULL_RUN_DEPTH_M := 0.10
const WALK_ONLY_DEPTH_M := 0.40
# Walking matches the owner's walk recording (1.06 m/s); running is unchanged.
# The parka lays a print every WALK_STEP_M of walking (its gait.json).
const WALK_MPS := 1.06
const WALK_STEP_M := 0.6202
const RUN_MPS := 4.5
# The specified camera: perspective, 40° field of view, −40° pitch, north up. The
# 1.7 m figure stands about a twelfth of the screen tall by default, and the wheel's
# play range runs from about an eighth to a sixteenth. Shares are measured on screen
# without lean, so they hold within FRAMING_TOLERANCE of their specified value
# wherever the figure's place below centre puts it.
const CAMERA_FOV_DEG := 40.0
const CAMERA_PITCH_DEG := -40.0
const PLAY_SHARE := 1.0 / 12.0
const CLOSEST_SHARE := 1.0 / 8.0
const WIDEST_SHARE := 1.0 / 16.0
const FRAMING_TOLERANCE := 0.08
# The lean toward the cursor is at most 3 m at the closest play distance and grows
# with zoom to at most 8 m at the widest, so a Player zoomed out can look further ahead.
const CLOSEST_LEAN_M := 3.0
const WIDEST_LEAN_M := 8.0
# The cursor point the lean stages use: the view's north-east corner, far enough
# from the figure at every play distance for the lean to reach its limit; and its
# south-east corner, nearer the figure, which leans the view south toward the camera.
const TOP_CORNER := Vector2(0.48, -0.48)
const BOTTOM_CORNER := Vector2(0.45, 0.45)
# The camera frames the untouched snow under the boots and takes a fifth of the
# sink below it, eased, so a footfall settles the view instead of jolting it.
const CAMERA_SINK_SHARE := 0.2
const STEADY_STAGES := ["north-west walk", "south-east return", "run into open snow",
	"run through deep snow", "pack trail again", "run along the south-west Road"]
# Walking, the upper body turns no more than 110° from travel, and Facing turns no
# faster than 540° per second: 9° in each 60 Hz physics observation. Standing, the
# legs pivot once the twist passes 60°.
const WALKING_TWIST_DEG := 110.0
const TURN_PER_OBSERVATION_DEG := 540.0 / 60.0
const STANDING_TWIST_DEG := 60.0
# Wind: prints fill in about 120 wind-seconds in the open and up to four times
# slower in shelter; Snowdrifts reach about 1.2 m and scour stops at 3 cm. The
# prevailing wind blows from the north-west, and four turns of 45° reverse it.
const OPEN_FILL_S := 120.0
const SHELTERED_FILL_S := 480.0
const DRIFT_MAX_M := 1.2
const SCOUR_FLOOR_M := 0.03
const PREVAILING_FROM_DEG := 315.0
const REVERSED_FROM_DEG := 135.0
# The trail the route probes is this long, walked along the south-west Road from
# its Town Square corner.
const TRAIL_M := 4.5
# Coming back along the Road, the route walks this last stretch onto the probe
# point, so its latest print lies within a walking step of it.
const ROAD_WALK_M := 1.5
# The corner tree's Snowdrift raises the Road's Shallow Snow by at least this much.
const ROAD_DRIFT_M := 0.3
# Packing a lane of Deep Snow lets running there beat its fresh walking pace by this much.
const PACKED_GAIN_MPS := 0.5
# Probes in the order the route places them with F5.
const TRAIL_PROBE := 1
const ROAD_PROBE := 2
const TRACK_PROBE := 3
const EXPOSED_PROBE := 4
const SHELTERED_PROBE := 5
const WINDWARD_PROBE := 6
const LEE_PROBE := 7
# The stages that walk a figure into a Camp building on purpose. Anywhere else an
# obstacle holding a figure means the route or the loop met a building it should
# have passed.
const BUILDING_STAGES := ["small shed approach", "small shed blocked", "lodge approach", "lodge blocked"]
# Warm lamps hang on doors and windows: outside a Camp building, within this
# distance of its face and between these heights above the ground.
const LAMP_FACE_M := 0.5
const LAMP_HEIGHTS_M := Vector2(1.5, 3.0)
const LAMP_COUNT := 8
# Open snow away from the Town Square starts at least OPEN_DEPTH_M deep, too deep
# to run through at full speed. A runner's own fresh prints pack part of the snow
# it reads, so running there is held at least OPEN_RUN_SLOWDOWN below full speed.
const OPEN_DEPTH_M := 0.24
const OPEN_RUN_SLOWDOWN := 0.3
# A tree cluster's Deep Snow starts at least DEEP_DEPTH_M deep: even with a
# runner's own fresh prints counted, too deep for anything faster than walking.
const DEEP_DEPTH_M := 0.55
# The walking figure's trail counts as laid while the controlled figure was
# elsewhere when they stood at least this far apart. A figure further than
# NEAR_PROBE_M from a probe cannot press a boot onto it.
const ELSEWHERE_M := 15.0
const NEAR_PROBE_M := 1.5
# A figure stands at the mean height of its two boots' snow surfaces, which never
# lie below the flat ground nor above the deepest Snowdrift. A figure sinking
# through the ground, or rising above that snow onto a roof, is caught.
const BELOW_GROUND_M := 0.0005
const ABOVE_SNOW_M := 0.01
# Cursor points around the figure, as screen offsets in viewport heights and the
# compass bearing each shows on a north-up view.
const SWEEP := [
	[Vector2(0, -0.2), 0.0], [Vector2(0.2, -0.2), 45.0], [Vector2(0.2, 0), 90.0], [Vector2(0.2, 0.2), 135.0],
	[Vector2(0, 0.2), 180.0], [Vector2(-0.2, 0.2), 225.0], [Vector2(-0.2, 0), 270.0], [Vector2(-0.2, -0.2), 315.0],
]
# Cursor points for a figure walking north, as screen offsets and how long each is
# held: east, south-east, directly behind, south-west, west, then behind again.
const BEHIND_SWEEP := [
	[Vector2(0.25, 0), 0.4], [Vector2(0.2, 0.2), 0.4], [Vector2(0, 0.25), 0.5],
	[Vector2(-0.2, 0.2), 0.4], [Vector2(-0.25, 0), 0.8], [Vector2(0, 0.25), 0.4],
]

var failures: Array[String] = []
var stages := {}
var arrivals: Array[Dictionary] = []
var checkpoint := 0
var route_path := ""
var headless := false
# Where the controlled figure stands on screen with no lean, as viewport fractions.
var figure_screen := Vector2(0.5, 0.5)
# The cursor's latest position in window coordinates; wheel events happen there.
var cursor_window := Vector2.ZERO
# The recorded point of the walking figure's trail that the route tracked.
var laid_trail := {}
# Footprints of the Camp's buildings and the placeholder trees, from the town layout.
var obstacle_boxes := TownLayout.solid_boxes()


func _ready() -> void:
	_run.call_deferred()


func _run() -> void:
	headless = DisplayServer.get_name() == "headless"
	if headless and not OS.get_cmdline_user_args().has("--headless-scene-check"):
		push_error("Headless replay requires the explicit --headless-scene-check flag")
		get_tree().quit(2)
		return
	if headless:
		print("HEADLESS ENGINE-EVENT REPLAY: no rendered view, native focus or OS keyboard evidence.")
	elif not OS.get_cmdline_user_args().has("--auto-start"):
		print("Press F7 in the scene to start the graphical snow route; keep its window focused.")
		while not Input.is_physical_key_pressed(KEY_F7):
			await get_tree().process_frame
	await _wait(0.2)
	_tap(KEY_MINUS) # Default wind 1 -> 0, so persistent trails and drifts hold until the wind stage.
	_tap(KEY_F8)
	await _wait(0.1)
	route_path = _latest_record()
	if route_path.is_empty():
		failures.append("No public route CSV was opened")
		_finish()
		return

	await _settle_cursor()
	await _leg([], 0.5, "initial idle")
	await _framing_capture()
	var idle_row: Dictionary = _read_rows().back()
	figure_screen = Vector2(float(idle_row.figure_screen_x), float(idle_row.figure_screen_y))
	# Facing follows the cursor round the standing figure without a step.
	await _sweep_cursor("turn in place")
	# The camera leans toward a cursor in the corner of the view, but no further than
	# the default play distance allows.
	await _cursor_leg(TOP_CORNER, [], 1.5, "lean to corner")
	# A cursor resting on the figure gives no Facing and no lean, so the camera centres it again.
	await _cursor_leg(Vector2.ZERO, [], 1.5, "cursor on figure")
	await _short_steps()
	# Both figures start in the Town Square's Shallow Snow, either side of the centre.
	# Legs that walk are given as a distance over WALK_MPS, so each footstep lands
	# where it did at any pace.
	await _leg([KEY_W, KEY_A], 4.5 / WALK_MPS, "north-west walk")
	await _leg([KEY_S, KEY_D], 4.5 / WALK_MPS, "south-east return")
	# Facing east, the figure still walks north and back, at walking speed, with its prints.
	await _cursor_leg(Vector2(0.3, 0), [KEY_W], 4.5 / WALK_MPS, "walk north facing east")
	await _cursor_leg(Vector2(0.3, 0), [KEY_S], 4.5 / WALK_MPS, "walk south facing east")
	await _cursor_leg(Vector2.ZERO, [], 1.5, "cursor back on figure")
	# Running west at full speed across the Town Square's Shallow Snow, then held
	# back in the deeper open snow beyond it, between the Camp's western buildings.
	await _leg([KEY_A, KEY_SHIFT], 6.0, "run into open snow")
	# On to the lane's west end, then south beside the south-west tree cluster into
	# its Deep Snow, where running is held to walking. Repeated traffic packs a lane
	# there until it runs faster: a fresh run west, two walks, each followed by the
	# walk back over it, then a run. Each run passes the corridor 1–3 m west of the
	# lane's landmark.
	await _goto(LANDMARKS.west_lane, "reach the west lane")
	await _goto(LANDMARKS.deep_lane, "reach the deep lane")
	await _leg([KEY_A, KEY_SHIFT], 4.5 / WALK_MPS, "run through deep snow")
	await _goto(LANDMARKS.deep_lane, "pack trail return")
	await _leg([KEY_A], 4.5 / WALK_MPS, "pack trail again")
	await _goto(LANDMARKS.deep_lane, "pack trail third return")
	await _leg([KEY_A], 4.5 / WALK_MPS, "pack trail third")
	await _goto(LANDMARKS.deep_lane, "packed run start")
	await _leg([KEY_A, KEY_SHIFT], 1.5, "run on packed trail")
	# East to the south-west Road's corner of the Town Square. Walk the first stretch
	# of the Road, laying a trail, and fix a world probe on it.
	var road := TownLayout.road("south_west")
	var heading: Vector2 = TownLayout.ROADS.south_west
	await _goto(LANDMARKS.deep_lane, "leave the packed lane")
	await _goto(road[0], "reach the south-west Road")
	await _leg(_keys_toward(heading), TRAIL_M / WALK_MPS, "first trail")
	_tap(KEY_F5)
	await _leg([], 0.5, "fresh probe")
	# Run on along the Road, far out of the detail region, until the map's edge holds
	# the figure. The Road is Shallow all the way, so running keeps full speed to the
	# edge, a containment boundary with no wall, lost in the whiteout.
	var trail_end: Dictionary = await _latest_observation()
	var to_edge := _distance_to_edge(Vector2(float(trail_end.x_m), float(trail_end.z_m)), heading)
	await _leg(_keys_toward(heading) + [KEY_SHIFT], to_edge / RUN_MPS + 0.1, "run along the south-west Road")
	await _leg(_keys_toward(_edge_normal(road[1])), 1.0, "boundary blocked")
	if not headless:
		_tap(KEY_F9)
		await _wait(0.2)
	await _leg([], 0.5, "probe outside region")
	# Back along the Road, running and then walking onto the point where the
	# cluster's corner tree will drift snow over it, and fix a probe there.
	var edge_row: Dictionary = await _latest_observation()
	var back := (_road_drift_point() - Vector2(float(edge_row.x_m), float(edge_row.z_m))).dot(-heading.normalized())
	await _leg(_keys_toward(-heading) + [KEY_SHIFT], (back - ROAD_WALK_M) / RUN_MPS, "run back along the Road")
	await _leg(_keys_toward(-heading), ROAD_WALK_M / WALK_MPS, "walk onto the Road's drift point")
	_tap(KEY_F5)
	await _leg([], 0.5, "road probe")
	# North and east to the trail, and revisit its probe.
	var probe_row: Dictionary = _rows_for(_read_rows(), "fresh probe").back()
	var trail_probe := Vector2(_probe(probe_row, TRAIL_PROBE, "x_m"), _probe(probe_row, TRAIL_PROBE, "z_m"))
	await _goto(trail_probe, "return to trail")
	await _leg([], 0.5, "probe revisited")
	if not headless:
		_tap(KEY_F9)
		await _wait(0.2)
	# West, clear of the crate stacks north of the trail, to the line of the west lane.
	await _goto(Vector2(LANDMARKS.west_lane.x, trail_probe.y), "back to the west lane's line")
	# Tracking. While this figure worked the snow west of the Camp, the walking
	# figure laid a trail along its Town Square lane. The route finds a point of
	# that trail in the public record, fixes a probe there, then follows the trail
	# the way it was laid and walks back and forth over it.
	laid_trail = _laid_trail(_read_rows())
	if laid_trail.is_empty():
		failures.append("The record showed no trail laid along the Town Square lane while the controlled figure was elsewhere")
		_finish()
		return
	await _goto(laid_trail.point, "reach the walking figure's trail")
	_tap(KEY_F5)
	await _leg([], 0.5, "trail found")
	await _leg([KEY_A], 4.5 / WALK_MPS, "follow trail")
	# The probe is the controlled figure's own print, laid as it walked east onto
	# the trail. A boot lands on that print again when the figure, walking east once
	# more, has walked a whole number of strides (two walking steps) since making it;
	# where it stopped within its step and which boot made the print drop out. After
	# the 4.5 m follow west, the parka's 0.62 m steps bring the fourth eastward return
	# within about a centimetre of that, and the westward repeats add further chances.
	# Passes of different lengths left it to the step phase, which every earlier stage
	# changes. Recheck these lengths if the walking step or the approach changes.
	for pass_index in range(4):
		var seconds := 6.75 / WALK_MPS
		await _leg([KEY_D], seconds, "overlap trail return %d" % pass_index)
		await _leg([KEY_A], seconds, "overlap trail repeat %d" % pass_index)
	await _leg([], 0.5, "trail overlapped")
	# After the tracking stages, so their timing is unchanged: M opens the
	# whole-map overview from the default play distance, without lean, and the
	# figure walks on while it is open. A wheel step out does nothing there, M
	# returns to the play distance it left, and a held M's repeat does not toggle.
	await _cursor_leg(Vector2(0.3, 0), [], 1.0, "lean before overview")
	_tap(KEY_M)
	await _leg([KEY_W], 2.25 / WALK_MPS, "overview by M")
	await _leg([KEY_S], 2.25 / WALK_MPS, "overview walk back")
	await _cross_region_seam()
	_wheel(MOUSE_BUTTON_WHEEL_DOWN)
	await _leg([], 0.3, "overview wheel out")
	_tap(KEY_M)
	_repeat(KEY_M)
	await _leg([], 0.5, "overview closed by M")
	# Walking north while the cursor sweeps from east through directly behind to west,
	# the upper body stops at its limit over the east shoulder, changes to the west
	# one through the front, and on stopping with the cursor behind turns to meet it.
	await _walking_sweep("walk north sweeping behind")
	await _leg([], 1.0, "stop facing behind")
	# Facing east again before the cursor rests on the figure, as earlier stages left it.
	await _cursor_leg(Vector2(0.3, 0), [], 0.5, "face east again")
	await _cursor_leg(Vector2.ZERO, [], 1.5, "cursor on figure after sweep")
	await _wind_stages()
	# Five steps out from the closest view reach the widest end of the play range;
	# the next opens the overview.
	for step in range(5):
		_wheel(MOUSE_BUTTON_WHEEL_DOWN)
	await _leg([], 0.5, "widest play view")
	await _framing_capture()
	# Zoomed out, the camera leans its furthest toward the same corner cursor. A
	# cursor in the view's bottom corner leans it south and east, as far as the
	# nearer snow allows, putting the figure north of the focus.
	await _cursor_leg(TOP_CORNER, [], 2.0, "lean at widest")
	await _cursor_leg(BOTTOM_CORNER, [], 2.0, "lean toward the bottom at widest")
	await _cursor_leg(Vector2.ZERO, [], 1.5, "cursor on figure at widest")
	for step in range(7):
		_wheel(MOUSE_BUTTON_WHEEL_DOWN)
	await _leg([], 0.5, "whole map")
	if not headless:
		_tap(KEY_F9)
		await _wait(0.2)
	for step in range(12):
		_wheel(MOUSE_BUTTON_WHEEL_UP)
	await _leg([], 0.5, "close view")
	await _framing_capture()
	# Close in, it leans least.
	await _cursor_leg(TOP_CORNER, [], 2.0, "lean at closest")
	await _cursor_leg(Vector2.ZERO, [], 1.5, "cursor on figure at closest")
	# Tab, with the cursor west of the figure, hands control to the walking figure
	# wherever the loop has taken it; it faces west. The released figure walks back
	# to the loop from where it stands, off the loop south of it in the Town Square.
	await _cursor_leg(Vector2(-0.25, 0), [], 0.15, "cursor west before Tab")
	_tap(KEY_TAB)
	await _leg([], 0.5, "second figure idle")
	await _cursor_leg(Vector2.ZERO, [], 1.5, "cursor on second figure")
	await _leg([], 8.0, "first figure rejoins loop")
	_tap(KEY_F8)
	await get_tree().process_frame
	_check_record()
	_finish()


func _wind_stages() -> void:
	# The overview's detail region stays at the map centre, so the figure walks into
	# it across its blended border from the west. M opens it here; one wheel step in
	# still leaves it at the widest end of play.
	await _goto(LANDMARKS.overview_west, "reach overview start")
	_tap(KEY_M)
	await _leg([], 0.5, "overview before border")
	await _goto(LANDMARKS.exposed_probe, "walk into the overview region")
	_wheel(MOUSE_BUTTON_WHEEL_UP)
	await _leg([], 0.3, "overview wheel in")
	# On in to the closest end of the play range. Probes on the figure's own latest
	# prints where the north-west wind treats the snow differently, each fixed by F5
	# at the end of a leg: in the open Town Square; in the lee of the small shed,
	# which the workshop shelters in turn, so no Snowdrift builds there; against the
	# lodge's exposed west face; and in the lodge's lee, where a Snowdrift builds.
	for step in range(11):
		_wheel(MOUSE_BUTTON_WHEEL_UP)
	_tap(KEY_F5)
	# The small shed's south face stops the figure, which steps back into its lee.
	await _goto(LANDMARKS.small_shed_south, "reach the small shed")
	await _leg([KEY_W], 1.8, "small shed approach")
	await _leg([KEY_W], 1.2, "small shed blocked")
	await _leg([KEY_S], 1.0 / WALK_MPS, "step back into the shed's lee")
	_tap(KEY_F5)
	await _leg([KEY_A], 10.0 / WALK_MPS, "leave the shed's lee")
	await _goto(LANDMARKS.town_square_west, "cross the Town Square")
	await _goto(LANDMARKS.lodge_windward, "reach the lodge's windward face")
	_tap(KEY_F5)
	# The lodge's south face stops the figure, which steps back into its lee. One
	# walking step lays a print there wherever the figure was within its step, within
	# about 1.3 m of the face, where the Snowdrift builds fullest; a longer step back
	# left the print anywhere up to 1.7 m away, where the drift settles lower.
	await _goto(LANDMARKS.lodge_south, "reach the lodge's south face")
	await _leg([KEY_W], 1.9, "lodge approach")
	await _leg([KEY_W], 1.2, "lodge blocked")
	await _leg([KEY_S], WALK_STEP_M / WALK_MPS, "step back into the lodge's lee")
	_tap(KEY_F5)
	await _leg([], 0.5, "probes placed")
	# Accelerated wind fills the prints and builds the lodge's drift, then the
	# figure wades through it with Shift held.
	for step in range(16):
		_tap(KEY_EQUAL)
	await _leg([], 2.5, "wind fills prints")
	await _leg([], 16.0, "drifts build")
	if not headless:
		_tap(KEY_F9)
		await _wait(0.2)
	await _leg([KEY_A, KEY_SHIFT], 2.0, "run through drift")
	# Reversing the wind wears the lee drift away and builds one on the scoured face;
	# wind 0 then freezes everything.
	for step in range(4):
		_tap(KEY_BRACKETRIGHT)
	await _await_shaped_wind(REVERSED_FROM_DEG)
	await _leg([], 10.0, "wind turned")
	for step in range(16):
		_tap(KEY_MINUS)
	await _leg([], 2.0, "wind frozen")
	for step in range(4):
		_tap(KEY_BRACKETLEFT)
	_tap(KEY_0)


func _finish() -> void:
	for failure in failures:
		push_error(failure)
	print("SNOW SCENE ", "HEADLESS REPLAY" if headless else "GRAPHICAL ENGINE-EVENT REPLAY", ": ", "PASS" if failures.is_empty() else "FAIL", " · ", failures.size(), " failures")
	get_tree().quit(0 if failures.is_empty() else 1)


func _leg(keys: Array, seconds: float, description: String) -> void:
	checkpoint += 1
	stages[description] = checkpoint
	_tap(KEY_F4)
	await get_tree().physics_frame
	print("Snow route: ", description, " · ", seconds, " s")
	for key in keys:
		_key(key, true)
	await _wait(seconds, keys)
	for key in keys:
		_key(key, false)
	await _wait(0.05)


func _sweep_cursor(description: String) -> void:
	checkpoint += 1
	stages[description] = checkpoint
	_tap(KEY_F4)
	print("Snow route: ", description)
	for point in SWEEP:
		_point(point[0])
		await _wait(0.4)


## Walk north while the cursor visits each BEHIND_SWEEP point. A graphical run
## captures the view while the cursor is first directly behind the figure.
func _walking_sweep(description: String) -> void:
	checkpoint += 1
	stages[description] = checkpoint
	_tap(KEY_F4)
	await get_tree().physics_frame
	print("Snow route: ", description)
	_key(KEY_W, true)
	for index in range(BEHIND_SWEEP.size()):
		_point(BEHIND_SWEEP[index][0])
		if index == 2 and not headless:
			await _wait(0.3, [KEY_W])
			_tap(KEY_F9)
			await _wait(BEHIND_SWEEP[index][1] - 0.3, [KEY_W])
		else:
			await _wait(BEHIND_SWEEP[index][1], [KEY_W])
	_key(KEY_W, false)
	await _wait(0.05)


## The speed that running reaches in loose snow of this depth.
func _running_speed(loose_depth: float) -> float:
	return lerpf(WALK_MPS, RUN_MPS, 1.0 - smoothstep(FULL_RUN_DEPTH_M, WALK_ONLY_DEPTH_M, loose_depth))


## The movement keys that walk a figure along a compass direction on the north-up
## view, where W walks north (−Z) and D east (+X): one key for each axis it moves on.
func _keys_toward(direction: Vector2) -> Array:
	var keys := []
	if absf(direction.x) > 0.001:
		keys.append(KEY_D if direction.x > 0.0 else KEY_A)
	if absf(direction.y) > 0.001:
		keys.append(KEY_S if direction.y > 0.0 else KEY_W)
	return keys


## How far a figure walks from `from` along `heading` before the map's edge holds it.
func _distance_to_edge(from: Vector2, heading: Vector2) -> float:
	var direction := heading.normalized()
	var limit := TownLayout.HALF_EXTENTS - Vector2.ONE * FIGURE_RADIUS_M
	var reach := INF
	for axis in [0, 1]:
		if absf(direction[axis]) > 0.000001:
			reach = minf(reach, (limit[axis] * signf(direction[axis]) - from[axis]) / direction[axis])
	return reach


## The outward direction of the map edge on which a point lies; zero off the edge.
func _edge_normal(point: Vector2) -> Vector2:
	if absf(point.x) >= TownLayout.HALF_EXTENTS.x - 0.001:
		return Vector2(signf(point.x), 0.0)
	if absf(point.y) >= TownLayout.HALF_EXTENTS.y - 0.001:
		return Vector2(0.0, signf(point.y))
	return Vector2.ZERO


## Distance from a point to a Road's centre line.
func _off_line(point: Vector2, line: PackedVector2Array) -> float:
	return point.distance_to(Geometry2D.get_closest_point_to_segment(point, line[0], line[1]))


## The point on the south-west Road's centre line straight downwind, under the
## prevailing wind, of the placeholder tree nearest that Road: where its Snowdrift
## builds over the Road.
func _road_drift_point() -> Vector2:
	var line := TownLayout.road("south_west")
	var nearest := Vector2.INF
	for cluster in TownLayout.TREE_CLUSTERS:
		for tree in cluster.trees:
			if nearest == Vector2.INF or _off_line(tree, line) < _off_line(nearest, line):
				nearest = tree
	var travel := deg_to_rad(PREVAILING_FROM_DEG + 180.0)
	return Geometry2D.line_intersects_line(nearest, Vector2(sin(travel), -cos(travel)), line[0], line[1] - line[0])


## A real cursor already over the window when it opens leans the camera before the
## route begins. Rest the route's cursor where the record shows the figure until
## that lean has died away: each rest leaves a third of the lean, the other way.
func _settle_cursor() -> void:
	for attempt in range(6):
		var row: Dictionary = await _latest_observation()
		if row.is_empty():
			return
		figure_screen = Vector2(float(row.figure_screen_x), float(row.figure_screen_y))
		if float(row.lean_m) < 0.01:
			return
		print("Snow route: settling a %.2f m lean from a cursor already over the window" % float(row.lean_m))
		_point(Vector2.ZERO)
		await _wait(1.0)


## A turned wind's drifts and scour are shaped on a worker thread in real time,
## which an engine-event replay outruns. Stand still until the record shows the snow
## following the turned wind, so the stage after it times only what that wind does.
func _await_shaped_wind(bearing: float) -> void:
	print("Snow route: waiting for the snow to follow the wind from %.0f°" % bearing)
	for attempt in range(120):
		await _wait(0.25)
		var row: Dictionary = await _latest_observation()
		if not row.is_empty() and absf(float(row.wind_shaped_from_deg) - bearing) < 0.01:
			return


## Mark a checkpoint, which flushes the record, and read its latest completed
## observation; empty if there is none yet.
func _latest_observation() -> Dictionary:
	checkpoint += 1
	_tap(KEY_F4)
	await get_tree().process_frame
	var rows := _read_rows()
	return {} if rows.is_empty() else rows.back()


## While the overview holds the detail region still at the map centre, walk south
## across its seam, from 1.5 m north of it to 1.5 m south.
func _cross_region_seam() -> void:
	var rows := _read_rows()
	if rows.is_empty() or rows.back().overview != "true":
		failures.append("No overview observation to find the detail region's seam")
		return
	var row: Dictionary = rows.back()
	await _goto(Vector2(float(row.x_m), float(row.region_seam_z_m) - 1.5), "reach the region's seam")
	await _leg([KEY_S], 3.0 / WALK_MPS, "cross the region's seam")


func _cursor_leg(offset: Vector2, keys: Array, seconds: float, description: String) -> void:
	_point(offset)
	await _leg(keys, seconds, description)


## Move the cursor to `offset` viewport heights from where the figure stands on screen.
func _point(offset: Vector2) -> void:
	var viewport := get_viewport()
	var size := viewport.get_visible_rect().size
	var screen := figure_screen * size + offset * size.y
	var event := InputEventMouseMotion.new()
	# Input events arrive in window coordinates and the scene reads viewport ones.
	event.position = viewport.get_final_transform() * screen
	event.global_position = event.position
	cursor_window = event.position
	Input.parse_input_event(event)
	Input.flush_buffered_events()


func _short_steps() -> void:
	checkpoint += 1
	stages["short steps"] = checkpoint
	_tap(KEY_F4)
	print("Snow route: repeated brief taps must accumulate foot travel")
	for step in range(10):
		var keys := [KEY_D] if step % 2 == 0 else [KEY_A]
		for key in keys:
			_key(key, true)
		await _wait(0.025, keys)
		for key in keys:
			_key(key, false)
		await _wait(0.05)


func _wait(seconds: float, held_keys: Array = []) -> void:
	var elapsed := 0.0
	var unfocused_seconds := 0.0
	var was_focused := true
	while elapsed < seconds:
		await get_tree().physics_frame
		var delta := get_physics_process_delta_time()
		if headless or get_window().has_focus():
			if not was_focused:
				for key in held_keys:
					_key(key, true)
			elapsed += delta
			was_focused = true
		else:
			if was_focused:
				print("Route paused: restore scene focus to continue")
			was_focused = false
			unfocused_seconds += delta
			if unfocused_seconds > 60.0:
				push_error("Scene remained unfocused for 60 seconds")
				get_tree().quit(1)
				return


func _goto(destination: Vector2, description: String) -> void:
	# Navigation uses the completed scene observation, not an addressed walker.
	# It walks one straight leg north or south, then one east or west, at ordinary walk speed;
	# the layout keeps open ground between each pair of places it joins.
	var x := destination.x
	var z := destination.y
	var row: Dictionary = await _latest_observation()
	if row.is_empty():
		failures.append("No observation available to navigate to " + description)
		return
	var dz := z - float(row.z_m)
	if absf(dz) > 0.02:
		await _leg([KEY_S] if dz > 0 else [KEY_W], absf(dz) / WALK_MPS, description + " z")
		arrivals.append({"stage": description + " z", "destination": destination})
	var dx := x - float(row.x_m)
	if absf(dx) > 0.02:
		await _leg([KEY_D] if dx > 0 else [KEY_A], absf(dx) / WALK_MPS, description + " x")
		arrivals.append({"stage": description + " x", "destination": destination})


func _key(code: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)
	# Multiple physics ticks can share one rendered frame. Flush injected
	# key transitions so brief presses are actually visible to scene input.
	Input.flush_buffered_events()


func _tap(code: Key) -> void:
	_key(code, true)
	_key(code, false)


## A held key's repeat, which must not act as a fresh press.
func _repeat(code: Key) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = true
	event.echo = true
	Input.parse_input_event(event)
	Input.flush_buffered_events()
	_key(code, false)


## In a rendered window, capture the view without the inspection overlay, so the
## framing can be compared with the owner's reference frames.
func _framing_capture() -> void:
	if headless:
		return
	_tap(KEY_F1)
	await _wait(0.1)
	_tap(KEY_F9)
	await _wait(0.2)
	_tap(KEY_F1)
	await _wait(0.1)


func _wheel(button: MouseButton) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = button
	event.position = cursor_window
	event.global_position = cursor_window
	event.pressed = true
	Input.parse_input_event(event)
	var released := event.duplicate()
	released.pressed = false
	Input.parse_input_event(released)
	Input.flush_buffered_events()


func _latest_record() -> String:
	var latest := ""
	for file in DirAccess.get_files_at("user://"):
		if file.begins_with("route-") and file.ends_with(".csv") and file > latest:
			latest = file
	return "user://" + latest if not latest.is_empty() else ""


func _read_rows() -> Array[Dictionary]:
	var rows: Array[Dictionary] = []
	var file := FileAccess.open(route_path, FileAccess.READ)
	if not file:
		return rows
	var header := file.get_csv_line()
	while not file.eof_reached():
		var values := file.get_csv_line()
		if values.size() != header.size():
			continue
		var row := {}
		for index in range(header.size()):
			row[header[index]] = values[index]
		rows.append(row)
	return rows


func _rows_for(rows: Array[Dictionary], stage: String) -> Array[Dictionary]:
	var selected: Array[Dictionary] = []
	for row in rows:
		if int(row.checkpoint) == int(stages[stage]):
			selected.append(row)
	return selected


func _check_record() -> void:
	print("Checking public scene observations: ", ProjectSettings.globalize_path(route_path))
	var rows := _read_rows()
	if rows.is_empty():
		failures.append("No complete public observations were recorded")
		return
	var straight := 0
	var diagonal := 0
	var fast_run := 0
	var slow_run := 0
	var blocked := 0
	var follow := 0
	var overview := 0
	var previous := {}
	var figure_ids := {}
	var bounds := TownLayout.HALF_EXTENTS - Vector2.ONE * FIGURE_RADIUS_M
	var previous_upload := {}
	var ground := float(rows.front().ground_y_m)
	var image_texels := Vector2i((TownLayout.HALF_EXTENTS * 2.0 / FOOTPRINT_TEXEL_M).round())
	var play_range := _play_range(rows)
	var region_offset := Vector2.INF
	var building_checkpoints := {}
	for stage in BUILDING_STAGES:
		building_checkpoints[int(stages.get(stage, -1))] = true
	for row in rows:
		var input := Vector2(float(row.input_x), float(row.input_y))
		var speed := float(row.horizontal_mps)
		var obstruction: bool = row.boundary_limited == "true" or row.obstacle_limited == "true"
		figure_ids[row.figure_id] = true
		if absf(float(row.x_m)) > bounds.x + 0.001 or absf(float(row.z_m)) > bounds.y + 0.001:
			_fail_once("Figure escaped the map rectangle")
		if row.grounded != "true" or absf(float(row.contact_gap_m)) > CONTACT_BOUND_M:
			_fail_once("Figure lost its observed snow contact")
		var above_ground := float(row.feet_y_m) - float(row.ground_y_m)
		if above_ground > DRIFT_MAX_M + ABOVE_SNOW_M or above_ground < -BELOW_GROUND_M:
			_fail_once("Figure rose above the deepest snow onto a roof, or sank below the ground")
		# Every Camp building is a solid box on the one flat ground level: neither
		# figure ever stands within its footprint, where its roof is.
		if absf(float(row.ground_y_m) - ground) > 0.000001 or absf(float(row.other_ground_y_m) - ground) > 0.000001:
			_fail_once("The ground under the figures was not one flat level")
		if _in_obstacle(Vector2(float(row.x_m), float(row.z_m))) or _in_obstacle(_other(row)):
			_fail_once("A figure stood inside or on top of a Camp building or placeholder tree")
		if row.obstacle_limited == "true" and not building_checkpoints.has(int(row.checkpoint)):
			_fail_once("An obstacle held the controlled figure outside the stages that walk into a building")
		if row.other_obstacle_limited == "true":
			_fail_once("An obstacle held the walking figure on its loop")
		if row.camera_projection != "perspective" or absf(float(row.camera_fov_deg) - CAMERA_FOV_DEG) > 0.01:
			_fail_once("Camera is not a 40° perspective view")
		if absf(float(row.pitch_deg) - CAMERA_PITCH_DEG) > 0.01 or absf(float(row.yaw_deg)) > 0.01:
			_fail_once("Camera tilted or turned away from north-up")
		if float(row.lean_m) > WIDEST_LEAN_M + 0.0001 or (play_range != Vector2.ZERO and row.overview == "false"
				and float(row.camera_distance_m) < play_range.x + 0.001 and float(row.lean_m) > CLOSEST_LEAN_M + 0.0001):
			_fail_once("Camera leaned further than 8 m, or further than 3 m at the closest play distance")
		if row.overview == "true":
			if row.whole_map_visible != "true":
				_fail_once("The overview did not frame the town")
		elif float(row.lean_m) < 0.05 and not _framed_between(row, WIDEST_SHARE, CLOSEST_SHARE):
			_fail_once("Play zoom left the figure outside an eighth to a sixteenth of the screen's height")
		var size := _region_size(row)
		if size.distance_to(_region_size(rows.front())) > 0.001:
			_fail_once("The detail region changed size")
		# Its edges and the line between its parts lie on coarse vertices, so both
		# parts' grids stay world-aligned wherever it moves.
		var corner := (_region(row) - size * 0.5 + TownLayout.HALF_EXTENTS) / COARSE_STEP_M
		var seam := (float(row.region_seam_z_m) + TownLayout.HALF_EXTENTS.y) / COARSE_STEP_M
		if corner.distance_to(corner.round()) > 0.001 or absf(seam - roundf(seam)) > 0.001:
			_fail_once("The detail region's edges or parts were not snapped to the coarse grid")
		if row.overview == "false":
			_check_sharp_view(row)
			# It keeps its place relative to the camera focus, give or take a coarse cell's snap.
			var offset := _region(row) - Vector2(float(row.focus_x_m), float(row.focus_z_m))
			if region_offset == Vector2.INF:
				region_offset = offset
			elif maxf(absf(offset.x - region_offset.x), absf(offset.y - region_offset.y)) > COARSE_STEP_M + 0.001:
				_fail_once("The detail region did not keep its place relative to the camera focus")
		if not previous_upload.is_empty():
			var sent := int(row.upload_total_bytes) - int(previous_upload.upload_total_bytes)
			var steps := int(row.uploaded_steps) - int(previous_upload.uploaded_steps)
			if sent < 0 or steps < 0 or sent % int(row.footprint_tile_bytes) != 0 or sent > steps * MAX_TILES_PER_STEP * int(row.footprint_tile_bytes):
				_fail_once("Footprint uploads exceeded the tiles their footsteps touched")
		if int(row.uploaded_steps) > int(row.footprint_count) or int(row.upload_bytes) >= int(row.footprint_image_bytes):
			_fail_once("The Footprint picture was resent beyond its footsteps' tiles")
		previous_upload = row
		var image_size := Vector2i(int(row.footprint_image_width), int(row.footprint_image_height))
		if image_size != image_texels or int(row.footprint_image_bytes) != image_texels.x * image_texels.y * 4:
			_fail_once("Footprint image dimensions or allocation changed during traversal")
		if float(row.foot_compaction) < -0.001 or float(row.foot_compaction) > 1.001:
			_fail_once("Snow compaction escaped its bounded range")
		for slot in range(1, int(row.probe_count) + 1):
			var compaction := _probe(row, slot, "compaction")
			var depth := _probe(row, slot, "depth_m")
			if compaction < -0.001 or compaction > 1.001:
				_fail_once("Probe compaction escaped its bounded range")
			if depth < SCOUR_FLOOR_M - 0.0005 or depth > DRIFT_MAX_M + 0.005:
				_fail_once("Snow Depth left the 3 cm scour floor to 1.2 m drift range")
		if speed > 4.502:
			_fail_once("Diagonal or running input exceeded the 4.5 m/s cap")
		if input.length() > 0.5 and not obstruction:
			if row.run_requested == "false":
				if absf(speed - WALK_MPS) > 0.003:
					_fail_once("Unobstructed ordinary walking did not stay at %.2f m/s" % WALK_MPS)
				if absf(input.x) > 0.1 and absf(input.y) > 0.1:
					diagonal += 1
				else:
					straight += 1
			else:
				var expected_speed := _running_speed(float(row.loose_depth_m))
				if absf(speed - expected_speed) > 0.003:
					_fail_once("Running speed did not follow observed loose snow depth")
				if speed > 3.0:
					fast_run += 1
				if float(row.loose_depth_m) > FULL_RUN_DEPTH_M + 0.05 and speed < RUN_MPS - OPEN_RUN_SLOWDOWN:
					slow_run += 1
		if obstruction and speed < 0.01:
			blocked += 1
		if row.overview == "true" and row.whole_map_visible == "true":
			overview += 1
		# Without lean the figure stands on the vertical centre line, slightly below the middle.
		if row.overview == "false" and float(row.lean_m) < 0.05:
			if absf(float(row.figure_screen_x) - 0.5) < 0.005 and float(row.figure_screen_y) > 0.52 and float(row.figure_screen_y) < 0.65:
				follow += 1
			else:
				_fail_once("The camera did not hold the figure slightly below the centre of the screen")
		if not previous.is_empty() and previous.figure_id == row.figure_id:
			if input.length() < 0.01 and previous.input_x == row.input_x and previous.input_y == row.input_y and row.step_count != previous.step_count:
				_fail_once("An idle figure created a footprint")
			if previous.horizontal_mps == "0.0" and speed < 0.0001 and row.step_count != previous.step_count:
				_fail_once("A stationary or blocked figure created a footprint")
		previous = row
	if straight < 60 or diagonal < 60 or blocked < 30 or overview < 10 or follow < 1000 or figure_ids.size() != 2:
		failures.append("Missing route coverage: straight=%d diagonal=%d blocked=%d overview=%d follow=%d figures=%d" % [straight, diagonal, blocked, overview, follow, figure_ids.size()])
	if fast_run < 15 or slow_run < 15:
		failures.append("Route did not demonstrate full running in Shallow Snow and held-back running in open snow (fast=%d, slow=%d)" % [fast_run, slow_run])
	# The edge the south-west Road meets holds the figure at the map rectangle, less its radius.
	var edge := _edge_normal(TownLayout.road("south_west")[1])
	var boundary_rows := _rows_for(rows, "boundary blocked")
	var held_boundary := 0
	for row in boundary_rows:
		var held := Vector2(float(row.x_m), float(row.z_m)) * edge.abs()
		if row.boundary_limited == "true" and float(row.horizontal_mps) < 0.01 and held.distance_to(bounds * edge) < 0.001:
			held_boundary += 1
	if held_boundary < 30:
		failures.append("Route did not reach and stop at the map boundary")
	var short_steps := _rows_for(rows, "short steps")
	if short_steps.is_empty() or int(short_steps.back().step_count) <= int(short_steps.front().step_count):
		failures.append("Repeated brief taps lost accumulated footsteps")
	_check_held_by_building(rows, "small shed blocked", "small_shed")
	_check_held_by_building(rows, "lodge blocked", "lodge")
	_check_lamps()
	_check_start(rows)
	_check_arrivals(rows)
	_check_probe(rows)
	_check_walking_figure(rows)
	_check_tracking(rows)
	_check_rejoin(rows)
	_check_deep_lane(rows)
	_check_camera_steadiness(rows)
	_check_snow_zones(rows)
	_check_roads()
	_check_road_run(rows)
	_check_facing(rows)
	_check_lean(rows)
	_check_walking_facing(rows)
	_check_overview_key(rows)
	_check_wind(rows)
	_check_zoom(rows)
	_check_detail_region(rows)
	_check_uploads(rows)
	print("Coverage: %d observations; straight %d, diagonal %d, fast run %d, slow run %d, blocked %d, overview %d, camera follow %d" % [rows.size(), straight, diagonal, fast_run, slow_run, blocked, overview, follow])


func _check_start(rows: Array[Dictionary]) -> void:
	# Both figures begin a fresh launch either side of the map's centre, in the Town
	# Square's Shallow Snow among the Camp's buildings. The walking figure has set
	# off already, but no further than it has walked.
	var idle := _rows_for(rows, "initial idle")
	if idle.is_empty():
		failures.append("Initial idle observations were missing")
		return
	var row: Dictionary = idle.front()
	var controlled := Vector2(float(row.x_m), float(row.z_m))
	var other := _other(row)
	if controlled.distance_to(LANDMARKS.start_west) > 0.001 or other.distance_to(LANDMARKS.start_east) > float(row.other_travel_m) + 0.001:
		failures.append("The figures did not start at their landmarks either side of the centre")
	if controlled.length() > 2.0 or float(row.saved_depth_m) > FULL_RUN_DEPTH_M:
		failures.append("The controlled figure did not start at the centre in Shallow Snow")
	for start in [LANDMARKS.start_west, LANDMARKS.start_east]:
		if not TownLayout.TOWN_SQUARE.has_point(start):
			failures.append("A figure's start %s lies outside the Town Square" % start)


## The stage walks the controlled figure into a building's face: the building holds
## it still there, touching that face with its 0.3 m radius, for at least half a second.
func _check_held_by_building(rows: Array[Dictionary], stage: String, name: String) -> void:
	var building := {}
	for candidate in TownLayout.CAMP:
		if candidate.name == name:
			building = candidate
	if building.is_empty():
		failures.append("The town layout has no Camp building named %s" % name)
		return
	var held := 0
	for row in _rows_for(rows, stage):
		var figure := Vector2(float(row.x_m), float(row.z_m))
		if row.obstacle_limited == "true" and row.boundary_limited == "false" and float(row.horizontal_mps) < 0.01 \
				and absf(_box_gap(figure, building) - FIGURE_RADIUS_M) < 0.01:
			held += 1
	print("The %s held the figure still against its face for %d observations" % [name.replace("_", " "), held])
	if held < 30:
		failures.append("Route did not walk into the %s and stop at its face (%d held observations)" % [name.replace("_", " "), held])


## Whether a figure's 0.3 m radius at this point would overlap the footprint of a
## Camp building or a placeholder tree.
func _in_obstacle(point: Vector2) -> bool:
	for box in obstacle_boxes:
		if _box_gap(point, box) < FIGURE_RADIUS_M - 0.001:
			return true
	return false


## Distance from a point to the footprint of a box, a Camp building or a placeholder
## tree; zero inside it.
func _box_gap(point: Vector2, box: Dictionary) -> float:
	var offset: Vector2 = (point - box.center).abs() - box.size * 0.5
	return Vector2(maxf(offset.x, 0.0), maxf(offset.y, 0.0)).length()


func _check_lamps() -> void:
	# Eight warm lamps, the Compatibility renderer's lights per object, so every one
	# reaches the snow. Each hangs on a Camp building's door or window: outside its
	# footprint, against one of its faces and below its roof.
	if TownLayout.WARM_LIGHTS.size() != LAMP_COUNT:
		failures.append("The Camp has %d warm lamps, not %d" % [TownLayout.WARM_LIGHTS.size(), LAMP_COUNT])
	for name in TownLayout.WARM_LIGHTS:
		var spot: Vector3 = TownLayout.WARM_LIGHTS[name]
		var on_face := false
		for building in TownLayout.CAMP:
			var gap := _box_gap(Vector2(spot.x, spot.z), building)
			if gap > 0.0 and gap <= LAMP_FACE_M and spot.y >= LAMP_HEIGHTS_M.x and spot.y <= minf(LAMP_HEIGHTS_M.y, building.height):
				on_face = true
		if not on_face:
			failures.append("Warm lamp %s does not hang on a Camp building's door or window" % name)


func _check_arrivals(rows: Array[Dictionary]) -> void:
	# Every navigation leg must end at its destination; a leg that met an
	# obstacle would leave the route checking the wrong part of the town.
	for arrival in arrivals:
		var leg := _rows_for(rows, arrival.stage)
		if leg.is_empty():
			failures.append("Navigation stage %s was missing" % arrival.stage)
			continue
		var destination: Vector2 = arrival.destination
		var reached := Vector2(float(leg.back().x_m), float(leg.back().z_m))
		var axis := 1 if String(arrival.stage).ends_with(" z") else 0
		if absf(reached[axis] - destination[axis]) > 0.1:
			failures.append("Navigation %s ended at %s instead of %s" % [arrival.stage, reached, destination])


func _check_probe(rows: Array[Dictionary]) -> void:
	var fresh := _rows_for(rows, "fresh probe")
	var outside := _rows_for(rows, "probe outside region")
	var revisited := _rows_for(rows, "probe revisited")
	if fresh.is_empty() or outside.is_empty() or revisited.is_empty():
		failures.append("Trail probe route stages were missing")
		return
	var original: Dictionary = fresh.back()
	var baseline := _probe(original, TRAIL_PROBE, "compaction")
	if int(original.probe_count) != 1 or baseline < 0.01:
		failures.append("A moving boot did not leave a measurable footprint at the world probe")
	for row in outside:
		if row.probe1_in_region != "false" or absf(_probe(row, TRAIL_PROBE, "compaction") - baseline) > 0.001:
			_fail_once("Leaving the detail region erased or moved a world footprint")
	var returned: Dictionary = revisited.back()
	if returned.probe1_in_region != "true" or _probe(returned, TRAIL_PROBE, "compaction") + 0.001 < baseline:
		failures.append("The original footprint was not retained on revisiting its world position")


## The recorded point of the walking figure's Town Square lane nearest the lane's
## middle, laid while the controlled figure stood at least ELSEWHERE_M away.
func _laid_trail(rows: Array[Dictionary]) -> Dictionary:
	var east: Vector2 = LANDMARKS.loop_north
	var west: Vector2 = LANDMARKS.loop_lane_west
	var middle := (east + west) * 0.5
	var best := {}
	for row in rows:
		var other := _other(row)
		var controlled := Vector2(float(row.x_m), float(row.z_m))
		# Keep clear of the lane's corners, where the trail turns.
		if absf(other.y - east.y) > 0.01 or other.x > east.x - 2.0 or other.x < west.x + 2.0:
			continue
		if controlled.distance_to(other) < ELSEWHERE_M or row.other_rejoining == "true":
			continue
		if best.is_empty() or absf(other.x - middle.x) < absf(best.point.x - middle.x):
			best = {"point": other, "elapsed_ms": int(row.elapsed_ms), "apart_m": controlled.distance_to(other)}
	return best


func _check_walking_figure(rows: Array[Dictionary]) -> void:
	# The figure you are not controlling walks the loop from launch: it stays on the
	# loop, never goes backwards along it, runs at full speed in the Town Square's
	# Shallow Snow and is held back in the open snow beyond it, faces the way it
	# goes and keeps snow contact. The final Tab stage checks how a released figure
	# rejoins.
	var bounds := TownLayout.HALF_EXTENTS - Vector2.ONE * FIGURE_RADIUS_M
	var square := TownLayout.TOWN_SQUARE
	var moving := 0
	var matched := 0
	var running := 0
	var held_back := 0
	var in_square := 0
	var in_open := 0
	var previous := {}
	var steps := {}
	for row in rows:
		var other := _other(row)
		var speed := float(row.other_mps)
		var loose := float(row.other_loose_depth_m)
		if absf(other.x) > bounds.x + 0.001 or absf(other.y) > bounds.y + 0.001:
			_fail_once("The walking figure escaped the map rectangle")
		if row.other_grounded != "true" or absf(float(row.other_contact_gap_m)) > CONTACT_BOUND_M:
			_fail_once("The walking figure entered an obstacle or lost its snow contact")
		var above_ground := float(row.other_feet_y_m) - float(row.other_ground_y_m)
		if above_ground > 1.3 or above_ground < -BELOW_GROUND_M:
			_fail_once("The walking figure rose 1.3 m above the snow or sank below the ground")
		if row.other_rejoining == "false" and _loop_distance(other) > 0.01:
			_fail_once("The walking figure left its loop")
		# Footsteps laid by each figure while it walked the loop.
		var span: Vector2i = steps.get(row.other_figure_id, Vector2i(int(row.other_steps), int(row.other_steps)))
		steps[row.other_figure_id] = Vector2i(mini(span.x, int(row.other_steps)), maxi(span.y, int(row.other_steps)))
		if not previous.is_empty() and previous.other_figure_id == row.other_figure_id:
			var walked := float(row.other_travel_m) - float(previous.other_travel_m)
			if walked < -0.000001:
				_fail_once("The walking figure's travel went backwards")
			if row.other_rejoining == "false" and previous.other_rejoining == "false":
				if wrapf(float(row.other_loop_progress) - float(previous.other_loop_progress), -0.5, 0.5) < -0.00001:
					_fail_once("The walking figure went backwards around its loop")
				if walked < 0.0001:
					_fail_once("The walking figure stood still on its loop")
		if speed > 0.01:
			moving += 1
			if row.other_run_requested != "true":
				_fail_once("The walking figure did not request running")
			var expected := _running_speed(loose)
			# A frame that ends on a loop corner stops there, so it may be shorter.
			if absf(speed - expected) <= 0.003:
				matched += 1
			elif speed > expected + 0.003:
				_fail_once("The walking figure exceeded the speed its snow allows")
			if loose <= FULL_RUN_DEPTH_M and speed >= RUN_MPS - 0.003:
				running += 1
			if loose > FULL_RUN_DEPTH_M + 0.05 and speed < RUN_MPS - OPEN_RUN_SLOWDOWN:
				held_back += 1
			if _angle_between(float(row.other_facing_deg), float(row.other_travel_deg)) > 0.5:
				_fail_once("The walking figure did not face its direction of travel")
		if square.has_point(other):
			in_square += 1
		elif square.grow(TownLayout.ZONE_BLEND).has_point(other) == false:
			in_open += 1
		previous = row
	var laid: Vector2i = steps.get(rows.front().other_figure_id, Vector2i.ZERO)
	print("Walking figure: %d moving observations, %d at the speed its snow allows, %d running in Shallow Snow, %d held back in open snow, %d in the Town Square, %d beyond it" % [
		moving, matched, running, held_back, in_square, in_open])
	if moving < 1000 or matched < moving * 0.98:
		failures.append("The walking figure did not keep walking at the speed its snow allows (%d of %d)" % [matched, moving])
	if running < 60 or held_back < 60:
		failures.append("The walking figure did not run in Shallow Snow and slow in open snow (running %d, held back %d)" % [running, held_back])
	if in_square < 60 or in_open < 60:
		failures.append("The walking figure's loop did not cross from the Town Square into open snow (square %d, open %d)" % [in_square, in_open])
	if laid.y - laid.x < 100:
		failures.append("The walking figure laid too few footsteps (%d)" % (laid.y - laid.x))


func _check_tracking(rows: Array[Dictionary]) -> void:
	# The probe the route fixed on the walking figure's trail: laid while the
	# controlled figure was elsewhere, retained until it was found, compacted
	# further by following and overlapping it, then filled by the wind.
	var found := _rows_for(rows, "trail found")
	var followed := _rows_for(rows, "follow trail")
	var overlapped := _rows_for(rows, "trail overlapped")
	if laid_trail.is_empty() or found.is_empty() or followed.is_empty() or overlapped.is_empty():
		failures.append("Tracking route stages were missing")
		return
	var row: Dictionary = found.back()
	var probe := Vector2(_probe(row, TRACK_PROBE, "x_m"), _probe(row, TRACK_PROBE, "z_m"))
	var lane: Vector2 = laid_trail.point
	var baseline := _probe(row, TRACK_PROBE, "compaction")
	print("Tracked the walking figure's trail at %s, laid %.1f s into the record %.1f m from the controlled figure; probe %s compaction %.3f" % [
		lane, float(laid_trail.elapsed_ms) / 1000.0, laid_trail.apart_m, probe, baseline])
	if int(row.probe_count) != TRACK_PROBE or absf(probe.y - lane.y) > 0.2 or absf(probe.x - lane.x) > 1.0 or baseline < 0.01:
		failures.append("The route did not fix a probe on the walking figure's trail")
	if row.figure_id == row.other_figure_id or int(row.elapsed_ms) <= int(laid_trail.elapsed_ms):
		failures.append("The tracked trail was not laid by the other figure before it was found")
	if int(followed.back().step_count) <= int(followed.front().step_count):
		failures.append("The controlled figure did not follow the trail")
	for leg in followed:
		if float(leg.input_x) < 0.0 and absf(float(leg.z_m) - lane.y) > 0.1:
			_fail_once("Following left the walking figure's lane")
	var overlapped_compaction := _probe(overlapped.back(), TRACK_PROBE, "compaction")
	print("Tracking probe compaction %.3f -> %.3f after following and overlapping" % [baseline, overlapped_compaction])
	if overlapped_compaction < baseline + 0.02:
		failures.append("Following and overlapping the trail did not raise the probe's compaction")
	# Wind fills the loop's trail like any other: at wind 16 the probe's compaction
	# falls between rows in which no figure can reach it, and never rises then.
	var filled := 0.0
	var wind_rows := _rows_for(rows, "wind fills prints") + _rows_for(rows, "drifts build")
	for index in range(1, wind_rows.size()):
		var before: Dictionary = wind_rows[index - 1]
		var after: Dictionary = wind_rows[index]
		if _near_probe(before, TRACK_PROBE) or _near_probe(after, TRACK_PROBE):
			continue
		var change := _probe(after, TRACK_PROBE, "compaction") - _probe(before, TRACK_PROBE, "compaction")
		if change > 0.000001:
			_fail_once("The loop's trail grew with no figure near it")
		filled -= minf(change, 0.0)
	print("Wind filled %.3f of the tracked trail's compaction" % filled)
	if filled < 0.05:
		failures.append("Wind did not fill the walking figure's trail")


func _check_rejoin(rows: Array[Dictionary]) -> void:
	# After Tab the walking figure takes control where it stands, and the released
	# figure walks straight from where it stood back onto the loop and around it.
	var before := _rows_for(rows, "close view")
	var after := _rows_for(rows, "second figure idle") + _rows_for(rows, "cursor on second figure") + _rows_for(rows, "first figure rejoins loop")
	if before.is_empty() or after.is_empty():
		failures.append("Rejoin route stages were missing")
		return
	var released: Dictionary = before.back()
	var stood := Vector2(float(released.x_m), float(released.z_m))
	var first: Dictionary = after.front()
	if first.figure_id == released.figure_id or first.other_figure_id != released.figure_id:
		failures.append("Tab did not swap the controlled and walking figures")
		return
	if _loop_distance(stood) < 1.0:
		failures.append("The released figure already stood on the loop")
	if first.other_rejoining != "true" or _other(first).distance_to(stood) > 0.25:
		failures.append("The released figure did not set off for the loop from where it stood")
	var entry := Vector2.INF
	for row in after:
		if row.other_rejoining == "false":
			entry = _other(row)
			break
	if entry == Vector2.INF:
		failures.append("The released figure did not reach the loop")
		return
	var joined := 0
	var held := Vector2(float(first.x_m), float(first.z_m))
	for row in after:
		if Vector2(float(row.x_m), float(row.z_m)).distance_to(held) > 0.000001:
			_fail_once("The newly controlled figure kept walking the loop")
		if row.other_rejoining == "true":
			# Straight from where it stood toward its entry point.
			var line := entry - stood
			var offset := _other(row) - stood
			if absf(line.normalized().cross(offset)) > 0.05:
				_fail_once("The released figure did not walk straight back to the loop")
		else:
			joined += 1
	var last: Dictionary = after.back()
	print("Released figure stood %.2f m off the loop at %s, joined it at %s and walked on to %.0f%% of the loop" % [
		_loop_distance(stood), stood, entry, float(last.other_loop_progress) * 100.0])
	if joined < 60 or int(last.other_steps) <= int(first.other_steps) + 5 or float(last.other_mps) < 0.01:
		failures.append("The released figure did not walk on around the loop after rejoining")


## The other figure's observed position.
func _other(row: Dictionary) -> Vector2:
	return Vector2(float(row.other_x_m), float(row.other_z_m))


## Whether either figure stands near enough to a probe to press a boot onto it.
func _near_probe(row: Dictionary, slot: int) -> bool:
	if int(row.probe_count) < slot:
		return false
	var probe := Vector2(_probe(row, slot, "x_m"), _probe(row, slot, "z_m"))
	return _other(row).distance_to(probe) < NEAR_PROBE_M or Vector2(float(row.x_m), float(row.z_m)).distance_to(probe) < NEAR_PROBE_M


## Distance from a point to the walking figure's loop, laid out in the town layout.
func _loop_distance(point: Vector2) -> float:
	var nearest := INF
	for index in range(TownLayout.LOOP.size() - 1):
		var start: Vector2 = LANDMARKS[TownLayout.LOOP[index]]
		var finish: Vector2 = LANDMARKS[TownLayout.LOOP[index + 1]]
		nearest = minf(nearest, point.distance_to(Geometry2D.get_closest_point_to_segment(point, start, finish)))
	return nearest


func _check_deep_lane(rows: Array[Dictionary]) -> void:
	# Running into the south-west cluster's fresh Deep Snow is held to walking
	# speed, once past the prints of the walk that reached the lane.
	var fresh := _running_rows(rows, "run through deep snow")
	var held := 0
	for row in fresh:
		if float(row.x_m) > LANDMARKS.deep_lane.x - STEP_REACH_M:
			continue
		if float(row.saved_depth_m) < DEEP_DEPTH_M or absf(float(row.horizontal_mps) - WALK_MPS) > 0.003:
			_fail_once("Running in a tree cluster's fresh Deep Snow was not held to walking speed")
		held += 1
	# The corridor runs west from the deep lane's landmark, where both runs start.
	# Compare the same world corridor after several passes, not elapsed legs that may
	# cover different snow. Every included row requests running.
	var corridor_x: float = LANDMARKS.deep_lane.x - 2.0
	var fresh_speed := _corridor_speed(fresh, corridor_x)
	var packed_speed := _corridor_speed(_running_rows(rows, "run on packed trail"), corridor_x)
	print("Deep cluster corridor, Shift held: fresh %.3f m/s over %d held observations -> packed %.3f m/s" % [fresh_speed.mean, held, packed_speed.mean])
	if held < 180:
		failures.append("The route did not run into a tree cluster's fresh Deep Snow (%d observations)" % held)
	if fresh_speed.count < 20 or packed_speed.count < 20 or packed_speed.mean < fresh_speed.mean + PACKED_GAIN_MPS:
		failures.append("Packing a lane of Deep Snow did not let running there beat walking by %.1f m/s" % PACKED_GAIN_MPS)


## The mean speed of the observations within a metre of x, and how many there are.
func _corridor_speed(rows: Array[Dictionary], x: float) -> Dictionary:
	var total := 0.0
	var count := 0
	for row in rows:
		if absf(float(row.x_m) - x) <= 1.0:
			total += float(row.horizontal_mps)
			count += 1
	return {"mean": total / maxi(1, count), "count": count}


func _check_camera_steadiness(rows: Array[Dictionary]) -> void:
	# Per observation, how far the figure's sink and the camera's height against
	# the untouched snow each change: the figure by its whole sink, the camera by its
	# eased fifth of it.
	# The eased sink never exceeds the deepest sink observed so far.
	var checked := {}
	for stage in STEADY_STAGES:
		if _rows_for(rows, stage).is_empty():
			failures.append("No observations for camera steadiness stage '%s'" % stage)
		checked[int(stages.get(stage, -1))] = true
	var figure_jolt := 0.0
	var camera_jolt := 0.0
	var deepest := 0.0
	var steps := 0
	var previous := {}
	for row in rows:
		deepest = maxf(deepest, float(row.sink_depth_m))
		var framed := float(row.focus_y_m) - float(row.untouched_y_m)
		var steady: bool = checked.has(int(row.checkpoint)) and not previous.is_empty() and previous.checkpoint == row.checkpoint
		if steady:
			if framed > 0.0005 or -framed > CAMERA_SINK_SHARE * deepest + 0.0005:
				_fail_once("The camera left the untouched snow by more than a fifth of the sink")
			steps += int(row.step_count) - int(previous.step_count)
			figure_jolt = maxf(figure_jolt, absf(float(row.sink_depth_m) - float(previous.sink_depth_m)))
			camera_jolt = maxf(camera_jolt, absf(framed - (float(previous.focus_y_m) - float(previous.untouched_y_m))))
		previous = row
	print("Camera steadiness over %d steps: deepest sink %.3f m; largest per-observation change, figure's sink %.4f m, camera against untouched snow %.4f m" % [
		steps, deepest, figure_jolt, camera_jolt])
	if steps < 20 or figure_jolt < 0.005:
		failures.append("The camera steadiness stages showed no footfall sink to soften")
	if camera_jolt > 0.1 * figure_jolt:
		failures.append("The camera still moved with a footfall's sink instead of easing a share of it")


func _check_snow_zones(rows: Array[Dictionary]) -> void:
	# Starting Snow Depth follows the map's places: the Town Square is Shallow and
	# allows full running; the open snow beyond it is deeper and holds running back.
	var full := 0
	var held_back := 0
	for row in _running_rows(rows, "run into open snow"):
		if float(row.saved_depth_m) <= FULL_RUN_DEPTH_M:
			full += 1
			if float(row.horizontal_mps) < RUN_MPS - 0.003:
				_fail_once("The Town Square's Shallow Snow did not allow full running")
		elif float(row.saved_depth_m) >= OPEN_DEPTH_M:
			held_back += 1
			if float(row.horizontal_mps) > RUN_MPS - OPEN_RUN_SLOWDOWN:
				_fail_once("Open snow beyond the Town Square did not hold running back")
	if full < 30 or held_back < 30:
		failures.append("Running west did not cross from the Town Square's Shallow Snow into open snow (full %d, held back %d)" % [full, held_back])


func _check_roads() -> void:
	# Four diagonal Roads about 4 m wide, one from each Town Square corner, each
	# running on to the map's edge.
	var square := TownLayout.TOWN_SQUARE
	var corners := {}
	for corner in [square.position, Vector2(square.end.x, square.position.y), square.end, Vector2(square.position.x, square.end.y)]:
		corners[corner] = false
	if TownLayout.ROADS.size() != 4 or absf(TownLayout.ROAD_WIDTH - 4.0) > 0.5:
		failures.append("The town layout does not lay four Roads about 4 m wide")
	for name in TownLayout.ROADS:
		var heading: Vector2 = TownLayout.ROADS[name]
		var line := TownLayout.road(name)
		if not corners.has(line[0]) or corners[line[0]] or absf(absf(heading.x) - absf(heading.y)) > 0.0001 or _edge_normal(line[1]).dot(heading) <= 0.0:
			failures.append("The %s Road does not run diagonally from its own Town Square corner to the map's edge" % name)
		corners[line[0]] = true


func _check_road_run(rows: Array[Dictionary]) -> void:
	# From its Town Square corner the figure walks the south-west Road's first
	# stretch, then runs the rest of it to the map's edge. It stays on the Road, whose
	# Snow is Shallow all the way, and runs at full speed until the edge holds it at
	# the Road's end.
	var line := TownLayout.road("south_west")
	var walked: Array[Dictionary] = []
	for row in _rows_for(rows, "first trail"):
		if absf(float(row.input_x)) + absf(float(row.input_y)) > 0.5:
			walked.append(row)
	var stage := _rows_for(rows, "run along the south-west Road")
	var running := _running_rows(rows, "run along the south-west Road")
	if walked.is_empty() or running.is_empty():
		failures.append("The walk and run along the south-west Road were missing")
		return
	var deepest := 0.0
	for row in walked + running:
		if _off_line(Vector2(float(row.x_m), float(row.z_m)), line) > TownLayout.ROAD_WIDTH * 0.5:
			_fail_once("The figure left the south-west Road while following it")
		if float(row.saved_depth_m) > FULL_RUN_DEPTH_M:
			_fail_once("The south-west Road's Snow was not Shallow all the way to the edge")
		deepest = maxf(deepest, float(row.saved_depth_m))
	for row in running:
		if absf(float(row.horizontal_mps) - RUN_MPS) > 0.003:
			_fail_once("Running along the south-west Road did not keep full speed")
	var start := Vector2(float(walked.front().x_m), float(walked.front().z_m))
	var held := 0
	for row in stage:
		if row.boundary_limited == "true" and Vector2(float(row.x_m), float(row.z_m)).distance_to(line[1]) <= TownLayout.ROAD_WIDTH * 0.5 + FIGURE_RADIUS_M:
			held += 1
	var reached := Vector2(float(stage.back().x_m), float(stage.back().z_m))
	print("Followed the south-west Road from %s, %.2f m from its Town Square corner, to %s: %d observations walking and %d running, Snow Depth at most %.3f m, held at the edge %d" % [
		start, start.distance_to(line[0]), reached, walked.size(), running.size(), deepest, held])
	if start.distance_to(line[0]) > 0.5 or running.size() < 600:
		failures.append("The route did not follow the south-west Road from its Town Square corner")
	if held < 1:
		failures.append("The run along the south-west Road did not reach the map's edge at the Road's end")


## Unobstructed observations of a stage that requested running with movement input.
func _running_rows(rows: Array[Dictionary], stage: String) -> Array[Dictionary]:
	var running: Array[Dictionary] = []
	for row in _rows_for(rows, stage):
		var moving := absf(float(row.input_x)) + absf(float(row.input_y)) > 0.5
		if moving and row.run_requested == "true" and row.boundary_limited == "false" and row.obstacle_limited == "false":
			running.append(row)
	return running


func _check_facing(rows: Array[Dictionary]) -> void:
	# Turning in place: Facing points at the cursor's ground point, without a step.
	var sweep := _rows_for(rows, "turn in place")
	if sweep.is_empty():
		failures.append("Cursor sweep observations were missing")
		return
	var bearings := {}
	for row in sweep:
		if row.cursor_set != "true":
			_fail_once("The cursor's ground point was not observed")
			continue
		if _angle_between(float(row.facing_deg), _cursor_bearing(row)) > 0.5:
			_fail_once("Facing did not track the cursor's ground point")
		if int(row.step_count) != int(sweep.front().step_count) or float(row.horizontal_mps) > 0.0:
			_fail_once("Turning in place moved the figure or added a bootprint")
		for entry in SWEEP:
			if _angle_between(float(row.facing_deg), entry[1]) < 15.0:
				bearings[entry[1]] = true
	if bearings.size() != SWEEP.size():
		failures.append("Facing did not follow the cursor all the way round (%d of %d directions)" % [bearings.size(), SWEEP.size()])
	# Facing elsewhere: prints and speed follow travel north and back south.
	for leg in [["walk north facing east", 0.0], ["walk south facing east", 180.0]]:
		var walk := _rows_for(rows, leg[0])
		if walk.size() < 60:
			failures.append("Stage %s was missing" % leg[0])
			continue
		for row in walk.slice(10):
			if float(row.input_x) == 0.0 and float(row.input_y) == 0.0:
				continue
			if _angle_between(float(row.facing_deg), 90.0) > 20.0:
				_fail_once("Facing left the cursor while walking")
			if _angle_between(float(row.travel_deg), leg[1]) > 0.5 or absf(float(row.horizontal_mps) - WALK_MPS) > 0.003:
				_fail_once("Walking while facing elsewhere changed travel direction or speed")
			if int(row.step_count) > int(walk.front().step_count) and _angle_between(float(row.print_deg), leg[1]) > 0.5:
				_fail_once("Bootprints did not point the way the figure travelled")
		if int(walk.back().step_count) - int(walk.front().step_count) < 4:
			failures.append("Walking while facing elsewhere left too few prints (%s)" % leg[0])
	# Tab: the newly controlled figure takes its Facing from the cursor, west of it.
	var swapped := _rows_for(rows, "second figure idle")
	if swapped.is_empty() or swapped.front().cursor_set != "true":
		failures.append("Tab Facing observations were missing")
	elif _angle_between(float(swapped.front().facing_deg), 270.0) > 20.0 or _angle_between(float(swapped.front().facing_deg), _cursor_bearing(swapped.front())) > 0.5:
		failures.append("After Tab the newly controlled figure did not face the cursor")


func _check_lean(rows: Array[Dictionary]) -> void:
	# The corner cursor leans the camera as far as its play distance allows: exactly
	# 3 m closest and 8 m widest, and further at the default distance than closest,
	# less far than widest. Each time the lean is held at that limit, short of the
	# quarter of the cursor's offset it would otherwise take. Resting the cursor on
	# the figure takes the lean away again.
	var reached: Array[float] = []
	for stage in [["lean at closest", "cursor on figure at closest"], ["lean to corner", "cursor on figure"],
			["lean at widest", "cursor on figure at widest"]]:
		var leaned := _rows_for(rows, stage[0])
		var returned := _rows_for(rows, stage[1])
		if leaned.size() < 2 or returned.is_empty():
			failures.append("Lean stage '%s' was missing" % stage[0])
			return
		var row: Dictionary = leaned.back()
		var lean := float(row.lean_m)
		var offset := Vector2(float(row.cursor_x_m) - float(row.x_m), float(row.cursor_z_m) - float(row.z_m))
		if absf(lean - float(leaned[-2].lean_m)) > 0.0001 or lean > offset.length() * 0.25 - 0.05:
			failures.append("The camera's lean was not held at its limit toward a distant cursor (%s: %.2f m)" % [stage[0], lean])
		if float(returned.back().lean_m) > 0.05:
			failures.append("The lean did not return when the cursor rested on the figure (%s)" % stage[1])
		reached.append(lean)
	print("Lean toward the corner cursor: %.2f m closest, %.2f m default, %.2f m widest" % reached)
	if absf(reached[0] - CLOSEST_LEAN_M) > 0.01 or absf(reached[2] - WIDEST_LEAN_M) > 0.01:
		failures.append("The lean did not reach 3 m at the closest play distance and 8 m at the widest")
	if reached[1] < reached[0] + 0.05 or reached[1] > reached[2] - 0.05:
		failures.append("The lean did not grow from the closest play distance through the default to the widest")


## The closest and widest play distances, read from the stages that reach them.
func _play_range(rows: Array[Dictionary]) -> Vector2:
	var close := _rows_for(rows, "close view")
	var widest := _rows_for(rows, "widest play view")
	if close.is_empty() or widest.is_empty():
		return Vector2.ZERO
	return Vector2(float(close.back().camera_distance_m), float(widest.back().camera_distance_m))


func _check_walking_facing(rows: Array[Dictionary]) -> void:
	# Walking north with the cursor sweeping round behind: the twist stays within
	# 110°, holds its shoulder while the cursor is beyond that, changes shoulder
	# through the front once, and Facing never turns faster than 540°/s. Travel,
	# speed and bootprints are a plain northward walk's.
	var sweep := _rows_for(rows, "walk north sweeping behind")
	var stop := _rows_for(rows, "stop facing behind")
	if sweep.size() < 120 or stop.size() < 30:
		failures.append("Walking Facing stages were missing")
		return
	var held := {1.0: 0, -1.0: 0}
	var behind := 0
	var changes: Array[String] = []
	var last_side := 0.0
	var last_walking := {}
	var previous := {}
	var standing: Array[Dictionary] = []
	for row in sweep + stop:
		if not previous.is_empty() and _angle_between(float(row.facing_deg), float(previous.facing_deg)) > TURN_PER_OBSERVATION_DEG + 0.01:
			_fail_once("Facing turned faster than 540° per second")
		previous = row
		if float(row.input_y) > -0.5:
			if not last_walking.is_empty():
				standing.append(row)
			continue
		last_walking = row
		var obstructed: bool = row.boundary_limited == "true" or row.obstacle_limited == "true"
		if obstructed or _angle_between(float(row.travel_deg), 0.0) > 0.5 or absf(float(row.horizontal_mps) - WALK_MPS) > 0.003:
			_fail_once("Facing changed the northward walk's travel or speed")
		if int(row.step_count) > int(sweep.front().step_count) and _angle_between(float(row.print_deg), 0.0) > 0.5:
			_fail_once("Bootprints did not point north while the figure looked behind")
		var twist := float(row.twist_deg)
		var wanted := wrapf(_cursor_bearing(row) - float(row.travel_deg), -180.0, 180.0)
		if absf(twist) > WALKING_TWIST_DEG + 0.5:
			_fail_once("The upper body twisted beyond 110° while walking")
		var beyond := absf(wanted) > WALKING_TWIST_DEG + 1.0
		if beyond and absf(wanted) > 170.0:
			behind += 1
		if beyond and absf(twist) > WALKING_TWIST_DEG - 0.5:
			held[signf(twist)] += 1
		var side := signf(twist)
		if side != 0.0 and last_side != 0.0 and side != last_side:
			changes.append("%+.0f° to %+.0f° with the cursor at %+.0f°" % [last_side * WALKING_TWIST_DEG, twist, wanted])
			if beyond:
				_fail_once("The upper body changed shoulder while the cursor was beyond the limit")
		if side != 0.0:
			last_side = side
	print("Walking with the cursor behind: %d observations directly behind, held east %d and west %d, shoulder changes %s" % [behind, held[1.0], held[-1.0], changes])
	if behind < 20 or held[1.0] < 20 or held[-1.0] < 10:
		failures.append("The upper body was not held at its limit over each shoulder (behind %d, east %d, west %d)" % [behind, held[1.0], held[-1.0]])
	if changes.size() != 1 or not changes[0].begins_with("+"):
		failures.append("The upper body did not change once from the east to the west shoulder (%s)" % [changes])
	if int(last_walking.step_count) - int(sweep.front().step_count) < 4:
		failures.append("Walking while looking behind left too few prints")
	# Stopped with the cursor behind, Facing turns to it at the same rate, the legs
	# pivot after it without stepping, and it then tracks the cursor exactly.
	if standing.size() < 30:
		failures.append("Stop observations were missing")
		return
	var gap := _angle_between(float(last_walking.facing_deg), _cursor_bearing(standing.front()))
	var expected := ceili(gap / TURN_PER_OBSERVATION_DEG) + 1
	print("Stopped %.0f° from the cursor; expected to reach it within %d observations" % [gap, expected])
	if gap < 30.0:
		failures.append("The figure did not stop with Facing away from the cursor (%.1f°)" % gap)
	for index in range(standing.size()):
		var row: Dictionary = standing[index]
		if int(row.step_count) != int(last_walking.step_count) or float(row.horizontal_mps) > 0.0:
			_fail_once("Turning after stopping moved the figure or added a bootprint")
		if absf(float(row.twist_deg)) > STANDING_TWIST_DEG + 0.5:
			_fail_once("Standing, the legs did not pivot under the 60° twist")
		if index >= expected and _angle_between(float(row.facing_deg), _cursor_bearing(row)) > 0.5:
			_fail_once("After stopping, Facing did not reach and track the cursor")


func _check_overview_key(rows: Array[Dictionary]) -> void:
	# M opens the overview from the default distance and returns to exactly it.
	# Walking carries on in it, the lean falls to zero, and a wheel step out changes
	# nothing. From an overview M opened, one wheel step in reaches the widest end of play.
	var initial := _rows_for(rows, "initial idle")
	var widest := _rows_for(rows, "widest play view")
	if initial.is_empty() or widest.is_empty():
		failures.append("The default or widest play view stage was missing")
		return
	var default_distance := float(initial.back().camera_distance_m)
	var widest_distance := float(widest.back().camera_distance_m)
	var leaned := _rows_for(rows, "lean before overview")
	var opened := _rows_for(rows, "overview by M")
	var open := opened + _rows_for(rows, "overview walk back") + _rows_for(rows, "overview wheel out")
	var closed := _rows_for(rows, "overview closed by M")
	var wheel_in := _rows_for(rows, "overview wheel in")
	if leaned.is_empty() or opened.is_empty() or closed.is_empty() or wheel_in.is_empty():
		failures.append("Overview key stages were missing")
		return
	if leaned.back().overview != "false" or absf(float(leaned.back().camera_distance_m) - default_distance) > 0.001 or float(leaned.back().lean_m) < 0.5:
		failures.append("The route did not open the overview from a leaning play view at the default distance")
	for row in open:
		if row.overview != "true" or row.whole_map_visible != "true":
			_fail_once("M did not hold the whole-map overview open")
	if float(opened.back().lean_m) > 0.01:
		failures.append("The overview opened by M kept its lean (%.3f m)" % float(opened.back().lean_m))
	if float(opened.back().travel_m) - float(opened.front().travel_m) < 1.5:
		failures.append("The figure did not walk while the overview was open")
	for row in closed:
		if row.overview != "false" or absf(float(row.camera_distance_m) - default_distance) > 0.001:
			_fail_once("M did not return to the default play distance, or its repeat toggled the overview")
	for row in wheel_in:
		if row.overview != "false" or absf(float(row.camera_distance_m) - widest_distance) > 0.001:
			_fail_once("One wheel step in from the overview did not reach the widest play distance")


func _check_detail_region(rows: Array[Dictionary]) -> void:
	# The region follows the camera focus as the cursor moves the lean, while the
	# figure stands still, and returns with it.
	var idle := _rows_for(rows, "initial idle")
	var corner := _rows_for(rows, "lean to corner")
	var centred := _rows_for(rows, "cursor on figure")
	if idle.is_empty() or corner.is_empty() or centred.is_empty():
		failures.append("Detail region lean stages were missing")
		return
	var start := _region(idle.back())
	var leaned := _region(corner.back())
	var returned := _region(centred.back())
	print("Detail region at %s; leaned to %s; returned to %s" % [start, leaned, returned])
	if leaned.distance_to(start) < 2.0 * COARSE_STEP_M:
		failures.append("The detail region did not follow the camera focus as the cursor moved the lean")
	if returned.distance_to(start) > COARSE_STEP_M + 0.001:
		failures.append("The detail region did not return with the lean")
	# In the overview the region holds still while the figure walks across its
	# border: from the coarse surface, through the blend, into full detail and out.
	var outside := 0
	var border := 0
	var inside := 0
	var border_gap := 0.0
	var held := Vector2.INF
	for row in rows:
		if row.overview != "true" or absf(float(row.input_x)) + absf(float(row.input_y)) < 0.5:
			continue
		if held == Vector2.INF:
			held = _region(row)
		elif _region(row).distance_to(held) > 0.001:
			_fail_once("The overview's detail region moved while the figure walked")
		var inset := _region_inset(row, Vector2(float(row.x_m), float(row.z_m)))
		if inset < 0.0:
			outside += 1
		elif inset < DETAIL_BORDER_M:
			border += 1
			border_gap = maxf(border_gap, absf(float(row.contact_gap_m)))
		else:
			inside += 1
	print("Overview walk across the region border: outside %d, border %d, inside %d; border contact gap %.4f m" % [outside, border, inside, border_gap])
	if outside < 30 or border < 30 or inside < 30:
		failures.append("The figure did not walk across the detail region's border (outside %d, border %d, inside %d)" % [outside, border, inside])
	if border_gap > CONTACT_BOUND_M:
		failures.append("Boots left the snow across the detail region's border (gap %.4f m)" % border_gap)
	# Leaning toward the bottom of the widest view puts the figure north of the focus,
	# as far north as it ever stands; the near part still holds its every step.
	var south := _rows_for(rows, "lean toward the bottom at widest")
	var north_of_focus := -INF
	for row in south:
		north_of_focus = maxf(north_of_focus, float(row.focus_z_m) - float(row.z_m))
	print("Leaning toward the bottom of the widest view put the figure %.2f m north of the focus" % north_of_focus)
	if south.is_empty() or north_of_focus < 1.0:
		failures.append("Leaning toward the bottom of the view did not put the figure north of the focus")
	# And across its seam, inside the region's full detail, laying prints on both sides.
	var crossing := _rows_for(rows, "cross the region's seam")
	var far := 0
	var near := 0
	var seam_gap := 0.0
	for row in crossing:
		if _region_inset(row, Vector2(float(row.x_m), float(row.z_m))) < DETAIL_BORDER_M + STEP_REACH_M:
			continue
		if float(row.z_m) < float(row.region_seam_z_m):
			far += 1
		else:
			near += 1
		seam_gap = maxf(seam_gap, absf(float(row.contact_gap_m)))
	print("Overview walk across the region's seam: far %d, near %d; contact gap %.4f m" % [far, near, seam_gap])
	if far < 30 or near < 30 or crossing.is_empty() or int(crossing.back().step_count) - int(crossing.front().step_count) < 4:
		failures.append("The figure did not walk across the detail region's seam in full detail (far %d, near %d)" % [far, near])
	if seam_gap > CONTACT_BOUND_M:
		failures.append("Boots left the snow across the detail region's seam (gap %.4f m)" % seam_gap)


func _check_uploads(rows: Array[Dictionary]) -> void:
	var last: Dictionary = rows.back()
	var steps := int(last.uploaded_steps)
	var sent := int(last.upload_total_bytes)
	var bound := steps * MAX_TILES_PER_STEP * int(last.footprint_tile_bytes)
	print("Footprint uploads: %d bytes for %d footsteps (%.0f per step; touched-tile bound %d per step)" % [
		sent, steps, float(sent) / maxi(1, steps), MAX_TILES_PER_STEP * int(last.footprint_tile_bytes)])
	if steps < 100 or sent <= 0 or sent > bound:
		failures.append("Footprint uploads were missing or exceeded the touched tiles (%d bytes, %d steps)" % [sent, steps])


func _region(row: Dictionary) -> Vector2:
	return Vector2(float(row.region_x_m), float(row.region_z_m))


func _region_size(row: Dictionary) -> Vector2:
	return Vector2(float(row.region_width_m), float(row.region_depth_m))


## How far a point lies inside the detail region from its nearest side. Every side
## is blended, including one beyond the map's edge, where the apron's snow lies.
func _region_inset(row: Dictionary, point: Vector2) -> float:
	var inset := _region_size(row) * 0.5 - (point - _region(row)).abs()
	return minf(inset.x, inset.y)


## In play: the controlled figure's every step lands in the near part's full detail,
## the snow along the bottom of the view lies in full detail and, without lean, so
## does all the snow the view shows within 20 m of the figure.
func _check_sharp_view(row: Dictionary) -> void:
	var figure := Vector2(float(row.x_m), float(row.z_m))
	if _region_inset(row, figure) < DETAIL_BORDER_M + STEP_REACH_M or figure.y - STEP_REACH_M < float(row.region_seam_z_m):
		_fail_once("In play the controlled figure's steps could land outside the near part's full detail")
	var view := _view_corners(row)
	for point in [view[0], (view[0] + view[1]) * 0.5, view[1]]:
		if _region_inset(row, point) < DETAIL_BORDER_M:
			_fail_once("Snow along the bottom of the view lay outside the detail region's full detail")
	if float(row.lean_m) >= 0.05:
		return
	# That snow is the view's ground quadrilateral cut by a 20 m circle round the
	# figure, which stands inside it. Both are convex, so its outline settles it: each
	# ray from the figure, stopped at 20 m or where it leaves the view, and the view's
	# corners within reach.
	var outline: Array[Vector2] = []
	for index in range(CRISP_RAYS):
		var direction := Vector2.from_angle(TAU * float(index) / float(CRISP_RAYS))
		outline.append(figure + direction * minf(CRISP_REACH_M, _view_exit(figure, direction, view)))
	for corner in view:
		if corner.distance_to(figure) <= CRISP_REACH_M:
			outline.append(corner)
	for point in outline:
		if _region_inset(row, point) < DETAIL_BORDER_M - CRISP_SAG_M:
			_fail_once("Without lean, snow the view shows within 20 m of the figure lay outside the detail region's full detail")
			return


## How far a ray from `origin`, inside the view, runs before it leaves the view.
func _view_exit(origin: Vector2, direction: Vector2, view: Array[Vector2]) -> float:
	var nearest := INF
	for index in range(view.size()):
		var crossing: Variant = Geometry2D.segment_intersects_segment(origin, origin + direction * 1000.0,
			view[index], view[(index + 1) % view.size()])
		if crossing != null:
			nearest = minf(nearest, origin.distance_to(crossing))
	return nearest


## Where the view's corners meet the horizontal plane through the camera focus, as
## world points: bottom left, bottom right, top right and top left. They follow from
## the observed focus, distance, pitch, yaw and lens, and this viewport's shape.
func _view_corners(row: Dictionary) -> Array[Vector2]:
	var size := get_viewport().get_visible_rect().size
	var half := tan(deg_to_rad(float(row.camera_fov_deg)) * 0.5)
	var view := Basis.from_euler(Vector3(deg_to_rad(float(row.pitch_deg)), deg_to_rad(float(row.yaw_deg)), 0.0))
	var focus := Vector3(float(row.focus_x_m), float(row.focus_y_m), float(row.focus_z_m))
	var eye := focus + view.z * float(row.camera_distance_m)
	var corners: Array[Vector2] = []
	for screen in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
		var ray: Vector3 = -view.z + view.x * (screen.x * half * size.x / size.y) + view.y * (screen.y * half)
		var hit := eye + ray * ((focus.y - eye.y) / ray.y)
		corners.append(Vector2(hit.x, hit.z))
	return corners


func _check_zoom(rows: Array[Dictionary]) -> void:
	# Before any zoom the figure stands about a twelfth of the screen tall. Five
	# wheel steps out from the closest view stop at about a sixteenth, the next
	# opens the overview, and twelve steps back in stop at about an eighth.
	var initial := _rows_for(rows, "initial idle")
	if initial.is_empty() or not _framed_at(initial.back(), PLAY_SHARE):
		failures.append("The default view did not show the figure about a twelfth of the screen tall (%s)" % _share_text(initial))
	var overview := _rows_for(rows, "whole map")
	var close := _rows_for(rows, "close view")
	if overview.is_empty() or overview.back().overview != "true" or overview.back().whole_map_visible != "true":
		failures.append("Zooming out did not reach the whole-map overview")
	if close.is_empty() or close.back().overview != "false" or not _framed_at(close.back(), CLOSEST_SHARE):
		failures.append("Zooming in did not stop with the figure about an eighth of the screen tall (%s)" % _share_text(close))
	var widest := _rows_for(rows, "widest play view")
	if widest.is_empty() or widest.back().overview != "false" or not _framed_at(widest.back(), WIDEST_SHARE):
		failures.append("Zooming out did not stop with the figure about a sixteenth of the screen tall before the overview (%s)" % _share_text(widest))
	if not initial.is_empty() and not close.is_empty() and not widest.is_empty():
		print("Framing: figure %.4f of the screen's height by default at %.2f m, %.4f closest at %.2f m, %.4f widest at %.2f m" % [
			float(initial.back().figure_screen_height), float(initial.back().camera_distance_m),
			float(close.back().figure_screen_height), float(close.back().camera_distance_m),
			float(widest.back().figure_screen_height), float(widest.back().camera_distance_m)])


## Whether the figure stands `share` of the screen's height tall, within the tolerance.
func _framed_at(row: Dictionary, share: float) -> bool:
	return _framed_between(row, share, share)


func _framed_between(row: Dictionary, smallest: float, largest: float) -> bool:
	var height := float(row.figure_screen_height)
	return height >= smallest * (1.0 - FRAMING_TOLERANCE) and height <= largest * (1.0 + FRAMING_TOLERANCE)


func _share_text(stage: Array[Dictionary]) -> String:
	return "no observation" if stage.is_empty() else "%.4f of the screen's height" % float(stage.back().figure_screen_height)


func _check_wind(rows: Array[Dictionary]) -> void:
	var placed := _rows_for(rows, "probes placed")
	var filling := _rows_for(rows, "wind fills prints")
	var building := _rows_for(rows, "drifts build")
	var wading := _running_rows(rows, "run through drift")
	var turned := _rows_for(rows, "wind turned")
	var frozen := _rows_for(rows, "wind frozen")
	if placed.is_empty() or filling.size() < 60 or building.size() < 60 or turned.size() < 60 or frozen.size() < 60:
		failures.append("Wind route stages were missing")
		return
	if int(placed.back().probe_count) != LEE_PROBE:
		failures.append("The route did not fix its seven world probes (%s)" % placed.back().probe_count)
		return
	for row in placed + filling + building:
		if absf(float(row.wind_from_deg) - PREVAILING_FROM_DEG) > 0.01:
			_fail_once("The default wind did not blow from the north-west")
	if absf(float(turned.back().wind_from_deg) - REVERSED_FROM_DEG) > 0.01:
		failures.append("Four turns of ] did not reverse the wind to the south-east")
	if absf(float(turned.front().wind_shaped_from_deg) - REVERSED_FROM_DEG) > 0.01:
		failures.append("The snow did not follow the reversed wind within 30 seconds of the turn")
	# Fill: the same wind fills exposed, sheltered and lee prints at distinctly
	# different rates, measured against each probe's own compaction.
	var first: Dictionary = filling.front()
	var last: Dictionary = filling.back()
	var wind_seconds := float(last.wind_elapsed_s) - float(first.wind_elapsed_s)
	var remaining := {}
	for probe in [EXPOSED_PROBE, SHELTERED_PROBE, LEE_PROBE]:
		var baseline := _probe(first, probe, "compaction")
		if baseline < 0.05:
			failures.append("Probe %d did not start on a measurable footprint (%.3f)" % [probe, baseline])
			return
		remaining[probe] = _probe(last, probe, "compaction") / baseline
	print("After %.1f wind-seconds, prints remain: exposed %.2f, sheltered %.2f, lee %.2f" % [
		wind_seconds, remaining[EXPOSED_PROBE], remaining[SHELTERED_PROBE], remaining[LEE_PROBE]])
	if absf(remaining[EXPOSED_PROBE] - (1.0 - wind_seconds / OPEN_FILL_S)) > 0.06:
		failures.append("An exposed print did not fill at the 120 wind-second rate")
	if absf(remaining[SHELTERED_PROBE] - (1.0 - wind_seconds / SHELTERED_FILL_S)) > 0.06:
		failures.append("A print in a building's shelter did not fill four times more slowly")
	if remaining[LEE_PROBE] > remaining[EXPOSED_PROBE] - 0.2:
		failures.append("A print where a drift builds did not fill faster than in the open")
	# By the end of the drift stage the exposed and lee prints have filled completely,
	# while the sheltered print still remains. The figure stands at the lee probe,
	# inside the detail region, where its visible depression fills as well.
	var settled: Dictionary = building.back()
	var fresh_depression := _probe(placed.back(), LEE_PROBE, "depth_m") - _probe(placed.back(), LEE_PROBE, "visible_m")
	var filled_depression := _probe(settled, LEE_PROBE, "depth_m") - _probe(settled, LEE_PROBE, "visible_m")
	if _probe(settled, EXPOSED_PROBE, "compaction") > 0.001 or _probe(settled, LEE_PROBE, "compaction") > 0.001:
		failures.append("Wind did not fill the exposed and lee prints")
	var lee_in_region := "probe%d_in_region" % LEE_PROBE
	if placed.back()[lee_in_region] != "true" or settled[lee_in_region] != "true" or fresh_depression < 0.002 or filled_depression > 0.003:
		failures.append("Wind did not fill the lee print's visible depression")
	if _probe(settled, SHELTERED_PROBE, "compaction") < 0.2 * _probe(first, SHELTERED_PROBE, "compaction"):
		failures.append("The sheltered print did not outlast the exposed one")
	# Open snow away from the buildings neither drifts nor scours, and the shed the
	# workshop shelters builds no Snowdrift in its own lee: both keep their Snow Depth.
	var unchanged := {EXPOSED_PROBE: 0.0, SHELTERED_PROBE: 0.0}
	for row in filling + building:
		for probe in unchanged:
			unchanged[probe] = maxf(unchanged[probe], absf(_probe(row, probe, "depth_m") - _probe(first, probe, "depth_m")))
	print("Largest change of Snow Depth under the prevailing wind: exposed %.4f m, sheltered %.4f m" % [unchanged[EXPOSED_PROBE], unchanged[SHELTERED_PROBE]])
	if unchanged[EXPOSED_PROBE] > 0.001 or unchanged[SHELTERED_PROBE] > 0.01:
		failures.append("Wind changed Snow Depth in the open Town Square or in a sheltered building's lee")
	# Drift: the lee probe grows toward 1.2 m without oscillating and settles.
	var growth := _probe(settled, LEE_PROBE, "depth_m") - _probe(first, LEE_PROBE, "depth_m")
	var previous := -INF
	for row in filling + building:
		var depth := _probe(row, LEE_PROBE, "depth_m")
		if depth < previous - 0.0001:
			_fail_once("The lee Snowdrift shrank while it was building")
		previous = depth
	var early := _probe(filling[59], LEE_PROBE, "depth_m") - _probe(first, LEE_PROBE, "depth_m")
	var late := _probe(settled, LEE_PROBE, "depth_m") - _probe(building[building.size() - 60], LEE_PROBE, "depth_m")
	print("Lee drift %.3f -> %.3f m (first second +%.3f, last second +%.3f)" % [
		_probe(first, LEE_PROBE, "depth_m"), _probe(settled, LEE_PROBE, "depth_m"), early, late])
	if growth < 0.3 or _probe(settled, LEE_PROBE, "depth_m") < DRIFT_MAX_M - 0.15:
		failures.append("No Snowdrift grew toward 1.2 m in the lodge's lee")
	if late > 0.2 * early:
		failures.append("The lee Snowdrift did not settle toward a steady shape")
	# A Road exists before anyone walks it, and wind can still drift over it: the
	# probe on the south-west Road lies in its Shallow Snow, which holds while the
	# wind is still, until the cluster's corner tree builds a Snowdrift over it.
	var placed_road := _rows_for(rows, "road probe")
	if placed_road.is_empty() or int(placed_road.back().probe_count) != ROAD_PROBE:
		failures.append("The route did not fix a probe on the south-west Road")
	else:
		var road_probe := Vector2(_probe(placed_road.back(), ROAD_PROBE, "x_m"), _probe(placed_road.back(), ROAD_PROBE, "z_m"))
		var road_start := _probe(placed_road.back(), ROAD_PROBE, "depth_m")
		var road_drift := _probe(settled, ROAD_PROBE, "depth_m")
		print("South-west Road probe at %s, %.2f m from the corner tree's drift point: Snow Depth %.3f m -> %.3f m under the prevailing wind" % [
			road_probe, road_probe.distance_to(_road_drift_point()), road_start, road_drift])
		if _off_line(road_probe, TownLayout.road("south_west")) > TownLayout.ROAD_WIDTH * 0.5:
			failures.append("The Road probe does not lie on the south-west Road")
		if road_start > FULL_RUN_DEPTH_M or absf(_probe(first, ROAD_PROBE, "depth_m") - road_start) > 0.0005:
			failures.append("The south-west Road did not start Shallow and hold still until the wind blew")
		if road_drift < road_start + ROAD_DRIFT_M:
			failures.append("Wind did not drift snow over the south-west Road")
	# Scour: the windward probe falls to the 3 cm floor and holds there.
	var scoured := _probe(settled, WINDWARD_PROBE, "depth_m")
	print("Windward scour %.3f -> %.3f m" % [_probe(first, WINDWARD_PROBE, "depth_m"), scoured])
	if _probe(first, WINDWARD_PROBE, "depth_m") < SCOUR_FLOOR_M + 0.1 or scoured > SCOUR_FLOOR_M + 0.005:
		failures.append("The lodge's windward face was not scoured to the 3 cm floor")
	# Snowdrifts stay walkable at walking speed; running follows the loose depth.
	var waded := 0
	for row in wading:
		if float(row.loose_depth_m) >= WALK_ONLY_DEPTH_M and absf(float(row.horizontal_mps) - WALK_MPS) <= 0.003:
			waded += 1
	if waded < 60:
		failures.append("The figure did not wade through the Snowdrift at walking speed (%d observations)" % waded)
	# Turning the wind moves the growth: the old lee wears away and the scoured face drifts.
	var before: Dictionary = turned.front()
	var after: Dictionary = turned.back()
	var worn := _probe(before, LEE_PROBE, "depth_m") - _probe(after, LEE_PROBE, "depth_m")
	var drifted := _probe(after, WINDWARD_PROBE, "depth_m") - _probe(before, WINDWARD_PROBE, "depth_m")
	print("Reversed wind: old lee -%.3f m, old windward face +%.3f m" % [worn, drifted])
	if worn < 0.2 or drifted < 0.1:
		failures.append("Reversing the wind did not move where the Snowdrift grows")
	# Wind 0 freezes Snow Depth and every print once the last sweep has landed. Only
	# a boot can still press a print, so a probe the walking figure passes is skipped.
	var settled_rows := frozen.slice(30)
	for probe in range(1, LEE_PROBE + 1):
		var trodden := false
		for row in settled_rows:
			trodden = trodden or _near_probe(row, probe)
		for row in settled_rows:
			if row.wind_elapsed_s != settled_rows.front().wind_elapsed_s:
				_fail_once("Wind 0 did not stop the weather clock")
			for value in ["depth_m", "compaction"]:
				if absf(_probe(row, probe, value) - _probe(settled_rows.front(), probe, value)) > 0.000001 and not (value == "compaction" and trodden):
					_fail_once("Wind 0 did not freeze Snow Depth and Footprints at every probe")


## A probe's observed value, by its 1-based slot.
func _probe(row: Dictionary, slot: int, value: String) -> float:
	return float(row["probe%d_%s" % [slot, value]])


## The compass bearing from the figure to the cursor's ground point.
func _cursor_bearing(row: Dictionary) -> float:
	var offset := Vector2(float(row.cursor_x_m) - float(row.x_m), float(row.cursor_z_m) - float(row.z_m))
	return fposmod(rad_to_deg(atan2(offset.x, -offset.y)), 360.0)


func _angle_between(a: float, b: float) -> float:
	return absf(wrapf(a - b, -180.0, 180.0))


func _fail_once(message: String) -> void:
	if not failures.has(message):
		failures.append(message)

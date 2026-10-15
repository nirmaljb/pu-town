extends Node
## Drive the running scene through ordinary keyboard, wheel and mouse-movement
## events and public CSV.
## Headless event replay is explicitly labelled; it is not OS input or visual QA.
## Destinations and bounds come from the town layout definition, not the running scene.
## The camera is north-up, so W walks north, S south, D east and A west.

const TownLayout = preload("res://town_layout.gd")
const LANDMARKS := TownLayout.LANDMARKS
# Specified values: a figure keeps its 0.3 m radius inside the map, and the
# footprint image covers the whole map at 31.25 mm per texel. The town shelf
# stands about 5 m above the forest; contact stays within today's 2 mm bound.
const FIGURE_RADIUS_M := 0.3
const FOOTPRINT_TEXEL_M := 0.03125
const LEVEL_DROP_M := 5.0
const CONTACT_BOUND_M := 0.002
# Running is full at or below 10 cm of loose snow and falls to walking at 40 cm.
const FULL_RUN_DEPTH_M := 0.10
const WALK_ONLY_DEPTH_M := 0.40
const WALK_MPS := 2.25
const RUN_MPS := 4.5
# The specified camera: perspective, 40° field of view, −55° pitch, north up,
# a 10–30 m play range and a lean of at most 3 m.
const CAMERA_FOV_DEG := 40.0
const CAMERA_PITCH_DEG := -55.0
const PLAY_RANGE_M := Vector2(10.0, 30.0)
const MAX_LEAN_M := 3.0
# Cursor points around the figure, as screen offsets in viewport heights and the
# compass bearing each shows on a north-up view.
const SWEEP := [
	[Vector2(0, -0.2), 0.0], [Vector2(0.2, -0.2), 45.0], [Vector2(0.2, 0), 90.0], [Vector2(0.2, 0.2), 135.0],
	[Vector2(0, 0.2), 180.0], [Vector2(-0.2, 0.2), 225.0], [Vector2(-0.2, 0), 270.0], [Vector2(-0.2, -0.2), 315.0],
]

var failures: Array[String] = []
var stages := {}
var arrivals: Array[Dictionary] = []
var checkpoint := 0
var route_path := ""
var headless := false
# Where the controlled figure stands on screen with no lean, as viewport fractions.
var figure_screen := Vector2(0.5, 0.5)


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
	_tap(KEY_MINUS) # Default wind 1 -> 0, so persistent trails have a stable clock.
	_tap(KEY_F8)
	await _wait(0.1)
	route_path = _latest_record()
	if route_path.is_empty():
		failures.append("No public route CSV was opened")
		_finish()
		return

	await _leg([], 0.5, "initial idle")
	var idle_row: Dictionary = _read_rows().back()
	figure_screen = Vector2(float(idle_row.figure_screen_x), float(idle_row.figure_screen_y))
	# Facing follows the cursor round the standing figure without a step.
	await _sweep_cursor("turn in place")
	# The camera leans toward a cursor in the corner of the view, but no further than its bound.
	await _cursor_leg(Vector2(0.48, -0.48), [], 1.5, "lean to corner")
	# A cursor resting on the figure gives no Facing and no lean, so the camera centres it again.
	await _cursor_leg(Vector2.ZERO, [], 1.5, "cursor on figure")
	await _short_steps()
	# Both figures start in the outpost yard, where shallow and deep snow mix.
	await _leg([KEY_W, KEY_A], 2.0, "north-west walk")
	await _leg([KEY_S, KEY_D], 2.0, "south-east return")
	# Facing east, the figure still walks north and back, at walking speed, with its prints.
	await _cursor_leg(Vector2(0.3, 0), [KEY_W], 2.0, "walk north facing east")
	await _cursor_leg(Vector2(0.3, 0), [KEY_S], 2.0, "walk south facing east")
	await _cursor_leg(Vector2.ZERO, [], 1.5, "cursor back on figure")
	# Running east from the Shallow west of the outpost yard reaches its Deep drift.
	await _leg([KEY_D, KEY_SHIFT], 2.5, "run across outpost yard")
	await _goto(LANDMARKS.lodge_front, "reach lodge front")
	await _leg([KEY_W], 2.5, "lodge approach")
	await _leg([KEY_W], 1.2, "lodge blocked")
	await _leg([], 0.5, "blocked idle")
	# Repeated traffic packs a lane of the meeting-hall gap's Deep Snow until it is runnable.
	await _goto(LANDMARKS.meeting_hall_lane, "reach meeting-hall lane")
	await _leg([KEY_W, KEY_SHIFT], 2.0, "run through deep snow")
	await _goto(LANDMARKS.meeting_hall_lane, "pack deep trail return")
	await _leg([KEY_W], 2.0, "pack deep trail again")
	await _goto(LANDMARKS.meeting_hall_lane, "packed run start")
	await _leg([KEY_W, KEY_SHIFT], 2.0, "run on packed trail")
	# Lay a trail in the meeting-hall gap and fix a world probe on it.
	await _goto(LANDMARKS.meeting_hall_gap_south, "reach meeting-hall gap")
	await _leg([KEY_W], 2.0, "first trail")
	_tap(KEY_F5)
	await _leg([], 0.5, "fresh probe")
	# Leave the detailed patch through the compound's east gate into the courtyard.
	await _goto(LANDMARKS.meeting_hall_gap, "leave detailed patch")
	await _goto(LANDMARKS.courtyard_east, "enter courtyard")
	await _leg([KEY_S], 2.2, "wall approach")
	await _leg([KEY_S], 1.2, "wall blocked")
	await _goto(LANDMARKS.courtyard, "cross courtyard")
	await _leg([], 0.5, "probe outside patch")
	# The courtyard's Shallow Snow allows full running.
	await _goto(LANDMARKS.courtyard_west, "reach courtyard west")
	await _leg([KEY_W, KEY_SHIFT], 2.0, "run in courtyard")
	# With the cursor west of the figure, the newly controlled figure faces west.
	_point(Vector2(-0.25, 0))
	await _wait(0.2)
	_tap(KEY_TAB)
	await _leg([], 0.5, "second figure idle")
	await _cursor_leg(Vector2.ZERO, [], 1.5, "cursor on second figure")
	# The second figure walks from the outpost yard to the first figure's actual
	# exported trail start, then stamps the same northbound boot lanes.
	var first_trail := _rows_for(_read_rows(), "first trail")
	var trail_start: Dictionary = first_trail.front()
	await _goto(Vector2(float(trail_start.x_m), float(trail_start.z_m)), "second figure follows trail")
	await _leg([KEY_W], 3.0, "second figure overlaps trail")
	# Gait phase differs between figures. Several passes cover both boot lanes
	# instead of assuming a particular step lands on an exact world texel.
	for pass_index in range(2):
		await _leg([KEY_S], 3.0, "second figure overlap return %d" % pass_index)
		await _leg([KEY_W], 3.0, "second figure overlap repeat %d" % pass_index)
	await _leg([], 0.5, "shared probe overlapped")
	_tap(KEY_TAB)
	# Navigation reads the latest observation, so let the first figure be observed first.
	await _leg([], 0.5, "first figure idle")
	# The first figure leaves the courtyard through the east gate and revisits the probe.
	await _goto(LANDMARKS.courtyard, "leave courtyard")
	await _goto(LANDMARKS.courtyard_east, "return to east gate")
	await _goto(LANDMARKS.meeting_hall_gap, "leave through east gate")
	var probe_row: Dictionary = _rows_for(_read_rows(), "fresh probe").back()
	await _goto(Vector2(float(probe_row.probe_x_m), float(probe_row.probe_z_m)), "return to trail")
	await _leg([], 0.5, "probe revisited")
	if not headless:
		_tap(KEY_F9)
		await _wait(0.2)
	for step in range(16):
		_tap(KEY_EQUAL)
	await _leg([], 8.2, "wind erases trail")
	await _leg([], 0.5, "erased probe")
	_tap(KEY_0)
	# South from the meeting-hall gap, the shelf ends at cliff rock above the forest.
	await _leg([KEY_S], 3.0, "shelf cliff approach")
	await _leg([KEY_S], 1.2, "shelf cliff blocked")
	# The stair from the compound's south gate is the way down to the forest.
	await _goto(LANDMARKS.meeting_hall_gap, "return to meeting-hall gap")
	await _goto(LANDMARKS.courtyard_east, "re-enter courtyard")
	await _goto(LANDMARKS.courtyard, "cross to south gate")
	await _goto(LANDMARKS.south_gate, "reach south gate")
	await _goto(LANDMARKS.forest_lane, "descend stair")
	# The forest's Deep Snow allows only walking, as does the Deep Snow at the cliff foot.
	await _leg([KEY_S, KEY_SHIFT], 3.0, "run in forest")
	await _leg([KEY_S], 1.0, "boundary blocked")
	# From the forest floor the cliff beside the stair is equally impassable.
	await _goto(LANDMARKS.forest_west, "reach forest west")
	await _leg([KEY_W, KEY_SHIFT], 2.5, "run to forest cliff foot")
	await _leg([KEY_W], 1.2, "forest cliff blocked")
	await _goto(LANDMARKS.forest_lane, "return to stair foot")
	await _goto(LANDMARKS.south_gate, "climb stair")
	# Five steps out reach the 30 m end of the play range; the next opens the overview.
	for step in range(5):
		_wheel(MOUSE_BUTTON_WHEEL_DOWN)
	await _leg([], 0.5, "widest play view")
	for step in range(7):
		_wheel(MOUSE_BUTTON_WHEEL_DOWN)
	await _leg([], 0.5, "whole map")
	if not headless:
		_tap(KEY_F9)
		await _wait(0.2)
	for step in range(12):
		_wheel(MOUSE_BUTTON_WHEEL_UP)
	await _leg([], 0.5, "close view")
	if not headless:
		_tap(KEY_F9)
		await _wait(0.2)
	_tap(KEY_F8)
	await get_tree().process_frame
	_check_record()
	_finish()


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
	checkpoint += 1
	_tap(KEY_F4)
	await get_tree().process_frame
	var rows := _read_rows()
	if rows.is_empty():
		failures.append("No observation available to navigate to " + description)
		return
	var row: Dictionary = rows.back()
	var dz := z - float(row.z_m)
	if absf(dz) > 0.02:
		await _leg([KEY_S] if dz > 0 else [KEY_W], absf(dz) / 2.25, description + " z")
		arrivals.append({"stage": description + " z", "destination": destination})
	var dx := x - float(row.x_m)
	if absf(dx) > 0.02:
		await _leg([KEY_D] if dx > 0 else [KEY_A], absf(dx) / 2.25, description + " x")
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


func _wheel(button: MouseButton) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = button
	event.pressed = true
	Input.parse_input_event(event)
	var released := event.duplicate()
	released.pressed = false
	Input.parse_input_event(released)


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
	var deep_run := 0
	var blocked := 0
	var follow := 0
	var overview := 0
	var previous := {}
	var figure_ids := {}
	var bounds := TownLayout.HALF_EXTENTS - Vector2.ONE * FIGURE_RADIUS_M
	var image_texels := Vector2i((TownLayout.HALF_EXTENTS * 2.0 / FOOTPRINT_TEXEL_M).round())
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
		if above_ground > 1.3 or above_ground < -0.001:
			_fail_once("Figure teleported onto a box roof or below the ground")
		if row.camera_projection != "perspective" or absf(float(row.camera_fov_deg) - CAMERA_FOV_DEG) > 0.01:
			_fail_once("Camera is not a 40° perspective view")
		if absf(float(row.pitch_deg) - CAMERA_PITCH_DEG) > 0.01 or absf(float(row.yaw_deg)) > 0.01:
			_fail_once("Camera tilted or turned away from north-up")
		if float(row.lean_m) > MAX_LEAN_M + 0.0001:
			_fail_once("Camera leaned more than 3 m")
		var distance := float(row.camera_distance_m)
		if row.overview == "true":
			if row.whole_map_visible != "true":
				_fail_once("The overview did not frame the town")
		elif distance < PLAY_RANGE_M.x - 0.001 or distance > PLAY_RANGE_M.y + 0.001:
			_fail_once("Play zoom left the 10–30 m range")
		if absf(float(row.patch_size_m) - 12.8) > 0.001:
			_fail_once("Detailed patch is not 12.8 × 12.8 m")
		if maxf(absf(float(row.patch_x_m) - float(row.x_m)), absf(float(row.patch_z_m) - float(row.z_m))) > 6.401:
			_fail_once("Detailed patch stopped following the controlled figure")
		var image_size := Vector2i(int(row.footprint_image_width), int(row.footprint_image_height))
		if image_size != image_texels or int(row.footprint_image_bytes) != image_texels.x * image_texels.y * 4:
			_fail_once("Footprint image dimensions or allocation changed during traversal")
		if float(row.foot_compaction) < -0.001 or float(row.foot_compaction) > 1.001 or float(row.probe_compaction) < -0.001 or float(row.probe_compaction) > 1.001:
			_fail_once("Snow compaction escaped its bounded range")
		if speed > 4.502:
			_fail_once("Diagonal or running input exceeded the 4.5 m/s cap")
		if input.length() > 0.5 and not obstruction:
			if row.run_requested == "false":
				if absf(speed - 2.25) > 0.003:
					_fail_once("Unobstructed ordinary walking did not stay at 2.25 m/s")
				if absf(input.x) > 0.1 and absf(input.y) > 0.1:
					diagonal += 1
				else:
					straight += 1
			else:
				var expected_speed := lerpf(2.25, 4.5, 1.0 - smoothstep(0.10, 0.40, float(row.loose_depth_m)))
				if absf(speed - expected_speed) > 0.003:
					_fail_once("Running speed did not follow observed loose snow depth")
				if speed > 3.0:
					fast_run += 1
				if float(row.loose_depth_m) >= 0.4 and speed <= 2.3:
					deep_run += 1
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
			if row.other_x_m != previous.other_x_m or row.other_z_m != previous.other_z_m or row.other_steps != previous.other_steps:
				_fail_once("The uncontrolled figure moved or created a footprint")
		previous = row
	if straight < 60 or diagonal < 60 or blocked < 30 or overview < 10 or follow < 1000 or figure_ids.size() != 2:
		failures.append("Missing route coverage: straight=%d diagonal=%d blocked=%d overview=%d follow=%d figures=%d" % [straight, diagonal, blocked, overview, follow, figure_ids.size()])
	if fast_run < 15 or deep_run < 15:
		failures.append("Route did not demonstrate light-snow running and deep-snow walking (fast=%d, deep=%d)" % [fast_run, deep_run])
	var boundary_rows := _rows_for(rows, "boundary blocked")
	var held_boundary := 0
	for row in boundary_rows:
		if row.boundary_limited == "true" and float(row.horizontal_mps) < 0.01:
			held_boundary += 1
	if held_boundary < 30:
		failures.append("Route did not reach and stop at the map boundary")
	var short_steps := _rows_for(rows, "short steps")
	if short_steps.is_empty() or int(short_steps.back().step_count) <= int(short_steps.front().step_count):
		failures.append("Repeated brief taps lost accumulated footsteps")
	_check_start(rows)
	_check_arrivals(rows)
	_check_held_by_obstacle(rows, "lodge blocked", "the lodge")
	_check_held_by_obstacle(rows, "wall blocked", "the courtyard's south wall")
	_check_held_by_obstacle(rows, "shelf cliff blocked", "the cliff rock below the shelf")
	_check_held_by_obstacle(rows, "forest cliff blocked", "the cliff rock above the forest")
	_check_stair(rows)
	_check_courtyard_entry(rows)
	_check_probe(rows)
	_check_second_figure(rows)
	_check_packed_speed(rows)
	_check_snow_zones(rows)
	_check_facing(rows)
	_check_zoom(rows)
	print("Coverage: %d observations; straight %d, diagonal %d, fast run %d, deep run %d, blocked %d, overview %d, camera follow %d" % [rows.size(), straight, diagonal, fast_run, deep_run, blocked, overview, follow])


func _check_start(rows: Array[Dictionary]) -> void:
	# Both figures begin a fresh launch at their outpost yard landmarks.
	var idle := _rows_for(rows, "initial idle")
	if idle.is_empty():
		failures.append("Initial idle observations were missing")
		return
	var row: Dictionary = idle.front()
	var controlled := Vector2(float(row.x_m), float(row.z_m))
	var other := Vector2(float(row.other_x_m), float(row.other_z_m))
	if controlled.distance_to(LANDMARKS.outpost_yard_west) > 0.001 or other.distance_to(LANDMARKS.outpost_yard_east) > 0.001:
		failures.append("The figures did not start at the outpost yard landmarks")


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


func _check_held_by_obstacle(rows: Array[Dictionary], stage: String, obstacle: String) -> void:
	var held := 0
	for row in _rows_for(rows, stage):
		if row.obstacle_limited == "true" and row.boundary_limited == "false" and float(row.horizontal_mps) < 0.01:
			held += 1
	if held < 30:
		failures.append("Route did not reach and stop at %s (%d held observations)" % [obstacle, held])


func _check_stair(rows: Array[Dictionary]) -> void:
	# Down the stair from the south gate to the forest and back up: the ground
	# under the figure changes by about 5 m along one slope, walking speed and
	# snow contact are unchanged on it, and the cliffs keep each level separate.
	var down := _rows_for(rows, "descend stair z")
	var up := _rows_for(rows, "climb stair z")
	if down.is_empty() or up.is_empty():
		failures.append("Stair route stages were missing")
		return
	for stage in [down, up]:
		var heights := Vector2(INF, -INF)
		for row in stage:
			heights = Vector2(minf(heights.x, float(row.ground_y_m)), maxf(heights.y, float(row.ground_y_m)))
			if row.obstacle_limited == "true" or row.boundary_limited == "true":
				_fail_once("The stair or its low walls obstructed the walk between levels")
		# Observations strictly between the two levels lie on the slope.
		var on_slope := 0
		var slope_gap := 0.0
		var slope_speed := 0.0
		for row in stage:
			var ground := float(row.ground_y_m)
			if ground > heights.x + 0.1 and ground < heights.y - 0.1:
				on_slope += 1
				slope_gap = maxf(slope_gap, absf(float(row.contact_gap_m)))
				slope_speed = maxf(slope_speed, absf(float(row.horizontal_mps) - 2.25))
		var change := heights.y - heights.x
		if absf(change - LEVEL_DROP_M) > 0.25:
			failures.append("The stair did not join levels about 5 m apart (observed %.3f m)" % change)
		if on_slope < 120:
			failures.append("Too few observations on the stair's slope (%d)" % on_slope)
		if slope_gap > CONTACT_BOUND_M:
			failures.append("Boots left the snow on the stair's slope (gap %.4f m)" % slope_gap)
		if slope_speed > 0.003:
			failures.append("Walking speed changed on the stair's slope (by %.4f m/s)" % slope_speed)
	if float(down.front().ground_y_m) <= float(down.back().ground_y_m) or float(up.front().ground_y_m) >= float(up.back().ground_y_m):
		failures.append("The route did not walk down the stair and back up")
	# The southern map edge is reached on the forest floor, and the forest cliff
	# is met from below: both stages lie on the lower level.
	for stage in ["boundary blocked", "forest cliff blocked"]:
		for row in _rows_for(rows, stage):
			if absf(float(row.ground_y_m) - float(up.front().ground_y_m)) > 0.01:
				_fail_once("A forest stage left the forest floor")
	for row in _rows_for(rows, "shelf cliff blocked"):
		if absf(float(row.ground_y_m) - float(down.front().ground_y_m)) > 0.01:
			_fail_once("The shelf cliff stage left the town shelf")


func _check_courtyard_entry(rows: Array[Dictionary]) -> void:
	# The east gate is the only opening on the courtyard's east side. Walking
	# through it unobstructed and on into the courtyard shows the gate is passable.
	var entry := _rows_for(rows, "enter courtyard x")
	if entry.is_empty():
		failures.append("Courtyard entry stage was missing")
		return
	var gate: Vector2 = LANDMARKS.east_gate
	var in_gate := 0
	for row in entry:
		if row.obstacle_limited == "true" or row.boundary_limited == "true":
			_fail_once("The east gate obstructed the walk into the courtyard")
		if absf(float(row.x_m) - gate.x) < 0.5 and absf(float(row.z_m) - gate.y) < 0.05:
			in_gate += 1
	var inside := Vector2(float(entry.back().x_m), float(entry.back().z_m))
	if in_gate < 10 or inside.distance_to(LANDMARKS.courtyard_east) > 0.05:
		failures.append("Route did not walk through the east gate into the courtyard")
	var crossed := _rows_for(rows, "probe outside patch")
	if crossed.is_empty() or Vector2(float(crossed.back().x_m), float(crossed.back().z_m)).distance_to(LANDMARKS.courtyard) > 0.05:
		failures.append("Route did not cross the courtyard")


func _check_probe(rows: Array[Dictionary]) -> void:
	var fresh := _rows_for(rows, "fresh probe")
	var outside := _rows_for(rows, "probe outside patch")
	var revisited := _rows_for(rows, "probe revisited")
	var erased := _rows_for(rows, "erased probe")
	if fresh.is_empty() or outside.is_empty() or revisited.is_empty() or erased.is_empty():
		failures.append("Trail probe route stages were missing")
		return
	var original: Dictionary = fresh.back()
	var baseline := float(original.probe_compaction)
	if original.probe_set != "true" or baseline < 0.01:
		failures.append("A moving boot did not leave a measurable footprint at the world probe")
	for row in outside:
		if row.probe_in_patch != "false" or absf(float(row.probe_compaction) - baseline) > 0.001:
			_fail_once("Leaving the detailed patch erased or moved a world footprint")
	var returned: Dictionary = revisited.back()
	if returned.probe_in_patch != "true" or float(returned.probe_compaction) + 0.001 < baseline:
		failures.append("The original footprint was not retained on revisiting its world position")
	var weathered: Dictionary = erased.back()
	if float(weathered.probe_compaction) > 0.001:
		failures.append("120 wind seconds did not erase the undisturbed footprint")
	# Wind also changes the surrounding snow baseline. Refill is the loss of
	# compaction's depression relative to that moving baseline, not rising Y.
	var fresh_depression := float(returned.probe_uncompressed_depth_m) - float(returned.probe_depth_m)
	var weathered_depression := float(weathered.probe_uncompressed_depth_m) - float(weathered.probe_depth_m)
	if fresh_depression < 0.002 or weathered_depression > 0.003:
		failures.append("Weathering did not remove the compressed probe's depression")


func _check_second_figure(rows: Array[Dictionary]) -> void:
	var first_trail := _rows_for(rows, "fresh probe")
	var overlap := _rows_for(rows, "second figure overlaps trail")
	var shared := _rows_for(rows, "shared probe overlapped")
	if first_trail.is_empty() or overlap.is_empty() or shared.is_empty():
		failures.append("Second-figure trail stages were missing")
		return
	if overlap.front().figure_id == first_trail.front().figure_id:
		failures.append("Tab did not transfer control to the other figure")
	if int(overlap.back().step_count) <= int(overlap.front().step_count):
		failures.append("The second figure did not add footsteps to the shared image")
	if float(shared.back().probe_compaction) < float(first_trail.back().probe_compaction) + 0.02:
		failures.append("The second figure did not compact the original figure's probed footprint")


func _check_packed_speed(rows: Array[Dictionary]) -> void:
	var fresh := _rows_for(rows, "run through deep snow")
	var packed := _rows_for(rows, "run on packed trail")
	# The corridor runs north from the meeting-hall lane landmark where both runs start.
	var corridor_z: float = LANDMARKS.meeting_hall_lane.y - 2.0
	var fresh_distance := 0.0
	var fresh_samples := 0
	var fresh_depth := 0.0
	var packed_distance := 0.0
	var packed_samples := 0
	# Compare the same world corridor after several passes, not elapsed legs
	# that may cover different snow. Every included row requests running.
	for row in fresh:
		if absf(float(row.z_m) - corridor_z) <= 1.0 and row.run_requested == "true":
			fresh_distance += float(row.horizontal_mps)
			fresh_depth += float(row.saved_depth_m)
			fresh_samples += 1
	for row in packed:
		if absf(float(row.z_m) - corridor_z) <= 1.0 and row.run_requested == "true":
			packed_distance += float(row.horizontal_mps)
			packed_samples += 1
	var fresh_speed := fresh_distance / maxi(1, fresh_samples)
	var packed_speed := packed_distance / maxi(1, packed_samples)
	print("Same deep corridor, Shift held: fresh %.3f m/s -> packed %.3f m/s (%d / %d samples)" % [fresh_speed, packed_speed, fresh_samples, packed_samples])
	if fresh_samples < 20 or packed_samples < 20 or packed_speed < fresh_speed + 0.10:
		failures.append("Repeated traffic did not produce a measurable running advantage in the same deep corridor")
	if fresh_depth / maxi(1, fresh_samples) < WALK_ONLY_DEPTH_M:
		failures.append("The packed corridor did not start as Deep Snow")


func _check_snow_zones(rows: Array[Dictionary]) -> void:
	# Starting Snow Depth follows the town's places: the courtyard is Shallow, the
	# outpost yard mixes Shallow and Deep, and the forest and cliff feet are Deep.
	var courtyard := _running_rows(rows, "run in courtyard")
	if courtyard.size() < 30:
		failures.append("Too few running observations in the courtyard (%d)" % courtyard.size())
	for row in courtyard:
		if float(row.saved_depth_m) > FULL_RUN_DEPTH_M or float(row.horizontal_mps) < RUN_MPS - 0.003:
			_fail_once("The courtyard's Shallow Snow did not allow full running")
	var full := 0
	var walking := 0
	for row in _running_rows(rows, "run across outpost yard"):
		if float(row.horizontal_mps) >= RUN_MPS - 0.01:
			full += 1
		elif float(row.horizontal_mps) <= WALK_MPS + 0.003:
			walking += 1
	if full < 10 or walking < 10:
		failures.append("The outpost yard did not mix full running and walking (full=%d, walking=%d)" % [full, walking])
	for stage in ["run in forest", "run to forest cliff foot"]:
		var running := _running_rows(rows, stage)
		var walked := 0
		for row in running:
			if float(row.saved_depth_m) < WALK_ONLY_DEPTH_M:
				_fail_once("The forest or a cliff foot did not start with Deep Snow")
			if float(row.horizontal_mps) <= WALK_MPS + 0.003:
				walked += 1
		# Its own arrival prints may pack the first steps of each run.
		if running.size() < 30 or walked < running.size() * 0.9:
			failures.append("Requested running was not held to walking in %s (%d of %d)" % [stage, walked, running.size()])


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
	var corner := _rows_for(rows, "lean to corner")
	if corner.is_empty() or float(corner.back().lean_m) < MAX_LEAN_M - 0.01:
		failures.append("The camera did not lean the full 3 m toward a distant cursor")
	var centred := _rows_for(rows, "cursor on figure")
	if centred.is_empty() or float(centred.back().lean_m) > 0.05:
		failures.append("The lean did not return when the cursor rested on the figure")
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
			if _angle_between(float(row.travel_deg), leg[1]) > 0.5 or absf(float(row.horizontal_mps) - 2.25) > 0.003:
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


func _check_zoom(rows: Array[Dictionary]) -> void:
	var overview := _rows_for(rows, "whole map")
	var close := _rows_for(rows, "close view")
	if overview.is_empty() or overview.back().overview != "true" or overview.back().whole_map_visible != "true":
		failures.append("Zooming out did not reach the whole-map overview")
	if close.is_empty() or close.back().overview != "false" or absf(float(close.back().camera_distance_m) - PLAY_RANGE_M.x) > 0.001:
		failures.append("Zooming in did not stop at the 10 m play distance")
	var widest := _rows_for(rows, "widest play view")
	if widest.is_empty() or widest.back().overview != "false" or absf(float(widest.back().camera_distance_m) - PLAY_RANGE_M.y) > 0.001:
		failures.append("Zooming out did not stop at the 30 m play distance before the overview")


## The compass bearing from the figure to the cursor's ground point.
func _cursor_bearing(row: Dictionary) -> float:
	var offset := Vector2(float(row.cursor_x_m) - float(row.x_m), float(row.cursor_z_m) - float(row.z_m))
	return fposmod(rad_to_deg(atan2(offset.x, -offset.y)), 360.0)


func _angle_between(a: float, b: float) -> float:
	return absf(wrapf(a - b, -180.0, 180.0))


func _fail_once(message: String) -> void:
	if not failures.has(message):
		failures.append(message)

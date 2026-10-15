extends Node
## Drive the running scene through ordinary keyboard/wheel events and public CSV.
## Headless event replay is explicitly labelled; it is not OS input or visual QA.
## Destinations and bounds come from the town layout definition, not the running scene.

const TownLayout = preload("res://town_layout.gd")
const LANDMARKS := TownLayout.LANDMARKS
# Specified values: a figure keeps its 0.3 m radius inside the map, and the
# footprint image covers the whole map at 31.25 mm per texel.
const FIGURE_RADIUS_M := 0.3
const FOOTPRINT_TEXEL_M := 0.03125

var failures: Array[String] = []
var stages := {}
var arrivals: Array[Dictionary] = []
var checkpoint := 0
var route_path := ""
var headless := false


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
	await _short_steps()
	# Both figures start in the outpost yard, where shallow and deep snow mix.
	await _leg([KEY_W], 2.0, "straight walk")
	await _leg([KEY_S], 2.0, "straight return")
	await _leg([KEY_W, KEY_D], 2.0, "diagonal walk")
	await _leg([KEY_S, KEY_A], 2.0, "diagonal return")
	await _leg([KEY_S, KEY_D, KEY_SHIFT], 2.5, "run through thin snow")
	await _goto(LANDMARKS.lodge_front, "reach lodge front")
	await _leg([KEY_W, KEY_D], 2.5, "lodge approach")
	await _leg([KEY_W, KEY_D], 1.2, "lodge blocked")
	await _leg([], 0.5, "blocked idle")
	# Lay a trail in the meeting-hall gap and fix a world probe on it.
	await _goto(LANDMARKS.meeting_hall_gap_south, "reach meeting-hall gap")
	await _leg([KEY_W, KEY_D], 2.0, "first trail")
	_tap(KEY_F5)
	await _leg([], 0.5, "fresh probe")
	# Leave the detailed patch through the compound's east gate into the courtyard.
	await _goto(LANDMARKS.meeting_hall_gap, "leave detailed patch")
	await _goto(LANDMARKS.courtyard_east, "enter courtyard")
	await _leg([KEY_S, KEY_A], 2.2, "wall approach")
	await _leg([KEY_S, KEY_A], 1.2, "wall blocked")
	await _goto(LANDMARKS.courtyard, "cross courtyard")
	await _leg([], 0.5, "probe outside patch")
	await _goto(LANDMARKS.courtyard_west, "reach deep courtyard")
	await _leg([KEY_W, KEY_D, KEY_SHIFT], 2.0, "run through deep snow")
	await _goto(LANDMARKS.courtyard_west, "pack deep trail return")
	await _leg([KEY_W, KEY_D], 2.0, "pack deep trail again")
	await _goto(LANDMARKS.courtyard_west, "packed run start")
	await _leg([KEY_W, KEY_D, KEY_SHIFT], 2.0, "run on packed trail")
	_tap(KEY_TAB)
	await _leg([], 0.5, "second figure idle")
	# The second figure walks from the outpost yard to the first figure's actual
	# exported trail start, then stamps the same northbound boot lanes.
	var first_trail := _rows_for(_read_rows(), "first trail")
	var trail_start: Dictionary = first_trail.front()
	await _goto(Vector2(float(trail_start.x_m), float(trail_start.z_m)), "second figure follows trail")
	await _leg([KEY_W, KEY_D], 3.0, "second figure overlaps trail")
	# Gait phase differs between figures. Several passes cover both boot lanes
	# instead of assuming a particular step lands on an exact world texel.
	for pass_index in range(2):
		await _leg([KEY_S, KEY_A], 3.0, "second figure overlap return %d" % pass_index)
		await _leg([KEY_W, KEY_D], 3.0, "second figure overlap repeat %d" % pass_index)
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
	# South from the meeting-hall gap, past the southern forest, to the map edge.
	await _leg([KEY_S, KEY_A], 12.0, "south boundary")
	await _leg([KEY_S, KEY_A], 1.0, "boundary blocked")
	for step in range(26):
		_wheel(MOUSE_BUTTON_WHEEL_DOWN)
	await _leg([], 0.5, "whole map")
	if not headless:
		_tap(KEY_F9)
		await _wait(0.2)
	for step in range(14):
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


func _short_steps() -> void:
	checkpoint += 1
	stages["short steps"] = checkpoint
	_tap(KEY_F4)
	print("Snow route: repeated brief taps must accumulate foot travel")
	for step in range(10):
		var keys := [KEY_S, KEY_D] if step % 2 == 0 else [KEY_W, KEY_A]
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
	# It walks one straight leg along Z, then one along X, at ordinary walk speed;
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
		await _leg([KEY_S, KEY_A] if dz > 0 else [KEY_W, KEY_D], absf(dz) / 2.25, description + " z")
		arrivals.append({"stage": description + " z", "destination": destination})
	var dx := x - float(row.x_m)
	if absf(dx) > 0.02:
		await _leg([KEY_S, KEY_D] if dx > 0 else [KEY_W, KEY_A], absf(dx) / 2.25, description + " x")
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
		if row.grounded != "true" or absf(float(row.contact_gap_m)) > 0.002:
			_fail_once("Figure lost its observed snow contact")
		if float(row.feet_y_m) > 1.3 or float(row.feet_y_m) < -0.001:
			_fail_once("Figure teleported onto a box roof or below the flat ground")
		if absf(float(row.pitch_deg) + 55.0) > 0.01 or absf(float(row.yaw_deg) - 45.0) > 0.01:
			_fail_once("Camera angle changed")
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
		if float(row.ortho_m) > 117.0 and row.whole_map_visible == "true":
			overview += 1
		if float(row.ortho_m) < 20.0 and absf(float(row.figure_screen_x) - 0.5) < 0.005 and absf(float(row.figure_screen_y) - 0.5) < 0.005:
			follow += 1
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
	_check_courtyard_entry(rows)
	_check_probe(rows)
	_check_second_figure(rows)
	_check_packed_speed(rows)
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
	# The corridor runs north from the deep courtyard landmark where both runs start.
	var corridor_z: float = LANDMARKS.courtyard_west.y - 2.0
	var fresh_distance := 0.0
	var fresh_samples := 0
	var packed_distance := 0.0
	var packed_samples := 0
	# Compare the same world corridor after several passes, not elapsed legs
	# that may cover different snow. Every included row requests running.
	for row in fresh:
		if absf(float(row.z_m) - corridor_z) <= 1.0 and row.run_requested == "true":
			fresh_distance += float(row.horizontal_mps)
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


func _fail_once(message: String) -> void:
	if not failures.has(message):
		failures.append(message)

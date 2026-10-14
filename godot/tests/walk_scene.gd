extends SceneTree
## Exercise the real scene through engine keyboard/wheel events and exported CSV.
## Never address a private scene node, terrain sample or mesh index.

var failures: Array[String] = []


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	change_scene_to_file("res://snow_walk.tscn")
	print("Press F7 in the scene to start the graphical route; keep its window focused.")
	while not Input.is_physical_key_pressed(KEY_F7):
		await process_frame
	await create_timer(0.5).timeout
	_key(KEY_F8, true)
	_key(KEY_F8, false)
	await _leg([KEY_W], 2.0, "straight interior")
	await _leg([KEY_W, KEY_D], 2.0, "diagonal interior")
	await _leg([KEY_W, KEY_A], 14.0, "west boundary approach")
	await _leg([KEY_W, KEY_D], 14.0, "northwest corner")
	await _leg([KEY_S, KEY_D], 29.0, "north perimeter")
	await _leg([KEY_S, KEY_A], 29.0, "east perimeter")
	await _leg([KEY_W, KEY_A], 29.0, "south perimeter")
	await _leg([KEY_W, KEY_D], 29.0, "west perimeter")
	await _leg([KEY_S], 22.0, "interior return")
	for step in range(20):
		_wheel(MOUSE_BUTTON_WHEEL_DOWN)
	await create_timer(0.5).timeout
	_key(KEY_F1, true)
	_key(KEY_F1, false)
	_key(KEY_F9, true)
	_key(KEY_F9, false)
	await create_timer(0.5).timeout
	for step in range(14):
		_wheel(MOUSE_BUTTON_WHEEL_UP)
	await create_timer(0.5).timeout
	_key(KEY_F9, true)
	_key(KEY_F9, false)
	await create_timer(0.5).timeout
	_key(KEY_F1, true)
	_key(KEY_F1, false)
	_key(KEY_F8, true)
	_key(KEY_F8, false)
	await process_frame
	_check_record()
	for failure in failures:
		push_error(failure)
	print("SCENE WALK: ", "PASS" if failures.is_empty() else "FAIL", " · ", failures.size(), " failures")
	quit(0 if failures.is_empty() else 1)


func _leg(keys: Array, seconds: float, description: String) -> void:
	print("Walking: ", description, " for ", seconds, " s")
	for key in keys:
		_key(key, true)
	var elapsed := 0.0
	var unfocused_seconds := 0.0
	var previous_tick := Time.get_ticks_usec()
	var was_focused := true
	while elapsed < seconds:
		await physics_frame
		var now := Time.get_ticks_usec()
		var delta := float(now - previous_tick) / 1000000.0
		previous_tick = now
		if root.has_focus():
			if not was_focused:
				for key in keys:
					_key(key, true)
			elapsed += delta
			was_focused = true
		else:
			if was_focused:
				print("Route paused: restore scene focus to continue ", description)
			was_focused = false
			unfocused_seconds += delta
			if unfocused_seconds > 60.0:
				push_error("Scene remained unfocused for 60 seconds")
				quit(1)
				return
	for key in keys:
		_key(key, false)
	await create_timer(0.2).timeout


func _key(code: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)


func _wheel(button: MouseButton) -> void:
	var event := InputEventMouseButton.new()
	event.button_index = button
	event.pressed = true
	Input.parse_input_event(event)
	var released := event.duplicate()
	released.pressed = false
	Input.parse_input_event(released)


func _check_record() -> void:
	var latest := ""
	for file in DirAccess.get_files_at("user://"):
		if file.begins_with("route-") and file.ends_with(".csv") and file > latest:
			latest = file
	if latest.is_empty():
		failures.append("No public route CSV was written")
		return
	print("Checking recorded scene observations: ", OS.get_user_data_dir().path_join(latest))
	var file := FileAccess.open("user://" + latest, FileAccess.READ)
	var header := file.get_csv_line()
	var count := 0
	var straight := 0
	var diagonal := 0
	var drift_walking := 0
	var boundary := 0
	var overview := 0
	var camera_follow := 0
	var min_x := INF
	var max_x := -INF
	var min_z := INF
	var max_z := -INF
	while not file.eof_reached():
		var values := file.get_csv_line()
		if values.size() != header.size():
			continue
		var row := {}
		for index in range(header.size()):
			row[header[index]] = values[index]
		count += 1
		var x := float(row.x_m)
		var z := float(row.z_m)
		min_x = minf(min_x, x)
		max_x = maxf(max_x, x)
		min_z = minf(min_z, z)
		max_z = maxf(max_z, z)
		if absf(x) > 31.701 or absf(z) > 31.701:
			failures.append("Figure left the footprint at row %d" % count)
		if row.grounded != "true" or absf(float(row.contact_gap_m)) > 0.001:
			failures.append("Lost visible-surface contact at row %d" % count)
		if absf(float(row.pitch_deg) + 55.0) > 0.01 or absf(float(row.yaw_deg) - 45.0) > 0.01:
			failures.append("Camera angle changed at row %d" % count)
		var input := Vector2(float(row.input_x), float(row.input_y))
		if input.length() > 0.5 and row.boundary_limited == "false":
			if absf(float(row.horizontal_mps) - 2.25) > 0.002:
				failures.append("Horizontal walking speed changed at row %d" % count)
			if absf(input.x) > 0.1 and absf(input.y) > 0.1:
				diagonal += 1
			else:
				straight += 1
			if float(row.feet_y_m) > 0.5:
				drift_walking += 1
		if row.boundary_limited == "true":
			boundary += 1
		if float(row.ortho_m) > 117.0 and row.whole_map_visible == "true":
			overview += 1
		if float(row.ortho_m) < 20.0 and absf(float(row.figure_screen_x) - 0.5) < 0.005 and absf(float(row.figure_screen_y) - 0.5) < 0.005:
			camera_follow += 1
	if count < 1000 or straight < 60 or diagonal < 60 or drift_walking < 60 or boundary < 60 or overview < 10 or camera_follow < 1000:
		failures.append("Missing route coverage: total=%d straight=%d diagonal=%d drift=%d boundary=%d overview=%d follow=%d" % [count, straight, diagonal, drift_walking, boundary, overview, camera_follow])
	if min_x > -31.69 or max_x < 31.69 or min_z > -31.69 or max_z < 31.69:
		failures.append("Route did not reach all four boundaries")
	print("Coverage: %d observations, %d straight, %d diagonal, %d drift, %d boundary, %d overview, %d camera follow" % [count, straight, diagonal, drift_walking, boundary, overview, camera_follow])

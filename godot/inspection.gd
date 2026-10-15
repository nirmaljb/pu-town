extends CanvasLayer
## Readable scene observations and opt-in records, independent of terrain internals.

var label := Label.new()
var notice := ""
var recording: FileAccess
var started_ms := 0
var tick := 0
var record_path := ""
const FRAME_TRACE_SECONDS := 60.0
var frame_recording: FileAccess
var frame_record_path := ""
var frame_notice := ""
var frame_started_usec := 0
var previous_frame_usec := 0
var frame_flushed_usec := 0
var frame_count := 0
var observed_usec := 0
var observed_focus := false
var observed_input := Vector2.ZERO
var observed_speed := 0.0
var observed_position := Vector3.ZERO
var observed_camera_size := 0.0


func _ready() -> void:
	var panel := PanelContainer.new()
	panel.position = Vector2(20, 20)
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.055, 0.08, 0.11, 0.88)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	style.set_corner_radius_all(8)
	panel.add_theme_stylebox_override("panel", style)
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_color", Color("e3edf1"))
	panel.add_child(label)
	add_child(panel)


func observe(walker: Node3D, camera: Camera3D, surface: Node3D, focused: bool) -> void:
	# Frame measurements read the latest ordinary scene observation. They never
	# substitute the fixed-rate physics observer or the smoothed HUD fps counter.
	observed_usec = Time.get_ticks_usec()
	observed_focus = focused
	observed_input = walker.direction
	observed_speed = walker.horizontal_speed
	observed_position = walker.position
	observed_camera_size = camera.size
	tick += 1
	if recording:
		var viewport_size := get_viewport().get_visible_rect().size
		var figure_screen := camera.unproject_position(walker.global_position)
		var whole_map_visible := true
		var edge: float = surface.HALF_EXTENT
		for x in [-edge, edge]:
			for z in [-edge, edge]:
				var corner := camera.unproject_position(Vector3(x, 1.0, z))
				whole_map_visible = whole_map_visible and Rect2(Vector2.ZERO, viewport_size).has_point(corner)
		recording.store_csv_line(PackedStringArray([
			str(Time.get_ticks_msec() - started_ms), str(walker.position.x), str(walker.position.y), str(walker.position.z),
			str(walker.direction.x), str(walker.direction.y), str(walker.horizontal_speed), str(walker.grounded),
			str(walker.contact_gap), str(walker.boundary_limited), str(walker.distance_walked),
			str(camera.size), str(camera.rotation_degrees.x), str(camera.rotation_degrees.y),
			str(focused), str(Engine.get_frames_per_second()), str(figure_screen.x / viewport_size.x),
			str(figure_screen.y / viewport_size.y), str(whole_map_visible)
		]))
		if tick % 60 == 0:
			recording.flush()
	if tick % 6 != 0:
		return
	var contact := "grounded" if walker.grounded else "NO SURFACE"
	label.text = "SNOW WALK  /  %d × %d m\nWASD walk · wheel zoom · F1 overlay\nF6 measure frames (60s) · F8 record route · F9 capture view\n\nFigure 1.70 m · walk 2.25 m/s\nFeet  X %6.2f   Y %5.3f   Z %6.2f m\nHorizontal %4.2f m/s · %s\nTravel %6.2f m · boundary %s\nSnow interior %.3f–%.3f m\nOuter drift %.3f–%.3f m\nOrtho %5.1f m · angle 55° / 45°\n%s  ·  %d fps\n%s\n%s" % [
		surface.HALF_EXTENT * 2, surface.HALF_EXTENT * 2,
		walker.position.x, walker.position.y, walker.position.z,
		walker.horizontal_speed, contact, walker.distance_walked,
		"held" if walker.boundary_limited else "clear",
		surface.interior_height_range.x, surface.interior_height_range.y,
		surface.perimeter_height_range.x, surface.perimeter_height_range.y,
		camera.size, "Focused" if focused else "Input paused", Engine.get_frames_per_second(),
		"RECORDING  " + record_path if recording else notice,
		"FRAME TRACE  %.1f / %.0f s" % [float(Time.get_ticks_usec() - frame_started_usec) / 1000000.0, FRAME_TRACE_SECONDS] if frame_recording and frame_started_usec > 0 else frame_notice
	]


func start_frame_recording() -> void:
	if frame_recording:
		return
	frame_record_path = "user://frames-%s.csv" % str(Time.get_unix_time_from_system()).replace(".", "-")
	frame_recording = FileAccess.open(frame_record_path, FileAccess.WRITE)
	if not frame_recording:
		frame_notice = "Could not open frame trace"
		push_error(frame_notice)
		return
	frame_started_usec = 0
	previous_frame_usec = 0
	frame_count = 0
	frame_notice = "Frame trace starting; walk for 60 real seconds"
	frame_recording.store_csv_line(PackedStringArray([
		"frame", "interval_start_usec", "interval_end_usec", "frame_ms", "elapsed_ms", "focused", "moving",
		"input_x", "input_y", "horizontal_mps", "x_m", "feet_y_m", "z_m", "ortho_m",
		"viewport_width", "viewport_height", "window_width", "window_height", "observation_age_ms"
	]))
	print("Recording 60-second frame trace: ", ProjectSettings.globalize_path(frame_record_path))


func _process(_delta: float) -> void:
	if not frame_recording:
		return
	var now := Time.get_ticks_usec()
	if previous_frame_usec == 0:
		# Anchor at the first measured frame, excluding its pre-start interval.
		frame_started_usec = now
		previous_frame_usec = now
		frame_flushed_usec = now
		return
	frame_count += 1
	var viewport_size := get_viewport().get_visible_rect().size
	var window_size := get_window().size
	frame_recording.store_csv_line(PackedStringArray([
		str(frame_count), str(previous_frame_usec), str(now), str(float(now - previous_frame_usec) / 1000.0),
		str(float(now - frame_started_usec) / 1000.0), str(observed_focus), str(observed_speed > 0.01),
		str(observed_input.x), str(observed_input.y), str(observed_speed),
		str(observed_position.x), str(observed_position.y), str(observed_position.z), str(observed_camera_size),
		str(viewport_size.x), str(viewport_size.y), str(window_size.x), str(window_size.y),
		str(float(now - observed_usec) / 1000.0)
	]))
	previous_frame_usec = now
	if now - frame_flushed_usec >= 1000000:
		frame_recording.flush()
		frame_flushed_usec = now
	# Focus loss never pauses the clock or discards its slower rendered frames.
	if float(now - frame_started_usec) / 1000000.0 >= FRAME_TRACE_SECONDS:
		_finish_frame_recording(true)


func _finish_frame_recording(complete: bool) -> void:
	frame_recording.close()
	frame_recording = null
	var duration := float(previous_frame_usec - frame_started_usec) / 1000000.0 if frame_started_usec > 0 else 0.0
	frame_notice = "%s frame trace: %d frames / %.3f s" % ["Saved" if complete else "Interrupted", frame_count, duration]
	print(frame_notice, " (", ProjectSettings.globalize_path(frame_record_path), ")")


func _exit_tree() -> void:
	if frame_recording:
		_finish_frame_recording(false)


func toggle_recording() -> void:
	if recording:
		recording.close()
		recording = null
		notice = "Saved " + record_path
		print(notice)
		return
	record_path = "user://route-%s.csv" % str(Time.get_unix_time_from_system()).replace(".", "-")
	recording = FileAccess.open(record_path, FileAccess.WRITE)
	if not recording:
		notice = "Could not open route recording"
		return
	started_ms = Time.get_ticks_msec()
	recording.store_csv_line(PackedStringArray([
		"elapsed_ms", "x_m", "feet_y_m", "z_m", "input_x", "input_y", "horizontal_mps", "grounded",
		"contact_gap_m", "boundary_limited", "travel_m", "ortho_m", "pitch_deg", "yaw_deg", "focused", "fps",
		"figure_screen_x", "figure_screen_y", "whole_map_visible"
	]))
	print("Recording route: ", ProjectSettings.globalize_path(record_path))


func capture() -> void:
	await RenderingServer.frame_post_draw
	var path := "user://capture-%s.png" % str(Time.get_unix_time_from_system()).replace(".", "-")
	var result := get_viewport().get_texture().get_image().save_png(path)
	notice = "Saved " + path if result == OK else "Capture failed"
	print(notice, " (", ProjectSettings.globalize_path(path), ")")

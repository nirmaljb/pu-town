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
var checkpoint := 0
var probe_set := false
var probe := Vector2.ZERO
var probe_depth := 0.0
var probe_compaction := 0.0
var latest := {}

const ROUTE_COLUMNS := [
	"elapsed_ms", "x_m", "feet_y_m", "z_m", "input_x", "input_y", "horizontal_mps", "grounded",
	"contact_gap_m", "boundary_limited", "travel_m", "ortho_m", "pitch_deg", "yaw_deg", "focused", "fps",
	"figure_screen_x", "figure_screen_y", "whole_map_visible", "checkpoint", "figure_id", "run_requested",
	"snow_depth_m", "loose_depth_m", "foot_compaction", "sink_depth_m", "obstacle_limited", "step_count",
	"patch_x_m", "patch_z_m", "patch_size_m", "wind_strength", "wind_elapsed_s", "footprint_count",
	"footprint_image_size", "footprint_image_bytes", "probe_set", "probe_x_m", "probe_z_m",
	"probe_depth_m", "probe_uncompressed_depth_m", "probe_compaction", "probe_in_patch", "other_figure_id", "other_x_m", "other_z_m", "other_steps"
]


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


func observe(walker: Node3D, camera: Camera3D, surface: Node3D, focused: bool, other: Node3D = null) -> void:
	# The observer is the scene's exported inspection seam. Test routes read its
	# CSV, never the walker, mesh, physics nodes or procedural snow samples.
	observed_usec = Time.get_ticks_usec()
	observed_focus = focused
	observed_input = walker.direction
	observed_speed = walker.horizontal_speed
	observed_position = walker.position
	observed_camera_size = camera.size
	tick += 1
	if probe_set:
		probe_depth = surface.sample_depth(probe)
		probe_compaction = surface.sample_compaction(probe)
	var viewport_size := get_viewport().get_visible_rect().size
	var figure_screen := camera.unproject_position(walker.global_position)
	var whole_map_visible := true
	var edge: float = surface.HALF_EXTENT
	for x in [-edge, edge]:
		for z in [-edge, edge]:
			var corner := camera.unproject_position(Vector3(x, 1.0, z))
			whole_map_visible = whole_map_visible and Rect2(Vector2.ZERO, viewport_size).has_point(corner)
	var probe_offset: Vector2 = (probe - surface.patch_center).abs()
	latest = {
		"elapsed_ms": Time.get_ticks_msec() - started_ms,
		"x_m": walker.position.x, "feet_y_m": walker.position.y, "z_m": walker.position.z,
		"input_x": walker.direction.x, "input_y": walker.direction.y,
		"horizontal_mps": walker.horizontal_speed, "grounded": walker.grounded,
		"contact_gap_m": walker.contact_gap, "boundary_limited": walker.boundary_limited,
		"travel_m": walker.distance_walked, "ortho_m": camera.size,
		"pitch_deg": camera.rotation_degrees.x, "yaw_deg": camera.rotation_degrees.y,
		"focused": focused, "fps": Engine.get_frames_per_second(),
		"figure_screen_x": figure_screen.x / viewport_size.x,
		"figure_screen_y": figure_screen.y / viewport_size.y,
		"whole_map_visible": whole_map_visible, "checkpoint": checkpoint,
		"figure_id": walker.figure_id, "run_requested": walker.run_requested,
		"snow_depth_m": walker.snow_depth, "loose_depth_m": walker.loose_depth,
		"foot_compaction": walker.foot_compaction, "sink_depth_m": walker.sink_depth,
		"obstacle_limited": walker.obstacle_limited, "step_count": walker.step_count,
		"patch_x_m": surface.patch_center.x, "patch_z_m": surface.patch_center.y,
		"patch_size_m": surface.PATCH_SIZE, "wind_strength": surface.wind_strength,
		"wind_elapsed_s": surface.wind_elapsed, "footprint_count": surface.footprint_count,
		"footprint_image_size": surface.IMAGE_SIZE, "footprint_image_bytes": surface.footprint_image_bytes,
		"probe_set": probe_set, "probe_x_m": probe.x, "probe_z_m": probe.y,
		"probe_depth_m": probe_depth, "probe_uncompressed_depth_m": surface.sample_uncompressed_depth(probe) if probe_set else 0.0, "probe_compaction": probe_compaction,
		"probe_in_patch": probe_set and maxf(probe_offset.x, probe_offset.y) <= surface.PATCH_SIZE * 0.5,
		"other_figure_id": other.figure_id if other else -1,
		"other_x_m": other.position.x if other else 0.0, "other_z_m": other.position.z if other else 0.0,
		"other_steps": other.step_count if other else 0
	}
	if recording:
		_write_observation()
		if tick % 60 == 0:
			recording.flush()
	if tick % 6 != 0:
		return
	var contact := "grounded" if walker.grounded else "NO SURFACE"
	label.text = "SNOW TOWN  /  %d × %d m   ·   Figure %d\nWASD walk · Shift run · Tab switch · wheel zoom\n− / = wind · 0 reset wind · F1 overlay\nF4 checkpoint · F5 trail probe · F6 frames · F8 CSV · F9 capture\n\nFeet X %6.2f   Y %5.3f   Z %6.2f m\nHorizontal %4.2f m/s · %s · %s\nSnow %.3f m · loose %.3f m · sunk %.3f m\nPacked %.0f%% · steps %d · travel %.2f m\nDetailed patch %.1f × %.1f m at %.1f, %.1f\nWind %.0f · weather clock %.1f s · stamps %d\nShared image %d² · %.0f MiB · checkpoint %d\n%s\nOrtho %5.1f m · angle 55° / 45° · %s · %d fps\n%s\n%s" % [
		surface.HALF_EXTENT * 2, surface.HALF_EXTENT * 2, walker.figure_id,
		walker.position.x, walker.position.y, walker.position.z,
		walker.horizontal_speed, contact,
		"obstacle" if walker.obstacle_limited else ("boundary" if walker.boundary_limited else "clear"),
		walker.snow_depth, walker.loose_depth, walker.sink_depth,
		walker.foot_compaction * 100.0, walker.step_count, walker.distance_walked,
		surface.PATCH_SIZE, surface.PATCH_SIZE, surface.patch_center.x, surface.patch_center.y,
		surface.wind_strength, surface.wind_elapsed, surface.footprint_count,
		surface.IMAGE_SIZE, float(surface.footprint_image_bytes) / 1048576.0, checkpoint,
		"Probe %.1f, %.1f: packed %.0f%% · %s" % [probe.x, probe.y, probe_compaction * 100.0, "in patch" if latest.probe_in_patch else "outside patch"] if probe_set else "F5 follows the latest boot print with a fixed world probe",
		camera.size, "Focused" if focused else "Input paused", Engine.get_frames_per_second(),
		"RECORDING  " + record_path if recording else notice,
		"FRAME TRACE  %.1f / %.0f s" % [float(Time.get_ticks_usec() - frame_started_usec) / 1000000.0, FRAME_TRACE_SECONDS] if frame_recording and frame_started_usec > 0 else frame_notice
	]


func _write_observation() -> void:
	var values := PackedStringArray()
	for column in ROUTE_COLUMNS:
		values.append(str(latest[column]))
	recording.store_csv_line(values)


func mark_checkpoint() -> void:
	checkpoint += 1
	if recording:
		# Flush the last completed physics observation immediately so inspection
		# tools can read a checkpoint without synchronizing on private scene state.
		recording.flush()
	print("Inspection checkpoint ", checkpoint)


func mark_trail(walker: Node3D, _surface: Node3D) -> void:
	probe = walker.last_footprint if walker.has_footprint else Vector2(walker.position.x, walker.position.z)
	probe_set = true
	print("World trail probe: ", probe)


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
	checkpoint = 0
	recording.store_csv_line(PackedStringArray(ROUTE_COLUMNS))
	recording.flush()
	print("Recording route: ", ProjectSettings.globalize_path(record_path))


func capture() -> void:
	await RenderingServer.frame_post_draw
	var path := "user://capture-%s.png" % str(Time.get_unix_time_from_system()).replace(".", "-")
	var result := get_viewport().get_texture().get_image().save_png(path)
	notice = "Saved " + path if result == OK else "Capture failed"
	print(notice, " (", ProjectSettings.globalize_path(path), ")")

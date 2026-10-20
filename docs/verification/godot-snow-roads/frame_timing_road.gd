extends SceneTree
# Roads record: mean, p95 and worst frame time over 900 frames, vsync off, HUD hidden,
# at the play distance, while the controlled figure walks back and forth along the
# south-west Road beside the south-west tree cluster, laying prints, with the wind's
# mean work per physics update over the same frames. Adapted from
# docs/verification/godot-snow-flat-interim-map/frame_timing.gd; it reads only fields
# both the Camp build and the Roads build expose, so the same script times both. Run
# from the repository root without --fixed-fps; add `-- --camp` to walk east and west
# across the Town Square from (-4, 4) instead, past the Camp's lit buildings:
#   "$GODOT" --path godot -s "$PWD/docs/verification/godot-snow-roads/frame_timing_road.gd"
# Source-only engine timing: not a release package and not ordinary OS input.
const WARM_FRAMES := 300
const MEASURED_FRAMES := 900

var scene: Node
var frames := 0
var times: Array[float] = []
var last := 0
var wind_start := Vector2.ZERO
var camp := false


func _initialize() -> void:
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	camp = OS.get_cmdline_user_args().has("--camp")
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _process(delta: float) -> bool:
	scene.focused = false
	scene.inspection.visible = false
	scene.camera.cursor_inside = false
	frames += 1
	if frames == 2:
		# On the south-west Road's centre line, 10 m from its Town Square corner, or in the Town Square.
		scene.walker.position = Vector3(-4, 0, 4) if camp else Vector3(-27, 0, 22)
	# Six seconds out, six back, at the frame's own step, so slow frames walk further.
	var out := int(Time.get_ticks_msec() / 6000) % 2 == 0
	var along := Vector2(1, 0.15) if camp else Vector2(-1, 1).normalized()
	scene.walker._move(minf(delta, 0.1), along if out else -along)
	var now := Time.get_ticks_usec()
	if frames == WARM_FRAMES:
		wind_start = Vector2(scene.surface.wind_total_ms, scene.surface.wind_updates)
	if frames > WARM_FRAMES:
		times.append((now - last) / 1000.0)
	last = now
	if times.size() >= MEASURED_FRAMES:
		var wind := Vector2(scene.surface.wind_total_ms, scene.surface.wind_updates) - wind_start
		times.sort()
		var total := 0.0
		for t in times:
			total += t
		print("TIMING %s window %s · mean %.2f ms (%.1f fps) · p95 %.2f ms · worst %.2f ms · wind %.3f ms per update over %d updates · figure %s" % [
			"camp" if camp else "road", DisplayServer.window_get_size(), total / times.size(), 1000.0 * times.size() / total,
			times[int(times.size() * 0.95)], times.back(), wind.x / maxf(1.0, wind.y), int(wind.y), scene.walker.position])
		return true
	return false

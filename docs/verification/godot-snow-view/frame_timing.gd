extends SceneTree
# Reference view record: mean, p95 and worst frame time over 900 frames, vsync off,
# HUD hidden, at the play distance, while the controlled figure walks back and forth
# across the outpost yard laying prints. Run from the repository root without
# --fixed-fps; the window is the revision's default unless --resolution is given:
#   "$GODOT" --path godot -s "$PWD/docs/verification/godot-snow-view/frame_timing.gd"
const WARM_FRAMES := 300
const MEASURED_FRAMES := 900

var scene: Node
var frames := 0
var times: Array[float] = []
var last := 0


func _initialize() -> void:
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _process(delta: float) -> bool:
	scene.focused = false
	scene.inspection.visible = false
	scene.camera.cursor_inside = false
	frames += 1
	if frames == 2:
		scene.walker.position = Vector3(30, 0, 0)
	# Six seconds east, six west, at the frame's own step, so slow frames walk further.
	var east := int(Time.get_ticks_msec() / 6000) % 2 == 0
	scene.walker._move(minf(delta, 0.1), Vector2(1 if east else -1, 0.15))
	var now := Time.get_ticks_usec()
	if frames > WARM_FRAMES:
		times.append((now - last) / 1000.0)
	last = now
	if times.size() >= MEASURED_FRAMES:
		times.sort()
		var total := 0.0
		for t in times:
			total += t
		print("TIMING window %s · mean %.2f ms (%.1f fps) · p95 %.2f ms · worst %.2f ms" % [DisplayServer.window_get_size(), total / times.size(), 1000.0 * times.size() / total, times[int(times.size() * 0.95)], times.back()])
		return true
	return false

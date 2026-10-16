extends SceneTree
# Blizzard record (copied unchanged from the shading record): mean and p95 frame time over 600 frames, vsync off, standing at the lodge
# lee after walking prints, camera 16 m, HUD hidden. Run like capture_views.gd,
# without --fixed-fps.
var scene: Node
var frames := 0
var times: Array[float] = []
var last := 0
func _initialize() -> void:
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)
func _process(_d: float) -> bool:
	scene.focused = false
	scene.inspection.visible = false
	scene.camera.cursor_inside = false
	frames += 1
	if frames == 2:
		scene.walker.position = Vector3(36, 0, -3)
	if frames < 200:
		scene.walker._move(1.0 / 60.0, Vector2(-1, 0))
	var now := Time.get_ticks_usec()
	if frames > 300 and frames <= 900:
		times.append((now - last) / 1000.0)
	last = now
	if frames > 900:
		times.sort()
		var total := 0.0
		for t in times: total += t
		print("TIMING mean %.2f ms p95 %.2f ms" % [total / times.size(), times[int(times.size() * 0.95)]])
		return true
	return false

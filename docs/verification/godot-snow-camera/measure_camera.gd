extends SceneTree
## Walk the controlled figure east and west along one line from (SX, SZ), default
## the outpost yard's (20, 4), and report per leg the camera's vertical travel with
## its slow trend removed (0.5 s centred mean), its fastest vertical speed, and the
## lean and Facing wobble, skipping each leg's first half second of turning.
## Run: SX=20 SZ=4 "$GODOT_BIN" --headless --path godot --fixed-fps 60 \
##   --script <this file> -- --headless-scene-check
## For revision 636a860, whose camera took the figure's height, the follow call
## below was `scene.camera.follow(scene.walker.position, 0.0)`.

var scene: Node
var rows: Array = []


func _initialize() -> void:
	_run.call_deferred()


func _key(code: Key, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = code
	event.keycode = code
	event.pressed = pressed
	Input.parse_input_event(event)


func _run() -> void:
	change_scene_to_file("res://snow_walk.tscn")
	await process_frame
	await process_frame
	scene = current_scene
	var start := Vector2(float(OS.get_environment("SX") if OS.get_environment("SX") != "" else "20"), float(OS.get_environment("SZ") if OS.get_environment("SZ") != "" else "4"))
	scene.walker.position = Vector3(start.x, 0, start.y)
	scene.walker._feet.assign([start + Vector2(-0.1, 0), start + Vector2(0.1, 0)])
	scene.camera.follow(scene.walker.untouched_position(), scene.walker.sink_depth, 0.0)
	# A cursor held up and to the right on screen.
	var motion := InputEventMouseMotion.new()
	motion.position = Vector2(root.get_visible_rect().size) * Vector2(0.8, 0.3)
	scene.camera.point_at(motion.position)
	for frame in 30:
		await physics_frame
	for leg in 6:
		var key := KEY_D if leg % 2 == 0 else KEY_A
		_key(key, true)
		var samples: Array = []
		for frame in 150:
			await physics_frame
			samples.append([scene.camera.position.y, scene.walker.position.y, scene.camera.lean.x, scene.camera.lean.y, scene.walker.facing_yaw, scene.walker.loose_depth, scene.walker.snow_depth])
		_key(key, false)
		for frame in 20:
			await physics_frame
		_report(leg, samples)
	quit()


func _report(leg: int, samples: Array) -> void:
	# Remove the slow trend with a 0.5 s centred moving average; what remains is per-step motion.
	var n := samples.size()
	var half := 15
	var cam_dev := 0.0
	var cam_pp := []
	var lean_dev := 0.0
	var face_dev := 0.0
	var count := 0
	var depth := 0.0
	var vel_max := 0.0
	for i in range(half + 30, n - half):
		var mean := [0.0, 0.0, 0.0, 0.0]
		for j in range(i - half, i + half + 1):
			mean[0] += samples[j][0]
			mean[1] += samples[j][2]
			mean[2] += samples[j][3]
			mean[3] += samples[j][4]
		for k in 4:
			mean[k] /= float(2 * half + 1)
		var d: float = samples[i][0] - mean[0]
		cam_dev = maxf(cam_dev, absf(d))
		cam_pp.append(d)
		lean_dev = maxf(lean_dev, Vector2(samples[i][2] - mean[1], samples[i][3] - mean[2]).length())
		face_dev = maxf(face_dev, absf(samples[i][4] - mean[3]))
		vel_max = maxf(vel_max, absf(samples[i][0] - samples[i - 1][0]) * 60.0)
		depth += samples[i][5]
		count += 1
	var lo: float = cam_pp.min()
	var hi: float = cam_pp.max()
	print("leg %d  loose %.2f m  camera y per-step p-p %.1f cm  max vert speed %.2f m/s  lean wobble %.1f cm  facing wobble %.2f°" % [
		leg, depth / count, (hi - lo) * 100.0, vel_max, lean_dev * 100.0, rad_to_deg(face_dev)])

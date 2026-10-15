extends SceneTree
# Capture driver for the shading record: fixed, input-free views of the snow town for
# before/after comparison. It ignores window focus and the real pointer and drives
# the figure through private members, so it is visual evidence, not a scene route.
# From the repository root:
#   CAPTURE_DIR=/abs/out CAPTURE_SET=drift|prints "$GODOT" --path godot \
#     --resolution 1280x800 --fixed-fps 60 -s "$PWD/docs/verification/godot-snow-shading/capture_views.gd"
var scene: Node
var out := ""
var steps: Array = []
var step_index := 0
var step_frames := 0
var walk_dir := Vector2.ZERO

func _initialize() -> void:
	out = OS.get_environment("CAPTURE_DIR")
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)
	for c in root.focus_entered.get_connections():
		root.focus_entered.disconnect(c.callable)
	var which := OS.get_environment("CAPTURE_SET")
	if which == "drift":
		steps = [
			["place", Vector2(31, -1.5)], ["face", Vector2(31, 5)], ["wind", 16.0], ["wait", 15.0],
			["distance", 16.0], ["wait", 0.5], ["shot", "drift-16m"],
			["place", Vector2(35, -4.8)], ["distance", 10.0], ["wait", 0.5], ["shot", "drift-10m"],
			["place", Vector2(30, 4)], ["distance", 22.7], ["wait", 0.5], ["shot", "drift-23m"],
			["wind", 1.0], ["place", Vector2(-23.5, 2)], ["distance", 30.0], ["wait", 0.5], ["shot", "level-30m"],
			["overview"], ["wait", 0.5], ["shot", "overview"],
		]
	else:
		steps = [
			["wind", 16.0], ["wait", 15.0], ["turn", 4], ["wait", 10.0], ["wind", 1.0],
			["place", Vector2(35, -4.8)], ["walk", Vector2(-1, 0), 2.0], ["face", Vector2(28, -4.8)],
			["distance", 10.0], ["wait", 0.8], ["shot", "prints-lee-10m"],
			["place", Vector2(20, 4)], ["walk", Vector2(1, 0), 2.0], ["face", Vector2(30, 4)], ["wait", 0.8], ["shot", "prints-yard-10m"],
			["place", Vector2(-4.5, 6)], ["walk", Vector2(0, -1), 2.0], ["face", Vector2(-4.5, -4)], ["wait", 0.8], ["shot", "prints-deep-10m"],
			["place", Vector2(-25, 0)], ["walk", Vector2(1, 0), 2.0], ["face", Vector2(-15, 0)], ["wait", 0.8], ["shot", "prints-courtyard-10m"],
			["distance", 16.0], ["wait", 0.5], ["shot", "prints-courtyard-16m"],
		]

func _physics_process(delta: float) -> bool:
	scene.focused = false
	scene.inspection.visible = false
	scene.camera.cursor_inside = false
	if walk_dir != Vector2.ZERO:
		scene.walker._move(delta, walk_dir)
	if step_index >= steps.size():
		return true
	var step: Array = steps[step_index]
	step_frames += 1
	match step[0]:
		"place":
			scene.walker.position = Vector3(step[1].x, 0, step[1].y)
			scene.camera.lean = Vector2.ZERO
			_next()
		"face":
			scene.walker.face_toward(step[1])
			_next()
		"wind":
			scene.surface.wind_strength = step[1]
			_next()
		"turn":
			scene.surface.turn_wind(step[1])
			_next()
		"distance":
			scene.camera.overview = false
			scene.camera.distance = step[1]
			_next()
		"overview":
			scene.camera.overview = true
			_next()
		"wait":
			if step_frames >= int(step[1] * 60.0):
				_next()
		"walk":
			walk_dir = step[1]
			if step_frames >= int(step[2] * 60.0):
				walk_dir = Vector2.ZERO
				_next()
		"shot":
			if step_frames == 1:
				_shoot(step[1])
			if step_frames >= 10:
				_next()
	return false

func _shoot(name: String) -> void:
	await RenderingServer.frame_post_draw
	var path := out + "/" + name + ".png"
	root.get_texture().get_image().save_png(path)
	print("captured ", path)

func _next() -> void:
	step_index += 1
	step_frames = 0

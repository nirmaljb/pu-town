extends SceneTree
# Capture driver for the walking Facing record: the controlled figure walks north
# from the outpost yard while the cursor's ground point sits 4 m from it, south-east,
# directly behind, then south-west. It holds W through Godot's input API, keeps the
# scene focused and moves the camera's cursor directly each frame, so it is visual
# evidence for before/after comparison, not a scene route. From the repository root:
#   CAPTURE_DIR=/abs/out "$GODOT" --path godot \
#     --resolution 1280x800 --fixed-fps 60 -s "$PWD/docs/verification/godot-snow-facing/capture_facing.gd"
const WALK := Vector2i(30, 230)
# From each frame on, the cursor's compass bearing from the figure.
const BEARINGS := [[0, 90.0], [WALK.x, 135.0], [110, 180.0], [170, 225.0]]
const SHOTS := {100: "walk-north-cursor-se", 160: "walk-north-cursor-behind", 225: "walk-north-cursor-sw"}
const CURSOR_DISTANCE := 4.0

var scene: Node
var out := ""
var frame := 0


func _initialize() -> void:
	out = OS.get_environment("CAPTURE_DIR")
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _physics_process(_delta: float) -> bool:
	scene.focused = true
	scene.inspection.visible = false
	scene.camera.distance = 10.0
	var bearing := 0.0
	for entry in BEARINGS:
		if frame >= entry[0]:
			bearing = entry[1]
	var figure: Vector3 = scene.walker.position
	var direction := Vector2(sin(deg_to_rad(bearing)), -cos(deg_to_rad(bearing)))
	var ground := Vector3(figure.x + direction.x * CURSOR_DISTANCE, figure.y, figure.z + direction.y * CURSOR_DISTANCE)
	scene.camera.point_at(scene.camera.unproject_position(ground))
	if frame == WALK.x or frame == WALK.y:
		var event := InputEventKey.new()
		event.physical_keycode = KEY_W
		event.keycode = KEY_W
		event.pressed = frame == WALK.x
		Input.parse_input_event(event)
		Input.flush_buffered_events()
	if SHOTS.has(frame):
		var path := out.path_join(SHOTS[frame] + ".png")
		root.get_texture().get_image().save_png(path)
		print("Saved ", path, " · facing %.0f° · travel %.0f° · z %.2f m · %.2f m/s" % [fposmod(-rad_to_deg(scene.walker.facing_yaw), 360.0), fposmod(-rad_to_deg(scene.walker.travel_yaw), 360.0), scene.walker.position.z, scene.walker.horizontal_speed])
	frame += 1
	return frame > WALK.y + 10

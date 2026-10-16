extends SceneTree
# Capture driver for the parka walk record. From the outpost yard the controlled
# figure walks west into the Shallow Snow, seen from its left side as in the owner's
# recording, then turns and walks east, past where it started, into the yard's
# Deep drift, and stands there. The cursor's ground point sits 1 m ahead so Facing
# follows travel without leaning the camera off the figure. It holds the keys
# through Godot's input API, keeps the scene focused and moves the camera's cursor
# directly each frame, so it is visual evidence for before/after comparison, not a
# scene route. Twelve frames, every third, are saved from each leg's capture frame
# on, with the figure's screen position, speed and how far its boots have sunk.
# From the repository root:
#   CAPTURE_DIR=/abs/out "$GODOT" --path godot \
#     --resolution 1280x800 --fixed-fps 60 -s "$PWD/docs/verification/parka-walk/capture_walk.gd"
const CURSOR_DISTANCE := 1.0
# [first frame, keys held, cursor bearing, name, frames into the leg before capturing]
const LEGS := [[30, [KEY_A], 270.0, "walk-west", 60], [150, [KEY_D], 90.0, "walk-deep", 540],
	[750, [], 90.0, "stand", 30]]
const END := 820

var scene: Node
var out := ""
var frame := 0
var held: Array = []
var log_lines := PackedStringArray()


func _initialize() -> void:
	out = OS.get_environment("CAPTURE_DIR")
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _press(keys: Array) -> void:
	for key in held:
		_key(key, false)
	for key in keys:
		_key(key, true)
	held = keys
	Input.flush_buffered_events()


func _key(key: int, pressed: bool) -> void:
	var event := InputEventKey.new()
	event.physical_keycode = key
	event.keycode = key
	event.pressed = pressed
	Input.parse_input_event(event)


func _physics_process(_delta: float) -> bool:
	scene.focused = true
	scene.inspection.visible = false
	scene.camera.distance = 10.0
	var leg: Array = LEGS[0]
	for entry in LEGS:
		if frame >= entry[0]:
			leg = entry
	if frame == leg[0]:
		_press(leg[1])
	var figure: Vector3 = scene.walker.position
	var bearing := deg_to_rad(leg[2])
	var ground := figure + Vector3(sin(bearing), 0, -cos(bearing)) * CURSOR_DISTANCE
	scene.camera.point_at(scene.camera.unproject_position(ground))
	var into_leg: int = frame - leg[0] - leg[4]
	if into_leg >= 0 and into_leg < 36 and into_leg % 3 == 0:
		var name := "%s-%02d" % [leg[3], into_leg / 3]
		root.get_texture().get_image().save_png(out.path_join(name + ".png"))
		var screen: Vector2 = scene.camera.unproject_position(figure + Vector3(0, 0.85, 0))
		log_lines.append("%s,%.1f,%.1f,%.3f,%.3f,%.3f" % [name, screen.x, screen.y, scene.walker.horizontal_speed,
			scene.walker.sink_depth, scene.walker.loose_depth])
	frame += 1
	if frame > END:
		var file := FileAccess.open(out.path_join("positions.csv"), FileAccess.WRITE)
		file.store_string("shot,x,y,speed_mps,sink_m,loose_m\n" + "\n".join(log_lines) + "\n")
		return true
	return false

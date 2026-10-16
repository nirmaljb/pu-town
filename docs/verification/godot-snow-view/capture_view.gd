extends SceneTree
# Capture driver for the reference view record. It frames the outpost yard at the
# play distance and at the widest play distance, then the M overview, and follows
# the walking figure into the compound's courtyard, with the HUD hidden and no
# lightning. Distances come from the running camera, so the same script frames
# either revision. Visual evidence, not a scene route. From the repository root,
# with the window at the revision's own default size:
#   CAPTURE_DIR=/abs/out "$GODOT" --path godot --fixed-fps 60 \
#     -s "$PWD/docs/verification/godot-snow-view/capture_view.gd"
const SHOTS := {90: "yard-play", 150: "yard-widest", 210: "overview"}
const LAST_FRAME := 1800

var scene: Node
var out := ""
var frame := 0
var courtyard_frame := -1


func _initialize() -> void:
	out = OS.get_environment("CAPTURE_DIR")
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _physics_process(_delta: float) -> bool:
	scene.focused = true
	scene.inspection.visible = false
	scene.get_node("Blizzard").lightning = false
	var camera: Camera3D = scene.camera
	camera.distance = camera.MAX_DISTANCE if frame >= 120 and frame < 180 else camera.PLAY_DISTANCE
	camera.overview = frame >= 180 and frame < 240
	if SHOTS.has(frame):
		_save(SHOTS[frame])
	# Follow the walking figure once it is well inside the courtyard.
	if frame >= 240 and courtyard_frame < 0 and scene.second_walker.position.x < -16.0:
		scene.active_figure = 1
		courtyard_frame = frame + 60
	if frame == courtyard_frame:
		_save("courtyard-play")
	frame += 1
	return frame > LAST_FRAME or (courtyard_frame >= 0 and frame > courtyard_frame + 2)


func _save(name: String) -> void:
	var path := out.path_join(name + ".png")
	root.get_texture().get_image().save_png(path)
	print("Saved ", path, " · camera %.1f m · window %s" % [scene.camera.current_distance(), DisplayServer.window_get_size()])

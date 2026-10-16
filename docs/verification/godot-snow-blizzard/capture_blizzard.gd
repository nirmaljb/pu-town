extends SceneTree
# Capture driver for the blizzard lighting record. It frames the outpost yard at
# play distance and zoomed out, then the M overview, follows the walking figure
# into the compound's courtyard, and, where the scene has a Blizzard, forces one
# lightning flash. Visual evidence for before/after comparison, not a scene route.
# From the repository root:
#   CAPTURE_DIR=/abs/out "$GODOT" --path godot \
#     --resolution 1280x800 --fixed-fps 60 -s "$PWD/docs/verification/godot-snow-blizzard/capture_blizzard.gd"
const SHOTS := {90: "yard-16m", 150: "yard-30m", 210: "overview"}
const LAST_FRAME := 1800

var scene: Node
var out := ""
var frame := 0
var courtyard_frame := -1
var flash_frame := -1


func _initialize() -> void:
	out = OS.get_environment("CAPTURE_DIR")
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _physics_process(_delta: float) -> bool:
	scene.focused = true
	scene.inspection.visible = false
	var blizzard: Node = scene.get_node_or_null("Blizzard")
	if blizzard != null:
		blizzard.lightning = false
	scene.camera.distance = 30.0 if frame >= 120 and frame < 180 else 16.0
	scene.camera.overview = frame >= 180 and frame < 240
	if SHOTS.has(frame):
		_save(SHOTS[frame])
	# Follow the walking figure once it is well inside the courtyard.
	if frame >= 240 and courtyard_frame < 0 and scene.second_walker.position.x < -16.0:
		scene.active_figure = 1
		courtyard_frame = frame + 60
	if frame == courtyard_frame:
		_save("courtyard-16m")
		if blizzard != null:
			blizzard.set("_flash_age", 0.0)
			flash_frame = frame + 12
	if frame == flash_frame:
		_save("courtyard-lightning")
	frame += 1
	return frame > LAST_FRAME or (courtyard_frame >= 0 and frame > maxi(courtyard_frame, flash_frame) + 2)


func _save(name: String) -> void:
	var path := out.path_join(name + ".png")
	root.get_texture().get_image().save_png(path)
	print("Saved ", path, " · camera %.1f m" % scene.camera.current_distance())

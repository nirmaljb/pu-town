extends SceneTree
# Pine pipeline record: show the exported pines in the running snow walk, under its
# blizzard, fog and camera, which the scene does not yet do on its own. It stands the
# near tree 4 m east and 3 m north of the controlled figure, and a near (west) and
# distance (east) pair 4 m apart, 14 m north, all unturned so their windward side
# faces north-west. It saves the view, HUD hidden, at the play distance and at the
# wheel's widest, then quits. Verification only: the trees are not obstacles and the
# scene's own route never sees them. Run from the repository root in a window:
#   "$GODOT" --path godot -s "$PWD/docs/verification/godot-pine-pipeline/pine_capture.gd"
# Captures land in the project's user data folder as pine-capture-{play,widest}.png.
const FollowCamera = preload("res://follow_camera.gd")
const SETTLE_FRAMES := 240
const PLACES := {"res://scenery/pine/pine.glb": [Vector3(4, 0, -3), Vector3(-2, 0, -14)],
		"res://scenery/pine/pine_far.glb": [Vector3(2, 0, -14)]}

var scene: Node
var frames := 0
var shots := [["play", FollowCamera.PLAY_DISTANCE], ["widest", FollowCamera.MAX_DISTANCE]]


func _initialize() -> void:
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _process(_delta: float) -> bool:
	scene.focused = false
	scene.inspection.visible = false
	scene.camera.cursor_inside = false
	frames += 1
	if frames == 2:
		var figure: Vector3 = scene.walker.position
		for path: String in PLACES:
			for offset: Vector3 in PLACES[path]:
				var tree := (load(path) as PackedScene).instantiate() as Node3D
				tree.position = Vector3(figure.x, 0, figure.z) + offset
				scene.add_child(tree)
	if frames < SETTLE_FRAMES or shots.is_empty():
		return shots.is_empty()
	var shot: Array = shots[0]
	if frames == SETTLE_FRAMES:
		scene.camera.distance = shot[1]
	elif frames == SETTLE_FRAMES + 30:
		var path := OS.get_user_data_dir().path_join("pine-capture-%s.png" % shot[0])
		root.get_texture().get_image().save_png(path)
		print("PINE_CAPTURE %s %s at %.1f m" % [shot[0], path, scene.camera.current_distance()])
		shots.pop_front()
		frames = SETTLE_FRAMES - 1
	return false

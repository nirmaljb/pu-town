extends SceneTree
# Camp record: the Camp's placeholder boxes and warm lamps, saved for comparison with
# the owner's painted centre reference (docs/art/frostwatch-reference/). The
# controlled figure stands still on untrodden snow and each view is saved with the
# HUD hidden and without lean: the default play view from the Town Square looking
# north at the lodge's lit south face, the widest play view from the Town Square's
# centre, a verification-only distance that frames the whole Camp, and the M
# overview. The walking figure is held off the map's centre, and lightning, gusts
# and the falling and blowing snow are off, so the captures repeat. Verification
# only: it places the figure and camera directly, not through the scene's input or
# route. Run from the repository root in a window:
#   "$GODOT" --path godot -s "$PWD/docs/verification/godot-snow-camp/camp_capture.gd" -- --label after
# Captures land in the project's user data folder as camp-<label>-<view>.png.
const FollowCamera = preload("res://follow_camera.gd")
## Each view: name, where the figure stands, camera distance (0 for the overview).
var shots := [
	["lodge-default", Vector2(1, -6), FollowCamera.distance_for_share(FollowCamera.PLAY_SHARE)],
	["square-widest", Vector2(0, 2), FollowCamera.distance_for_share(FollowCamera.WIDEST_SHARE)],
	["camp-frame", Vector2(0, 4), 95.0],
	["overview", Vector2(0, 2), 0.0],
]
const SETTLE_FRAMES := 45

var scene: Node
var frames := 0
var label := "capture"
var shot_frame := 0


func _initialize() -> void:
	var arguments := OS.get_cmdline_user_args()
	if arguments.has("--label"):
		label = arguments[arguments.find("--label") + 1]
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _process(_delta: float) -> bool:
	scene.focused = false
	scene.inspection.visible = false
	scene.camera.cursor_inside = false
	scene.surface.wind_strength = 0.0
	scene.blizzard.lightning = false
	scene.blizzard.gusts = false
	for particles in ["Snowfall", "BlowingSnow"]:
		scene.blizzard.get_node(particles).visible = false
	scene.second_walker.position = Vector3(70, 0, 70)
	frames += 1
	if frames < 3:
		return false
	if shot_frame == 0:
		var stand: Vector2 = shots[0][1]
		scene.walker.position = Vector3(stand.x, 0, stand.y)
		scene.walker.face_toward(stand + Vector2(0, -50))
		scene.camera.overview = shots[0][2] == 0.0
		if shots[0][2] > 0.0:
			scene.camera.distance = shots[0][2]
		shot_frame = frames
	elif frames == shot_frame + SETTLE_FRAMES:
		var name := "camp-%s-%s.png" % [label, shots[0][0]]
		var path := OS.get_user_data_dir().path_join(name)
		root.get_texture().get_image().save_png(path)
		print("CAMP_CAPTURE %s at %.2f m, figure %s" % [path, scene.camera.current_distance(), scene.walker.position])
		shots.pop_front()
		shot_frame = 0
		if shots.is_empty():
			return true
	return false

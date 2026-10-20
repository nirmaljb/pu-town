extends SceneTree
# Roads record: the four Roads, the placeholder tree clusters in their Deep Snow and
# the Snowdrift the south-west cluster's corner tree builds over the south-west Road.
# The controlled figure stands still on untrodden snow and each view is saved with
# the HUD hidden and without lean: the default play view on the south-west Road
# beside the cluster's corner tree, before any wind; the widest play view inside the
# cluster's Deep Snow; a verification-only distance that frames the south-west Road
# and its cluster; the M overview; and, after 300 wind-seconds of the north-west
# wind, the same default view on the Road with its Snowdrift. The walking figure is
# held off the map's centre, and lightning, gusts and the falling and blowing snow
# are off, so the captures repeat. Verification only: it places the figure and camera
# directly, not through the scene's input or route. Run from the repository root in
# a window:
#   "$GODOT" --path godot -s "$PWD/docs/verification/godot-snow-roads/roads_capture.gd" -- --label after
# Captures land in the project's user data folder as roads-<label>-<view>.png.
const FollowCamera = preload("res://follow_camera.gd")
## Each view: name, where the figure stands, camera distance (0 for the overview),
## and the wind-seconds of north-west wind to blow before it.
var shots := [
	["road-default", Vector2(-30.5, 25.5), FollowCamera.distance_for_share(FollowCamera.PLAY_SHARE), 0.0],
	["cluster-widest", Vector2(-41, 17), FollowCamera.distance_for_share(FollowCamera.WIDEST_SHARE), 0.0],
	["south-west-frame", Vector2(-40, 30), 95.0, 0.0],
	["overview", Vector2(0, 2), 0.0, 0.0],
	["road-drifted", Vector2(-30.5, 25.5), FollowCamera.distance_for_share(FollowCamera.PLAY_SHARE), 300.0],
]
const SETTLE_FRAMES := 45
const WIND := 16.0

var scene: Node
var frames := 0
var label := "capture"
var shot_frame := 0
var blown := 0.0


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
	scene.blizzard.lightning = false
	scene.blizzard.gusts = false
	for particles in ["Snowfall", "BlowingSnow"]:
		scene.blizzard.get_node(particles).visible = false
	scene.second_walker.position = Vector3(70, 0, 70)
	frames += 1
	if frames < 3:
		return false
	# Blow the north-west wind until the next view's wind-seconds have passed.
	var wanted: float = shots[0][3]
	scene.surface.wind_strength = WIND if scene.surface.wind_elapsed < wanted else 0.0
	if scene.surface.wind_elapsed < wanted:
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
		var name := "roads-%s-%s.png" % [label, shots[0][0]]
		var path := OS.get_user_data_dir().path_join(name)
		root.get_texture().get_image().save_png(path)
		print("ROADS_CAPTURE %s at %.2f m, figure %s, %.0f wind-seconds, Snow Depth %.3f m at the Road's drift point" % [path,
			scene.camera.current_distance(), scene.walker.position, scene.surface.wind_elapsed,
			scene.surface.sample_saved_depth(Vector2(-33.5, 28.5))])
		shots.pop_front()
		shot_frame = 0
		if shots.is_empty():
			return true
	return false

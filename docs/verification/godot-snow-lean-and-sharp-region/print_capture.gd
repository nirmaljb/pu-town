extends SceneTree
# Lean and sharp-print region record: the same trails seen before and after the
# detail region changed. In the 25 cm open snow east of the Town Square, where prints
# are pressed deepest, the controlled figure lays three walking trails on wind 0: one
# 37 m north from beside where it then stands, one 40 m east–west across its own row
# and one 24 m east–west 8 m south of it, at the bottom of the view. It then stands
# at (45, 12), facing north up the first trail, and the view is saved, HUD
# hidden, without lean, at the default, widest and closest play distances. With
# `-- --shadows` the snow also casts into SkyKey's shadow map, as it did before, to
# compare that change alone. The walking figure is held far off the map's centre, and
# lightning, gusts and the falling and blowing snow are off, so the captures repeat
# and compare pixel for pixel. Verification only: it moves the figure directly, not
# through the scene's input or route. Run from the repository root in a window, for
# the revision under test:
#   "$GODOT" --path godot -s "$PWD/docs/verification/godot-snow-lean-and-sharp-region/print_capture.gd" -- --label after
# Captures land in the project's user data folder as prints-<label>-<view>.png.
const FollowCamera = preload("res://follow_camera.gd")
const STAND := Vector2(45, 12)
## Each trail: where it starts and where it ends, walked in a straight line.
const TRAILS := [[Vector2(46.0, 13.0), Vector2(46.0, -24.0)], [Vector2(25.0, 12.6), Vector2(65.0, 12.6)],
		[Vector2(33.0, 20.0), Vector2(57.0, 20.0)]]
## Simulated 60 Hz walking steps taken each rendered frame, so the trails are laid quickly.
const STEPS_PER_FRAME := 8
const SETTLE_FRAMES := 40

var scene: Node
var frames := 0
var label := "capture"
var trail := 0
var walking := false
var shots := [["default", FollowCamera.PLAY_DISTANCE], ["widest", FollowCamera.MAX_DISTANCE], ["closest", FollowCamera.MIN_DISTANCE]]
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
	if frames == 3 and OS.get_cmdline_user_args().has("--shadows"):
		for surface in scene.surface.find_children("*", "MeshInstance3D", true, false):
			surface.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON
	if trail < TRAILS.size():
		_lay_trail()
		return false
	if shot_frame == 0:
		scene.walker.position = Vector3(STAND.x, 0, STAND.y)
		scene.walker.face_toward(STAND + Vector2(0, -50))
		scene.camera.distance = shots[0][1]
		shot_frame = frames
	elif frames == shot_frame + SETTLE_FRAMES:
		var name := "prints-%s-%s.png" % [label, shots[0][0]]
		var path := OS.get_user_data_dir().path_join(name)
		root.get_texture().get_image().save_png(path)
		print("PRINT_CAPTURE %s at %.2f m, figure %s, region at %s" % [path, scene.camera.current_distance(),
			scene.walker.position, scene.surface.region_center])
		shots.pop_front()
		shot_frame = 0
		if shots.is_empty():
			return true
	return false


func _lay_trail() -> void:
	var line: Array = TRAILS[trail]
	if not walking:
		scene.walker.position = Vector3(line[0].x, 0, line[0].y)
		walking = true
		return
	var here := Vector2(scene.walker.position.x, scene.walker.position.z)
	var left: Vector2 = line[1] - here
	if left.length() < 0.05:
		walking = false
		trail += 1
		return
	for step in range(STEPS_PER_FRAME):
		scene.walker._move(1.0 / 60.0, left.normalized(), left.length())
		here = Vector2(scene.walker.position.x, scene.walker.position.z)
		left = line[1] - here
		if left.length() < 0.05:
			break

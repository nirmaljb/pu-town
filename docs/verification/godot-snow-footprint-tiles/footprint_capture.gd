extends SceneTree
# Footprint tiles record: the same prints, pressed directly, captured in the whole-map
# picture's build and in the tiled build, so the two can be compared pixel for pixel.
# Two walking trails cross in open snow at (-40, -4), where a Footprint tile's
# corner lies (tiles are 8 x 4 m from the map's north-west corner), and one walks
# along the tile edge x = -40, so soles straddle neighbouring tiles; the second pass
# overlaps the first. Views, with the HUD hidden and without lean: fresh at the
# closest play distance and at the default one; after 60 wind-seconds of the
# north-west wind, half filled; after 130, filled. The controlled figure stands beside
# the prints and the walking figure is held off the map's centre; lightning, gusts and
# the falling and blowing snow are off, so the captures repeat. Verification only: it
# presses prints and places the camera directly, not through the scene's input or
# route. Run from the repository root in a window:
#   "$GODOT" --path godot -s "$PWD/docs/verification/godot-snow-footprint-tiles/footprint_capture.gd" -- --label after
# Captures land in the project's user data folder as footprints-<label>-<view>.png.
const FollowCamera = preload("res://follow_camera.gd")
const CORNER := Vector2(-40, -4)
const STAND := Vector2(-37.6, -2.2)
## Each view: name, camera distance and the wind-seconds of north-west wind to blow before it.
var shots := [
	["fresh-closest", FollowCamera.distance_for_share(FollowCamera.CLOSEST_SHARE), 0.0],
	["fresh-default", FollowCamera.distance_for_share(FollowCamera.PLAY_SHARE), 0.0],
	["half-filled", FollowCamera.distance_for_share(FollowCamera.CLOSEST_SHARE), 60.0],
	["filled", FollowCamera.distance_for_share(FollowCamera.CLOSEST_SHARE), 130.0],
]
const SETTLE_FRAMES := 45
const WIND := 16.0
const STEP := 0.6202
const BOOT_LATERAL := 0.11

var scene: Node
var frames := 0
var label := "capture"
var shot_frame := 0
## The first print pressed along the tile edge, straddling two tiles.
var edge_print := Vector2.ZERO


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
		scene.surface.wind_strength = 0.0
		return false
	if frames == 3:
		_press_trails()
	var wanted: float = shots[0][2]
	scene.surface.wind_strength = WIND if scene.surface.wind_elapsed < wanted else 0.0
	if scene.surface.wind_elapsed < wanted:
		return false
	if shot_frame == 0:
		scene.walker.position = Vector3(STAND.x, 0, STAND.y)
		scene.walker.face_toward(STAND + Vector2(0, -50))
		scene.camera.distance = shots[0][1]
		shot_frame = frames
	elif frames == shot_frame + SETTLE_FRAMES:
		var name := "footprints-%s-%s.png" % [label, shots[0][0]]
		var path := OS.get_user_data_dir().path_join(name)
		root.get_texture().get_image().save_png(path)
		var tiles: String = str(scene.surface.footprints.tiles) if "footprints" in scene.surface else "none (whole-map picture)"
		print("FOOTPRINT_CAPTURE %s at %.2f m, %.0f wind-seconds, compaction %.3f at a print on the tile edge, Footprint tiles %s" % [path,
			scene.camera.current_distance(), scene.surface.wind_elapsed, scene.surface.sample_compaction(edge_print), tiles])
		shots.pop_front()
		shot_frame = 0
		if shots.is_empty():
			return true
	return false


## Press walking trails as the walker lays them: alternating boots BOOT_LATERAL
## either side of the line, STEP apart, each at the walker's strength.
func _press_trails() -> void:
	# North-east through the tiles' corner, then back over it, offset by half a step.
	_press_trail(CORNER + Vector2(-3, 3), Vector2(1, -1), 12)
	_press_trail(CORNER + Vector2(3.2, -3.0), Vector2(-1, 1), 12)
	# North beside the tile edge x = -40, so every other sole straddles two tiles.
	edge_print = _print_at(CORNER + Vector2(BOOT_LATERAL, 4), 0.0, 0)
	_press_trail(CORNER + Vector2(BOOT_LATERAL, 4), Vector2(0, -1), 14)


func _press_trail(from: Vector2, direction: Vector2, steps: int) -> void:
	var heading := atan2(-direction.x, -direction.y)
	for step in range(steps):
		scene.surface.stamp_foot(_print_at(from + direction.normalized() * STEP * step, heading, step), heading, 0.32)


func _print_at(centre: Vector2, heading: float, step: int) -> Vector2:
	var lateral := Vector2(cos(heading), -sin(heading))
	return centre + lateral * (BOOT_LATERAL if step % 2 == 1 else -BOOT_LATERAL)

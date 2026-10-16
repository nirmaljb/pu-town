extends SceneTree
# Diagnostic: per physics frame, the knee flexion the game renders against the
# clip's own knee at the same phase, for both figures, with the snow and blend
# state that might explain the difference. The controlled figure walks west in
# Shallow Snow, east into the outpost yard's Deep drift, then stands.
#   PROBE_OUT=/abs/file.csv "$GODOT" --path godot --fixed-fps 60 -s /abs/knee_probe.gd
const LEGS := [[20, [KEY_A], "walk shallow"], [260, [KEY_D], "walk to deep"], [740, [], "stand"]]
const END := 800

var scene: Node
var frame := 0
var held: Array = []
var rows := PackedStringArray()


func _initialize() -> void:
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


static func _knee(skeleton: Skeleton3D, side: String) -> float:
	var hip := skeleton.get_bone_global_pose(skeleton.find_bone(side + "UpperLeg")).origin
	var knee := skeleton.get_bone_global_pose(skeleton.find_bone(side + "LowerLeg")).origin
	var ankle := skeleton.get_bone_global_pose(skeleton.find_bone(side + "Foot")).origin
	return 180.0 - rad_to_deg((hip - knee).angle_to(ankle - knee))


func _sample(w: Node, figure: int, stage: String) -> void:
	var avatar = w.avatar
	var skeleton: Skeleton3D = avatar.skeleton
	if skeleton == null or w._feet.size() != 2:
		return
	var game_l := _knee(skeleton, "Left")
	var game_r := _knee(skeleton, "Right")
	var drop: float = float(avatar.position.y)
	var fraction: float = clampf(float(w._step_progress) / float(w._step_length), 0.0, 1.0)
	var phase: float = 0.5 * float(w._landed_side) + 0.5 * fraction
	var planted: Dictionary = avatar.planted(phase, w._run_amount)
	# The clip alone at this state, then the frame restored exactly as the game made it.
	avatar.animate(phase, w._run_amount, w._moving, 0.0)
	var clip_l := _knee(skeleton, "Left")
	var clip_r := _knee(skeleton, "Right")
	w._update_pose(0.0)
	var print_l: float = w.surface.sample_height(w._feet[0])
	var print_r: float = w.surface.sample_height(w._feet[1])
	var centre := Vector2(w.position.x, w.position.z)
	rows.append("%d,%d,%s,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.4f,%.1f,%.1f,%.1f,%.1f,%d,%d,%.4f,%.4f,%.3f,%.3f,%.3f" % [
		frame, figure, stage, phase, w._run_amount, avatar._moving_blend, w.horizontal_speed,
		w.sink_depth, w.loose_depth, drop, clip_l, clip_r, game_l, game_r,
		int(planted.Left), int(planted.Right), print_l, print_r,
		w._feet[0].distance_to(centre), w._feet[1].distance_to(centre), w.position.y])


func _physics_process(_delta: float) -> bool:
	scene.focused = true
	var leg: Array = LEGS[0]
	for entry in LEGS:
		if frame >= entry[0]:
			leg = entry
	if frame == leg[0]:
		_press(leg[1])
	if frame > 10:
		_sample(scene.walker, 1, leg[2])
		_sample(scene.second_walker, 2, "loop")
	frame += 1
	if frame > END:
		var file := FileAccess.open(OS.get_environment("PROBE_OUT"), FileAccess.WRITE)
		file.store_string("frame,figure,stage,phase,run_amount,moving_blend,speed_mps,sink_m,loose_m,drop_m,clip_l,clip_r,game_l,game_r,planted_l,planted_r,print_l,print_r,dist_l,dist_r,root_y\n" + "\n".join(rows) + "\n")
		return true
	return false

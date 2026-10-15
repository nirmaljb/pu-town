extends Node3D
## The parka Avatar exported by tools/characters/parka. Walk and Run are seeked to
## the walker's step phase rather than played by time, so a planted boot stays on
## its Footprint at any speed. After the clips are applied, each leg is bent so its
## boot meets the snow beneath it.

const MODEL := preload("res://characters/parka/parka.glb")
const GAIT_PATH := "res://characters/parka/gait.json"
const STAND_BLEND_RATE := 6.0

var gait: Dictionary = JSON.parse_string(FileAccess.get_file_as_string(GAIT_PATH))
var skeleton: Skeleton3D
var contact_gap := 0.0
var _tree := AnimationTree.new()
var _walk_length := 1.0
var _run_length := 1.0
var _moving_blend := 0.0
var _legs := {}


func _ready() -> void:
	var model: Node3D = MODEL.instantiate()
	# glTF figures face +Z; the walker's facing node looks down -Z.
	model.rotation.y = PI
	add_child(model)
	skeleton = model.find_children("*", "Skeleton3D", true, false)[0]
	var player: AnimationPlayer = model.find_children("*", "AnimationPlayer", true, false)[0]
	_walk_length = player.get_animation(gait.clips.walk).length
	_run_length = player.get_animation(gait.clips.run).length
	var blend := AnimationNodeBlendTree.new()
	for clip in [gait.clips.walk, gait.clips.run, gait.clips.stand]:
		var node := AnimationNodeAnimation.new()
		node.animation = clip
		blend.add_node(clip, node)
	for seek in ["walk_seek", "run_seek"]:
		var node := AnimationNodeTimeSeek.new()
		node.explicit_elapse = false
		blend.add_node(seek, node)
	blend.add_node("gait", AnimationNodeBlend2.new())
	blend.add_node("move", AnimationNodeBlend2.new())
	blend.connect_node("walk_seek", 0, gait.clips.walk)
	blend.connect_node("run_seek", 0, gait.clips.run)
	blend.connect_node("gait", 0, "walk_seek")
	blend.connect_node("gait", 1, "run_seek")
	blend.connect_node("move", 0, gait.clips.stand)
	blend.connect_node("move", 1, "gait")
	blend.connect_node("output", 0, "move")
	_tree.tree_root = blend
	_tree.callback_mode_process = AnimationMixer.ANIMATION_CALLBACK_MODE_PROCESS_MANUAL
	model.add_child(_tree)
	_tree.anim_player = _tree.get_path_to(player)
	_tree.active = true
	for side in ["Left", "Right"]:
		var foot := skeleton.find_bone(side + "Foot")
		var toes := skeleton.find_bone(side + "Toes")
		var foot_rest := skeleton.get_bone_global_rest(foot)
		var toes_rest := skeleton.get_bone_global_rest(toes)
		_legs[side] = {
			"upper": skeleton.find_bone(side + "UpperLeg"),
			"lower": skeleton.find_bone(side + "LowerLeg"),
			"foot": foot, "toes": toes,
			# Sole points under the heel and the ball of the boot, as in gait.py.
			"heel": foot_rest.affine_inverse() * (foot_rest.origin + Vector3(0, -0.09, -0.08)),
			"ball": toes_rest.affine_inverse() * (toes_rest.origin + Vector3(0, -0.03, 0)),
		}


## Tint the Accent material (the gloves) with a Player Colour.
func tint_accent(colour: Color) -> void:
	for mesh: MeshInstance3D in skeleton.find_children("*", "MeshInstance3D", true, false):
		for surface in mesh.mesh.get_surface_count():
			var material := mesh.mesh.surface_get_material(surface)
			if material and material.resource_name == "Accent":
				var tinted: StandardMaterial3D = material.duplicate()
				tinted.albedo_color = colour
				mesh.set_surface_override_material(surface, tinted)


## Pose the Avatar at a cycle phase (left boot lands at 0, right at 0.5).
## `run_amount` blends Walk toward Run; standing still eases into Stand.
func animate(phase: float, run_amount: float, moving: bool, delta: float) -> void:
	_moving_blend = move_toward(_moving_blend, 1.0 if moving else 0.0, delta * STAND_BLEND_RATE)
	_tree.set("parameters/walk_seek/seek_request", fposmod(phase, 1.0) * _walk_length)
	_tree.set("parameters/run_seek/seek_request", fposmod(phase, 1.0) * _run_length)
	_tree.set("parameters/gait/blend_amount", run_amount)
	_tree.set("parameters/move/blend_amount", _moving_blend)
	_tree.advance(0.0)


## Which boots the clips have planted at this phase. While the figure eases into
## Stand, a boot still swinging is lifted until the pose has fully settled.
func planted(phase: float, run_amount: float) -> Dictionary:
	if _moving_blend <= 0.0:
		return {"Left": true, "Right": true}
	var duty := lerpf(gait.walk.duty, gait.run.duty, run_amount)
	return {
		"Left": fposmod(phase, 1.0) < duty,
		"Right": fposmod(phase - 0.5, 1.0) < duty,
	}


## Bend each leg so a planted boot rests on `support`, a callable from a world XZ
## point to the snow height there: its heel or ball touches the snow and neither
## sinks below it. A lifted boot keeps its clearance above the snow under it.
## Returns the largest gap left between a planted boot and the snow.
func ground(support: Callable, root_height: float, planted_boots: Dictionary) -> float:
	contact_gap = 0.0
	position.y = 0.0
	var to_skeleton := skeleton.global_transform.affine_inverse()
	var lifts := {}
	var drop := 0.0
	for side in _legs:
		if planted_boots[side]:
			lifts[side] = -_clearance(_legs[side], support)
		else:
			var sole := _sole_points(_legs[side])[0]
			lifts[side] = float(support.call(Vector2(sole.x, sole.z))) - root_height
		if planted_boots[side]:
			drop = minf(drop, lifts[side])
	# A straight leg cannot reach lower snow, so the body settles to the lowest
	# planted boot and every leg only has to bend.
	position.y = drop
	for side in _legs:
		var leg: Dictionary = _legs[side]
		_reach(leg, to_skeleton.basis * Vector3(0, lifts[side] - drop, 0))
		if planted_boots[side]:
			contact_gap = maxf(contact_gap, absf(_clearance(leg, support)))
	return contact_gap


## Heel and ball sole points in world space, lowest first.
func _sole_points(leg: Dictionary) -> Array[Vector3]:
	var heel := skeleton.global_transform * skeleton.get_bone_global_pose(leg.foot) * (leg.heel as Vector3)
	var ball := skeleton.global_transform * skeleton.get_bone_global_pose(leg.toes) * (leg.ball as Vector3)
	return [heel, ball] if heel.y < ball.y else [ball, heel]


## How far the boot's sole is above the snow: negative when part of it is buried.
func _clearance(leg: Dictionary, support: Callable) -> float:
	var clearance := INF
	for point in _sole_points(leg):
		clearance = minf(clearance, point.y - float(support.call(Vector2(point.x, point.z))))
	return clearance


## Two-bone reach: move the ankle by `offset` (skeleton space) keeping the boot's angle.
func _reach(leg: Dictionary, offset: Vector3) -> void:
	if offset.length_squared() < 1e-10:
		return
	var upper: int = leg.upper
	var lower: int = leg.lower
	var foot: int = leg.foot
	var parent := skeleton.get_bone_global_pose(skeleton.get_bone_parent(upper))
	var upper_pose := skeleton.get_bone_global_pose(upper)
	var lower_pose := skeleton.get_bone_global_pose(lower)
	var foot_pose := skeleton.get_bone_global_pose(foot)
	var hip := upper_pose.origin
	var knee := lower_pose.origin
	var ankle := foot_pose.origin
	var target := ankle + offset
	var thigh := hip.distance_to(knee)
	var shin := knee.distance_to(ankle)
	var reach := clampf(hip.distance_to(target), absf(thigh - shin) + 0.001, thigh + shin - 0.001)
	var current := (hip - knee).angle_to(ankle - knee)
	var wanted := acos(clampf((thigh * thigh + shin * shin - reach * reach) / (2.0 * thigh * shin), -1.0, 1.0))
	var axis := (hip - knee).cross(ankle - knee)
	if axis.length_squared() < 1e-10:
		# A straight leg bends its knee forward; the model faces +Z.
		axis = Vector3.LEFT
	# Rotating about hip-knee × ankle-knee opens the knee as the angle grows.
	var bend := Quaternion(axis.normalized(), wanted - current)
	var bent_ankle := knee + bend * (ankle - knee)
	var swing := Quaternion((bent_ankle - hip).normalized(), (target - hip).normalized())
	var upper_rotation := swing * upper_pose.basis.get_rotation_quaternion()
	var lower_rotation := swing * bend * lower_pose.basis.get_rotation_quaternion()
	skeleton.set_bone_pose_rotation(upper, parent.basis.get_rotation_quaternion().inverse() * upper_rotation)
	skeleton.set_bone_pose_rotation(lower, upper_rotation.inverse() * lower_rotation)
	# The boot keeps the clip's angle so its sole stays parallel to where it was.
	skeleton.set_bone_pose_rotation(foot, lower_rotation.inverse() * foot_pose.basis.get_rotation_quaternion())

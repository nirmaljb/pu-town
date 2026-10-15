extends Node3D
## Horizontal obstacles and changing snow support are separate: roofs are never ground.
## The figure is the parka Avatar; its steps, Footprints and clips share one gait.

const Avatar = preload("res://parka_avatar.gd")
const TownLayout = preload("res://town_layout.gd")
const WALK_SPEED := 2.25
const RUN_SPEED := 4.5
const HEIGHT := 1.7
const FOOTPRINT_RADIUS := 0.3
const LIMIT := TownLayout.HALF_EXTENTS - Vector2.ONE * FOOTPRINT_RADIUS

var figure_id := 1
var direction := Vector2.ZERO
var horizontal_speed := 0.0
var contact_gap := 0.0
var grounded := false
var distance_walked := 0.0
var boundary_limited := false
var obstacle_limited := false
var run_requested := false
var snow_depth := 0.0
var loose_depth := 0.0
var foot_compaction := 0.0
var sink_depth := 0.0
var step_count := 0
var last_footprint := Vector2.ZERO
var has_footprint := false
var facing := Node3D.new()
var avatar := Avatar.new()
var surface: Node3D
var layout: Node3D
var _feet: Array[Vector2] = []
var _step_progress := 0.0
var _step_length: float = avatar.gait.walk.step_m
var _landed_side := 1
var _heading := 0.0
var _moving := false
var _run_amount := 0.0


func configure(snow: Node3D, town: Node3D, identity: int, spawn: Vector2) -> void:
	surface = snow
	layout = town
	figure_id = identity
	position = Vector3(spawn.x, 0, spawn.y)
	var lateral: float = avatar.gait.boot_lateral_m
	_feet = [spawn + Vector2(-lateral, 0), spawn + Vector2(lateral, 0)]
	# Prime the first footfall once; pauses must not discard travelled distance.
	_step_progress = _step_length - 0.12


func _ready() -> void:
	add_child(facing)
	facing.add_child(avatar)
	# These stand in for Player Colours, which the gloves carry.
	avatar.tint_accent(Color("b36d43") if figure_id == 1 else Color("657d85"))
	_update_pose()


func walk(delta: float, camera_basis: Basis, controlled: bool) -> void:
	direction = Vector2.ZERO
	run_requested = controlled and Input.is_physical_key_pressed(KEY_SHIFT)
	if controlled:
		direction = Vector2(
			float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)),
			float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W))
		).limit_length()
	var here := Vector2(position.x, position.z)
	loose_depth = surface.sample_loose_depth(here)
	var allowance := 1.0 - smoothstep(0.10, 0.40, loose_depth)
	var speed := lerpf(WALK_SPEED, RUN_SPEED, allowance) if run_requested else WALK_SPEED
	var right := Vector3(camera_basis.x.x, 0, camera_basis.x.z).normalized()
	var back := Vector3(camera_basis.z.x, 0, camera_basis.z.z).normalized()
	var motion := (right * direction.x + back * direction.y) * speed * delta
	var desired := here + Vector2(motion.x, motion.z)
	var bounded := desired.clamp(-LIMIT, LIMIT)
	boundary_limited = not bounded.is_equal_approx(desired)
	var target: Vector2 = layout.move_with_collisions(here, bounded, FOOTPRINT_RADIUS)
	obstacle_limited = target.distance_to(bounded) > 0.0001
	var movement := target - here
	var travelled := movement.length()
	position.x = target.x
	position.z = target.y
	horizontal_speed = travelled / maxf(delta, 0.000001)
	distance_walked += travelled
	_moving = travelled > 0.00001
	if _moving:
		_heading = atan2(-movement.x, -movement.y)
		facing.rotation.y = _heading
		_run_amount = clampf((horizontal_speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1)
		_step_length = lerpf(avatar.gait.walk.step_m, avatar.gait.run.step_m, _run_amount)
		_step_progress += travelled
		while _step_progress >= _step_length:
			_step_progress -= _step_length
			_land_step(target)
	_update_pose(delta)


func _land_step(centre: Vector2) -> void:
	_landed_side = 1 - _landed_side
	var lateral := Vector2(cos(_heading), -sin(_heading))
	var forward := Vector2(-sin(_heading), -cos(_heading))
	var sign_side := -1.0 if _landed_side == 0 else 1.0
	var point := centre + lateral * sign_side * float(avatar.gait.boot_lateral_m) + forward * _landing_ahead()
	if not layout.point_clear(point, 0.08):
		point = centre + lateral * sign_side * 0.08
	if not layout.point_clear(point, 0.04):
		return
	surface.stamp_foot(point, _heading, 0.32)
	_feet[_landed_side] = point
	last_footprint = point
	has_footprint = true
	step_count += 1


func _update_pose(delta: float = 1.0 / 60.0) -> void:
	if surface == null or _feet.size() != 2:
		return
	var centre := Vector2(position.x, position.z)
	var lateral := Vector2(cos(_heading), -sin(_heading))
	var forward := Vector2(-sin(_heading), -cos(_heading))
	var fraction := clampf(_step_progress / _step_length, 0.0, 1.0)
	var swing := 1 - _landed_side
	var foot_points: Array[Vector2] = [_feet[0], _feet[1]]
	# The body rests between the planted Footprint and the swinging boot's next one.
	var sign_side := -1.0 if swing == 0 else 1.0
	var boot_lateral: float = avatar.gait.boot_lateral_m
	var destination := centre + lateral * sign_side * boot_lateral + forward * _landing_ahead()
	foot_points[swing] = _feet[swing].lerp(destination, smoothstep(0.0, 1.0, fraction))
	for index in range(2):
		if foot_points[index].distance_to(centre) > 0.65:
			foot_points[index] = centre + lateral * (-boot_lateral if index == 0 else boot_lateral)
			_feet[index] = foot_points[index]
	var supports := Vector2(surface.sample_depth(foot_points[0]), surface.sample_depth(foot_points[1]))
	position.y = (supports.x + supports.y) * 0.5
	snow_depth = surface.sample_depth(centre)
	foot_compaction = surface.sample_compaction(last_footprint) if has_footprint else 0.0
	sink_depth = maxf(0.0, (surface.sample_uncompressed_depth(foot_points[0]) + surface.sample_uncompressed_depth(foot_points[1])) * 0.5 - position.y)
	grounded = layout.point_clear(centre, FOOTPRINT_RADIUS - 0.001)
	# One cycle is two steps: the left boot (index 0) lands at phase 0, the right at 0.5.
	var phase := 0.5 * _landed_side + 0.5 * fraction
	avatar.animate(phase, _run_amount, _moving, delta)
	var support := func(point: Vector2) -> float: return surface.sample_depth(point)
	contact_gap = avatar.ground(support, position.y, avatar.planted(phase, _run_amount))


func _landing_ahead() -> float:
	return lerpf(avatar.gait.walk.landing_ahead_m, avatar.gait.run.landing_ahead_m, _run_amount)

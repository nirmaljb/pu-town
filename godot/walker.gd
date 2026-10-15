extends Node3D
## Horizontal obstacles and changing snow support are separate: roofs are never ground.

const WALK_SPEED := 2.25
const RUN_SPEED := 4.5
const HEIGHT := 1.7
const FOOTPRINT_RADIUS := 0.3
const LIMIT := 32.0 - FOOTPRINT_RADIUS

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
var legs: Array[MeshInstance3D] = []
var boots: Array[MeshInstance3D] = []
var surface: Node3D
var layout: Node3D
var _feet: Array[Vector2] = []
var _step_progress := 0.0
var _step_length := 0.48
var _landed_side := 1
var _heading := 0.0
var _moving := false
var _swing_lift := 0.0


func configure(snow: Node3D, town: Node3D, identity: int, spawn: Vector2) -> void:
	surface = snow
	layout = town
	figure_id = identity
	position = Vector3(spawn.x, 0, spawn.y)
	_feet = [spawn + Vector2(-0.115, 0), spawn + Vector2(0.115, 0)]
	# Prime the first footfall once; pauses must not discard travelled distance.
	_step_progress = _step_length - 0.12


func _ready() -> void:
	add_child(facing)
	var coat := StandardMaterial3D.new()
	coat.albedo_color = Color("b36d43") if figure_id == 1 else Color("657d85")
	coat.roughness = 0.95
	var dark := StandardMaterial3D.new()
	dark.albedo_color = Color("344454")
	dark.roughness = 1.0
	var head := StandardMaterial3D.new()
	head.albedo_color = Color("dfcbb1")
	head.roughness = 1.0
	_add_capsule(facing, Vector3(0, 1.10, 0), 0.19, 0.58, coat)
	_add_capsule(facing, Vector3(0, 1.56, 0), 0.14, 0.28, head)
	for side in [-1.0, 1.0]:
		legs.append(_add_capsule(self, Vector3(side * 0.115, 0.45, 0), 0.065, 0.74, dark))
		var boot := MeshInstance3D.new()
		var mesh := BoxMesh.new()
		mesh.size = Vector3(0.14, 0.08, 0.28)
		boot.mesh = mesh
		boot.material_override = dark
		add_child(boot)
		boots.append(boot)
		_add_capsule(facing, Vector3(side * 0.27, 1.02, 0), 0.065, 0.56, coat)
	_add_capsule(facing, Vector3(0, 1.57, -0.13), 0.035, 0.07, head)
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
	var bounded := desired.clamp(Vector2(-LIMIT, -LIMIT), Vector2(LIMIT, LIMIT))
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
		_step_length = lerpf(0.48, 0.68, clampf((horizontal_speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1))
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
	var point := centre + lateral * sign_side * 0.115 + forward * 0.12
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
	# Preserve the horizontal swing position on release or a figure switch;
	# settle vertically instead of teleporting back to the last planted point.
	var sign_side := -1.0 if swing == 0 else 1.0
	var destination := centre + lateral * sign_side * 0.115 + forward * 0.12
	foot_points[swing] = _feet[swing].lerp(destination, smoothstep(0.0, 1.0, fraction))
	var desired_lift := sin(fraction * PI) * 0.12 if _moving else 0.0
	_swing_lift = move_toward(_swing_lift, desired_lift, delta * 2.0)
	for index in range(2):
		if foot_points[index].distance_to(centre) > 0.65:
			foot_points[index] = centre + lateral * (-0.115 if index == 0 else 0.115)
			_feet[index] = foot_points[index]
	var supports := Vector2(surface.sample_depth(foot_points[0]), surface.sample_depth(foot_points[1]))
	position.y = (supports.x + supports.y) * 0.5
	snow_depth = surface.sample_depth(centre)
	foot_compaction = surface.sample_compaction(last_footprint) if has_footprint else 0.0
	sink_depth = maxf(0.0, (surface.sample_uncompressed_depth(foot_points[0]) + surface.sample_uncompressed_depth(foot_points[1])) * 0.5 - position.y)
	grounded = layout.point_clear(centre, FOOTPRINT_RADIUS - 0.001)
	contact_gap = 0.0
	for index in range(legs.size()):
		var lift := _swing_lift if index == swing else 0.0
		var foot := Vector3(foot_points[index].x, supports[index] + lift, foot_points[index].y)
		boots[index].global_position = foot + Vector3(0, 0.04, 0)
		boots[index].global_rotation = Vector3(0, _heading, 0)
		var hip := global_position + Vector3(lateral.x, 0, lateral.y) * (-0.115 if index == 0 else 0.115) + Vector3(0, 0.82, 0)
		var ankle := foot + Vector3(0, 0.08, 0)
		var axis := hip - ankle
		legs[index].global_position = (hip + ankle) * 0.5
		legs[index].global_basis = Basis(Quaternion(Vector3.UP, axis.normalized())).scaled(Vector3(1, axis.length() / 0.74, 1))
		if lift < 0.001:
			contact_gap = maxf(contact_gap, absf(boots[index].global_position.y - 0.04 - float(surface.sample_depth(foot_points[index]))))


func _add_capsule(parent: Node3D, centre: Vector3, radius: float, height: float, material: Material) -> MeshInstance3D:
	var mesh := CapsuleMesh.new()
	mesh.radius = radius
	mesh.height = height
	mesh.radial_segments = 12
	mesh.rings = 4
	var part := MeshInstance3D.new()
	part.mesh = mesh
	part.material_override = material
	part.position = centre
	parent.add_child(part)
	return part

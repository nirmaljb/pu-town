extends Node3D
## Temporary 1.7 m inspection figure. Its origin is the contact point at its feet.

const SPEED := 2.25
const HEIGHT := 1.7
const FOOTPRINT_RADIUS := 0.3
const LIMIT := 32.0 - FOOTPRINT_RADIUS

var direction := Vector2.ZERO
var horizontal_speed := 0.0
var contact_gap := 0.0
var grounded := false
var distance_walked := 0.0
var boundary_limited := false
var facing := Node3D.new()
var legs: Array[MeshInstance3D] = []


func _ready() -> void:
	add_child(facing)
	var coat := StandardMaterial3D.new()
	coat.albedo_color = Color("b36d43")
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
		legs.append(_add_capsule(facing, Vector3(side * 0.115, 0.41, 0), 0.085, 0.82, dark))
		_add_capsule(facing, Vector3(side * 0.27, 1.02, 0), 0.065, 0.56, coat)
	# A short nose makes the held facing readable without a final Avatar model.
	_add_capsule(facing, Vector3(0, 1.57, -0.13), 0.035, 0.07, head)


func walk(delta: float, camera_basis: Basis, focused: bool) -> void:
	direction = Vector2.ZERO
	if focused:
		direction = Vector2(
			float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)),
			float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W))
		).limit_length()
	var right := Vector3(camera_basis.x.x, 0, camera_basis.x.z).normalized()
	var back := Vector3(camera_basis.z.x, 0, camera_basis.z.z).normalized()
	var motion := (right * direction.x + back * direction.y) * SPEED * delta
	var previous := position
	var target := previous + motion
	target.x = clampf(target.x, -LIMIT, LIMIT)
	target.z = clampf(target.z, -LIMIT, LIMIT)
	boundary_limited = not is_equal_approx(target.x, previous.x + motion.x) or not is_equal_approx(target.z, previous.z + motion.z)
	var hit := ground_at(target)
	grounded = not hit.is_empty()
	if grounded:
		position = hit.position
	# On a missing surface, retain the last grounded point rather than walk into a gap.
	var travelled := Vector2(position.x - previous.x, position.z - previous.z).length()
	horizontal_speed = travelled / delta
	distance_walked += travelled
	if motion.length_squared() > 0.0:
		facing.rotation.y = atan2(-motion.x, -motion.z)
	# Both planted feet meet the same visible collision surface independently.
	for leg in legs:
		var foot := leg.global_position
		var foot_hit := ground_at(foot)
		if not foot_hit.is_empty():
			var hip_y := position.y + 0.82
			var foot_y: float = foot_hit.position.y
			leg.global_position.y = (hip_y + foot_y) * 0.5
			leg.scale.y = (hip_y - foot_y) / 0.82
	# Observe contact after all figure updates, independently of the snap assignment.
	var contact := ground_at(global_position)
	contact_gap = global_position.y - float(contact.position.y) if not contact.is_empty() else INF


func ground_at(point: Vector3) -> Dictionary:
	var query := PhysicsRayQueryParameters3D.create(
		Vector3(point.x, 4, point.z), Vector3(point.x, -2, point.z), 1
	)
	return get_world_3d().direct_space_state.intersect_ray(query)


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

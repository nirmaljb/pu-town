extends Node3D
class_name SnowTownLayout
## Reference-inspired blockout; dimensions are authored, not measured from the image.
## All obstacles stand on the flat substrate. Their roofs never become walking ground.

## The map is a rectangle centred on the origin: X runs east–west and Z
## north–south (north is −Z). Snow, shader, containment, camera and route all
## derive their bounds from these half extents rather than repeating them.
const HALF_EXTENTS := Vector2(32.0, 32.0)
## Named places in this layout. Figures start at the yard landmarks, and the
## scene route travels between landmarks rather than literal coordinates.
const LANDMARKS := {
	"yard_west": Vector2(-3, 7),
	"yard_east": Vector2(3, 7),
	"deep_field": Vector2(-3, 23),
	"deep_field_east": Vector2(1.5, 20.5),
}
const CONTACT_MARGIN := 0.0001
const MAX_DRIFT_OBSTACLES := 16

var obstacles: Array[Dictionary] = []
var drift_obstacles: Array[Dictionary] = []


func _ready() -> void:
	# North is -Z. Leave the yard and its connecting passages open for crossed trails.
	_add_box(Vector2(0, -16), Vector2(24, 14), 6.0, "lodge", true)
	_add_box(Vector2(-24, -6), Vector2(10, 10), 3.5, "shed", true)
	_add_box(Vector2(24, 0), Vector2(10, 10), 3.5, "shed", true)
	_add_box(Vector2(-22, 19), Vector2(10, 10), 3.5, "shed", true)
	_add_box(Vector2(-24, 1), Vector2(2.5, 1.5), 1.2, "generator", true)
	_add_box(Vector2(-27.5, 0.5), Vector2(1.2, 1.2), 1.4, "utility", true)
	_add_box(Vector2(-18, -20), Vector2(1.4, 1.4), 5.5, "utility", true)
	_add_box(Vector2(-8, -7.5), Vector2(3, 1.5), 1.1, "utility", true)
	_add_box(Vector2(27, 8), Vector2(2, 2), 1.4, "utility", true)
	_add_box(Vector2(-16, 22), Vector2(1, 3), 1.1, "utility", true)
	_add_box(Vector2(-29, -27), Vector2(3, 2.5), 1.8, "rock", true)
	_add_box(Vector2(27, -28), Vector2(3, 2.5), 2.0, "rock", true)
	_add_box(Vector2(3, 29), Vector2(4, 2.5), 1.6, "rock", true)
	_add_box(Vector2(-29, 29), Vector2(2.5, 2.5), 1.5, "rock", true)
	_add_box(Vector2(28, 21), Vector2(2.5, 2), 1.3, "rock", true)
	_add_box(Vector2(-29, 9), Vector2(2, 2), 1.4, "rock", true)
	for tree in [Vector2(-20, -29), Vector2(16, -28), Vector2(29, 14),
			Vector2(14, 29), Vector2(-8, 29), Vector2(-29, 14)]:
		_add_box(tree, Vector2(1.5, 1.5), 4.6, "tree")
	_add_box(Vector2(-28, 26), Vector2(6, 0.45), 1.1, "fence")
	_add_box(Vector2(23, 26), Vector2(8, 0.45), 1.1, "fence")
	_add_box(Vector2(29, -18), Vector2(0.45, 10), 1.1, "fence")
	_add_box(Vector2(-29, -18), Vector2(0.45, 6), 1.1, "fence")


func point_clear(point: Vector2, radius: float = 0.3) -> bool:
	if absf(point.x) > HALF_EXTENTS.x - radius or absf(point.y) > HALF_EXTENTS.y - radius:
		return false
	for obstacle in obstacles:
		var centre: Vector2 = obstacle.center
		var half_size: Vector2 = obstacle.size * 0.5
		var offset := (point - centre).abs() - half_size
		if offset.x <= 0.0 and offset.y <= 0.0:
			return false
		var outside := Vector2(maxf(offset.x, 0.0), maxf(offset.y, 0.0))
		if outside.length_squared() < radius * radius - 0.00000001:
			return false
	return true


func move_with_collisions(from: Vector2, to: Vector2, radius: float = 0.3) -> Vector2:
	# Sweep the full motion, including each rounded box corner, then slide along contact.
	# This also prevents a large frame interval from tunnelling through a thin fence.
	if not point_clear(from, radius):
		return from
	var point := from
	var remaining := to - from
	for iteration in range(5):
		if remaining.length_squared() < 0.0000000001:
			break
		var contact := _first_contact(point, remaining, radius)
		if contact.is_empty():
			point += remaining
			break
		var travel := maxf(0.0, float(contact.time) - CONTACT_MARGIN / remaining.length())
		point += remaining * travel
		remaining *= 1.0 - travel
		var normal: Vector2 = contact.normal
		remaining -= normal * minf(0.0, remaining.dot(normal))
	var limit := Vector2(HALF_EXTENTS.x - radius, HALF_EXTENTS.y - radius)
	return point.clamp(-limit, limit)


func _first_contact(point: Vector2, motion: Vector2, radius: float) -> Dictionary:
	var nearest: Dictionary = {}
	# Scalar limits keep the map-edge contact time in full float precision.
	var limit_x := HALF_EXTENTS.x - radius
	var limit_y := HALF_EXTENTS.y - radius
	if motion.x > 0.0:
		_consider(nearest, (limit_x - point.x) / motion.x, Vector2.LEFT, motion)
	elif motion.x < 0.0:
		_consider(nearest, (-limit_x - point.x) / motion.x, Vector2.RIGHT, motion)
	if motion.y > 0.0:
		_consider(nearest, (limit_y - point.y) / motion.y, Vector2.UP, motion)
	elif motion.y < 0.0:
		_consider(nearest, (-limit_y - point.y) / motion.y, Vector2.DOWN, motion)
	for obstacle in obstacles:
		var centre: Vector2 = obstacle.center
		var half_size: Vector2 = obstacle.size * 0.5
		var low := centre - half_size
		var high := centre + half_size
		if absf(motion.x) > 0.0000001:
			var edge_x := low.x - radius if motion.x > 0.0 else high.x + radius
			var time := (edge_x - point.x) / motion.x
			var along := point.y + motion.y * time
			if along >= low.y and along <= high.y:
				_consider(nearest, time, Vector2.LEFT if motion.x > 0.0 else Vector2.RIGHT, motion)
		if absf(motion.y) > 0.0000001:
			var edge_y := low.y - radius if motion.y > 0.0 else high.y + radius
			var time := (edge_y - point.y) / motion.y
			var along := point.x + motion.x * time
			if along >= low.x and along <= high.x:
				_consider(nearest, time, Vector2.UP if motion.y > 0.0 else Vector2.DOWN, motion)
		for side_x in [-1.0, 1.0]:
			for side_y in [-1.0, 1.0]:
				var corner := centre + half_size * Vector2(side_x, side_y)
				var offset := point - corner
				var quadratic_a := motion.length_squared()
				var quadratic_b := offset.dot(motion)
				var quadratic_c := offset.length_squared() - radius * radius
				var discriminant := quadratic_b * quadratic_b - quadratic_a * quadratic_c
				if discriminant < 0.0:
					continue
				var time := (-quadratic_b - sqrt(discriminant)) / quadratic_a
				var contact_offset := point + motion * time - corner
				# Only the quarter-circle outside both adjacent faces belongs to this corner.
				if contact_offset.x * side_x >= -0.000001 and contact_offset.y * side_y >= -0.000001:
					_consider(nearest, time, contact_offset.normalized(), motion)
	return nearest


func _consider(nearest: Dictionary, time: float, normal: Vector2, motion: Vector2) -> void:
	if time < -0.0000001 or time > 1.0 or motion.dot(normal) >= -0.0000001:
		return
	if nearest.is_empty() or time < float(nearest.time):
		nearest.time = maxf(0.0, time)
		nearest.normal = normal


func _add_box(centre: Vector2, size: Vector2, height: float, kind: String, catches_drift: bool = false) -> void:
	var obstacle := {"center": centre, "size": size, "height": height, "kind": kind}
	obstacles.append(obstacle)
	if catches_drift and drift_obstacles.size() < MAX_DRIFT_OBSTACLES:
		drift_obstacles.append(obstacle)
	var material := StandardMaterial3D.new()
	material.albedo_color = _colour_for(kind)
	material.roughness = 0.96
	var shape := BoxMesh.new()
	shape.size = Vector3(size.x, height, size.y)
	var box := MeshInstance3D.new()
	box.name = kind.capitalize() + str(obstacles.size())
	box.mesh = shape
	box.material_override = material
	box.position = Vector3(centre.x, height * 0.5, centre.y)
	add_child(box)


func _colour_for(kind: String) -> Color:
	match kind:
		"lodge": return Color("716960")
		"shed": return Color("7d7468")
		"generator": return Color("697477")
		"utility": return Color("827d72")
		"tree": return Color("586861")
		"rock": return Color("747b82")
		"fence": return Color("77736d")
	return Color("808080")

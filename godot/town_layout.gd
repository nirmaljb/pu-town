extends Node3D
class_name SnowTownLayout
## Blockout of the whole-map reference (docs/art/snow-town-reference/town-top-down.png):
## a walled compound in the west, the meeting hall in the central gap and the
## outpost in the east, with rock masses around the rim and pines in the
## southern forest. Composition follows the picture; dimensions are authored.
## All obstacles stand on the flat substrate. Their roofs never become walking ground.

## The map is a rectangle centred on the origin: X runs east–west and Z
## north–south (north is −Z). Snow, shader, containment, camera and route all
## derive their bounds from these half extents rather than repeating them.
const HALF_EXTENTS := Vector2(50.0, 28.0)
## Named places in this layout. Figures start at the outpost yard landmarks, and
## the scene route travels between landmarks rather than literal coordinates.
## Each consecutive pair the route uses is joined by open, axis-aligned ground.
const LANDMARKS := {
	"outpost_yard_west": Vector2(22, 4),
	"outpost_yard_east": Vector2(28, 4),
	"lodge_front": Vector2(32, -2),
	"meeting_hall_gap_south": Vector2(-6, 7.5),
	"meeting_hall_gap": Vector2(-6, 0),
	"east_gate": Vector2(-9.25, 0),
	"courtyard_east": Vector2(-12, 0),
	"courtyard": Vector2(-22, 0),
	"courtyard_west": Vector2(-30, 3),
}
const CONTACT_MARGIN := 0.0001
const MAX_DRIFT_OBSTACLES := 16
const PINE_SIZE := Vector2(1.6, 1.6)

var obstacles: Array[Dictionary] = []
var drift_obstacles: Array[Dictionary] = []


func _ready() -> void:
	# North is -Z. Boxes are given by centre and east–west × north–south size.
	_add_compound()
	_add_box(Vector2(0.5, -1.2), Vector2(8.5, 12), 7.0, "meeting_hall", true)
	_add_box(Vector2(-1, 10.5), Vector2(3, 2), 1.0, "crate")
	_add_box(Vector2(2, 10), Vector2(1.2, 1.2), 1.1, "barrel")
	_add_outpost()
	_add_rim_and_forest()


func _add_compound() -> void:
	# The courtyard spans x -34..-10, z -9..4.5. Its east gate faces the meeting
	# hall and its south gate (the gatehouse) faces the forest; both are 3 m wide.
	_add_box(Vector2(-38, -6), Vector2(8, 25), 6.0, "range", true)
	_add_box(Vector2(-28.5, -13), Vector2(11, 8), 6.0, "range", true)
	_add_box(Vector2(-25.25, -17.25), Vector2(4.5, 4.5), 14.0, "bell_tower", true)
	_add_box(Vector2(-16.25, -13.75), Vector2(13.5, 9.5), 7.0, "long_hall", true)
	_add_box(Vector2(-8, -13.25), Vector2(3, 8.5), 5.0, "range")
	_add_box(Vector2(-12, -6.75), Vector2(4, 4.5), 4.5, "range")
	_add_box(Vector2(-9.25, -5.25), Vector2(1.5, 7.5), 4.0, "wall")
	_add_box(Vector2(-9.25, 3), Vector2(1.5, 3), 4.0, "wall")
	_add_box(Vector2(-34.25, 5.5), Vector2(15.5, 2), 4.0, "wall", true)
	_add_box(Vector2(-14.5, 5.5), Vector2(12, 2), 4.0, "wall", true)
	_add_box(Vector2(-25.75, 6.5), Vector2(1.5, 5), 7.0, "gatehouse")
	_add_box(Vector2(-21.25, 6.5), Vector2(1.5, 5), 7.0, "gatehouse")
	_add_box(Vector2(-25.8, -2.9), Vector2(3.5, 3.5), 3.5, "well_pavilion")
	for pine in [Vector2(-17, 2.5), Vector2(-14.5, 3)]:
		_add_box(pine, PINE_SIZE, 6.0, "pine")


func _add_outpost() -> void:
	# The yard spans roughly x 16..36, z -6..12 and stays open between the lodge,
	# the sheds and the workshop.
	_add_box(Vector2(31, -12.5), Vector2(18, 13), 8.0, "lodge", true)
	_add_box(Vector2(11.5, -12.75), Vector2(8, 7.5), 4.5, "shed", true)
	_add_box(Vector2(11.75, 2.5), Vector2(7.5, 7), 5.0, "workshop", true)
	_add_box(Vector2(38.75, 3.5), Vector2(6.5, 6), 4.0, "shed", true)
	_add_box(Vector2(18.5, -15), Vector2(1.6, 1.6), 14.0, "radio_tower")
	_add_box(Vector2(17.2, -9.5), Vector2(2.4, 1.4), 1.2, "generator")
	_add_box(Vector2(20.5, -8), Vector2(1.5, 1.5), 1.0, "crate")
	_add_box(Vector2(12, 9.75), Vector2(2.5, 1.5), 1.0, "crate")
	_add_box(Vector2(34, 8.5), Vector2(1.4, 1.4), 1.0, "crate")
	_add_box(Vector2(9, -7.5), Vector2(1.2, 1.2), 1.1, "barrel")
	_add_box(Vector2(16, 11), Vector2(4.5, 0.45), 1.1, "fence")
	_add_box(Vector2(26.5, 14.5), Vector2(5.5, 0.45), 1.1, "fence")
	_add_box(Vector2(38, 9.5), Vector2(0.45, 4), 1.1, "fence")


func _add_rim_and_forest() -> void:
	_add_box(Vector2(-47, -3), Vector2(6, 18), 5.0, "rock", true)
	_add_box(Vector2(4, -20), Vector2(6, 16), 6.0, "rock", true)
	_add_box(Vector2(46.5, -17), Vector2(7, 22), 6.0, "rock", true)
	_add_box(Vector2(-0.5, 18), Vector2(7, 8), 4.0, "rock", true)
	_add_box(Vector2(9, 21), Vector2(10, 14), 5.0, "rock", true)
	_add_box(Vector2(-46.5, -23.5), Vector2(7, 9), 5.0, "rock")
	_add_box(Vector2(-2.5, -24), Vector2(7, 8), 5.0, "rock")
	_add_box(Vector2(10.5, -23.5), Vector2(7, 9), 5.0, "rock")
	_add_box(Vector2(30, -24.5), Vector2(16, 7), 5.0, "rock")
	_add_box(Vector2(47.5, 3), Vector2(5, 18), 5.0, "rock")
	_add_box(Vector2(45, 20), Vector2(10, 16), 5.0, "rock")
	_add_box(Vector2(19, 23), Vector2(10, 10), 4.5, "rock")
	_add_box(Vector2(32, 25), Vector2(16, 6), 4.0, "rock")
	# The southern forest leaves an open lane south of the gatehouse (x -27..-20).
	for pine in [Vector2(-46, 12), Vector2(-41.5, 14.5), Vector2(-37, 11.5), Vector2(-44.5, 20),
			Vector2(-39, 19.5), Vector2(-33.5, 15), Vector2(-30.5, 20), Vector2(-47, 26),
			Vector2(-41, 25), Vector2(-35, 23.5), Vector2(-30, 26), Vector2(-17, 12),
			Vector2(-13, 15), Vector2(-16.5, 19), Vector2(-11.5, 21.5), Vector2(-18, 25),
			Vector2(-13.5, 26), Vector2(-38, -23.5), Vector2(-32, -24.5), Vector2(-20, -23.5),
			Vector2(-13, -22.5)]:
		_add_box(pine, PINE_SIZE, 6.5, "pine")


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
	# Muted stone, timber and metal tones keep each kind distinguishable in the blockout.
	match kind:
		"range": return Color("6f6a64")
		"long_hall": return Color("5c554f")
		"bell_tower": return Color("8c857b")
		"wall": return Color("9a958c")
		"gatehouse": return Color("7f766b")
		"well_pavilion": return Color("7a6a58")
		"meeting_hall": return Color("6b5a4a")
		"lodge": return Color("716960")
		"shed": return Color("7d7468")
		"workshop": return Color("7a6f5f")
		"radio_tower": return Color("5a636c")
		"generator": return Color("697477")
		"crate": return Color("8a7559")
		"barrel": return Color("625447")
		"fence": return Color("77736d")
		"rock": return Color("747b82")
		"pine": return Color("4f6158")
	return Color("808080")

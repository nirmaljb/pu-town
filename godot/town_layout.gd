extends Node3D
class_name SnowTownLayout
## Blockout of the whole-map reference (docs/art/snow-town-reference/town-top-down.png):
## a walled compound in the west, the meeting hall in the central gap and the
## outpost in the east, with rock masses around the rim and pines in the
## southern forest. Composition follows the picture; dimensions are authored.
## The town shelf stands about 5 m above the southern forest. One snow-buried slope,
## the stair from the compound's south gate, joins them between low walls; every
## other change of level lies beneath impassable cliff rock. Each obstacle stands
## on the ground of its level. Their roofs never become walking ground.

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
	"south_gate": Vector2(-23.5, 2),
	"forest_lane": Vector2(-23.5, 22),
	"forest_west": Vector2(-28, 24),
}
## Ground levels. The shelf carries the compound, meeting hall and outpost; the
## forest lies west of FOREST_EAST and south of FOREST_NORTH. Both lines run
## beneath cliff rock, at least one coarse snow cell inside every rock face.
const SHELF_GROUND := 0.0
const FOREST_GROUND := -5.0
const FOREST_NORTH := 10.0
const FOREST_EAST := -5.5
## The stair: one slope from the south gate (STAIR_TOP) to the forest (STAIR_FOOT).
## Its ground band reaches beneath the low walls and into the flanking cliff rock.
const STAIR_GROUND_X := Vector2(-26.5, -20.5)
const STAIR_TOP := 9.0
const STAIR_FOOT := 19.0
const STAIR_WALL_SEGMENTS := 10
const STAIR_WALL_HEIGHT := 1.0
## The ground-height picture stores heights at nodes 0.2 m apart, counted from
## the map's west and north edges, and is read bilinearly.
const GROUND_NODES_PER_METRE := 5.0
const GROUND_SIZE := Vector2i(HALF_EXTENTS * (2.0 * GROUND_NODES_PER_METRE)) + Vector2i.ONE
const CONTACT_MARGIN := 0.0001
const MAX_DRIFT_OBSTACLES := 16
const PINE_SIZE := Vector2(1.6, 1.6)

var obstacles: Array[Dictionary] = []
var drift_obstacles: Array[Dictionary] = []
var ground_image: Image
var ground_range := Vector2(SHELF_GROUND, SHELF_GROUND)
var _ground := PackedFloat32Array()


func _ready() -> void:
	_build_ground()
	# North is -Z. Boxes are given by centre and east–west × north–south size;
	# a box's height is how far it rises above the highest ground beneath it.
	_add_compound()
	_add_stair_and_cliffs()
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


func _add_stair_and_cliffs() -> void:
	# The stair continues the 3 m south gate between the gatehouse boxes. Its low
	# walls step down with the slope, each segment standing on the ground under it.
	var length := (STAIR_FOOT - STAIR_TOP) / float(STAIR_WALL_SEGMENTS)
	for segment in range(STAIR_WALL_SEGMENTS):
		var z := STAIR_TOP + (float(segment) + 0.5) * length
		for x in [-25.25, -21.75]:
			_add_box(Vector2(x, z), Vector2(0.5, length), STAIR_WALL_HEIGHT, "stair_wall")
	# Cliff rock covers every step between the shelf and the forest. Rising 2 m
	# above the shelf, each mass also hides the snow over the step beneath it.
	_add_box(Vector2(-38.25, 9.25), Vector2(23.5, 5.5), 2.0, "cliff")
	_add_box(Vector2(-27.75, 12.75), Vector2(4.5, 12.5), 2.0, "cliff")
	_add_box(Vector2(-19.25, 12.75), Vector2(4.5, 12.5), 2.0, "cliff")
	_add_box(Vector2(-10, 11), Vector2(14, 4), 2.0, "cliff")
	_add_box(Vector2(-5.5, 18.5), Vector2(5, 19), 2.0, "cliff")


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
	# The southern forest leaves an open lane south of the stair (x -27..-20).
	for pine in [Vector2(-46, 14), Vector2(-41.5, 14.5), Vector2(-36.5, 13.5), Vector2(-44.5, 20),
			Vector2(-39, 19.5), Vector2(-33.5, 15), Vector2(-30.5, 20), Vector2(-47, 26),
			Vector2(-41, 25), Vector2(-35, 23.5), Vector2(-30, 26), Vector2(-10.5, 15),
			Vector2(-13, 15), Vector2(-15.5, 20), Vector2(-11.5, 21.5), Vector2(-18, 25),
			Vector2(-13.5, 26), Vector2(-38, -23.5), Vector2(-32, -24.5), Vector2(-20, -23.5),
			Vector2(-13, -22.5)]:
		_add_box(pine, PINE_SIZE, 6.5, "pine")


## Static ground height at a world XZ point, read from the ground-height picture.
## SnowSurface and snow.gdshader interpolate the same nodes in the same way.
func ground_height(point: Vector2) -> float:
	var node := (point + HALF_EXTENTS) * GROUND_NODES_PER_METRE
	var cell := Vector2i(clampi(floori(node.x), 0, GROUND_SIZE.x - 2), clampi(floori(node.y), 0, GROUND_SIZE.y - 2))
	var blend := (node - Vector2(cell)).clamp(Vector2.ZERO, Vector2.ONE)
	var index := cell.y * GROUND_SIZE.x + cell.x
	return lerpf(
		lerpf(_ground[index], _ground[index + 1], blend.x),
		lerpf(_ground[index + GROUND_SIZE.x], _ground[index + GROUND_SIZE.x + 1], blend.x),
		blend.y
	)


func _authored_ground(point: Vector2) -> float:
	# Authored levels and the one slope. The picture is built from this once.
	if point.x >= STAIR_GROUND_X.x and point.x <= STAIR_GROUND_X.y and point.y >= STAIR_TOP and point.y <= STAIR_FOOT:
		return lerpf(SHELF_GROUND, FOREST_GROUND, (point.y - STAIR_TOP) / (STAIR_FOOT - STAIR_TOP))
	if point.x < FOREST_EAST and point.y > FOREST_NORTH:
		return FOREST_GROUND
	return SHELF_GROUND


func _build_ground() -> void:
	_ground.resize(GROUND_SIZE.x * GROUND_SIZE.y)
	for row in range(GROUND_SIZE.y):
		for column in range(GROUND_SIZE.x):
			var point := Vector2(column, row) / GROUND_NODES_PER_METRE - HALF_EXTENTS
			_ground[row * GROUND_SIZE.x + column] = _authored_ground(point)
	ground_image = Image.create_from_data(GROUND_SIZE.x, GROUND_SIZE.y, false, Image.FORMAT_RF, _ground.to_byte_array())
	ground_range = Vector2(minf(SHELF_GROUND, FOREST_GROUND), maxf(SHELF_GROUND, FOREST_GROUND))


func _ground_under(centre: Vector2, size: Vector2) -> Vector2:
	# Lowest and highest picture nodes beneath a footprint, including its edges.
	var low := Vector2i(((centre - size * 0.5 + HALF_EXTENTS) * GROUND_NODES_PER_METRE).floor())
	var high := Vector2i(((centre + size * 0.5 + HALF_EXTENTS) * GROUND_NODES_PER_METRE).ceil())
	var heights := Vector2(INF, -INF)
	for row in range(maxi(0, low.y), mini(GROUND_SIZE.y - 1, high.y) + 1):
		for column in range(maxi(0, low.x), mini(GROUND_SIZE.x - 1, high.x) + 1):
			var height := _ground[row * GROUND_SIZE.x + column]
			heights = Vector2(minf(heights.x, height), maxf(heights.y, height))
	return heights


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
	# A box stands on the lowest ground beneath it and rises `height` above the highest.
	var under := _ground_under(centre, size)
	var base := under.x
	var top := under.y + height
	var obstacle := {"center": centre, "size": size, "base": base, "top": top, "kind": kind}
	obstacles.append(obstacle)
	if catches_drift and drift_obstacles.size() < MAX_DRIFT_OBSTACLES:
		drift_obstacles.append(obstacle)
	var material := StandardMaterial3D.new()
	material.albedo_color = _colour_for(kind)
	material.roughness = 0.96
	var shape := BoxMesh.new()
	shape.size = Vector3(size.x, top - base, size.y)
	var box := MeshInstance3D.new()
	box.name = kind.capitalize() + str(obstacles.size())
	box.mesh = shape
	box.material_override = material
	box.position = Vector3(centre.x, (base + top) * 0.5, centre.y)
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
		"cliff": return Color("666d73")
		"stair_wall": return Color("8f8a82")
		"pine": return Color("4f6158")
	return Color("808080")

extends Node3D
class_name SnowTownLayout
## The interim snowfield: one flat level of open snow, north up and centred on the
## origin, with the Camp at its centre: placeholder boxes for its buildings round the
## open Town Square's Shallow Snow. Four Shallow Roads run from the square's corners
## to the map's edge, and placeholder tree clusters stand in Deep Snow round the Camp.
## Its edge is a plain containment boundary with no wall, lost in the whiteout.
## Movement, wind and the walking figure read the buildings and trees from one
## obstacle list; their roofs never become walking ground.

## The map is a rectangle centred on the origin: X runs east–west and Z
## north–south (north is −Z). Snow, shader, containment, camera and route all
## derive their bounds from these half extents rather than repeating them.
const HALF_EXTENTS := Vector2(80.0, 80.0)
## The ground is one flat level at this height. Foot support and the shader both
## read it here, so they agree everywhere.
const GROUND_LEVEL := 0.0
## Named places on the map. Figures start either side of the centre, and the scene
## route travels between landmarks rather than literal coordinates. Each
## consecutive pair the route uses is joined by open, axis-aligned ground.
const LANDMARKS := {
	"start_west": Vector2(-1.5, 0),
	"start_east": Vector2(1.5, 0),
	# The route's stages west of the Camp, reached along the lane that leaves the
	# Town Square westward between the generator shed and the crate stacks. From the
	# lane's west end it walks south past the south-west tree cluster's east side into
	# its Deep Snow, where it packs a lane by running and walking west from its
	# landmark. From there it walks east to the south-west Road's corner of the Town
	# Square and follows the Road to the map's edge.
	"west_lane": Vector2(-34, 0),
	"deep_lane": Vector2(-38, 16),
	# The route walks east along that lane from here into the overview's detail
	# region, and fixes a probe exposed to the wind where it stops in the Town Square.
	"overview_west": Vector2(-26, 4),
	"exposed_probe": Vector2(4, 4),
	# Where the route walks into the Camp's buildings and probes the wind beside
	# them: north into the small shed's south face, whose lee the workshop shelters;
	# up the Town Square's west side to the lodge's west face, exposed to the
	# north-west wind; and north into the lodge's south face, in its lee.
	"small_shed_south": Vector2(28, 4),
	"town_square_west": Vector2(-12, 3),
	"lodge_windward": Vector2(-9.7, -22),
	"lodge_south": Vector2(4, -14),
	# Corners of the walking figure's loop. It keeps clear of the route's trail
	# probe, Packed Path corridor and wind probes, crosses the Town Square on its own
	# lane south of the lodge and heads north past the lodge's west end into open snow.
	"loop_east": Vector2(8, 0),
	"loop_north": Vector2(8, -10),
	"loop_lane_west": Vector2(-14, -10),
	"loop_open": Vector2(-14, -36),
}
## The figure you are not controlling walks this loop: east from the centre, north
## and west across the Town Square, then north out into open snow, and back the
## same way. Consecutive landmarks are joined by straight, open ground.
const LOOP: Array[String] = ["start_east", "loop_east", "loop_north", "loop_lane_west", "loop_open"]
## The Camp's placeholder buildings round the Town Square, arranged after the
## owner's painted centre reference: the lodge to the north with the antenna mast
## beside its west end, the two cabins to the south, the generator shed, radio tower
## and crate and barrel stacks to the west, and the open workshop and small shed to
## the east. Each is a solid box
## on the ground, given by its name, the kind that colours its placeholder, its
## centre, east–west × north–south size and height; a
## figure can neither enter one nor stand on its roof. The four diagonals out of the
## Town Square's corners stay open for the Roads.
const CAMP: Array[Dictionary] = [
	{"name": "lodge", "kind": "lodge", "center": Vector2(1, -22), "size": Vector2(20, 12), "height": 7.0},
	{"name": "chimney", "kind": "chimney", "center": Vector2(11.7, -20), "size": Vector2(1.4, 1.4), "height": 9.5},
	{"name": "generator_shed", "kind": "shed", "center": Vector2(-26, -6), "size": Vector2(8, 6), "height": 3.5},
	{"name": "antenna_mast", "kind": "mast", "center": Vector2(-12, -26), "size": Vector2(0.5, 0.5), "height": 12.0},
	{"name": "radio_tower", "kind": "mast", "center": Vector2(-28, 10.5), "size": Vector2(3, 3), "height": 16.0},
	{"name": "crate_stack", "kind": "crates", "center": Vector2(-23.5, 8), "size": Vector2(2.4, 1.6), "height": 1.2},
	{"name": "crate_stack_tall", "kind": "crates", "center": Vector2(-21.5, 10.5), "size": Vector2(1.6, 1.6), "height": 1.6},
	{"name": "barrel_stack", "kind": "barrels", "center": Vector2(-24, 11), "size": Vector2(1.2, 1.2), "height": 1.0},
	{"name": "cabin_west", "kind": "cabin", "center": Vector2(-6.5, 19.5), "size": Vector2(7, 5.5), "height": 4.0},
	{"name": "cabin_east", "kind": "cabin", "center": Vector2(6.5, 19.5), "size": Vector2(7, 5.5), "height": 4.0},
	{"name": "workshop", "kind": "workshop", "center": Vector2(25, -6), "size": Vector2(8, 6), "height": 3.5},
	{"name": "small_shed", "kind": "shed", "center": Vector2(28, 0), "size": Vector2(4, 3), "height": 2.6},
]
## Warm lamps on the Camp's doors and windows facing the Town Square, the
## references' contrast against the cold blizzard: (x, height above the ground, z),
## each just outside a building's face. They stay at eight, the Compatibility
## renderer's lights per object, so every one reaches the snow.
const WARM_LIGHTS := {
	"lodge_door": Vector3(1, 2.4, -15.85),
	"lodge_window_west": Vector3(-5, 2.2, -15.85),
	"lodge_window_east": Vector3(7, 2.2, -15.85),
	"generator_shed_door": Vector3(-21.85, 2.2, -6),
	"workshop_door": Vector3(20.85, 2.2, -6),
	"small_shed_window": Vector3(25.85, 1.8, 0),
	"cabin_west_door": Vector3(-6.5, 2.2, 16.6),
	"cabin_east_door": Vector3(6.5, 2.2, 16.6),
}
## Roads, ways laid through the snow from the Town Square to the map's edge. Each
## leaves the square's corner on its side and runs straight on along its diagonal
## heading until it meets the edge. A Road is a Shallow corridor ROAD_WIDTH wide
## with no ground of its own: it exists before anyone walks it, unlike a Packed
## Path, and wind can still drift over it.
const ROAD_WIDTH := 4.0
const ROADS := {
	"north_west": Vector2(-1, -1),
	"north_east": Vector2(1, -1),
	"south_west": Vector2(-1, 1),
	"south_east": Vector2(1, 1),
}
## Placeholder tree clusters, standing where the owner's satellite sketch has trees
## near the Camp until pines replace them: each a zone of Deep Snow holding solid
## placeholder tree boxes, TREE_SIZE across and TREE_HEIGHT tall, which block a
## figure and shelter, drift and scour snow like the Camp's buildings. The
## south-west cluster's corner tree stands upwind of the south-west Road with no
## tree upwind of it within its shelter, so its Snowdrift builds over the Road.
const TREE_SIZE := Vector2(2, 2)
const TREE_HEIGHT := 6.5
const TREE_CLUSTERS: Array[Dictionary] = [
	{"name": "west", "zone": Rect2(-78, -36, 20, 24), "trees": [Vector2(-62, -16), Vector2(-66.5, -20), Vector2(-71, -15.5),
		Vector2(-75, -21), Vector2(-61, -24.5), Vector2(-69, -27), Vector2(-64.5, -32), Vector2(-74, -32.5)]},
	{"name": "south_west", "zone": Rect2(-54, 12, 18.5, 14.5), "trees": [Vector2(-36.5, 25.5), Vector2(-44.5, 25),
		Vector2(-50, 21.5), Vector2(-52.5, 25), Vector2(-48.5, 18.6), Vector2(-52.5, 15), Vector2(-47.5, 13.2), Vector2(-42.5, 13.2)]},
	{"name": "north_east", "zone": Rect2(60, -46, 18, 16), "trees": [Vector2(63, -43), Vector2(67.5, -39.5), Vector2(72, -44),
		Vector2(76, -38.5), Vector2(64, -34.5), Vector2(69, -32), Vector2(74, -32.5)]},
	{"name": "south_east", "zone": Rect2(44, 14, 16, 16), "trees": [Vector2(47, 17), Vector2(51.5, 20.5), Vector2(56.5, 16.5),
		Vector2(58, 24), Vector2(53, 27.5), Vector2(47.5, 24.5)]},
]
## Starting Snow Depth by place, measured vertically above the ground. Shallow
## Snow lets a Player run; deeper snow holds running back until traffic packs it,
## and Deep Snow allows only walking until it is packed. The Town Square, the
## Camp's open yard between its buildings, and the Roads are Shallow; the tree
## clusters are Deep; the open snow elsewhere lies at an in-between depth. Each zone
## fades into its surroundings over ZONE_BLEND metres, and Shallow wins where they meet.
const SHALLOW_SNOW := 0.09
const OPEN_SNOW := 0.25
const DEEP_SNOW := 0.6
const MIN_SNOW_DEPTH := 0.03
const ZONE_BLEND := 1.5
const TOWN_SQUARE := Rect2(-20, -15, 40, 30)
const CONTACT_MARGIN := 0.0001

var obstacles := solid_boxes()
## Each Road's centre line, from its Town Square corner to the map's edge.
var road_lines: Array[PackedVector2Array] = []
## The closed loop: out along LOOP and back, so its last corner leads to its first.
var loop_corners := PackedVector2Array()
## Distance along the closed loop to each corner, and the loop's whole length.
var loop_starts := PackedFloat32Array()
var loop_length := 0.0


func _init() -> void:
	for name in ROADS:
		road_lines.append(road(name))
	for name in LOOP:
		loop_corners.append(LANDMARKS[name])
	for index in range(LOOP.size() - 2, 0, -1):
		loop_corners.append(LANDMARKS[LOOP[index]])
	for index in range(loop_corners.size()):
		loop_starts.append(loop_length)
		loop_length += loop_corners[index].distance_to(loop_corners[(index + 1) % loop_corners.size()])


func _ready() -> void:
	# Boxes of a kind share one material.
	var materials := {}
	for obstacle in obstacles:
		if not materials.has(obstacle.kind):
			var material := StandardMaterial3D.new()
			material.albedo_color = _colour_for(obstacle.kind)
			material.roughness = 0.96
			materials[obstacle.kind] = material
		var shape := BoxMesh.new()
		shape.size = Vector3(obstacle.size.x, obstacle.top - obstacle.base, obstacle.size.y)
		var box := MeshInstance3D.new()
		box.name = obstacle.name.to_pascal_case()
		box.mesh = shape
		box.material_override = materials[obstacle.kind]
		box.position = Vector3(obstacle.center.x, (obstacle.base + obstacle.top) * 0.5, obstacle.center.y)
		add_child(box)


func _colour_for(kind: String) -> Color:
	# Muted timber, stone and metal tones keep each kind distinguishable in the blockout.
	match kind:
		"lodge": return Color("716960")
		"chimney": return Color("8c857b")
		"shed": return Color("697477")
		"mast": return Color("5a636c")
		"crates": return Color("8a7559")
		"barrels": return Color("625447")
		"cabin": return Color("6b5a4a")
		"workshop": return Color("7a6f5f")
		"tree": return Color("34433b")
	return Color("808080")


## The obstacle list: every Camp building and placeholder tree as a solid box by
## name, kind, centre, size and the heights of its base and top. North is −Z; each
## stands on the ground and rises its height above it.
static func solid_boxes() -> Array[Dictionary]:
	var boxes: Array[Dictionary] = []
	for building in CAMP:
		boxes.append({"name": building.name, "kind": building.kind, "center": building.center, "size": building.size,
			"base": GROUND_LEVEL, "top": GROUND_LEVEL + building.height})
	for cluster in TREE_CLUSTERS:
		for index in range(cluster.trees.size()):
			boxes.append({"name": "%s_tree_%d" % [cluster.name, index + 1], "kind": "tree", "center": cluster.trees[index],
				"size": TREE_SIZE, "base": GROUND_LEVEL, "top": GROUND_LEVEL + TREE_HEIGHT})
	return boxes


## A Road's centre line, from its Town Square corner to where its heading meets
## the map's edge.
static func road(name: String) -> PackedVector2Array:
	var heading: Vector2 = ROADS[name].normalized()
	var start := TOWN_SQUARE.get_center() + TOWN_SQUARE.size * 0.5 * heading.sign()
	var reach := minf((HALF_EXTENTS.x - absf(start.x)) / absf(heading.x), (HALF_EXTENTS.y - absf(start.y)) / absf(heading.y))
	return PackedVector2Array([start, start + heading * reach])


## Ground height at a world XZ point. SnowSurface and snow.gdshader read the same level.
func ground_height(_point: Vector2) -> float:
	return GROUND_LEVEL


## Snow Depth at a world XZ point when the map starts: the authored zones,
## never less than MIN_SNOW_DEPTH. SnowSurface saves it into its Snow Depth picture.
func starting_snow_depth(point: Vector2) -> float:
	var depth := OPEN_SNOW
	for cluster in TREE_CLUSTERS:
		depth = lerpf(depth, DEEP_SNOW, _zone_weight(_outside(cluster.zone, point)))
	var shallow := _zone_weight(_outside(TOWN_SQUARE, point))
	for line in road_lines:
		var beside := point.distance_to(Geometry2D.get_closest_point_to_segment(point, line[0], line[1])) - ROAD_WIDTH * 0.5
		shallow = maxf(shallow, _zone_weight(beside))
	return maxf(MIN_SNOW_DEPTH, lerpf(depth, SHALLOW_SNOW, shallow))


## How fully a zone applies at a point this far outside it.
func _zone_weight(distance: float) -> float:
	return 1.0 - smoothstep(0.0, ZONE_BLEND, distance)


## Distance from a point to a rectangle; zero inside it.
func _outside(zone: Rect2, point: Vector2) -> float:
	var offset := (point - zone.get_center()).abs() - zone.size * 0.5
	return Vector2(maxf(offset.x, 0.0), maxf(offset.y, 0.0)).length()


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


## Whether a figure could walk straight from one point to another without contact.
func segment_clear(from: Vector2, to: Vector2, radius: float = 0.3) -> bool:
	return point_clear(from, radius) and point_clear(to, radius) and _first_contact(from, to - from, radius).is_empty()


## Where a figure standing at `from` joins the loop: the nearest loop point it can
## walk to in a straight line, with the corner it then heads for and the fraction
## of the loop's length at which it joins. If no loop point is in straight reach,
## the nearest one is used and the figure slides toward it.
func loop_entry(from: Vector2, radius: float = 0.3) -> Dictionary:
	var candidates: Array[Dictionary] = []
	for index in range(loop_corners.size()):
		var start := loop_corners[index]
		var finish := loop_corners[(index + 1) % loop_corners.size()]
		var length := start.distance_to(finish)
		# The nearest point of the segment, then points every half metre along it.
		var along := clampf((from - start).dot(finish - start) / maxf(length * length, 0.000001), 0.0, 1.0) * length
		var offsets := [along]
		for sample in range(int(length / 0.5) + 1):
			offsets.append(minf(sample * 0.5, length))
		for offset in offsets:
			var point := start.move_toward(finish, offset)
			candidates.append({"point": point, "distance": from.distance_to(point), "corner": (index + 1) % loop_corners.size(),
				"progress": (loop_starts[index] + offset) / loop_length})
	candidates.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
		return a.distance < b.distance or (a.distance == b.distance and a.progress < b.progress))
	for candidate in candidates:
		if candidate.distance < 0.0001 or segment_clear(from, candidate.point, radius):
			return candidate
	return candidates.front()


## The fraction of the loop's length at a point on the segment that ends at `corner`.
func loop_progress(corner: int, point: Vector2) -> float:
	var start := (corner - 1 + loop_corners.size()) % loop_corners.size()
	return (loop_starts[start] + loop_corners[start].distance_to(point)) / loop_length


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

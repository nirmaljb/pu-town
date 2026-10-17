extends Node3D
class_name SnowTownLayout
## The interim snowfield: one flat level of open snow, north up and centred on the
## origin, with Shallow Snow in the Town Square at its centre. Its edge is a plain
## containment boundary with no wall, lost in the whiteout. Nothing stands on it
## yet: the obstacle list that movement, wind and the walking figure read is empty.

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
	# The route's stages in the open snow west of the Town Square: a lane it packs
	# by running and walking north from its landmark, and the start of the trail it
	# probes before running on to the northern edge.
	"packed_lane": Vector2(-24, 0),
	"trail_start": Vector2(-30, -12),
	# The route walks east from here into the overview's detail region, and fixes
	# a probe exposed to the wind where it stops.
	"overview_west": Vector2(-26, 4),
	"exposed_probe": Vector2(4, 4),
	# Corners of the walking figure's loop. It keeps clear of the route's trail
	# probe, Packed Path corridor and exposed probe, and crosses the Town Square
	# on its own lane before heading north into open snow.
	"loop_east": Vector2(8, 0),
	"loop_north": Vector2(8, -10),
	"loop_lane_west": Vector2(-14, -10),
	"loop_open": Vector2(-14, -36),
}
## The figure you are not controlling walks this loop: east from the centre, north
## and west across the Town Square, then north out into open snow, and back the
## same way. Consecutive landmarks are joined by straight, open ground.
const LOOP: Array[String] = ["start_east", "loop_east", "loop_north", "loop_lane_west", "loop_open"]
## Warm lanterns standing in the snow round the Town Square, the references'
## contrast against the cold blizzard: (x, height above the ground, z). They stay
## at eight, the Compatibility renderer's lights per object, so every one reaches
## the snow, and move onto the buildings when the Camp stands here.
const WARM_LIGHTS := {
	"lantern_north_north_east": Vector3(6.5, 0.3, -15.7),
	"lantern_east_north_east": Vector3(15.7, 0.3, -6.5),
	"lantern_east_south_east": Vector3(15.7, 0.3, 6.5),
	"lantern_south_south_east": Vector3(6.5, 0.3, 15.7),
	"lantern_south_south_west": Vector3(-6.5, 0.3, 15.7),
	"lantern_west_south_west": Vector3(-15.7, 0.3, 6.5),
	"lantern_west_north_west": Vector3(-15.7, 0.3, -6.5),
	"lantern_north_north_west": Vector3(-6.5, 0.3, -15.7),
}
## Starting Snow Depth by place, measured vertically above the ground. Shallow
## Snow lets a Player run; deeper snow holds running back until traffic packs it.
## The Town Square is Shallow and the open snow beyond it lies at an in-between
## depth; the square fades into it over ZONE_BLEND metres.
const SHALLOW_SNOW := 0.09
const OPEN_SNOW := 0.25
const MIN_SNOW_DEPTH := 0.03
const ZONE_BLEND := 1.5
const TOWN_SQUARE := Rect2(-20, -20, 40, 40)
const CONTACT_MARGIN := 0.0001

var obstacles: Array[Dictionary] = []
## The closed loop: out along LOOP and back, so its last corner leads to its first.
var loop_corners := PackedVector2Array()
## Distance along the closed loop to each corner, and the loop's whole length.
var loop_starts := PackedFloat32Array()
var loop_length := 0.0


func _init() -> void:
	for name in LOOP:
		loop_corners.append(LANDMARKS[name])
	for index in range(LOOP.size() - 2, 0, -1):
		loop_corners.append(LANDMARKS[LOOP[index]])
	for index in range(loop_corners.size()):
		loop_starts.append(loop_length)
		loop_length += loop_corners[index].distance_to(loop_corners[(index + 1) % loop_corners.size()])


## Ground height at a world XZ point. SnowSurface and snow.gdshader read the same level.
func ground_height(_point: Vector2) -> float:
	return GROUND_LEVEL


## Snow Depth at a world XZ point when the map starts: the authored zones,
## never less than MIN_SNOW_DEPTH. SnowSurface saves it into its Snow Depth picture.
func starting_snow_depth(point: Vector2) -> float:
	var depth := lerpf(OPEN_SNOW, SHALLOW_SNOW, _zone_weight(_outside(TOWN_SQUARE, point)))
	return maxf(MIN_SNOW_DEPTH, depth)


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

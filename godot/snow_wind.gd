extends RefCounted
## Wind reshapes the saved Snow Depth by authored relaxation, not a conserved fluid
## simulation. Each node of the Snow Depth picture relaxes toward a target shape:
## its authored start, plus a Snowdrift in the lee of boxes, less scour
## on their windward sides. Relaxation speed follows the wind clock, so drifts build
## and settle instead of oscillating, and wind 0 freezes them. There is no snowfall.
##
## Each node also keeps a fill clock: the wind-seconds of snow that have fallen
## into a Footprint there. It runs at the base rate in the open, faster while a
## drift is building and up to four times slower in shelter, so prints fill lazily
## from a stamped fill time without anyone rewriting the Footprint picture.
##
## Shelter, drift and scour come from the obstacles upwind and downwind of each node,
## marched cell by cell along the wind. They are recomputed when the wind turns.

const TownLayout = preload("res://town_layout.gd")
## The prevailing wind blows from this compass bearing (north-west), and turns in 45° steps.
const PREVAILING_FROM := 315.0
const TURN_STEP := 45.0
## Snow Depth in a full Snowdrift, and the floor that scour never passes.
const DRIFT_MAX := 1.2
const SCOUR_FLOOR := TownLayout.MIN_SNOW_DEPTH
## Wind-seconds for a node to close about 63% of the gap to its target.
const DRIFT_TIME := 60.0
## Obstacle heights above a node's ground are counted up to this.
const HEIGHT_CAP := 6.0
## A drift rises toward the obstacle's height (at most DRIFT_MAX) right behind it
## and tapers to nothing DRIFT_REACH obstacle heights downwind, at most DRIFT_REACH_MAX.
const DRIFT_REACH := 3.0
const DRIFT_REACH_MAX := 6.0
## Full shelter lasts SHELTER_NEAR obstacle heights downwind, fading out by SHELTER_FAR.
const SHELTER_NEAR := 2.0
const SHELTER_FAR := 5.0
const SHELTER_NEAR_MAX := 6.0
const SHELTER_FAR_MAX := 12.0
## Windward sides scour fully within half of this reach, one obstacle height
## kept between 2 and 4 m, and not at all beyond it.
const SCOUR_REACH := Vector2(2.0, 4.0)
## Scour overshoots the floor so the blurred face still reaches it.
const SCOUR_OVERSHOOT := 1.5
## The drift and scour field is smoothed across the wind over this many nodes.
const BLUR_RADIUS := 2
## Fill rates against the wind clock: 1 in the open, SHELTERED_FILL in full shelter,
## plus up to BUILDING_FILL while a drift builds, reached once the target stands
## BUILDING_GAP above the snow.
const SHELTERED_FILL := 0.25
const BUILDING_FILL := 3.0
const BUILDING_GAP := 0.15
## One relaxation sweep covers the picture in this many physics frames (4 Hz at 60 Hz).
const SWEEP_FRAMES := 15

var size := Vector2i.ZERO
var from_bearing := PREVAILING_FROM
## Working pictures; SnowSurface publishes copies at the end of each sweep.
var depth := PackedFloat32Array()
var fill := PackedFloat32Array()
var target := PackedFloat32Array()
var shelter := PackedFloat32Array()
var start := PackedFloat32Array()
var retarget_usec := 0
var _nodes_per_metre := 1.0
var _ground := PackedFloat32Array()
var _solid := PackedByteArray()
var _solid_top := PackedFloat32Array()
var _row_time := PackedFloat64Array()
var _next_row := 0
var _task := -1
var _shaped := {}
var _shaped_bearing := PREVAILING_FROM


## Read the static ground and obstacles once, save the authored start and shape
## the prevailing wind's target.
func configure(layout: Node3D, picture_size: Vector2i, nodes_per_metre: float) -> void:
	size = picture_size
	_nodes_per_metre = nodes_per_metre
	var count := size.x * size.y
	start.resize(count)
	_ground.resize(count)
	_solid_top.resize(count)
	fill.resize(count)
	_solid.resize(count)
	_solid.fill(0)
	_solid_top.fill(-INF)
	fill.fill(0.0)
	_row_time.resize(size.y)
	_row_time.fill(0.0)
	for row in range(size.y):
		for column in range(size.x):
			var index := row * size.x + column
			var point := _point(column, row)
			start[index] = layout.starting_snow_depth(point)
			_ground[index] = layout.ground_height(point)
	for obstacle in layout.obstacles:
		var low := Vector2i(((obstacle.center - obstacle.size * 0.5 + TownLayout.HALF_EXTENTS) * nodes_per_metre).ceil())
		var high := Vector2i(((obstacle.center + obstacle.size * 0.5 + TownLayout.HALF_EXTENTS) * nodes_per_metre).floor())
		for row in range(maxi(0, low.y), mini(size.y - 1, high.y) + 1):
			for column in range(maxi(0, low.x), mini(size.x - 1, high.x) + 1):
				var index := row * size.x + column
				_solid[index] = 1
				_solid_top[index] = maxf(_solid_top[index], obstacle.top)
	depth = start.duplicate()
	from_bearing = PREVAILING_FROM
	_adopt(from_bearing, _shape(from_bearing))


## The compass bearing whose target Snow Depth relaxes toward now. After a turn it
## lags from_bearing until the worker has shaped the new target.
func shaped_from() -> float:
	return _shaped_bearing


## Turn the wind by whole 45° steps; positive turns clockwise. The new target is
## shaped on a worker thread; relaxation keeps the old one until it is ready.
func turn(steps: int) -> void:
	from_bearing = fposmod(from_bearing + TURN_STEP * steps, 360.0)
	_start_retarget()


func _start_retarget() -> void:
	if _task < 0:
		var bearing := from_bearing
		_task = WorkerThreadPool.add_task(func() -> void: _shaped = _shape(bearing))


## Adopt a finished target, and shape the next one if the wind turned meanwhile.
func _finish_retarget() -> void:
	if _task < 0 or not WorkerThreadPool.is_task_completed(_task):
		return
	WorkerThreadPool.wait_for_task_completion(_task)
	_task = -1
	_adopt(_shaped.bearing, _shaped)
	_shaped = {}
	if _shaped_bearing != from_bearing:
		_start_retarget()


func _adopt(bearing: float, shaped: Dictionary) -> void:
	_shaped_bearing = bearing
	target = shaped.target
	shelter = shaped.shelter
	retarget_usec = shaped.usec


## The target and shelter for one wind direction. It reads only state that is
## fixed after configure(), so it can run on a worker thread.
func _shape(bearing: float) -> Dictionary:
	var began := Time.get_ticks_usec()
	# The wind travels toward the opposite bearing; north is −Z.
	var travel := deg_to_rad(bearing + 180.0)
	var along := Vector2i(roundi(sin(travel)), roundi(-cos(travel)))
	var fields := _drift_and_scour(along)
	var delta: PackedFloat32Array = fields.delta
	for axis in [Vector2i.RIGHT, Vector2i.DOWN, Vector2i.RIGHT, Vector2i.DOWN]:
		delta = _blur(delta, axis)
	var shaped_target := PackedFloat32Array()
	shaped_target.resize(start.size())
	for index in range(shaped_target.size()):
		var initial := start[index]
		shaped_target[index] = clampf(initial + delta[index], SCOUR_FLOOR, maxf(initial, DRIFT_MAX)) if _solid[index] == 0 else initial
	# A node inside an obstacle still shapes the snow surface within one node of its
	# face. It takes the mean of its open neighbours, so a drift rises right to the
	# wall instead of dipping into a trough where the old depth was kept.
	var faces := shaped_target.duplicate()
	for row in range(size.y):
		for column in range(size.x):
			var index := row * size.x + column
			if _solid[index] == 0:
				continue
			var total := 0.0
			var open := 0
			for neighbour_row in range(maxi(0, row - 1), mini(size.y - 1, row + 1) + 1):
				for neighbour_column in range(maxi(0, column - 1), mini(size.x - 1, column + 1) + 1):
					var neighbour := neighbour_row * size.x + neighbour_column
					if _solid[neighbour] == 0:
						total += shaped_target[neighbour]
						open += 1
			if open > 0:
				faces[index] = total / open
	shaped_target = faces
	return {"bearing": bearing, "target": shaped_target, "shelter": fields.shelter, "usec": Time.get_ticks_usec() - began}


## Relax the next rows toward their targets up to `wind_elapsed`. Returns true when
## a sweep of the whole picture has completed and is ready to publish.
func step(wind_elapsed: float) -> bool:
	_finish_retarget()
	for count in range(ceili(float(size.y) / SWEEP_FRAMES)):
		_relax_row(_next_row, wind_elapsed)
		_next_row += 1
		if _next_row >= size.y:
			_next_row = 0
			return true
	return false


## Wait for any target still being shaped, so no worker outlives the scene.
func finish() -> void:
	if _task >= 0:
		WorkerThreadPool.wait_for_task_completion(_task)
		_task = -1


## Restart the wind clock and every fill clock, as when the picture's encoding wraps.
func restart_clock() -> void:
	fill.fill(0.0)
	_row_time.fill(0.0)


func _relax_row(row: int, wind_elapsed: float) -> void:
	var elapsed := wind_elapsed - _row_time[row]
	_row_time[row] = wind_elapsed
	if elapsed <= 0.0:
		return
	var keep := exp(-elapsed / DRIFT_TIME)
	for index in range(row * size.x, (row + 1) * size.x):
		var gap := target[index] - depth[index]
		var building := clampf(gap / BUILDING_GAP, 0.0, 1.0)
		fill[index] += elapsed * (lerpf(1.0, SHELTERED_FILL, shelter[index]) + BUILDING_FILL * building)
		depth[index] = target[index] - gap * keep


## Drift (positive) and scour (negative) against the start, and shelter, for one
## wind travel direction in whole picture steps.
func _drift_and_scour(along: Vector2i) -> Dictionary:
	# Downwind order: every node's upwind neighbour is visited before it.
	var count := size.x * size.y
	var step_length := Vector2(along).length() / _nodes_per_metre
	var shelter := PackedFloat32Array()
	var lee := PackedFloat32Array()
	var lee_top := PackedFloat32Array()
	var supply := PackedFloat32Array()
	var delta := PackedFloat32Array()
	shelter.resize(count)
	lee.resize(count)
	lee_top.resize(count)
	supply.resize(count)
	delta.resize(count)
	var rows := range(size.y) if along.y >= 0 else range(size.y - 1, -1, -1)
	var columns := range(size.x) if along.x >= 0 else range(size.x - 1, -1, -1)
	for row in rows:
		for column in columns:
			var index: int = row * size.x + column
			var upwind_column: int = column - along.x
			var upwind_row: int = row - along.y
			var inside := upwind_column >= 0 and upwind_row >= 0 and upwind_column < size.x and upwind_row < size.y
			var upwind := upwind_row * size.x + upwind_column
			if _solid[index] == 1:
				# Inside a mass, carry its tallest top and the snow supply that
				# reached its upwind face: sheltered obstacles build no drifts.
				if inside and _solid[upwind] == 1:
					lee_top[index] = maxf(lee_top[upwind], _solid_top[index])
					supply[index] = supply[upwind]
				else:
					lee_top[index] = _solid_top[index]
					supply[index] = 1.0 - shelter[upwind] if inside else 1.0
				shelter[index] = 1.0
				continue
			if not inside:
				lee[index] = INF
				lee_top[index] = -INF
				supply[index] = 1.0
				shelter[index] = 0.0
				continue
			lee[index] = step_length if _solid[upwind] == 1 else lee[upwind] + step_length
			lee_top[index] = lee_top[upwind]
			supply[index] = supply[upwind]
			var height := clampf(lee_top[index] - _ground[index], 0.0, HEIGHT_CAP)
			var distance := lee[index]
			var near := minf(SHELTER_NEAR * height, SHELTER_NEAR_MAX)
			var far := minf(SHELTER_FAR * height, SHELTER_FAR_MAX)
			shelter[index] = 1.0 - smoothstep(near, far, distance) if height > 0.0 else 0.0
			var reach := minf(DRIFT_REACH * height, DRIFT_REACH_MAX)
			if height > 0.0 and distance < reach:
				var peak := minf(DRIFT_MAX, height)
				var drift := 1.0 - smoothstep(0.3 * reach, reach, distance)
				delta[index] = maxf(0.0, peak - start[index]) * drift * supply[index]
	# Upwind order: every node's downwind neighbour is visited before it. Exposed
	# windward sides scour; sheltered ones keep their snow.
	var windward := lee
	var windward_top := lee_top
	rows.reverse()
	columns.reverse()
	for row in rows:
		for column in columns:
			var index: int = row * size.x + column
			var downwind_column: int = column + along.x
			var downwind_row: int = row + along.y
			if _solid[index] == 1 or downwind_column < 0 or downwind_row < 0 or downwind_column >= size.x or downwind_row >= size.y:
				windward[index] = INF
				windward_top[index] = -INF
				continue
			var downwind := downwind_row * size.x + downwind_column
			if _solid[downwind] == 1:
				windward[index] = 0.0
				windward_top[index] = _solid_top[downwind]
			else:
				windward[index] = windward[downwind] + step_length
				windward_top[index] = windward_top[downwind]
			var height := clampf(windward_top[index] - _ground[index], 0.0, HEIGHT_CAP)
			if height <= 0.0:
				continue
			var reach := clampf(height, SCOUR_REACH.x, SCOUR_REACH.y)
			var scour := 1.0 - smoothstep(0.5 * reach, reach, windward[index])
			delta[index] -= (start[index] - SCOUR_FLOOR) * SCOUR_OVERSHOOT * scour * (1.0 - shelter[index])
	return {"delta": delta, "shelter": shelter}


## One box-blur pass along an axis, over open nodes only.
func _blur(source: PackedFloat32Array, axis: Vector2i) -> PackedFloat32Array:
	var values := source.duplicate()
	for row in range(size.y):
		for column in range(size.x):
			var index := row * size.x + column
			if _solid[index] == 1:
				continue
			var total := 0.0
			var weight := 0
			for offset in range(-BLUR_RADIUS, BLUR_RADIUS + 1):
				var sample_column := column + axis.x * offset
				var sample_row := row + axis.y * offset
				if sample_column < 0 or sample_row < 0 or sample_column >= size.x or sample_row >= size.y:
					continue
				var sample := sample_row * size.x + sample_column
				if _solid[sample] == 0:
					total += source[sample]
					weight += 1
			values[index] = total / weight
	return values


func _point(column: int, row: int) -> Vector2:
	return Vector2(column, row) / _nodes_per_metre - TownLayout.HALF_EXTENTS

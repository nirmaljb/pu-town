extends Node3D
class_name SnowSurface

## Flat ground, a world-fixed snow field, and a detail region shaped for the view.
## The field spans the town layout's map rectangle; its surface is the layout's
## ground level plus the saved Snow Depth picture, less Footprint compaction.
## The CPU samples the same displaced triangles as snow.gdshader. No stale static
## collider stands in for snow contact. Footsteps press a Footprint picture held
## only in the tiles where steps have landed, and resend only the tiles they touched.
## Wind reshapes Snow Depth and advances each place's fill clock a few times a
## second; both pictures are published to the CPU and the shader together.
const TownLayout = preload("res://town_layout.gd")
const SnowWind = preload("res://snow_wind.gd")
const FootprintTiles = preload("res://footprint_tiles.gd")
const HALF_EXTENTS := TownLayout.HALF_EXTENTS
## The detail region shapes bootprints in height where the oblique play view shows
## them sharp; the coarse 0.8 m surface keeps the whole town live beyond it. It is a
## rectangle that follows the camera focus and blends into the coarse surface over a
## border on every side. Its near part, from the bottom of the view to beyond where
## the controlled figure can stand, has a 5 cm grid. Its far part, up the view, has a
## 10 cm grid: there the snow lies further from the camera, and a 5 cm grid all the
## way up cost more frame time than the 24 fps walking budget allows. The Footprint
## picture still shades each sole's outline there at its own 31.25 mm texels. With
## the view's 40° pitch, 40° lens and 16:9 shape, and allowing the border and a
## coarse cell's snap, it holds all the snow the view shows within 20 m of the
## figure without lean, at every play distance:
## - it is 44 m wide: at the widest, that snow reaches 19.9 m to either side just
##   north of the focus;
## - it reaches 14.4 m south of the focus, past the bottom of the widest view (11.7 m);
## - and 21.6 m north of it, 20 m ahead of the figure, which stands at most 1 m south
##   of the focus without lean;
## - its seam, where the far part meets the near part, lies 4 m north of the focus.
##   The figure stands north of the focus only while the camera leans toward a
##   cursor nearer the bottom of the view, and the lean settles at a third of the
##   cursor's offset from the figure in the unleaned view, so at the widest the
##   figure stands at most 2.6 m north of the focus.
const DETAIL_SIZE := Vector2(44.0, 36.0)
const DETAIL_HALF := DETAIL_SIZE * 0.5
const DETAIL_NORTH := 21.6
## The far part runs this far south from the region's north edge to the seam.
const FAR_DEPTH := 17.6
## The seam, north–south from the region's middle.
const SEAM := FAR_DEPTH - DETAIL_HALF.y
const COARSE_STEP := 0.8
const DETAIL_STEP := 0.05
const FAR_STEP := 0.1
const EDGE_BLEND := 1.6
## Snow is drawn in chunks, so the camera skips those it cannot see: the coarse
## surface in squares of up to COARSE_CHUNK cells, the detail region in as many
## columns as DETAIL_COLUMNS, each cut into strips of up to NEAR_STRIP_ROWS or
## FAR_STRIP_ROWS rows. Neighbouring chunks place their shared edge's vertices at the
## same points, so they meet exactly.
const COARSE_CHUNK := 40
const DETAIL_COLUMNS := 8
const NEAR_STRIP_ROWS := 92
const FAR_STRIP_ROWS := 88
## The snowfield runs on this far beyond the map's edge, on the coarse grid, so the
## edge that stops a figure shows no end to the snow; the whiteout swallows the
## apron's own far edge. No figure reaches it, and nothing is stamped there.
const APRON := 40.0
# 31.25 mm per texel; the Footprint picture covers the whole map rectangle at this
# density, its texels counted from the map's west and north edges. It is held only
# in tiles where steps have landed (FootprintTiles); one footstep touches at most
# MAX_TILES_PER_STEP of them.
const TEXELS_PER_METRE := 32.0
const IMAGE_SIZE := Vector2i(HALF_EXTENTS * (2.0 * TEXELS_PER_METRE))
const MAX_TILES_PER_STEP := 4
## A print's look depends on the fill clocks within FILL_REACH of its footfall:
## those its texels' heights read, and those its shading reads round them, along
## a 15 cm march toward the sun and a texel either side.
const FILL_REACH := 0.4
## Fill-clock seconds for a Footprint to fill: 120 wind-seconds in the open.
const PRINT_LIFETIME := 120.0
## The saved Snow Depth and fill-clock pictures hold values at nodes 0.4 m apart,
## counted from the map's west and north edges and read bilinearly.
const DEPTH_NODES_PER_METRE := 2.5
const DEPTH_SIZE := Vector2i(HALF_EXTENTS * (2.0 * DEPTH_NODES_PER_METRE)) + Vector2i.ONE
const SNOW_SHADER := preload("res://snow.gdshader")
## A tenth-second fill timestamp occupies GBA (24 bits). Fill clocks run at most
## 1 + BUILDING_FILL times the wind clock, so restart both before encoding could wrap.
const CLOCK_LIMIT := 1677700.0 / (1.0 + SnowWind.BUILDING_FILL)

var region_center := Vector2.ZERO
## The detail region's seam, north–south in the world.
var region_seam := SEAM
var wind_strength := 1.0
var wind_elapsed := 0.0
var wind := SnowWind.new()
## Milliseconds the wind spent in the latest physics frame, including publication.
var wind_update_ms := 0.0
## Running totals of that work and of the physics frames it ran in, so a frame trace
## can charge each rendered frame with the wind updates since the previous one.
var wind_total_ms := 0.0
var wind_updates := 0
var footprint_count := 0
## The Footprint picture's tiles and their GPU copy.
var footprints := FootprintTiles.new(IMAGE_SIZE)
## Footprint picture bytes sent to the GPU in the latest rendered frame and in total,
## and how many footsteps those uploads carried; each carries at most MAX_TILES_PER_STEP tiles.
var upload_bytes := 0
var upload_total_bytes := 0
var uploaded_steps := 0
var _layout: Node3D
var _pending_steps := 0
## The detail region's strips hang from this node, which follows the region.
var _detail := Node3D.new()
var _surfaces: Array[MeshInstance3D] = []
## Every coarse chunk shares one material and every detail strip another.
var _coarse_material: ShaderMaterial
var _detail_material: ShaderMaterial
var _materials: Array[ShaderMaterial] = []
var _depth := PackedFloat32Array()
var _fill := PackedFloat32Array()
var _depth_image: Image
var _depth_texture: ImageTexture
var _fill_image: Image
var _fill_texture: ImageTexture


func _ready() -> void:
	_coarse_material = _make_material(false)
	_detail_material = _make_material(true)
	_make_coarse_surface(Rect2(-HALF_EXTENTS, HALF_EXTENTS * 2.0))
	# The apron: four strips round the map, north and south spanning its corners.
	var outer := HALF_EXTENTS + Vector2.ONE * APRON
	for strip in [Rect2(-outer.x, -outer.y, outer.x * 2.0, APRON), Rect2(-outer.x, HALF_EXTENTS.y, outer.x * 2.0, APRON),
			Rect2(-outer.x, -HALF_EXTENTS.y, APRON, HALF_EXTENTS.y * 2.0), Rect2(HALF_EXTENTS.x, -HALF_EXTENTS.y, APRON, HALF_EXTENTS.y * 2.0)]:
		_make_coarse_surface(strip)
	_detail.name = "DetailedSnow"
	add_child(_detail)
	_make_detail_surface()
	_update_uniforms()


func _process(_delta: float) -> void:
	# Coalesce both figures' stamps before drawing and resend only the tiles they
	# touched. Wind ages encoded timestamps through the fill clock and never
	# rewrites or uploads the picture by itself.
	upload_bytes = footprints.upload()
	upload_total_bytes += upload_bytes
	uploaded_steps += _pending_steps
	_pending_steps = 0


func _exit_tree() -> void:
	wind.finish()


func configure_ground(town: Node3D) -> void:
	# The layout owns the flat ground level. The shader reads the same level.
	_layout = town
	# A fresh launch saves the layout's authored zones; nothing is loaded from disk.
	wind.configure(town, DEPTH_SIZE, DEPTH_NODES_PER_METRE)
	_depth = wind.depth.duplicate()
	_fill = wind.fill.duplicate()
	_depth_image = Image.create_from_data(DEPTH_SIZE.x, DEPTH_SIZE.y, false, Image.FORMAT_RF, _depth.to_byte_array())
	_depth_texture = ImageTexture.create_from_image(_depth_image)
	_fill_image = Image.create_from_data(DEPTH_SIZE.x, DEPTH_SIZE.y, false, Image.FORMAT_RF, _fill.to_byte_array())
	_fill_texture = ImageTexture.create_from_image(_fill_image)
	for material in _materials:
		material.set_shader_parameter("ground_level", TownLayout.GROUND_LEVEL)
		material.set_shader_parameter("depth_image", _depth_texture)
		material.set_shader_parameter("fill_image", _fill_texture)
		material.set_shader_parameter("depth_nodes_per_metre", DEPTH_NODES_PER_METRE)
	for surface in _surfaces:
		var bounds: AABB = surface.custom_aabb
		surface.custom_aabb = AABB(Vector3(bounds.position.x, TownLayout.GROUND_LEVEL - 0.1, bounds.position.z),
			Vector3(bounds.size.x, 1.2, bounds.size.z))


## Shade Footprints' own shadows toward this unit direction to the sun. Shading only.
func set_sun_direction(toward_sun: Vector3) -> void:
	for material in _materials:
		material.set_shader_parameter("sun_direction", toward_sun.normalized())


## The wind blows from this compass bearing, clockwise from north.
func wind_from() -> float:
	return wind.from_bearing


## The bearing whose drifts, scour and shelter the snow follows now. It catches up
## with wind_from() once a turn has been shaped.
func wind_shaped_from() -> float:
	return wind.shaped_from()


## Turn the wind by whole 45° steps; positive turns clockwise.
func turn_wind(steps: int) -> void:
	wind.turn(steps)


func advance(delta: float) -> void:
	var began := Time.get_ticks_usec()
	wind_elapsed += delta * maxf(0.0, wind_strength)
	# This preview has no saved weather: restart its clocks and Footprints before
	# a timestamp could wrap, after about four days of default wind.
	if wind_elapsed >= CLOCK_LIMIT:
		wind_elapsed = 0.0
		wind.restart_clock()
		footprints.clear()
		_publish_snow()
	# Tiles are checked against fill clocks published in an earlier physics frame,
	# whose prints the record has already observed filled.
	if not _fill.is_empty():
		footprints.free_filled(_fill)
	if wind.step(wind_elapsed):
		_publish_snow()
		footprints.fill_clocks_moved(wind_elapsed)
	wind_update_ms = float(Time.get_ticks_usec() - began) / 1000.0
	wind_total_ms += wind_update_ms
	wind_updates += 1


## Place the detail region at the camera's focus: centred east–west on it, its north
## edge DETAIL_NORTH beyond it. Its corner snaps to coarse vertices, counted from the
## map's west and north edges, so both parts' grids stay world-aligned, and it stays
## over the snowfield and its apron. Moving it never moves or clears the Footprint picture.
func place_detail(focus: Vector2) -> void:
	var outer := HALF_EXTENTS + Vector2.ONE * APRON
	var corner := (focus - Vector2(DETAIL_HALF.x, DETAIL_NORTH) + HALF_EXTENTS).snapped(Vector2.ONE * COARSE_STEP) - HALF_EXTENTS
	corner = corner.clamp(-outer, outer - DETAIL_SIZE)
	region_center = corner + DETAIL_HALF
	region_seam = region_center.y + SEAM
	_detail.position = Vector3(region_center.x, 0, region_center.y)
	_update_uniforms()


func in_detail_region(point: Vector2) -> bool:
	var local := (point - region_center).abs()
	return local.x < DETAIL_HALF.x and local.y < DETAIL_HALF.y


## Visible snow height: ground plus compacted Snow Depth, on the drawn triangles.
func sample_height(point: Vector2) -> float:
	if in_detail_region(point):
		return _detail_height(point)
	return _coarse_height(point)


func sample_ground(point: Vector2) -> float:
	return _layout.ground_height(point) if _layout else 0.0


## Snow height before any compaction: ground plus loose Snow Depth.
func sample_uncompressed_height(point: Vector2) -> float:
	return sample_ground(point) + sample_saved_depth(point)


## Loose Snow Depth from the saved picture, before Footprint compaction.
## SnowSurface and snow.gdshader interpolate the same nodes in the same way.
func sample_saved_depth(point: Vector2) -> float:
	return _picture_value(_depth, point)


## The fill clock: fill-seconds of wind-blown snow that have fallen at a point.
func sample_fill(point: Vector2) -> float:
	return _picture_value(_fill, point)


func _picture_value(picture: PackedFloat32Array, point: Vector2) -> float:
	if picture.is_empty():
		return 0.0
	var node := (point + HALF_EXTENTS) * DEPTH_NODES_PER_METRE
	var cell := Vector2i(clampi(floori(node.x), 0, DEPTH_SIZE.x - 2), clampi(floori(node.y), 0, DEPTH_SIZE.y - 2))
	var blend := (node - Vector2(cell)).clamp(Vector2.ZERO, Vector2.ONE)
	var index := cell.y * DEPTH_SIZE.x + cell.x
	return lerpf(
		lerpf(picture[index], picture[index + 1], blend.x),
		lerpf(picture[index + DEPTH_SIZE.x], picture[index + DEPTH_SIZE.x + 1], blend.x),
		blend.y
	)


func _publish_snow() -> void:
	# The CPU copies and the shader's pictures change in the same physics frame.
	_depth = wind.depth.duplicate()
	_fill = wind.fill.duplicate()
	_depth_image.set_data(DEPTH_SIZE.x, DEPTH_SIZE.y, false, Image.FORMAT_RF, _depth.to_byte_array())
	_depth_texture.update(_depth_image)
	_fill_image.set_data(DEPTH_SIZE.x, DEPTH_SIZE.y, false, Image.FORMAT_RF, _fill.to_byte_array())
	_fill_texture.update(_fill_image)


## Whether an allocated tile holds any of the four texels compaction at this point
## is read from.
func in_footprint_tile(point: Vector2) -> bool:
	var texel := (point + HALF_EXTENTS) * TEXELS_PER_METRE - Vector2.ONE * 0.5
	var cell := Vector2i(floori(texel.x), floori(texel.y))
	for pixel in [cell, cell + Vector2i.RIGHT, cell + Vector2i.DOWN, cell + Vector2i.ONE]:
		if Rect2i(Vector2i.ZERO, IMAGE_SIZE).has_point(pixel) and footprints.holds(pixel):
			return true
	return false


func sample_compaction(point: Vector2) -> float:
	if footprints.tiles == 0:
		return 0.0
	var texel := (point + HALF_EXTENTS) * TEXELS_PER_METRE - Vector2.ONE * 0.5
	var cell := Vector2i(floori(texel.x), floori(texel.y))
	var blend := texel - Vector2(cell)
	return lerpf(
		lerpf(_pixel_compaction(cell), _pixel_compaction(cell + Vector2i.RIGHT), blend.x),
		lerpf(_pixel_compaction(cell + Vector2i.DOWN), _pixel_compaction(cell + Vector2i.ONE), blend.x),
		blend.y
	)


func sample_loose_depth(point: Vector2) -> float:
	# Distinct boot lanes flank the body centre. An isotropic neighbourhood sees
	# either lane without depending on which way the controlled figure faces.
	# The broad kernel also prevents a run/walk toggle between individual prints.
	var packed := sample_compaction(point)
	# Two fixed rings cover the gap between alternating 0.48–0.68 m strides.
	# 25 bilinear samples is a fixed budget, independent of trail length/count.
	for ring in range(1, 3):
		var samples := ring * 8
		for index in range(samples):
			var angle := float(index) * TAU / float(samples)
			var offset := Vector2(cos(angle), sin(angle)) * (float(ring) * 0.16)
			packed = maxf(packed, sample_compaction(point + offset))
	return sample_saved_depth(point) * (1.0 - 0.94 * packed)


func stamp_foot(point: Vector2, heading: float, strength: float) -> void:
	if absf(point.x) > HALF_EXTENTS.x or absf(point.y) > HALF_EXTENTS.y:
		return
	var forward := Vector2(-sin(heading), -cos(heading))
	var right := Vector2(cos(heading), -sin(heading))
	var extent := 0.18
	var minimum := Vector2i(((point - Vector2.ONE * extent + HALF_EXTENTS) * TEXELS_PER_METRE).floor())
	var maximum := Vector2i(((point + Vector2.ONE * extent + HALF_EXTENTS) * TEXELS_PER_METRE).ceil())
	# The tiles this footstep presses.
	var pressed := {}
	for row in range(maxi(0, minimum.y), mini(IMAGE_SIZE.y - 1, maximum.y) + 1):
		for column in range(maxi(0, minimum.x), mini(IMAGE_SIZE.x - 1, maximum.x) + 1):
			var pixel := Vector2i(column, row)
			var world := (Vector2(pixel) + Vector2.ONE * 0.5) / TEXELS_PER_METRE - HALF_EXTENTS
			var offset := world - point
			# Rounded 0.28 x 0.14 m sole, aligned with this particular footfall.
			var sole := Vector2(offset.dot(right) / 0.07, offset.dot(forward) / 0.14)
			var edge := sole.length()
			if edge >= 1.0:
				continue
			var weight := 1.0 - smoothstep(0.65, 1.0, edge)
			var previous := _pixel_compaction(pixel)
			# Each texel keeps the fill clock at its centre when it was last pressed.
			var timestamp := int(floor(sample_fill(world) * 10.0))
			pressed[footprints.press(pixel, Color(clampf(previous + (1.0 - previous) * strength * weight, 0.0, 1.0),
				float((timestamp >> 16) & 255) / 255.0, float((timestamp >> 8) & 255) / 255.0, float(timestamp & 255) / 255.0))] = true
	_await_fill(point, pressed)
	footprint_count += 1
	_pending_steps += 1


## A footstep's print in each tile it pressed has filled once the fill clock at every
## Snow Depth node within FILL_REACH of the footfall has run PRINT_LIFETIME past the
## latest of them now. Each texel was stamped with at most the fill clock its own
## nodes give now, every fill clock its heights or shading read is one of those
## nodes' or between them, and every node's clock only grows: by then neither the
## print's heights nor its shading show anything.
func _await_fill(point: Vector2, pressed: Dictionary) -> void:
	var first := Vector2i(((point - Vector2.ONE * FILL_REACH + HALF_EXTENTS) * DEPTH_NODES_PER_METRE).floor())
	var last := Vector2i(((point + Vector2.ONE * FILL_REACH + HALF_EXTENTS) * DEPTH_NODES_PER_METRE).floor()) + Vector2i.ONE
	first = first.clamp(Vector2i.ZERO, DEPTH_SIZE - Vector2i.ONE)
	last = last.clamp(Vector2i.ZERO, DEPTH_SIZE - Vector2i.ONE)
	var nodes := PackedInt32Array()
	var latest := 0.0
	for row in range(first.y, last.y + 1):
		for column in range(first.x, last.x + 1):
			var node := row * DEPTH_SIZE.x + column
			nodes.append(node)
			latest = maxf(latest, _fill[node] if not _fill.is_empty() else 0.0)
	footprints.await_fill(pressed, nodes, latest + PRINT_LIFETIME)


func _pixel_compaction(pixel: Vector2i) -> float:
	if pixel.x < 0 or pixel.y < 0 or pixel.x >= IMAGE_SIZE.x or pixel.y >= IMAGE_SIZE.y:
		return 0.0
	var value := footprints.texel(pixel)
	if value.r <= 0.0:
		return 0.0
	# Snow has filled the print by as much as the fill clock at the texel's centre
	# has run since it was pressed: quickly where a drift builds, slowly in shelter.
	var timestamp := roundi(value.g * 255.0) * 65536 + roundi(value.b * 255.0) * 256 + roundi(value.a * 255.0)
	var centre := (Vector2(pixel) + Vector2.ONE * 0.5) / TEXELS_PER_METRE - HALF_EXTENTS
	var age := maxf(0.0, sample_fill(centre) - float(timestamp) * 0.1)
	return value.r * maxf(0.0, 1.0 - age / PRINT_LIFETIME)


func _field_height(point: Vector2) -> float:
	# Even completely packed snow retains a thin layer over the ground.
	return sample_ground(point) + maxf(0.025, sample_saved_depth(point) * (1.0 - 0.86 * sample_compaction(point)))


## Full detail inside the region's border, falling to the coarse surface across it
## on every side; beyond the map's edge the coarse surface is the apron's.
func _region_weight(point: Vector2) -> float:
	var inset := (DETAIL_HALF - (point - region_center).abs())
	return smoothstep(0.0, EDGE_BLEND, minf(inset.x, inset.y))


func _detail_vertex_height(point: Vector2) -> float:
	var weight := _region_weight(point)
	if weight >= 0.99999:
		return _field_height(point)
	return lerpf(_coarse_height(point), _field_height(point), weight)


func _coarse_height(point: Vector2) -> float:
	return _triangle_height(point, -HALF_EXTENTS, COARSE_STEP, false)


## The detail region's drawn triangles: the near part's 5 cm cells south of the seam,
## the far part's 10 cm cells north of it, and along it the far part's last row, each
## of whose cells meets two near cells and is split into three triangles, as in
## _make_detail_surface, so the parts share every vertex along the seam.
func _detail_height(point: Vector2) -> float:
	var west := region_center.x - DETAIL_HALF.x
	if point.y >= region_seam:
		return _triangle_height(point, Vector2(west, region_seam), DETAIL_STEP, true)
	var row_north := region_seam - FAR_STEP
	if point.y < row_north:
		return _triangle_height(point, Vector2(west, region_center.y - DETAIL_HALF.y), FAR_STEP, true)
	var across := (point.x - west) / FAR_STEP
	var column := floorf(across)
	# Within the joining cell: east and south, from 0 at its north-west corner to 1.
	var u := across - column
	var v := (point.y - row_north) / FAR_STEP
	var north_west := Vector2(west + column * FAR_STEP, row_north)
	var middle := Vector2(north_west.x + DETAIL_STEP, region_seam)
	if u <= 0.5 * v:
		return (1.0 - v) * _detail_vertex_height(north_west) + 2.0 * u * _detail_vertex_height(middle) \
			+ (v - 2.0 * u) * _detail_vertex_height(Vector2(north_west.x, region_seam))
	var north_east := north_west + Vector2(FAR_STEP, 0.0)
	if u >= 1.0 - 0.5 * v:
		return (1.0 - v) * _detail_vertex_height(north_east) + 2.0 * (1.0 - u) * _detail_vertex_height(middle) \
			+ (v + 2.0 * u - 2.0) * _detail_vertex_height(Vector2(north_east.x, region_seam))
	return (1.0 - u - 0.5 * v) * _detail_vertex_height(north_west) + (u - 0.5 * v) * _detail_vertex_height(north_east) \
		+ v * _detail_vertex_height(middle)


## A height on one of the drawn grids, whose cells of `step` are counted from `origin`.
func _triangle_height(point: Vector2, origin: Vector2, step: float, detail: bool) -> float:
	var grid := (point - origin) / step
	var cell := grid.floor()
	var blend := grid - cell
	var corner := origin + cell * step
	var first := _detail_vertex_height(corner) if detail else _field_height(corner)
	var right := _detail_vertex_height(corner + Vector2(step, 0)) if detail else _field_height(corner + Vector2(step, 0))
	var bottom := _detail_vertex_height(corner + Vector2(0, step)) if detail else _field_height(corner + Vector2(0, step))
	if blend.x + blend.y <= 1.0:
		return first + blend.x * (right - first) + blend.y * (bottom - first)
	var diagonal := _detail_vertex_height(corner + Vector2.ONE * step) if detail else _field_height(corner + Vector2.ONE * step)
	return diagonal + (1.0 - blend.x) * (bottom - diagonal) + (1.0 - blend.y) * (right - diagonal)


## Cover `area` with coarse chunks. Each chunk's quads own their vertices so the
## vertex shader can collapse complete covered cells under the detail region. A
## fragment discard across MSAA samples leaves a dotted gap.
func _make_coarse_surface(area: Rect2) -> void:
	var cells := Vector2i((area.size / COARSE_STEP).round())
	for first_row in range(0, cells.y, COARSE_CHUNK):
		for first_column in range(0, cells.x, COARSE_CHUNK):
			var chunk := Vector2i(mini(COARSE_CHUNK, cells.x - first_column), mini(COARSE_CHUNK, cells.y - first_row))
			var size := Vector2(chunk) * COARSE_STEP
			var centre := area.position + Vector2(first_column, first_row) * COARSE_STEP + size * 0.5
			var vertices := PackedVector3Array()
			var cell_centres := PackedVector2Array()
			var indices := PackedInt32Array()
			vertices.resize(chunk.x * chunk.y * 4)
			cell_centres.resize(vertices.size())
			indices.resize(chunk.x * chunk.y * 6)
			for row in range(chunk.y):
				for column in range(chunk.x):
					var quad := (row * chunk.x + column) * 4
					var base := Vector2(float(column) * COARSE_STEP - size.x * 0.5, float(row) * COARSE_STEP - size.y * 0.5)
					var cell_centre := centre + base + Vector2.ONE * COARSE_STEP * 0.5
					vertices[quad] = Vector3(base.x, 0, base.y)
					vertices[quad + 1] = Vector3(base.x + COARSE_STEP, 0, base.y)
					vertices[quad + 2] = Vector3(base.x, 0, base.y + COARSE_STEP)
					vertices[quad + 3] = Vector3(base.x + COARSE_STEP, 0, base.y + COARSE_STEP)
					for corner in range(4):
						cell_centres[quad + corner] = cell_centre
					var start := (row * chunk.x + column) * 6
					indices[start] = quad
					indices[start + 1] = quad + 1
					indices[start + 2] = quad + 2
					indices[start + 3] = quad + 1
					indices[start + 4] = quad + 3
					indices[start + 5] = quad + 2
			_add_surface(self, "CoarseChunk", vertices, indices, cell_centres, _coarse_material,
				Vector3(centre.x, 0, centre.y), _flat_bounds(-size.x * 0.5, -size.y * 0.5, size.x, size.y))


## The detail region's chunks, placed from its middle: the far part's 10 cm grid
## from its north edge, then the near part's 5 cm grid from the seam to its south
## edge. Each cell of the far part's last row meets two near cells; it is split into
## three triangles that use the near vertex between them, so the parts share every
## vertex along the seam and leave no crack. _detail_height samples the same triangles.
func _make_detail_surface() -> void:
	var near := Vector2i(roundi(DETAIL_SIZE.x / DETAIL_STEP), roundi((DETAIL_SIZE.y - FAR_DEPTH) / DETAIL_STEP))
	var far := Vector2i(roundi(DETAIL_SIZE.x / FAR_STEP), roundi(FAR_DEPTH / FAR_STEP))
	assert(near.x == far.x * 2 and far.x % DETAIL_COLUMNS == 0, "Each far cell must meet two near cells, in whole columns")
	# Far cells across each column; it holds twice as many near cells.
	var cells := far.x / DETAIL_COLUMNS
	for column in range(DETAIL_COLUMNS):
		var west := float(column * cells) * FAR_STEP - DETAIL_HALF.x
		var width := float(cells) * FAR_STEP
		for first in range(0, far.y, FAR_STRIP_ROWS):
			var rows := mini(FAR_STRIP_ROWS, far.y - first)
			var reaches_seam := first + rows == far.y
			# The strip along the seam stops its own vertex rows a far row short of it
			# and takes the near part's first row of vertices instead.
			var north := float(first) * FAR_STEP - DETAIL_HALF.y
			var vertices := _grid_vertices(west, north, FAR_STEP, cells + 1, rows if reaches_seam else rows + 1)
			var indices := _grid_indices(Vector2i(cells, rows - 1 if reaches_seam else rows), cells + 1)
			if reaches_seam:
				var last_row := (rows - 1) * (cells + 1)
				var seam_row := vertices.size()
				vertices.append_array(_grid_vertices(west, SEAM, DETAIL_STEP, cells * 2 + 1, 1))
				for cell in range(cells):
					var north_west := last_row + cell
					var south_west := seam_row + cell * 2
					for corner in [north_west, north_west + 1, south_west + 1, north_west, south_west + 1, south_west,
							north_west + 1, south_west + 2, south_west + 1]:
						indices.append(corner)
			_add_surface(_detail, "FarChunk", vertices, indices, PackedVector2Array(), _detail_material, Vector3.ZERO,
				_flat_bounds(west, north, width, float(rows) * FAR_STEP))
		for first in range(0, near.y, NEAR_STRIP_ROWS):
			var rows := mini(NEAR_STRIP_ROWS, near.y - first)
			var north := SEAM + float(first) * DETAIL_STEP
			_add_surface(_detail, "NearChunk", _grid_vertices(west, north, DETAIL_STEP, cells * 2 + 1, rows + 1),
				_grid_indices(Vector2i(cells * 2, rows), cells * 2 + 1), PackedVector2Array(), _detail_material,
				Vector3.ZERO, _flat_bounds(west, north, width, float(rows) * DETAIL_STEP))


## `rows` rows of `width` vertices `step` apart, the first at `west` and `north`,
## relative to the detail region's middle.
func _grid_vertices(west: float, north: float, step: float, width: int, rows: int) -> PackedVector3Array:
	var vertices := PackedVector3Array()
	vertices.resize(width * rows)
	for row in range(rows):
		for column in range(width):
			vertices[row * width + column] = Vector3(west + float(column) * step, 0, north + float(row) * step)
	return vertices


## Two triangles for each of `cells` of a grid whose rows hold `width` vertices,
## each cell split along its north-east to south-west diagonal, as _triangle_height
## samples it.
func _grid_indices(cells: Vector2i, width: int) -> PackedInt32Array:
	var indices := PackedInt32Array()
	indices.resize(cells.x * cells.y * 6)
	var next := 0
	for row in range(cells.y):
		for column in range(cells.x):
			var top_left := row * width + column
			indices[next] = top_left
			indices[next + 1] = top_left + 1
			indices[next + 2] = top_left + width
			indices[next + 3] = top_left + 1
			indices[next + 4] = top_left + width + 1
			indices[next + 5] = top_left + width
			next += 6
	return indices


## Bounds of a chunk of snow from its north-west corner, deep enough for any snow
## over the ground; configure_ground sets their height once it knows the ground level.
func _flat_bounds(west: float, north: float, width: float, depth: float) -> AABB:
	return AABB(Vector3(west, -0.1, north), Vector3(width, 1.2, depth))


func _make_material(detail: bool) -> ShaderMaterial:
	var material := ShaderMaterial.new()
	material.shader = SNOW_SHADER
	material.set_shader_parameter("detail_mesh", detail)
	material.set_shader_parameter("map_half_extents", HALF_EXTENTS)
	material.set_shader_parameter("footprint_tiles", footprints.texture)
	material.set_shader_parameter("footprint_layers", footprints.layer_texture)
	material.set_shader_parameter("footprint_texels_per_metre", TEXELS_PER_METRE)
	material.set_shader_parameter("detail_half_extents", DETAIL_HALF)
	_materials.append(material)
	return material


## One chunk of snow under `parent`. Coarse chunks carry each quad's world centre
## in `cell_centres`; detail strips carry none.
func _add_surface(parent: Node3D, name: String, vertices: PackedVector3Array, indices: PackedInt32Array,
		cell_centres: PackedVector2Array, material: ShaderMaterial, at: Vector3, bounds: AABB) -> void:
	var normals := PackedVector3Array()
	normals.resize(vertices.size())
	normals.fill(Vector3.UP)
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_INDEX] = indices
	if not cell_centres.is_empty():
		arrays[Mesh.ARRAY_TEX_UV] = cell_centres
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var visible_surface := MeshInstance3D.new()
	visible_surface.name = name
	visible_surface.mesh = mesh
	visible_surface.material_override = material
	visible_surface.position = at
	visible_surface.custom_aabb = bounds
	# Snow receives shadows but casts none into SkyKey's shadow map: with the light
	# 40° up, its smooth surface cannot shade itself there, and drawing it into the
	# map ran its costly vertex heights a second time.
	visible_surface.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	parent.add_child(visible_surface)
	_surfaces.append(visible_surface)


func _update_uniforms() -> void:
	for material in _materials:
		material.set_shader_parameter("region_center", region_center)

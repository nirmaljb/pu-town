extends Node3D
class_name SnowSurface

## Static ground levels, a world-fixed snow field, and a camera-sized detail region.
## The field spans the town layout's map rectangle; its surface is the layout's
## ground-height picture plus the saved Snow Depth picture, less Footprint compaction.
## The CPU samples the same displaced triangles as snow.gdshader. No stale static
## collider stands in for snow contact. Footsteps mutate one bounded, tiled picture
## and resend only the tiles they touched.
## Wind reshapes Snow Depth and advances each place's fill clock a few times a
## second; both pictures are published to the CPU and the shader together.
const TownLayout = preload("res://town_layout.gd")
const SnowWind = preload("res://snow_wind.gd")
const HALF_EXTENTS := TownLayout.HALF_EXTENTS
## The detail region covers what the play camera shows at a 5 cm grid; the coarse
## 0.8 m surface keeps the whole town live beyond it. It blends into the coarse
## surface over a border on every side that does not lie on the map edge.
const DETAIL_SIZE := Vector2(24.0, 16.0)
const DETAIL_HALF := DETAIL_SIZE * 0.5
const COARSE_STEP := 0.8
const DETAIL_STEP := 0.05
const EDGE_BLEND := 1.6
# 31.25 mm per texel; the image covers the whole map rectangle at this density.
const TEXELS_PER_METRE := 32.0
const IMAGE_SIZE := Vector2i(HALF_EXTENTS * (2.0 * TEXELS_PER_METRE))
## The Footprint picture is held in 200 × 128 texel tiles (6.25 × 4 m), 16 × 14 of
## them, each one layer of the GPU copy. A sole spans at most 0.36 m, less than a
## tile either way, so one footstep touches at most 2 × 2 tiles.
const TILE_SIZE := Vector2i(200, 128)
const TILE_GRID := IMAGE_SIZE / TILE_SIZE
const TILE_BYTES := TILE_SIZE.x * TILE_SIZE.y * 4
const MAX_TILES_PER_STEP := 4
## Fill-clock seconds for a Footprint to fill: 120 wind-seconds in the open.
const PRINT_LIFETIME := 120.0
## The saved Snow Depth and fill-clock pictures hold values at nodes 0.4 m apart,
## counted from the map's west and north edges and read bilinearly, like the ground picture.
const DEPTH_NODES_PER_METRE := 2.5
const DEPTH_SIZE := Vector2i(HALF_EXTENTS * (2.0 * DEPTH_NODES_PER_METRE)) + Vector2i.ONE
const SNOW_SHADER := preload("res://snow.gdshader")
## A tenth-second fill timestamp occupies GBA (24 bits). Fill clocks run at most
## 1 + BUILDING_FILL times the wind clock, so restart both before encoding could wrap.
const CLOCK_LIMIT := 1677700.0 / (1.0 + SnowWind.BUILDING_FILL)

var region_center := Vector2.ZERO
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
var footprint_image_bytes := TILE_GRID.x * TILE_GRID.y * TILE_BYTES
## Footprint picture bytes sent to the GPU in the latest rendered frame and in total,
## and how many footsteps those uploads carried; each carries at most MAX_TILES_PER_STEP tiles.
var upload_bytes := 0
var upload_total_bytes := 0
var uploaded_steps := 0
var _tiles: Array[Image] = []
var _texture := Texture2DArray.new()
var _layout: Node3D
var _dirty_tiles := {}
var _pending_steps := 0
var _detail: MeshInstance3D
var _materials: Array[ShaderMaterial] = []
var _depth := PackedFloat32Array()
var _fill := PackedFloat32Array()
var _depth_image: Image
var _depth_texture: ImageTexture
var _fill_image: Image
var _fill_texture: ImageTexture


func _ready() -> void:
	assert(TILE_GRID * TILE_SIZE == IMAGE_SIZE, "Footprint tiles must cover the picture exactly")
	for layer in range(TILE_GRID.x * TILE_GRID.y):
		var tile := Image.create_empty(TILE_SIZE.x, TILE_SIZE.y, false, Image.FORMAT_RGBA8)
		tile.fill(Color(0, 0, 0, 0))
		_tiles.append(tile)
	_texture.create_from_images(_tiles)
	_make_mesh(HALF_EXTENTS.x * 2.0, HALF_EXTENTS.y * 2.0, COARSE_STEP, false)
	_detail = _make_mesh(DETAIL_SIZE.x, DETAIL_SIZE.y, DETAIL_STEP, true)
	_update_uniforms()


func _process(_delta: float) -> void:
	# Coalesce both figures' stamps before drawing and resend only the tiles they
	# touched. Wind ages encoded timestamps through the fill clock and never
	# rewrites or uploads the picture by itself.
	upload_bytes = 0
	for layer in _dirty_tiles:
		_texture.update_layer(_tiles[layer], layer)
		upload_bytes += TILE_BYTES
	_dirty_tiles.clear()
	upload_total_bytes += upload_bytes
	uploaded_steps += _pending_steps
	_pending_steps = 0


func _exit_tree() -> void:
	wind.finish()


func configure_ground(town: Node3D) -> void:
	# The layout owns the static ground picture. The shader reads the same nodes.
	_layout = town
	var ground_texture := ImageTexture.create_from_image(town.ground_image)
	# A fresh launch saves the layout's authored zones; nothing is loaded from disk.
	wind.configure(town, DEPTH_SIZE, DEPTH_NODES_PER_METRE)
	_depth = wind.depth.duplicate()
	_fill = wind.fill.duplicate()
	_depth_image = Image.create_from_data(DEPTH_SIZE.x, DEPTH_SIZE.y, false, Image.FORMAT_RF, _depth.to_byte_array())
	_depth_texture = ImageTexture.create_from_image(_depth_image)
	_fill_image = Image.create_from_data(DEPTH_SIZE.x, DEPTH_SIZE.y, false, Image.FORMAT_RF, _fill.to_byte_array())
	_fill_texture = ImageTexture.create_from_image(_fill_image)
	var heights: Vector2 = town.ground_range
	for material in _materials:
		material.set_shader_parameter("ground_image", ground_texture)
		material.set_shader_parameter("ground_nodes_per_metre", TownLayout.GROUND_NODES_PER_METRE)
		material.set_shader_parameter("depth_image", _depth_texture)
		material.set_shader_parameter("fill_image", _fill_texture)
		material.set_shader_parameter("depth_nodes_per_metre", DEPTH_NODES_PER_METRE)
	for child in get_children():
		if child is MeshInstance3D:
			var bounds: AABB = child.custom_aabb
			child.custom_aabb = AABB(Vector3(bounds.position.x, heights.x - 0.1, bounds.position.z),
				Vector3(bounds.size.x, heights.y - heights.x + 1.2, bounds.size.z))


## Shade Footprints' own shadows toward this unit direction to the sun. Shading only.
func set_sun_direction(toward_sun: Vector3) -> void:
	for material in _materials:
		material.set_shader_parameter("sun_direction", toward_sun.normalized())


## The wind blows from this compass bearing, clockwise from north.
func wind_from() -> float:
	return wind.from_bearing


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
		for layer in range(_tiles.size()):
			_tiles[layer].fill(Color(0, 0, 0, 0))
			_dirty_tiles[layer] = true
		_publish_snow()
	if wind.step(wind_elapsed):
		_publish_snow()
	wind_update_ms = float(Time.get_ticks_usec() - began) / 1000.0
	wind_total_ms += wind_update_ms
	wind_updates += 1


## Centre the detail region on the camera's focus. It snaps to coarse vertices,
## counted from the map's west and north edges, so its 5 cm grid stays world-aligned,
## and it stays inside the map. Moving it never moves or clears the Footprint picture.
func centre_detail(focus: Vector2) -> void:
	var centre_limit := HALF_EXTENTS - DETAIL_HALF
	region_center = Vector2(
		clampf(snappedf(focus.x + HALF_EXTENTS.x, COARSE_STEP) - HALF_EXTENTS.x, -centre_limit.x, centre_limit.x),
		clampf(snappedf(focus.y + HALF_EXTENTS.y, COARSE_STEP) - HALF_EXTENTS.y, -centre_limit.y, centre_limit.y)
	)
	_detail.position = Vector3(region_center.x, 0, region_center.y)
	_update_uniforms()


func in_detail_region(point: Vector2) -> bool:
	var local := (point - region_center).abs()
	return local.x < DETAIL_HALF.x and local.y < DETAIL_HALF.y


## Visible snow height: ground plus compacted Snow Depth, on the drawn triangles.
func sample_height(point: Vector2) -> float:
	if in_detail_region(point):
		return _triangle_height(point, DETAIL_STEP, true)
	return _triangle_height(point, COARSE_STEP, false)


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


func sample_compaction(point: Vector2) -> float:
	if _tiles.is_empty():
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
	if _tiles.is_empty() or absf(point.x) > HALF_EXTENTS.x or absf(point.y) > HALF_EXTENTS.y:
		return
	var forward := Vector2(-sin(heading), -cos(heading))
	var right := Vector2(cos(heading), -sin(heading))
	var extent := 0.18
	var minimum := Vector2i(((point - Vector2.ONE * extent + HALF_EXTENTS) * TEXELS_PER_METRE).floor())
	var maximum := Vector2i(((point + Vector2.ONE * extent + HALF_EXTENTS) * TEXELS_PER_METRE).ceil())
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
			var layer := _tile_layer(pixel)
			_tiles[layer].set_pixel(column % TILE_SIZE.x, row % TILE_SIZE.y, Color(clampf(previous + (1.0 - previous) * strength * weight, 0.0, 1.0),
				float((timestamp >> 16) & 255) / 255.0, float((timestamp >> 8) & 255) / 255.0, float(timestamp & 255) / 255.0))
			_dirty_tiles[layer] = true
	footprint_count += 1
	_pending_steps += 1


## The tile, and GPU layer, that holds a texel of the Footprint picture.
func _tile_layer(pixel: Vector2i) -> int:
	return (pixel.y / TILE_SIZE.y) * TILE_GRID.x + pixel.x / TILE_SIZE.x


func _pixel_compaction(pixel: Vector2i) -> float:
	if pixel.x < 0 or pixel.y < 0 or pixel.x >= IMAGE_SIZE.x or pixel.y >= IMAGE_SIZE.y:
		return 0.0
	var value := _tiles[_tile_layer(pixel)].get_pixel(pixel.x % TILE_SIZE.x, pixel.y % TILE_SIZE.y)
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


## Full detail inside the region's border, falling to the coarse surface across it.
## A side on the map edge has no coarse surface beyond it, so it has no border.
func _region_weight(point: Vector2) -> float:
	var low := region_center - DETAIL_HALF
	var high := region_center + DETAIL_HALF
	var edge := 1.0e6
	if low.x > -HALF_EXTENTS.x + 0.001:
		edge = minf(edge, point.x - low.x)
	if high.x < HALF_EXTENTS.x - 0.001:
		edge = minf(edge, high.x - point.x)
	if low.y > -HALF_EXTENTS.y + 0.001:
		edge = minf(edge, point.y - low.y)
	if high.y < HALF_EXTENTS.y - 0.001:
		edge = minf(edge, high.y - point.y)
	return smoothstep(0.0, EDGE_BLEND, edge)


func _detail_vertex_height(point: Vector2) -> float:
	var weight := _region_weight(point)
	if weight >= 0.99999:
		return _field_height(point)
	return lerpf(_triangle_height(point, COARSE_STEP, false), _field_height(point), weight)


func _triangle_height(point: Vector2, step: float, detail: bool) -> float:
	var origin := region_center - DETAIL_HALF if detail else -HALF_EXTENTS
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


func _make_mesh(width: float, depth: float, step: float, detail: bool) -> MeshInstance3D:
	# Width runs east–west (X) and depth north–south (Z).
	var cells := Vector2i(roundi(width / step), roundi(depth / step))
	var points := cells + Vector2i.ONE
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var indices := PackedInt32Array()
	vertices.resize(points.x * points.y)
	normals.resize(vertices.size())
	indices.resize(cells.x * cells.y * 6)
	for row in range(points.y):
		for column in range(points.x):
			var index := row * points.x + column
			vertices[index] = Vector3(float(column) * step - width * 0.5, 0, float(row) * step - depth * 0.5)
			normals[index] = Vector3.UP
	var next := 0
	for row in range(cells.y):
		for column in range(cells.x):
			var top_left := row * points.x + column
			indices[next] = top_left
			indices[next + 1] = top_left + 1
			indices[next + 2] = top_left + points.x
			indices[next + 3] = top_left + 1
			indices[next + 4] = top_left + points.x + 1
			indices[next + 5] = top_left + points.x
			next += 6
	# Coarse quads own their vertices so the vertex shader can collapse complete
	# covered cells. A fragment discard across MSAA samples leaves a dotted gap.
	var cell_centres := PackedVector2Array()
	if not detail:
		var quads := PackedVector3Array()
		quads.resize(cells.x * cells.y * 4)
		cell_centres.resize(quads.size())
		var quad_indices := PackedInt32Array()
		quad_indices.resize(indices.size())
		for row in range(cells.y):
			for column in range(cells.x):
				var quad := (row * cells.x + column) * 4
				var base := Vector2(float(column) * step - width * 0.5, float(row) * step - depth * 0.5)
				var centre := base + Vector2.ONE * step * 0.5
				quads[quad] = Vector3(base.x, 0, base.y)
				quads[quad + 1] = Vector3(base.x + step, 0, base.y)
				quads[quad + 2] = Vector3(base.x, 0, base.y + step)
				quads[quad + 3] = Vector3(base.x + step, 0, base.y + step)
				for corner in range(4):
					cell_centres[quad + corner] = centre
				var start := (row * cells.x + column) * 6
				quad_indices[start] = quad
				quad_indices[start + 1] = quad + 1
				quad_indices[start + 2] = quad + 2
				quad_indices[start + 3] = quad + 1
				quad_indices[start + 4] = quad + 3
				quad_indices[start + 5] = quad + 2
		vertices = quads
		indices = quad_indices
		normals.resize(vertices.size())
		normals.fill(Vector3.UP)
	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_INDEX] = indices
	if not detail:
		arrays[Mesh.ARRAY_TEX_UV] = cell_centres
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var material := ShaderMaterial.new()
	material.shader = SNOW_SHADER
	material.set_shader_parameter("detail_mesh", detail)
	material.set_shader_parameter("map_half_extents", HALF_EXTENTS)
	material.set_shader_parameter("footprint_tiles", _texture)
	material.set_shader_parameter("footprint_tile_grid", TILE_GRID)
	material.set_shader_parameter("detail_half_extents", DETAIL_HALF)
	_materials.append(material)
	var visible_surface := MeshInstance3D.new()
	visible_surface.name = "DetailedSnow" if detail else "CoarseSnow"
	visible_surface.mesh = mesh
	visible_surface.material_override = material
	visible_surface.custom_aabb = AABB(Vector3(-width * 0.5, -0.1, -depth * 0.5), Vector3(width, 1.2, depth))
	add_child(visible_surface)
	return visible_surface


func _update_uniforms() -> void:
	for material in _materials:
		material.set_shader_parameter("region_center", region_center)

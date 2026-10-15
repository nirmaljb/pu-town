extends Node3D
class_name SnowSurface

## Static ground levels, a world-fixed snow field, and a small moving geometry window.
## The field spans the town layout's map rectangle; its surface is the layout's
## ground-height picture plus Snow Depth.
## The CPU samples the same displaced triangles as snow.gdshader. No stale static
## collider stands in for snow contact. Footsteps mutate one bounded image only.
const TownLayout = preload("res://town_layout.gd")
const HALF_EXTENTS := TownLayout.HALF_EXTENTS
const PATCH_SIZE := 12.8
const COARSE_STEP := 0.8
const DETAIL_STEP := 0.1
const EDGE_BLEND := 1.6
# 31.25 mm per texel; the image covers the whole map rectangle at this density.
const TEXELS_PER_METRE := 32.0
const IMAGE_SIZE := Vector2i(HALF_EXTENTS * (2.0 * TEXELS_PER_METRE))
const PRINT_LIFETIME := 120.0
const MAX_OBSTACLES := 16
const SNOW_SHADER := preload("res://snow.gdshader")

var patch_center := Vector2.ZERO
var wind_strength := 1.0
var wind_elapsed := 0.0
var footprint_count := 0
var footprint_image_bytes := IMAGE_SIZE.x * IMAGE_SIZE.y * 4
var interior_height_range := Vector2.ZERO
var perimeter_height_range := Vector2.ZERO
var _footprints: Image
var _texture: ImageTexture
var _layout: Node3D
var _dirty := false
var _detail: MeshInstance3D
var _materials: Array[ShaderMaterial] = []
var _obstacles: Array[Vector4] = []
var _observation_elapsed := 1.0


func _ready() -> void:
	_footprints = Image.create_empty(IMAGE_SIZE.x, IMAGE_SIZE.y, false, Image.FORMAT_RGBA8)
	_footprints.fill(Color(0, 0, 0, 0))
	_texture = ImageTexture.create_from_image(_footprints)
	_make_mesh(HALF_EXTENTS.x * 2.0, HALF_EXTENTS.y * 2.0, COARSE_STEP, false)
	_detail = _make_mesh(PATCH_SIZE, PATCH_SIZE, DETAIL_STEP, true)
	_update_uniforms()
	_refresh_height_ranges()


func _process(_delta: float) -> void:
	# Coalesce both figures' stamps before drawing. Wind ages encoded timestamps
	# on the CPU/GPU and never rewrites or uploads the whole image by itself.
	if _dirty:
		_texture.update(_footprints)
		_dirty = false


func configure_ground(town: Node3D) -> void:
	# The layout owns the static ground picture. The shader reads the same nodes.
	_layout = town
	var ground_texture := ImageTexture.create_from_image(town.ground_image)
	var heights: Vector2 = town.ground_range
	for material in _materials:
		material.set_shader_parameter("ground_image", ground_texture)
		material.set_shader_parameter("ground_nodes_per_metre", TownLayout.GROUND_NODES_PER_METRE)
	for child in get_children():
		if child is MeshInstance3D:
			var bounds: AABB = child.custom_aabb
			child.custom_aabb = AABB(Vector3(bounds.position.x, heights.x - 0.1, bounds.position.z),
				Vector3(bounds.size.x, heights.y - heights.x + 1.2, bounds.size.z))
	_refresh_height_ranges()


func configure_obstacles(obstacles: Array[Dictionary]) -> void:
	_obstacles.clear()
	for obstacle in obstacles:
		if _obstacles.size() == MAX_OBSTACLES:
			break
		var centre: Vector2 = obstacle.center
		var size: Vector2 = obstacle.size
		_obstacles.append(Vector4(centre.x, centre.y, size.x * 0.5, size.y * 0.5))
	_update_uniforms()


func advance(delta: float, focus_xz: Vector2) -> void:
	wind_elapsed += delta * maxf(0.0, wind_strength)
	# A tenth-second timestamp occupies GBA (24 bits). This preview has no saved
	# weather: restart its wind epoch before encoding could wrap after 19 days.
	if wind_elapsed >= 1677700.0:
		wind_elapsed = 0.0
		_footprints.fill(Color(0, 0, 0, 0))
		_dirty = true
	# Snap to coarse vertices, which are counted from the map's west and north edges.
	var centre_limit := HALF_EXTENTS - Vector2.ONE * PATCH_SIZE * 0.5
	patch_center = Vector2(
		clampf(snappedf(focus_xz.x + HALF_EXTENTS.x, COARSE_STEP) - HALF_EXTENTS.x, -centre_limit.x, centre_limit.x),
		clampf(snappedf(focus_xz.y + HALF_EXTENTS.y, COARSE_STEP) - HALF_EXTENTS.y, -centre_limit.y, centre_limit.y)
	)
	_detail.position = Vector3(patch_center.x, 0, patch_center.y)
	_update_uniforms(false)
	_observation_elapsed += delta
	if _observation_elapsed >= 1.0:
		_observation_elapsed = 0.0
		_refresh_height_ranges()


## Visible snow height: ground plus compacted Snow Depth, on the drawn triangles.
func sample_height(point: Vector2) -> float:
	var local := (point - patch_center).abs()
	if maxf(local.x, local.y) < PATCH_SIZE * 0.5:
		return _triangle_height(point, DETAIL_STEP, true)
	return _triangle_height(point, COARSE_STEP, false)


func sample_ground(point: Vector2) -> float:
	return _layout.ground_height(point) if _layout else 0.0


## Snow height before any compaction: ground plus loose Snow Depth.
func sample_uncompressed_height(point: Vector2) -> float:
	return sample_ground(point) + _uncompressed_height(point)


func sample_compaction(point: Vector2) -> float:
	if _footprints == null:
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
	return _uncompressed_height(point) * (1.0 - 0.94 * packed)


func stamp_foot(point: Vector2, heading: float, strength: float) -> void:
	if _footprints == null or absf(point.x) > HALF_EXTENTS.x or absf(point.y) > HALF_EXTENTS.y:
		return
	var forward := Vector2(-sin(heading), -cos(heading))
	var right := Vector2(cos(heading), -sin(heading))
	var extent := 0.18
	var minimum := Vector2i(((point - Vector2.ONE * extent + HALF_EXTENTS) * TEXELS_PER_METRE).floor())
	var maximum := Vector2i(((point + Vector2.ONE * extent + HALF_EXTENTS) * TEXELS_PER_METRE).ceil())
	var timestamp := int(floor(wind_elapsed * 10.0))
	var encoded := Color(0, float((timestamp >> 16) & 255) / 255.0,
		float((timestamp >> 8) & 255) / 255.0, float(timestamp & 255) / 255.0)
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
			encoded.r = clampf(previous + (1.0 - previous) * strength * weight, 0.0, 1.0)
			_footprints.set_pixel(column, row, encoded)
	footprint_count += 1
	_dirty = true


func _pixel_compaction(pixel: Vector2i) -> float:
	if pixel.x < 0 or pixel.y < 0 or pixel.x >= IMAGE_SIZE.x or pixel.y >= IMAGE_SIZE.y:
		return 0.0
	var value := _footprints.get_pixel(pixel.x, pixel.y)
	var timestamp := roundi(value.g * 255.0) * 65536 + roundi(value.b * 255.0) * 256 + roundi(value.a * 255.0)
	var age := maxf(0.0, wind_elapsed - float(timestamp) * 0.1)
	return value.r * maxf(0.0, 1.0 - age / PRINT_LIFETIME)


func _uncompressed_height(point: Vector2) -> float:
	# This formula and the shader's uncompressed_height are intentionally paired.
	# It is Snow Depth above the ground. Initial broad shallow/deep fields remain bounded while
	# the wind slowly moves relief and builds/lowers drifts on the +X lee of boxes.
	var field := sin(point.x * 0.14 - 0.7) * cos(point.y * 0.12 + 0.4)
	var height := 0.08 + 0.52 * smoothstep(0.0, 0.85, field)
	height += 0.018 * sin(point.x * 0.63 + point.y * 0.32)
	var phase := point.x * 0.36 + point.y * 0.17
	height += 0.035 * (sin(phase - wind_elapsed * 0.025) - sin(phase)) * sin(point.y * 0.13 + 0.4)
	var drift_amount := 0.13 + 0.06 * sin(wind_elapsed * 0.018)
	for obstacle in _obstacles:
		var downwind := point.x - (obstacle.x + obstacle.z)
		var lee := 1.0 - smoothstep(0.0, 3.2, absf(downwind - 1.0))
		var across := 1.0 - smoothstep(obstacle.w + 0.25, obstacle.w + 2.2, absf(point.y - obstacle.y))
		height += drift_amount * lee * across
	return clampf(height, 0.05, 0.85)


func _field_height(point: Vector2) -> float:
	# Even completely packed snow retains a thin layer over the ground.
	return sample_ground(point) + maxf(0.025, _uncompressed_height(point) * (1.0 - 0.86 * sample_compaction(point)))


func _detail_vertex_height(point: Vector2) -> float:
	var edge := PATCH_SIZE * 0.5 - maxf(absf(point.x - patch_center.x), absf(point.y - patch_center.y))
	var weight := smoothstep(0.0, EDGE_BLEND, edge)
	if weight >= 0.99999:
		return _field_height(point)
	return lerpf(_triangle_height(point, COARSE_STEP, false), _field_height(point), weight)


func _triangle_height(point: Vector2, step: float, detail: bool) -> float:
	var origin := patch_center - Vector2.ONE * PATCH_SIZE * 0.5 if detail else -HALF_EXTENTS
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
	material.set_shader_parameter("footprint_image", _texture)
	_materials.append(material)
	var visible_surface := MeshInstance3D.new()
	visible_surface.name = "DetailedSnow" if detail else "CoarseSnow"
	visible_surface.mesh = mesh
	visible_surface.material_override = material
	visible_surface.custom_aabb = AABB(Vector3(-width * 0.5, -0.1, -depth * 0.5), Vector3(width, 1.2, depth))
	add_child(visible_surface)
	return visible_surface


func _update_uniforms(include_obstacles: bool = true) -> void:
	var boxes := PackedVector4Array()
	if include_obstacles:
		boxes.resize(MAX_OBSTACLES)
		for index in range(_obstacles.size()):
			boxes[index] = _obstacles[index]
	for material in _materials:
		material.set_shader_parameter("patch_center", patch_center)
		material.set_shader_parameter("wind_elapsed", wind_elapsed)
		if include_obstacles:
			material.set_shader_parameter("obstacle_count", _obstacles.size())
			material.set_shader_parameter("obstacles", boxes)


func _refresh_height_ranges() -> void:
	# Small, explicitly sampled observations rather than retained initial extrema.
	interior_height_range = Vector2(INF, -INF)
	perimeter_height_range = Vector2(INF, -INF)
	var spacing := (HALF_EXTENTS - Vector2.ONE * 0.4) / 4.0
	for row in range(9):
		for column in range(9):
			var point := Vector2(float(column - 4), float(row - 4)) * spacing
			var height := sample_height(point) - sample_ground(point)
			if row == 0 or row == 8 or column == 0 or column == 8:
				perimeter_height_range.x = minf(perimeter_height_range.x, height)
				perimeter_height_range.y = maxf(perimeter_height_range.y, height)
			else:
				interior_height_range.x = minf(interior_height_range.x, height)
				interior_height_range.y = maxf(interior_height_range.y, height)

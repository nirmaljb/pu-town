extends Node3D
class_name SnowSurface

## A continuous snow surface. Rendering and collision share these exact triangles.
const HALF_EXTENT := 32.0
const GRID_STEP := 0.25
const PERIMETER_WIDTH := 7.0
const GRID_CELLS := int(HALF_EXTENT * 2.0 / GRID_STEP)
const GRID_POINTS := GRID_CELLS + 1
const SNOW_SHADER := preload("res://snow.gdshader")

## Measured from the generated vertices for the scene's surface observations.
var interior_height_range := Vector2(INF, -INF)
var perimeter_height_range := Vector2(INF, -INF)


func _ready() -> void:
	_build_surface()


func _build_surface() -> void:
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var indices := PackedInt32Array()
	vertices.resize(GRID_POINTS * GRID_POINTS)
	normals.resize(vertices.size())
	indices.resize(GRID_CELLS * GRID_CELLS * 6)

	for row in range(GRID_POINTS):
		var z := -HALF_EXTENT + row * GRID_STEP
		for column in range(GRID_POINTS):
			var x := -HALF_EXTENT + column * GRID_STEP
			var height := _snow_height(x, z)
			vertices[row * GRID_POINTS + column] = Vector3(x, height, z)
			var edge_distance := HALF_EXTENT - maxf(absf(x), absf(z))
			if edge_distance >= PERIMETER_WIDTH:
				interior_height_range.x = minf(interior_height_range.x, height)
				interior_height_range.y = maxf(interior_height_range.y, height)
			if edge_distance <= 1.0:
				perimeter_height_range.x = minf(perimeter_height_range.x, height)
				perimeter_height_range.y = maxf(perimeter_height_range.y, height)

	var next_index := 0
	for row in range(GRID_CELLS):
		for column in range(GRID_CELLS):
			var top_left := row * GRID_POINTS + column
			var top_right := top_left + 1
			var bottom_left := top_left + GRID_POINTS
			var bottom_right := bottom_left + 1
			# Godot's front faces use clockwise winding when viewed from above.
			indices[next_index] = top_left
			indices[next_index + 1] = top_right
			indices[next_index + 2] = bottom_left
			indices[next_index + 3] = top_right
			indices[next_index + 4] = bottom_right
			indices[next_index + 5] = bottom_left
			next_index += 6

	# Area-weighted normals are shared by every triangle meeting at a vertex.
	for triangle in range(0, indices.size(), 3):
		var first := indices[triangle]
		var second := indices[triangle + 1]
		var third := indices[triangle + 2]
		var normal := (vertices[third] - vertices[first]).cross(
			vertices[second] - vertices[first]
		)
		normals[first] += normal
		normals[second] += normal
		normals[third] += normal
	for index in range(normals.size()):
		normals[index] = normals[index].normalized()

	var arrays: Array = []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_INDEX] = indices
	var surface_mesh := ArrayMesh.new()
	surface_mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)

	var snow_material := ShaderMaterial.new()
	snow_material.shader = SNOW_SHADER
	var visible_surface := MeshInstance3D.new()
	visible_surface.name = "SnowMesh"
	visible_surface.mesh = surface_mesh
	visible_surface.material_override = snow_material
	add_child(visible_surface)

	var ground := StaticBody3D.new()
	ground.name = "SnowGround"
	ground.collision_layer = 1
	ground.collision_mask = 1
	var collision := CollisionShape3D.new()
	collision.name = "SnowCollision"
	collision.shape = surface_mesh.create_trimesh_shape()
	ground.add_child(collision)
	add_child(ground)


func _snow_height(x: float, z: float) -> float:
	# The absolute weights total one: interior relief stays within 0.10–0.25 m.
	# Warped, oblique pillows break up long waves without sharp or tiled detail.
	# Their 2–8 m wavelengths are readable beside the figure at exploration zoom.
	var wind_x := x + 0.65 * sin(z * 0.23 + 0.4)
	var wind_z := z + 0.55 * sin(x * 0.19 - 0.8)
	var relief := (
		0.46 * sin(wind_x * 0.73 + wind_z * 0.31 + 0.7)
		+ 0.34 * cos(wind_z * 1.19 - wind_x * 0.43 - 0.4)
		+ 0.20 * sin(wind_x * 1.83 + wind_z * 1.47 + 2.1)
	)
	var interior_height := 0.175 + 0.075 * relief
	var x_drift := smoothstep(HALF_EXTENT - PERIMETER_WIDTH, HALF_EXTENT, absf(x))
	var z_drift := smoothstep(HALF_EXTENT - PERIMETER_WIDTH, HALF_EXTENT, absf(z))
	# A smooth union avoids a diagonal crease where the edge bands meet.
	var drift_weight := 1.0 - (1.0 - x_drift) * (1.0 - z_drift)
	var drift_height := 0.76 + 0.14 * sin(x * 0.11 + z * 0.07 + 0.8)
	return lerpf(interior_height, drift_height, drift_weight)

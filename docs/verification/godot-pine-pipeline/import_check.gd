extends SceneTree
# Pine pipeline record: load the two exported pines as the game will and print what
# Godot imported for each: its meshes, their surfaces' materials and cull modes,
# triangle counts, generated LODs and bounds. It fails if either is missing, has
# import-generated LODs or draws a surface from one side only. Run from the
# repository root after ./godot/run.sh --check:
#   "$GODOT" --headless --path godot -s "$PWD/docs/verification/godot-pine-pipeline/import_check.gd"
const FILES := ["res://scenery/pine/pine.glb", "res://scenery/pine/pine_far.glb"]


func _initialize() -> void:
	var failures := 0
	for path: String in FILES:
		var scene := load(path) as PackedScene
		if scene == null:
			print("PINE_IMPORT missing ", path)
			failures += 1
			continue
		var root := scene.instantiate()
		for instance: MeshInstance3D in root.find_children("*", "MeshInstance3D", true, false):
			var mesh := instance.mesh
			var triangles := 0
			for surface in mesh.get_surface_count():
				var arrays := mesh.surface_get_arrays(surface)
				var indices: PackedInt32Array = arrays[Mesh.ARRAY_INDEX]
				var count: int = (indices.size() if not indices.is_empty() else arrays[Mesh.ARRAY_VERTEX].size()) / 3
				triangles += count
				var lods: Array = RenderingServer.mesh_get_surface(mesh.get_rid(), surface).get("lods", [])
				var material := mesh.surface_get_material(surface) as BaseMaterial3D
				var both_sides := material != null and material.cull_mode == BaseMaterial3D.CULL_DISABLED
				print("PINE_IMPORT %s %s surface %d %s: %d triangles, %d LODs, %s" % [
					path.get_file(), instance.name, surface, material.resource_name if material else "<none>",
					count, lods.size(), "both sides" if both_sides else "ONE SIDE"])
				if not lods.is_empty() or not both_sides:
					failures += 1
			print("PINE_IMPORT %s %s: %d triangles, bounds %s" % [path.get_file(), instance.name, triangles, mesh.get_aabb()])
		root.free()
	print("PINE_IMPORT %s · %d failures" % ["PASS" if failures == 0 else "FAIL", failures])
	quit(1 if failures else 0)

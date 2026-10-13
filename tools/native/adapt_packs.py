"""Derive editable tropical variants from retained CC0 pack sources in Blender.

Run directly in Blender or via the MCP execute_blender_code tool. Extract the
retained archives to .scratch/native/packs first. Original models are never changed.
"""
import hashlib
import json
from pathlib import Path
import bpy
from mathutils import Vector
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[2]
PACKS = ROOT / ".scratch/native/packs"
OUTPUT = ROOT / "native/Assets/Art/Campus"
SOURCES = ROOT / "campus/assets/adapted"
VARIANTS = {
    "Chair": ("kenney_furniture-kit-2.0/Models/OBJ format/chair.obj", .9),
    "Table": ("kenney_furniture-kit-2.0/Models/OBJ format/table.obj", .78),
    "Shelf": ("kenney_furniture-kit-2.0/Models/OBJ format/bookcaseOpen.obj", 1.2),
    "Wall": ("kenney_building-kit-1.0/Models/FBX format/wall-window-square-detailed.fbx", 2.6),
    "Door": ("kenney_building-kit-1.0/Models/FBX format/wall-doorway-wide-round.fbx", 2.6),
    "Roof": ("kenney_building-kit-1.0/Models/FBX format/roof-flat-square.fbx", .18),
    "Quarters": ("kenney_city-kit-suburban-2.0/Models/OBJ format/building-type-e.obj", 2.6),
    "Tree": ("kenney_city-kit-suburban-2.0/Models/OBJ format/tree-large.obj", 2.8),
}
OUTPUT.mkdir(parents=True, exist_ok=True)
SOURCES.mkdir(parents=True, exist_ok=True)
costs = []
for name, (relative, height) in VARIANTS.items():
    original = PACKS / relative
    if not original.is_file():
        raise ValueError(f"Missing original pack source: {original}")
    # Keep all existing scenes intact. Each adaptation gets a separate empty
    # scene, and the saved library includes only that authored scene's data.
    scene = bpy.data.scenes.new("PUtown pack " + name + " " + uuid4().hex[:8])
    bpy.context.window.scene = scene
    if original.suffix == ".obj":
        bpy.ops.wm.obj_import(filepath=str(original))
    else:
        bpy.ops.import_scene.fbx(filepath=str(original))
    meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
    if not meshes:
        raise ValueError(f"No mesh in source: {relative}")
    points = [obj.matrix_world @ Vector(corner) for obj in meshes for corner in obj.bound_box]
    low = Vector(tuple(min(point[axis] for point in points) for axis in range(3)))
    high = Vector(tuple(max(point[axis] for point in points) for axis in range(3)))
    size = high - low
    if size.z <= 0:
        raise ValueError(f"Source has no vertical dimension: {relative}")
    factor = height / size.z
    offset = Vector(((low.x + high.x) / 2, (low.y + high.y) / 2, low.z))
    for obj in meshes:
        world = obj.matrix_world.copy()
        obj.parent = None
        obj.matrix_world = world
        for vertex in obj.data.vertices:
            vertex.co = (world @ vertex.co - offset) * factor
        obj.matrix_world.identity()
        obj.name = name + "_" + obj.name
        obj.data.calc_loop_triangles()
        for mat in obj.data.materials:
            if mat is None:
                continue
            original_colour = mat.diffuse_color
            brightness = sum(original_colour[:3]) / 3
            colour = ((.18, .4, .16, 1) if name == "Tree" and brightness > .18 else
                      (.3, .19, .1, 1) if name in ("Chair", "Table", "Shelf", "Tree") else
                      (.63, .27, .17, 1) if name == "Roof" else
                      (.9, .83, .64, 1) if brightness > .25 else (.23, .32, .33, 1))
            mat.diffuse_color = colour
            mat.use_nodes = True
            node = mat.node_tree.nodes.get("Principled BSDF")
            if node:
                for link in list(mat.node_tree.links):
                    if link.to_node == node:
                        mat.node_tree.links.remove(link)
                node.inputs["Base Color"].default_value = colour
                node.inputs["Roughness"].default_value = .82
    bpy.ops.object.select_all(action="DESELECT")
    for mesh in meshes:
        mesh.select_set(True)
    bpy.context.view_layer.objects.active = meshes[0]
    source = SOURCES / (name + ".blend")
    export = OUTPUT / (name + ".fbx")
    bpy.data.libraries.write(str(source), {scene}, fake_user=True)
    bpy.ops.export_scene.fbx(filepath=str(export), use_selection=True, object_types={"MESH"},
                             axis_forward="-Z", axis_up="Y", apply_unit_scale=True,
                             add_leaf_bones=False, bake_anim=False)
    costs.append({"variant": name, "packSource": relative,
                  "sourceSha256": hashlib.sha256(original.read_bytes()).hexdigest(),
                  "triangles": sum(len(obj.data.loop_triangles) for obj in meshes),
                  "materials": len({mat.name for obj in meshes for mat in obj.data.materials if mat}),
                  "textures": 0, "uvLayers": sum(len(obj.data.uv_layers) for obj in meshes),
                  "heightMetres": height, "pivot": "feet", "export": export.name})
(SOURCES / "costs.json").write_text(json.dumps(costs, indent=2) + "\n")
print(json.dumps(costs))

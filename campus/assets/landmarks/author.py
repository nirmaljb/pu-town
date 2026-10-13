"""Original campus landmark masters authored through Blender MCP.

Each master gets a separate scene and retained v1 library. Existing Blender
scenes and retained pack originals are untouched. Repaired masters require a new
revision rather than overwriting v1. The Unity placement reads canonical rules.
"""
import hashlib
import json
import math
from pathlib import Path
from uuid import uuid4

import bpy
from mathutils import Vector

ROOT = Path(bpy.app.driver_namespace["putown_project"])
SOURCES = ROOT / "campus/assets/landmarks/masters"
EXPORTS = ROOT / "native/Assets/Art/Landmarks"
SOURCES.mkdir(parents=True, exist_ok=True)
EXPORTS.mkdir(parents=True, exist_ok=True)

PALETTE = {"cream": (.93, .86, .65, 1), "clay": (.67, .25, .16, 1),
           "glass": (.15, .32, .38, 1), "leaf": (.18, .42, .21, 1),
           "trunk": (.40, .28, .14, 1), "stone": (.65, .68, .55, 1),
           "gold": (.91, .68, .24, 1), "white": (.91, .92, .82, 1)}
materials = {}
for name, colour in PALETTE.items():
    mat = bpy.data.materials.new("PUtown landmark " + name)
    mat.diffuse_color = colour
    mat.use_nodes = True
    node = mat.node_tree.nodes.get("Principled BSDF")
    node.inputs["Base Color"].default_value = colour
    node.inputs["Roughness"].default_value = .7
    materials[name] = mat


def cube(name, location, size, material, bevel=.02):
    bpy.ops.mesh.primitive_cube_add(size=1, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(materials[material])
    if bevel:
        modifier = obj.modifiers.new("Soft campus edges", "BEVEL")
        modifier.width = bevel
        modifier.segments = 2
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)
    return obj


def cylinder(name, location, radius, depth, material, vertices=12):
    bpy.ops.mesh.primitive_cylinder_add(vertices=vertices, radius=radius, depth=depth, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(materials[material])
    return obj


def mesh(name, vertices, faces, material):
    data = bpy.data.meshes.new(name)
    data.from_pydata(vertices, [], faces)
    data.materials.append(materials[material])
    obj = bpy.data.objects.new(name, data)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def lantern():
    cylinder("Library lantern cream base", (0, 0, .12), 1, .24, "cream", 8)
    cylinder("Library reading light", (0, 0, .57), .83, .7, "glass", 8)
    cylinder("Library lantern terracotta cap", (0, 0, 1.03), 1.04, .22, "clay", 8)
    for i in range(8):
        angle = i * math.pi / 4
        cylinder("Clerestory mullion", (.87 * math.cos(angle), .87 * math.sin(angle), .59), .035, .76, "cream", 6)


def gate():
    cube("Gate terracotta band", (0, 0, .23), (3.4, .35, .46), "clay", .04)
    cube("Gate cream lettering panel", (0, -.19, .23), (2.6, .05, .30), "cream", .015)
    cylinder("Campus medallion", (0, -.22, .48), .20, .08, "gold", 16).rotation_euler.x = math.pi / 2
    for sign in (-1, 1):
        cube("Gateway cornice", (sign * 1.6, 0, .50), (.25, .45, .10), "cream")


def fin():
    cube("Shade fin", (0, 0, .8), (.14, .32, 1.6), "cream")
    cube("Terracotta fin foot", (0, 0, .08), (.23, .37, .16), "clay")


def solar():
    panel = cube("Green Energy solar module", (0, 0, .12), (1.5, .85, .07), "glass", .012)
    panel.rotation_euler.x = .18
    for i in range(1, 5):
        cube("Solar cells", (-.75 + i * .3, 0, .17), (.015, .81, .01), "cream", 0)
    cube("Solar cell seam", (0, 0, .17), (1.46, .015, .01), "cream", 0)


def palm():
    for i in range(7):
        cylinder("Palm trunk segment", (i * .025, 0, .2 + i * .3), .105 - i * .004, .32, "trunk", 9)
    for i in range(9):
        angle = i * math.tau / 9
        vertices = []
        for j in range(6):
            length = j * .24
            height = 2.3 + math.sin(j / 5 * math.pi) * .30 - j * .055
            width = math.sin(j / 5 * math.pi) * .17
            for side in (-1, 1):
                vertices.append((.17 + math.cos(angle) * length + side * math.sin(angle) * width,
                                 math.sin(angle) * length - side * math.cos(angle) * width, height))
        faces = [(j * 2, j * 2 + 1, j * 2 + 3, j * 2 + 2) for j in range(5)]
        obj = mesh("Palm frond", vertices, faces, "leaf")
        modifier = obj.modifiers.new("Frond thickness", "SOLIDIFY")
        modifier.thickness = .014
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=modifier.name)


def rock():
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=.7, location=(0, 0, .42))
    obj = bpy.context.object
    obj.name = "Coastal pale boulder"
    obj.scale = (1.2, .8, .68)
    obj.data.materials.append(materials["stone"])
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    for vertex in obj.data.vertices:
        vertex.co.z = max(vertex.co.z, -.42)


def ring():
    vertices = []
    for i in range(64):
        angle = i * math.tau / 64
        for radius in (.93, 1):
            vertices.append((math.cos(angle) * radius, math.sin(angle) * radius, .012))
    faces = [(i * 2, i * 2 + 1, ((i + 1) % 64) * 2 + 1, ((i + 1) % 64) * 2) for i in range(64)]
    mesh("Silver Jubilee and sports ground ring", vertices, faces, "white")


costs = []
for name, author in {"LibraryLantern": lantern, "GateCrown": gate, "ShadeFin": fin,
                     "SolarModule": solar, "Palm": palm, "Boulder": rock, "GroundRing": ring}.items():
    retained = SOURCES / name / "v1"
    if (retained / "source.blend").exists():
        raise ValueError("Retained v1 master already exists; author repairs as a new revision: " + name)
    scene = bpy.data.scenes.new("PUtown original " + name + " " + uuid4().hex[:8])
    bpy.context.window.scene = scene
    author()
    meshes = [obj for obj in scene.objects if obj.type == "MESH"]
    bpy.ops.object.select_all(action="DESELECT")
    for obj in meshes:
        obj.select_set(True)
        obj.data.calc_loop_triangles()
    bpy.context.view_layer.objects.active = meshes[0]
    retained.mkdir(parents=True)
    source = retained / "source.blend"
    bpy.data.libraries.write(str(source), {scene}, fake_user=True)
    export = EXPORTS / (name + ".fbx")
    bpy.ops.export_scene.fbx(filepath=str(export), use_selection=True, object_types={"MESH"},
                             axis_forward="-Z", axis_up="Y", apply_unit_scale=True, bake_anim=False)
    record = {"id": name, "revision": 1, "author": "Original PU Town artwork via Blender MCP",
              "license": "Project source handoff; original artwork, no provider imagery embedded",
              "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
              "exportSha256": hashlib.sha256(export.read_bytes()).hexdigest(),
              "triangles": sum(len(obj.data.loop_triangles) for obj in meshes),
              "materials": len({mat.name for obj in meshes for mat in obj.data.materials}), "textures": 0}
    (retained / "master.json").write_text(json.dumps(record, indent=2) + "\n")
    costs.append(record)
(SOURCES.parent / "blender-costs.json").write_text(json.dumps(costs, indent=2) + "\n")
print(json.dumps(costs))

"""Build the snow pine's two versions inside a headless Blender and save them for review.

Usage (from the repository root, see README.md):
  Blender -b --factory-startup --python tools/scenery/pine/make.py -- BUILD_DIR

Writes BUILD_DIR/pine.blend (both versions plus a review stage: grey studio world,
key light and a camera at the side sheet's framing), BUILD_DIR/pine.glb (the near
tree), BUILD_DIR/pine_far.glb (the distance version) and BUILD_DIR/report.json.
Nothing is written to the Godot project; run.sh exports the files once they pass.
"""
import hashlib
import json
import math
import sys
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
import palette  # noqa: E402
import shape  # noqa: E402

ROUGHNESS = {'Needles': 0.9, 'Shadow': 1.0, 'Snow': 0.7, 'Ice': 0.25, 'Bark': 0.95}


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.context.scene.unit_settings.system = 'METRIC'


def make_materials():
    made = {}
    for name, colour in palette.linear_colours().items():
        mat = bpy.data.materials.new(name)
        mat.diffuse_color = (*colour, 1)
        mat.use_backface_culling = False  # sprigs are single sheets seen from both sides
        mat.use_nodes = True
        bsdf = mat.node_tree.nodes['Principled BSDF']
        bsdf.inputs['Base Color'].default_value = (*colour, 1)
        bsdf.inputs['Roughness'].default_value = ROUGHNESS[name]
        bsdf.inputs['Specular IOR Level'].default_value = 0.25
        made[name] = mat
    return made


def make_mesh(materials, name, build):
    built, stats = build()
    mesh = bpy.data.meshes.new(name)
    mesh.from_pydata(built.verts, [], built.faces)
    order = list(materials)
    for material in order:
        mesh.materials.append(materials[material])
    for polygon, material in zip(mesh.polygons, built.materials):
        polygon.material_index = order.index(material)
    bm = bmesh.new()
    bm.from_mesh(mesh)
    bmesh.ops.triangulate(bm, faces=bm.faces, quad_method='BEAUTY', ngon_method='BEAUTY')
    bm.to_mesh(mesh)
    bm.free()
    for polygon in mesh.polygons:
        polygon.use_smooth = False  # the faceted look comes from flat triangles
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.collection.objects.link(obj)
    return obj, stats


def make_stage():
    """A studio like the side sheet's: soft grey surround and a high key from the front left."""
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE'
    scene.view_settings.view_transform = 'Standard'
    world = bpy.data.worlds.new('Studio')
    world.use_nodes = True
    background = world.node_tree.nodes['Background']
    background.inputs['Color'].default_value = (0.63, 0.65, 0.69, 1)
    background.inputs['Strength'].default_value = 0.9
    scene.world = world
    stage = bpy.data.collections.new('Review stage')
    scene.collection.children.link(stage)
    key = bpy.data.objects.new('Key', bpy.data.lights.new('Key', 'SUN'))
    key.data.energy = 2.2
    key.data.angle = math.radians(12)
    key.rotation_euler = Euler((math.radians(40), 0, math.radians(-35)))
    stage.objects.link(key)
    camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    camera.data.type = 'ORTHO'
    camera.data.ortho_scale = 6.728
    camera.location = (-0.07, -20, 3.228)
    camera.rotation_euler = Euler((math.radians(90), 0, 0))
    stage.objects.link(camera)
    scene.camera = camera
    scene.render.resolution_x, scene.render.resolution_y = 1024, 1536
    # Looking through this camera in the viewport shows the side sheet behind the tree.
    sheet = camera.data.background_images.new()
    sheet.image = bpy.data.images.load(str(HERE / 'reference/side.png'))
    sheet.alpha = 0.6
    sheet.display_depth = 'BACK'
    camera.data.show_background_images = True


# Version -> (Blender object, exported file, builder in shape.py).
VERSIONS = {'near': ('Pine', 'pine.glb', shape.shape), 'far': ('PineFar', 'pine_far.glb', shape.far)}


def export(obj, path):
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=str(path), export_format='GLB', export_yup=True, use_selection=True,
        export_texcoords=False, export_normals=True, export_materials='EXPORT',
        export_cameras=False, export_lights=False, export_extras=False,
    )


def describe(obj, path):
    mesh = obj.data
    per_material = {}
    for polygon in mesh.polygons:
        name = mesh.materials[polygon.material_index].name
        per_material[name] = per_material.get(name, 0) + 1
    xs = [v.co.x for v in mesh.vertices]
    ys = [v.co.y for v in mesh.vertices]
    return {
        'triangles': len(mesh.polygons), 'vertices': len(mesh.vertices),
        'triangles_by_material': per_material,
        'height_m': round(max(v.co.z for v in mesh.vertices), 3),
        'crown_m': {'x': [round(min(xs), 2), round(max(xs), 2)], 'y': [round(min(ys), 2), round(max(ys), 2)]},
        'file': path.name, 'glb_bytes': path.stat().st_size,
        'glb_sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
    }


def main():
    build = Path(sys.argv[sys.argv.index('--') + 1]).resolve()
    build.mkdir(parents=True, exist_ok=True)
    reset()
    materials = make_materials()
    built = {version: make_mesh(materials, name, builder) for version, (name, _, builder) in VERSIONS.items()}
    make_stage()
    bpy.ops.wm.save_as_mainfile(filepath=str(build / 'pine.blend'))
    report = {}
    for version, (obj, stats) in built.items():
        path = build / VERSIONS[version][1]
        export(obj, path)
        report[version] = describe(obj, path)
    report.update({'structure': built['near'][1], 'materials': palette.SWATCHES, 'wind_from': shape.WIND_FROM})
    (build / 'report.json').write_text(json.dumps(report, indent=2) + '\n')
    print('PINE_REPORT', json.dumps(report))


if __name__ == '__main__':
    main()

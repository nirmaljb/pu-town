"""Run in a fresh Blender scene, directly or through execute_blender_code.

The editable source and exported mesh are original PU Town artwork.
"""
from pathlib import Path
import bpy

ROOT = Path(__file__).resolve().parents[2]
bpy.ops.object.select_all(action="SELECT")
bpy.ops.object.delete(use_global=False)
bpy.ops.mesh.primitive_cube_add(size=1, location=(0, 0, .25))
base = bpy.context.object
base.name = "CourtyardPlinth"
base.scale = (2, 2, .5)
bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
material = bpy.data.materials.new("CreamStone")
material.diffuse_color = (.82, .75, .60, 1)
base.data.materials.append(material)
source = ROOT / "campus/assets/authored/starter-courtyard.blend"
export = ROOT / "native/Assets/Art/Starter/starter-courtyard.obj"
source.parent.mkdir(parents=True, exist_ok=True)
export.parent.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.save_as_mainfile(filepath=str(source))
bpy.ops.wm.obj_export(filepath=str(export), export_selected_objects=True)
print({"object": base.name, "vertices": len(base.data.vertices), "polygons": len(base.data.polygons)})

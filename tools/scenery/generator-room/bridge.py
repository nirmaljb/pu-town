"""Load upstream MCP for Blender for this Blender session only.

Blender --factory-startup --python bridge.py -- /path/to/addon.py
Uses a dedicated loopback port without saving user preferences.
"""
import importlib.util
import sys
import bpy

path = sys.argv[sys.argv.index('--') + 1]
spec = importlib.util.spec_from_file_location('generator_room_mcp', path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
module.register()
bpy.context.scene.blendermcp_port = 9877

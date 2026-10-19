"""Load upstream MCP for Blender for this Blender session only.

Blender --factory-startup --python bridge.py -- /path/to/addon.py [port]
Uses a dedicated loopback port (default 9878) without saving user preferences.
"""
import importlib.util
import sys
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
spec = importlib.util.spec_from_file_location('storage_room_mcp', args[0])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
module.register()
bpy.context.scene.blendermcp_port = int(args[1]) if len(args) > 1 else 9878

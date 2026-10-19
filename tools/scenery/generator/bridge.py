"""Load upstream MCP for Blender for this Blender session only.

Blender --factory-startup --python bridge.py -- /path/to/addon.py [PORT]
Uses a dedicated loopback port (default 9881) without saving user preferences,
so it can run beside other Blender MCP sessions.
"""
import importlib.util
import sys
import bpy

args = sys.argv[sys.argv.index('--') + 1:]
spec = importlib.util.spec_from_file_location('generator_mcp', args[0])
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
module.register()
bpy.context.scene.blendermcp_port = int(args[1]) if len(args) > 1 else 9881

"""Load a project-local Blender MCP addon for this process, without changing preferences.

Usage: Blender --factory-startup --python tools/native/blender_bridge.py -- /path/to/addon.py
The official addon binds localhost:9876. No remote asset services are enabled.
"""
import importlib.util
import sys

path = sys.argv[sys.argv.index("--") + 1]
spec = importlib.util.spec_from_file_location("putown_blender_bridge", path)
module = importlib.util.module_from_spec(spec)
sys.modules[spec.name] = module
spec.loader.exec_module(module)
module.register()

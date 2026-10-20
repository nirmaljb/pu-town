extends SceneTree
# Footprint tiles record: what rebuilding the GPU copy at a new size costs a frame.
# With vsync off, the HUD hidden and the wind still, it presses one print a frame in
# each of the interim map's 800 tiles in turn, row by row from the north-west
# corner, so the GPU copy doubles from 8 layers to its cap of 800; then the wind
# blows at 16 until the prints have filled, their tiles are freed and the copy
# halves again. For every frame in which the copy changed size it prints that
# frame's interval beside the median of the 30 frames before it. The figures stand
# still in the Town Square with the camera at the default play distance. Verification
# only: it presses prints directly, not through the scene's input or route. Run from
# the repository root in a window:
#   "$GODOT" --path godot -s "$PWD/docs/verification/godot-snow-footprint-tiles/rebuild_timing.gd"
# Source-only engine timing: not a release package and not ordinary OS input.
const WARM_FRAMES := 120
const TILE_METRES := Vector2(8, 4)

var scene: Node
var frames := 0
var last := 0
var intervals: Array[float] = []
var layers := 0
var next_tile := 0
var tile_count := 0
var events: Array[String] = []


func _initialize() -> void:
	DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_DISABLED)
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _process(_delta: float) -> bool:
	scene.focused = false
	scene.inspection.visible = false
	scene.camera.cursor_inside = false
	frames += 1
	var now := Time.get_ticks_usec()
	if last > 0:
		intervals.append((now - last) / 1000.0)
	last = now
	var footprints: RefCounted = scene.surface.footprints
	var half: Vector2 = scene.surface.HALF_EXTENTS
	var grid := Vector2i((half * 2.0 / TILE_METRES).ceil())
	tile_count = grid.x * grid.y
	if frames < WARM_FRAMES:
		scene.surface.wind_strength = 0.0
		layers = footprints.gpu_layers
		return false
	# The interval just measured ended with the physics frames that may have rebuilt the copy.
	if footprints.gpu_layers != layers:
		var recent := intervals.slice(maxi(0, intervals.size() - 31), intervals.size() - 1)
		recent.sort()
		events.append("%s to %d layers (from %d, %d tiles): frame %.1f ms, median of the 30 before %.1f ms" % [
			"grew" if footprints.gpu_layers > layers else "shrank", footprints.gpu_layers, layers, footprints.tiles,
			intervals.back(), recent[recent.size() / 2]])
		print("REBUILD ", events.back())
		layers = footprints.gpu_layers
	if next_tile < tile_count:
		var tile := Vector2i(next_tile % grid.x, next_tile / grid.x)
		var centre := -half + (Vector2(tile) + Vector2(0.5, 0.5)) * TILE_METRES
		scene.surface.stamp_foot(centre, 0.0, 0.32)
		next_tile += 1
		return false
	# Every tile pressed: blow until the wind has freed them all but the figures' own.
	scene.surface.wind_strength = 16.0
	if footprints.gpu_layers > footprints.FIRST_GPU_LAYERS and frames < WARM_FRAMES + tile_count + 3000:
		return false
	print("REBUILD done: %d tiles pressed, %d tiles left, %d layers, %d bytes resent resizing" % [tile_count, footprints.tiles,
		footprints.gpu_layers, footprints.gpu_rebuild_bytes])
	return true

extends SceneTree
# Footprint tiles record: the engine's own memory monitors once the scene has
# settled, then after the controlled figure has walked 60 seconds down the
# south-west Road from its Town Square corner, laying a fresh trail, while the
# walking figure walks its loop. Static memory is the engine's CPU allocations, the
# Footprint picture's CPU tiles among them; texture and video memory are what the
# renderer reports allocating on the GPU. It reads only fields both the whole-map
# picture's build and the tiled build expose, so the same script measures both. Run
# from the repository root in a window:
#   "$GODOT" --path godot -s "$PWD/docs/verification/godot-snow-footprint-tiles/memory_probe.gd"
# Engine monitors in source: not a release package, and not an operating-system
# measurement of the process.
const SETTLE_FRAMES := 120
const WALK_SECONDS := 60.0

var scene: Node
var frames := 0
var walked := 0.0


func _initialize() -> void:
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _process(delta: float) -> bool:
	scene.focused = false
	scene.inspection.visible = false
	scene.camera.cursor_inside = false
	frames += 1
	if frames == 2:
		scene.walker.position = Vector3(-20, 0, 15)
	if frames == SETTLE_FRAMES:
		_report("settled")
	if frames <= SETTLE_FRAMES:
		return false
	scene.walker._move(minf(delta, 0.1), Vector2(-1, 1).normalized())
	walked += delta
	if walked < WALK_SECONDS:
		return false
	_report("walked")
	return true


func _report(moment: String) -> void:
	var tiles: String = "%d tiles, GPU %d layers" % [scene.surface.footprints.tiles, scene.surface.footprints.gpu_layers] \
		if "footprints" in scene.surface else "whole-map picture"
	print("MEMORY %s · static %.1f MiB (peak %.1f) · texture %.1f MiB · video %.1f MiB · %d footsteps · Footprint %s · figure %s" % [moment,
		Performance.get_monitor(Performance.MEMORY_STATIC) / 1048576.0, Performance.get_monitor(Performance.MEMORY_STATIC_MAX) / 1048576.0,
		Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED) / 1048576.0, Performance.get_monitor(Performance.RENDER_VIDEO_MEM_USED) / 1048576.0,
		scene.surface.footprint_count, tiles, scene.walker.position])

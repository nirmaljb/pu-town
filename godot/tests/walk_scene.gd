extends SceneTree
## Launch the real scene and public keyboard/CSV snow route.
## Graphical: --script res://tests/walk_scene.gd, then F7 in the focused window.
## Headless replay: add --headless and -- --auto-start --headless-scene-check.
## A release package runs the same route with -- --snow-scene-check.

const InspectionRoute = preload("res://inspection_route.gd")


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	change_scene_to_file("res://snow_walk.tscn")
	await process_frame
	# The normal scene adds its route when requested by a release launch argument.
	if not OS.get_cmdline_user_args().has("--walk-scene-check") and not OS.get_cmdline_user_args().has("--snow-scene-check"):
		root.add_child(InspectionRoute.new())

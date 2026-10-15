extends SceneTree
## Launch the real graphical scene and its public keyboard/CSV inspection route.
## The same route can run from a release package with --walk-scene-check.

const InspectionRoute = preload("res://inspection_route.gd")


func _initialize() -> void:
	_run.call_deferred()


func _run() -> void:
	change_scene_to_file("res://snow_walk.tscn")
	await process_frame
	root.add_child(InspectionRoute.new())

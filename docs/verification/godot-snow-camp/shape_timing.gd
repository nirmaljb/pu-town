extends SceneTree
# Camp record: how long the wind's worker takes to shape the drifts, scour and
# shelter for a new wind direction on the interim map with the Camp standing. It
# turns the wind one 45° step at a time, waits until the snow follows that bearing,
# and prints the worker's own timing of each shape and the wall-clock time from the
# turn until it landed. Verification only: it calls the surface directly. Run from
# the repository root:
#   "$GODOT" --headless --path godot -s "$PWD/docs/verification/godot-snow-camp/shape_timing.gd"
var scene: Node
var frames := 0
var turned_usec := 0
var turns := 0


func _initialize() -> void:
	scene = load("res://snow_walk.tscn").instantiate()
	root.add_child(scene)


func _process(_delta: float) -> bool:
	frames += 1
	if frames < 5:
		return false
	var surface: Node = scene.surface
	if turned_usec == 0:
		surface.turn_wind(1)
		turned_usec = Time.get_ticks_usec()
		return false
	if surface.wind_shaped_from() != surface.wind_from():
		return false
	turns += 1
	print("SHAPE_TIMING turn %d to %.0f°: worker %.0f ms, turn to landing %.0f ms" % [turns, surface.wind_from(),
		surface.wind.retarget_usec / 1000.0, (Time.get_ticks_usec() - turned_usec) / 1000.0])
	turned_usec = 0
	return turns >= 8

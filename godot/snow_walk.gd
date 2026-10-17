extends Node3D

const Surface = preload("res://snow_surface.gd")
const Walker = preload("res://walker.gd")
const TownLayout = preload("res://town_layout.gd")
const Inspection = preload("res://inspection.gd")
const InspectionRoute = preload("res://inspection_route.gd")
const FollowCamera = preload("res://follow_camera.gd")

var surface := Surface.new()
var walker := Walker.new()
var second_walker := Walker.new()
var town := TownLayout.new()
var active_figure := 0
var camera := FollowCamera.new()
var inspection := Inspection.new()
var focused := true
var headless_replay := false
@onready var blizzard: Node3D = $Blizzard


func _ready() -> void:
	headless_replay = DisplayServer.get_name() == "headless" and OS.get_cmdline_user_args().has("--headless-scene-check")
	_fit_window()
	add_child(town)
	add_child(surface)
	surface.configure_ground(town)
	walker.configure(surface, town, 1, TownLayout.LANDMARKS.start_west)
	second_walker.configure(surface, town, 2, TownLayout.LANDMARKS.start_east)
	add_child(walker)
	add_child(second_walker)
	# The figure you are not controlling walks the town loop, from its first corner.
	second_walker.rejoin_loop()
	add_child(camera)
	add_child(inspection)
	camera.follow(walker.untouched_position(), walker.sink_depth, 0.0)
	surface.centre_detail(Vector2(camera.focus.x, camera.focus.z))
	blizzard.attach(surface, camera, town)
	get_window().focus_entered.connect(func() -> void: focused = true)
	get_window().focus_exited.connect(func() -> void: focused = headless_replay)
	focused = headless_replay or get_window().has_focus()
	print("Snow Walk: Godot ", Engine.get_version_info().string, " · ", RenderingServer.get_current_rendering_method())
	print("%d × %d metres; %d × %d m detail region at the camera focus; WASD walk / Shift run / mouse Facing, bounded while walking / wheel zoom / M overview / Tab switch / [ ] turn wind; captures: " % [
		TownLayout.HALF_EXTENTS.x * 2.0, TownLayout.HALF_EXTENTS.y * 2.0, Surface.DETAIL_SIZE.x, Surface.DETAIL_SIZE.y], OS.get_user_data_dir())
	if OS.get_cmdline_user_args().has("--walk-scene-check") or OS.get_cmdline_user_args().has("--snow-scene-check"):
		add_child(InspectionRoute.new())


## The window opens at 2560 × 1440. Where the screen has no room for it, as on a
## 1080p display, it shrinks to the largest size of the same shape that fills nine
## tenths of the screen, centred.
func _fit_window() -> void:
	var window := get_window()
	if DisplayServer.get_name() == "headless" or window.mode != Window.MODE_WINDOWED:
		return
	var usable := DisplayServer.screen_get_usable_rect(window.current_screen)
	var room := Vector2(usable.size) * 0.9
	var size := Vector2(window.size)
	if size.x <= room.x and size.y <= room.y:
		return
	window.size = Vector2i(size * minf(room.x / size.x, room.y / size.y))
	window.position = usable.position + (usable.size - window.size) / 2


func _physics_process(delta: float) -> void:
	var controlled := _controlled()
	var idle := _uncontrolled()
	# The cursor is read through the view that was last drawn, where the Player saw it.
	if focused:
		camera.update_cursor(controlled.untouched_position())
		if camera.cursor_inside and camera.has_cursor_ground:
			controlled.face_toward(camera.cursor_ground)
	surface.advance(delta)
	controlled.walk(delta, camera.global_basis, focused)
	idle.walk_loop(delta)
	camera.follow(controlled.untouched_position(), controlled.sink_depth, delta)
	# The detail region follows what the camera shows. Its 5 cm grid is world-aligned,
	# so the figure's full-detail support is the same before and after it moves.
	surface.centre_detail(Vector2(camera.focus.x, camera.focus.z))
	inspection.observe(controlled, camera, surface, focused, idle)


func _controlled() -> Node3D:
	return walker if active_figure == 0 else second_walker


func _uncontrolled() -> Node3D:
	return second_walker if active_figure == 0 else walker


func _unhandled_input(event: InputEvent) -> void:
	if not focused:
		return
	if event is InputEventMouseMotion:
		camera.point_at(event.position)
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			camera.zoom_in()
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			camera.zoom_out()
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_TAB:
				active_figure = 1 - active_figure
				# The figure just released walks back to the loop from where it stands.
				_uncontrolled().rejoin_loop()
				# Frame the newly controlled figure at once, so it takes its Facing
				# from the cursor in the view that shows it.
				camera.follow(_controlled().untouched_position(), _controlled().sink_depth, 0.0)
				surface.centre_detail(Vector2(camera.focus.x, camera.focus.z))
			KEY_M:
				camera.toggle_overview()
			KEY_MINUS, KEY_KP_SUBTRACT:
				surface.wind_strength = maxf(0.0, surface.wind_strength - 1.0)
			KEY_EQUAL, KEY_KP_ADD:
				surface.wind_strength = minf(16.0, surface.wind_strength + 1.0)
			KEY_0:
				surface.wind_strength = 1.0
			KEY_BRACKETLEFT:
				surface.turn_wind(-1)
			KEY_BRACKETRIGHT:
				surface.turn_wind(1)
			KEY_F1:
				inspection.visible = not inspection.visible
			KEY_F4:
				inspection.mark_checkpoint()
			KEY_F5:
				inspection.add_probe(_controlled())
			KEY_F6:
				inspection.start_frame_recording()
			KEY_F8:
				inspection.toggle_recording()
			KEY_F9:
				inspection.capture()


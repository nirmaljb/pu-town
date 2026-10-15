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


func _ready() -> void:
	headless_replay = DisplayServer.get_name() == "headless" and OS.get_cmdline_user_args().has("--headless-scene-check")
	add_child(town)
	add_child(surface)
	surface.configure_ground(town)
	walker.configure(surface, town, 1, TownLayout.LANDMARKS.outpost_yard_west)
	second_walker.configure(surface, town, 2, TownLayout.LANDMARKS.outpost_yard_east)
	add_child(walker)
	add_child(second_walker)
	add_child(camera)
	add_child(inspection)
	camera.follow(walker.position, 0.0)
	_add_overcast_light()
	get_window().focus_entered.connect(func() -> void: focused = true)
	get_window().focus_exited.connect(func() -> void: focused = headless_replay)
	focused = headless_replay or get_window().has_focus()
	print("Snow Walk: Godot ", Engine.get_version_info().string, " · ", RenderingServer.get_current_rendering_method())
	print("%d × %d metres; 12.8 m moving detail; WASD walk / Shift run / mouse Facing / Tab switch; captures: " % [
		TownLayout.HALF_EXTENTS.x * 2.0, TownLayout.HALF_EXTENTS.y * 2.0], OS.get_user_data_dir())
	if OS.get_cmdline_user_args().has("--walk-scene-check") or OS.get_cmdline_user_args().has("--snow-scene-check"):
		add_child(InspectionRoute.new())


func _physics_process(delta: float) -> void:
	var controlled := _controlled()
	var idle := second_walker if active_figure == 0 else walker
	# The cursor is read through the view that was last drawn, where the Player saw it.
	if focused:
		camera.update_cursor(controlled.position)
		if camera.cursor_inside and camera.has_cursor_ground:
			controlled.face_toward(camera.cursor_ground)
	surface.advance(delta, Vector2(controlled.position.x, controlled.position.z))
	controlled.walk(delta, camera.global_basis, focused)
	idle.walk(delta, camera.global_basis, false)
	camera.follow(controlled.position, delta)
	inspection.observe(controlled, camera, surface, focused, idle)


func _controlled() -> Node3D:
	return walker if active_figure == 0 else second_walker


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
				# Frame the newly controlled figure at once, so it takes its Facing
				# from the cursor in the view that shows it.
				camera.follow(_controlled().position, 0.0)
			KEY_MINUS, KEY_KP_SUBTRACT:
				surface.wind_strength = maxf(0.0, surface.wind_strength - 1.0)
			KEY_EQUAL, KEY_KP_ADD:
				surface.wind_strength = minf(16.0, surface.wind_strength + 1.0)
			KEY_0:
				surface.wind_strength = 1.0
			KEY_F1:
				inspection.visible = not inspection.visible
			KEY_F4:
				inspection.mark_checkpoint()
			KEY_F5:
				inspection.mark_trail(_controlled(), surface)
			KEY_F6:
				inspection.start_frame_recording()
			KEY_F8:
				inspection.toggle_recording()
			KEY_F9:
				inspection.capture()


func _add_overcast_light() -> void:
	var environment := Environment.new()
	environment.background_mode = Environment.BG_COLOR
	# The retained image's blue-grey atmosphere and diffuse snow relationships
	# guide the rendered view; its sampled pixels are not material albedo values.
	environment.background_color = Color("828792")
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.ambient_light_color = Color("c0c4ce")
	environment.ambient_light_energy = 0.70
	environment.tonemap_mode = Environment.TONE_MAPPER_LINEAR
	var world := WorldEnvironment.new()
	world.environment = environment
	add_child(world)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-52, -35, 0)
	light.light_color = Color("dedee4")
	light.light_energy = 0.25
	light.shadow_enabled = true
	light.shadow_opacity = 0.75
	light.directional_shadow_max_distance = 160.0
	light.shadow_blur = 4.0
	add_child(light)

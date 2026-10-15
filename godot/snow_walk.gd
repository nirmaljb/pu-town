extends Node3D

const Surface = preload("res://snow_surface.gd")
const Walker = preload("res://walker.gd")
const TownLayout = preload("res://town_layout.gd")
const Inspection = preload("res://inspection.gd")
const InspectionRoute = preload("res://inspection_route.gd")
const EXPLORE_SIZE := 12.0
const MIN_SIZE := 3.5
const OVERVIEW_SIZE := 118.0

var surface := Surface.new()
var walker := Walker.new()
var second_walker := Walker.new()
var town := TownLayout.new()
var active_figure := 0
var camera := Camera3D.new()
var inspection := Inspection.new()
var zoom := EXPLORE_SIZE
var focused := true
var headless_replay := false


func _ready() -> void:
	headless_replay = DisplayServer.get_name() == "headless" and OS.get_cmdline_user_args().has("--headless-scene-check")
	add_child(town)
	add_child(surface)
	surface.configure_ground(town)
	surface.configure_obstacles(town.drift_obstacles)
	walker.configure(surface, town, 1, TownLayout.LANDMARKS.outpost_yard_west)
	second_walker.configure(surface, town, 2, TownLayout.LANDMARKS.outpost_yard_east)
	add_child(walker)
	add_child(second_walker)
	add_child(camera)
	add_child(inspection)
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.keep_aspect = Camera3D.KEEP_HEIGHT
	camera.size = zoom
	camera.near = 0.1
	camera.far = 250.0
	camera.rotation_degrees = Vector3(-55.0, 45.0, 0.0)
	camera.current = true
	_add_overcast_light()
	get_window().focus_entered.connect(func() -> void: focused = true)
	get_window().focus_exited.connect(func() -> void: focused = headless_replay)
	focused = headless_replay or get_window().has_focus()
	print("Snow Walk: Godot ", Engine.get_version_info().string, " · ", RenderingServer.get_current_rendering_method())
	print("%d × %d metres; 12.8 m moving detail; WASD walk / Shift run / Tab switch; captures: " % [
		TownLayout.HALF_EXTENTS.x * 2.0, TownLayout.HALF_EXTENTS.y * 2.0], OS.get_user_data_dir())
	if OS.get_cmdline_user_args().has("--walk-scene-check") or OS.get_cmdline_user_args().has("--snow-scene-check"):
		add_child(InspectionRoute.new())


func _physics_process(delta: float) -> void:
	var controlled := walker if active_figure == 0 else second_walker
	var idle := second_walker if active_figure == 0 else walker
	surface.advance(delta, Vector2(controlled.position.x, controlled.position.z))
	controlled.walk(delta, camera.global_basis, focused)
	idle.walk(delta, camera.global_basis, false)
	# Exploration follows feet. Zooming out smoothly recentres the full footprint.
	var overview_blend := smoothstep(40.0, OVERVIEW_SIZE, zoom)
	var target := controlled.position.lerp(Vector3(0, 0.4, 0), overview_blend)
	camera.position = target + camera.basis.z * 100.0
	var viewport_size := get_viewport().get_visible_rect().size
	var aspect := viewport_size.x / viewport_size.y
	# A narrow resized window still fits the turned map rectangle at overview zoom.
	var yaw := camera.rotation.y
	var map_across := 2.0 * (TownLayout.HALF_EXTENTS.x * absf(cos(yaw)) + TownLayout.HALF_EXTENTS.y * absf(sin(yaw)))
	var overview_scale := maxf(1.0, (map_across + 10.0) / (OVERVIEW_SIZE * aspect))
	camera.size = zoom * lerpf(1.0, overview_scale, overview_blend)
	inspection.observe(controlled, camera, surface, focused, idle)


func _unhandled_input(event: InputEvent) -> void:
	if not focused:
		return
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom = clampf(zoom / 1.15, MIN_SIZE, OVERVIEW_SIZE)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom = clampf(zoom * 1.15, MIN_SIZE, OVERVIEW_SIZE)
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_TAB:
				active_figure = 1 - active_figure
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
				inspection.mark_trail(walker if active_figure == 0 else second_walker, surface)
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

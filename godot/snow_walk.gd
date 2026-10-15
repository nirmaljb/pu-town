extends Node3D

const Surface = preload("res://snow_surface.gd")
const Walker = preload("res://walker.gd")
const Inspection = preload("res://inspection.gd")
const InspectionRoute = preload("res://inspection_route.gd")
const EXPLORE_SIZE := 18.0
const MIN_SIZE := 10.0
const OVERVIEW_SIZE := 118.0

var surface := Surface.new()
var walker := Walker.new()
var camera := Camera3D.new()
var inspection := Inspection.new()
var zoom := EXPLORE_SIZE
var focused := true


func _ready() -> void:
	add_child(surface)
	add_child(walker)
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
	get_window().focus_exited.connect(func() -> void: focused = false)
	print("Snow Walk: Godot ", Engine.get_version_info().string, " · ", RenderingServer.get_current_rendering_method())
	print("64 × 64 metres; 1.7 m figure; 2.25 m/s horizontal; captures/records: ", OS.get_user_data_dir())
	if OS.get_cmdline_user_args().has("--walk-scene-check"):
		add_child(InspectionRoute.new())


func _physics_process(delta: float) -> void:
	walker.walk(delta, camera.global_basis, focused)
	# Exploration follows feet. Zooming out smoothly recentres the full footprint.
	var overview_blend := smoothstep(40.0, OVERVIEW_SIZE, zoom)
	var target := walker.position.lerp(Vector3(0, 0.4, 0), overview_blend)
	camera.position = target + camera.basis.z * 100.0
	var viewport_size := get_viewport().get_visible_rect().size
	var aspect := viewport_size.x / viewport_size.y
	# A narrow resized window still fits the rotated square at overview zoom.
	var map_diagonal := Surface.HALF_EXTENT * 2.0 * sqrt(2.0)
	var overview_scale := maxf(1.0, (map_diagonal + 10.0) / (OVERVIEW_SIZE * aspect))
	camera.size = zoom * lerpf(1.0, overview_scale, overview_blend)
	inspection.observe(walker, camera, surface, focused)


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventMouseButton and event.pressed:
		if event.button_index == MOUSE_BUTTON_WHEEL_UP:
			zoom = clampf(zoom / 1.15, MIN_SIZE, OVERVIEW_SIZE)
		elif event.button_index == MOUSE_BUTTON_WHEEL_DOWN:
			zoom = clampf(zoom * 1.15, MIN_SIZE, OVERVIEW_SIZE)
	if event is InputEventKey and event.pressed and not event.echo:
		match event.physical_keycode:
			KEY_F1:
				inspection.visible = not inspection.visible
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

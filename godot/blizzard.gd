extends Node3D
## The blizzard's look: whiteout fog, falling and blowing snow, gusts, lightning and
## warm lamps against overcast polar twilight. It is visual only. Gusts never change
## the wind that shapes Snow Depth and fills Footprints, and fog never limits what a
## Player may see. Falling and blowing snow travel with that wind's direction.
##
## Tune it live in the editor: open blizzard.tscn, run the project and edit this node,
## SkyKey or WorldEnvironment in the Inspector; Ctrl+S keeps the values. This node
## owns the Environment's fog density, depth range and light energy, its background
## energy and SkyKey's shadow distance; every other Environment and SkyKey property
## is edited directly.

const TownLayout = preload("res://town_layout.gd")
const FollowCamera = preload("res://follow_camera.gd")

@export_group("Whiteout")
## Fog begins this far from the camera at play distance, about halfway to the
## figure 22.6 m away, so it takes an eighth of the figure, a third of the top
## edge 42 m away and a sixteenth of the bottom edge; every distance here scales
## with the camera's, so the overview is hazy but legible.
@export_range(0.0, 100.0, 0.5, "suffix:m") var fog_begin := 11.0
## Fog reaches its full amount this far from the camera at play distance.
@export_range(5.0, 300.0, 0.5, "suffix:m") var fog_end := 105.0
## How much of a distant view the fog replaces.
@export_range(0.0, 1.0, 0.01) var whiteout := 0.92
## Above one the fog thickens late; below one it thickens early.
@export_exp_easing var fog_curve := 1.0
@export_range(0.0, 4.0, 0.01) var fog_brightness := 1.0

@export_group("Shadows")
## SkyKey draws one shadow map from the camera out to this distance at play
## distance, scaled with the camera's like the fog. The view's far edge is about
## 42 m away, so splitting the map across a longer range only costs frame time.
@export_range(10.0, 400.0, 1.0, "suffix:m") var shadow_reach := 54.0

@export_group("Snowfall")
@export_range(0.0, 1.0, 0.01) var snowfall := 0.7
@export_range(0.005, 0.3, 0.005, "suffix:m") var flake_size := 0.045
@export_range(0.1, 6.0, 0.05, "suffix:m/s") var fall_speed := 1.3
## Horizontal speed the wind gives a falling flake between gusts.
@export_range(0.0, 15.0, 0.1, "suffix:m/s") var drift := 2.6

@export_group("Blowing snow")
@export_range(0.0, 1.0, 0.01) var blowing_snow := 0.55
@export_range(0.5, 20.0, 0.1, "suffix:m/s") var blowing_speed := 6.5
@export_range(0.0, 1.0, 0.01) var blowing_opacity := 0.35

@export_group("Gusts")
@export var gusts := true
@export_range(1.0, 60.0, 0.5, "suffix:s") var gust_every_min := 7.0
@export_range(1.0, 60.0, 0.5, "suffix:s") var gust_every_max := 16.0
@export_range(0.5, 10.0, 0.1, "suffix:s") var gust_length := 3.0
## At a gust's height, falling and blowing snow move this much faster, as a share
## of their speed, and the whiteout closes in by a quarter of it, at most 60 %.
@export_range(0.0, 4.0, 0.05) var gust_strength := 1.4

@export_group("Lightning")
@export var lightning := true
@export_range(2.0, 600.0, 1.0, "suffix:s") var lightning_every_min := 45.0
@export_range(2.0, 600.0, 1.0, "suffix:s") var lightning_every_max := 120.0
@export_range(0.0, 10.0, 0.05) var lightning_brightness := 2.2

@export_group("Warm lights")
@export var warm_colour := Color("ffad66")
@export_range(0.0, 16.0, 0.05) var warm_energy := 2.2
@export_range(0.5, 30.0, 0.1, "suffix:m") var warm_range := 7.0
@export_range(0.0, 16.0, 0.05) var lamp_glow := 4.0

@export_group("")
## Gusts and lightning follow this seed, so a fixed-frame capture repeats.
@export var random_seed := 91

@onready var _world: WorldEnvironment = $WorldEnvironment
@onready var _sky_key: DirectionalLight3D = $SkyKey
@onready var _flash: DirectionalLight3D = $LightningFlash
@onready var _snowfall: GPUParticles3D = $Snowfall
@onready var _blowing: GPUParticles3D = $BlowingSnow
@onready var _warm_root: Node3D = $WarmLights

var gust := 0.0
var flash := 0.0
var _surface: Node
var _camera: FollowCamera
var _rng := RandomNumberGenerator.new()
var _next_gust := 0.0
var _gust_age := -1.0
var _next_flash := 0.0
var _flash_age := -1.0
var _toward_sun := Vector3.ZERO
var _lamp_material := StandardMaterial3D.new()


## Follow `camera` and the wind of `surface`, and hang the lamps in `town`.
func attach(surface: Node, camera: FollowCamera, town: Node) -> void:
	_surface = surface
	_camera = camera
	_rng.seed = random_seed
	_next_gust = _rng.randf_range(gust_every_min, gust_every_max)
	_next_flash = _rng.randf_range(lightning_every_min, lightning_every_max)
	# Scene routes and their captures stay comparable without a random flash.
	var arguments := OS.get_cmdline_user_args()
	if arguments.has("--walk-scene-check") or arguments.has("--snow-scene-check") or arguments.has("--headless-scene-check"):
		lightning = false
	_lamp_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_lamp_material.emission_enabled = true
	var lamp := BoxMesh.new()
	lamp.size = Vector3(0.3, 0.4, 0.3)
	lamp.material = _lamp_material
	for name in TownLayout.WARM_LIGHTS:
		var spot: Vector3 = TownLayout.WARM_LIGHTS[name]
		var at := Vector3(spot.x, town.ground_height(Vector2(spot.x, spot.z)) + spot.y, spot.z)
		var light := OmniLight3D.new()
		light.name = name.capitalize().replace(" ", "")
		light.position = at
		light.shadow_enabled = false
		light.omni_attenuation = 1.6
		_warm_root.add_child(light)
		var marker := MeshInstance3D.new()
		marker.mesh = lamp
		marker.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		light.add_child(marker)
	_process(0.0)


func _process(delta: float) -> void:
	if _camera == null:
		return
	_advance_gust(delta)
	_advance_lightning(delta)
	var reach := _camera.current_distance() / FollowCamera.PLAY_DISTANCE
	var closing := 1.0 - minf(0.6, 0.25 * gust_strength * gust)
	var environment := _world.environment
	environment.fog_density = whiteout
	environment.fog_depth_curve = fog_curve
	environment.fog_depth_begin = fog_begin * reach * closing
	environment.fog_depth_end = maxf(environment.fog_depth_begin + 1.0, fog_end * reach * closing)
	environment.fog_light_energy = fog_brightness * (1.0 + 0.45 * flash * lightning_brightness)
	environment.background_energy_multiplier = 1.0 + 0.45 * flash * lightning_brightness
	_sky_key.directional_shadow_max_distance = shadow_reach * reach
	_flash.light_energy = flash * lightning_brightness
	_flash.visible = flash > 0.0
	_place_snow(reach)
	_light_lamps()
	# Footprints shade their own shadows toward SkyKey; follow it as it is edited.
	var toward_sun := _sky_key.global_basis.z.normalized()
	if not toward_sun.is_equal_approx(_toward_sun):
		_toward_sun = toward_sun
		_surface.set_sun_direction(toward_sun)


## Where the wind blows toward, on the ground: north is −Z and east +X.
func _downwind() -> Vector2:
	var from: float = deg_to_rad(_surface.wind_from())
	return Vector2(-sin(from), cos(from))


func _place_snow(reach: float) -> void:
	var focus: Vector3 = _camera.focus
	var downwind := _downwind()
	var push := 1.0 + gust_strength * gust
	# Falling snow fills a box from the ground to a little below the camera around
	# the focus; a flake at the lens would cover the view.
	var height := maxf(3.0, _camera.global_position.y - focus.y - 5.0 * sqrt(reach))
	_snowfall.global_position = Vector3(focus.x, focus.y + height * 0.5, focus.z + 2.0 * reach)
	var falling: ParticleProcessMaterial = _snowfall.process_material
	falling.emission_box_extents = Vector3(20.0 * reach, height * 0.5, 15.0 * reach)
	var travel := Vector3(downwind.x * drift, -fall_speed, downwind.y * drift)
	falling.direction = travel.normalized()
	falling.initial_velocity_min = travel.length() * 0.85
	falling.initial_velocity_max = travel.length() * 1.15
	# A gust pushes every flake at once; its initial velocity reaches new ones only.
	falling.gravity = Vector3(downwind.x, 0.0, downwind.y) * drift * (push - 1.0) * 1.5
	# Flakes grow more slowly than the view, so the overview stays legible.
	falling.scale_min = flake_size * sqrt(reach) * 0.6
	falling.scale_max = flake_size * sqrt(reach) * 1.6
	_snowfall.amount_ratio = snowfall
	_snowfall.speed_scale = 1.0
	# Blowing snow streams along the ground just above the snow.
	_blowing.global_position = Vector3(focus.x, focus.y + 0.6, focus.z)
	var blowing: ParticleProcessMaterial = _blowing.process_material
	blowing.emission_box_extents = Vector3(18.0 * reach, 0.5, 13.0 * reach)
	blowing.direction = Vector3(downwind.x, 0.04, downwind.y)
	blowing.initial_velocity_min = blowing_speed * 0.7
	blowing.initial_velocity_max = blowing_speed * 1.2
	blowing.gravity = Vector3(downwind.x, 0.0, downwind.y) * blowing_speed * (push - 1.0)
	_blowing.amount_ratio = clampf(blowing_snow * (0.55 + 0.45 * push), 0.0, 1.0)
	var wisps: StandardMaterial3D = (_blowing.draw_pass_1 as QuadMesh).material
	wisps.albedo_color.a = blowing_opacity


func _light_lamps() -> void:
	_lamp_material.albedo_color = warm_colour
	_lamp_material.emission = warm_colour
	_lamp_material.emission_energy_multiplier = lamp_glow
	for light in _warm_root.get_children():
		light.light_color = warm_colour
		light.light_energy = warm_energy
		light.omni_range = warm_range


## A gust rises, holds and falls over gust_length; between gusts the air is steady.
func _advance_gust(delta: float) -> void:
	if _gust_age < 0.0:
		gust = 0.0
		_next_gust -= delta
		if gusts and _next_gust <= 0.0:
			_gust_age = 0.0
		return
	_gust_age += delta
	var t := _gust_age / gust_length
	if t >= 1.0 or not gusts:
		_gust_age = -1.0
		_next_gust = _rng.randf_range(gust_every_min, maxf(gust_every_min, gust_every_max))
		gust = 0.0
		return
	gust = sin(PI * t) ** 0.7


## A diffuse flash lights the whole sky twice, the second flicker the brighter.
func _advance_lightning(delta: float) -> void:
	if _flash_age < 0.0:
		flash = 0.0
		_next_flash -= delta
		if lightning and _next_flash <= 0.0:
			_flash_age = 0.0
		return
	_flash_age += delta
	var age := _flash_age
	flash = 0.0
	if age < 0.09:
		flash = 0.55 * (1.0 - age / 0.09)
	elif age >= 0.16 and age < 0.5:
		flash = exp(-(age - 0.16) * 9.0)
	if age >= 0.5:
		_flash_age = -1.0
		_next_flash = _rng.randf_range(lightning_every_min, maxf(lightning_every_min, lightning_every_max))

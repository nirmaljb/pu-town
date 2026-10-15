extends Node3D
## Horizontal obstacles and changing snow support are separate: roofs are never ground.
## Speed is horizontal, so the stair's slope never changes it.
## The figure is the parka Avatar; its steps, Footprints and clips share one gait.
## Facing turns the upper body. Legs, boots and Footprints keep the direction of
## travel; standing still, the legs pivot after the upper body without stepping.
## The cursor sets the bearing the figure wants to look along. Walking, Facing
## turns at a bounded rate and stops at a limit over the shoulder it last used.
## The figure you are not controlling walks the town loop with these same rules.

const Avatar = preload("res://parka_avatar.gd")
const TownLayout = preload("res://town_layout.gd")
const WALK_SPEED := 2.25
const RUN_SPEED := 4.5
const HEIGHT := 1.7
const FOOTPRINT_RADIUS := 0.3
const LIMIT := TownLayout.HALF_EXTENTS - Vector2.ONE * FOOTPRINT_RADIUS
## A point closer than this to the figure gives no Facing, so Facing holds.
const FACING_DEAD_ZONE := 0.25
## Standing still, the legs turn so the upper body twists no further than this.
const STANDING_TWIST := PI / 3.0
## Walking, the upper body twists no further than 110° from travel. Beyond it the
## figure holds the shoulder it last looked over, never swinging through its back.
const WALKING_TWIST := PI * 11.0 / 18.0
## Facing turns no faster than 540° per second while it is walking or catching up.
const FACING_TURN_RATE := PI * 3.0
## A loop walker this close to its next point has reached it. Each frame's motion
## stops at that point, so it walks the loop's straight lines exactly.
const LOOP_ARRIVAL := 0.0001

var figure_id := 1
var direction := Vector2.ZERO
var horizontal_speed := 0.0
var contact_gap := 0.0
var grounded := false
var distance_walked := 0.0
var boundary_limited := false
var obstacle_limited := false
var run_requested := false
var snow_depth := 0.0
var saved_depth := 0.0
var ground_height := 0.0
var loose_depth := 0.0
var foot_compaction := 0.0
var sink_depth := 0.0
var step_count := 0
var last_footprint := Vector2.ZERO
var has_footprint := false
## Yaws about +Y, zero facing north (−Z): Facing, the latest travel and the latest bootprint.
var facing_yaw := 0.0
var travel_yaw := 0.0
var print_yaw := 0.0
## The upper body's turn from the legs, Facing minus their direction.
var twist := 0.0
## Fraction of the loop's length where the loop walker is; while it rejoins, where it will join.
var loop_progress := 0.0
var rejoining := false
var stance := Node3D.new()
var avatar := Avatar.new()
var surface: Node3D
var layout: Node3D
var _feet: Array[Vector2] = []
var _step_progress := 0.0
var _step_length: float = avatar.gait.walk.step_m
var _landed_side := 1
var _heading := 0.0
var _moving := false
var _run_amount := 0.0
var _rejoin_point := Vector2.ZERO
var _loop_corner := 0
## The bearing the cursor asks for, as a yaw.
var _wanted_yaw := 0.0
## While walking, the side of travel (+1 or −1 in yaw) Facing last looked to; 0 when unset.
var _held_side := 0.0
## Standing still, Facing follows the wanted yaw exactly once it has reached it.
var _tracking := true


func configure(snow: Node3D, town: Node3D, identity: int, spawn: Vector2) -> void:
	surface = snow
	layout = town
	figure_id = identity
	position = Vector3(spawn.x, 0, spawn.y)
	var lateral: float = avatar.gait.boot_lateral_m
	_feet = [spawn + Vector2(-lateral, 0), spawn + Vector2(lateral, 0)]
	# Prime the first footfall once; pauses must not discard travelled distance.
	_step_progress = _step_length - 0.12


func _ready() -> void:
	add_child(stance)
	stance.add_child(avatar)
	# These stand in for Player Colours, which the gloves carry.
	avatar.tint_accent(Color("b36d43") if figure_id == 1 else Color("657d85"))
	_update_pose()


## Want to look toward a world point on the ground. Facing turns toward it as the
## figure walks or stands.
func face_toward(point: Vector2) -> void:
	var offset := point - Vector2(position.x, position.z)
	if offset.length() > FACING_DEAD_ZONE:
		_wanted_yaw = atan2(-offset.x, -offset.y)


func walk(delta: float, camera_basis: Basis, controlled: bool) -> void:
	direction = Vector2.ZERO
	run_requested = controlled and Input.is_physical_key_pressed(KEY_SHIFT)
	if controlled:
		direction = Vector2(
			float(Input.is_physical_key_pressed(KEY_D)) - float(Input.is_physical_key_pressed(KEY_A)),
			float(Input.is_physical_key_pressed(KEY_S)) - float(Input.is_physical_key_pressed(KEY_W))
		).limit_length()
	var right := Vector3(camera_basis.x.x, 0, camera_basis.x.z).normalized()
	var back := Vector3(camera_basis.z.x, 0, camera_basis.z.z).normalized()
	var travel := right * direction.x + back * direction.y
	_move(delta, Vector2(travel.x, travel.z))


## Set off for the loop from where the figure stands. It walks straight to the
## nearest loop point in reach, then on around the loop.
func rejoin_loop() -> void:
	var entry: Dictionary = layout.loop_entry(Vector2(position.x, position.z), FOOTPRINT_RADIUS)
	_rejoin_point = entry.point
	_loop_corner = entry.corner
	loop_progress = entry.progress
	rejoining = true


## Walk the town loop unattended: always requesting a run, so it runs where the
## snow allows, facing the way it travels. It moves, collides and slides exactly
## as the controlled figure does.
func walk_loop(delta: float) -> void:
	run_requested = true
	var here := Vector2(position.x, position.z)
	var goal := _loop_goal()
	if here.distance_to(goal) < LOOP_ARRIVAL:
		_arrive()
		goal = _loop_goal()
	var offset := goal - here
	direction = offset.normalized()
	_move(delta, direction, offset.length(), true)
	here = Vector2(position.x, position.z)
	if here.distance_to(goal) < LOOP_ARRIVAL:
		_arrive()
	if not rejoining:
		loop_progress = layout.loop_progress(_loop_corner, here)


func _loop_goal() -> Vector2:
	return _rejoin_point if rejoining else layout.loop_corners[_loop_corner]


func _arrive() -> void:
	if rejoining:
		rejoining = false
	else:
		_loop_corner = (_loop_corner + 1) % layout.loop_corners.size()


## Move along a horizontal world direction of at most unit length, no further than
## `reach`, at the speed the loose snow allows.
func _move(delta: float, travel: Vector2, reach: float = INF, face_travel: bool = false) -> void:
	var here := Vector2(position.x, position.z)
	loose_depth = surface.sample_loose_depth(here)
	var allowance := 1.0 - smoothstep(0.10, 0.40, loose_depth)
	var speed := lerpf(WALK_SPEED, RUN_SPEED, allowance) if run_requested else WALK_SPEED
	var motion := (travel * speed * delta).limit_length(reach)
	var desired := here + motion
	var bounded := desired.clamp(-LIMIT, LIMIT)
	boundary_limited = not bounded.is_equal_approx(desired)
	var target: Vector2 = layout.move_with_collisions(here, bounded, FOOTPRINT_RADIUS)
	obstacle_limited = target.distance_to(bounded) > 0.0001
	var movement := target - here
	var travelled := movement.length()
	position.x = target.x
	position.z = target.y
	horizontal_speed = travelled / maxf(delta, 0.000001)
	distance_walked += travelled
	_moving = travelled > 0.00001
	if _moving:
		_heading = atan2(-movement.x, -movement.y)
		travel_yaw = _heading
		if face_travel:
			_look_along(_heading)
		else:
			_turn_walking(delta)
		_run_amount = clampf((horizontal_speed - WALK_SPEED) / (RUN_SPEED - WALK_SPEED), 0, 1)
		_step_length = lerpf(avatar.gait.walk.step_m, avatar.gait.run.step_m, _run_amount)
		_step_progress += travelled
		while _step_progress >= _step_length:
			_step_progress -= _step_length
			_land_step(target)
	else:
		if not face_travel:
			_turn_standing(delta)
		var standing_twist := wrapf(facing_yaw - _heading, -PI, PI)
		_heading = facing_yaw - clampf(standing_twist, -STANDING_TWIST, STANDING_TWIST)
	stance.rotation.y = _heading
	_update_pose(delta)


## Look the way the figure travels, as the loop walker does. When it is next
## controlled while standing, it takes its Facing from the cursor at once.
func _look_along(yaw: float) -> void:
	facing_yaw = yaw
	_wanted_yaw = yaw
	_held_side = 0.0
	_tracking = true


## Walking: turn toward the wanted bearing, but no further than WALKING_TWIST from
## travel. Beyond that, hold the last shoulder; the twist moves only between the
## limits, so a change of shoulder always turns through the front.
func _turn_walking(delta: float) -> void:
	_tracking = false
	var wanted := wrapf(_wanted_yaw - _heading, -PI, PI)
	var target := wanted
	if absf(wanted) <= WALKING_TWIST:
		if wanted != 0.0:
			_held_side = signf(wanted)
	else:
		if _held_side == 0.0:
			_held_side = signf(wanted)
		target = _held_side * WALKING_TWIST
	var current := wrapf(facing_yaw - _heading, -PI, PI)
	var limit := FACING_TURN_RATE * delta
	facing_yaw = wrapf(facing_yaw + clampf(target - current, -limit, limit), -PI, PI)


## Standing still: track the wanted bearing exactly, after first catching up with
## it at the walking turn rate if Facing was left away from it.
func _turn_standing(delta: float) -> void:
	_held_side = 0.0
	var remaining := wrapf(_wanted_yaw - facing_yaw, -PI, PI)
	var limit := FACING_TURN_RATE * delta
	if _tracking or absf(remaining) <= limit:
		facing_yaw = _wanted_yaw
		_tracking = true
	else:
		facing_yaw = wrapf(facing_yaw + signf(remaining) * limit, -PI, PI)


func _land_step(centre: Vector2) -> void:
	_landed_side = 1 - _landed_side
	var lateral := Vector2(cos(_heading), -sin(_heading))
	var forward := Vector2(-sin(_heading), -cos(_heading))
	var sign_side := -1.0 if _landed_side == 0 else 1.0
	var point := centre + lateral * sign_side * float(avatar.gait.boot_lateral_m) + forward * _landing_ahead()
	if not layout.point_clear(point, 0.08):
		point = centre + lateral * sign_side * 0.08
	if not layout.point_clear(point, 0.04):
		return
	surface.stamp_foot(point, _heading, 0.32)
	print_yaw = _heading
	_feet[_landed_side] = point
	last_footprint = point
	has_footprint = true
	step_count += 1


func _update_pose(delta: float = 1.0 / 60.0) -> void:
	if surface == null or _feet.size() != 2:
		return
	var centre := Vector2(position.x, position.z)
	var lateral := Vector2(cos(_heading), -sin(_heading))
	var forward := Vector2(-sin(_heading), -cos(_heading))
	var fraction := clampf(_step_progress / _step_length, 0.0, 1.0)
	var swing := 1 - _landed_side
	var foot_points: Array[Vector2] = [_feet[0], _feet[1]]
	# The body rests between the planted Footprint and the swinging boot's next one.
	var sign_side := -1.0 if swing == 0 else 1.0
	var boot_lateral: float = avatar.gait.boot_lateral_m
	var destination := centre + lateral * sign_side * boot_lateral + forward * _landing_ahead()
	foot_points[swing] = _feet[swing].lerp(destination, smoothstep(0.0, 1.0, fraction))
	for index in range(2):
		if foot_points[index].distance_to(centre) > 0.65:
			foot_points[index] = centre + lateral * (-boot_lateral if index == 0 else boot_lateral)
			_feet[index] = foot_points[index]
	var supports := Vector2(surface.sample_height(foot_points[0]), surface.sample_height(foot_points[1]))
	position.y = (supports.x + supports.y) * 0.5
	ground_height = surface.sample_ground(centre)
	snow_depth = surface.sample_height(centre) - ground_height
	saved_depth = surface.sample_saved_depth(centre)
	foot_compaction = surface.sample_compaction(last_footprint) if has_footprint else 0.0
	sink_depth = maxf(0.0, (surface.sample_uncompressed_height(foot_points[0]) + surface.sample_uncompressed_height(foot_points[1])) * 0.5 - position.y)
	grounded = layout.point_clear(centre, FOOTPRINT_RADIUS - 0.001)
	# One cycle is two steps: the left boot (index 0) lands at phase 0, the right at 0.5.
	var phase := 0.5 * _landed_side + 0.5 * fraction
	avatar.animate(phase, _run_amount, _moving, delta)
	twist = wrapf(facing_yaw - _heading, -PI, PI)
	avatar.twist(twist)
	var support := func(point: Vector2) -> float: return surface.sample_height(point)
	contact_gap = avatar.ground(support, position.y, avatar.planted(phase, _run_amount))


func _landing_ahead() -> float:
	return lerpf(avatar.gait.walk.landing_ahead_m, avatar.gait.run.landing_ahead_m, _run_amount)

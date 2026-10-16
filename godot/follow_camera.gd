extends Camera3D
## A north-up perspective camera that follows the controlled figure. Its yaw never
## changes. Like the owner's reference frames, it looks down at 40° through a wide
## 40° lens, so the figure's body and the sides of boxes show, and by default the
## figure stands about a twelfth of the screen tall. Its focus leans toward the
## cursor's point on the ground, and the wheel zooms through the play range, from
## the figure an eighth of the screen tall to a sixteenth, or out to a whole-map
## overview of the town, which M also opens and closes. It frames the untouched
## snow where the figure stands and takes only a softened share of each step's sink
## into it, so the view settles gently at a footfall instead of jolting with it.

const TownLayout = preload("res://town_layout.gd")
const Walker = preload("res://walker.gd")
const FIELD_OF_VIEW := 40.0
const PITCH := -40.0
## The share of the screen's height the figure stands at by default and at either
## end of the wheel's play range; the distances below follow from them.
const PLAY_SHARE := 1.0 / 12.0
const CLOSEST_SHARE := 1.0 / 8.0
const WIDEST_SHARE := 1.0 / 16.0
static var PLAY_DISTANCE := distance_for_share(PLAY_SHARE)
static var MIN_DISTANCE := distance_for_share(CLOSEST_SHARE)
static var MAX_DISTANCE := distance_for_share(WIDEST_SHARE)
const ZOOM_STEP := 1.15
const MAX_LEAN := 3.0
## The focus leans by this share of the cursor's offset from the figure. Below one,
## the lean converges while the cursor holds still on screen.
const LEAN_SHARE := 0.25
const LEAN_RATE := 6.0
## The focus sits this share of the distance north of the figure, so the figure's
## feet stand slightly below the centre of the screen at every play distance.
const FRAMING_SHARE := 0.034
## The overview frames the map rectangle with this margin, from the forest floor
## to the top of the cliff rock.
const OVERVIEW_MARGIN := 3.0
const OVERVIEW_HEIGHTS := Vector2(TownLayout.FOREST_GROUND, TownLayout.SHELF_GROUND + 2.0)
## The camera takes this share of how far the figure has sunk below the untouched
## snow, so each step reads as a small settle.
const SINK_SHARE := 0.2
## That share eases toward each new sink with this time constant, in seconds.
const SINK_SETTLE := 0.2

var distance := PLAY_DISTANCE
var overview := false
var lean := Vector2.ZERO
var focus := Vector3.ZERO
var cursor_inside := false
var cursor_screen := Vector2.ZERO
var has_cursor_ground := false
var cursor_ground := Vector2.ZERO
var _cursor_offset := Vector2.ZERO
var _sink := 0.0


func _ready() -> void:
	projection = PROJECTION_PERSPECTIVE
	keep_aspect = KEEP_HEIGHT
	fov = FIELD_OF_VIEW
	# The camera stands at least 15 m from its focus and a couple of hundred metres
	# off in the overview, so a deeper near plane keeps depth precision.
	near = 1.0
	far = 1000.0
	rotation_degrees = Vector3(PITCH, 0.0, 0.0)
	current = true
	get_window().mouse_exited.connect(func() -> void: cursor_inside = false)


func zoom_in() -> void:
	if overview:
		overview = false
		distance = MAX_DISTANCE
	else:
		distance = maxf(MIN_DISTANCE, distance / ZOOM_STEP)


## Out from the overview there is nothing further, and the play distance it
## returns to stays as the Player left it.
func zoom_out() -> void:
	if overview:
		return
	if distance >= MAX_DISTANCE - 0.001:
		overview = true
	else:
		distance = minf(MAX_DISTANCE, distance * ZOOM_STEP)


## Open the overview, or return from it to the play distance the Player left.
func toggle_overview() -> void:
	overview = not overview


## The distance from its focus at which an upright figure standing there fills
## `share` of the screen's height: its head is nearer the camera than its feet by
## the height's share along the view.
static func distance_for_share(share: float) -> float:
	var pitch := deg_to_rad(-PITCH)
	return Walker.HEIGHT * (sin(pitch) + cos(pitch) / (2.0 * tan(deg_to_rad(FIELD_OF_VIEW) * 0.5) * share))


func current_distance() -> float:
	return _overview_distance() if overview else distance


func point_at(screen: Vector2) -> void:
	cursor_screen = screen
	cursor_inside = true


## Find the cursor's point on the horizontal plane through `figure`, given at the
## height of the untouched snow, so a footfall never moves it. While the cursor is
## outside the window the last point holds.
func update_cursor(figure: Vector3) -> void:
	if not cursor_inside:
		return
	var origin := project_ray_origin(cursor_screen)
	var ray := project_ray_normal(cursor_screen)
	if ray.y > -0.0001:
		return
	var hit := origin + ray * ((figure.y - origin.y) / ray.y)
	cursor_ground = Vector2(hit.x, hit.z)
	# The lean follows the offset the Player saw, before the figure moves this frame.
	_cursor_offset = cursor_ground - Vector2(figure.x, figure.z)
	has_cursor_ground = true


## Frame a figure at `figure`, given at the height of the untouched snow, that has
## sunk `sink` below it. A zero `delta` moves straight to the new figure, as after Tab.
func follow(figure: Vector3, sink: float, delta: float) -> void:
	_sink = sink if delta <= 0.0 else lerpf(_sink, sink, 1.0 - exp(-delta / SINK_SETTLE))
	var framed := figure - Vector3(0.0, SINK_SHARE * _sink, 0.0)
	var target_lean := lean
	if overview:
		target_lean = Vector2.ZERO
	elif cursor_inside and has_cursor_ground:
		target_lean = (_cursor_offset * LEAN_SHARE).limit_length(MAX_LEAN)
	lean = lean.lerp(target_lean, 1.0 - exp(-LEAN_RATE * delta)).limit_length(MAX_LEAN)
	if overview:
		focus = Vector3(0.0, (OVERVIEW_HEIGHTS.x + OVERVIEW_HEIGHTS.y) * 0.5, 0.0)
		position = focus + basis.z * _overview_distance()
	else:
		focus = framed + Vector3(lean.x, 0.0, lean.y - distance * FRAMING_SHARE)
		position = focus + basis.z * distance


## The nearest distance from the map centre at which every corner of the map
## rectangle, at both ground levels, lies inside the view.
func _overview_distance() -> float:
	var viewport_size := get_viewport().get_visible_rect().size
	var tan_vertical := tan(deg_to_rad(fov) * 0.5)
	var tan_horizontal := tan_vertical * viewport_size.x / viewport_size.y
	var centre := Vector3(0.0, (OVERVIEW_HEIGHTS.x + OVERVIEW_HEIGHTS.y) * 0.5, 0.0)
	var edge := TownLayout.HALF_EXTENTS + Vector2.ONE * OVERVIEW_MARGIN
	var to_view := basis.inverse()
	var needed := 0.0
	for x in [-edge.x, edge.x]:
		for z in [-edge.y, edge.y]:
			for y in [OVERVIEW_HEIGHTS.x, OVERVIEW_HEIGHTS.y]:
				var local := to_view * (Vector3(x, y, z) - centre)
				needed = maxf(needed, local.z + maxf(absf(local.x) / tan_horizontal, absf(local.y) / tan_vertical))
	return needed

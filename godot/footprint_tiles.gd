extends RefCounted
## The Footprint picture, held only where steps have landed: world-anchored tiles of
## 256 × 128 texels in rows from the map's north-west corner, each created blank when
## a step first presses it and freed once wind has filled every print in it. A sole
## spans at most 0.36 m, less than a tile either way, so one footstep touches at most
## 2 × 2 tiles. SnowSurface decides what each texel holds; this keeps the tiles, their
## GPU copy and when each may be freed.
##
## The GPU copy is a texture array with a layer for each tile, and a picture with a
## texel for each tile of the map holding the layer that holds it, or -1, through
## which the shader reads the array. A texture array cannot change size in place, so
## when a new tile finds no spare layer the array doubles, and once a quarter or
## fewer of its layers are in use it halves; either way every allocated tile is
## packed into the lowest layers and every layer is sent once. It never grows past
## a layer for every tile of the map, and never shrinks below FIRST_GPU_LAYERS.

const TILE_SIZE := Vector2i(256, 128)
const TILE_BYTES := TILE_SIZE.x * TILE_SIZE.y * 4
const FIRST_GPU_LAYERS := 8
## Allocated tiles checked against the fill clocks they await in one physics frame.
const TILES_CHECKED_PER_FRAME := 4

## Tiles allocated now, and in total created and freed.
var tiles := 0
var created := 0
var freed := 0
## Layers of the GPU copy, and the bytes sent in all rebuilding it at a new size.
var gpu_layers := 0
var gpu_rebuild_bytes := 0
var texture := Texture2DArray.new()
## The picture of each tile's GPU layer, as the shader reads it.
var layer_texture: ImageTexture
var _grid := Vector2i.ZERO
## Each tile's picture by its index in rows from the map's north-west corner, null
## where none is allocated, and the GPU layer holding it, -1 where none.
var _pictures: Array[Image] = []
var _layer_of_tile := PackedInt32Array()
## The same layers as layer_texture's picture, rewritten whenever they change.
var _layer_picture: Image
var _layers_changed := false
var _spare_layers := PackedInt32Array()
var _blank: Image
## For each allocated tile, the fill-clock value each Snow Depth node round its prints
## must reach, by node index: once every one has, every print in it has filled.
var _fills_awaited := {}
## Allocated tiles still to be checked since the fill clocks last moved on.
var _unchecked := PackedInt32Array()
var _checked_at := -1.0
var _dirty := {}


func _init(picture_size: Vector2i) -> void:
	_grid = (picture_size + TILE_SIZE - Vector2i.ONE) / TILE_SIZE
	_pictures.resize(_grid.x * _grid.y)
	_layer_of_tile.resize(_pictures.size())
	_layer_of_tile.fill(-1)
	_blank = Image.create_empty(TILE_SIZE.x, TILE_SIZE.y, false, Image.FORMAT_RGBA8)
	_blank.fill(Color(0, 0, 0, 0))
	_layer_picture = Image.create_empty(_grid.x, _grid.y, false, Image.FORMAT_RF)
	_layer_picture.fill(Color(-1, 0, 0))
	layer_texture = ImageTexture.create_from_image(_layer_picture)
	_rebuild_gpu_copy(FIRST_GPU_LAYERS)


func bytes() -> int:
	return tiles * TILE_BYTES


func gpu_bytes() -> int:
	return gpu_layers * TILE_BYTES


## One texel of the picture; blank where no tile is allocated.
func texel(pixel: Vector2i) -> Color:
	var picture := _pictures[_tile(pixel)]
	return picture.get_pixel(pixel.x % TILE_SIZE.x, pixel.y % TILE_SIZE.y) if picture else Color(0, 0, 0, 0)


## Whether a tile is allocated where this texel lies.
func holds(pixel: Vector2i) -> bool:
	return _pictures[_tile(pixel)] != null


## Write one texel, allocating its tile if it has none. Returns the tile.
func press(pixel: Vector2i, value: Color) -> int:
	var tile := _tile(pixel)
	if _pictures[tile] == null:
		_create(tile)
	_pictures[tile].set_pixel(pixel.x % TILE_SIZE.x, pixel.y % TILE_SIZE.y, value)
	_dirty[tile] = true
	return tile


## The prints just pressed in these tiles have filled once the fill clock at each of
## these nodes has reached `until`.
func await_fill(pressed: Dictionary, nodes: PackedInt32Array, until: float) -> void:
	for tile in pressed:
		var awaited: Dictionary = _fills_awaited[tile]
		for node in nodes:
			awaited[node] = maxf(awaited.get(node, 0.0), until)


## The fill clocks have moved on: check every allocated tile again, a few in each
## physics frame, unless a check is still going round them.
func fill_clocks_moved(wind_elapsed: float) -> void:
	if _unchecked.is_empty() and wind_elapsed > _checked_at:
		_unchecked = PackedInt32Array(_fills_awaited.keys())
		_checked_at = wind_elapsed


## Check the next few tiles against the fill clocks they await, forgetting every
## node whose clock has arrived, and free each tile with none left to await.
func free_filled(fill: PackedFloat32Array) -> void:
	for count in range(mini(TILES_CHECKED_PER_FRAME, _unchecked.size())):
		var tile := _unchecked[_unchecked.size() - 1]
		_unchecked.resize(_unchecked.size() - 1)
		if not _fills_awaited.has(tile):
			continue
		var awaited: Dictionary = _fills_awaited[tile]
		for node in awaited.keys():
			if fill[node] >= awaited[node]:
				awaited.erase(node)
		if awaited.is_empty():
			_free(tile)


## Free every tile, as when the fill clocks restart.
func clear() -> void:
	for tile in _fills_awaited.keys():
		_free(tile)
	_checked_at = -1.0


## Send the tiles pressed since the last call, and the layer picture if it changed.
## Returns the tile bytes sent.
func upload() -> int:
	var sent := 0
	for tile in _dirty:
		texture.update_layer(_pictures[tile], _layer_of_tile[tile])
		sent += TILE_BYTES
	_dirty.clear()
	if _layers_changed:
		layer_texture.update(_layer_picture)
		_layers_changed = false
	return sent


func _tile(pixel: Vector2i) -> int:
	return (pixel.y / TILE_SIZE.y) * _grid.x + pixel.x / TILE_SIZE.x


func _create(tile: int) -> void:
	var picture := Image.create_empty(TILE_SIZE.x, TILE_SIZE.y, false, Image.FORMAT_RGBA8)
	picture.fill(Color(0, 0, 0, 0))
	_pictures[tile] = picture
	_fills_awaited[tile] = {}
	tiles += 1
	created += 1
	if _spare_layers.is_empty():
		_rebuild_gpu_copy(mini(gpu_layers * 2, _pictures.size()))
	else:
		_set_layer(tile, _spare_layers[_spare_layers.size() - 1])
		_spare_layers.resize(_spare_layers.size() - 1)


func _free(tile: int) -> void:
	_spare_layers.append(_layer_of_tile[tile])
	_set_layer(tile, -1)
	_pictures[tile] = null
	_fills_awaited.erase(tile)
	_dirty.erase(tile)
	tiles -= 1
	freed += 1
	if tiles * 4 <= gpu_layers and gpu_layers > FIRST_GPU_LAYERS:
		_rebuild_gpu_copy(maxi(FIRST_GPU_LAYERS, gpu_layers / 2))


func _set_layer(tile: int, layer: int) -> void:
	_layer_of_tile[tile] = layer
	_layer_picture.set_pixel(tile % _grid.x, tile / _grid.x, Color(float(layer), 0, 0))
	_layers_changed = true


## Rebuild the GPU copy with `layers` layers: every allocated tile packed into the
## lowest layers, the rest spare, and every layer sent once. The materials keep the
## same texture.
func _rebuild_gpu_copy(layers: int) -> void:
	var images: Array[Image] = []
	for tile in _fills_awaited:
		_set_layer(tile, images.size())
		images.append(_pictures[tile])
	_spare_layers.clear()
	for layer in range(layers - 1, images.size() - 1, -1):
		_spare_layers.append(layer)
	while images.size() < layers:
		images.append(_blank)
	texture.create_from_images(images)
	if gpu_layers > 0:
		gpu_rebuild_bytes += layers * TILE_BYTES
	gpu_layers = layers

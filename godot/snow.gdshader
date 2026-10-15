shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

// The Footprint picture, held as tiles of equal size, each one layer, in rows from
// the map's north-west corner, as in SnowSurface._tile_layer.
uniform sampler2DArray footprint_tiles : filter_nearest, repeat_disable;
uniform ivec2 footprint_tile_grid;
// Static ground heights at the town layout's picture nodes, counted from the
// map's west and north edges and read bilinearly, as in SnowTownLayout.ground_height.
uniform sampler2D ground_image : filter_nearest, repeat_disable;
uniform float ground_nodes_per_metre = 5.0;
// The saved Snow Depth picture: loose depth above the ground at nodes counted the
// same way and read bilinearly, as in SnowSurface.sample_saved_depth.
uniform sampler2D depth_image : filter_nearest, repeat_disable;
// The fill clock, on the same nodes: fill-seconds of wind-blown snow that have
// fallen there, as in SnowSurface.sample_fill.
uniform sampler2D fill_image : filter_nearest, repeat_disable;
uniform float depth_nodes_per_metre = 2.5;
uniform vec2 region_center = vec2(0.0);
// East–west and north–south half extents of the detail region, set from SnowSurface.
uniform vec2 detail_half_extents;
// East–west and north–south half extents of the map rectangle, set from the town layout.
uniform vec2 map_half_extents;
uniform bool detail_mesh = false;
varying vec3 world_position;

const float COARSE_STEP = 0.8;
const float EDGE_BLEND = 1.6;
const float PRINT_LIFETIME = 120.0;

// Bilinear reading of a picture whose nodes are counted from the map's west and north edges.
float picture_value(sampler2D picture, float nodes_per_metre, vec2 point) {
	ivec2 size = textureSize(picture, 0);
	vec2 node = (point + map_half_extents) * nodes_per_metre;
	ivec2 cell = clamp(ivec2(floor(node)), ivec2(0), size - ivec2(2));
	vec2 blend = clamp(node - vec2(cell), vec2(0.0), vec2(1.0));
	return mix(
		mix(texelFetch(picture, cell, 0).r, texelFetch(picture, cell + ivec2(1, 0), 0).r, blend.x),
		mix(texelFetch(picture, cell + ivec2(0, 1), 0).r, texelFetch(picture, cell + ivec2(1, 1), 0).r, blend.x), blend.y);
}

ivec2 footprint_size() {
	return textureSize(footprint_tiles, 0).xy * footprint_tile_grid;
}

// Compaction at one texel of the Footprint picture, once the fill clock has reached `filled`.
float filled_compaction(ivec2 pixel, ivec2 image_size, float filled) {
	if (pixel.x < 0 || pixel.y < 0 || pixel.x >= image_size.x || pixel.y >= image_size.y) {
		return 0.0;
	}
	ivec2 tile_size = textureSize(footprint_tiles, 0).xy;
	ivec2 tile = pixel / tile_size;
	vec4 value = texelFetch(footprint_tiles, ivec3(pixel - tile * tile_size, tile.y * footprint_tile_grid.x + tile.x), 0);
	if (value.r <= 0.0) {
		return 0.0;
	}
	vec3 bytes = floor(value.gba * 255.0 + vec3(0.5));
	float stamped = dot(bytes, vec3(65536.0, 256.0, 1.0)) * 0.1;
	return value.r * max(0.0, 1.0 - max(0.0, filled - stamped) / PRINT_LIFETIME);
}

float pixel_compaction(ivec2 pixel, ivec2 image_size) {
	// Snow has filled the print by as much as the fill clock at the texel's centre
	// has run since it was pressed, as in SnowSurface._pixel_compaction.
	vec2 centre = (vec2(pixel) + vec2(0.5)) / vec2(image_size) * 2.0 * map_half_extents - map_half_extents;
	return filled_compaction(pixel, image_size, picture_value(fill_image, depth_nodes_per_metre, centre));
}

float compaction(vec2 point) {
	// The image covers the whole map rectangle, so its size sets the texel density.
	ivec2 image_size = footprint_size();
	vec2 texel = (point + map_half_extents) / (2.0 * map_half_extents) * vec2(image_size) - vec2(0.5);
	ivec2 cell = ivec2(floor(texel));
	vec2 blend = fract(texel);
	return mix(
		mix(pixel_compaction(cell, image_size), pixel_compaction(cell + ivec2(1, 0), image_size), blend.x),
		mix(pixel_compaction(cell + ivec2(0, 1), image_size), pixel_compaction(cell + ivec2(1, 1), image_size), blend.x), blend.y);
}

// Shading only: compaction read with one fill clock for the whole neighbourhood,
// which changes far more slowly than a sole's outline. Heights never use it.
float shading_compaction(vec2 point, float filled) {
	ivec2 image_size = footprint_size();
	vec2 texel = (point + map_half_extents) / (2.0 * map_half_extents) * vec2(image_size) - vec2(0.5);
	ivec2 cell = ivec2(floor(texel));
	vec2 blend = fract(texel);
	return mix(
		mix(filled_compaction(cell, image_size, filled), filled_compaction(cell + ivec2(1, 0), image_size, filled), blend.x),
		mix(filled_compaction(cell + ivec2(0, 1), image_size, filled), filled_compaction(cell + ivec2(1, 1), image_size, filled), blend.x), blend.y);
}

float ground_height(vec2 point) {
	return picture_value(ground_image, ground_nodes_per_metre, point);
}

float saved_depth(vec2 point) {
	return picture_value(depth_image, depth_nodes_per_metre, point);
}

float field_height(vec2 point) {
	return ground_height(point) + max(0.025, saved_depth(point) * (1.0 - 0.86 * compaction(point)));
}

float coarse_height(vec2 point) {
	vec2 grid = (point + map_half_extents) / COARSE_STEP;
	vec2 cell = floor(grid);
	vec2 blend = grid - cell;
	vec2 corner = cell * COARSE_STEP - map_half_extents;
	float first = field_height(corner);
	float right = field_height(corner + vec2(COARSE_STEP, 0.0));
	float bottom = field_height(corner + vec2(0.0, COARSE_STEP));
	if (blend.x + blend.y <= 1.0) {
		return first + blend.x * (right - first) + blend.y * (bottom - first);
	}
	float diagonal = field_height(corner + vec2(COARSE_STEP));
	return diagonal + (1.0 - blend.x) * (bottom - diagonal) + (1.0 - blend.y) * (right - diagonal);
}

// Full detail inside the region's border, falling to the coarse surface across it,
// as in SnowSurface._region_weight. A side on the map edge has no border.
float region_weight(vec2 point) {
	vec2 low = region_center - detail_half_extents;
	vec2 high = region_center + detail_half_extents;
	float edge = 1.0e6;
	if (low.x > -map_half_extents.x + 0.001) { edge = min(edge, point.x - low.x); }
	if (high.x < map_half_extents.x - 0.001) { edge = min(edge, high.x - point.x); }
	if (low.y > -map_half_extents.y + 0.001) { edge = min(edge, point.y - low.y); }
	if (high.y < map_half_extents.y - 0.001) { edge = min(edge, high.y - point.y); }
	return smoothstep(0.0, EDGE_BLEND, edge);
}

float detail_height(vec2 point) {
	float weight = region_weight(point);
	if (weight >= 0.99999) { return field_height(point); }
	return mix(coarse_height(point), field_height(point), weight);
}

float snow_hash(vec2 point) {
	return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float snow_noise(vec2 point) {
	vec2 cell = floor(point);
	vec2 local = fract(point);
	vec2 blend = local * local * (3.0 - 2.0 * local);
	return mix(mix(snow_hash(cell), snow_hash(cell + vec2(1.0, 0.0)), blend.x),
		mix(snow_hash(cell + vec2(0.0, 1.0)), snow_hash(cell + vec2(1.0, 1.0)), blend.x), blend.y);
}

void vertex() {
	// Every coarse quad has a common world-space centre in UV. Collapsing
	// whole covered cells preserves MSAA edge coverage at the fine-mesh join.
	if (!detail_mesh && all(lessThan(abs(UV - region_center), detail_half_extents))) {
		VERTEX.xz = UV;
	}
	vec2 point = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	VERTEX.y = detail_mesh ? detail_height(point) : field_height(point);
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 point = world_position.xz;
	// Sole outlines are shaded from the Footprint picture everywhere, at its own
	// 31.25 mm texels, whatever grid the triangles beneath use. Shading only:
	// heights and foot support never read these values.
	float texel_m = 2.0 * map_half_extents.x / float(footprint_size().x);
	float filled = picture_value(fill_image, depth_nodes_per_metre, point);
	float packed = shading_compaction(point, filled);
	vec2 slope = vec2(shading_compaction(point + vec2(texel_m, 0.0), filled) - packed,
		shading_compaction(point + vec2(0.0, texel_m), filled) - packed) / texel_m;
	// The depression the picture describes, as the height field would press it.
	vec2 tilt = slope * 0.86 * saved_depth(point);
	tilt *= min(1.0, 1.5 / max(length(tilt), 0.0001));
	float outline = smoothstep(1.5, 8.0, length(slope));
	float drift = snow_noise(point * 0.34);
	float grain = snow_noise(point * 7.0);
	float pixel_width = max(length(dFdx(point)), length(dFdy(point)));
	float grain_visibility = 1.0 - smoothstep(0.04, 0.16, pixel_width);
	// Normals describe the displaced triangles. The coarse surface has no boot
	// depressions, so the picture supplies their slope there. In the detail region
	// the 5 cm triangles carry each depression's broad slope and the picture adds
	// only part of it again, to sharpen the rim; the border blends between the two.
	vec3 surface_normal = normalize(cross(dFdy(world_position), dFdx(world_position)));
	surface_normal *= sign(surface_normal.y + 0.000001);
	float picture_share = detail_mesh ? 1.0 - 0.5 * region_weight(point) : 1.0;
	vec3 shaded_normal = normalize(surface_normal + vec3(tilt.x, 0.0, tilt.y) * picture_share);
	NORMAL = normalize((VIEW_MATRIX * vec4(shaded_normal, 0.0)).xyz);
	ALBEDO = mix(vec3(0.64, 0.64, 0.645), vec3(0.43, 0.47, 0.51), packed * 0.65)
		* (1.0 - 0.12 * outline)
		* (0.96 + 0.065 * drift + 0.012 * (grain - 0.5) * grain_visibility);
	ROUGHNESS = mix(0.98, 0.88, packed);
	SPECULAR = 0.08;
}

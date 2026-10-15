shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

uniform sampler2D footprint_image : filter_nearest, repeat_disable;
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
uniform vec2 patch_center = vec2(0.0);
// East–west and north–south half extents of the map rectangle, set from the town layout.
uniform vec2 map_half_extents;
uniform bool detail_mesh = false;
varying vec3 world_position;

const float PATCH_HALF = 6.4;
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

float pixel_compaction(ivec2 pixel, ivec2 image_size) {
	if (pixel.x < 0 || pixel.y < 0 || pixel.x >= image_size.x || pixel.y >= image_size.y) {
		return 0.0;
	}
	vec4 value = texelFetch(footprint_image, pixel, 0);
	if (value.r <= 0.0) {
		return 0.0;
	}
	// Snow has filled the print by as much as the fill clock at the texel's centre
	// has run since it was pressed, as in SnowSurface._pixel_compaction.
	vec3 bytes = floor(value.gba * 255.0 + vec3(0.5));
	float stamped = dot(bytes, vec3(65536.0, 256.0, 1.0)) * 0.1;
	vec2 centre = (vec2(pixel) + vec2(0.5)) / vec2(image_size) * 2.0 * map_half_extents - map_half_extents;
	float filled = picture_value(fill_image, depth_nodes_per_metre, centre);
	return value.r * max(0.0, 1.0 - max(0.0, filled - stamped) / PRINT_LIFETIME);
}

float compaction(vec2 point) {
	// The image covers the whole map rectangle, so its size sets the texel density.
	ivec2 image_size = textureSize(footprint_image, 0);
	vec2 texel = (point + map_half_extents) / (2.0 * map_half_extents) * vec2(image_size) - vec2(0.5);
	ivec2 cell = ivec2(floor(texel));
	vec2 blend = fract(texel);
	return mix(
		mix(pixel_compaction(cell, image_size), pixel_compaction(cell + ivec2(1, 0), image_size), blend.x),
		mix(pixel_compaction(cell + ivec2(0, 1), image_size), pixel_compaction(cell + ivec2(1, 1), image_size), blend.x), blend.y);
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

float detail_height(vec2 point) {
	float edge = PATCH_HALF - max(abs(point.x - patch_center.x), abs(point.y - patch_center.y));
	float weight = smoothstep(0.0, EDGE_BLEND, edge);
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
	if (!detail_mesh && max(abs(UV.x - patch_center.x), abs(UV.y - patch_center.y)) < PATCH_HALF) {
		VERTEX.xz = UV;
	}
	vec2 point = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xz;
	VERTEX.y = detail_mesh ? detail_height(point) : field_height(point);
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 point = world_position.xz;
	float packed = compaction(point);
	float drift = snow_noise(point * 0.34);
	float grain = snow_noise(point * 7.0);
	float pixel_width = max(length(dFdx(point)), length(dFdy(point)));
	float grain_visibility = 1.0 - smoothstep(0.04, 0.16, pixel_width);
	// Normals describe the displaced triangles, including their boot depressions.
	vec3 surface_normal = normalize(cross(dFdx(VERTEX), dFdy(VERTEX)));
	NORMAL = dot(surface_normal, NORMAL) < 0.0 ? -surface_normal : surface_normal;
	ALBEDO = mix(vec3(0.64, 0.64, 0.645), vec3(0.43, 0.47, 0.51), packed * 0.65)
		* (0.96 + 0.065 * drift + 0.012 * (grain - 0.5) * grain_visibility);
	ROUGHNESS = mix(0.98, 0.88, packed);
	SPECULAR = 0.08;
}

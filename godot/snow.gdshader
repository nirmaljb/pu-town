shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

uniform sampler2D footprint_image : filter_nearest, repeat_disable;
uniform vec2 patch_center = vec2(0.0);
uniform float wind_elapsed = 0.0;
uniform bool detail_mesh = false;
uniform int obstacle_count = 0;
uniform vec4 obstacles[16];
varying vec3 world_position;

const float HALF_EXTENT = 32.0;
const float PATCH_HALF = 6.4;
const float COARSE_STEP = 0.8;
const float EDGE_BLEND = 1.6;
const float IMAGE_SIZE = 2048.0;
const float PRINT_LIFETIME = 120.0;

float pixel_compaction(ivec2 pixel) {
	if (pixel.x < 0 || pixel.y < 0 || pixel.x >= 2048 || pixel.y >= 2048) {
		return 0.0;
	}
	vec4 value = texelFetch(footprint_image, pixel, 0);
	vec3 bytes = floor(value.gba * 255.0 + vec3(0.5));
	float stamped = dot(bytes, vec3(65536.0, 256.0, 1.0)) * 0.1;
	return value.r * max(0.0, 1.0 - max(0.0, wind_elapsed - stamped) / PRINT_LIFETIME);
}

float compaction(vec2 point) {
	vec2 texel = (point + vec2(HALF_EXTENT)) * 32.0 - vec2(0.5);
	ivec2 cell = ivec2(floor(texel));
	vec2 blend = fract(texel);
	return mix(
		mix(pixel_compaction(cell), pixel_compaction(cell + ivec2(1, 0)), blend.x),
		mix(pixel_compaction(cell + ivec2(0, 1)), pixel_compaction(cell + ivec2(1, 1)), blend.x), blend.y);
}

// Paired with SnowSurface._uncompressed_height. Both start above flat y=0.
float uncompressed_height(vec2 point) {
	float field = sin(point.x * 0.14 - 0.7) * cos(point.y * 0.12 + 0.4);
	float height = 0.08 + 0.52 * smoothstep(0.0, 0.85, field);
	height += 0.018 * sin(point.x * 0.63 + point.y * 0.32);
	float phase = point.x * 0.36 + point.y * 0.17;
	height += 0.035 * (sin(phase - wind_elapsed * 0.025) - sin(phase)) * sin(point.y * 0.13 + 0.4);
	float drift_amount = 0.13 + 0.06 * sin(wind_elapsed * 0.018);
	for (int index = 0; index < 16; index++) {
		if (index >= obstacle_count) { break; }
		vec4 obstacle = obstacles[index];
		float downwind = point.x - (obstacle.x + obstacle.z);
		float lee = 1.0 - smoothstep(0.0, 3.2, abs(downwind - 1.0));
		float across = 1.0 - smoothstep(obstacle.w + 0.25, obstacle.w + 2.2, abs(point.y - obstacle.y));
		height += drift_amount * lee * across;
	}
	return clamp(height, 0.05, 0.85);
}

float field_height(vec2 point) {
	return max(0.025, uncompressed_height(point) * (1.0 - 0.86 * compaction(point)));
}

float coarse_height(vec2 point) {
	vec2 grid = (point + vec2(HALF_EXTENT)) / COARSE_STEP;
	vec2 cell = floor(grid);
	vec2 blend = grid - cell;
	vec2 corner = cell * COARSE_STEP - vec2(HALF_EXTENT);
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

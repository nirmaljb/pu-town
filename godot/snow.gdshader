shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

varying vec3 world_position;

// Low-contrast value noise describes wind-smoothed snow, without an image tile.
float snow_hash(vec2 point) {
	return fract(sin(dot(point, vec2(127.1, 311.7))) * 43758.5453);
}

float snow_noise(vec2 point) {
	vec2 cell = floor(point);
	vec2 local = fract(point);
	vec2 blend = local * local * (3.0 - 2.0 * local);
	return mix(
		mix(snow_hash(cell), snow_hash(cell + vec2(1.0, 0.0)), blend.x),
		mix(snow_hash(cell + vec2(0.0, 1.0)), snow_hash(cell + vec2(1.0, 1.0)), blend.x),
		blend.y
	);
}

void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 ground_position = world_position.xz;
	float drift = snow_noise(ground_position * 0.34);
	float grain = snow_noise(ground_position * 7.0);
	float pixel_width = max(length(dFdx(ground_position)), length(dFdy(ground_position)));
	float grain_visibility = 1.0 - smoothstep(0.04, 0.16, pixel_width);
	// Calibrated in Compatibility output; the reference contains finished lit pixels.
	// Most of the snow's cool tint comes from overcast illumination, not blue dye.
	ALBEDO = vec3(0.64, 0.64, 0.645)
		* (0.96 + 0.065 * drift + 0.012 * (grain - 0.5) * grain_visibility);
	ROUGHNESS = 0.98;
	SPECULAR = 0.08;
}

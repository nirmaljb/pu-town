shader_type spatial;
render_mode diffuse_burley, specular_schlick_ggx;

varying vec3 world_position;

void vertex() {
	world_position = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}

void fragment() {
	vec2 ground_position = world_position.xz;
	float broad_variation = sin(ground_position.x * 0.8 + ground_position.y * 0.4)
		* cos(ground_position.y * 0.7 - ground_position.x * 0.3);
	ALBEDO = vec3(0.83, 0.88, 0.94)
		* (0.985 + 0.012 * broad_variation);
	ROUGHNESS = 0.96;
	SPECULAR = 0.12;
}

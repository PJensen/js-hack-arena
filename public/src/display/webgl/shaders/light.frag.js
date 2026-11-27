export function createLightFragment(maxLights) {
  return `#version 300 es
precision highp float;
#define MAX_LIGHTS ${maxLights}
uniform int u_light_count;
uniform vec4 u_lights[MAX_LIGHTS];
uniform vec3 u_light_colors[MAX_LIGHTS];
uniform sampler2D u_lava;
uniform float u_cell_size;
in vec2 v_world;
out vec4 out_color;
void main() {
  vec3 illumination = vec3(0.14, 0.15, 0.18);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= u_light_count) break;
    vec4 source = u_lights[i];
    float distanceRatio = distance(v_world, source.xy) / max(1.0, source.z);
    float falloff = 1.0 - smoothstep(0.0, 1.0, distanceRatio);
    falloff = pow(falloff, 2.8);
    illumination += u_light_colors[i] * falloff * source.w * 4.0;
  }
  vec3 mapped = illumination / (vec3(0.55) + illumination);
  // Preserve the molten surface's own color in the darkness pass.
  vec2 lavaSize = vec2(textureSize(u_lava, 0));
  if (lavaSize.x > 1.0) {
    vec2 point = v_world / u_cell_size;
    if (all(greaterThanEqual(point, vec2(0.0))) && all(lessThan(point, lavaSize - 1.0))) {
      float lava = texture(u_lava, (point + 0.5) / lavaSize).r;
      mapped = mix(mapped, vec3(1.0), smoothstep(0.25, 0.72, lava));
    }
  }
  out_color = vec4(mapped, 1.0);
}`;
}

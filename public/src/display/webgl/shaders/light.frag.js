export function createLightFragment(maxLights) {
  return `#version 300 es
precision highp float;
#define MAX_LIGHTS ${maxLights}
uniform int u_light_count;
uniform vec4 u_lights[MAX_LIGHTS];
uniform vec3 u_light_colors[MAX_LIGHTS];
in vec2 v_world;
out vec4 out_color;
void main() {
  vec3 illumination = vec3(0.13, 0.16, 0.21);
  for (int i = 0; i < MAX_LIGHTS; i++) {
    if (i >= u_light_count) break;
    vec4 source = u_lights[i];
    float distanceRatio = distance(v_world, source.xy) / max(1.0, source.z);
    float falloff = 1.0 - smoothstep(0.0, 1.0, distanceRatio);
    falloff *= falloff;
    illumination += u_light_colors[i] * falloff * source.w * 1.35;
  }
  out_color = vec4(clamp(illumination, 0.0, 1.25), 1.0);
}`;
}

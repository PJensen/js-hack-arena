export const ORE_FRAGMENT = `#version 300 es
precision highp float;
in vec3 v_normal;
in vec3 v_local_position;
flat in float v_material;
uniform vec3 u_metal;
uniform float u_glint_time;
out vec4 out_color;

void main() {
  vec3 normal = normalize(v_normal);
  vec3 light = normalize(vec3(-0.49, -0.38, 0.79));
  float diffuse = max(dot(normal, light), 0.0);
  float fleck = fract(sin(dot(floor(v_local_position * 1.6), vec3(12.99, 78.23, 39.65))) * 43758.54);
  vec3 rock = vec3(0.26, 0.22, 0.19) * (0.52 + diffuse * 0.48 + fleck * 0.16);
  if (v_material == 0.0) {
    out_color = vec4(rock, 1.0);
    return;
  }

  vec3 halfway = normalize(light + vec3(0.0, 0.4, 0.92));
  float sheen = pow(max(dot(normal, halfway), 0.0), 5.0);
  vec3 metal = u_metal * (0.42 + diffuse * 0.58 + fleck * 0.10);
  metal += mix(u_metal, vec3(1.0), 0.35) * sheen * 0.28;
  if (u_glint_time >= 0.0) {
    // Each exposed nodule has its own phase. The upward facets catch the light.
    float phase = fract(u_glint_time * 0.48 + v_material * 0.381966);
    float flash = 1.0 - smoothstep(0.006, 0.068, abs(phase - 0.5));
    float facet = pow(max(normal.z, 0.0), 8.0);
    vec3 highlight = mix(u_metal, vec3(1.0, 0.99, 0.94), 0.83);
    metal = mix(metal, highlight, flash * facet * 0.86);
  }
  out_color = vec4(metal, 1.0);
}`;

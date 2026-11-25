export function createOreFragment(nuggetCount) {
  return `#version 300 es
precision highp float;
precision highp int;
in vec3 v_normal;
in vec3 v_local_position;
flat in float v_material;
uniform vec3 u_albedo;
uniform vec3 u_reflection;
uniform float u_roughness;
uniform vec3 u_glint_centers[${nuggetCount}];
uniform float u_glint_time;
out vec4 out_color;

float glintShape(vec2 offset) {
  float core = 1.0 - smoothstep(0.18, 0.76, length(offset));
  float thin = 1.0 - smoothstep(0.10, 0.32, min(offset.x, offset.y));
  float arms = thin * (1.0 - smoothstep(0.38, 1.32, max(offset.x, offset.y)));
  return max(core, arms * 0.7);
}

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
  float sheen = pow(max(dot(normal, halfway), 0.0), mix(48.0, 7.0, u_roughness));
  vec3 metal = u_albedo * (0.42 + diffuse * 0.58 + fleck * 0.10);
  metal += u_reflection * sheen * mix(0.48, 0.23, u_roughness);
  if (u_glint_time >= 0.0) {
    float phase = fract(u_glint_time * 0.48 + v_material * 0.381966);
    float flash = 1.0 - smoothstep(0.006, 0.068, abs(phase - 0.5));
    vec3 offset = v_local_position - u_glint_centers[int(v_material) - 1];
    float cap = (1.0 - smoothstep(0.03, 0.22, abs(offset.y))) * smoothstep(0.92, 0.99, normal.z);
    float mark = glintShape(abs(offset.xz));
    float reflectedLight = 1.0 - smoothstep(0.3, 1.35, length(offset.xz));
    // Light up the metal around the glint so the bright point reads as part of the fragment.
    vec3 highlight = mix(u_reflection, vec3(1.0, 0.99, 0.96), 0.50);
    metal += (highlight * mark * 0.57 + u_reflection * reflectedLight * 0.20) * (flash * cap);
  }
  out_color = vec4(metal, 1.0);
}`;
}

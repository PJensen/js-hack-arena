export const BAT_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_shriek;
in vec3 v_normal;
flat in float v_material;
out vec4 out_color;

void main() {
  vec3 normal = normalize(gl_FrontFacing ? v_normal : -v_normal);
  vec3 light = normalize(vec3(-0.38, 0.86, -0.30));
  float diffuse = 0.50 + 0.50 * max(0.0, dot(normal, light));
  vec3 color = vec3(0.31, 0.24, 0.39);
  if (v_material == 1.0) color = vec3(0.52, 0.41, 0.53);
  if (v_material == 2.0) color = vec3(0.51, 0.34, 0.46);
  if (v_material == 3.0) color = vec3(0.70, 0.52, 0.66);
  color *= diffuse;
  if (v_material == 4.0) color = mix(vec3(0.93, 0.54, 0.65), vec3(0.98, 0.75, 1.0), u_shriek);
  out_color = vec4(color, 1.0);
}`;

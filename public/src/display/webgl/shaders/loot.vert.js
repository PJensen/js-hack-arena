export const LOOT_VERTEX = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in float a_material;
uniform vec4 u_view;
uniform vec2 u_position;
uniform float u_angle;
uniform float u_lean;
out vec3 v_normal;
out vec3 v_localPosition;
flat out int v_material;
vec3 orient(vec3 p) {
  float l = cos(u_lean), m = sin(u_lean);
  p.xy = mat2(l, m, -m, l) * p.xy;
  float c = cos(u_angle), s = sin(u_angle);
  p.xz = mat2(c, s, -s, c) * p.xz;
  return p;
}
void main() {
  vec3 p = orient(a_position);
  vec2 world = u_position + vec2(p.x + p.z * 0.45, -p.y + p.z * 0.45);
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  float depth = -dot(p, vec3(-0.45, 0.45, 1.0)) * 0.02;
  gl_Position = vec4(clip.x, -clip.y, depth, 1.0);
  v_normal = orient(a_normal);
  v_localPosition = a_position;
  v_material = int(a_material);
}`;

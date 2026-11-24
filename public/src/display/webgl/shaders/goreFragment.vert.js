export const GORE_FRAGMENT_VERTEX = `#version 300 es
layout(location=0) in vec3 a_vertex;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec4 a_pose;
layout(location=3) in vec4 a_shape;
layout(location=4) in vec4 a_tint;
uniform vec4 u_view;
out vec3 v_normal;
flat out float v_gel;
flat out vec4 v_tint;
vec3 rotate(vec3 point) {
  float c = cos(a_shape.y), s = sin(a_shape.y);
  point.yz = mat2(c, s, -s, c) * point.yz;
  c = cos(a_pose.w);
  s = sin(a_pose.w);
  point.xz = mat2(c, s, -s, c) * point.xz;
  return point;
}
void main() {
  vec3 scale = vec3(0.78 + 0.42 * a_shape.z, 0.69, 1.06 - 0.44 * a_shape.z);
  vec3 local = rotate(a_vertex * scale) * a_shape.x;
  vec2 world = a_pose.xy + vec2(local.x + local.z * 0.45, -local.y + local.z * 0.40 - a_pose.z);
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  float depth = -clip.y * 0.02 - dot(local, vec3(-0.45, 0.42, 1.0)) * 0.003;
  gl_Position = vec4(clip.x, -clip.y, depth, 1.0);
  v_normal = rotate(a_normal / scale);
  v_tint = a_tint;
  v_gel = a_shape.w;
}`;

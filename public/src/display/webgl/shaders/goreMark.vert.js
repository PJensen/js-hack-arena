export const GORE_MARK_VERTEX = `#version 300 es
layout(location=0) in vec2 a_vertex;
layout(location=2) in vec4 a_pose;
layout(location=3) in vec4 a_shape;
layout(location=4) in vec4 a_tint;
uniform vec4 u_view;
out vec2 v_local;
flat out vec2 v_surface;
flat out vec4 v_tint;
void main() {
  v_local = a_vertex * 2.0;
  v_surface = a_shape.zw;
  v_tint = a_tint;
  float c = cos(a_pose.w), s = sin(a_pose.w);
  vec2 world = a_pose.xy + mat2(c, s, -s, c) * (v_local * a_shape.xy);
  world.y -= a_pose.z;
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

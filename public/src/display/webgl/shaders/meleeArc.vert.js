export const MELEE_ARC_VERTEX = `#version 300 es
layout(location=0) in vec2 a_position;
uniform vec4 u_view;
uniform vec2 u_origin;
uniform float u_range;
uniform float u_angle;
out vec2 v_blade;
void main() {
  v_blade = a_position * 2.4;
  vec2 forward = vec2(cos(u_angle), sin(u_angle));
  vec2 right = vec2(-forward.y, forward.x);
  vec2 world = u_origin + u_range * (forward * v_blade.x + right * v_blade.y);
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

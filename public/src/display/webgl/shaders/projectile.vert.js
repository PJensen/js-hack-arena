export const PROJECTILE_VERTEX = `#version 300 es
layout(location=0) in vec2 a_position;
uniform vec4 u_view;
uniform vec2 u_position;
uniform vec2 u_size;
uniform float u_angle;
out vec2 v_uv;
void main() {
  vec2 local = a_position * u_size;
  vec2 direction = vec2(cos(u_angle), sin(u_angle));
  vec2 side = vec2(-direction.y, direction.x);
  vec2 world = u_position + direction * local.x + side * local.y;
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_position + 0.5;
}`;

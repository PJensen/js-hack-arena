export const WATER_WAKE_VERTEX = `#version 300 es
layout(location=0) in vec2 a_corner;
uniform vec4 u_view;
uniform vec2 u_origin;
uniform vec2 u_heading;
uniform float u_radius;
uniform float u_age;
out vec2 v_local;
out vec2 v_world;
void main() {
  v_local = a_corner * vec2(5.0, 4.5) * u_radius;
  vec2 across = vec2(-u_heading.y, u_heading.x);
  v_world = u_origin + u_heading * (v_local.x - u_radius * (0.65 + u_age))
    + across * v_local.y;
  vec2 clip = (v_world - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

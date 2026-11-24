export const GAZE_RAY_VERTEX = `#version 300 es
layout(location=0) in vec2 a_position;
uniform vec4 u_view;
uniform vec2 u_from;
uniform vec2 u_to;
uniform float u_width;
out vec2 v_ray;

void main() {
  vec2 delta = u_to - u_from;
  vec2 across = vec2(-delta.y, delta.x) / max(0.001, length(delta));
  v_ray = vec2(a_position.x + 0.5, 2.0 * a_position.y);
  vec2 world = mix(u_from, u_to, v_ray.x) + across * v_ray.y * u_width;
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

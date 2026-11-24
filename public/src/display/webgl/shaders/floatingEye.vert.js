export const FLOATING_EYE_VERTEX = `#version 300 es
layout(location=0) in vec3 a_sphere;
uniform vec4 u_view;
uniform vec2 u_center;
uniform float u_radius;
out vec3 v_surface;

void main() {
  vec3 point = a_sphere.xzy;
  vec2 world = u_center + vec2(point.x, point.y - 0.87 * point.z) * u_radius;
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, -(point.y * 0.87 + point.z) * 0.22, 1.0);
  v_surface = point;
}`;

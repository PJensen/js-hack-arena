export const PARTICLE_VERTEX = `#version 300 es
layout(location=0) in vec2 a_position;
layout(location=1) in float a_size;
layout(location=2) in vec4 a_color;
uniform vec4 u_view;
uniform float u_pixel_scale;
out vec4 v_color;
void main() {
  vec2 clip = (a_position - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  gl_PointSize = max(1.0, a_size * u_pixel_scale);
  v_color = a_color;
}`;

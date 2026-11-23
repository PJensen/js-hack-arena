export const LINE_VERTEX = `#version 300 es
layout(location=0) in vec2 a_position;
uniform vec4 u_view;
void main() {
  vec2 clip = (a_position - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

export const CAVE_VERTEX = `#version 300 es
layout(location=0) in vec4 a_vertex;
uniform vec4 u_view;
out vec2 v_uv;
void main() {
  vec2 clip = (a_vertex.xy - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_uv = a_vertex.zw;
}`;

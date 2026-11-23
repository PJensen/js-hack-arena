export const WORLD_VERTEX = `#version 300 es
layout(location=0) in vec2 a_position;
uniform vec4 u_view;
uniform vec2 u_position;
uniform vec2 u_size;
out vec2 v_uv;
out vec2 v_world;
vec2 world_to_clip(vec2 world) {
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  return vec2(clip.x, -clip.y);
}
void main() {
  vec2 world = u_position + a_position * u_size;
  gl_Position = vec4(world_to_clip(world), 0.0, 1.0);
  v_uv = a_position + 0.5;
  v_world = world;
}`;

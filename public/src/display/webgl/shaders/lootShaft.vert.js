export const LOOT_SHAFT_VERTEX = `#version 300 es
layout(location=0) in vec2 a_position;
uniform vec4 u_view;
uniform vec2 u_position;
uniform vec2 u_size;
out vec2 v_offset;
void main() {
  float radius = u_size.x;
  float height = u_size.y;
  // The quad bounds the projected volume and its footprint on the floor.
  v_offset = vec2(a_position.x * radius * 2.0,
                  mix(radius * 0.55, -height - radius * 0.55, a_position.y + 0.5));
  vec2 clip = (u_position + v_offset - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

export const CAVE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform ivec2 u_grid_size;
in vec2 v_uv;
out vec4 out_color;
float field_sample(vec2 uv) {
  vec2 point = clamp(uv, 0.0, 1.0) * vec2(u_grid_size - 1);
  ivec2 base = ivec2(floor(point));
  ivec2 next = min(base + 1, u_grid_size - 1);
  vec2 blend = fract(point);
  float a = texelFetch(u_field, base, 0).r;
  float b = texelFetch(u_field, ivec2(next.x, base.y), 0).r;
  float c = texelFetch(u_field, ivec2(base.x, next.y), 0).r;
  float d = texelFetch(u_field, next, 0).r;
  return mix(mix(a, b, blend.x), mix(c, d, blend.x), blend.y);
}
void main() {
  float clearance = field_sample(v_uv);
  // Unlit material colors. The world lighting pass shades the terrain and props together.
  vec3 wall = vec3(0.10, 0.075, 0.058);
  vec3 edge = vec3(0.21, 0.16, 0.12);
  vec3 floorColor = vec3(0.30, 0.26, 0.22);
  vec3 color = clearance > 18.0 ? floorColor : (clearance > 10.0 ? edge : wall);
  out_color = vec4(color, 1.0);
}`;

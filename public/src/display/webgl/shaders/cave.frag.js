export const CAVE_FRAGMENT = `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform ivec2 u_grid_size;
uniform vec2 u_light;
in vec2 v_uv;
in vec2 v_world;
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
  vec3 wall = vec3(0.043, 0.059, 0.071);
  vec3 edge = vec3(0.059, 0.102, 0.157);
  vec3 floorColor = vec3(0.078, 0.125, 0.188);
  vec3 color = clearance > 18.0 ? floorColor : (clearance > 10.0 ? edge : wall);
  float distanceToLight = distance(v_world, u_light);
  float torch = max(0.0, 1.0 - distanceToLight / 310.0);
  torch *= torch;
  color *= 0.62 + torch * 0.82;
  color += torch * vec3(0.13, 0.065, 0.018);
  out_color = vec4(color, 1.0);
}`;

export const CUBE_VERTEX = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;
uniform vec4 u_view;
uniform vec2 u_position;
uniform float u_size;
uniform float u_time;
out vec3 v_normal;
out vec3 v_local;
out vec2 v_uv;
vec2 world_to_clip(vec2 world) {
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  return vec2(clip.x, -clip.y);
}
void main() {
  vec3 local = a_position;
  float height = clamp(local.y / 1.24, 0.0, 1.0);
  float sway = 1.0 - height * 0.62;
  float wave = sin(u_time * 3.1 + local.x * 4.7 + local.z * 3.3) * 0.055
             + cos(u_time * 4.4 - local.x * 2.2 + local.z * 5.1) * 0.028;
  local.x += wave * sway;
  local.z += sin(u_time * 2.7 + local.z * 4.0 + local.x * 2.0) * 0.045 * sway;
  local.y += sin(u_time * 3.6 + local.x * 3.0 + local.z) * 0.025 * (0.25 + height * 0.75);
  vec2 world = u_position + vec2(local.x + local.z * 0.34, -local.y - local.z * 0.25) * u_size;
  gl_Position = vec4(world_to_clip(world), 0.0, 1.0);
  v_normal = a_normal;
  v_local = local;
  v_uv = a_uv;
}`;

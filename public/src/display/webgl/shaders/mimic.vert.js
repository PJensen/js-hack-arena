export const MIMIC_VERTEX = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in float a_material;
uniform vec4 u_view;
uniform vec2 u_position;
uniform float u_facing;
uniform float u_jaw;
out vec3 v_normal;
flat out int v_material;
void main() {
  float c = cos(u_jaw), s = sin(u_jaw);
  mat2 hinge = mat2(c, -s, s, c);
  vec2 pivot = vec2(8.0, -7.0);
  vec3 local = a_position;
  vec3 normal = a_normal;
  local.yz = hinge * (local.yz - pivot) + pivot;
  normal.yz = hinge * normal.yz;

  vec2 forward = vec2(cos(u_facing), sin(u_facing));
  // Undo the oblique projection to align the mouth with the world-space heading.
  vec2 direction = normalize(vec2(forward.x - forward.y, forward.y / 0.45));
  mat2 heading = mat2(direction.y, -direction.x, direction.x, direction.y);
  local.xz = heading * local.xz;
  normal.xz = heading * normal.xz;
  vec2 world = u_position + vec2(local.x + local.z * 0.45, -local.y + local.z * 0.45);
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  float depth = -dot(local, vec3(-0.45, 0.45, 1.0)) * 0.02;
  gl_Position = vec4(clip.x, -clip.y, depth, 1.0);
  v_normal = normal;
  v_material = int(a_material);
}`;

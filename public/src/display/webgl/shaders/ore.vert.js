export const ORE_VERTEX = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in float a_material;
uniform vec4 u_view;
uniform vec2 u_position;
uniform vec2 u_wall_normal;
out vec3 v_normal;
out vec3 v_local_position;
flat out float v_material;

void main() {
  vec2 tangent = vec2(-u_wall_normal.y, u_wall_normal.x);
  vec2 ground = tangent * a_position.x + u_wall_normal * a_position.z;
  vec2 world = u_position + ground - vec2(0.0, a_position.y * 0.62);
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  float depth = -(ground.y * 0.45 + a_position.y * 0.88) / 64.0;
  gl_Position = vec4(clip.x, -clip.y, depth, 1.0);
  v_normal = vec3(tangent * a_normal.x + u_wall_normal * a_normal.z, a_normal.y);
  v_local_position = a_position;
  v_material = a_material;
}`;

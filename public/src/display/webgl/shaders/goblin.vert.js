export const GOBLIN_VERTEX = `#version 300 es
layout(location=0) in vec3 a_vertex;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec3 a_center;
layout(location=3) in vec3 a_axis_x;
layout(location=4) in vec3 a_axis_y;
layout(location=5) in vec3 a_axis_z;
layout(location=6) in vec3 a_color;

uniform vec4 u_view;
uniform vec2 u_origin;
uniform float u_heading;
uniform float u_radius;
out vec3 v_color;

void main() {
  mat3 shape = mat3(a_axis_x, a_axis_y, a_axis_z);
  vec3 local = a_center + shape * a_vertex;
  mat3 normals = mat3(
    a_axis_x / dot(a_axis_x, a_axis_x),
    a_axis_y / dot(a_axis_y, a_axis_y),
    a_axis_z / dot(a_axis_z, a_axis_z));
  vec3 normal = normalize(normals * a_normal);
  float c = cos(u_heading), s = sin(u_heading);
  mat2 heading = mat2(c, s, -s, c);
  vec2 ground = heading * local.xz;
  vec2 world = u_origin + (ground - vec2(0.0, local.y * 0.82)) * u_radius;
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  float depth = -(local.y + ground.y * 0.82) * 0.22;
  gl_Position = vec4(clip.x, -clip.y, depth, 1.0);

  vec2 turned = heading * normal.xz;
  vec3 light = normalize(vec3(-0.56, 0.85, -0.40));
  float diffuse = max(0.0, dot(vec3(turned.x, normal.y, turned.y), light));
  v_color = a_color * (0.58 + 0.55 * diffuse);
}`;

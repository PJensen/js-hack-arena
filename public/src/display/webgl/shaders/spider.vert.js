export const SPIDER_VERTEX = `#version 300 es
layout(location=0) in vec3 a_sphere;
layout(location=1) in vec3 a_center;
layout(location=2) in vec3 a_axis_x;
layout(location=3) in vec3 a_axis_y;
layout(location=4) in vec3 a_axis_z;
layout(location=5) in vec4 a_tint;
uniform vec4 u_view;
uniform vec2 u_origin;
uniform float u_heading;
uniform float u_size;
out vec3 v_normal;
flat out vec4 v_tint;

void main() {
  mat3 shape = mat3(a_axis_x, a_axis_y, a_axis_z);
  vec3 local = a_center + shape * a_sphere;
  mat3 normalShape = mat3(
    a_axis_x / dot(a_axis_x, a_axis_x),
    a_axis_y / dot(a_axis_y, a_axis_y),
    a_axis_z / dot(a_axis_z, a_axis_z));
  vec3 normal = normalize(normalShape * a_sphere);
  float c = cos(u_heading), s = sin(u_heading);
  mat2 heading = mat2(c, s, -s, c);
  vec2 ground = u_origin + heading * local.xz * u_size;
  vec2 world = ground + vec2(0.0, -0.87 * local.y * u_size);
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  float depth = -(ground.y - u_origin.y) * 0.008 - local.y * 0.11;
  gl_Position = vec4(clip.x, -clip.y, depth, 1.0);
  vec2 turned = heading * normal.xz;
  v_normal = vec3(turned.x, normal.y, turned.y);
  v_tint = a_tint;
}`;

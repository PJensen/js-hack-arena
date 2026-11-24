export const BAT_VERTEX = `#version 300 es
layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_style;
uniform vec4 u_view;
uniform vec2 u_origin;
uniform float u_heading;
uniform float u_size;
uniform float u_height;
uniform float u_flap;
out vec3 v_normal;
flat out float v_material;

void main() {
  vec3 point = a_position;
  vec3 normal = a_normal;
  float side = a_style.y;
  if (side != 0.0) {
    vec2 hinge = vec2(0.82, side * 0.23);
    vec2 wing = point.yz - hinge;
    float c = cos(u_flap), s = sin(u_flap) * side;
    mat2 rotation = mat2(c, -s, s, c);
    point.yz = hinge + rotation * wing;
    normal.yz = rotation * normal.yz;
  }

  mat2 heading = mat2(cos(u_heading), sin(u_heading), -sin(u_heading), cos(u_heading));
  vec2 ground = heading * point.xz;
  vec2 world = u_origin + vec2(ground.x, ground.y - (point.y + u_height) * 0.87) * u_size;
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, -(ground.y * 0.85 + point.y) * 0.16, 1.0);
  vec2 turned = heading * normal.xz;
  v_normal = vec3(turned.x, normal.y, turned.y);
  v_material = a_style.x;
}`;

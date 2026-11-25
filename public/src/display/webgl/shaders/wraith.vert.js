export const WRAITH_VERTEX = `#version 300 es
layout(location=0) in vec3 a_point;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec3 a_color;
layout(location=3) in vec4 a_style;

uniform vec4 u_view;
uniform vec2 u_origin;
uniform float u_heading;
uniform float u_radius;
uniform float u_phase;
uniform float u_hover;
uniform float u_cast;
out vec3 v_color;
out vec3 v_normal;
out float v_opacity;
out float v_glow;

void main() {
  vec3 point = a_point;
  float reach = abs(a_style.x) * u_cast;
  point += vec3(0.64, 0.23, -0.31 * sign(a_style.x)) * reach;
  float cloth = a_style.y;
  float wave = u_phase - point.y * 1.95 + point.z * 2.4;
  point += vec3(0.17 * sin(wave), 0.11 * cos(wave * 1.2), 0.24 * cos(wave)) * cloth;
  point.y += u_hover;

  mat2 heading = mat2(cos(u_heading), sin(u_heading), -sin(u_heading), cos(u_heading));
  vec2 ground = heading * point.xz;
  vec2 world = u_origin + (ground - vec2(0.0, point.y * 0.82)) * u_radius;
  vec2 clip = (world - u_view.xy) * 2.0 / u_view.zw;
  gl_Position = vec4(clip.x, -clip.y, -(ground.y * 0.82 + point.y) * 0.20, 1.0);

  vec2 turned = heading * a_normal.xz;
  v_normal = vec3(turned.x, a_normal.y, turned.y);
  v_color = a_color;
  v_opacity = a_style.z;
  v_glow = a_style.w * (0.42 + 0.58 * u_cast);
}`;

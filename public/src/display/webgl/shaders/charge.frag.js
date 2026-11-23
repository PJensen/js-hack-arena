export const CHARGE_FRAGMENT = `#version 300 es
precision highp float;
uniform int u_theme;
uniform float u_time;
uniform float u_alpha;
uniform float u_charge;
in vec2 v_uv;
out vec4 out_color;
vec3 charge_color() {
  if (u_theme == 0) return vec3(1.0, 0.34, 0.08);
  if (u_theme == 1) return vec3(0.62, 0.20, 0.95);
  if (u_theme == 2) return vec3(0.42, 0.92, 1.0);
  return vec3(0.28, 0.72, 1.0);
}
void main() {
  vec2 p = (v_uv - 0.5) * 2.0;
  float radius = length(p);
  if (radius > 1.0) discard;
  float angle = atan(p.y, p.x);
  float cloud = pow(max(0.0, 1.0 - radius), 0.65);
  float filaments = 0.5 + 0.5 * sin(angle * 8.0 + radius * 13.0 - u_time * (2.0 + u_charge * 4.0));
  float focus = pow(max(0.0, 1.0 - radius), 2.4) * (0.35 + u_charge * 0.9);
  float sparks = pow(filaments, 7.0) * (1.0 - radius) * u_charge;
  vec3 color = charge_color() * (cloud * 0.22 + focus * 0.72 + sparks * 0.55);
  float alpha = (cloud * 0.10 + focus * 0.32 + sparks * 0.16) * u_alpha;
  out_color = vec4(color, alpha);
}`;

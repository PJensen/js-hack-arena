export const POTION_GLOW_FRAGMENT = `#version 300 es
precision highp float;
uniform int u_theme;
uniform float u_time;
uniform float u_alpha;
in vec2 v_uv;
out vec4 out_color;
vec3 theme_color() {
  if (u_theme == 0) return vec3(1.0, 0.20, 0.045);
  if (u_theme == 1) return vec3(0.68, 0.24, 1.0);
  if (u_theme == 2) return vec3(0.20, 1.0, 0.76);
  return vec3(0.22, 0.64, 1.0);
}
void main() {
  vec2 p = (v_uv - 0.5) * 2.0;
  float radius = length(p);
  if (radius > 1.0) discard;
  vec3 base = theme_color();
  float angle = atan(p.y, p.x);
  float pulse = 0.92 + 0.08 * sin(u_time * 4.0);
  float core = pow(max(0.0, 1.0 - radius), 1.8);
  float halo = pow(max(0.0, 1.0 - radius), 0.42);
  float swirl = 0.5 + 0.5 * sin(angle * 5.0 - u_time * 2.6 + radius * 8.0);
  float wisps = pow(swirl, 3.0) * (1.0 - radius * 0.35);
  vec3 color = base * (0.32 * halo + 0.72 * core + 0.30 * wisps);
  float alpha = (0.10 * halo + 0.34 * core + 0.12 * wisps) * pulse * u_alpha;
  out_color = vec4(color, alpha);
}`;

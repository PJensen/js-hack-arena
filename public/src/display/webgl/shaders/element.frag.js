export const ELEMENT_FRAGMENT = `#version 300 es
precision highp float;
uniform int u_theme;
uniform float u_time;
uniform float u_alpha;
in vec2 v_uv;
out vec4 out_color;
void main() {
  vec2 p = (v_uv - 0.5) * 2.0;
  float radius = length(p);
  float angle = atan(p.y, p.x);
  float edge = 1.0;
  vec3 color;
  if (u_theme == 0) {
    edge = 0.86 + 0.10 * sin(angle * 5.0 + u_time * 7.0) * (0.4 + radius * 0.6);
    color = mix(vec3(1.0, 0.18, 0.03), vec3(1.0, 0.86, 0.22), 1.0 - radius);
  } else if (u_theme == 1) {
    float swirl = 0.5 + 0.5 * sin(angle * 3.0 - u_time * 2.4 + radius * 9.0);
    color = mix(vec3(0.025, 0.008, 0.06), vec3(0.62, 0.16, 0.95), swirl * radius);
  } else if (u_theme == 2) {
    edge = 0.84 + 0.11 * cos(angle * 6.0);
    float crystal = 0.5 + 0.5 * cos(angle * 6.0 + radius * 10.0);
    color = mix(vec3(0.08, 0.48, 0.72), vec3(0.78, 1.0, 1.0), crystal * (1.0 - radius * 0.45));
  } else {
    float arc = pow(abs(sin(angle * 7.0 + u_time * 13.0 + radius * 8.0)), 14.0);
    color = mix(vec3(0.08, 0.32, 1.0), vec3(0.92, 1.0, 1.0), arc + (1.0 - radius) * 0.4);
  }
  float aa = fwidth(radius);
  float alpha = 1.0 - smoothstep(edge - aa, edge + aa, radius);
  if (alpha <= 0.0) discard;
  float rim = smoothstep(0.58, edge, radius);
  out_color = vec4(color + rim * 0.16, alpha * u_alpha);
}`;

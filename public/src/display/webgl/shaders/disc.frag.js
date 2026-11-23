export const DISC_FRAGMENT = `#version 300 es
precision highp float;
uniform vec4 u_color;
uniform vec4 u_stroke;
in vec2 v_uv;
out vec4 out_color;
void main() {
  float distanceFromCenter = length(v_uv - 0.5) * 2.0;
  float aa = fwidth(distanceFromCenter);
  float coverage = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, distanceFromCenter);
  float border = smoothstep(0.78 - aa, 0.78 + aa, distanceFromCenter);
  if (coverage <= 0.0) discard;
  out_color = mix(u_color, u_stroke, border);
  out_color.a *= coverage;
}`;

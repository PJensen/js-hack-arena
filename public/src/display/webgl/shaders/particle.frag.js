export const PARTICLE_FRAGMENT = `#version 300 es
precision highp float;
in vec4 v_color;
out vec4 out_color;
void main() {
  float radius = length(gl_PointCoord * 2.0 - 1.0);
  float alpha = 1.0 - smoothstep(0.68, 1.0, radius);
  if (alpha <= 0.0) discard;
  out_color = vec4(v_color.rgb, v_color.a * alpha);
}`;

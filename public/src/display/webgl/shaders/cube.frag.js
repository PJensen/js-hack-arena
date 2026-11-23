export const CUBE_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_alpha;
in vec2 v_uv;
out vec4 out_color;
float bubble(vec2 p, vec2 center, float radius) {
  return 1.0 - smoothstep(radius - 0.025, radius + 0.025, length(p - center));
}
void main() {
  vec2 p = (v_uv - 0.5) * 2.0;
  p.x += sin(p.y * 5.0 + u_time * 1.8) * 0.035;
  p.y += cos(p.x * 4.0 - u_time * 1.5) * 0.028;
  vec2 q = abs(p) - vec2(0.72, 0.74);
  float box = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - 0.22;
  float aa = fwidth(box);
  float shape = 1.0 - smoothstep(-aa, aa, box);
  if (shape <= 0.0) discard;
  float surface = 0.5 + 0.5 * sin(p.y * 11.0 + p.x * 5.0 + u_time * 2.2);
  float bubbles = bubble(p, vec2(-0.28, 0.18 + sin(u_time) * 0.08), 0.12)
                + bubble(p, vec2(0.31, -0.24 + cos(u_time * 1.3) * 0.08), 0.09)
                + bubble(p, vec2(0.12, 0.42 + sin(u_time * 0.7) * 0.06), 0.065);
  float rim = smoothstep(-0.22, 0.02, box);
  vec3 color = mix(vec3(0.025, 0.34, 0.3), vec3(0.22, 1.0, 0.76), surface * 0.34 + rim * 0.55);
  color += bubbles * vec3(0.24, 0.52, 0.42);
  out_color = vec4(color, shape * u_alpha * (0.72 + rim * 0.25));
}`;

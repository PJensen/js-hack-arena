export const FLAME_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_alpha;
in vec2 v_uv;
out vec4 out_color;
void main() {
  vec2 p = (v_uv - 0.5) * 2.0;
  float wobble = sin(u_time * 5.0 + p.y * 7.0) * 0.07 + sin(u_time * 8.3 - p.y * 4.0) * 0.035;
  p.x -= wobble * (0.35 + p.y * 0.25);
  float body = 1.0 - smoothstep(0.12, 0.92, length(vec2(p.x * 1.12, p.y * 0.82)));
  float flameTip = smoothstep(0.80, 0.12, p.y) * smoothstep(-0.15, 0.42, p.y);
  float core = 1.0 - smoothstep(0.02, 0.58, length(vec2(p.x * 1.7, (p.y + 0.18) * 1.25)));
  float glow = pow(max(0.0, 1.0 - length(p)), 0.55);
  float alpha = (glow * 0.18 + body * 0.48 + flameTip * 0.24 + core * 0.24) * u_alpha;
  vec3 color = mix(vec3(1.0, 0.12, 0.01), vec3(1.0, 0.92, 0.42), core);
  out_color = vec4(color, alpha);
}`;

export const WEB_SHOT_FRAGMENT = `#version 300 es
precision highp float;
uniform float u_time;
uniform float u_alpha;
in vec2 v_uv;
out vec4 out_color;

float thread(float distance) {
  return 1.0 - smoothstep(0.023, 0.091, abs(distance));
}

void main() {
  vec2 p = v_uv * 2.0 - 1.0;
  float x = p.x;
  float y = p.y;
  float tail = smoothstep(-1.0, -0.78, x) * (1.0 - smoothstep(0.05, 0.27, x));
  float spread = mix(0.62, 0.08, smoothstep(-1.0, 0.24, x));
  float wave = 0.08 * sin(x * 9.0 + u_time * 22.0);
  float strands = max(thread(y - spread + wave), thread(y + spread + wave));
  strands = max(strands, thread(y - wave));

  vec2 knot = (p - vec2(0.19, 0.0)) / vec2(0.31, 0.55);
  float bundle = 1.0 - smoothstep(0.72, 1.0, length(knot));
  float weave = max(thread(y - knot.x * 0.34), thread(y + knot.x * 0.34));
  float alpha = max(strands * tail * 0.92, bundle * (0.62 + weave * 0.38));
  out_color = vec4(vec3(1.0, 0.95, 0.82), alpha * u_alpha);
}`;
